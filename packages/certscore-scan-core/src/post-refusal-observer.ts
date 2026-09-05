import { finishOptionalRuntimeGraph, installRuntimeGraphCapture } from "./runtime-evidence-graph-capture.js";
import {
  postRefusalEvidencePacketSchema,
  type ConsentActionControlProof,
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
import {
  detectKnownCmps,
  KNOWN_CMP_REGISTRY,
} from "@website-signal-risk-scanner/shared";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Frame,
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
  bindPostRefusalBrowserResolvedExactTarget,
  type PostRefusalInteractionAuthorization,
  type ResolvedPostRefusalScanTargetAuthorization,
} from "./post-refusal-target-authorization.js";
import {
  captureConsentControlGeometry,
  type ConsentControlGeometryArtifact,
  type ConsentControlCandidateEvidence,
} from "./consent-control-geometry.js";
import { installPublicNetworkGuardRoute } from "./public-network-guard.js";
import { installWebBotAuthRoute } from "./web-bot-auth-routing.js";
import { diagnoseCmpActionCoverage } from "./cmp-action-coverage.js";
import {
  closedShadowAccessibleControlAvailable,
  dispatchClosedShadowAccessibleControl,
  resolveScopedAccessibleControl,
  type CmpAccessibleActionResolution,
} from "./cmp-accessible-action.js";
import { readCmpApiConsentSnapshot } from "./cmp-api-consent-state.js";
import { buildConsentActionControlProof } from "./cmp-action-control-proof.js";
import { matchesCanonicalCmpCookieName } from "./cmp-cookie-name.js";
import {
  cmpRecipeRequiresViewportHitTarget,
  dispatchLocatorClickWithVerifiedGeometry,
  inspectLocatorActionability,
  locatorActionabilitySupportsVerifiedDispatch,
  locatorHasViewportHitTarget,
  waitForLocatorVerifiedGeometry,
} from "./cmp-control-actionability.js";
import {
  installConsentActionDiscovery,
  type ConsentActionDiscovery,
} from "./consent-action-discovery.js";

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
  resolverMethod?:
    | "local_fixture_recipe"
    | "cmp_registry_recipe"
    | "tcf_api_cmp_registry_recipe"
    | "owned_site_recipe"
    | "canonical_consent_control_registry_recipe";
  controlSelector: string;
  accessibleControl?: CmpAccessibleActionResolution;
  runtimeUrlPatternSources?: string[];
  /** Exact canonical label used only to disambiguate one geometry-derived selector. */
  controlExpectedNormalizedLabel?: string;
  /** Exact child-frame URL retained only for same-document selector scoping. */
  controlFrameUrl?: string;
  bannerSelector?: string;
  /** Exact child-frame URL retained only for same-document selector scoping. */
  bannerFrameUrl?: string;
  preActionRequirement?: {
    kind: "necessary_only_preferences_selected";
    requiredCheckedSelector: string;
    disallowedCheckedSelector: string;
  };
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
      }
    | {
        kind: "cmp_cookie_values_equal";
        cookies: Array<{
          expectedValue: string;
          name: string;
          path: string;
        }>;
      }
    | {
        kind: "cmp_cookie_changed";
        cookieName: string;
      }
    | {
        kind: "cmp_cookie_names_changed";
        cookieNames: string[];
      }
    | {
        kind: "cmp_api_consent_state_changed";
        provider: "termly" | "transcend";
      }
    | {
      kind: "canonical_reject_transition";
      controlSelector: string;
      controlFrameUrl?: string;
      bannerSelector: string;
      bannerFrameUrl?: string;
    };
}

export interface PostRefusalObserverInput {
  runtimeGraph?: { scanId: string; mode: "capture_only" | "project" };
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
  /**
   * For a runtime-identified CMP, use the canonical consent-control inventory
   * before its registered selector. For a non-CMP first layer, the same
   * canonical inventory may provide the bounded best attempt. Confirmation
   * still requires retained post-action evidence; classification alone never
   * confirms refusal.
   */
  allowCanonicalRejectDiscovery?: boolean;
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
  /** Local calibration aid; never changes resolver eligibility or evidence. */
  retainResolverDiagnostics?: boolean;
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
    }
  | {
      kind: "cmp_cookie_values_equal";
      stateHashes: Record<string, string | undefined>;
    }
  | {
      kind: "cmp_cookie_changed";
      cookieStateHash?: string;
    }
  | {
      kind: "cmp_cookie_names_changed";
      cookieStateHashes: Record<string, string | undefined>;
    }
  | {
      kind: "cmp_api_consent_state_changed";
      canonicalState?: string;
      eventSequence: number;
    }
  | {
      kind: "canonical_reject_transition";
      canonicalStorageStateHashes: Record<string, string>;
      controlVisible: boolean;
      bannerVisible: boolean;
      bannerStateHash?: string;
      lastSequence: number;
      pageUrl: string;
    };

type RefusalConfirmationState = {
  stateHash: string;
  witnessType:
    | "cmp_storage_state"
    | "cmp_api_state"
    | "tcf_user_action_complete"
    | "cmp_cookie_state"
    | "canonical_refusal_state";
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
  let effectiveInteractionAuthorization:
    | PostRefusalInteractionAuthorization
    | ResolvedPostRefusalScanTargetAuthorization = input.interactionAuthorization;
  let observationTargetUrl = input.url;
  let authorizedExactTargetUrl: string | undefined;
  const browserContextConfiguration = chromiumContextOptions();
  if (input.interactionAuthorization.kind !== "scan_target_resolution") {
    const targetAuthorization = authorizePostRefusalTarget(
      input.url,
      input.interactionAuthorization,
      authorizationScanId,
    );
    if (!targetAuthorization.authorized) {
      throw new Error(`Post-refusal target authorization failed closed: ${targetAuthorization.reason}.`);
    }
    authorizedExactTargetUrl = normalizeTargetUrl(input.url);
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
  const actionSearchTimeoutMs = boundedMs(input.actionSearchTimeoutMs, 1_500, 0, 15_000);
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
    `interaction_authorization:${input.interactionAuthorization.kind}:${input.interactionAuthorization.authorizationId}`,
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
  let graphCapture: Awaited<ReturnType<typeof installRuntimeGraphCapture>> | undefined;
  let actionDiscovery: ConsentActionDiscovery | undefined;
  let cancellationObservedAtMs: number | undefined;
  let actionDispatched = false;
  let refusalRegisteredAtEpochMs: number | undefined;
  let selectedRecipe: PostRefusalActionRecipe | undefined;
  let actionControlProof: ConsentActionControlProof | undefined;
  const interactionDiagnostics: PostRefusalInteractionDiagnostics = {
    resolver: {
      snapshots: [],
      truncated: false,
    },
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
    const retainedTargetUrl = sanitizeUrl(observationTargetUrl);
    const retainedNormalizedUrl = sanitizeUrl(normalizedUrl);
    const packet = postRefusalEvidencePacketSchema.parse({
      ...finishOptionalRuntimeGraph(graphCapture, "post_reject", confirmedRefusal ? undefined : "action_not_confirmed"),
      artifactVersion: "certscore.post_refusal_evidence.v1",
      artifactOnly: true,
      productionProjectable: productionProjectable && confirmedRefusal && Boolean(actionControlProof),
      scanId: input.scanId,
      ...(input.parentScanId ? { parentScanId: input.parentScanId } : {}),
      ...(authorizedExactTargetUrl
        ? { exactTargetSha256: hashValue(normalizeTargetUrl(authorizedExactTargetUrl)) }
        : {}),
      targetUrl: retainedTargetUrl,
      normalizedUrl: retainedNormalizedUrl,
      observationBranch: "reject_only",
      phase: "post_action",
      consentAction: "reject",
      ...(actionControlProof ? { actionControlProof } : {}),
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
    context = await browser.newContext(browserContextConfiguration);
    await installWebBotAuthRoute(context);
    if (input.interactionAuthorization.kind === "scan_target_resolution") {
      await installPublicNetworkGuardRoute(context);
    }
    page = await context.newPage();
    if (input.runtimeGraph) graphCapture = await installRuntimeGraphCapture(page, {
      ...input.runtimeGraph, captureId: input.scanId, scenario: "post_reject", startedAt: new Date(parentScanStartedAtMs).toISOString(),
    });
    actionDiscovery = await installConsentActionDiscovery(page);
    await installStorageWriteProbe(page);

    if (input.fulfillThirdPartyRequestsLocally) {
      const loopbackHostname = new URL(observationTargetUrl).hostname;
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

    let mainNavigationRequestCount = 0;
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page?.mainFrame()) {
        mainNavigationRequestCount += 1;
      }
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
      await page.goto(observationTargetUrl, { waitUntil: "commit", timeout: 15_000 });
      const redirectResolution = interactionDiagnostics.navigation.redirectResolution;
      interactionDiagnostics.navigation = {
        outcome: "completed",
        documentCommitted: true,
        finalUrlAuthorized: false,
        ...(redirectResolution ? { redirectResolution } : {}),
      };
    } catch (error) {
      const failureClass = classifyNavigationFailure(error);
      const recovery = await inspectRecoverableCommittedDocument(
        page,
        effectiveInteractionAuthorization,
        failureClass,
        authorizationScanId,
      );
      const redirectResolution = interactionDiagnostics.navigation.redirectResolution;
      interactionDiagnostics.navigation = {
        outcome: recovery.recovered ? "recovered_after_error" : "failed",
        failureClass,
        documentCommitted: recovery.documentCommitted,
        finalUrlAuthorized: recovery.finalUrlAuthorized,
        ...(recovery.recovered ? { recoveryMethod: "committed_document" as const } : {}),
        ...(redirectResolution ? { redirectResolution } : {}),
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
                      ...(headedNavigation?.redirectResolution
                        ? { redirectResolution: headedNavigation.redirectResolution }
                        : {}),
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

    if (input.interactionAuthorization.kind === "scan_target_resolution") {
      const passiveResolutionStartedAtMs = navigationStartedAtMs;
      const settled = await waitForPassiveRedirectSettle(
        page,
        input.interactionAuthorization.resolutionTimeoutMs,
        input.signal,
      );
      const resolution = settled
        ? await bindPostRefusalBrowserResolvedExactTarget({
            durationMs: Date.now() - passiveResolutionStartedAtMs,
            finalUrl: page.url(),
            redirectCount: Math.max(0, mainNavigationRequestCount - 1),
            requestedUrl: input.url,
          }, input.interactionAuthorization, authorizationScanId)
        : {
            durationMs: Math.max(0, Date.now() - passiveResolutionStartedAtMs),
            failureReason: "resolution_timeout" as const,
            redirectCount: Math.max(0, mainNavigationRequestCount - 1),
            requestedTargetSha256: hashValue(input.url),
            status: "failed" as const,
          };
      interactionDiagnostics.navigation.redirectResolution = resolution.status === "resolved"
        ? {
            durationMs: resolution.durationMs,
            finalExactTargetSha256: resolution.finalExactTargetSha256,
            redirectCount: resolution.redirectCount,
            requestedTargetSha256: resolution.requestedTargetSha256,
            status: "resolved",
          }
        : {
            durationMs: resolution.durationMs,
            failureReason: resolution.failureReason,
            redirectCount: resolution.redirectCount,
            requestedTargetSha256: resolution.requestedTargetSha256,
            status: "failed",
          };
      if (resolution.status === "failed") {
        limitations.push(`target_redirect_resolution_failed:${resolution.failureReason}`);
        return await finalize({
          resolverFound: false,
          resolverReason: "target_redirect_resolution_failed",
          registration: unconfirmedRegistration("not_attempted", "target_redirect_resolution_failed"),
          requests: classifyRequests(retainedRequests(), parentScanStartedAtMs),
        });
      }
      effectiveInteractionAuthorization = resolution.authorization;
      observationTargetUrl = resolution.targetUrl;
      authorizedExactTargetUrl = resolution.targetUrl;
      limitations.push(`redirect_target_resolved_exact:${resolution.redirectCount}`);
    }

    const finalTargetAuthorization = authorizePostRefusalTarget(
      page.url(),
      effectiveInteractionAuthorization,
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
    let resolverSnapshotAttempt = 0;
    let previousResolverSnapshotSignature: string | undefined;
    const recordResolverSnapshot: ResolverDiagnosticReporter = (snapshot) => {
      const resolverDiagnostics = interactionDiagnostics.resolver;
      if (!resolverDiagnostics) return;
      const signature = JSON.stringify(snapshot);
      if (signature === previousResolverSnapshotSignature) return;
      previousResolverSnapshotSignature = signature;
      resolverSnapshotAttempt += 1;
      const retained = {
        ...snapshot,
        attempt: resolverSnapshotAttempt,
        // Diagnostics are deliberately bounded by contract. A suspended or
        // resource-starved browser process can resume after the resolver's
        // deadline; that must not make neutral packet finalization throw.
        elapsedMs: Math.min(30_000, Math.max(0, Date.now() - resolverStartedAtMs)),
      };
      if (resolverDiagnostics.snapshots.length < 12) {
        resolverDiagnostics.snapshots.push(retained);
      } else {
        resolverDiagnostics.truncated = true;
        resolverDiagnostics.snapshots[11] = retained;
      }
    };
    const adaptiveExtensionMs = actionSearchTimeoutMs > 8_000
      ? Math.min(2_000, actionSearchTimeoutMs - 8_000)
      : 0;
    const initialActionSearchTimeoutMs = actionSearchTimeoutMs - adaptiveExtensionMs;
    let resolution = input.allowCanonicalRejectDiscovery
      ? await waitForDeterministicOrCanonicalRecipe(
          page,
          actionRecipes,
          initialActionSearchTimeoutMs,
          input.signal,
          recordResolverSnapshot,
          actionDiscovery,
        )
      : await waitForDeterministicRecipe(
          page,
          actionRecipes,
          initialActionSearchTimeoutMs,
          input.signal,
          recordResolverSnapshot,
          actionDiscovery,
        );
    if (
      resolution.status === "not_found" &&
      adaptiveExtensionMs > 0 &&
      await hasCredibleLateConsentSignal({
        context,
        diagnosticGeometry: resolution.diagnosticGeometry,
        page,
        requests: retainedRequests(),
      })
    ) {
      limitations.push(`adaptive_late_control_extension_applied:${adaptiveExtensionMs}`);
      resolution = input.allowCanonicalRejectDiscovery
        ? await waitForDeterministicOrCanonicalRecipe(
            page,
            actionRecipes,
            adaptiveExtensionMs,
            input.signal,
            recordResolverSnapshot,
            actionDiscovery,
          )
        : await waitForDeterministicRecipe(
            page,
            actionRecipes,
            adaptiveExtensionMs,
            input.signal,
            recordResolverSnapshot,
            actionDiscovery,
          );
    }
    timing.resolverMs = Math.max(0, Date.now() - resolverStartedAtMs);
    if (resolution.status !== "found") {
      if (resolution.status !== "aborted") {
        const coverage = await diagnoseCmpActionCoverage({
          action: "reject",
          context,
          page,
        }).catch(() => undefined);
        if (coverage && !limitations.includes(coverage.limitation)) {
          limitations.push(coverage.limitation);
        }
      }
      if (input.retainResolverDiagnostics && input.outDir && resolution.diagnosticGeometry) {
        await mkdir(input.outDir, { recursive: true }).then(() => writeFile(
          path.join(input.outDir!, "PostRefusalResolverGeometry.json"),
          `${JSON.stringify(resolution.diagnosticGeometry, null, 2)}\n`,
          "utf8",
        )).catch(() => {
          limitations.push("resolver_geometry_diagnostic_write_failed");
        });
      }
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
    const postResolverTargetAuthorization = authorizePostRefusalTarget(
      page.url(),
      effectiveInteractionAuthorization,
      authorizationScanId,
    );
    if (!postResolverTargetAuthorization.authorized) {
      interactionDiagnostics.navigation.finalUrlAuthorized = false;
      limitations.push(`post_resolver_target_authorization_failed:${postResolverTargetAuthorization.reason}`);
      return await finalize({
        resolverFound: false,
        resolverReason: "redirect_target_not_authorized",
        registration: unconfirmedRegistration("not_attempted", "redirect_target_not_authorized"),
        requests: classifyRequests(retainedRequests(), parentScanStartedAtMs),
      });
    }
    selectedRecipe = resolution.recipe;
    let control = resolution.control;

    let preActionStorage = await captureStorage(context, page, observationTargetUrl, limitations);
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
    const preActionScope = exactSelectorScope(page, selectedRecipe.controlFrameUrl);
    if (
      preActionScope.status !== "found" ||
      !await preActionRequirementSatisfied(preActionScope.scope, selectedRecipe)
    ) {
      limitations.push("necessary_only_pre_action_requirement_not_satisfied");
      return await finalize({
        resolverFound: true,
        resolverReason: "necessary_only_pre_action_requirement_not_satisfied",
        registration: unconfirmedRegistration(
          "not_attempted",
          "necessary_only_pre_action_requirement_not_satisfied",
        ),
        preActionCapturedAtMs,
        preActionStorage,
        requests: classifyRequests(retainedRequests(), parentScanStartedAtMs),
      });
    }

    let actionabilityError: unknown;
    let useVerifiedGeometryDispatch = false;
    try {
      await trialRejectControl(page, control, selectedRecipe);
    } catch (error) {
      actionabilityError = error;
    }
    if (actionabilityError) {
      let reResolution = await waitForDeterministicRecipe(
        page,
        [selectedRecipe],
        500,
        input.signal,
      );
      if (reResolution.status === "not_found" && input.allowCanonicalRejectDiscovery) {
        reResolution = await waitForCanonicalRejectControlRecipe(
          page,
          500,
          input.signal,
          [selectedRecipe],
        );
      }
      if (reResolution.status === "found") {
        selectedRecipe = reResolution.recipe;
        control = reResolution.control;
        interactionDiagnostics.click.reResolvedBeforeDispatch = true;
        try {
          if (selectedRecipe.accessibleControl?.kind === "closed_shadow_accessible_control") {
            await trialRejectControl(page, control, selectedRecipe);
            actionabilityError = undefined;
          } else {
            const actionability = await waitForLocatorVerifiedGeometry(control, 1_000);
            if (!actionability) throw new Error("Verified Reject geometry actionability timeout.");
            actionabilityError = undefined;
            useVerifiedGeometryDispatch = true;
            interactionDiagnostics.click.actionability = actionability;
            limitations.push("action_dispatch_verified_geometry_fallback");
          }
        } catch (error) {
          actionabilityError = error;
        }
      }
    }
    if (
      actionabilityError &&
      classifyClickFailure(actionabilityError) === "actionability_timeout"
    ) {
      const actionability = await inspectLocatorActionability(control);
      if (locatorActionabilitySupportsVerifiedDispatch(actionability)) {
        actionabilityError = undefined;
        useVerifiedGeometryDispatch = true;
        interactionDiagnostics.click.actionability = actionability;
        if (!limitations.includes("action_dispatch_verified_geometry_fallback")) {
          limitations.push("action_dispatch_verified_geometry_fallback");
        }
      }
    }
    if (actionabilityError) {
      const actionability = await inspectLocatorActionability(control);
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
        postActionStorage: await captureStorage(context, page, observationTargetUrl, limitations).catch(() => []),
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
    if (
      Date.now() - preActionCapturedAtEpochMs >
        POST_REFUSAL_PRE_ACTION_BASELINE_MAX_AGE_MS
    ) {
      const refreshedPreActionStorage = await captureStorage(
        context,
        page,
        observationTargetUrl,
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
    const proofResolution = await buildConsentActionControlProof({
      action: "reject",
      ...(authorizedExactTargetUrl
        ? { authorizedTargetSha256: hashValue(normalizeTargetUrl(authorizedExactTargetUrl)) }
        : {}),
      ...(selectedRecipe.cmpId ? { cmpId: selectedRecipe.cmpId } : {}),
      ...(selectedRecipe.preActionRequirement?.kind === "necessary_only_preferences_selected" &&
        selectedRecipe.controlExpectedNormalizedLabel
        ? {
            canonicalNecessaryOnly: {
              expectedNormalizedLabel: selectedRecipe.controlExpectedNormalizedLabel,
            },
          }
        : {}),
      control,
      ...(selectedRecipe.controlFrameUrl
        ? { controlFrameUrl: selectedRecipe.controlFrameUrl }
        : {}),
      ...(selectedRecipe.accessibleControl
        ? { expectedAccessibleControl: selectedRecipe.accessibleControl }
        : {}),
      observedAtMs: elapsed(parentScanStartedAtMs),
      page,
      recipeId: selectedRecipe.recipeId,
      selectorHint: selectedRecipe.controlSelector,
    });
    if (proofResolution.status !== "verified") {
      limitations.push(proofResolution.status, proofResolution.reason);
      return await finalize({
        resolverFound: false,
        resolverReason: proofResolution.status,
        registration: unconfirmedRegistration("not_attempted", proofResolution.status),
        preActionCapturedAtMs,
        preActionStorage,
        requests: classifyRequests(retainedRequests(), parentScanStartedAtMs),
      });
    }
    actionControlProof = proofResolution.proof;
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
      await dispatchRejectControl(
        page,
        control,
        selectedRecipe,
        useVerifiedGeometryDispatch,
      );
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
      clickError === undefined,
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
      if (input.retainResolverDiagnostics && input.outDir) {
        const postActionGeometry = await captureConsentControlGeometry(page, {
          candidateLimit: 48,
          containerLimit: 16,
          timeoutMs: 750,
        }).catch(() => undefined);
        if (postActionGeometry) {
          await mkdir(input.outDir, { recursive: true }).then(() => writeFile(
            path.join(input.outDir!, "PostRefusalPostActionGeometry.json"),
            `${JSON.stringify(postActionGeometry, null, 2)}\n`,
            "utf8",
          )).catch(() => {
            limitations.push("post_action_geometry_diagnostic_write_failed");
          });
        }
      }
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
        postActionStorage: await captureStorage(context, page, observationTargetUrl, limitations).catch(() => []),
        requests: classifyRequests(retainedRequests(), parentScanStartedAtMs),
      });
    }

    const confirmedRefusalRegisteredAtEpochMs = Date.now();
    refusalRegisteredAtEpochMs = confirmedRefusalRegisteredAtEpochMs;
    graphCapture?.confirmAction(confirmedRefusalRegisteredAtEpochMs);
    void graphCapture?.snapshotStorage();
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
      const bannerRemoved = !await locatorIsVisible(
        page,
        selectedRecipe.bannerSelector,
        selectedRecipe.bannerFrameUrl,
      );
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
          targetUrl: observationTargetUrl,
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
    const postActionStorage = await captureStorage(context, page, observationTargetUrl, limitations, graphCapture?.cookies);
    void graphCapture?.snapshotStorage();
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
        observationTargetUrl,
        postActionStorage,
      ))
      .filter((write): write is PostRefusalStorageWrite => Boolean(write))
      .map((write) => ({ ...write, evidenceSource: "instrumented_write" as const }));
    const snapshotDeltaWrites = storageSnapshotDeltaWrites({
      before: preActionStorage,
      after: postActionStorage,
      instrumentedHostname: new URL(observationTargetUrl).hostname,
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
    finishOptionalRuntimeGraph(graphCapture, "post_reject", "action_capture_closed");
    actionDiscovery?.dispose();
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
  onCookies?: (cookies: unknown[]) => void,
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
  onCookies?.(cookies);
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
  postActionStorage: PostRefusalStorageItem[],
): PostRefusalStorageWrite | undefined {
  if (!write.name) return undefined;
  const hostname = new URL(targetUrl).hostname;
  const vendor = write.storageType === "cookie"
    ? vendorFor({ type: "cookie", cookieName: write.name, hostname })
    : vendorFor({ type: "cmp_runtime", storageKey: write.name, hostname });
  const exactIdentity = resolveInstrumentedWriteStorageIdentity({
    hostname,
    name: write.name,
    postActionStorage,
    storageType: write.storageType,
  });
  return {
    storageType: write.storageType,
    name: write.name.slice(0, 180),
    hostname: exactIdentity?.hostname ?? hostname,
    ...(exactIdentity ? { storageIdentityHash: exactIdentity.identityHash } : {}),
    observedAtMs: elapsed(scanStartedAtMs, write.observedAtEpochMs),
    msOffsetFromRefusal: Math.max(0, Math.round(write.observedAtEpochMs - refusalRegisteredAtEpochMs)),
    ...(vendor ? { vendor: vendor.vendor, purpose: vendor.purpose } : {}),
    nonEssential: vendor ? NON_ESSENTIAL_PURPOSES.has(vendor.purpose) : false,
  };
}

export function resolveInstrumentedWriteStorageIdentity(input: {
  hostname: string;
  name: string;
  postActionStorage: PostRefusalStorageItem[];
  storageType: PostRefusalStorageItem["storageType"];
}): { hostname: string; identityHash: string } | undefined {
  const matchingItems = input.postActionStorage.filter((item) =>
    item.storageType === input.storageType &&
    item.name === input.name &&
    Boolean(item.identityHash) &&
    (
      input.storageType !== "cookie" ||
      !item.hostname ||
      sameSiteHostname(input.hostname, item.hostname)
    )
  );
  const identityHashes = [...new Set(matchingItems.map((item) => item.identityHash!))];
  if (identityHashes.length !== 1) return undefined;
  const retainedItem = matchingItems.find((item) => item.identityHash === identityHashes[0]);
  return retainedItem?.hostname
    ? { hostname: retainedItem.hostname, identityHash: identityHashes[0]! }
    : undefined;
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
      ...(item.identityHash ? { storageIdentityHash: item.identityHash } : {}),
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
      ...(write.storageIdentityHash
        ? { storageIdentityHash: write.storageIdentityHash }
        : {}),
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
      diagnosticGeometry?: ConsentControlGeometryArtifact;
    }
  | {
      status: "not_found" | "ambiguous" | "aborted";
      diagnosticGeometry?: ConsentControlGeometryArtifact;
    };

type ResolverDiagnosticSnapshot = {
  source: "named_recipe" | "canonical_geometry";
  state:
    | "document_loading"
    | "scope_ambiguous"
    | "selector_absent"
    | "precondition_unsatisfied"
    | "control_hidden"
    | "control_disabled"
    | "label_mismatch"
    | "single_actionable"
    | "multiple_actionable"
    | "geometry_unavailable"
    | "canonical_reject_absent";
  selectorMatchCount: number;
  visibleCount: number;
  enabledCount: number;
  labelMatchCount: number;
  actionableCount: number;
  cmpIds: string[];
  controlLabels: string[];
};

type ResolverDiagnosticReporter = (snapshot: ResolverDiagnosticSnapshot) => void;

function emptyResolverSnapshot(
  source: ResolverDiagnosticSnapshot["source"],
  state: ResolverDiagnosticSnapshot["state"],
): ResolverDiagnosticSnapshot {
  return {
    source,
    state,
    selectorMatchCount: 0,
    visibleCount: 0,
    enabledCount: 0,
    labelMatchCount: 0,
    actionableCount: 0,
    cmpIds: [],
    controlLabels: [],
  };
}

type SelectorScopeResolution =
  | { status: "found"; scope: Page | Frame }
  | { status: "not_found" }
  | { status: "ambiguous" };

function exactSelectorScope(
  page: Page,
  childFrameUrl: string | undefined,
): SelectorScopeResolution {
  if (!childFrameUrl) return { status: "found", scope: page };
  const matchingFrames = page.frames().filter((frame) =>
    frame !== page.mainFrame() && frame.url() === childFrameUrl
  );
  if (matchingFrames.length === 0) return { status: "not_found" };
  if (matchingFrames.length > 1) return { status: "ambiguous" };
  return { status: "found", scope: matchingFrames[0]! };
}

async function trialRejectControl(
  page: Page,
  control: Locator,
  recipe: PostRefusalActionRecipe,
) {
  if (recipe.accessibleControl?.kind === "closed_shadow_accessible_control") {
    if (!await closedShadowAccessibleControlAvailable(page, recipe.accessibleControl)) {
      throw new Error("Closed-shadow Reject control is not uniquely actionable.");
    }
    return;
  }
  await control.click({ trial: true, timeout: 1_000 });
}

async function dispatchRejectControl(
  page: Page,
  control: Locator,
  recipe: PostRefusalActionRecipe,
  useVerifiedGeometryDispatch = false,
) {
  if (recipe.accessibleControl?.kind === "closed_shadow_accessible_control") {
    await dispatchClosedShadowAccessibleControl(page, recipe.accessibleControl);
    return;
  }
  if (useVerifiedGeometryDispatch) {
    await dispatchLocatorClickWithVerifiedGeometry(control);
    return;
  }
  await control.click({ timeout: 2_000 });
}

async function captureRecipeRuntimeUrls(
  page: Page,
  discovery?: ConsentActionDiscovery,
) {
  if (discovery) return discovery.runtimeUrls();
  return page.evaluate(() => [
    ...Array.from(document.scripts, (script) => script.src).filter(Boolean),
    ...performance.getEntriesByType("resource").map((entry) => entry.name),
  ]).catch(() => [] as string[]);
}

async function resolveActiveRuntimeRecipes(
  page: Page,
  recipes: PostRefusalActionRecipe[],
  discovery?: ConsentActionDiscovery,
) {
  const runtimeUrls = await captureRecipeRuntimeUrls(page, discovery);
  const matches = recipes.filter((recipe) => {
    const sources = recipe.runtimeUrlPatternSources;
    if (!sources?.length) return false;
    return sources.some((source) => {
      try {
        const pattern = new RegExp(source, "i");
        return runtimeUrls.some((url) => pattern.test(url));
      } catch {
        return false;
      }
    });
  });
  const cmpIds = new Set(matches.map((recipe) => recipe.cmpId).filter(Boolean));
  return cmpIds.size === 1 ? matches : [];
}

function normalizeControlLabel(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function scopedAncestorSelector(selector: string): string | undefined {
  let bracketDepth = 0;
  let quote: "\"" | "'" | undefined;
  let escaped = false;
  let lastDescendantBoundary = -1;
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === "[") bracketDepth += 1;
    else if (character === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (/\s/.test(character) && bracketDepth === 0) lastDescendantBoundary = index;
  }
  if (lastDescendantBoundary <= 0) return undefined;
  const ancestor = selector.slice(0, lastDescendantBoundary).trim();
  return ancestor || undefined;
}

async function normalizedLocatorLabels(locator: Locator) {
  const handle = await locator.elementHandle({ timeout: 100 }).catch(() => undefined);
  if (!handle) return [];
  try {
    const labels = await handle.evaluate((element) => {
      const htmlElement = element as HTMLElement;
      return [
        element.getAttribute("aria-label"),
        "value" in htmlElement && typeof (htmlElement as HTMLInputElement).value === "string"
          ? (htmlElement as HTMLInputElement).value
          : undefined,
        htmlElement.innerText,
        element.textContent,
        element.getAttribute("title"),
      ].filter((value): value is string => Boolean(value?.trim()));
    }).catch(() => [] as string[]);
    return [...new Set(labels.map(normalizeControlLabel).filter(Boolean))];
  } finally {
    await handle.dispose().catch(() => undefined);
  }
}

function collapseEquivalentCanonicalRejectCandidates(
  input: ConsentControlCandidateEvidence[],
): ConsentControlCandidateEvidence[] {
  const exactCandidates = [...new Map(input.map((candidate) => [
    [candidate.frameContext.frameUrl, candidate.selectorHint].join("\n"),
    candidate,
  ])).values()];
  const groups = new Map<string, ConsentControlCandidateEvidence[]>();
  for (const candidate of exactCandidates) {
    const key = [
      candidate.frameContext.frameUrl,
      candidate.normalizedLabel,
      candidate.containerSelectorHint ?? "",
    ].join("\n");
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }

  return [...groups.values()].flatMap((candidates) => {
    if (candidates.length < 2 || !candidates[0]?.containerSelectorHint) return candidates;
    const interactiveCandidates = candidates.filter((candidate) =>
      candidate.tagName.toLowerCase() === "button" ||
      candidate.tagName.toLowerCase() === "input" ||
      candidate.role?.toLowerCase() === "button"
    );
    // Some CMPs expose both the actual button and its nested text label as
    // geometry candidates. Collapse only when one unique interactive ancestor
    // represents the exact same label, frame, and consent container. Distinct
    // buttons remain ambiguous and fail closed.
    return interactiveCandidates.length === 1 ? interactiveCandidates : candidates;
  });
}

export async function waitForPassiveRedirectSettle(
  page: Page,
  timeoutMs: number,
  signal?: AbortSignal,
) {
  const boundedTimeoutMs = Math.max(250, Math.min(timeoutMs, 5_000));
  const stableWindowMs = Math.min(1_500, Math.max(500, boundedTimeoutMs - 250));
  const deadlineAtMs = Date.now() + boundedTimeoutMs;
  let stableUrl = page.url();
  let stableSinceMs = Date.now();
  do {
    if (signal?.aborted) return false;
    const currentUrl = page.url();
    if (currentUrl !== stableUrl) {
      stableUrl = currentUrl;
      stableSinceMs = Date.now();
    }
    if (
      /^https:\/\//i.test(currentUrl) &&
      Date.now() - stableSinceMs >= stableWindowMs
    ) return true;
    if (Date.now() >= deadlineAtMs) break;
    await waitForDelay(
      Math.min(50, Math.max(0, deadlineAtMs - Date.now())),
      signal,
    ).catch(() => undefined);
  } while (Date.now() <= deadlineAtMs);
  return false;
}

async function waitForDeterministicRecipe(
  page: Page,
  recipes: PostRefusalActionRecipe[],
  timeoutMs: number,
  signal?: AbortSignal,
  reportDiagnostic?: ResolverDiagnosticReporter,
  discovery?: ConsentActionDiscovery,
): Promise<DeterministicRecipeResolution> {
  const deadlineAtMs = Date.now() + timeoutMs;
  let stableRecipeId: string | undefined;
  let stableSinceMs = 0;
  let sawAmbiguousActionableSet = false;
  let prioritizedRecipeId: string | undefined;
  do {
    if (signal?.aborted) return { status: "aborted" };
    const attemptRevision = discovery?.revision ?? 0;
    const documentInteractive = await page.evaluate(() => document.readyState !== "loading")
      .catch(() => false);
    if (!documentInteractive) {
      reportDiagnostic?.(emptyResolverSnapshot("named_recipe", "document_loading"));
      stableRecipeId = undefined;
      stableSinceMs = 0;
      if (Date.now() >= deadlineAtMs) break;
      await waitForDelay(
        Math.min(25, Math.max(0, deadlineAtMs - Date.now())),
        signal,
      ).catch(() => undefined);
      continue;
    }
    const actionable: Array<{ recipe: PostRefusalActionRecipe; control: Locator }> = [];
    let selectorMatchCount = 0;
    let visibleCount = 0;
    let enabledCount = 0;
    let labelMatchCount = 0;
    let viewportHitTargetCount = 0;
    let preconditionUnsatisfied = false;
    let scopeAmbiguous = false;
    const viewportPendingRecipeIds: string[] = [];
    const matchedCmpIds = new Set<string>();
    const matchedControlLabels = new Set<string>();
    const recipesForAttempt = prioritizedRecipeId
      ? recipes.filter((recipe) => recipe.recipeId === prioritizedRecipeId)
      : recipes;
    for (const recipe of recipesForAttempt) {
      const scopeResolution = exactSelectorScope(page, recipe.controlFrameUrl);
      if (scopeResolution.status === "ambiguous") {
        scopeAmbiguous = true;
        continue;
      }
      if (scopeResolution.status === "not_found") continue;
      if (recipe.accessibleControl?.kind === "scoped_accessible_control") {
        const control = await resolveScopedAccessibleControl(
          scopeResolution.scope,
          recipe.accessibleControl,
        );
        if (control) {
          selectorMatchCount += 1;
          visibleCount += 1;
          enabledCount += 1;
          labelMatchCount += 1;
          if (recipe.cmpId) matchedCmpIds.add(recipe.cmpId);
          matchedControlLabels.add(recipe.accessibleControl.intent);
          if (
            !cmpRecipeRequiresViewportHitTarget(recipe.cmpId) ||
            await locatorHasViewportHitTarget(control)
          ) {
            viewportHitTargetCount += 1;
            actionable.push({ recipe, control });
          } else {
            viewportPendingRecipeIds.push(recipe.recipeId);
          }
        }
        continue;
      }
      if (recipe.accessibleControl?.kind === "closed_shadow_accessible_control") {
        if (scopeResolution.scope !== page) continue;
        const host = page.locator(recipe.accessibleControl.scopeSelector);
        if (
          await host.count().catch(() => 0) === 1 &&
          await host.first().isVisible().catch(() => false) &&
          await closedShadowAccessibleControlAvailable(page, recipe.accessibleControl)
        ) {
          selectorMatchCount += 1;
          visibleCount += 1;
          enabledCount += 1;
          labelMatchCount += 1;
          if (recipe.cmpId) matchedCmpIds.add(recipe.cmpId);
          matchedControlLabels.add(recipe.accessibleControl.intent);
          actionable.push({ recipe, control: host.first() });
        }
        continue;
      }
      const controls = scopeResolution.scope.locator(recipe.controlSelector);
      const count = Math.min(await controls.count().catch(() => 0), 8);
      selectorMatchCount += count;
      if (count > 0) {
        if (recipe.cmpId) matchedCmpIds.add(recipe.cmpId);
        if (recipe.controlExpectedNormalizedLabel) {
          matchedControlLabels.add(recipe.controlExpectedNormalizedLabel);
        }
      }
      if (!await preActionRequirementSatisfied(scopeResolution.scope, recipe)) {
        if (count > 0) preconditionUnsatisfied = true;
        continue;
      }
      for (let index = 0; index < count; index += 1) {
        const control = controls.nth(index);
        const visible = await control.isVisible().catch(() => false);
        const enabled = await control.isEnabled().catch(() => false);
        const labelMatches = !recipe.controlExpectedNormalizedLabel ||
          (await normalizedLocatorLabels(control)).includes(recipe.controlExpectedNormalizedLabel);
        if (visible) visibleCount += 1;
        if (enabled) enabledCount += 1;
        if (labelMatches) labelMatchCount += 1;
        if (visible && enabled && labelMatches) {
          if (
            !cmpRecipeRequiresViewportHitTarget(recipe.cmpId) ||
            await locatorHasViewportHitTarget(control)
          ) {
            viewportHitTargetCount += 1;
            actionable.push({ recipe, control });
          } else {
            viewportPendingRecipeIds.push(recipe.recipeId);
          }
        }
      }
    }
    const diagnosticState: ResolverDiagnosticSnapshot["state"] = scopeAmbiguous
      ? "scope_ambiguous"
      : actionable.length > 1
        ? "multiple_actionable"
        : actionable.length === 1
          ? "single_actionable"
          : selectorMatchCount === 0
            ? "selector_absent"
            : preconditionUnsatisfied
              ? "precondition_unsatisfied"
              : visibleCount === 0
                ? "control_hidden"
                : enabledCount === 0
                  ? "control_disabled"
                  : labelMatchCount === 0
                    ? "label_mismatch"
                    : viewportHitTargetCount === 0
                      ? "geometry_unavailable"
                      : "selector_absent";
    reportDiagnostic?.({
      source: "named_recipe",
      state: diagnosticState,
      selectorMatchCount,
      visibleCount,
      enabledCount,
      labelMatchCount,
      actionableCount: actionable.length,
      cmpIds: [...matchedCmpIds].slice(0, 8),
      controlLabels: [...matchedControlLabels].slice(0, 4),
    });
    if (scopeAmbiguous) return { status: "ambiguous" };
    if (actionable.length > 1) {
      sawAmbiguousActionableSet = true;
      stableRecipeId = undefined;
      stableSinceMs = 0;
      if (Date.now() >= deadlineAtMs) return { status: "ambiguous" };
      await waitForDelay(
        Math.min(25, Math.max(0, deadlineAtMs - Date.now())),
        signal,
      ).catch(() => undefined);
      continue;
    }
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
      // Preserve every exact actionability requirement. This merely avoids
      // rescanning the full CMP recipe registry while one uniquely identified
      // animated control is waiting to become a viewport hit target.
      prioritizedRecipeId = viewportPendingRecipeIds.length === 1
        ? viewportPendingRecipeIds[0]
        : undefined;
    }
    if (Date.now() >= deadlineAtMs) break;
    const remainingMs = Math.max(0, deadlineAtMs - Date.now());
    const wakeAfterMs = Math.min(prioritizedRecipeId || match ? 25 : 150, remainingMs);
    if (discovery) {
      await discovery.waitForSignal(attemptRevision, wakeAfterMs, signal);
    } else {
      await waitForDelay(Math.min(25, wakeAfterMs), signal).catch(() => undefined);
    }
  } while (Date.now() <= deadlineAtMs);
  return sawAmbiguousActionableSet ? { status: "ambiguous" } : { status: "not_found" };
}

async function preActionRequirementSatisfied(
  scope: Page | Frame,
  recipe: PostRefusalActionRecipe,
): Promise<boolean> {
  const requirement = recipe.preActionRequirement;
  if (!requirement) return true;
  if (requirement.kind !== "necessary_only_preferences_selected") return false;
  const required = scope.locator(requirement.requiredCheckedSelector);
  const requiredCount = await required.count().catch(() => 0);
  if (requiredCount !== 1 || !await required.first().isChecked().catch(() => false)) return false;
  return await scope.locator(requirement.disallowedCheckedSelector).count().catch(() => 1) === 0;
}

async function waitForDeterministicOrCanonicalRecipe(
  page: Page,
  recipes: PostRefusalActionRecipe[],
  timeoutMs: number,
  signal?: AbortSignal,
  reportDiagnostic?: ResolverDiagnosticReporter,
  discovery?: ConsentActionDiscovery,
): Promise<DeterministicRecipeResolution> {
  const deadlineAtMs = Date.now() + timeoutMs;
  // Network events identify one canonical CMP before selector resolution when
  // possible. Resolve its live, canonically classified first-layer control
  // before consulting the registered selector. The named recipe still owns
  // semantic confirmation; its selector is now a bounded fallback for pages
  // whose live geometry cannot be retained.
  const activeRuntimeRecipes = await resolveActiveRuntimeRecipes(page, recipes, discovery);
  if (activeRuntimeRecipes.length > 0) {
    const canonicalBudgetMs = Math.min(1_000, Math.max(0, deadlineAtMs - Date.now()));
    if (canonicalBudgetMs > 0 && activeRuntimeRecipes.length === 1) {
      const canonicalResolution = await waitForCanonicalRejectControlRecipe(
        page,
        canonicalBudgetMs,
        signal,
        activeRuntimeRecipes,
        reportDiagnostic,
        discovery,
        activeRuntimeRecipes.length === 1 ? activeRuntimeRecipes[0] : undefined,
      );
      if (
        canonicalResolution.status === "found" ||
        canonicalResolution.status === "aborted" ||
        canonicalResolution.status === "ambiguous"
      ) return canonicalResolution;
    }
    return waitForDeterministicRecipe(
      page,
      activeRuntimeRecipes,
      Math.max(0, deadlineAtMs - Date.now()),
      signal,
      reportDiagnostic,
      discovery,
    );
  }

  let diagnosticGeometry: ConsentControlGeometryArtifact | undefined;
  let sawAmbiguousResolution = false;
  // A production worker receives the bounded canonical registry, not one
  // site-specific recipe. Run one canonical geometry pass before the full
  // selector sweep can consume the short named slice. This remains within the
  // existing resolver deadline and is the canonical non-CMP best-attempt path.
  if (recipes.length > 1) {
    const initialCanonicalBudgetMs = Math.min(1_000, Math.max(0, deadlineAtMs - Date.now()));
    if (initialCanonicalBudgetMs > 0) {
      const initialCanonicalResolution = await waitForCanonicalRejectControlRecipe(
        page,
        initialCanonicalBudgetMs,
        signal,
        recipes,
        reportDiagnostic,
        discovery,
      );
      diagnosticGeometry = initialCanonicalResolution.diagnosticGeometry ?? diagnosticGeometry;
      if (
        initialCanonicalResolution.status === "found" ||
        initialCanonicalResolution.status === "aborted"
      ) return initialCanonicalResolution;
      if (initialCanonicalResolution.status === "ambiguous") sawAmbiguousResolution = true;
    }
  }
  do {
    if (signal?.aborted) return { status: "aborted" };
    const newlyActiveRuntimeRecipes = await resolveActiveRuntimeRecipes(page, recipes, discovery);
    if (newlyActiveRuntimeRecipes.length > 0) {
      return waitForDeterministicRecipe(
        page,
        newlyActiveRuntimeRecipes,
        Math.max(0, deadlineAtMs - Date.now()),
        signal,
        reportDiagnostic,
        discovery,
      );
    }
    // The canonical path is the primary live-control resolver. Probe legacy
    // selectors briefly rather than letting an absent selector consume a
    // quarter of short action budgets before geometry is inspected.
    const namedBudgetMs = Math.min(50, Math.max(0, deadlineAtMs - Date.now()));
    const namedResolution = await waitForDeterministicRecipe(
      page,
      recipes,
      namedBudgetMs,
      signal,
      reportDiagnostic,
      discovery,
    );
    if (namedResolution.status === "found" || namedResolution.status === "aborted") {
      return namedResolution;
    }
    if (namedResolution.status === "ambiguous") sawAmbiguousResolution = true;

    // Geometry capture has its own bounded browser evaluation. Give one pass
    // enough of the existing resolver budget to complete instead of repeatedly
    // timing it out in 300 ms slices. This does not extend the outer deadline.
    const canonicalBudgetMs = Math.min(750, Math.max(0, deadlineAtMs - Date.now()));
    if (canonicalBudgetMs <= 0) break;
    const canonicalResolution = await waitForCanonicalRejectControlRecipe(
      page,
      canonicalBudgetMs,
      signal,
      recipes,
      reportDiagnostic,
      discovery,
    );
    diagnosticGeometry = canonicalResolution.diagnosticGeometry ?? diagnosticGeometry;
    if (canonicalResolution.status === "found" || canonicalResolution.status === "aborted") {
      return canonicalResolution;
    }
    if (canonicalResolution.status === "ambiguous") sawAmbiguousResolution = true;
  } while (Date.now() < deadlineAtMs);
  // Canonical geometry capture can consume the final slice of the bounded
  // search window. Re-check the named CMP selectors once without waiting so a
  // control that surfaced during that capture is not lost at the deadline.
  const finalNamedResolution = await waitForDeterministicRecipe(
    page,
    recipes,
    0,
    signal,
    reportDiagnostic,
    discovery,
  );
  if (finalNamedResolution.status === "found" || finalNamedResolution.status === "aborted") {
    return {
      ...finalNamedResolution,
      ...(diagnosticGeometry ? { diagnosticGeometry } : {}),
    };
  }
  if (finalNamedResolution.status === "ambiguous") sawAmbiguousResolution = true;
  return {
    status: sawAmbiguousResolution ? "ambiguous" : "not_found",
    ...(diagnosticGeometry ? { diagnosticGeometry } : {}),
  };
}

async function waitForCanonicalRejectControlRecipe(
  page: Page,
  timeoutMs: number,
  signal?: AbortSignal,
  registeredRecipes: PostRefusalActionRecipe[] = [],
  reportDiagnostic?: ResolverDiagnosticReporter,
  discovery?: ConsentActionDiscovery,
  runtimeBoundRecipe?: PostRefusalActionRecipe,
): Promise<DeterministicRecipeResolution> {
  const deadlineAtMs = Date.now() + timeoutMs;
  let diagnosticGeometry: ConsentControlGeometryArtifact | undefined;
  let sawAmbiguousCanonicalControl = false;
  do {
    if (signal?.aborted) return { status: "aborted" };
    const attemptRevision = discovery?.revision ?? 0;
    const geometry = await captureConsentControlGeometry(page, {
      candidateLimit: 48,
      containerLimit: 16,
      timeoutMs: Math.max(250, Math.min(750, timeoutMs || 250)),
    }).catch(() => undefined);
    diagnosticGeometry = geometry ?? diagnosticGeometry;
    const geometryRegisteredCmpRecipe = selectCanonicalRejectConfirmationRecipe(
      registeredRecipes,
      geometry?.cmp.name,
    ) ?? runtimeBoundRecipe;
    const geometryCmpDefinition = geometry?.cmp.name
      ? KNOWN_CMP_REGISTRY.find((definition) =>
          definition.canonicalName.toLowerCase() === geometry.cmp.name?.toLowerCase()
        )
      : undefined;
    const retainedCandidates = collapseEquivalentCanonicalRejectCandidates(geometry?.candidates.filter((candidate) =>
      candidate.actionType === "reject_all" &&
      candidate.decisionStatus === "confirmed_visible" &&
      candidate.layer === "first_layer" &&
      candidate.enabled &&
      candidate.intersectsViewport &&
      candidate.classifierConfidence >= 0.8 &&
      (candidate.consentContextConfirmed || geometryRegisteredCmpRecipe !== undefined) &&
      Boolean(candidate.selectorHint)
    ) ?? []);
    const containerBoundCandidates = retainedCandidates.filter((candidate) =>
      Boolean(candidate.containerSelectorHint)
    );
    // Prefer an explicitly retained first-layer consent container when the
    // only competing candidates are unscoped page controls. Multiple scoped
    // Reject candidates remain ambiguous and fail closed.
    const candidates = containerBoundCandidates.length > 0
      ? containerBoundCandidates
      : retainedCandidates;
    reportDiagnostic?.({
      source: "canonical_geometry",
      state: !geometry
        ? "geometry_unavailable"
        : candidates.length > 1
          ? "multiple_actionable"
          : candidates.length === 1
            ? "single_actionable"
            : "canonical_reject_absent",
      selectorMatchCount: Math.min(geometry?.candidates.length ?? 0, 64),
      visibleCount: Math.min(geometry?.candidates.filter((candidate) =>
        candidate.decisionStatus === "confirmed_visible"
      ).length ?? 0, 64),
      enabledCount: Math.min(geometry?.candidates.filter((candidate) => candidate.enabled).length ?? 0, 64),
      labelMatchCount: Math.min(retainedCandidates.length, 64),
      actionableCount: Math.min(candidates.length, 64),
      cmpIds: geometry?.cmp.name ? [geometry.cmp.name] : [],
      controlLabels: [...new Set(candidates.map((candidate) => candidate.normalizedLabel))].slice(0, 4),
    });
    if (candidates.length > 1) {
      sawAmbiguousCanonicalControl = true;
      if (Date.now() >= deadlineAtMs) break;
      const waitMs = Math.min(150, Math.max(0, deadlineAtMs - Date.now()));
      if (discovery) await discovery.waitForSignal(attemptRevision, waitMs, signal);
      else await waitForDelay(Math.min(50, waitMs), signal).catch(() => undefined);
      continue;
    }
    const candidate = candidates[0];
    if (candidate) {
      const controlFrameUrl = candidate.frameContext.frameKind === "child_frame"
        ? candidate.frameContext.frameUrl
        : undefined;
      const scopeResolution = exactSelectorScope(page, controlFrameUrl);
      if (scopeResolution.status === "ambiguous") {
        sawAmbiguousCanonicalControl = true;
        if (Date.now() >= deadlineAtMs) break;
        const waitMs = Math.min(150, Math.max(0, deadlineAtMs - Date.now()));
        if (discovery) await discovery.waitForSignal(attemptRevision, waitMs, signal);
        else await waitForDelay(Math.min(50, waitMs), signal).catch(() => undefined);
        continue;
      }
      if (scopeResolution.status === "not_found") continue;
      const containerSelector = candidate.containerSelectorHint;
      const containers = containerSelector
        ? scopeResolution.scope.locator(containerSelector)
        : undefined;
      const containerCount = containers
        ? await containers.count().catch(() => 0)
        : 0;
      const scopedControlSelector = containerSelector && containerCount === 1
        ? candidate.selectorHint === containerSelector ||
          candidate.selectorHint.startsWith(`${containerSelector} `)
          ? candidate.selectorHint
          : `${containerSelector} ${candidate.selectorHint}`
        : candidate.selectorHint;
      const controls = scopeResolution.scope.locator(scopedControlSelector);
      const controlCount = await controls.count().catch(() => 0);
      if (controlCount > 8) return {
        status: "ambiguous",
        ...(diagnosticGeometry ? { diagnosticGeometry } : {}),
      };
      const actionableControls: Locator[] = [];
      for (let index = 0; index < controlCount; index += 1) {
        const control = controls.nth(index);
        if (
          await control.isVisible().catch(() => false) &&
          await control.isEnabled().catch(() => false) &&
          (await normalizedLocatorLabels(control)).includes(candidate.normalizedLabel) &&
          await locatorHasViewportHitTarget(control)
        ) actionableControls.push(control);
      }
      if (actionableControls.length > 1) {
        sawAmbiguousCanonicalControl = true;
        if (Date.now() >= deadlineAtMs) break;
        const waitMs = Math.min(150, Math.max(0, deadlineAtMs - Date.now()));
        if (discovery) await discovery.waitForSignal(attemptRevision, waitMs, signal);
        else await waitForDelay(Math.min(50, waitMs), signal).catch(() => undefined);
        continue;
      }
      if (actionableControls.length !== 1) continue;
      let visibleContainerCount = 0;
      for (let index = 0; index < Math.min(containerCount, 8); index += 1) {
        if (await containers!.nth(index).isVisible().catch(() => false)) visibleContainerCount += 1;
      }
      let candidateTransitionSurfaceSelector = candidate.selectorHint;
      if (
        containerSelector &&
        containerCount <= 8 &&
        (visibleContainerCount === 1 || containerCount === 1)
      ) {
        candidateTransitionSurfaceSelector = containerSelector;
      } else if (!containerSelector) {
        const scopedAncestor = scopedAncestorSelector(candidate.selectorHint);
        if (
          scopedAncestor &&
          await scopeResolution.scope.locator(scopedAncestor).count().catch(() => 0) === 1
        ) {
          candidateTransitionSurfaceSelector = scopedAncestor;
        }
      }
      const useMainFrameCmpSurface = !containerSelector &&
        Boolean(geometryCmpDefinition?.domSelectors?.length);
      const transitionSurfaceSelector = useMainFrameCmpSurface
        ? geometryCmpDefinition!.domSelectors!.join(", ")
        : candidateTransitionSurfaceSelector;
      const bannerFrameUrl = useMainFrameCmpSurface ? undefined : controlFrameUrl;
      const registeredCmpRecipe = geometryRegisteredCmpRecipe;
      const recipe: PostRefusalActionRecipe = {
        artifactVersion: "certscore.post_refusal_action_recipe.v1",
        recipeId: `canonical-control:reject:v2:${hashValue([
          candidate.normalizedLabel,
          candidate.selectorHint,
          transitionSurfaceSelector,
          controlFrameUrl ?? "main_frame",
          registeredCmpRecipe?.recipeId ?? "generic_confirmation",
        ].join("\n")).slice(0, 24)}`,
        ...(registeredCmpRecipe?.cmpId
          ? { cmpId: registeredCmpRecipe.cmpId }
          : geometry?.cmp.name
            ? { cmpId: geometry.cmp.name }
            : {}),
        resolverMethod: registeredCmpRecipe?.resolverMethod ??
          "canonical_consent_control_registry_recipe",
        controlSelector: scopedControlSelector,
        controlExpectedNormalizedLabel: candidate.normalizedLabel,
        ...(controlFrameUrl ? { controlFrameUrl } : {}),
        bannerSelector: transitionSurfaceSelector,
        ...(bannerFrameUrl ? { bannerFrameUrl } : {}),
        confirmation: registeredCmpRecipe?.confirmation ?? {
            kind: "canonical_reject_transition",
            controlSelector: scopedControlSelector,
            ...(controlFrameUrl ? { controlFrameUrl } : {}),
            bannerSelector: transitionSurfaceSelector,
            ...(bannerFrameUrl ? { bannerFrameUrl } : {}),
          },
      };
      const resolved = await waitForDeterministicRecipe(
        page,
        [recipe],
        100,
        signal,
        reportDiagnostic,
        discovery,
      );
      if (resolved.status === "ambiguous") {
        sawAmbiguousCanonicalControl = true;
      } else if (resolved.status !== "not_found") return {
          ...resolved,
          ...(diagnosticGeometry ? { diagnosticGeometry } : {}),
        };
    }
    if (Date.now() >= deadlineAtMs) break;
    const waitMs = Math.min(150, Math.max(0, deadlineAtMs - Date.now()));
    if (discovery) await discovery.waitForSignal(attemptRevision, waitMs, signal);
    else await waitForDelay(Math.min(50, waitMs), signal).catch(() => undefined);
  } while (Date.now() <= deadlineAtMs);
  return {
    status: sawAmbiguousCanonicalControl ? "ambiguous" : "not_found",
    ...(diagnosticGeometry ? { diagnosticGeometry } : {}),
  };
}

function selectCanonicalRejectConfirmationRecipe(
  registeredRecipes: PostRefusalActionRecipe[],
  detectedCmpName?: string,
): PostRefusalActionRecipe | undefined {
  if (detectedCmpName) {
    const detectedMatches = registeredRecipes.filter((recipe) =>
      recipe.cmpId?.toLowerCase() === detectedCmpName.toLowerCase()
    );
    if (detectedMatches.length === 1) return detectedMatches[0];
  }
  return undefined;
}

const POST_REFUSAL_RECIPE_CANDIDATE_MAX = 24;

function validatedActionRecipes(input: PostRefusalObserverInput): PostRefusalActionRecipe[] {
  const recipes = input.recipeCandidates?.length ? input.recipeCandidates : [input.recipe];
  if (recipes.length > POST_REFUSAL_RECIPE_CANDIDATE_MAX) {
    throw new Error(
      `Post-refusal recipe candidate set exceeds the bounded maximum of ${POST_REFUSAL_RECIPE_CANDIDATE_MAX}.`,
    );
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
    if (
      recipe.controlExpectedNormalizedLabel !== undefined &&
      (
        !recipe.controlExpectedNormalizedLabel.trim() ||
        recipe.controlExpectedNormalizedLabel.length > 240 ||
        recipe.controlExpectedNormalizedLabel !== normalizeControlLabel(recipe.controlExpectedNormalizedLabel)
      )
    ) {
      throw new Error("Post-refusal recipe candidate has an invalid normalized control label.");
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
    if (recipe.preActionRequirement) {
      const selectors = [
        recipe.preActionRequirement.requiredCheckedSelector,
        recipe.preActionRequirement.disallowedCheckedSelector,
      ];
      if (
        recipe.preActionRequirement.kind !== "necessary_only_preferences_selected" ||
        selectors.some((selector) => !selector.trim() || selector.length > 500)
      ) {
        throw new Error("Post-refusal recipe candidate has an invalid pre-action requirement.");
      }
    }
    if (recipe.confirmation.kind === "cmp_cookie_values_equal") {
      const cookies = recipe.confirmation.cookies;
      const identities = cookies.map(cookieExpectationKey);
      if (
        cookies.length === 0 ||
        cookies.length > 8 ||
        cookies.some((cookie) =>
          !cookie.name.trim() || cookie.name.length > 160 ||
          !cookie.path.startsWith("/") || cookie.path.length > 500 ||
          cookie.expectedValue.length > 240
        ) ||
        new Set(identities).size !== identities.length
      ) {
        throw new Error("Post-refusal recipe candidate has invalid canonical CMP refusal cookies.");
      }
    }
    if (
      recipe.confirmation.kind === "cmp_cookie_changed" &&
      (!recipe.confirmation.cookieName.trim() || recipe.confirmation.cookieName.length > 160)
    ) {
      throw new Error("Post-refusal recipe candidate has an invalid canonical CMP consent cookie.");
    }
    const selectorIdentity = [
      recipe.controlSelector,
      recipe.cmpId ?? "",
      ...(recipe.runtimeUrlPatternSources ?? []),
    ].join("\n");
    if (recipeIds.has(recipe.recipeId) || selectors.has(selectorIdentity)) {
      throw new Error("Post-refusal recipe candidates must have unique IDs and selectors.");
    }
    recipeIds.add(recipe.recipeId);
    selectors.add(selectorIdentity);
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
      : recipes.every((recipe) => recipe.resolverMethod === "local_fixture_recipe")
        ? "local_fixture_recipe"
      : "canonical_consent_control_registry_recipe";
}

type CmpCookieValueExpectation = Extract<
  PostRefusalActionRecipe["confirmation"],
  { kind: "cmp_cookie_values_equal" }
>["cookies"][number];

function cookieExpectationKey(expectation: CmpCookieValueExpectation): string {
  return `${expectation.name}\n${expectation.path}`;
}

async function exactCmpCookieStates(
  context: BrowserContext,
  pageUrl: string,
  expectations: CmpCookieValueExpectation[],
) {
  const targetHostname = new URL(pageUrl).hostname.toLowerCase();
  const cookies = await context.cookies(pageUrl);
  return Object.fromEntries(expectations.map((expectation) => {
    const candidates = cookies.filter((cookie) =>
      cookie.name === expectation.name &&
      cookie.path === expectation.path &&
      cookie.domain.toLowerCase().replace(/^\./, "") === targetHostname
    );
    const cookie = candidates.length === 1 ? candidates[0] : undefined;
    if (!cookie) return [cookieExpectationKey(expectation), undefined];
    const identityHash = hashValue(JSON.stringify([
      cookie.name,
      cookie.domain,
      cookie.path,
      cookie.partitionKey ?? "",
    ]));
    const valueHash = hashValue(cookie.value);
    return [cookieExpectationKey(expectation), {
      identityHash,
      stateHash: hashValue(`${identityHash}\n${valueHash}`),
      value: cookie.value,
      valueHash,
    }];
  })) as Record<string, {
    identityHash: string;
    stateHash: string;
    value: string;
    valueHash: string;
  } | undefined>;
}

async function waitForRefusalConfirmation(
  context: BrowserContext,
  page: Page,
  confirmation: PostRefusalActionRecipe["confirmation"],
  baseline: RefusalConfirmationBaseline,
  actionDispatchedAtEpochMs: number,
  timeoutMs: number,
  signal?: AbortSignal,
  allowCanonicalUiTransitionWitness = false,
): Promise<RefusalConfirmationState | undefined> {
  if (confirmation.kind === "canonical_reject_transition") {
    if (
      baseline.kind !== "canonical_reject_transition" ||
      !baseline.controlVisible ||
      !baseline.bannerVisible
    ) return undefined;
    const deadlineAtMs = Date.now() + timeoutMs;
    while (Date.now() <= deadlineAtMs) {
      if (signal?.aborted) return undefined;
      const [controlVisible, bannerVisible, bannerStateHash] = await Promise.all([
        locatorIsVisible(page, confirmation.controlSelector, confirmation.controlFrameUrl),
        canonicalTransitionSurfacePresent(page, confirmation),
        visibleLocatorStateHash(page, confirmation.bannerSelector, confirmation.bannerFrameUrl),
      ]);
      const refusalState = await findCanonicalRefusalStateWrite(
        context,
        page,
        baseline.lastSequence,
        actionDispatchedAtEpochMs,
        baseline.canonicalStorageStateHashes,
      );
      if (
        !controlVisible &&
        normalizeTargetUrl(page.url()) === normalizeTargetUrl(baseline.pageUrl)
      ) {
        if (refusalState) {
          return {
            stateHash: refusalState.stateHash,
            witnessType: "canonical_refusal_state",
            key: refusalState.key,
            expectedState: "canonical_consent_refusal_state_written_after_action",
          };
        }
        if (
          allowCanonicalUiTransitionWitness &&
          confirmation.bannerSelector !== confirmation.controlSelector
        ) {
          const transitionKind = !bannerVisible
            ? "consent_surface_hidden"
            : baseline.bannerStateHash && bannerStateHash &&
                baseline.bannerStateHash !== bannerStateHash
              ? "consent_surface_replaced_with_acknowledgement"
              : undefined;
          if (transitionKind) {
            return {
              stateHash: hashValue(JSON.stringify([
                "canonical_first_layer_reject_ui_transition.v2",
                transitionKind,
                baseline.pageUrl,
                confirmation.controlSelector,
                confirmation.controlFrameUrl ?? "main_frame",
                confirmation.bannerSelector,
                confirmation.bannerFrameUrl ?? "main_frame",
                baseline.bannerStateHash ?? "",
                bannerStateHash ?? "",
              ])),
              witnessType: "canonical_refusal_state",
              expectedState: transitionKind === "consent_surface_hidden"
                ? "canonical_first_layer_reject_control_and_consent_surface_hidden_after_completed_action"
                : "canonical_first_layer_reject_control_hidden_and_consent_surface_replaced_after_completed_action",
            };
          }
        }
      }
      await waitForDelay(25, signal).catch(() => undefined);
    }
    return undefined;
  }

  if (confirmation.kind === "cmp_cookie_values_equal") {
    const deadlineAtMs = Date.now() + timeoutMs;
    while (Date.now() <= deadlineAtMs) {
      if (signal?.aborted || baseline.kind !== "cmp_cookie_values_equal") return undefined;
      const states = await exactCmpCookieStates(context, page.url(), confirmation.cookies);
      const complete = confirmation.cookies.every((expectation) => {
        const state = states[cookieExpectationKey(expectation)];
        return state?.value === expectation.expectedValue;
      });
      const changedAfterAction = confirmation.cookies.some((expectation) => {
        const key = cookieExpectationKey(expectation);
        return states[key]?.stateHash !== baseline.stateHashes[key];
      });
      if (complete && changedAfterAction) {
        return {
          stateHash: hashValue(JSON.stringify(confirmation.cookies.map((expectation) => {
            const state = states[cookieExpectationKey(expectation)]!;
            return [expectation.name, expectation.path, state.identityHash, state.valueHash];
          }))),
          witnessType: "cmp_cookie_state",
          key: confirmation.cookies.map((expectation) => expectation.name).join(",").slice(0, 180),
          expectedState: "canonical_cmp_refusal_cookie_values_written_after_reject",
        };
      }
      await waitForDelay(25, signal).catch(() => undefined);
    }
    return undefined;
  }

  if (confirmation.kind === "cmp_cookie_changed") {
    if (baseline.kind !== "cmp_cookie_changed") return undefined;
    const deadlineAtMs = Date.now() + timeoutMs;
    while (Date.now() <= deadlineAtMs) {
      if (signal?.aborted) return undefined;
      const currentCookieState = await cmpCookieState(context, confirmation.cookieName);
      if (currentCookieState && currentCookieState.stateHash !== baseline.cookieStateHash) {
        return {
          stateHash: currentCookieState.stateHash,
          witnessType: "cmp_cookie_state",
          key: currentCookieState.cookieNames.join(",").slice(0, 180),
          expectedState: "canonical_cmp_consent_state_changed_after_reject",
        };
      }
      await waitForDelay(25, signal).catch(() => undefined);
    }
    return undefined;
  }

  if (confirmation.kind === "cmp_cookie_names_changed") {
    if (baseline.kind !== "cmp_cookie_names_changed") return undefined;
    const deadlineAtMs = Date.now() + timeoutMs;
    while (Date.now() <= deadlineAtMs) {
      if (signal?.aborted) return undefined;
      for (const cookieName of confirmation.cookieNames.slice(0, 8)) {
        const currentCookieState = await cmpCookieState(context, cookieName);
        if (currentCookieState && currentCookieState.stateHash !== baseline.cookieStateHashes[cookieName]) {
          return {
            stateHash: currentCookieState.stateHash,
            witnessType: "cmp_cookie_state",
            key: currentCookieState.cookieNames.join(",").slice(0, 180),
            expectedState: "canonical_cmp_consent_state_changed_after_reject",
          };
        }
      }
      await waitForDelay(25, signal).catch(() => undefined);
    }
    return undefined;
  }

  if (confirmation.kind === "cmp_api_consent_state_changed") {
    if (baseline.kind !== confirmation.kind) return undefined;
    const deadlineAtMs = Date.now() + timeoutMs;
    while (Date.now() <= deadlineAtMs) {
      if (signal?.aborted) return undefined;
      const snapshot = await readCmpApiConsentSnapshot(page, confirmation.provider);
      const changed = Boolean(
        snapshot?.canonicalState && snapshot.canonicalState !== baseline.canonicalState
      );
      const freshEvent = (snapshot?.eventSequence ?? 0) > baseline.eventSequence;
      if (snapshot?.decision === "denied" && (changed || freshEvent)) {
        return {
          stateHash: hashValue(snapshot.canonicalState),
          witnessType: "cmp_api_state",
          key: confirmation.provider,
          expectedState: "all_configurable_purposes_denied_after_reject",
        };
      }
      await waitForDelay(25, signal).catch(() => undefined);
    }
    return undefined;
  }

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
      const currentCookieState = await cmpCookieState(context, confirmation.cookieName);
      if (
        currentCookieState !== undefined &&
        currentCookieState.stateHash !== baseline.cookieStateHash
      ) {
        return {
          stateHash: currentCookieState.stateHash,
          witnessType: "cmp_cookie_state",
          key: currentCookieState.cookieNames.join(",").slice(0, 180),
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
  if (confirmation.kind === "canonical_reject_transition") {
    const [controlVisible, bannerVisible, bannerStateHash, writes, canonicalStorageStateHashes] = await Promise.all([
      locatorIsVisible(page, confirmation.controlSelector, confirmation.controlFrameUrl),
      canonicalTransitionSurfacePresent(page, confirmation),
      visibleLocatorStateHash(page, confirmation.bannerSelector, confirmation.bannerFrameUrl),
      readStorageWrites(page),
      canonicalConsentStorageStateHashes(page),
    ]);
    return {
      kind: "canonical_reject_transition",
      canonicalStorageStateHashes,
      controlVisible,
      bannerVisible,
      ...(bannerStateHash ? { bannerStateHash } : {}),
      lastSequence: writes.at(-1)?.sequence ?? 0,
      pageUrl: page.url(),
    };
  }
  if (confirmation.kind === "cmp_cookie_values_equal") {
    const states = await exactCmpCookieStates(context, page.url(), confirmation.cookies);
    return {
      kind: "cmp_cookie_values_equal",
      stateHashes: Object.fromEntries(confirmation.cookies.map((expectation) => {
        const key = cookieExpectationKey(expectation);
        return [key, states[key]?.stateHash];
      })),
    };
  }
  if (confirmation.kind === "cmp_cookie_changed") {
    return {
      kind: "cmp_cookie_changed",
      cookieStateHash: await cmpCookieState(context, confirmation.cookieName)
        .then((state) => state?.stateHash),
    };
  }
  if (confirmation.kind === "cmp_cookie_names_changed") {
    const cookieNames = confirmation.cookieNames.slice(0, 8);
    return {
      kind: "cmp_cookie_names_changed",
      cookieStateHashes: Object.fromEntries(await Promise.all(cookieNames.map(async (cookieName) => [
        cookieName,
        await cmpCookieState(context, cookieName).then((state) => state?.stateHash),
      ] as const))),
    };
  }
  if (confirmation.kind === "cmp_api_consent_state_changed") {
    const snapshot = await readCmpApiConsentSnapshot(page, confirmation.provider);
    return {
      kind: confirmation.kind,
      canonicalState: snapshot?.canonicalState,
      eventSequence: snapshot?.eventSequence ?? 0,
    };
  }
  if (confirmation.kind === "local_storage_equals") {
    return {
      kind: "local_storage_equals",
      lastSequence: (await readStorageWrites(page)).at(-1)?.sequence ?? 0,
    };
  }
  if (confirmation.kind === "tcf_purposes_denied_or_cmp_cookie_changed") {
    const [snapshot, cookieStateHash] = await Promise.all([
      readTcfData(page).catch(() => undefined),
      cmpCookieState(context, confirmation.cookieName).then((state) => state?.stateHash),
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

async function locatorIsVisible(
  page: Page,
  selector: string,
  childFrameUrl?: string,
): Promise<boolean> {
  const scopeResolution = exactSelectorScope(page, childFrameUrl);
  if (scopeResolution.status !== "found") return false;
  const locator = scopeResolution.scope.locator(selector);
  const count = Math.min(await locator.count().catch(() => 0), 2);
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) return true;
  }
  return false;
}

async function canonicalTransitionSurfacePresent(
  page: Page,
  confirmation: Extract<
    PostRefusalActionRecipe["confirmation"],
    { kind: "canonical_reject_transition" }
  >,
): Promise<boolean> {
  if (await locatorIsVisible(page, confirmation.bannerSelector, confirmation.bannerFrameUrl)) {
    return true;
  }
  if (confirmation.bannerFrameUrl !== confirmation.controlFrameUrl) return false;
  const scopeResolution = exactSelectorScope(page, confirmation.controlFrameUrl);
  if (scopeResolution.status !== "found") return false;
  const controls = scopeResolution.scope.locator(confirmation.controlSelector);
  const count = Math.min(await controls.count().catch(() => 0), 2);
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    if (!await control.isVisible().catch(() => false)) continue;
    const contained = await control.evaluate((element, bannerSelector) => {
      try {
        return element.matches(bannerSelector) || element.closest(bannerSelector) !== null;
      } catch {
        return false;
      }
    }, confirmation.bannerSelector).catch(() => false);
    if (contained) return true;
  }
  return false;
}

async function visibleLocatorStateHash(
  page: Page,
  selector: string,
  childFrameUrl?: string,
): Promise<string | undefined> {
  const scopeResolution = exactSelectorScope(page, childFrameUrl);
  if (scopeResolution.status !== "found") return undefined;
  const locator = scopeResolution.scope.locator(selector);
  const count = Math.min(await locator.count().catch(() => 0), 2);
  const visible = [] as Locator[];
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) visible.push(candidate);
  }
  if (visible.length !== 1) return undefined;
  const state = await visible[0]!.evaluate((element) => {
    const htmlElement = element as HTMLElement;
    const normalizedText = (htmlElement.innerText || element.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2_000);
    return JSON.stringify([
      normalizedText,
      element.getAttribute("aria-label")?.slice(0, 240) ?? "",
      element.childElementCount,
    ]);
  }).catch(() => undefined);
  return state ? hashValue(state) : undefined;
}

async function hasCredibleLateConsentSignal(input: {
  context: BrowserContext;
  diagnosticGeometry?: ConsentControlGeometryArtifact;
  page: Page;
  requests: CapturedRequest[];
}) {
  if (
    input.diagnosticGeometry?.cmp.detected ||
    input.diagnosticGeometry?.summary.firstLayerAccept ||
    input.diagnosticGeometry?.summary.firstLayerReject ||
    input.diagnosticGeometry?.summary.firstLayerOptions
  ) return true;

  const [cookies, storageKeys] = await Promise.all([
    input.context.cookies().catch(() => []),
    input.page.evaluate(() => [
      ...Object.keys(window.localStorage),
      ...Object.keys(window.sessionStorage),
    ].slice(0, 64)).catch(() => [] as string[]),
  ]);
  const urls = input.requests.slice(0, 96).map((captured) => captured.request.url());
  return detectKnownCmps({
    cookieNames: cookies.slice(0, 64).map((cookie) => cookie.name),
    storageKeys,
    urls,
  }).length > 0;
}

const CANONICAL_CONSENT_STATE_KEY_PATTERN =
  /(?:consent|cookie|privacy|tracking|analytics|marketing|advertising|opt[-_]?out)/i;
const CANONICAL_REFUSAL_STATE_PATTERN =
  /(?:^|[^a-z])(?:denied|rejected|reject(?:ed)?[_ -]?all|essential[_ -]?only|necessary[_ -]?only|opted[_ -]?out)(?:$|[^a-z])/i;
const CANONICAL_DISABLED_PURPOSE_PATTERN =
  /["']?(?:analytics|marketing|advertising|tracking)["']?\s*[:=]\s*(?:false|0|["']denied["'])/i;
const CANONICAL_OPTIONAL_PURPOSE_KEY_PATTERN =
  /^(?:analytics|marketing|advertising|tracking|targeting|personalization|preferences|functionality|performance|social)$/i;

function canonicalConsentStorageIdentity(storageType: "local_storage" | "session_storage", name: string) {
  return `${storageType}\n${name}`;
}

function canonicalJsonRefusalState(value: string) {
  if (value.length > 2_048) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return false;
  }
  let denied = 0;
  let granted = 0;
  let visited = 0;
  const visit = (node: unknown, depth: number) => {
    if (depth > 5 || visited >= 96 || !node || typeof node !== "object") return;
    visited += 1;
    for (const [key, nested] of Object.entries(node)) {
      if (CANONICAL_OPTIONAL_PURPOSE_KEY_PATTERN.test(key)) {
        const normalized = typeof nested === "string" ? nested.trim().toLowerCase() : nested;
        if (normalized === false || normalized === 0 || normalized === "false" || normalized === "denied") denied += 1;
        else if (normalized === true || normalized === 1 || normalized === "true" || normalized === "granted") granted += 1;
      }
      visit(nested, depth + 1);
    }
  };
  visit(parsed, 0);
  return denied > 0 && granted === 0;
}

async function canonicalConsentStorageStates(page: Page) {
  return await page.evaluate((keyPatternSource) => {
    const keyPattern = new RegExp(keyPatternSource, "i");
    const retained: Array<{ storageType: "local_storage" | "session_storage"; name: string; value: string }> = [];
    for (const [storageType, storage] of [
      ["local_storage", window.localStorage],
      ["session_storage", window.sessionStorage],
    ] as const) {
      for (let index = 0; index < Math.min(storage.length, 64); index += 1) {
        const name = storage.key(index);
        if (!name || name.length > 160 || !keyPattern.test(name)) continue;
        const value = storage.getItem(name);
        if (value) retained.push({ storageType, name, value: value.slice(0, 2_048) });
        if (retained.length >= 32) return retained;
      }
    }
    return retained;
  }, CANONICAL_CONSENT_STATE_KEY_PATTERN.source).catch(() => [] as Array<{
    storageType: "local_storage" | "session_storage";
    name: string;
    value: string;
  }>);
}

async function canonicalConsentStorageStateHashes(page: Page) {
  return Object.fromEntries((await canonicalConsentStorageStates(page)).map((state) => [
    canonicalConsentStorageIdentity(state.storageType, state.name),
    hashValue(state.value),
  ]));
}

async function findCanonicalRefusalStateWrite(
  context: BrowserContext,
  page: Page,
  baselineSequence: number,
  actionDispatchedAtEpochMs: number,
  baselineStorageStateHashes: Record<string, string>,
): Promise<{ key: string; stateHash: string } | undefined> {
  const writes = (await readStorageWrites(page)).filter((write) =>
    write.sequence > baselineSequence &&
    write.observedAtEpochMs >= actionDispatchedAtEpochMs &&
    CANONICAL_CONSENT_STATE_KEY_PATTERN.test(write.name)
  );
  for (const write of writes) {
    let value: string | undefined;
    if (write.storageType === "cookie") {
      const matches = (await context.cookies()).filter((cookie) => cookie.name === write.name);
      if (matches.length === 1) value = matches[0]?.value;
    } else {
      value = await page.evaluate(({ key, storageType }) => {
        try {
          return (storageType === "local_storage" ? window.localStorage : window.sessionStorage).getItem(key) ?? undefined;
        } catch {
          return undefined;
        }
      }, { key: write.name, storageType: write.storageType }).catch(() => undefined);
    }
    if (!value) continue;
    let decodedValue = value.slice(0, 2_048);
    try {
      decodedValue = decodeURIComponent(decodedValue);
    } catch {
      // Inspect the bounded original when the value is not valid URI encoding.
    }
    const normalized = decodedValue.trim().toLowerCase();
    const explicitBooleanDenial = (normalized === "false" || normalized === "0") &&
      CANONICAL_CONSENT_STATE_KEY_PATTERN.test(write.name);
    if (
      !explicitBooleanDenial &&
      !CANONICAL_REFUSAL_STATE_PATTERN.test(normalized) &&
      !CANONICAL_DISABLED_PURPOSE_PATTERN.test(normalized) &&
      !canonicalJsonRefusalState(decodedValue)
    ) continue;
    return {
      key: write.name.slice(0, 160),
      stateHash: hashValue(value),
    };
  }
  for (const state of await canonicalConsentStorageStates(page)) {
    const identity = canonicalConsentStorageIdentity(state.storageType, state.name);
    const stateHash = hashValue(state.value);
    if (
      baselineStorageStateHashes[identity] !== stateHash &&
      (
        CANONICAL_REFUSAL_STATE_PATTERN.test(state.value) ||
        CANONICAL_DISABLED_PURPOSE_PATTERN.test(state.value) ||
        canonicalJsonRefusalState(state.value)
      )
    ) {
      return { key: state.name.slice(0, 160), stateHash };
    }
  }
  return undefined;
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

async function cmpCookieState(
  context: BrowserContext,
  cookieName: string,
): Promise<{ cookieNames: string[]; stateHash: string } | undefined> {
  const boundedName = cookieName.trim().slice(0, 180);
  if (!boundedName) return undefined;
  const states = (await context.cookies())
    .filter((cookie) => matchesCanonicalCmpCookieName(cookie.name, boundedName))
    .map((cookie) => ({
      domain: cookie.domain.toLowerCase().replace(/^\./, ""),
      name: cookie.name,
      path: cookie.path,
      valueHash: hashValue(cookie.value),
    }))
    .sort((left, right) =>
      `${left.name}:${left.domain}:${left.path}`.localeCompare(`${right.name}:${right.domain}:${right.path}`)
    );
  return states.length > 0
    ? {
        cookieNames: [...new Set(states.map((state) => state.name))].sort(),
        stateHash: hashValue(JSON.stringify(states)),
      }
    : undefined;
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
        [],
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
  interactionAuthorization:
    | PostRefusalInteractionAuthorization
    | ResolvedPostRefusalScanTargetAuthorization,
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
  const recoverableFailure = failureClass === "aborted" ||
    failureClass === "navigation_replaced" ||
    failureClass === "http2_protocol" ||
    failureClass === "quic_protocol";
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
