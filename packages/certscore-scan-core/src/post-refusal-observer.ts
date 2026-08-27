import {
  postRefusalEvidencePacketSchema,
  type PostRefusalEvidencePacket,
  type PostRefusalInteractionDiagnostics,
  type PostRefusalNetworkRequest,
  type PostRefusalObservation,
  type PostRefusalRegistration,
  type PostRefusalStorageItem,
  type PostRefusalStorageWrite,
  type PostRefusalTcfState,
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
import {
  chromiumContextOptions,
  chromiumLaunchOptions,
  isLocalHeadedFallbackEnabled,
} from "./playwright-runtime.js";
import {
  authorizePostRefusalTarget,
  type PostRefusalInteractionAuthorization,
} from "./post-refusal-target-authorization.js";

const POST_REFUSAL_SOURCE = "post_refusal_observer";
const DEFAULT_OBSERVATION_WINDOW_MS = 8_000;
const DEFAULT_CONFIRMATION_TIMEOUT_MS = 1_500;
export const POST_REFUSAL_PRE_ACTION_BASELINE_MAX_AGE_MS = 250;
const MAX_REQUESTS = 96;
const MAX_POST_REGISTRATION_REQUESTS = 96;
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
      }
    | {
        kind: "tcf_purposes_denied_or_cmp_cookie_changed";
        purposeIds?: number[];
        cookieName: string;
      }
    | {
        kind: "tcf_purposes_denied_or_cmp_storage_changed";
        purposeIds?: number[];
        storageType: "local_storage" | "session_storage";
        key: string;
      }
    | {
        kind: "tcf_purposes_denied_or_cmp_storage_keys_changed";
        purposeIds?: number[];
        storageType: "local_storage" | "session_storage";
        keys: string[];
      };
}

export interface PostRefusalObserverInput {
  scanId: string;
  parentScanId?: string;
  url: string;
  normalizedUrl?: string;
  recipe: PostRefusalActionRecipe;
  /**
   * Bounded canonical recipe set for a single-visit public resolver. The
   * observer clicks only when exactly one deterministic selector resolves to
   * an actionable control. It never tries the candidates sequentially.
   */
  recipeCandidates?: PostRefusalActionRecipe[];
  recipeSetId?: string;
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
  responseCookieNamesSet?: string[];
  inFlightAtRefusalRegistration: boolean;
};

type InstrumentedStorageWrite = {
  storageType: "cookie" | "local_storage" | "session_storage";
  name: string;
  observedAtEpochMs: number;
  sequence: number;
};

type TcfDataSnapshot = {
  eventStatus?: string;
  purposeConsents: Record<string, boolean>;
  success: boolean;
  tcStringHash?: string;
  tcStringParseStatus: PostRefusalTcfState["tcStringParseStatus"];
  tcStringPurposeConsents: Record<string, boolean>;
};

type RefusalConfirmationBaseline =
  | {
      kind: "local_storage_equals";
      lastSequence: number;
    }
  | {
      kind: "tcf_purposes_denied";
      snapshot?: TcfDataSnapshot;
    }
  | {
      kind: "tcf_purposes_denied_or_cmp_cookie_changed";
      snapshot?: TcfDataSnapshot;
      cookieStateHash?: string;
    }
  | {
      kind: "tcf_purposes_denied_or_cmp_storage_changed";
      snapshot?: TcfDataSnapshot;
      storageStateHash?: string;
      lastSequence: number;
    }
  | {
      kind: "tcf_purposes_denied_or_cmp_storage_keys_changed";
      snapshot?: TcfDataSnapshot;
      storageStateHashes: Record<string, string | undefined>;
      lastSequence: number;
    };

type RefusalConfirmationState = {
  stateHash: string;
  witnessType: "cmp_storage_state" | "tcf_user_action_complete" | "cmp_cookie_state";
  key?: string;
  expectedState: string;
};

export async function runPostRefusalObserver(
  input: PostRefusalObserverInput,
): Promise<PostRefusalEvidencePacket> {
  const actionRecipes = validatedActionRecipes(input);
  const recipeSetId = actionRecipes.length === 1
    ? actionRecipes[0]!.recipeId
    : validatedRecipeSetId(input.recipeSetId);
  const authorizationScanId = input.parentScanId ?? input.scanId;
  const targetAuthorization = authorizePostRefusalTarget(
    input.url,
    input.interactionAuthorization,
    authorizationScanId,
  );
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
  const preRegistrationRequests: CapturedRequest[] = [];
  const postRegistrationRequests: CapturedRequest[] = [];
  const requestIds = new WeakMap<Request, string>();
  const requestStartedAtEpochMs = new WeakMap<Request, number>();
  const requestInheritedInFlightAtRegistration = new WeakMap<Request, boolean>();
  const activeRequestIds = new Set<string>();
  const pendingResponseHeaderCaptures = new Set<Promise<void>>();
  let nextRequestNumber = 0;
  let activeRequestIdsAtRegistration: string[] = [];
  let browser = input.browser;
  let ownsBrowser = false;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let cancellationObservedAtMs: number | undefined;
  let actionDispatched = false;
  let refusalRegisteredAtEpochMs: number | undefined;
  let selectedRecipe: PostRefusalActionRecipe | undefined;
  const interactionDiagnostics: PostRefusalInteractionDiagnostics = {
    navigation: {
      outcome: "failed",
      documentCommitted: false,
      finalUrlAuthorized: false,
    },
    click: {
      outcome: "not_attempted",
      reResolvedBeforeDispatch: false,
      confirmationCheckedAfterError: false,
    },
  };

  const retainedRequests = () => selectRetainedRequests(
    preRegistrationRequests,
    postRegistrationRequests,
  );

  const cancellation = () => {
    if (!input.signal?.aborted) return false;
    cancellationObservedAtMs ??= elapsed(parentScanStartedAtMs);
    return true;
  };

  const finalize = async (fields: {
    resolverFound: boolean;
    resolverReason?: string;
    registration: PostRefusalRegistration;
    preActionCapturedAtMs?: number;
    postActionCapturedAtMs?: number;
    preActionStorage?: PostRefusalStorageItem[];
    postActionStorage?: PostRefusalStorageItem[];
    writesAfterRefusal?: PostRefusalStorageWrite[];
    nonEssentialItemsPersistingAfterRefusal?: PostRefusalStorageItem[];
    requests?: PostRefusalNetworkRequest[];
    postRefusalNonEssentialRequests?: PostRefusalNetworkRequest[];
    postRefusalTcfState?: PostRefusalTcfState;
    observations?: PostRefusalObservation[];
  }): Promise<PostRefusalEvidencePacket> => {
    const completedAtMs = Date.now();
    const confirmedRefusal = fields.registration.status === "confirmed" &&
      fields.registration.refusalExercised &&
      fields.registration.refusalRegisteredAtMs !== undefined;
    const resolverRecipe = selectedRecipe ?? (actionRecipes.length === 1 ? actionRecipes[0] : undefined);
    const resolverMethod = resolverRecipe?.resolverMethod ?? candidateSetResolverMethod(actionRecipes);
    const exactTargetUrl = normalizeTargetUrl(input.url);
    const retainedTargetUrl = sanitizeUrl(exactTargetUrl);
    const retainedNormalizedUrl = sanitizeUrl(normalizedUrl);
    const packet = postRefusalEvidencePacketSchema.parse({
      artifactVersion: "certscore.post_refusal_evidence.v1",
      artifactOnly: true,
      productionProjectable: productionProjectable && confirmedRefusal,
      scanId: input.scanId,
      ...(input.parentScanId ? { parentScanId: input.parentScanId } : {}),
      exactTargetSha256: hashValue(exactTargetUrl),
      targetUrl: retainedTargetUrl,
      normalizedUrl: retainedNormalizedUrl,
      observationBranch: "reject_only",
      phase: "post_action",
      consentAction: "reject",
      startedAt: new Date(branchStartedAtMs).toISOString(),
      completedAt: new Date(completedAtMs).toISOString(),
      resolver: {
        found: fields.resolverFound,
        method: resolverMethod,
        confidence: fields.resolverFound ? 1 : 0,
        recipeId: resolverRecipe?.recipeId ?? recipeSetId,
        ...(resolverRecipe?.cmpId ? { cmpId: resolverRecipe.cmpId } : {}),
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
        ...(fields.preActionCapturedAtMs !== undefined
          ? { preActionCapturedAtMs: fields.preActionCapturedAtMs }
          : {}),
        ...(fields.postActionCapturedAtMs !== undefined
          ? { postActionCapturedAtMs: fields.postActionCapturedAtMs }
          : {}),
        preAction: fields.preActionStorage ?? [],
        postAction: fields.postActionStorage ?? [],
        writesAfterRefusal: fields.writesAfterRefusal ?? [],
        nonEssentialItemsPersistingAfterRefusal: fields.nonEssentialItemsPersistingAfterRefusal ?? [],
      },
      ...(fields.postRefusalTcfState
        ? { tcf: { postRefusalState: fields.postRefusalTcfState } }
        : {}),
      interactionDiagnostics,
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
          if (requestUrl.pathname === "/post-refusal-cookie") {
            await route.fulfill({
              status: 204,
              headers: {
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-store",
                "Set-Cookie": "_ga=GA1.1.THIRD_PARTY_POST_REFUSAL; Path=/; SameSite=None; Secure; HttpOnly",
              },
              body: "",
            });
          } else {
            await route.fulfill({
              status: 204,
              contentType: "text/plain",
              ...(requestUrl.searchParams.get("en") === "inflight_redirect"
                ? {
                    headers: {
                      "Access-Control-Allow-Origin": "*",
                      "Cache-Control": "no-store",
                      "Set-Cookie": "_ga=GA1.1.INFLIGHT_REDIRECT; Path=/; SameSite=None; Secure; HttpOnly",
                    },
                  }
                : {}),
              body: "",
            });
          }
          return;
        }
        await route.continue();
      });
    }

    page.on("request", (request) => {
      const startedAtEpochMs = Date.now();
      const redirectedFromRequest = request.redirectedFrom();
      const redirectedFromStartedAtEpochMs = redirectedFromRequest
        ? requestStartedAtEpochMs.get(redirectedFromRequest)
        : undefined;
      const inheritedInFlightAtRegistration = Boolean(redirectedFromRequest) && (
        requestInheritedInFlightAtRegistration.get(redirectedFromRequest!) === true ||
        (
          refusalRegisteredAtEpochMs !== undefined &&
          redirectedFromStartedAtEpochMs !== undefined &&
          redirectedFromStartedAtEpochMs <= refusalRegisteredAtEpochMs
        )
      );
      requestStartedAtEpochMs.set(request, startedAtEpochMs);
      requestInheritedInFlightAtRegistration.set(request, inheritedInFlightAtRegistration);
      const afterRegistration = refusalRegisteredAtEpochMs !== undefined;
      const bucket = afterRegistration ? postRegistrationRequests : preRegistrationRequests;
      const bucketLimit = afterRegistration ? MAX_POST_REGISTRATION_REQUESTS : MAX_REQUESTS;
      if (bucket.length >= bucketLimit) return;
      const requestId = `post_refusal_request_${++nextRequestNumber}`;
      const redirectedFromId = redirectedFromRequest
        ? requestIds.get(redirectedFromRequest)
        : undefined;
      const redirectedFrom = redirectedFromId
        ? [...preRegistrationRequests, ...postRegistrationRequests].find((entry) =>
            entry.requestId === redirectedFromId
          )
        : undefined;
      requestIds.set(request, requestId);
      activeRequestIds.add(requestId);
      bucket.push({
        request,
        requestId,
        startedAtEpochMs,
        inFlightAtRefusalRegistration: inheritedInFlightAtRegistration ||
          redirectedFrom?.inFlightAtRefusalRegistration === true,
      });
    });
    const markCompleted = (request: Request) => {
      const requestId = requestIds.get(request);
      if (!requestId) return;
      activeRequestIds.delete(requestId);
      const captured = [...preRegistrationRequests, ...postRegistrationRequests]
        .find((entry) => entry.requestId === requestId);
      if (captured) captured.completedAtEpochMs = Date.now();
    };
    page.on("requestfinished", markCompleted);
    page.on("requestfailed", markCompleted);
    page.on("response", (response) => {
      const requestId = requestIds.get(response.request());
      if (!requestId) return;
      const captured = [...preRegistrationRequests, ...postRegistrationRequests]
        .find((entry) => entry.requestId === requestId);
      if (!captured) return;
      const capture = response.headersArray().then((headers) => {
        captured.responseCookieNamesSet = responseCookieNamesFromHeaders(headers);
      }).catch(() => undefined);
      pendingResponseHeaderCaptures.add(capture);
      void capture.finally(() => pendingResponseHeaderCaptures.delete(capture));
    });

    const navigationStartedAtMs = Date.now();
    try {
      await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 15_000 });
      interactionDiagnostics.navigation = {
        outcome: "completed",
        documentCommitted: true,
        finalUrlAuthorized: false,
      };
    } catch (error) {
      const failureClass = classifyNavigationFailure(error);
      const recovery = await inspectRecoverableCommittedDocument(
        page,
        input.interactionAuthorization,
        failureClass,
        authorizationScanId,
      );
      interactionDiagnostics.navigation = {
        outcome: recovery.recovered ? "recovered_after_error" : "failed",
        failureClass,
        documentCommitted: recovery.documentCommitted,
        finalUrlAuthorized: recovery.finalUrlAuthorized,
        ...(recovery.recovered ? { recoveryMethod: "committed_document" as const } : {}),
      };
      if (!recovery.recovered) {
        if (
          ownsBrowser &&
          input.browserMode !== "headed" &&
          shouldRetryNavigationWithHeaded(error)
        ) {
          const firstNavigationMs = Math.max(0, Date.now() - navigationStartedAtMs);
          await context.close().catch(() => undefined);
          await browser.close().catch(() => undefined);
          context = undefined;
          browser = undefined;
          ownsBrowser = false;
          const {
            browser: _ignoredBrowser,
            outDir: _ignoredOutDir,
            ...retryInput
          } = input;
          const headedPacket = await runPostRefusalObserver({
            ...retryInput,
            browserMode: "headed",
            dispatchDelayMs: 0,
          }).catch(() => undefined);
          if (!headedPacket) {
            limitations.push(`headed_local_navigation_retry_failed:${failureClass}`);
          } else {
            const headedNavigation = headedPacket.interactionDiagnostics?.navigation;
            const headedSucceeded = headedNavigation?.outcome !== "failed" &&
              headedNavigation?.documentCommitted === true &&
              headedNavigation.finalUrlAuthorized === true;
            const completedAtMs = Date.parse(headedPacket.completedAt);
            const retryLimitation = `headed_local_navigation_retry_after:${failureClass}`;
            const packet = postRefusalEvidencePacketSchema.parse({
              ...headedPacket,
              startedAt: new Date(branchStartedAtMs).toISOString(),
              timing: {
                ...headedPacket.timing,
                dispatchDelayMs,
                navigationMs: firstNavigationMs + headedPacket.timing.navigationMs,
                totalMs: Math.max(0, completedAtMs - branchStartedAtMs),
                readyAtMs: elapsed(parentScanStartedAtMs, completedAtMs),
              },
              interactionDiagnostics: {
                navigation: headedSucceeded
                  ? {
                      outcome: "recovered_after_error",
                      failureClass,
                      recoveryMethod: "headed_local_retry",
                      documentCommitted: true,
                      finalUrlAuthorized: true,
                    }
                  : headedNavigation ?? interactionDiagnostics.navigation,
                click: headedPacket.interactionDiagnostics?.click ?? interactionDiagnostics.click,
              },
              limitations: [...headedPacket.limitations, retryLimitation].slice(0, 24),
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
          }
        }
        limitations.push(`target_navigation_failed:${failureClass}`);
        timing.navigationMs = Math.max(0, Date.now() - navigationStartedAtMs);
        return await finalize({
          resolverFound: false,
          resolverReason: "target_navigation_failed",
          registration: unconfirmedRegistration("not_attempted", "target_navigation_failed"),
          requests: classifyRequests(retainedRequests(), parentScanStartedAtMs),
        });
      }
      limitations.push(`navigation_error_after_usable_document_commit:${failureClass}`);
    }
    timing.navigationMs = Math.max(0, Date.now() - navigationStartedAtMs);

    const finalTargetAuthorization = authorizePostRefusalTarget(
      page.url(),
      input.interactionAuthorization,
      authorizationScanId,
    );
    if (!finalTargetAuthorization.authorized) {
      interactionDiagnostics.navigation.finalUrlAuthorized = false;
      limitations.push(`redirect_target_authorization_failed:${finalTargetAuthorization.reason}`);
      return await finalize({
        resolverFound: false,
        resolverReason: "redirect_target_not_authorized",
        registration: unconfirmedRegistration("not_attempted", "redirect_target_not_authorized"),
        requests: classifyRequests(retainedRequests(), parentScanStartedAtMs),
      });
    }
    interactionDiagnostics.navigation.documentCommitted = true;
    interactionDiagnostics.navigation.finalUrlAuthorized = true;

    if (cancellation()) {
      return await finalize({
        resolverFound: false,
        resolverReason: "abort_requested_after_navigation",
        registration: unconfirmedRegistration("aborted", "abort_requested_after_navigation"),
        requests: classifyRequests(retainedRequests(), parentScanStartedAtMs),
      });
    }

    const resolverStartedAtMs = Date.now();
    const resolution = await waitForDeterministicRecipe(
      page,
      actionRecipes,
      actionSearchTimeoutMs,
      input.signal,
    );
    timing.resolverMs = Math.max(0, Date.now() - resolverStartedAtMs);
    if (resolution.status !== "found") {
      const resolverReason = resolution.status === "ambiguous"
        ? "multiple_deterministic_reject_controls_found"
        : resolution.status === "aborted"
          ? "abort_requested_during_control_resolution"
          : "deterministic_reject_control_not_found";
      return await finalize({
        resolverFound: false,
        resolverReason,
        registration: unconfirmedRegistration(
          resolution.status === "aborted" ? "aborted" : "not_attempted",
          resolverReason,
        ),
        requests: classifyRequests(retainedRequests(), parentScanStartedAtMs),
      });
    }
    selectedRecipe = resolution.recipe;
    let control = resolution.control;

    let preActionStorage = await captureStorage(context, page, input.url, limitations);
    let preActionCapturedAtEpochMs = Date.now();
    let preActionCapturedAtMs = elapsed(parentScanStartedAtMs, preActionCapturedAtEpochMs);
    if (cancellation()) {
      return await finalize({
        resolverFound: true,
        resolverReason: "abort_requested_before_action",
        registration: unconfirmedRegistration("aborted", "abort_requested_before_action"),
        preActionCapturedAtMs,
        preActionStorage,
        requests: classifyRequests(retainedRequests(), parentScanStartedAtMs),
      });
    }

    const confirmationBaseline = await captureRefusalConfirmationBaseline(
      context,
      page,
      selectedRecipe.confirmation,
    ).catch(() => undefined);
    if (!confirmationBaseline) {
      limitations.push("refusal_confirmation_baseline_unavailable");
      return await finalize({
        resolverFound: true,
        resolverReason: "refusal_confirmation_baseline_unavailable",
        registration: unconfirmedRegistration(
          "not_attempted",
          "refusal_confirmation_baseline_unavailable",
        ),
        preActionCapturedAtMs,
        preActionStorage,
        requests: classifyRequests(retainedRequests(), parentScanStartedAtMs),
      });
    }
    let actionabilityError: unknown;
    try {
      await control.click({ trial: true, timeout: 1_000 });
    } catch (error) {
      actionabilityError = error;
    }
    if (actionabilityError) {
      const reResolution = await waitForDeterministicRecipe(
        page,
        [selectedRecipe],
        1_000,
        input.signal,
      );
      if (reResolution.status === "found") {
        control = reResolution.control;
        interactionDiagnostics.click.reResolvedBeforeDispatch = true;
        try {
          await control.click({ trial: true, timeout: 1_000 });
          actionabilityError = undefined;
        } catch (error) {
          actionabilityError = error;
        }
      }
    }
    if (actionabilityError) {
      const actionability = await inspectControlActionability(control);
      const failureClass = actionability.centerHitTargetRelation === "other_element"
        ? "intercepted" as const
        : classifyClickFailure(actionabilityError);
      interactionDiagnostics.click = {
        outcome: "failed_before_dispatch",
        failureClass,
        reResolvedBeforeDispatch: interactionDiagnostics.click.reResolvedBeforeDispatch,
        confirmationCheckedAfterError: false,
        actionability,
      };
      limitations.push(`deterministic_reject_control_not_actionable:${failureClass}`);
      return await finalize({
        resolverFound: true,
        registration: {
          status: "unconfirmed",
          refusalExercised: false,
          reason: "deterministic_reject_control_click_failed",
          witnesses: [],
        },
        preActionCapturedAtMs,
        preActionStorage,
        postActionStorage: await captureStorage(context, page, input.url, limitations).catch(() => []),
        requests: classifyRequests(retainedRequests(), parentScanStartedAtMs),
      });
    }
    if (
      Date.now() - preActionCapturedAtEpochMs >
        POST_REFUSAL_PRE_ACTION_BASELINE_MAX_AGE_MS
    ) {
      const refreshedPreActionStorage = await captureStorage(
        context,
        page,
        input.url,
        limitations,
      ).catch(() => undefined);
      if (refreshedPreActionStorage) {
        preActionStorage = refreshedPreActionStorage;
        preActionCapturedAtEpochMs = Date.now();
        preActionCapturedAtMs = elapsed(parentScanStartedAtMs, preActionCapturedAtEpochMs);
      } else {
        limitations.push("pre_action_storage_baseline_refresh_unavailable");
      }
    }
    const actionDispatchedAtEpochMs = Date.now();
    const actionDispatchedAtMs = elapsed(parentScanStartedAtMs, actionDispatchedAtEpochMs);
    actionDispatched = true;
    try {
      input.onLifecycleEvent?.({ type: "action_dispatched", atMs: actionDispatchedAtMs });
    } catch {
      limitations.push("lifecycle_listener_failed");
    }
    let clickError: unknown;
    try {
      await control.click({ timeout: 2_000 });
    } catch (error) {
      clickError = error;
    }
    const confirmationStartedAtMs = Date.now();
    const confirmedState = await waitForRefusalConfirmation(
      context,
      page,
      selectedRecipe.confirmation,
      confirmationBaseline,
      actionDispatchedAtEpochMs,
      confirmationTimeoutMs,
      input.signal,
    ).catch(() => undefined);
    timing.confirmationMs = Math.max(0, Date.now() - confirmationStartedAtMs);
    if (clickError) {
      interactionDiagnostics.click = {
        outcome: confirmedState ? "confirmed_after_error" : "failed_after_dispatch",
        failureClass: classifyClickFailure(clickError),
        reResolvedBeforeDispatch: interactionDiagnostics.click.reResolvedBeforeDispatch,
        confirmationCheckedAfterError: true,
      };
      limitations.push(
        confirmedState
          ? `click_error_but_refusal_semantically_confirmed:${interactionDiagnostics.click.failureClass}`
          : `deterministic_reject_control_click_failed:${interactionDiagnostics.click.failureClass}`,
      );
    } else {
      interactionDiagnostics.click.outcome = "completed";
    }

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
            : clickError
              ? "deterministic_reject_control_click_failed"
            : "cmp_rejection_state_not_observed",
          witnesses: [],
        },
        preActionCapturedAtMs,
        preActionStorage,
        postActionStorage: await captureStorage(context, page, input.url, limitations).catch(() => []),
        requests: classifyRequests(retainedRequests(), parentScanStartedAtMs),
      });
    }

    const confirmedRefusalRegisteredAtEpochMs = Date.now();
    refusalRegisteredAtEpochMs = confirmedRefusalRegisteredAtEpochMs;
    const refusalRegisteredAtMs = elapsed(parentScanStartedAtMs, confirmedRefusalRegisteredAtEpochMs);
    activeRequestIdsAtRegistration = [...activeRequestIds].slice(0, 48);
    for (const request of preRegistrationRequests) {
      request.inFlightAtRefusalRegistration = activeRequestIds.has(request.requestId);
      if (request.inFlightAtRefusalRegistration) {
        requestInheritedInFlightAtRegistration.set(request.request, true);
      }
    }
    const witnesses: PostRefusalRegistration["witnesses"] = [{
      observedAtMs: refusalRegisteredAtMs,
      witnessType: confirmedState.witnessType,
      ...(confirmedState.key ? { key: confirmedState.key } : {}),
      expectedState: confirmedState.expectedState,
      observedStateHash: confirmedState.stateHash,
      corroboratingOnly: false,
    }];
    if (selectedRecipe.bannerSelector) {
      const bannerRemoved = await page.locator(selectedRecipe.bannerSelector).count().catch(() => 0) === 0 ||
        !await page.locator(selectedRecipe.bannerSelector).first().isVisible().catch(() => false);
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

    let tcfDataAfterRefusal = await readTcfData(page).catch(() => undefined);
    let tcfDataObservedAtEpochMs = tcfDataAfterRefusal ? Date.now() : undefined;
    let tcfGrantEvidence = tcfPurposeGrantEvidence(tcfDataAfterRefusal);
    const observationStartedAtMs = Date.now();
    const observationResult = tcfGrantEvidence.purposeGrantedIds.length > 0
        ? {
          reason: "refusal_signal_contradiction_observed" as const,
          tcfData: tcfDataAfterRefusal,
          tcfObservedAtEpochMs: tcfDataObservedAtEpochMs,
        }
      : await waitForPostRefusalObservation({
          page,
          getCapturedRequests: retainedRequests,
          parentScanStartedAtMs,
          refusalRegisteredAtEpochMs: confirmedRefusalRegisteredAtEpochMs,
          targetUrl: input.url,
          observationWindowMs,
        });
    timing.observationExitReason = observationResult.reason;
    timing.observationMs = Math.max(0, Date.now() - observationStartedAtMs);
    if (timing.observationExitReason !== "window_elapsed") {
      limitations.push(`observation_early_exit:${timing.observationExitReason}`);
    }
    if (cancellation()) limitations.push("abort_requested_after_confirmed_action_observation_not_truncated");

    if (observationResult.tcfData) {
      tcfDataAfterRefusal = observationResult.tcfData;
      tcfDataObservedAtEpochMs = observationResult.tcfObservedAtEpochMs;
    } else {
      const finalTcfData = await readTcfData(page).catch(() => undefined);
      if (finalTcfData) {
        tcfDataAfterRefusal = finalTcfData;
        tcfDataObservedAtEpochMs = Date.now();
      }
    }
    tcfGrantEvidence = tcfPurposeGrantEvidence(tcfDataAfterRefusal);
    const retainedPostRefusalTcfState = tcfDataAfterRefusal && tcfDataObservedAtEpochMs !== undefined
      ? postRefusalTcfState(
          tcfDataAfterRefusal,
          elapsed(parentScanStartedAtMs, tcfDataObservedAtEpochMs),
        )
      : undefined;
    const postActionStorage = await captureStorage(context, page, input.url, limitations);
    const postActionStorageObservedAtEpochMs = Date.now();
    const postActionCapturedAtMs = elapsed(
      parentScanStartedAtMs,
      postActionStorageObservedAtEpochMs,
    );
    if (pendingResponseHeaderCaptures.size > 0) {
      await Promise.race([
        Promise.all([...pendingResponseHeaderCaptures]),
        waitForDelay(250),
      ]).catch(() => undefined);
    }
    const allRequests = classifyRequests(
      retainedRequests(),
      parentScanStartedAtMs,
      confirmedRefusalRegisteredAtEpochMs,
    );
    const postRefusalNonEssentialRequests = allRequests
      .filter((request) =>
        request.nonEssential &&
        !request.inFlightAtRefusalRegistration &&
        typeof request.msOffsetFromRefusal === "number" &&
        request.msOffsetFromRefusal > 0
      )
      .slice(0, 24);
    const instrumentedWrites = await readStorageWrites(page).catch(() => {
      limitations.push("instrumented_storage_writes_unavailable");
      return [];
    });
    const instrumentedWritesAfterRefusal = instrumentedWrites
      .filter((write) => write.observedAtEpochMs > confirmedRefusalRegisteredAtEpochMs)
      .map((write) => classifyStorageWrite(
        write,
        parentScanStartedAtMs,
        confirmedRefusalRegisteredAtEpochMs,
        input.url,
      ))
      .filter((write): write is PostRefusalStorageWrite => Boolean(write))
      .map((write) => ({ ...write, evidenceSource: "instrumented_write" as const }));
    const snapshotDeltaWrites = storageSnapshotDeltaWrites({
      before: preActionStorage,
      after: postActionStorage,
      instrumentedHostname: new URL(input.url).hostname,
      instrumentedWritesSinceAction: instrumentedWrites.filter((write) =>
        write.observedAtEpochMs >= actionDispatchedAtEpochMs
      ),
      observedAtEpochMs: postActionStorageObservedAtEpochMs,
      parentScanStartedAtMs,
      postRefusalRequests: allRequests,
      refusalRegisteredAtEpochMs: confirmedRefusalRegisteredAtEpochMs,
    });
    const writesAfterRefusal = dedupeStorageWrites([
      ...instrumentedWritesAfterRefusal,
      ...snapshotDeltaWrites,
    ]).slice(0, 48);
    const nonEssentialItemsPersistingAfterRefusal = persistedNonEssentialStorage(
      preActionStorage,
      postActionStorage,
    ).slice(0, 24);
    const changedNonEssentialStorageWithoutWriteAnchor = postActionStorage.some((item) => {
      if (!item.nonEssential) return false;
      const before = preActionStorage.find((candidate) =>
        storageItemKey(candidate) === storageItemKey(item) && candidate.nonEssential
      );
      if (!before || before.valueHash === item.valueHash) return false;
      return !writesAfterRefusal.some((write) =>
        write.storageType === item.storageType &&
        write.name === item.name &&
        write.hostname === item.hostname
      );
    });
    if (
      changedNonEssentialStorageWithoutWriteAnchor &&
      !limitations.includes("changed_nonessential_storage_without_write_anchor")
    ) {
      limitations.push("changed_nonessential_storage_without_write_anchor");
    }
    const includePersistenceObservations = observationResult.reason === "window_elapsed";
    if (!includePersistenceObservations && nonEssentialItemsPersistingAfterRefusal.length > 0) {
      limitations.push("persistence_observation_not_settled_due_to_early_exit");
    }
    const observations = buildObservations({
      postRefusalNonEssentialRequests,
      writesAfterRefusal,
      nonEssentialItemsPersistingAfterRefusal,
      includePersistenceObservations,
      refusalRegisteredAtMs,
      postActionCapturedAtMs,
      postRefusalTcfState: retainedPostRefusalTcfState,
    });

    return await finalize({
      resolverFound: true,
      registration,
      preActionCapturedAtMs,
      postActionCapturedAtMs,
      preActionStorage,
      postActionStorage,
      writesAfterRefusal,
      nonEssentialItemsPersistingAfterRefusal,
      requests: allRequests,
      postRefusalNonEssentialRequests,
      ...(retainedPostRefusalTcfState
        ? { postRefusalTcfState: retainedPostRefusalTcfState }
        : {}),
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

function selectRetainedRequests(
  preRegistrationRequests: CapturedRequest[],
  postRegistrationRequests: CapturedRequest[],
): CapturedRequest[] {
  const selected = new Map<string, CapturedRequest>();
  for (const request of postRegistrationRequests) selected.set(request.requestId, request);
  for (const request of preRegistrationRequests.filter((candidate) =>
    candidate.inFlightAtRefusalRegistration
  )) {
    if (selected.size >= MAX_REQUESTS) break;
    selected.set(request.requestId, request);
  }
  for (const request of [...preRegistrationRequests].reverse()) {
    if (selected.size >= MAX_REQUESTS) break;
    selected.set(request.requestId, request);
  }
  return [...selected.values()]
    .sort((left, right) => left.startedAtEpochMs - right.startedAtEpochMs)
    .slice(-MAX_REQUESTS);
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
      ...(captured.responseCookieNamesSet?.length
        ? { responseCookieNamesSet: captured.responseCookieNamesSet }
        : {}),
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
  limitations?: string[],
): Promise<PostRefusalStorageItem[]> {
  const pageStorage = await page.evaluate(() => {
    let localStorage: Array<[string, string]> = [];
    let sessionStorage: Array<[string, string]> = [];
    let localStorageAvailable = true;
    let sessionStorageAvailable = true;
    try {
      localStorage = Object.entries(window.localStorage);
    } catch {
      localStorageAvailable = false;
    }
    try {
      sessionStorage = Object.entries(window.sessionStorage);
    } catch {
      sessionStorageAvailable = false;
    }
    return { localStorage, localStorageAvailable, sessionStorage, sessionStorageAvailable };
  }).catch(() => ({
    localStorage: [] as Array<[string, string]>,
    localStorageAvailable: false,
    sessionStorage: [] as Array<[string, string]>,
    sessionStorageAvailable: false,
  }));
  if (!pageStorage.localStorageAvailable && !limitations?.includes("local_storage_snapshot_unavailable")) {
    limitations?.push("local_storage_snapshot_unavailable");
  }
  if (!pageStorage.sessionStorageAvailable && !limitations?.includes("session_storage_snapshot_unavailable")) {
    limitations?.push("session_storage_snapshot_unavailable");
  }
  let snapshotUrl = new URL(targetUrl);
  try {
    const currentPageUrl = new URL(page.url());
    if (currentPageUrl.protocol === "http:" || currentPageUrl.protocol === "https:") {
      snapshotUrl = currentPageUrl;
    }
  } catch {
    // Keep the authorized target as a bounded fallback when page URL state is unavailable.
  }
  const targetHostname = snapshotUrl.hostname;
  const targetOrigin = snapshotUrl.origin;
  const cookies = await context.cookies().catch(() => {
    if (!limitations?.includes("cookie_snapshot_unavailable")) {
      limitations?.push("cookie_snapshot_unavailable");
    }
    return [];
  });
  const items: PostRefusalStorageItem[] = [];

  for (const cookie of cookies.slice(0, MAX_STORAGE_ITEMS * 4)) {
    items.push(classifyStorageItem({
      storageType: "cookie",
      name: cookie.name,
      value: cookie.value,
      hostname: cookie.domain.replace(/^\./, "") || targetHostname,
      identityBasis: "cookie_name_domain_path_partition",
      identityHash: postRefusalStorageIdentityHash({
        storageType: "cookie",
        name: cookie.name,
        hostname: cookie.domain.replace(/^\./, "") || targetHostname,
        cookiePath: cookie.path,
        partitionKey: cookie.partitionKey,
      }),
    }));
  }
  for (const [name, value] of pageStorage.localStorage.slice(0, MAX_STORAGE_ITEMS * 4)) {
    items.push(classifyStorageItem({
      storageType: "local_storage",
      name,
      value,
      hostname: targetHostname,
      identityBasis: "origin_storage_key",
      identityHash: postRefusalStorageIdentityHash({
        storageType: "local_storage",
        name,
        origin: targetOrigin,
      }),
    }));
  }
  for (const [name, value] of pageStorage.sessionStorage.slice(0, MAX_STORAGE_ITEMS * 4)) {
    items.push(classifyStorageItem({
      storageType: "session_storage",
      name,
      value,
      hostname: targetHostname,
      identityBasis: "origin_storage_key",
      identityHash: postRefusalStorageIdentityHash({
        storageType: "session_storage",
        name,
        origin: targetOrigin,
      }),
    }));
  }
  return items
    .sort((left, right) =>
      Number(right.nonEssential) - Number(left.nonEssential) ||
      storageItemKey(left).localeCompare(storageItemKey(right))
    )
    .slice(0, MAX_STORAGE_ITEMS);
}

function classifyStorageItem(input: {
  storageType: PostRefusalStorageItem["storageType"];
  name: string;
  value: string;
  hostname: string;
  identityBasis: NonNullable<PostRefusalStorageItem["identityBasis"]>;
  identityHash: string;
}): PostRefusalStorageItem {
  const vendor = input.storageType === "cookie"
    ? vendorFor({ type: "cookie", cookieName: input.name, hostname: input.hostname })
    : vendorFor({ type: "cmp_runtime", storageKey: input.name, hostname: input.hostname });
  return {
    storageType: input.storageType,
    name: input.name.slice(0, 180),
    hostname: input.hostname.slice(0, 255),
    identityBasis: input.identityBasis,
    identityHash: input.identityHash,
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
    hostname,
    observedAtMs: elapsed(scanStartedAtMs, write.observedAtEpochMs),
    msOffsetFromRefusal: Math.max(0, Math.round(write.observedAtEpochMs - refusalRegisteredAtEpochMs)),
    ...(vendor ? { vendor: vendor.vendor, purpose: vendor.purpose } : {}),
    nonEssential: vendor ? NON_ESSENTIAL_PURPOSES.has(vendor.purpose) : false,
  };
}

function storageSnapshotDeltaWrites(input: {
  after: PostRefusalStorageItem[];
  before: PostRefusalStorageItem[];
  instrumentedHostname: string;
  instrumentedWritesSinceAction: InstrumentedStorageWrite[];
  observedAtEpochMs: number;
  parentScanStartedAtMs: number;
  postRefusalRequests: PostRefusalNetworkRequest[];
  refusalRegisteredAtEpochMs: number;
}): PostRefusalStorageWrite[] {
  const before = new Map(input.before.map((item) => [storageItemKey(item), item]));
  return input.after.flatMap((item) => {
    const previous = before.get(storageItemKey(item));
    if (previous?.valueHash === item.valueHash) return [];
    const instrumentedChangeAlreadyTimed = input.instrumentedWritesSinceAction.some((write) =>
      write.storageType === item.storageType &&
      write.name === item.name &&
      (
        write.storageType !== "cookie" ||
        !item.hostname ||
        sameSiteHostname(input.instrumentedHostname, item.hostname)
      )
    );
    if (instrumentedChangeAlreadyTimed) return [];
    if (item.storageType !== "cookie" || !item.hostname) return [];
    const cookieHostname = item.hostname;
    const eligibleResponseRequest = selectExactResponseCookieWriteAnchor({
      cookieHostname,
      cookieName: item.name,
      requests: input.postRefusalRequests,
    });
    if (!eligibleResponseRequest?.completedAtMs) return [];
    const refusalRegisteredAtMs = elapsed(
      input.parentScanStartedAtMs,
      input.refusalRegisteredAtEpochMs,
    );
    return [{
      storageType: item.storageType,
      name: item.name,
      ...(item.hostname ? { hostname: item.hostname } : {}),
      observedAtMs: eligibleResponseRequest.completedAtMs,
      msOffsetFromRefusal: eligibleResponseRequest.completedAtMs - refusalRegisteredAtMs,
      evidenceSource: "post_action_snapshot_delta" as const,
      ...(item.vendor ? { vendor: item.vendor } : {}),
      ...(item.purpose ? { purpose: item.purpose } : {}),
      nonEssential: item.nonEssential,
    }];
  });
}

type ResponseCookieWriteAnchorRequest = PostRefusalNetworkRequest & {
  responseCookieNamesSet?: string[];
};

export function selectExactResponseCookieWriteAnchor(input: {
  cookieHostname: string;
  cookieName: string;
  requests: ResponseCookieWriteAnchorRequest[];
}): ResponseCookieWriteAnchorRequest | undefined {
  return input.requests
    .filter((request) =>
      !request.inFlightAtRefusalRegistration &&
      typeof request.msOffsetFromRefusal === "number" &&
      request.msOffsetFromRefusal > 0 &&
      typeof request.completedAtMs === "number" &&
      request.hostname !== undefined &&
      requestHostCanSetCookie(request.hostname, input.cookieHostname) &&
      request.responseCookieNamesSet?.includes(input.cookieName)
    )
    .sort((left, right) => (left.completedAtMs ?? 0) - (right.completedAtMs ?? 0))[0];
}

export function responseCookieNamesFromHeaders(
  headers: Array<{ name: string; value: string }>,
): string[] {
  return [...new Set(headers.flatMap((header) => {
    if (header.name.toLowerCase() !== "set-cookie") return [];
    const separator = header.value.indexOf("=");
    const name = separator > 0 ? header.value.slice(0, separator).trim() : "";
    return name && name.length <= 180 ? [name] : [];
  }))].slice(0, 24);
}

function dedupeStorageWrites(writes: PostRefusalStorageWrite[]): PostRefusalStorageWrite[] {
  const selected = new Map<string, PostRefusalStorageWrite>();
  for (const write of writes) {
    const key = `${write.storageType}:${write.hostname ?? ""}:${write.name}`;
    const existing = selected.get(key);
    if (!existing || (
      existing.evidenceSource === "post_action_snapshot_delta" &&
      write.evidenceSource === "instrumented_write"
    )) {
      selected.set(key, write);
    }
  }
  return [...selected.values()].sort((left, right) => left.observedAtMs - right.observedAtMs);
}

function storageItemKey(
  item: Pick<PostRefusalStorageItem, "storageType" | "name" | "hostname" | "identityHash">,
): string {
  if (item.identityHash) return `${item.storageType}:identity:${item.identityHash}`;
  return `${item.storageType}:${item.hostname ?? ""}:${item.name}`;
}

export function postRefusalStorageIdentityHash(input: {
  storageType: PostRefusalStorageItem["storageType"];
  name: string;
  hostname?: string;
  cookiePath?: string;
  partitionKey?: string;
  origin?: string;
}): string {
  const name = input.name.slice(0, 180);
  if (input.storageType === "cookie") {
    const hostname = (input.hostname ?? "").toLowerCase().replace(/^\./, "").slice(0, 255);
    const cookiePath = (input.cookiePath || "/").slice(0, 500);
    const partitionKey = (input.partitionKey ?? "").slice(0, 500);
    return hashValue(JSON.stringify([
      "cookie_name_domain_path_partition",
      hostname,
      cookiePath,
      partitionKey,
      name,
    ]));
  }
  let origin = input.origin ?? "";
  try {
    origin = new URL(origin).origin;
  } catch {
    origin = origin.slice(0, 500);
  }
  return hashValue(JSON.stringify(["origin_storage_key", input.storageType, origin, name]));
}

function sameSiteHostname(left: string, right: string): boolean {
  const normalizedLeft = left.toLowerCase().replace(/^\./, "");
  const normalizedRight = right.toLowerCase().replace(/^\./, "");
  return normalizedLeft === normalizedRight ||
    normalizedLeft.endsWith(`.${normalizedRight}`) ||
    normalizedRight.endsWith(`.${normalizedLeft}`);
}

function requestHostCanSetCookie(requestHostname: string, cookieHostname: string): boolean {
  const requestHost = requestHostname.toLowerCase().replace(/^\./, "");
  const cookieHost = cookieHostname.toLowerCase().replace(/^\./, "");
  return requestHost === cookieHost || requestHost.endsWith(`.${cookieHost}`);
}

export function persistedNonEssentialStorage(
  before: PostRefusalStorageItem[],
  after: PostRefusalStorageItem[],
): PostRefusalStorageItem[] {
  const beforeNonEssentialValues = new Set(
    before
      .filter((item) => item.nonEssential)
      .map((item) => `${storageItemKey(item)}:${item.valueHash}`),
  );
  return after.filter((item) =>
    item.nonEssential &&
    beforeNonEssentialValues.has(`${storageItemKey(item)}:${item.valueHash}`)
  );
}

function buildObservations(input: {
  postRefusalNonEssentialRequests: PostRefusalNetworkRequest[];
  writesAfterRefusal: PostRefusalStorageWrite[];
  nonEssentialItemsPersistingAfterRefusal: PostRefusalStorageItem[];
  includePersistenceObservations: boolean;
  refusalRegisteredAtMs: number;
  postActionCapturedAtMs: number;
  postRefusalTcfState?: PostRefusalTcfState;
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
      ...(write.hostname ? { hostname: write.hostname } : {}),
      storageType: write.storageType,
      storageName: write.name,
      msOffsetFromRefusal: write.msOffsetFromRefusal,
      evidenceKeys: ["confirmed_refusal_registration", "storage_write_after_refusal"],
    });
  }
  for (const item of input.includePersistenceObservations
    ? input.nonEssentialItemsPersistingAfterRefusal
    : []) {
    observations.push({
      observationType: "pre_consent_storage_not_cleared",
      observedAtMs: input.postActionCapturedAtMs,
      ...(item.vendor ? { vendor: item.vendor } : {}),
      ...(item.hostname ? { hostname: item.hostname } : {}),
      storageType: item.storageType,
      storageName: item.name,
      ...(item.identityHash ? { storageIdentityHash: item.identityHash } : {}),
      storageValueHash: item.valueHash,
      msOffsetFromRefusal: input.postActionCapturedAtMs - input.refusalRegisteredAtMs,
      evidenceKeys: ["same_session_pre_action_snapshot", "same_session_post_action_snapshot"],
    });
  }
  if (input.postRefusalTcfState && input.postRefusalTcfState.purposeGrantedIds.length > 0) {
    observations.push({
      observationType: "refusal_signal_contradicts_action",
      observedAtMs: input.postRefusalTcfState.observedAtMs,
      msOffsetFromRefusal:
        input.postRefusalTcfState.observedAtMs - input.refusalRegisteredAtMs,
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
    let nextSequence = 0;
    const retain = (record) => {
      records.push({ ...record, sequence: ++nextSequence });
      if (records.length > 192) records.splice(0, records.length - 192);
    };
    Object.defineProperty(window, "__certscoreReadPostRefusalWrites", {
      configurable: false,
      enumerable: false,
      value: () => records.slice(-96).map((record) => ({ ...record })),
      writable: false,
    });
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      let storageType = "local_storage";
      try { storageType = this === window.sessionStorage ? "session_storage" : "local_storage"; } catch (_) {}
      const result = originalSetItem.call(this, key, value);
      retain({ storageType, name: String(key).slice(0, 180), observedAtEpochMs: Date.now() });
      return result;
    };
    const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
    if (cookieDescriptor && cookieDescriptor.get && cookieDescriptor.set && cookieDescriptor.configurable) {
      Object.defineProperty(Document.prototype, "cookie", {
        configurable: true,
        enumerable: cookieDescriptor.enumerable,
        get: cookieDescriptor.get,
        set: function(value) {
          const name = String(value).split("=", 1)[0].trim().slice(0, 180);
          const result = cookieDescriptor.set.call(this, value);
          retain({ storageType: "cookie", name, observedAtEpochMs: Date.now() });
          return result;
        },
      });
    }
  })();` });
}

async function readStorageWrites(page: Page): Promise<InstrumentedStorageWrite[]> {
  return page.evaluate(() => {
    const read = (window as unknown as {
      __certscoreReadPostRefusalWrites?: () => InstrumentedStorageWrite[];
    }).__certscoreReadPostRefusalWrites;
    return typeof read === "function" ? read() : [];
  }).catch(() => []);
}

type DeterministicRecipeResolution =
  | {
      status: "found";
      recipe: PostRefusalActionRecipe;
      control: Locator;
    }
  | {
      status: "not_found" | "ambiguous" | "aborted";
    };

async function waitForDeterministicRecipe(
  page: Page,
  recipes: PostRefusalActionRecipe[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<DeterministicRecipeResolution> {
  const deadlineAtMs = Date.now() + timeoutMs;
  let stableRecipeId: string | undefined;
  let stableSinceMs = 0;
  do {
    if (signal?.aborted) return { status: "aborted" };
    const actionable: Array<{ recipe: PostRefusalActionRecipe; control: Locator }> = [];
    for (const recipe of recipes) {
      const controls = page.locator(recipe.controlSelector);
      const count = Math.min(await controls.count().catch(() => 0), 3);
      for (let index = 0; index < count; index += 1) {
        const control = controls.nth(index);
        if (
          await control.isVisible().catch(() => false) &&
          await control.isEnabled().catch(() => false)
        ) {
          actionable.push({ recipe, control });
        }
      }
    }
    if (actionable.length > 1) return { status: "ambiguous" };
    const match = actionable[0];
    if (match) {
      if (stableRecipeId !== match.recipe.recipeId) {
        stableRecipeId = match.recipe.recipeId;
        stableSinceMs = Date.now();
      }
      if (Date.now() - stableSinceMs >= 75 || Date.now() >= deadlineAtMs) {
        return { status: "found", ...match };
      }
    } else {
      stableRecipeId = undefined;
      stableSinceMs = 0;
    }
    if (Date.now() >= deadlineAtMs) break;
    await waitForDelay(Math.min(25, Math.max(0, deadlineAtMs - Date.now())), signal).catch(() => undefined);
  } while (Date.now() <= deadlineAtMs);
  return { status: "not_found" };
}

function validatedActionRecipes(input: PostRefusalObserverInput): PostRefusalActionRecipe[] {
  const recipes = input.recipeCandidates?.length ? input.recipeCandidates : [input.recipe];
  if (recipes.length > 8) {
    throw new Error("Post-refusal recipe candidate set exceeds the bounded maximum of 8.");
  }
  const recipeIds = new Set<string>();
  const selectors = new Set<string>();
  for (const recipe of recipes) {
    if (recipe.artifactVersion !== "certscore.post_refusal_action_recipe.v1") {
      throw new Error("Post-refusal recipe candidate has an unsupported contract version.");
    }
    if (!recipe.recipeId.trim() || recipe.recipeId.length > 160) {
      throw new Error("Post-refusal recipe candidate has an invalid recipe ID.");
    }
    if (!recipe.controlSelector.trim() || recipe.controlSelector.length > 500) {
      throw new Error("Post-refusal recipe candidate has an invalid deterministic selector.");
    }
    if (recipe.confirmation.kind === "tcf_purposes_denied_or_cmp_storage_keys_changed") {
      const keys = recipe.confirmation.keys.map((key) => key.trim());
      if (
        keys.length === 0 ||
        keys.length > 8 ||
        keys.some((key) => !key || key.length > 160) ||
        new Set(keys).size !== keys.length
      ) {
        throw new Error("Post-refusal recipe candidate has invalid canonical CMP storage keys.");
      }
    }
    if (recipeIds.has(recipe.recipeId) || selectors.has(recipe.controlSelector)) {
      throw new Error("Post-refusal recipe candidates must have unique IDs and selectors.");
    }
    recipeIds.add(recipe.recipeId);
    selectors.add(recipe.controlSelector);
  }
  return recipes;
}

function validatedRecipeSetId(recipeSetId: string | undefined): string {
  const normalized = recipeSetId?.trim();
  if (!normalized || normalized.length > 160) {
    throw new Error("Multiple post-refusal recipes require a bounded recipeSetId.");
  }
  return normalized;
}

function candidateSetResolverMethod(
  recipes: PostRefusalActionRecipe[],
): NonNullable<PostRefusalActionRecipe["resolverMethod"]> {
  return recipes.every((recipe) => recipe.resolverMethod === "tcf_api_cmp_registry_recipe")
    ? "tcf_api_cmp_registry_recipe"
    : recipes.every((recipe) => recipe.resolverMethod === "cmp_registry_recipe")
      ? "cmp_registry_recipe"
      : "local_fixture_recipe";
}

async function waitForRefusalConfirmation(
  context: BrowserContext,
  page: Page,
  confirmation: PostRefusalActionRecipe["confirmation"],
  baseline: RefusalConfirmationBaseline,
  actionDispatchedAtEpochMs: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<RefusalConfirmationState | undefined> {
  if (confirmation.kind === "local_storage_equals") {
    const value = await waitForLocalStorageValue(
      page,
      confirmation.key,
      confirmation.expectedValue,
      baseline.kind === "local_storage_equals" ? baseline.lastSequence : 0,
      actionDispatchedAtEpochMs,
      timeoutMs,
      signal,
    );
    return value === undefined
      ? undefined
      : {
          stateHash: hashValue(value),
          witnessType: "cmp_storage_state",
          key: confirmation.key,
          expectedState: confirmation.expectedValue,
        };
  }

  const purposeIds = (confirmation.purposeIds?.length ? confirmation.purposeIds : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    .filter((purposeId) => Number.isInteger(purposeId) && purposeId > 0 && purposeId <= 24);
  const deadlineAtMs = Date.now() + timeoutMs;
  while (Date.now() <= deadlineAtMs) {
    if (signal?.aborted) return undefined;
    const snapshot = await readTcfData(page);
    const baselineSnapshot = baseline.kind === "tcf_purposes_denied" ||
        baseline.kind === "tcf_purposes_denied_or_cmp_cookie_changed" ||
        baseline.kind === "tcf_purposes_denied_or_cmp_storage_changed" ||
        baseline.kind === "tcf_purposes_denied_or_cmp_storage_keys_changed"
      ? baseline.snapshot
      : undefined;
    if (
      snapshot?.success &&
      snapshot.eventStatus === "useractioncomplete" &&
      purposeIds.length > 0 &&
      purposeIds.every((purposeId) => snapshot.purposeConsents[String(purposeId)] === false) &&
      (
        baselineSnapshot === undefined ||
        tcfSnapshotFingerprint(snapshot) !== tcfSnapshotFingerprint(baselineSnapshot)
      )
    ) {
      return {
        stateHash: snapshot.tcStringHash ?? hashValue(JSON.stringify(snapshot.purposeConsents)),
        witnessType: "tcf_user_action_complete",
        expectedState: "all_configured_purposes_denied",
      };
    }
    if (
      confirmation.kind === "tcf_purposes_denied_or_cmp_cookie_changed" &&
      baseline.kind === "tcf_purposes_denied_or_cmp_cookie_changed"
    ) {
      const currentCookieStateHash = await cmpCookieStateHash(context, confirmation.cookieName);
      if (
        currentCookieStateHash !== undefined &&
        currentCookieStateHash !== baseline.cookieStateHash
      ) {
        return {
          stateHash: currentCookieStateHash,
          witnessType: "cmp_cookie_state",
          key: confirmation.cookieName,
          expectedState: "canonical_cmp_consent_state_changed_after_reject",
        };
      }
    }
    if (
      confirmation.kind === "tcf_purposes_denied_or_cmp_storage_changed" &&
      baseline.kind === "tcf_purposes_denied_or_cmp_storage_changed"
    ) {
      const writes = await readStorageWrites(page);
      const freshCanonicalWrite = writes.some((write) =>
        write.sequence > baseline.lastSequence &&
        write.observedAtEpochMs >= actionDispatchedAtEpochMs &&
        write.storageType === confirmation.storageType &&
        write.name === confirmation.key
      );
      if (freshCanonicalWrite) {
        const currentStorageStateHash = await cmpStorageStateHash(
          page,
          confirmation.storageType,
          confirmation.key,
        );
        if (
          currentStorageStateHash !== undefined &&
          currentStorageStateHash !== baseline.storageStateHash
        ) {
          return {
            stateHash: currentStorageStateHash,
            witnessType: "cmp_storage_state",
            key: confirmation.key,
            expectedState: "canonical_cmp_consent_state_changed_after_reject",
          };
        }
      }
    }
    if (
      confirmation.kind === "tcf_purposes_denied_or_cmp_storage_keys_changed" &&
      baseline.kind === "tcf_purposes_denied_or_cmp_storage_keys_changed"
    ) {
      const canonicalKeys = confirmation.keys.slice(0, 8);
      const writes = await readStorageWrites(page);
      const freshlyWrittenKeys = new Set(writes.flatMap((write) =>
        write.sequence > baseline.lastSequence &&
          write.observedAtEpochMs >= actionDispatchedAtEpochMs &&
          write.storageType === confirmation.storageType &&
          canonicalKeys.includes(write.name)
          ? [write.name]
          : []
      ));
      for (const key of canonicalKeys) {
        if (!freshlyWrittenKeys.has(key)) continue;
        const currentStorageStateHash = await cmpStorageStateHash(
          page,
          confirmation.storageType,
          key,
        );
        if (
          currentStorageStateHash !== undefined &&
          currentStorageStateHash !== baseline.storageStateHashes[key]
        ) {
          return {
            stateHash: currentStorageStateHash,
            witnessType: "cmp_storage_state",
            key,
            expectedState: "canonical_cmp_consent_state_changed_after_reject",
          };
        }
      }
    }
    await waitForDelay(25, signal).catch(() => undefined);
  }
  return undefined;
}

async function captureRefusalConfirmationBaseline(
  context: BrowserContext,
  page: Page,
  confirmation: PostRefusalActionRecipe["confirmation"],
): Promise<RefusalConfirmationBaseline> {
  if (confirmation.kind === "local_storage_equals") {
    return {
      kind: "local_storage_equals",
      lastSequence: (await readStorageWrites(page)).at(-1)?.sequence ?? 0,
    };
  }
  if (confirmation.kind === "tcf_purposes_denied_or_cmp_cookie_changed") {
    const [snapshot, cookieStateHash] = await Promise.all([
      readTcfData(page).catch(() => undefined),
      cmpCookieStateHash(context, confirmation.cookieName),
    ]);
    return {
      kind: "tcf_purposes_denied_or_cmp_cookie_changed",
      snapshot,
      cookieStateHash,
    };
  }
  if (confirmation.kind === "tcf_purposes_denied_or_cmp_storage_changed") {
    const [snapshot, storageStateHash, writes] = await Promise.all([
      readTcfData(page).catch(() => undefined),
      cmpStorageStateHash(page, confirmation.storageType, confirmation.key),
      readStorageWrites(page),
    ]);
    return {
      kind: "tcf_purposes_denied_or_cmp_storage_changed",
      snapshot,
      storageStateHash,
      lastSequence: writes.at(-1)?.sequence ?? 0,
    };
  }
  if (confirmation.kind === "tcf_purposes_denied_or_cmp_storage_keys_changed") {
    const canonicalKeys = confirmation.keys.slice(0, 8);
    const [snapshot, storageStateEntries, writes] = await Promise.all([
      readTcfData(page).catch(() => undefined),
      Promise.all(canonicalKeys.map(async (key) => [
        key,
        await cmpStorageStateHash(page, confirmation.storageType, key),
      ] as const)),
      readStorageWrites(page),
    ]);
    return {
      kind: "tcf_purposes_denied_or_cmp_storage_keys_changed",
      snapshot,
      storageStateHashes: Object.fromEntries(storageStateEntries),
      lastSequence: writes.at(-1)?.sequence ?? 0,
    };
  }
  return {
    kind: "tcf_purposes_denied",
    snapshot: await readTcfData(page).catch(() => undefined),
  };
}

async function cmpStorageStateHash(
  page: Page,
  storageType: "local_storage" | "session_storage",
  key: string,
): Promise<string | undefined> {
  const boundedKey = key.trim().slice(0, 180);
  if (!boundedKey) return undefined;
  const value = await page.evaluate(({ storageType, key }) => {
    try {
      const storage = storageType === "local_storage"
        ? window.localStorage
        : window.sessionStorage;
      return storage.getItem(key) ?? undefined;
    } catch {
      return undefined;
    }
  }, { storageType, key: boundedKey }).catch(() => undefined);
  return value === undefined ? undefined : hashValue(value);
}

async function cmpCookieStateHash(
  context: BrowserContext,
  cookieName: string,
): Promise<string | undefined> {
  const boundedName = cookieName.trim().slice(0, 180);
  if (!boundedName) return undefined;
  const states = (await context.cookies())
    .filter((cookie) => cookie.name === boundedName)
    .map((cookie) => ({
      domain: cookie.domain.toLowerCase().replace(/^\./, ""),
      path: cookie.path,
      valueHash: hashValue(cookie.value),
    }))
    .sort((left, right) =>
      `${left.domain}:${left.path}`.localeCompare(`${right.domain}:${right.path}`)
    );
  return states.length > 0 ? hashValue(JSON.stringify(states)) : undefined;
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
  })()` ).catch(() => undefined) as {
    eventStatus?: string;
    purposeConsents: Record<string, boolean>;
    success: boolean;
    tcString?: string;
  } | undefined;
  if (!raw) return undefined;
  const parsedTcString = decodeTcfV2PurposeConsents(raw.tcString);
  return {
    eventStatus: raw.eventStatus,
    purposeConsents: raw.purposeConsents,
    success: raw.success,
    ...(raw.tcString ? { tcStringHash: hashValue(raw.tcString) } : {}),
    tcStringParseStatus: parsedTcString.status,
    tcStringPurposeConsents: parsedTcString.purposeConsents,
  };
}

export function decodeTcfV2PurposeConsents(tcString: string | undefined): {
  purposeConsents: Record<string, boolean>;
  status: PostRefusalTcfState["tcStringParseStatus"];
} {
  if (!tcString) return { purposeConsents: {}, status: "missing" };
  try {
    const coreSegment = tcString.split(".", 1)[0];
    if (!coreSegment || !/^[A-Za-z0-9_-]+$/.test(coreSegment)) {
      return { purposeConsents: {}, status: "invalid" };
    }
    const base64 = coreSegment.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const bytes = Buffer.from(padded, "base64");
    if (bytes.length * 8 < 176) return { purposeConsents: {}, status: "invalid" };
    const bit = (index: number) => (bytes[Math.floor(index / 8)]! >> (7 - (index % 8))) & 1;
    const numberAt = (offset: number, length: number) => {
      let value = 0;
      for (let index = 0; index < length; index += 1) value = value * 2 + bit(offset + index);
      return value;
    };
    if (numberAt(0, 6) !== 2) {
      return { purposeConsents: {}, status: "unsupported_version" };
    }
    const purposeConsents: Record<string, boolean> = {};
    const purposeConsentOffset = 152;
    for (let purposeId = 1; purposeId <= 24; purposeId += 1) {
      purposeConsents[String(purposeId)] = bit(purposeConsentOffset + purposeId - 1) === 1;
    }
    return { purposeConsents, status: "parsed_v2" };
  } catch {
    return { purposeConsents: {}, status: "invalid" };
  }
}

function tcfSnapshotFingerprint(snapshot: TcfDataSnapshot): string {
  return hashValue(JSON.stringify({
    eventStatus: snapshot.eventStatus ?? null,
    purposeConsents: snapshot.purposeConsents,
    tcStringHash: snapshot.tcStringHash ?? null,
  }));
}

function tcfPurposeGrantEvidence(snapshot: TcfDataSnapshot | undefined): {
  purposeGrantedIds: number[];
  source: PostRefusalTcfState["purposeGrantSource"];
} {
  if (!snapshot) return { purposeGrantedIds: [], source: "none" };
  const sourceConsents = snapshot.tcStringParseStatus === "parsed_v2"
    ? snapshot.tcStringPurposeConsents
    : snapshot.success
      ? snapshot.purposeConsents
      : {};
  const purposeGrantedIds = Object.entries(sourceConsents)
    .flatMap(([purposeId, granted]) => {
      const parsed = Number(purposeId);
      return granted && Number.isInteger(parsed) && parsed >= 1 && parsed <= 24 ? [parsed] : [];
    })
    .sort((left, right) => left - right)
    .slice(0, 24);
  return {
    purposeGrantedIds,
    source: snapshot.tcStringParseStatus === "parsed_v2"
      ? "tc_string"
      : snapshot.success
        ? "tcf_api"
        : "none",
  };
}

function postRefusalTcfState(
  snapshot: TcfDataSnapshot,
  observedAtMs: number,
): PostRefusalTcfState {
  const grants = tcfPurposeGrantEvidence(snapshot);
  return {
    observedAtMs,
    ...(snapshot.eventStatus ? { eventStatus: snapshot.eventStatus } : {}),
    apiSuccess: snapshot.success,
    ...(snapshot.tcStringHash ? { tcStringHash: snapshot.tcStringHash } : {}),
    tcStringParseStatus: snapshot.tcStringParseStatus,
    purposeGrantedIds: grants.purposeGrantedIds,
    purposeGrantSource: grants.source,
  };
}

async function waitForPostRefusalObservation(input: {
  page: Page;
  getCapturedRequests: () => CapturedRequest[];
  parentScanStartedAtMs: number;
  refusalRegisteredAtEpochMs: number;
  targetUrl: string;
  observationWindowMs: number;
}): Promise<{
  reason:
    | "window_elapsed"
    | "non_essential_request_observed"
    | "non_essential_storage_write_observed"
    | "refusal_signal_contradiction_observed";
  tcfData?: TcfDataSnapshot;
  tcfObservedAtEpochMs?: number;
}> {
  const deadlineAtMs = Date.now() + input.observationWindowMs;
  let lastTcfPollAtMs = 0;
  let lastTcfData: TcfDataSnapshot | undefined;
  let lastTcfObservedAtEpochMs: number | undefined;
  while (Date.now() < deadlineAtMs) {
    const requests = classifyRequests(
      input.getCapturedRequests(),
      input.parentScanStartedAtMs,
      input.refusalRegisteredAtEpochMs,
    );
    if (requests.some((request) =>
      request.nonEssential &&
      !request.inFlightAtRefusalRegistration &&
      typeof request.msOffsetFromRefusal === "number" &&
      request.msOffsetFromRefusal > 0
    )) {
      return {
        reason: "non_essential_request_observed",
        ...(lastTcfData
          ? { tcfData: lastTcfData, tcfObservedAtEpochMs: lastTcfObservedAtEpochMs }
          : {}),
      };
    }

    const writes = await pollWithinObservationDeadline(
      () => readStorageWrites(input.page),
      [],
      deadlineAtMs,
    );
    if (writes
      .filter((write) => write.observedAtEpochMs > input.refusalRegisteredAtEpochMs)
      .map((write) => classifyStorageWrite(
        write,
        input.parentScanStartedAtMs,
        input.refusalRegisteredAtEpochMs,
        input.targetUrl,
      ))
      .some((write) => write?.nonEssential)
    ) {
      return {
        reason: "non_essential_storage_write_observed",
        ...(lastTcfData
          ? { tcfData: lastTcfData, tcfObservedAtEpochMs: lastTcfObservedAtEpochMs }
          : {}),
      };
    }

    if (Date.now() - lastTcfPollAtMs >= 100) {
      lastTcfPollAtMs = Date.now();
      lastTcfData = await pollWithinObservationDeadline(
        () => readTcfData(input.page).catch(() => undefined),
        undefined,
        deadlineAtMs,
      );
      lastTcfObservedAtEpochMs = lastTcfData ? Date.now() : undefined;
      if (tcfPurposeGrantEvidence(lastTcfData).purposeGrantedIds.length > 0) {
        return {
          reason: "refusal_signal_contradiction_observed",
          tcfData: lastTcfData,
          tcfObservedAtEpochMs: lastTcfObservedAtEpochMs,
        };
      }
    }

    await waitForDelay(Math.min(25, Math.max(0, deadlineAtMs - Date.now())));
  }
  return {
    reason: "window_elapsed",
    ...(lastTcfData
      ? { tcfData: lastTcfData, tcfObservedAtEpochMs: lastTcfObservedAtEpochMs }
      : {}),
  };
}

async function pollWithinObservationDeadline<T>(
  poll: () => Promise<T>,
  timeoutValue: T,
  deadlineAtMs: number,
): Promise<T> {
  const remainingMs = deadlineAtMs - Date.now();
  if (remainingMs <= 0) return timeoutValue;
  return Promise.race([
    poll(),
    waitForDelay(Math.min(250, remainingMs)).then(() => timeoutValue),
  ]);
}

async function waitForLocalStorageValue(
  page: Page,
  key: string,
  expectedValue: string,
  baselineLastSequence: number,
  actionDispatchedAtEpochMs: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const deadlineAtMs = Date.now() + timeoutMs;
  while (Date.now() <= deadlineAtMs) {
    if (signal?.aborted) return undefined;
    const value = await page.evaluate(
      (storageKey) => window.localStorage.getItem(storageKey),
      key,
    ).catch(() => undefined);
    const writes = await readStorageWrites(page);
    const correlatedWrite = writes.some((write) =>
      write.sequence > baselineLastSequence &&
      write.storageType === "local_storage" &&
      write.name === key &&
      write.observedAtEpochMs >= actionDispatchedAtEpochMs
    );
    if (value === expectedValue && correlatedWrite) return value;
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

export function classifyNavigationFailure(
  error: unknown,
): NonNullable<PostRefusalInteractionDiagnostics["navigation"]["failureClass"]> {
  const message = browserErrorMessage(error);
  if (message.includes("err_aborted") || message.includes("download is starting")) return "aborted";
  if (
    message.includes("interrupted by another navigation") ||
    message.includes("navigation to") && message.includes("is interrupted")
  ) return "navigation_replaced";
  if (message.includes("timeout")) return "timeout";
  if (message.includes("err_name_not_resolved") || message.includes("dns")) return "dns";
  if (message.includes("err_http2_protocol_error")) return "http2_protocol";
  if (message.includes("err_quic_protocol_error")) return "quic_protocol";
  if (
    message.includes("err_cert") ||
    message.includes("ssl") ||
    message.includes("tls")
  ) return "tls";
  if (
    message.includes("err_connection") ||
    message.includes("err_internet_disconnected") ||
    message.includes("err_network")
  ) return "connection";
  return "other";
}

function shouldRetryNavigationWithHeaded(error: unknown): boolean {
  if (!isLocalHeadedFallbackEnabled()) return false;
  const message = browserErrorMessage(error);
  return /err_http2_protocol_error|err_quic_protocol_error|net::err_|timeout \d+ms exceeded|page\.goto/i.test(
    message,
  );
}

export async function inspectRecoverableCommittedDocument(
  page: Page,
  interactionAuthorization: PostRefusalInteractionAuthorization,
  failureClass: NonNullable<PostRefusalInteractionDiagnostics["navigation"]["failureClass"]>,
  scanId?: string,
): Promise<{
  recovered: boolean;
  documentCommitted: boolean;
  finalUrlAuthorized: boolean;
}> {
  await page.waitForTimeout(200).catch(() => undefined);
  const finalUrlAuthorization = authorizePostRefusalTarget(
    page.url(),
    interactionAuthorization,
    scanId,
  );
  const documentState = await page.evaluate(() => ({
    hasDocumentElement: Boolean(document.documentElement),
    hasBody: Boolean(document.body),
    readyState: document.readyState,
  })).catch(() => undefined);
  const documentCommitted = Boolean(
    documentState?.hasDocumentElement &&
    documentState.hasBody &&
    (documentState.readyState === "interactive" || documentState.readyState === "complete"),
  );
  const recoverableFailure = failureClass === "aborted" || failureClass === "navigation_replaced";
  return {
    recovered: recoverableFailure && finalUrlAuthorization.authorized && documentCommitted,
    documentCommitted,
    finalUrlAuthorized: finalUrlAuthorization.authorized,
  };
}

function classifyClickFailure(
  error: unknown,
): NonNullable<PostRefusalInteractionDiagnostics["click"]["failureClass"]> {
  const message = browserErrorMessage(error);
  if (
    message.includes("intercepts pointer events") ||
    message.includes("another element") && message.includes("receive the click")
  ) return "intercepted";
  if (
    message.includes("not attached") ||
    message.includes("detached") ||
    message.includes("element was removed")
  ) return "detached";
  if (
    message.includes("navigation") ||
    message.includes("target closed") ||
    message.includes("execution context was destroyed")
  ) return "navigation";
  if (
    message.includes("timeout") ||
    message.includes("not visible") ||
    message.includes("not enabled") ||
    message.includes("not stable")
  ) return "actionability_timeout";
  return "other";
}

async function inspectControlActionability(
  control: Locator,
): Promise<NonNullable<PostRefusalInteractionDiagnostics["click"]["actionability"]>> {
  const [controlVisible, controlEnabled] = await Promise.all([
    control.isVisible().catch(() => false),
    control.isEnabled().catch(() => false),
  ]);
  const geometry = await control.evaluate((element) => {
    const rectangle = element.getBoundingClientRect();
    const centerX = rectangle.left + rectangle.width / 2;
    const centerY = rectangle.top + rectangle.height / 2;
    const boundingBoxInViewport = rectangle.width > 0 &&
      rectangle.height > 0 &&
      rectangle.right > 0 &&
      rectangle.bottom > 0 &&
      rectangle.left < window.innerWidth &&
      rectangle.top < window.innerHeight;
    if (!boundingBoxInViewport) {
      return { boundingBoxInViewport, centerHitTargetRelation: "no_hit_target" as const };
    }
    const hitTarget = document.elementFromPoint(centerX, centerY);
    return {
      boundingBoxInViewport,
      centerHitTargetRelation: hitTarget === null
        ? "no_hit_target" as const
        : hitTarget === element || element.contains(hitTarget)
          ? "control_or_descendant" as const
          : "other_element" as const,
    };
  }).catch(() => ({
    boundingBoxInViewport: false,
    centerHitTargetRelation: "unavailable" as const,
  }));
  return { controlVisible, controlEnabled, ...geometry };
}

function browserErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.toLowerCase().slice(0, 2_000);
  return "";
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
