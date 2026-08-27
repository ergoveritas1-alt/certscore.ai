import {
  postRefusalEvidencePacketSchema,
  type PostRefusalEvidencePacket,
  type PostRefusalNetworkRequest,
  type PostRefusalObservation,
  type PostRefusalRegistration,
  type PostRefusalStorageItem,
  type PostRefusalStorageWrite,
} from "@certscore/contracts";
import { resolveVendorObservations } from "@certscore/vendor-resolver";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type Request,
} from "playwright";
import { chromiumContextOptions, chromiumLaunchOptions } from "./playwright-runtime.js";
import {
  authorizePostRefusalTarget,
  type PostRefusalInteractionAuthorization,
} from "./post-refusal-target-authorization.js";

const POST_REFUSAL_SOURCE = "post_refusal_observer";
const DEFAULT_OBSERVATION_WINDOW_MS = 8_000;
const DEFAULT_CONFIRMATION_TIMEOUT_MS = 1_500;
const MAX_REQUESTS = 96;
const MAX_STORAGE_ITEMS = 96;

const NON_ESSENTIAL_PURPOSES = new Set([
  "advertising",
  "analytics",
  "performance_monitoring",
  "session_replay",
  "tag_management",
]);

export interface PostRefusalActionRecipe {
  artifactVersion: "certscore.post_refusal_action_recipe.v1";
  recipeId: string;
  cmpId?: string;
  resolverMethod?: "local_fixture_recipe" | "cmp_registry_recipe" | "tcf_api_cmp_registry_recipe";
  controlSelector: string;
  bannerSelector?: string;
  confirmation:
    | {
        kind: "local_storage_equals";
        key: string;
        expectedValue: string;
      }
    | {
        kind: "tcf_purposes_denied";
        purposeIds?: number[];
      };
}

export interface PostRefusalObserverInput {
  scanId: string;
  parentScanId?: string;
  url: string;
  normalizedUrl?: string;
  recipe: PostRefusalActionRecipe;
  scanStartedAtMs?: number;
  dispatchDelayMs?: number;
  observationWindowMs?: number;
  confirmationTimeoutMs?: number;
  actionSearchTimeoutMs?: number;
  browserMode?: "headless" | "headed";
  browser?: Browser;
  signal?: AbortSignal;
  onLifecycleEvent?: (event: {
    type: "action_dispatched";
    atMs: number;
  }) => void;
  outDir?: string;
  /**
   * Local lab convenience: fulfill third-party requests without contacting the
   * remote host. The request itself remains visible to Playwright and the
   * canonical vendor resolver.
   */
  fulfillThirdPartyRequestsLocally?: boolean;
  interactionAuthorization: PostRefusalInteractionAuthorization;
  productionProjectable?: boolean;
}

type CapturedRequest = {
  request: Request;
  requestId: string;
  startedAtEpochMs: number;
  completedAtEpochMs?: number;
  inFlightAtRefusalRegistration: boolean;
};

type InstrumentedStorageWrite = {
  storageType: "cookie" | "local_storage" | "session_storage";
  name: string;
  observedAtEpochMs: number;
};

type TcfDataSnapshot = {
  eventStatus?: string;
  purposeConsents: Record<string, boolean>;
  success: boolean;
  tcStringHash?: string;
};

export async function runPostRefusalObserver(
  input: PostRefusalObserverInput,
): Promise<PostRefusalEvidencePacket> {
  const targetAuthorization = authorizePostRefusalTarget(input.url, input.interactionAuthorization);
  if (!targetAuthorization.authorized) {
    throw new Error(`Post-refusal target authorization failed closed: ${targetAuthorization.reason}.`);
  }

  const branchStartedAtMs = Date.now();
  const parentScanStartedAtMs = input.scanStartedAtMs ?? branchStartedAtMs;
  const normalizedUrl = input.normalizedUrl ?? normalizeTargetUrl(input.url);
  const observationWindowMs = boundedMs(input.observationWindowMs, DEFAULT_OBSERVATION_WINDOW_MS, 0, 30_000);
  const confirmationTimeoutMs = boundedMs(
    input.confirmationTimeoutMs,
    DEFAULT_CONFIRMATION_TIMEOUT_MS,
    50,
    5_000,
  );
  const actionSearchTimeoutMs = boundedMs(input.actionSearchTimeoutMs, 1_500, 0, 10_000);
  const dispatchDelayMs = boundedMs(input.dispatchDelayMs, 0, 0, 10_000);
  const timing = {
    dispatchDelayMs,
    navigationMs: 0,
    resolverMs: 0,
    confirmationMs: 0,
    observationMs: 0,
    observationExitReason: undefined as
      | "window_elapsed"
      | "non_essential_request_observed"
      | "non_essential_storage_write_observed"
      | "refusal_signal_contradiction_observed"
      | undefined,
  };
  const productionProjectable = input.productionProjectable === true;
  const limitations: string[] = [
    `interaction_authorization:${targetAuthorization.mode}:${targetAuthorization.authorizationId}`,
    ...(productionProjectable ? [] : ["artifact_only_not_production_projectable"]),
  ];
  const capturedRequests: CapturedRequest[] = [];
  const requestIds = new WeakMap<Request, string>();
  const activeRequestIds = new Set<string>();
  let nextRequestNumber = 0;
  let activeRequestIdsAtRegistration: string[] = [];
  let browser = input.browser;
  let ownsBrowser = false;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let cancellationObservedAtMs: number | undefined;
  let actionDispatched = false;

  const cancellation = () => {
    if (!input.signal?.aborted) return false;
    cancellationObservedAtMs ??= elapsed(parentScanStartedAtMs);
    return true;
  };

  const finalize = async (fields: {
    resolverFound: boolean;
    resolverReason?: string;
    registration: PostRefusalRegistration;
    preActionStorage?: PostRefusalStorageItem[];
    postActionStorage?: PostRefusalStorageItem[];
    writesAfterRefusal?: PostRefusalStorageWrite[];
    nonEssentialItemsPersistingAfterRefusal?: PostRefusalStorageItem[];
    requests?: PostRefusalNetworkRequest[];
    postRefusalNonEssentialRequests?: PostRefusalNetworkRequest[];
    observations?: PostRefusalObservation[];
  }): Promise<PostRefusalEvidencePacket> => {
    const completedAtMs = Date.now();
    const packet = postRefusalEvidencePacketSchema.parse({
      artifactVersion: "certscore.post_refusal_evidence.v1",
      artifactOnly: true,
      productionProjectable,
      scanId: input.scanId,
      ...(input.parentScanId ? { parentScanId: input.parentScanId } : {}),
      targetUrl: input.url,
      normalizedUrl,
      observationBranch: "reject_only",
      phase: "post_action",
      consentAction: "reject",
      startedAt: new Date(branchStartedAtMs).toISOString(),
      completedAt: new Date(completedAtMs).toISOString(),
      resolver: {
        found: fields.resolverFound,
        method: input.recipe.resolverMethod ?? "local_fixture_recipe",
        confidence: fields.resolverFound ? 1 : 0,
        recipeId: input.recipe.recipeId,
        ...(input.recipe.cmpId ? { cmpId: input.recipe.cmpId } : {}),
        ...(fields.resolverReason ? { reason: fields.resolverReason } : {}),
      },
      refusalRegistration: fields.registration,
      observationWindowMs,
      timing: {
        ...timing,
        totalMs: Math.max(0, completedAtMs - branchStartedAtMs),
        readyAtMs: elapsed(parentScanStartedAtMs, completedAtMs),
      },
      network: {
        requests: fields.requests ?? [],
        postRefusalNonEssentialRequests: fields.postRefusalNonEssentialRequests ?? [],
        activeRequestIdsAtRefusalRegistration: activeRequestIdsAtRegistration,
      },
      storage: {
        preAction: fields.preActionStorage ?? [],
        postAction: fields.postActionStorage ?? [],
        writesAfterRefusal: fields.writesAfterRefusal ?? [],
        nonEssentialItemsPersistingAfterRefusal: fields.nonEssentialItemsPersistingAfterRefusal ?? [],
      },
      observations: fields.observations ?? [],
      cancellation: {
        requested: cancellationObservedAtMs !== undefined,
        ...(cancellationObservedAtMs !== undefined ? { observedAtMs: cancellationObservedAtMs } : {}),
        outcome: cancellationObservedAtMs === undefined
          ? "not_requested"
          : actionDispatched
            ? "too_late_action_dispatched"
            : "aborted_before_action",
      },
      limitations,
    });
    if (input.outDir) {
      await mkdir(input.outDir, { recursive: true });
      await writeFile(
        path.join(input.outDir, "PostRefusalEvidencePacket.json"),
        `${JSON.stringify(packet, null, 2)}\n`,
        "utf8",
      );
    }
    return packet;
  };

  try {
    if (dispatchDelayMs > 0) {
      await waitForDelay(dispatchDelayMs, input.signal).catch(() => undefined);
    }
    if (cancellation()) {
      return await finalize({
        resolverFound: false,
        resolverReason: "abort_requested_before_navigation",
        registration: unconfirmedRegistration("aborted", "abort_requested_before_navigation"),
      });
    }

    if (!browser) {
      browser = await chromium.launch(chromiumLaunchOptions({
        headless: input.browserMode !== "headed",
      }));
      ownsBrowser = true;
    }
    context = await browser.newContext(chromiumContextOptions());
    page = await context.newPage();
    await installStorageWriteProbe(page);

    if (input.fulfillThirdPartyRequestsLocally) {
      const loopbackHostname = new URL(input.url).hostname;
      await page.route("**/*", async (route) => {
        const requestUrl = new URL(route.request().url());
        if (requestUrl.hostname !== loopbackHostname) {
          await route.fulfill({ status: 204, contentType: "text/plain", body: "" });
          return;
        }
        await route.continue();
      });
    }

    page.on("request", (request) => {
      if (capturedRequests.length >= MAX_REQUESTS) return;
      const requestId = `post_refusal_request_${++nextRequestNumber}`;
      requestIds.set(request, requestId);
      activeRequestIds.add(requestId);
      capturedRequests.push({
        request,
        requestId,
        startedAtEpochMs: Date.now(),
        inFlightAtRefusalRegistration: false,
      });
    });
    const markCompleted = (request: Request) => {
      const requestId = requestIds.get(request);
      if (!requestId) return;
      activeRequestIds.delete(requestId);
      const captured = capturedRequests.find((entry) => entry.requestId === requestId);
      if (captured) captured.completedAtEpochMs = Date.now();
    };
    page.on("requestfinished", markCompleted);
    page.on("requestfailed", markCompleted);

    const navigationStartedAtMs = Date.now();
    await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    timing.navigationMs = Math.max(0, Date.now() - navigationStartedAtMs);

    const finalTargetAuthorization = authorizePostRefusalTarget(
      page.url(),
      input.interactionAuthorization,
    );
    if (!finalTargetAuthorization.authorized) {
      limitations.push(`redirect_target_authorization_failed:${finalTargetAuthorization.reason}`);
      return await finalize({
        resolverFound: false,
        resolverReason: "redirect_target_not_authorized",
        registration: unconfirmedRegistration("not_attempted", "redirect_target_not_authorized"),
        requests: classifyRequests(capturedRequests, parentScanStartedAtMs),
      });
    }

    if (cancellation()) {
      return await finalize({
        resolverFound: false,
        resolverReason: "abort_requested_after_navigation",
        registration: unconfirmedRegistration("aborted", "abort_requested_after_navigation"),
        requests: classifyRequests(capturedRequests, parentScanStartedAtMs),
      });
    }

    const resolverStartedAtMs = Date.now();
    const control = page.locator(input.recipe.controlSelector).first();
    const controlFound = await waitForDeterministicControl(
      control,
      actionSearchTimeoutMs,
      input.signal,
    );
    timing.resolverMs = Math.max(0, Date.now() - resolverStartedAtMs);
    if (!controlFound) {
      return await finalize({
        resolverFound: false,
        resolverReason: "deterministic_reject_control_not_found",
        registration: unconfirmedRegistration("not_attempted", "deterministic_reject_control_not_found"),
        requests: classifyRequests(capturedRequests, parentScanStartedAtMs),
      });
    }

    const preActionStorage = await captureStorage(context, page, input.url);
    if (cancellation()) {
      return await finalize({
        resolverFound: true,
        resolverReason: "abort_requested_before_action",
        registration: unconfirmedRegistration("aborted", "abort_requested_before_action"),
        preActionStorage,
        requests: classifyRequests(capturedRequests, parentScanStartedAtMs),
      });
    }

    const actionDispatchedAtMs = elapsed(parentScanStartedAtMs);
    actionDispatched = true;
    try {
      input.onLifecycleEvent?.({ type: "action_dispatched", atMs: actionDispatchedAtMs });
    } catch {
      limitations.push("lifecycle_listener_failed");
    }
    await control.click({ timeout: 2_000 });
    const confirmationStartedAtMs = Date.now();
    const confirmedState = await waitForRefusalConfirmation(
      page,
      input.recipe.confirmation,
      confirmationTimeoutMs,
      input.signal,
    );
    timing.confirmationMs = Math.max(0, Date.now() - confirmationStartedAtMs);

    if (!confirmedState) {
      limitations.push("refusal_registration_not_confirmed");
      return await finalize({
        resolverFound: true,
        registration: {
          status: cancellation() ? "aborted" : "unconfirmed",
          refusalExercised: false,
          actionDispatchedAtMs,
          reason: cancellation()
            ? "abort_requested_during_confirmation"
            : "cmp_rejection_state_not_observed",
          witnesses: [],
        },
        preActionStorage,
        postActionStorage: await captureStorage(context, page, input.url),
        requests: classifyRequests(capturedRequests, parentScanStartedAtMs),
      });
    }

    const refusalRegisteredAtEpochMs = Date.now();
    const refusalRegisteredAtMs = elapsed(parentScanStartedAtMs, refusalRegisteredAtEpochMs);
    activeRequestIdsAtRegistration = [...activeRequestIds].slice(0, 48);
    for (const request of capturedRequests) {
      request.inFlightAtRefusalRegistration = activeRequestIds.has(request.requestId);
    }
    const witnesses: PostRefusalRegistration["witnesses"] = [{
      observedAtMs: refusalRegisteredAtMs,
      ...(input.recipe.confirmation.kind === "local_storage_equals"
        ? {
            witnessType: "cmp_storage_state" as const,
            key: input.recipe.confirmation.key,
            expectedState: input.recipe.confirmation.expectedValue,
          }
        : {
            witnessType: "tcf_user_action_complete" as const,
            expectedState: "all_configured_purposes_denied",
          }),
      observedStateHash: confirmedState.stateHash,
      corroboratingOnly: false,
    }];
    if (input.recipe.bannerSelector) {
      const bannerRemoved = await page.locator(input.recipe.bannerSelector).count() === 0 ||
        !await page.locator(input.recipe.bannerSelector).first().isVisible().catch(() => false);
      if (bannerRemoved) {
        witnesses.push({
          witnessType: "banner_transition",
          observedAtMs: refusalRegisteredAtMs,
          corroboratingOnly: true,
        });
      }
    }
    const registration: PostRefusalRegistration = {
      status: "confirmed",
      refusalExercised: true,
      actionDispatchedAtMs,
      refusalRegisteredAtMs,
      witnesses,
    };

    const tcfDataAfterRefusal = await readTcfData(page);
    const tcfSignalContradictsAction = Boolean(
      tcfDataAfterRefusal?.success &&
      Object.values(tcfDataAfterRefusal.purposeConsents).some(Boolean),
    );
    const observationStartedAtMs = Date.now();
    timing.observationExitReason = tcfSignalContradictsAction
      ? "refusal_signal_contradiction_observed"
      : await waitForPostRefusalObservation({
          page,
          capturedRequests,
          parentScanStartedAtMs,
          refusalRegisteredAtEpochMs,
          targetUrl: input.url,
          observationWindowMs,
        });
    timing.observationMs = Math.max(0, Date.now() - observationStartedAtMs);
    if (timing.observationExitReason !== "window_elapsed") {
      limitations.push(`observation_early_exit:${timing.observationExitReason}`);
    }
    if (cancellation()) limitations.push("abort_requested_after_confirmed_action_observation_not_truncated");

    const postActionStorage = await captureStorage(context, page, input.url);
    const allRequests = classifyRequests(
      capturedRequests,
      parentScanStartedAtMs,
      refusalRegisteredAtEpochMs,
    );
    const postRefusalNonEssentialRequests = allRequests
      .filter((request) =>
        request.nonEssential &&
        !request.inFlightAtRefusalRegistration &&
        typeof request.msOffsetFromRefusal === "number" &&
        request.msOffsetFromRefusal >= 0
      )
      .slice(0, 24);
    const instrumentedWrites = await readStorageWrites(page);
    const writesAfterRefusal = instrumentedWrites
      .filter((write) => write.observedAtEpochMs >= refusalRegisteredAtEpochMs)
      .map((write) => classifyStorageWrite(write, parentScanStartedAtMs, refusalRegisteredAtEpochMs, input.url))
      .filter((write): write is PostRefusalStorageWrite => Boolean(write))
      .slice(0, 48);
    const nonEssentialItemsPersistingAfterRefusal = persistedNonEssentialStorage(
      preActionStorage,
      postActionStorage,
    ).slice(0, 24);
    const observations = buildObservations({
      postRefusalNonEssentialRequests,
      writesAfterRefusal,
      nonEssentialItemsPersistingAfterRefusal,
      refusalRegisteredAtMs,
      tcfSignalContradictsAction,
    });

    return await finalize({
      resolverFound: true,
      registration,
      preActionStorage,
      postActionStorage,
      writesAfterRefusal,
      nonEssentialItemsPersistingAfterRefusal,
      requests: allRequests,
      postRefusalNonEssentialRequests,
      observations,
    });
  } finally {
    await context?.close().catch(() => undefined);
    if (ownsBrowser) await browser?.close().catch(() => undefined);
  }
}

function unconfirmedRegistration(
  status: "not_attempted" | "unsupported" | "aborted",
  reason: string,
): PostRefusalRegistration {
  return {
    status,
    refusalExercised: false,
    reason,
    witnesses: [],
  };
}

function classifyRequests(
  requests: CapturedRequest[],
  scanStartedAtMs: number,
  refusalRegisteredAtEpochMs?: number,
): PostRefusalNetworkRequest[] {
  return requests.map((captured) => {
    const requestUrl = captured.request.url();
    const vendor = vendorFor({ type: "request", url: requestUrl });
    const startedAtMs = elapsed(scanStartedAtMs, captured.startedAtEpochMs);
    const msOffsetFromRefusal = refusalRegisteredAtEpochMs === undefined
      ? undefined
      : Math.round(captured.startedAtEpochMs - refusalRegisteredAtEpochMs);
    return {
      requestId: captured.requestId,
      sanitizedUrl: sanitizeUrl(requestUrl),
      ...(hostnameFromUrl(requestUrl) ? { hostname: hostnameFromUrl(requestUrl) } : {}),
      resourceType: captured.request.resourceType(),
      startedAtMs,
      ...(captured.completedAtEpochMs === undefined
        ? {}
        : { completedAtMs: elapsed(scanStartedAtMs, captured.completedAtEpochMs) }),
      inFlightAtRefusalRegistration: captured.inFlightAtRefusalRegistration,
      ...(msOffsetFromRefusal === undefined ? {} : { msOffsetFromRefusal }),
      ...(vendor ? { vendor: vendor.vendor, purpose: vendor.purpose } : {}),
      nonEssential: vendor ? NON_ESSENTIAL_PURPOSES.has(vendor.purpose) : false,
    };
  });
}

async function captureStorage(
  context: BrowserContext,
  page: Page,
  targetUrl: string,
): Promise<PostRefusalStorageItem[]> {
  const pageStorage = await page.evaluate(() => ({
    localStorage: Object.entries(window.localStorage),
    sessionStorage: Object.entries(window.sessionStorage),
  }));
  const targetHostname = new URL(targetUrl).hostname;
  const cookies = await context.cookies(targetUrl);
  const items: PostRefusalStorageItem[] = [];

  for (const cookie of cookies.slice(0, MAX_STORAGE_ITEMS)) {
    items.push(classifyStorageItem({
      storageType: "cookie",
      name: cookie.name,
      value: cookie.value,
      targetHostname,
    }));
  }
  for (const [name, value] of pageStorage.localStorage.slice(0, MAX_STORAGE_ITEMS - items.length)) {
    items.push(classifyStorageItem({
      storageType: "local_storage",
      name,
      value,
      targetHostname,
    }));
  }
  for (const [name, value] of pageStorage.sessionStorage.slice(0, MAX_STORAGE_ITEMS - items.length)) {
    items.push(classifyStorageItem({
      storageType: "session_storage",
      name,
      value,
      targetHostname,
    }));
  }
  return items;
}

function classifyStorageItem(input: {
  storageType: PostRefusalStorageItem["storageType"];
  name: string;
  value: string;
  targetHostname: string;
}): PostRefusalStorageItem {
  const vendor = input.storageType === "cookie"
    ? vendorFor({ type: "cookie", cookieName: input.name, hostname: input.targetHostname })
    : vendorFor({ type: "cmp_runtime", storageKey: input.name, hostname: input.targetHostname });
  return {
    storageType: input.storageType,
    name: input.name.slice(0, 180),
    valueHash: hashValue(input.value),
    ...(vendor ? { vendor: vendor.vendor, purpose: vendor.purpose } : {}),
    nonEssential: vendor ? NON_ESSENTIAL_PURPOSES.has(vendor.purpose) : false,
  };
}

function classifyStorageWrite(
  write: InstrumentedStorageWrite,
  scanStartedAtMs: number,
  refusalRegisteredAtEpochMs: number,
  targetUrl: string,
): PostRefusalStorageWrite | undefined {
  if (!write.name) return undefined;
  const hostname = new URL(targetUrl).hostname;
  const vendor = write.storageType === "cookie"
    ? vendorFor({ type: "cookie", cookieName: write.name, hostname })
    : vendorFor({ type: "cmp_runtime", storageKey: write.name, hostname });
  return {
    storageType: write.storageType,
    name: write.name.slice(0, 180),
    observedAtMs: elapsed(scanStartedAtMs, write.observedAtEpochMs),
    msOffsetFromRefusal: Math.max(0, Math.round(write.observedAtEpochMs - refusalRegisteredAtEpochMs)),
    ...(vendor ? { vendor: vendor.vendor, purpose: vendor.purpose } : {}),
    nonEssential: vendor ? NON_ESSENTIAL_PURPOSES.has(vendor.purpose) : false,
  };
}

function persistedNonEssentialStorage(
  before: PostRefusalStorageItem[],
  after: PostRefusalStorageItem[],
): PostRefusalStorageItem[] {
  const beforeNonEssentialKeys = new Set(
    before
      .filter((item) => item.nonEssential)
      .map((item) => `${item.storageType}:${item.name}`),
  );
  return after.filter((item) => beforeNonEssentialKeys.has(`${item.storageType}:${item.name}`));
}

function buildObservations(input: {
  postRefusalNonEssentialRequests: PostRefusalNetworkRequest[];
  writesAfterRefusal: PostRefusalStorageWrite[];
  nonEssentialItemsPersistingAfterRefusal: PostRefusalStorageItem[];
  refusalRegisteredAtMs: number;
  tcfSignalContradictsAction: boolean;
}): PostRefusalObservation[] {
  const observations: PostRefusalObservation[] = [];
  for (const request of input.postRefusalNonEssentialRequests) {
    observations.push({
      observationType: "post_refusal_non_essential_activity",
      observedAtMs: request.startedAtMs,
      ...(request.vendor ? { vendor: request.vendor } : {}),
      requestId: request.requestId,
      msOffsetFromRefusal: Math.max(0, request.msOffsetFromRefusal ?? 0),
      evidenceKeys: ["confirmed_refusal_registration", "request_started_after_refusal"],
    });
  }
  for (const write of input.writesAfterRefusal.filter((item) => item.nonEssential)) {
    observations.push({
      observationType: "post_refusal_non_essential_activity",
      observedAtMs: write.observedAtMs,
      ...(write.vendor ? { vendor: write.vendor } : {}),
      storageName: write.name,
      msOffsetFromRefusal: write.msOffsetFromRefusal,
      evidenceKeys: ["confirmed_refusal_registration", "storage_write_after_refusal"],
    });
  }
  for (const item of input.nonEssentialItemsPersistingAfterRefusal) {
    observations.push({
      observationType: "pre_consent_storage_not_cleared",
      observedAtMs: input.refusalRegisteredAtMs,
      ...(item.vendor ? { vendor: item.vendor } : {}),
      storageName: item.name,
      evidenceKeys: ["same_session_pre_action_snapshot", "same_session_post_action_snapshot"],
    });
  }
  if (input.tcfSignalContradictsAction) {
    observations.push({
      observationType: "refusal_signal_contradicts_action",
      observedAtMs: input.refusalRegisteredAtMs,
      msOffsetFromRefusal: 0,
      evidenceKeys: ["confirmed_refusal_registration", "post_refusal_tcf_purpose_grant"],
    });
  }
  return observations.slice(0, 32);
}

function vendorFor(input: {
  type: "request" | "cookie" | "cmp_runtime";
  url?: string;
  hostname?: string;
  cookieName?: string;
  storageKey?: string;
}) {
  return resolveVendorObservations([{
    ...input,
    sourceScanner: POST_REFUSAL_SOURCE,
    scenario: "reject_all_flow",
    consentStateAtTime: "post_reject",
    matchSource: input.type === "request"
      ? "network_request"
      : input.cookieName
        ? "cookie_name"
        : "storage_key",
  }]).sort((left, right) => right.confidence - left.confidence)[0];
}

async function installStorageWriteProbe(page: Page): Promise<void> {
  await page.addInitScript({ content: `(() => {
    const records = [];
    Object.defineProperty(window, "__certscorePostRefusalWrites", {
      configurable: false,
      enumerable: false,
      value: records,
      writable: false,
    });
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      let storageType = "local_storage";
      try { storageType = this === window.sessionStorage ? "session_storage" : "local_storage"; } catch (_) {}
      records.push({ storageType, name: String(key).slice(0, 180), observedAtEpochMs: Date.now() });
      return originalSetItem.call(this, key, value);
    };
    const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
    if (cookieDescriptor && cookieDescriptor.get && cookieDescriptor.set && cookieDescriptor.configurable) {
      Object.defineProperty(Document.prototype, "cookie", {
        configurable: true,
        enumerable: cookieDescriptor.enumerable,
        get: cookieDescriptor.get,
        set: function(value) {
          const name = String(value).split("=", 1)[0].trim().slice(0, 180);
          records.push({ storageType: "cookie", name, observedAtEpochMs: Date.now() });
          return cookieDescriptor.set.call(this, value);
        },
      });
    }
  })();` });
}

async function readStorageWrites(page: Page): Promise<InstrumentedStorageWrite[]> {
  return page.evaluate(() => {
    const records = (window as unknown as {
      __certscorePostRefusalWrites?: InstrumentedStorageWrite[];
    }).__certscorePostRefusalWrites;
    return Array.isArray(records) ? records.slice(0, 96) : [];
  });
}

async function waitForDeterministicControl(
  control: Locator,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  const deadlineAtMs = Date.now() + timeoutMs;
  do {
    if (signal?.aborted) return false;
    const found = await control.count() > 0 &&
      await control.isVisible().catch(() => false) &&
      await control.isEnabled().catch(() => false);
    if (found) return true;
    if (Date.now() >= deadlineAtMs) break;
    await waitForDelay(Math.min(25, Math.max(0, deadlineAtMs - Date.now())), signal).catch(() => undefined);
  } while (Date.now() <= deadlineAtMs);
  return false;
}

async function waitForRefusalConfirmation(
  page: Page,
  confirmation: PostRefusalActionRecipe["confirmation"],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ stateHash: string } | undefined> {
  if (confirmation.kind === "local_storage_equals") {
    const value = await waitForLocalStorageValue(
      page,
      confirmation.key,
      confirmation.expectedValue,
      timeoutMs,
      signal,
    );
    return value === undefined ? undefined : { stateHash: hashValue(value) };
  }

  const purposeIds = (confirmation.purposeIds?.length ? confirmation.purposeIds : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    .filter((purposeId) => Number.isInteger(purposeId) && purposeId > 0 && purposeId <= 24);
  const deadlineAtMs = Date.now() + timeoutMs;
  while (Date.now() <= deadlineAtMs) {
    if (signal?.aborted) return undefined;
    const snapshot = await readTcfData(page);
    if (
      snapshot?.success &&
      snapshot.eventStatus === "useractioncomplete" &&
      purposeIds.length > 0 &&
      purposeIds.every((purposeId) => snapshot.purposeConsents[String(purposeId)] === false)
    ) {
      return {
        stateHash: snapshot.tcStringHash ?? hashValue(JSON.stringify(snapshot.purposeConsents)),
      };
    }
    await waitForDelay(25, signal).catch(() => undefined);
  }
  return undefined;
}

async function readTcfData(page: Page): Promise<TcfDataSnapshot | undefined> {
  const raw = await page.evaluate(`(() => {
    const api = window.__tcfapi;
    if (typeof api !== "function") return Promise.resolve(undefined);
    return new Promise((resolve) => {
      let settled = false;
      let timer;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      timer = setTimeout(() => finish({ purposeConsents: {}, success: false }), 250);
      try {
        api("getTCData", 2, (data, success) => {
          const source = data && data.purpose && data.purpose.consents || {};
          const purposeConsents = Object.fromEntries(
            Object.entries(source)
              .filter(([key, value]) => /^\\d{1,2}$/.test(key) && typeof value === "boolean")
              .slice(0, 24)
          );
          finish({
            ...(data && typeof data.eventStatus === "string" ? { eventStatus: data.eventStatus } : {}),
            purposeConsents,
            success: success === true,
            ...(data && typeof data.tcString === "string" ? { tcString: data.tcString.slice(0, 2048) } : {})
          });
        });
      } catch (_) {
        finish({ purposeConsents: {}, success: false });
      }
    });
  })()` ) as {
    eventStatus?: string;
    purposeConsents: Record<string, boolean>;
    success: boolean;
    tcString?: string;
  } | undefined;
  if (!raw) return undefined;
  return {
    eventStatus: raw.eventStatus,
    purposeConsents: raw.purposeConsents,
    success: raw.success,
    ...(raw.tcString ? { tcStringHash: hashValue(raw.tcString) } : {}),
  };
}

async function waitForPostRefusalObservation(input: {
  page: Page;
  capturedRequests: CapturedRequest[];
  parentScanStartedAtMs: number;
  refusalRegisteredAtEpochMs: number;
  targetUrl: string;
  observationWindowMs: number;
}): Promise<"window_elapsed" | "non_essential_request_observed" | "non_essential_storage_write_observed"> {
  const deadlineAtMs = Date.now() + input.observationWindowMs;
  while (Date.now() < deadlineAtMs) {
    const requests = classifyRequests(
      input.capturedRequests,
      input.parentScanStartedAtMs,
      input.refusalRegisteredAtEpochMs,
    );
    if (requests.some((request) =>
      request.nonEssential &&
      !request.inFlightAtRefusalRegistration &&
      typeof request.msOffsetFromRefusal === "number" &&
      request.msOffsetFromRefusal >= 0
    )) {
      return "non_essential_request_observed";
    }

    const writes = await readStorageWrites(input.page);
    if (writes
      .filter((write) => write.observedAtEpochMs >= input.refusalRegisteredAtEpochMs)
      .map((write) => classifyStorageWrite(
        write,
        input.parentScanStartedAtMs,
        input.refusalRegisteredAtEpochMs,
        input.targetUrl,
      ))
      .some((write) => write?.nonEssential)
    ) {
      return "non_essential_storage_write_observed";
    }

    await waitForDelay(Math.min(25, Math.max(0, deadlineAtMs - Date.now())));
  }
  return "window_elapsed";
}

async function waitForLocalStorageValue(
  page: Page,
  key: string,
  expectedValue: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const deadlineAtMs = Date.now() + timeoutMs;
  while (Date.now() <= deadlineAtMs) {
    if (signal?.aborted) return undefined;
    const value = await page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key);
    if (value === expectedValue) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return undefined;
}

async function waitForDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) return;
  if (signal?.aborted) throw signal.reason ?? new Error("Aborted");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason ?? new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function normalizeTargetUrl(targetUrl: string): string {
  const parsed = new URL(targetUrl);
  parsed.hash = "";
  return parsed.toString();
}

function sanitizeUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().slice(0, 500);
  } catch {
    return "invalid://redacted";
  }
}

function hostnameFromUrl(value: string): string | undefined {
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function elapsed(startedAtMs: number, atMs = Date.now()): number {
  return Math.max(0, Math.round(atMs - startedAtMs));
}

function boundedMs(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
