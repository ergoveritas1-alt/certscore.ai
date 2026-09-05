import { installRuntimeGraphCapture } from "./runtime-evidence-graph-capture.js";
import {
  POST_ACCEPT_DEFAULT_OBSERVATION_WINDOW_MS,
  postAcceptEvidencePacketSchema,
  type ConsentActionControlProof,
  type PostAcceptEvidencePacket,
  type PostAcceptNetworkRequest,
  type PostAcceptObservation,
  type PostAcceptRegistration,
  type PostAcceptStorageWrite,
  type PostRefusalInteractionAuthorization,
  type PostRefusalInteractionDiagnostics,
  type PostRefusalStorageItem,
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
  type Frame,
  type Locator,
  type Page,
  type Request,
} from "playwright";
import {
  chromiumContextOptions,
  chromiumLaunchOptions,
} from "./playwright-runtime.js";
import {
  authorizePostRefusalTarget,
  bindPostRefusalBrowserResolvedExactTarget,
  type ResolvedPostRefusalScanTargetAuthorization,
} from "./post-refusal-target-authorization.js";
import {
  decodeTcfV2PurposeConsents,
  postRefusalStorageIdentityHash,
} from "./post-refusal-observer.js";
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
import {
  captureConsentControlGeometry,
  type ConsentControlCandidateEvidence,
} from "./consent-control-geometry.js";
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

const POST_ACCEPT_SOURCE = "post_accept_observer";
const MAX_REQUESTS = 96;
const MAX_STORAGE_ITEMS = 96;
export const POST_ACCEPT_EARLY_SIGNAL_SETTLE_MS = 350;
const NON_ESSENTIAL_PURPOSES = new Set([
  "advertising",
  "analytics",
  "performance_monitoring",
  "session_replay",
  "tag_management",
]);

export interface PostAcceptActionRecipe {
  artifactVersion: "certscore.post_accept_action_recipe.v1";
  recipeId: string;
  cmpId?: string;
  resolverMethod?:
    | "local_fixture_recipe"
    | "cmp_registry_recipe"
    | "tcf_api_cmp_registry_recipe"
    | "owned_site_recipe"
    | "canonical_consent_control_registry_recipe";
  controlSelector: string;
  /** Exact canonical label used only to disambiguate one geometry-derived selector. */
  controlExpectedNormalizedLabel?: string;
  accessibleControl?: CmpAccessibleActionResolution;
  runtimeUrlPatternSources?: string[];
  controlFrameUrl?: string;
  bannerSelector?: string;
  bannerFrameUrl?: string;
  confirmation:
    | {
        kind: "local_storage_equals";
        key: string;
        expectedValue: string;
      }
    | {
        kind: "tcf_purposes_granted_or_cmp_cookie_changed";
        purposeIds: number[];
        cookieName: string;
      }
    | {
        kind: "tcf_purposes_granted_or_cmp_storage_keys_changed";
        purposeIds: number[];
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
        kind: "canonical_accept_transition";
        controlSelector: string;
        controlFrameUrl?: string;
        bannerSelector: string;
        bannerFrameUrl?: string;
      };
}

export interface PostAcceptObserverInput {
  runtimeGraph?: { scanId: string; mode: "capture_only" | "project" };
  scanId: string;
  parentScanId?: string;
  url: string;
  normalizedUrl?: string;
  recipe: PostAcceptActionRecipe;
  recipeCandidates?: PostAcceptActionRecipe[];
  recipeSetId?: string;
  /**
   * For a runtime-identified CMP, use the canonical consent-control inventory
   * before its registered selector. For a non-CMP first layer, the same
   * canonical inventory may provide the bounded best attempt. Confirmation
   * still requires retained post-action evidence; classification alone never
   * confirms acceptance.
   */
  allowCanonicalAcceptDiscovery?: boolean;
  scanStartedAtMs?: number;
  dispatchDelayMs?: number;
  observationWindowMs?: number;
  confirmationTimeoutMs?: number;
  actionSearchTimeoutMs?: number;
  resultBudgetMs?: number;
  browser?: Browser;
  signal?: AbortSignal;
  onLifecycleEvent?: (event: { type: "action_dispatched"; atMs: number }) => void;
  outDir?: string;
  interactionAuthorization: PostRefusalInteractionAuthorization;
  productionProjectable?: boolean;
}

type CapturedRequest = {
  request: Request;
  requestId: string;
  startedAtEpochMs: number;
  completedAtEpochMs?: number;
  inFlightAtAcceptanceRegistration: boolean;
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

type ConfirmationBaseline =
  | {
      kind: "canonical_accept_transition";
      controlVisible: boolean;
      bannerVisible: boolean;
      bannerStateHash?: string;
      pageUrl: string;
    }
  | { kind: "local_storage_equals"; lastSequence: number }
  | { kind: "cmp_cookie_changed"; cookieStateHash?: string }
  | { kind: "cmp_cookie_names_changed"; cookieStateHashes: Record<string, string | undefined> }
  | {
      kind: "cmp_api_consent_state_changed";
      canonicalState?: string;
      eventSequence: number;
    }
  | {
      kind: "tcf_purposes_granted_or_cmp_cookie_changed";
      snapshot?: TcfDataSnapshot;
      cookieStateHash?: string;
    }
  | {
      kind: "tcf_purposes_granted_or_cmp_storage_keys_changed";
      snapshot?: TcfDataSnapshot;
      storageStateHashes: Record<string, string | undefined>;
      lastSequence: number;
    }
  | { kind: "cmp_cookie_values_equal"; stateHashes: Record<string, string | undefined> };

type ConfirmationState = {
  stateHash: string;
  witnessType:
    | "cmp_storage_state"
    | "cmp_api_state"
    | "tcf_user_action_complete"
    | "cmp_cookie_state"
    | "canonical_acceptance_state";
  key?: string;
  expectedState: string;
};

export async function runPostAcceptObserver(
  input: PostAcceptObserverInput,
): Promise<PostAcceptEvidencePacket> {
  const recipes = validatedRecipes(input);
  const recipeSetId = input.recipeSetId?.slice(0, 160) || recipes[0]!.recipeId;
  const authorizationScanId = input.parentScanId ?? input.scanId;
  let effectiveAuthorization:
    | PostRefusalInteractionAuthorization
    | ResolvedPostRefusalScanTargetAuthorization = input.interactionAuthorization;
  let observationTargetUrl = input.url;
  let authorizedExactTargetUrl: string | undefined;
  if (input.interactionAuthorization.kind !== "scan_target_resolution") {
    const authorization = authorizePostRefusalTarget(
      input.url,
      input.interactionAuthorization,
      authorizationScanId,
    );
    if (!authorization.authorized) {
      throw new Error(`Post-Accept target authorization failed closed: ${authorization.reason}.`);
    }
    authorizedExactTargetUrl = normalizeTargetUrl(input.url);
  }

  const branchStartedAtMs = Date.now();
  const parentScanStartedAtMs = input.scanStartedAtMs ?? branchStartedAtMs;
  const resultBudgetMs = boundedMs(input.resultBudgetMs, 0, 0, 30_000);
  const resultBudgetDeadlineAtMs = resultBudgetMs > 0
    ? branchStartedAtMs + resultBudgetMs
    : undefined;
  const resultBudgetAbortController = new AbortController();
  let resultBudgetExhausted = false;
  let resultBudgetTimer: NodeJS.Timeout | undefined;
  if (resultBudgetDeadlineAtMs !== undefined) {
    resultBudgetTimer = setTimeout(() => {
      resultBudgetExhausted = true;
      resultBudgetAbortController.abort(new Error("Post-Accept observer result budget exhausted."));
    }, Math.max(0, resultBudgetDeadlineAtMs - Date.now()));
    resultBudgetTimer.unref?.();
  }
  const effectiveSignal = resultBudgetDeadlineAtMs === undefined
    ? input.signal
    : input.signal
      ? AbortSignal.any([input.signal, resultBudgetAbortController.signal])
      : resultBudgetAbortController.signal;
  const dispatchDelayMs = boundedMs(input.dispatchDelayMs, 0, 0, 10_000);
  const observationWindowMs = boundedMs(
    input.observationWindowMs,
    POST_ACCEPT_DEFAULT_OBSERVATION_WINDOW_MS,
    0,
    30_000,
  );
  const confirmationTimeoutMs = boundedMs(input.confirmationTimeoutMs, 2_000, 50, 5_000);
  const actionSearchTimeoutMs = boundedMs(input.actionSearchTimeoutMs, 13_000, 0, 15_000);
  const limitations = [
    `interaction_authorization:${input.interactionAuthorization.kind}:${input.interactionAuthorization.authorizationId}`,
    ...(input.productionProjectable === true ? [] : ["artifact_only_not_production_projectable"]),
  ];
  const timing = {
    dispatchDelayMs,
    navigationMs: 0,
    resolverMs: 0,
    confirmationMs: 0,
    observationMs: 0,
    observationExitReason: undefined as PostAcceptEvidencePacket["timing"]["observationExitReason"],
  };
  const diagnostics: PostRefusalInteractionDiagnostics = {
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
  const capturedRequests: CapturedRequest[] = [];
  const activeRequestIds = new Set<string>();
  const requestIds = new WeakMap<Request, string>();
  let nextRequestNumber = 0;
  let acceptanceRegisteredAtEpochMs: number | undefined;
  let activeRequestIdsAtAcceptanceRegistration: string[] = [];
  let actionDispatched = false;
  let cancellationObservedAtMs: number | undefined;
  let observationCoverageSufficient = false;
  let selectedRecipe: PostAcceptActionRecipe | undefined;
  let actionControlProof: ConsentActionControlProof | undefined;
  let browser = input.browser;
  let ownsBrowser = false;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let graphCapture: Awaited<ReturnType<typeof installRuntimeGraphCapture>> | undefined;
  let actionDiscovery: ConsentActionDiscovery | undefined;

  const cancellation = () => {
    if (!effectiveSignal?.aborted) return false;
    cancellationObservedAtMs ??= elapsed(parentScanStartedAtMs);
    return true;
  };

  const remainingResultBudgetMs = (requestedMs: number) => {
    if (resultBudgetDeadlineAtMs === undefined) return requestedMs;
    return Math.max(0, Math.min(requestedMs, resultBudgetDeadlineAtMs - Date.now()));
  };

  const finalize = async (fields: {
    resolverFound: boolean;
    resolverReason?: string;
    registration: PostAcceptRegistration;
    preActionCapturedAtMs?: number;
    postActionCapturedAtMs?: number;
    preActionStorage?: PostRefusalStorageItem[];
    postActionStorage?: PostRefusalStorageItem[];
    requests?: PostAcceptNetworkRequest[];
    postAcceptNonEssentialRequests?: PostAcceptNetworkRequest[];
    writesAfterAccept?: PostAcceptStorageWrite[];
    itemsCreatedOrChangedAfterAccept?: PostRefusalStorageItem[];
    postAcceptTcfState?: PostRefusalTcfState;
    observations?: PostAcceptObservation[];
  }) => {
    if (resultBudgetExhausted) {
      cancellation();
      observationCoverageSufficient = false;
      if (!limitations.some((limitation) => limitation.startsWith("observer_result_budget_exhausted"))) {
        limitations.push("observer_result_budget_exhausted_before_packet_finalization");
      }
    }
    const completedAtMs = Date.now();
    const confirmed = fields.registration.status === "confirmed" &&
      fields.registration.acceptanceExercised &&
      fields.registration.acceptanceRegisteredAtMs !== undefined;
    const resolverRecipe = selectedRecipe ?? (recipes.length === 1 ? recipes[0] : undefined);
    const packet = postAcceptEvidencePacketSchema.parse({
      runtimeEvidenceGraph: graphCapture?.finish(confirmed ? undefined : "action_not_confirmed"),
      artifactVersion: "certscore.post_accept_evidence.v1",
      artifactOnly: true,
      productionProjectable:
        input.productionProjectable === true && confirmed && observationCoverageSufficient &&
        Boolean(actionControlProof),
      scanId: input.scanId,
      ...(input.parentScanId ? { parentScanId: input.parentScanId } : {}),
      ...(authorizedExactTargetUrl
        ? { exactTargetSha256: hashValue(normalizeTargetUrl(authorizedExactTargetUrl)) }
        : {}),
      targetUrl: sanitizeUrl(observationTargetUrl),
      normalizedUrl: sanitizeUrl(input.normalizedUrl ?? input.url),
      observationBranch: "accept_only",
      phase: "post_action",
      consentAction: "accept",
      ...(actionControlProof ? { actionControlProof } : {}),
      startedAt: new Date(branchStartedAtMs).toISOString(),
      completedAt: new Date(completedAtMs).toISOString(),
      resolver: {
        found: fields.resolverFound,
        method: resolverRecipe?.resolverMethod ?? "cmp_registry_recipe",
        confidence: fields.resolverFound ? 1 : 0,
        recipeId: resolverRecipe?.recipeId ?? recipeSetId,
        ...(resolverRecipe?.cmpId ? { cmpId: resolverRecipe.cmpId } : {}),
        ...(fields.resolverReason ? { reason: fields.resolverReason } : {}),
      },
      acceptanceRegistration: fields.registration,
      observationWindowMs,
      timing: {
        ...timing,
        totalMs: Math.max(0, completedAtMs - branchStartedAtMs),
        readyAtMs: elapsed(parentScanStartedAtMs, completedAtMs),
      },
      network: {
        requests: fields.requests ?? [],
        postAcceptNonEssentialRequests: fields.postAcceptNonEssentialRequests ?? [],
        activeRequestIdsAtAcceptanceRegistration,
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
        writesAfterAccept: fields.writesAfterAccept ?? [],
        itemsCreatedOrChangedAfterAccept: fields.itemsCreatedOrChangedAfterAccept ?? [],
      },
      ...(fields.postAcceptTcfState ? { tcf: { postAcceptState: fields.postAcceptTcfState } } : {}),
      interactionDiagnostics: diagnostics,
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
        path.join(input.outDir, "PostAcceptEvidencePacket.json"),
        `${JSON.stringify(packet, null, 2)}\n`,
        "utf8",
      );
    }
    return packet;
  };

  try {
    await waitForDelay(dispatchDelayMs, effectiveSignal).catch(() => undefined);
    if (cancellation()) {
      return finalize({
        resolverFound: false,
        resolverReason: "abort_requested_before_navigation",
        registration: unconfirmedRegistration("aborted", "abort_requested_before_navigation"),
      });
    }
    if (!browser) {
      browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
      ownsBrowser = true;
    }
    if (cancellation()) {
      const reason = resultBudgetExhausted
        ? "observer_result_budget_exhausted_before_navigation"
        : "abort_requested_before_navigation";
      limitations.push(reason);
      return finalize({
        resolverFound: false,
        resolverReason: reason,
        registration: unconfirmedRegistration("aborted", reason),
      });
    }
    context = await browser.newContext(chromiumContextOptions());
    await installWebBotAuthRoute(context);
    if (input.interactionAuthorization.kind === "scan_target_resolution") {
      await installPublicNetworkGuardRoute(context);
    }
    page = await context.newPage();
    if (input.runtimeGraph) graphCapture = await installRuntimeGraphCapture(page, {
      ...input.runtimeGraph, captureId: input.scanId, scenario: "post_accept", startedAt: new Date(parentScanStartedAtMs).toISOString(),
    });
    actionDiscovery = await installConsentActionDiscovery(page);
    await installStorageWriteProbe(page);
    let mainNavigationRequestCount = 0;
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page?.mainFrame()) {
        mainNavigationRequestCount += 1;
      }
      if (capturedRequests.length >= MAX_REQUESTS) return;
      const requestId = `post_accept_request_${++nextRequestNumber}`;
      requestIds.set(request, requestId);
      activeRequestIds.add(requestId);
      capturedRequests.push({
        request,
        requestId,
        startedAtEpochMs: Date.now(),
        inFlightAtAcceptanceRegistration: false,
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
    try {
      const navigationTimeoutMs = remainingResultBudgetMs(15_000);
      if (navigationTimeoutMs <= 0) throw effectiveSignal?.reason ?? new Error("Post-Accept navigation budget exhausted.");
      await page.goto(observationTargetUrl, { waitUntil: "commit", timeout: navigationTimeoutMs });
      diagnostics.navigation = {
        outcome: "completed",
        documentCommitted: true,
        finalUrlAuthorized: false,
      };
    } catch (error) {
      timing.navigationMs = Math.max(0, Date.now() - navigationStartedAtMs);
      if (cancellation()) {
        const reason = resultBudgetExhausted
          ? "observer_result_budget_exhausted_before_action"
          : "abort_requested_before_action";
        limitations.push(reason);
        return finalize({
          resolverFound: false,
          resolverReason: reason,
          registration: unconfirmedRegistration("aborted", reason),
          requests: classifyRequests(capturedRequests, parentScanStartedAtMs),
        });
      }
      limitations.push(`target_navigation_failed:${classifyBrowserError(error)}`);
      return finalize({
        resolverFound: false,
        resolverReason: "target_navigation_failed",
        registration: unconfirmedRegistration("not_attempted", "target_navigation_failed"),
        requests: classifyRequests(capturedRequests, parentScanStartedAtMs),
      });
    }
    timing.navigationMs = Math.max(0, Date.now() - navigationStartedAtMs);

    if (input.interactionAuthorization.kind === "scan_target_resolution") {
      const resolutionStartedAtMs = Date.now();
      const settled = await waitForPassiveRedirectSettle(
        page,
        remainingResultBudgetMs(input.interactionAuthorization.resolutionTimeoutMs),
        effectiveSignal,
      );
      const resolution = settled
        ? await bindPostRefusalBrowserResolvedExactTarget({
            durationMs: Date.now() - resolutionStartedAtMs,
            finalUrl: page.url(),
            redirectCount: Math.max(0, mainNavigationRequestCount - 1),
            requestedUrl: input.url,
          }, input.interactionAuthorization, authorizationScanId)
        : undefined;
      if (!resolution || resolution.status !== "resolved") {
        limitations.push("redirect_target_not_authorized");
        return finalize({
          resolverFound: false,
          resolverReason: "redirect_target_not_authorized",
          registration: unconfirmedRegistration("not_attempted", "redirect_target_not_authorized"),
          requests: classifyRequests(capturedRequests, parentScanStartedAtMs),
        });
      }
      effectiveAuthorization = resolution.authorization;
      authorizedExactTargetUrl = resolution.targetUrl;
      observationTargetUrl = resolution.targetUrl;
      diagnostics.navigation.redirectResolution = {
        durationMs: resolution.durationMs,
        finalExactTargetSha256: resolution.finalExactTargetSha256,
        redirectCount: resolution.redirectCount,
        requestedTargetSha256: resolution.requestedTargetSha256,
        status: "resolved",
      };
    }
    const finalAuthorization = authorizePostRefusalTarget(
      page.url(),
      effectiveAuthorization,
      authorizationScanId,
    );
    if (!finalAuthorization.authorized) {
      limitations.push(`final_target_not_authorized:${finalAuthorization.reason}`);
      return finalize({
        resolverFound: false,
        resolverReason: "redirect_target_not_authorized",
        registration: unconfirmedRegistration("not_attempted", "redirect_target_not_authorized"),
        requests: classifyRequests(capturedRequests, parentScanStartedAtMs),
      });
    }
    diagnostics.navigation.finalUrlAuthorized = true;

    const resolverStartedAtMs = Date.now();
    let resolution = input.allowCanonicalAcceptDiscovery
      ? await waitForDeterministicOrCanonicalAcceptRecipe(
          page,
          recipes,
          remainingResultBudgetMs(actionSearchTimeoutMs),
          effectiveSignal,
          actionDiscovery,
        )
      : await waitForDeterministicRecipe(
          page,
          recipes,
          remainingResultBudgetMs(actionSearchTimeoutMs),
          effectiveSignal,
          actionDiscovery,
        );
    timing.resolverMs = Math.max(0, Date.now() - resolverStartedAtMs);
    if (resolution.status !== "found") {
      if (resolution.status !== "aborted") {
        const coverage = await diagnoseCmpActionCoverage({
          action: "accept",
          context,
          page,
        }).catch(() => undefined);
        if (coverage && !limitations.includes(coverage.limitation)) {
          limitations.push(coverage.limitation);
        }
      }
      const reason = resolution.status === "ambiguous"
        ? "multiple_deterministic_accept_controls_found"
        : resolution.status === "aborted"
          ? "abort_requested_during_control_resolution"
          : "deterministic_accept_control_not_found";
      return finalize({
        resolverFound: false,
        resolverReason: reason,
        registration: unconfirmedRegistration(
          resolution.status === "aborted" ? "aborted" : "not_attempted",
          reason,
        ),
        requests: classifyRequests(capturedRequests, parentScanStartedAtMs),
      });
    }
    selectedRecipe = resolution.recipe;
    let control = resolution.control;
    let confirmationScope = resolution.scope;
    const preActionStorage = await captureStorage(context, page, observationTargetUrl, limitations);
    const preActionCapturedAtMs = elapsed(parentScanStartedAtMs);
    if (cancellation()) {
      return finalize({
        resolverFound: true,
        resolverReason: "abort_requested_before_action",
        registration: unconfirmedRegistration("aborted", "abort_requested_before_action"),
        preActionCapturedAtMs,
        preActionStorage,
        requests: classifyRequests(capturedRequests, parentScanStartedAtMs),
      });
    }

    let actionabilityError: unknown;
    let useVerifiedGeometryDispatch = false;
    try {
      await trialAcceptControl(page, control, selectedRecipe);
    } catch (error) {
      actionabilityError = error;
    }
    if (
      actionabilityError &&
      classifyClickFailure(actionabilityError) === "actionability_timeout"
    ) {
      const actionability = await inspectLocatorActionability(control);
      if (locatorActionabilitySupportsVerifiedDispatch(actionability)) {
        actionabilityError = undefined;
        useVerifiedGeometryDispatch = true;
        diagnostics.click.actionability = actionability;
        limitations.push("action_dispatch_verified_geometry_fallback");
      }
    }
    if (actionabilityError) {
      resolution = await waitForDeterministicRecipe(
        page,
        [selectedRecipe],
        remainingResultBudgetMs(500),
        effectiveSignal,
        actionDiscovery,
      );
      if (resolution.status === "not_found" && input.allowCanonicalAcceptDiscovery) {
        resolution = await waitForCanonicalAcceptControlRecipe(
          page,
          remainingResultBudgetMs(500),
          effectiveSignal,
          recipes,
        );
      }
      if (resolution.status === "found") {
        selectedRecipe = resolution.recipe;
        control = resolution.control;
        confirmationScope = resolution.scope;
        diagnostics.click.reResolvedBeforeDispatch = true;
        try {
          if (selectedRecipe.accessibleControl?.kind === "closed_shadow_accessible_control") {
            await trialAcceptControl(page, control, selectedRecipe);
            actionabilityError = undefined;
          } else {
            const actionability = await waitForLocatorVerifiedGeometry(
              control,
              remainingResultBudgetMs(1_000),
            );
            if (!actionability) throw new Error("Verified Accept geometry actionability timeout.");
            actionabilityError = undefined;
            useVerifiedGeometryDispatch = true;
            diagnostics.click.actionability = actionability;
            if (!limitations.includes("action_dispatch_verified_geometry_fallback")) {
              limitations.push("action_dispatch_verified_geometry_fallback");
            }
          }
        } catch (error) {
          actionabilityError = error;
        }
      }
    }
    if (actionabilityError) {
      const actionability = await inspectLocatorActionability(control);
      diagnostics.click = {
        outcome: "failed_before_dispatch",
        failureClass: actionability.centerHitTargetRelation === "other_element"
          ? "intercepted"
          : classifyClickFailure(actionabilityError),
        reResolvedBeforeDispatch: diagnostics.click.reResolvedBeforeDispatch,
        confirmationCheckedAfterError: false,
        actionability,
      };
      limitations.push("deterministic_accept_control_not_actionable");
      return finalize({
        resolverFound: true,
        registration: {
          status: "unconfirmed",
          acceptanceExercised: false,
          reason: "deterministic_accept_control_click_failed",
          witnesses: [],
        },
        preActionCapturedAtMs,
        preActionStorage,
        requests: classifyRequests(capturedRequests, parentScanStartedAtMs),
      });
    }

    const confirmationBaseline = await captureConfirmationBaseline(
      context,
      page,
      confirmationScope,
      selectedRecipe.confirmation,
    );
    const proofResolution = await buildConsentActionControlProof({
      action: "accept",
      ...(authorizedExactTargetUrl
        ? { authorizedTargetSha256: hashValue(normalizeTargetUrl(authorizedExactTargetUrl)) }
        : {}),
      ...(selectedRecipe.cmpId ? { cmpId: selectedRecipe.cmpId } : {}),
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
      return finalize({
        resolverFound: false,
        resolverReason: proofResolution.status,
        registration: unconfirmedRegistration("not_attempted", proofResolution.status),
        preActionCapturedAtMs,
        preActionStorage,
        requests: classifyRequests(capturedRequests, parentScanStartedAtMs),
      });
    }
    actionControlProof = proofResolution.proof;
    const actionDispatchedAtEpochMs = Date.now();
    const actionDispatchedAtMs = elapsed(parentScanStartedAtMs, actionDispatchedAtEpochMs);
    actionDispatched = true;
    input.onLifecycleEvent?.({ type: "action_dispatched", atMs: actionDispatchedAtMs });
    let clickError: unknown;
    try {
      await dispatchAcceptControl(
        page,
        control,
        selectedRecipe,
        useVerifiedGeometryDispatch,
      );
    } catch (error) {
      clickError = error;
    }
    const confirmationStartedAtMs = Date.now();
    const confirmedState = await waitForAcceptanceConfirmation(
      context,
      page,
      confirmationScope,
      selectedRecipe.confirmation,
      confirmationBaseline,
      actionDispatchedAtEpochMs,
      remainingResultBudgetMs(confirmationTimeoutMs),
      effectiveSignal,
    );
    timing.confirmationMs = Math.max(0, Date.now() - confirmationStartedAtMs);
    if (clickError) {
      diagnostics.click = {
        outcome: confirmedState ? "confirmed_after_error" : "failed_after_dispatch",
        failureClass: classifyClickFailure(clickError),
        reResolvedBeforeDispatch: diagnostics.click.reResolvedBeforeDispatch,
        confirmationCheckedAfterError: true,
      };
    } else {
      diagnostics.click.outcome = "completed";
    }
    if (!confirmedState) {
      limitations.push("acceptance_registration_not_confirmed");
      return finalize({
        resolverFound: true,
        registration: {
          status: cancellation() ? "aborted" : "unconfirmed",
          acceptanceExercised: false,
          actionDispatchedAtMs,
          reason: cancellation()
            ? "abort_requested_during_confirmation"
            : "cmp_acceptance_state_not_observed",
          witnesses: [],
        },
        preActionCapturedAtMs,
        preActionStorage,
        postActionStorage: await captureStorage(context, page, observationTargetUrl, limitations).catch(() => []),
        requests: classifyRequests(capturedRequests, parentScanStartedAtMs),
      });
    }

    acceptanceRegisteredAtEpochMs = Date.now();
    graphCapture?.confirmAction(acceptanceRegisteredAtEpochMs);
    void graphCapture?.snapshotStorage();
    const acceptanceRegisteredAtMs = elapsed(parentScanStartedAtMs, acceptanceRegisteredAtEpochMs);
    activeRequestIdsAtAcceptanceRegistration = [...activeRequestIds].slice(0, 48);
    for (const captured of capturedRequests) {
      captured.inFlightAtAcceptanceRegistration = activeRequestIds.has(captured.requestId) &&
        captured.startedAtEpochMs <= acceptanceRegisteredAtEpochMs;
    }
    const witnesses: PostAcceptRegistration["witnesses"] = [{
      observedAtMs: acceptanceRegisteredAtMs,
      witnessType: confirmedState.witnessType,
      ...(confirmedState.key ? { key: confirmedState.key } : {}),
      expectedState: confirmedState.expectedState,
      observedStateHash: confirmedState.stateHash,
      corroboratingOnly: false,
    }];
    if (selectedRecipe.bannerSelector &&
      !await locatorIsVisible(page, selectedRecipe.bannerSelector, selectedRecipe.bannerFrameUrl)) {
      witnesses.push({
        witnessType: "banner_transition",
        observedAtMs: acceptanceRegisteredAtMs,
        corroboratingOnly: true,
      });
    }
    const registration: PostAcceptRegistration = {
      status: "confirmed",
      acceptanceExercised: true,
      actionDispatchedAtMs,
      acceptanceRegisteredAtMs,
      witnesses,
    };

    const observationStartedAtMs = Date.now();
    const observationResult = await waitForPostAcceptObservation({
      confirmation: selectedRecipe.confirmation,
      confirmedState,
      getCapturedRequests: () => capturedRequests,
      observationWindowMs,
      page,
      parentScanStartedAtMs,
      acceptanceRegisteredAtEpochMs,
      signal: effectiveSignal,
      targetUrl: observationTargetUrl,
    });
    timing.observationMs = Math.max(0, Date.now() - observationStartedAtMs);
    timing.observationExitReason = observationResult.reason;
    observationCoverageSufficient = observationResult.completed;
    if (!observationResult.completed) {
      cancellation();
      limitations.push(resultBudgetExhausted
        ? "observer_result_budget_exhausted_after_confirmed_acceptance"
        : "observation_window_aborted_after_confirmed_acceptance");
    } else if (observationResult.reason !== "window_elapsed") {
      limitations.push(`observation_early_exit:${observationResult.reason}`);
    }
    const postActionStorage = await captureStorage(context, page, observationTargetUrl, limitations, graphCapture?.cookies);
    void graphCapture?.snapshotStorage();
    const postActionCapturedAtMs = elapsed(parentScanStartedAtMs);
    const requests = classifyRequests(
      capturedRequests,
      parentScanStartedAtMs,
      acceptanceRegisteredAtEpochMs,
    );
    const postAcceptNonEssentialRequests = requests.filter((request) =>
      request.nonEssential &&
      !request.inFlightAtAcceptanceRegistration &&
      typeof request.msOffsetFromAccept === "number" &&
      request.msOffsetFromAccept >= 0
    ).slice(0, 24);
    const instrumentedWrites = await readStorageWrites(page);
    const writesAfterAccept = instrumentedWrites
      .filter((write) => write.observedAtEpochMs > acceptanceRegisteredAtEpochMs!)
      .map((write) => classifyStorageWrite(
        write,
        parentScanStartedAtMs,
        acceptanceRegisteredAtEpochMs!,
        observationTargetUrl,
        postActionStorage,
      ))
      .filter((write): write is PostAcceptStorageWrite => Boolean(write))
      .filter((write) => write.nonEssential)
      .slice(0, 48);
    const preActionByIdentity = new Map(preActionStorage.map((item) => [storageKey(item), item]));
    const itemsCreatedOrChangedAfterAccept = postActionStorage.filter((item) => {
      const before = preActionByIdentity.get(storageKey(item));
      return item.nonEssential && before?.valueHash !== item.valueHash;
    }).slice(0, 24);
    const finalTcfSnapshot = observationResult.tcfData ??
      await readTcfData(page).catch(() => undefined);
    const finalTcfObservedAtEpochMs = observationResult.tcfData &&
        observationResult.tcfObservedAtEpochMs !== undefined
      ? observationResult.tcfObservedAtEpochMs
      : finalTcfSnapshot ? Date.now() : undefined;
    const tcfSnapshot = finalTcfSnapshot;
    const postAcceptTcfState = tcfSnapshot
      ? tcfState(
          tcfSnapshot,
          elapsed(parentScanStartedAtMs, finalTcfObservedAtEpochMs ?? Date.now()),
        )
      : undefined;
    const contradictionObserved = acceptanceContradictionObserved(
      selectedRecipe.confirmation,
      confirmedState,
      tcfSnapshot,
    );
    const observations = buildObservations({
      acceptanceRegisteredAtMs,
      contradictionObserved,
      postAcceptNonEssentialRequests,
      postAcceptTcfState,
      writesAfterAccept,
    });

    return finalize({
      resolverFound: true,
      registration,
      preActionCapturedAtMs,
      postActionCapturedAtMs,
      preActionStorage,
      postActionStorage,
      requests,
      postAcceptNonEssentialRequests,
      writesAfterAccept,
      itemsCreatedOrChangedAfterAccept,
      ...(postAcceptTcfState ? { postAcceptTcfState } : {}),
      observations,
    });
  } finally {
    if (resultBudgetTimer) clearTimeout(resultBudgetTimer);
    graphCapture?.finish("action_capture_closed");
    actionDiscovery?.dispose();
    await context?.close().catch(() => undefined);
    if (ownsBrowser) await browser?.close().catch(() => undefined);
  }
}

function validatedRecipes(input: PostAcceptObserverInput) {
  const selected = input.recipeCandidates?.length ? input.recipeCandidates : [input.recipe];
  const deduped = new Map<string, PostAcceptActionRecipe>();
  for (const recipe of selected.slice(0, 24)) {
    if (recipe.artifactVersion !== "certscore.post_accept_action_recipe.v1") continue;
    if (!recipe.controlSelector.trim() || !recipe.recipeId.trim()) continue;
    if (
      recipe.controlExpectedNormalizedLabel !== undefined &&
      (
        !recipe.controlExpectedNormalizedLabel.trim() ||
        recipe.controlExpectedNormalizedLabel.length > 240 ||
        recipe.controlExpectedNormalizedLabel !== normalizeAcceptControlLabel(
          recipe.controlExpectedNormalizedLabel,
        )
      )
    ) continue;
    deduped.set(recipe.recipeId, recipe);
  }
  if (deduped.size === 0) throw new Error("Post-Accept observer requires a deterministic action recipe.");
  return [...deduped.values()];
}

function unconfirmedRegistration(
  status: "not_attempted" | "unsupported" | "aborted",
  reason: string,
): PostAcceptRegistration {
  return { status, acceptanceExercised: false, reason, witnesses: [] };
}

async function waitForDeterministicRecipe(
  page: Page,
  recipes: PostAcceptActionRecipe[],
  timeoutMs: number,
  signal?: AbortSignal,
  discovery?: ConsentActionDiscovery,
): Promise<
  | {
      status: "found";
      recipe: PostAcceptActionRecipe;
      control: Locator;
      scope: Page | Frame;
    }
  | { status: "not_found" | "ambiguous" | "aborted" }
> {
  const deadlineAtMs = Date.now() + timeoutMs;
  let prioritizedRecipeId: string | undefined;
  do {
    if (signal?.aborted) return { status: "aborted" };
    const attemptRevision = discovery?.revision ?? 0;
    const matches: Array<{
      recipe: PostAcceptActionRecipe;
      control: Locator;
      scope: Page | Frame;
    }> = [];
    const viewportPendingRecipeIds: string[] = [];
    const recipesForAttempt = prioritizedRecipeId
      ? recipes.filter((recipe) => recipe.recipeId === prioritizedRecipeId)
      : recipes;
    for (const recipe of recipesForAttempt) {
      for (const scope of selectorScopes(page, recipe.controlFrameUrl)) {
        if (recipe.accessibleControl?.kind === "scoped_accessible_control") {
          const control = await resolveScopedAccessibleControl(scope, recipe.accessibleControl);
          if (control) {
            if (
              !cmpRecipeRequiresViewportHitTarget(recipe.cmpId) ||
              await locatorHasViewportHitTarget(control)
            ) {
              matches.push({ recipe, control, scope });
            } else {
              viewportPendingRecipeIds.push(recipe.recipeId);
            }
          }
          continue;
        }
        if (recipe.accessibleControl?.kind === "closed_shadow_accessible_control") {
          if (scope !== page) continue;
          const host = scope.locator(recipe.accessibleControl.scopeSelector);
          if (
            await host.count().catch(() => 0) === 1 &&
            await host.first().isVisible().catch(() => false) &&
            await closedShadowAccessibleControlAvailable(page, recipe.accessibleControl)
          ) matches.push({ recipe, control: host.first(), scope });
          continue;
        }
        const locator = scope.locator(recipe.controlSelector);
        const count = Math.min(await locator.count().catch(() => 0), 8);
        for (let index = 0; index < count; index += 1) {
          const control = locator.nth(index);
          const [visible, enabled] = await Promise.all([
            control.isVisible().catch(() => false),
            control.isEnabled().catch(() => false),
          ]);
          const expectedLabelPresent = recipe.controlExpectedNormalizedLabel === undefined ||
            (await normalizedAcceptLocatorLabels(control)).includes(
              recipe.controlExpectedNormalizedLabel,
            );
          if (visible && enabled && expectedLabelPresent) {
            if (
              !cmpRecipeRequiresViewportHitTarget(recipe.cmpId) ||
              await locatorHasViewportHitTarget(control)
            ) {
              matches.push({ recipe, control, scope });
            } else {
              viewportPendingRecipeIds.push(recipe.recipeId);
            }
          }
        }
      }
    }
    if (matches.length === 1) return { status: "found", ...matches[0]! };
    if (matches.length > 1) return { status: "ambiguous" };
    // Some exact named controls (notably HubSpot's animated first layer) are
    // initially visible and enabled while still outside the viewport. Once a
    // single exact recipe/selector/label candidate reaches that state, poll
    // only that registered recipe until it becomes a real hit target. If the
    // candidate disappears or becomes non-unique, return to the full registry
    // on the next attempt; no selector, label, or geometry rule is relaxed.
    prioritizedRecipeId = viewportPendingRecipeIds.length === 1
      ? viewportPendingRecipeIds[0]
      : undefined;
    if (Date.now() >= deadlineAtMs) break;
    const remainingMs = Math.max(0, deadlineAtMs - Date.now());
    const wakeAfterMs = Math.min(prioritizedRecipeId ? 25 : 150, remainingMs);
    if (discovery) {
      await discovery.waitForSignal(attemptRevision, wakeAfterMs, signal);
    } else {
      await waitForDelay(Math.min(50, wakeAfterMs), signal).catch(() => undefined);
    }
  } while (Date.now() <= deadlineAtMs);
  return { status: "not_found" };
}

type AcceptRecipeResolution = Awaited<ReturnType<typeof waitForDeterministicRecipe>>;

async function waitForDeterministicOrCanonicalAcceptRecipe(
  page: Page,
  recipes: PostAcceptActionRecipe[],
  timeoutMs: number,
  signal?: AbortSignal,
  discovery?: ConsentActionDiscovery,
): Promise<AcceptRecipeResolution> {
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
      const canonicalResolution = await waitForCanonicalAcceptControlRecipe(
        page,
        canonicalBudgetMs,
        signal,
        activeRuntimeRecipes,
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
      discovery,
    );
  }

  let sawAmbiguousResolution = false;
  // A production worker receives the bounded canonical registry, not one
  // site-specific recipe. Give the canonical classifier one geometry pass
  // before an all-registry selector sweep can consume the short search slice.
  // This is also the authorized best-attempt path for non-CMP first layers.
  // It reuses the existing deadline and adds no navigation or observer time.
  if (recipes.length > 1) {
    const initialCanonicalBudgetMs = Math.min(1_000, Math.max(0, deadlineAtMs - Date.now()));
    if (initialCanonicalBudgetMs > 0) {
      const initialCanonicalResolution = await waitForCanonicalAcceptControlRecipe(
        page,
        initialCanonicalBudgetMs,
        signal,
        recipes,
        discovery,
      );
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
        discovery,
      );
    }
    const namedResolution = await waitForDeterministicRecipe(
      page,
      recipes,
      // The canonical path is the primary live-control resolver. Probe legacy
      // selectors briefly so absent selectors do not consume short budgets.
      Math.min(50, Math.max(0, deadlineAtMs - Date.now())),
      signal,
      discovery,
    );
    if (namedResolution.status === "found" || namedResolution.status === "aborted") {
      return namedResolution;
    }
    if (namedResolution.status === "ambiguous") sawAmbiguousResolution = true;

    // Use the existing resolver budget. This does not add a navigation, lane,
    // reload, screenshot, or extension to the observer deadline.
    const canonicalBudgetMs = Math.min(750, Math.max(0, deadlineAtMs - Date.now()));
    if (canonicalBudgetMs <= 0) break;
    const canonicalResolution = await waitForCanonicalAcceptControlRecipe(
      page,
      canonicalBudgetMs,
      signal,
      recipes,
      discovery,
    );
    if (canonicalResolution.status === "found" || canonicalResolution.status === "aborted") {
      return canonicalResolution;
    }
    if (canonicalResolution.status === "ambiguous") sawAmbiguousResolution = true;
  } while (Date.now() < deadlineAtMs);

  const finalNamedResolution = await waitForDeterministicRecipe(
    page,
    recipes,
    0,
    signal,
    discovery,
  );
  if (finalNamedResolution.status === "found" || finalNamedResolution.status === "aborted") {
    return finalNamedResolution;
  }
  if (finalNamedResolution.status === "ambiguous") sawAmbiguousResolution = true;
  return { status: sawAmbiguousResolution ? "ambiguous" : "not_found" };
}

async function waitForCanonicalAcceptControlRecipe(
  page: Page,
  timeoutMs: number,
  signal?: AbortSignal,
  registeredRecipes: PostAcceptActionRecipe[] = [],
  discovery?: ConsentActionDiscovery,
  runtimeBoundRecipe?: PostAcceptActionRecipe,
): Promise<AcceptRecipeResolution> {
  const deadlineAtMs = Date.now() + timeoutMs;
  let sawAmbiguousCanonicalControl = false;
  do {
    if (signal?.aborted) return { status: "aborted" };
    const attemptRevision = discovery?.revision ?? 0;
    const geometry = await captureConsentControlGeometry(page, {
      candidateLimit: 48,
      containerLimit: 16,
      timeoutMs: Math.max(250, Math.min(750, timeoutMs || 250)),
    }).catch(() => undefined);
    const registeredCmpRecipe = selectCanonicalAcceptConfirmationRecipe(
      registeredRecipes,
      geometry?.cmp.name,
    ) ?? runtimeBoundRecipe;
    const candidates = collapseEquivalentCanonicalAcceptCandidates(
      geometry?.candidates.filter((candidate) =>
        candidate.actionType === "accept_all" &&
        candidate.decisionStatus === "confirmed_visible" &&
        candidate.layer === "first_layer" &&
        candidate.enabled &&
        candidate.intersectsViewport &&
        candidate.classifierConfidence >= 0.8 &&
        (candidate.consentContextConfirmed || registeredCmpRecipe !== undefined) &&
        Boolean(candidate.selectorHint) &&
        Boolean(candidate.containerSelectorHint)
      ) ?? [],
    );
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
      const scope = exactAcceptSelectorScope(page, controlFrameUrl);
      if (scope.status === "ambiguous") {
        sawAmbiguousCanonicalControl = true;
        continue;
      }
      if (scope.status !== "found") continue;
      const containerSelector = candidate.containerSelectorHint!;
      const containers = scope.scope.locator(containerSelector);
      if (await containers.count().catch(() => 0) !== 1) {
        sawAmbiguousCanonicalControl = true;
        continue;
      }
      if (!await containers.first().isVisible().catch(() => false)) continue;
      const controlSelector = candidate.selectorHint === containerSelector ||
          candidate.selectorHint.startsWith(`${containerSelector} `)
        ? candidate.selectorHint
        : `${containerSelector} ${candidate.selectorHint}`;
      const controls = scope.scope.locator(controlSelector);
      const controlCount = Math.min(await controls.count().catch(() => 0), 9);
      if (controlCount > 8) return { status: "ambiguous" };
      const actionableControls: Locator[] = [];
      for (let index = 0; index < controlCount; index += 1) {
        const control = controls.nth(index);
        if (
          await control.isVisible().catch(() => false) &&
          await control.isEnabled().catch(() => false) &&
          (await normalizedAcceptLocatorLabels(control)).includes(candidate.normalizedLabel) &&
          await locatorHasViewportHitTarget(control)
        ) actionableControls.push(control);
      }
      if (actionableControls.length > 1) {
        sawAmbiguousCanonicalControl = true;
        continue;
      }
      if (actionableControls.length !== 1) continue;
      const recipe: PostAcceptActionRecipe = {
        artifactVersion: "certscore.post_accept_action_recipe.v1",
        recipeId: `canonical-control:accept:v1:${hashValue([
          candidate.normalizedLabel,
          candidate.selectorHint,
          containerSelector,
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
        controlSelector,
        controlExpectedNormalizedLabel: candidate.normalizedLabel,
        ...(controlFrameUrl ? { controlFrameUrl } : {}),
        bannerSelector: containerSelector,
        ...(controlFrameUrl ? { bannerFrameUrl: controlFrameUrl } : {}),
        confirmation: registeredCmpRecipe?.confirmation ?? {
          kind: "canonical_accept_transition",
          controlSelector,
          ...(controlFrameUrl ? { controlFrameUrl } : {}),
          bannerSelector: containerSelector,
          ...(controlFrameUrl ? { bannerFrameUrl: controlFrameUrl } : {}),
        },
      };
      const resolved = await waitForDeterministicRecipe(
        page,
        [recipe],
        100,
        signal,
        discovery,
      );
      if (resolved.status === "ambiguous") sawAmbiguousCanonicalControl = true;
      else if (resolved.status !== "not_found") return resolved;
    }
    if (Date.now() >= deadlineAtMs) break;
    const waitMs = Math.min(150, Math.max(0, deadlineAtMs - Date.now()));
    if (discovery) await discovery.waitForSignal(attemptRevision, waitMs, signal);
    else await waitForDelay(Math.min(50, waitMs), signal).catch(() => undefined);
  } while (Date.now() <= deadlineAtMs);
  return { status: sawAmbiguousCanonicalControl ? "ambiguous" : "not_found" };
}

function selectCanonicalAcceptConfirmationRecipe(
  registeredRecipes: PostAcceptActionRecipe[],
  detectedCmpName?: string,
): PostAcceptActionRecipe | undefined {
  if (detectedCmpName) {
    const detectedMatches = registeredRecipes.filter((recipe) =>
      recipe.cmpId?.toLowerCase() === detectedCmpName.toLowerCase()
    );
    if (detectedMatches.length === 1) return detectedMatches[0];
  }
  return undefined;
}

function exactAcceptSelectorScope(
  page: Page,
  childFrameUrl?: string,
): { status: "found"; scope: Page | Frame } | { status: "not_found" | "ambiguous" } {
  if (!childFrameUrl) return { status: "found", scope: page };
  const matches = page.frames().filter((frame) =>
    frame !== page.mainFrame() && frame.url() === childFrameUrl
  );
  if (matches.length === 0) return { status: "not_found" };
  if (matches.length > 1) return { status: "ambiguous" };
  return { status: "found", scope: matches[0]! };
}

function normalizeAcceptControlLabel(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

async function normalizedAcceptLocatorLabels(locator: Locator) {
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
    return [...new Set(labels.map(normalizeAcceptControlLabel).filter(Boolean))];
  } finally {
    await handle.dispose().catch(() => undefined);
  }
}

function collapseEquivalentCanonicalAcceptCandidates(
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
  return [...groups.values()].flatMap((group) => {
    if (group.length < 2 || !group[0]?.containerSelectorHint) return group;
    const interactive = group.filter((candidate) =>
      candidate.tagName.toLowerCase() === "button" ||
      candidate.tagName.toLowerCase() === "input" ||
      candidate.role?.toLowerCase() === "button"
    );
    return interactive.length === 1 ? interactive : group;
  });
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
  recipes: PostAcceptActionRecipe[],
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

async function trialAcceptControl(
  page: Page,
  control: Locator,
  recipe: PostAcceptActionRecipe,
) {
  if (recipe.accessibleControl?.kind === "closed_shadow_accessible_control") {
    if (!await closedShadowAccessibleControlAvailable(page, recipe.accessibleControl)) {
      throw new Error("Closed-shadow Accept control is not uniquely actionable.");
    }
    return;
  }
  await control.click({ trial: true, timeout: 1_000 });
}

async function dispatchAcceptControl(
  page: Page,
  control: Locator,
  recipe: PostAcceptActionRecipe,
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

function selectorScope(page: Page, childFrameUrl?: string): Page | Frame | undefined {
  if (!childFrameUrl) return page;
  const matches = page.frames().filter((frame) => frame !== page.mainFrame() && frame.url() === childFrameUrl);
  return matches.length === 1 ? matches[0] : undefined;
}

function selectorScopes(page: Page, childFrameUrl?: string): Array<Page | Frame> {
  if (childFrameUrl) {
    const scope = selectorScope(page, childFrameUrl);
    return scope ? [scope] : [];
  }
  return [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
}

async function captureConfirmationBaseline(
  context: BrowserContext,
  page: Page,
  confirmationScope: Page | Frame,
  confirmation: PostAcceptActionRecipe["confirmation"],
): Promise<ConfirmationBaseline> {
  if (confirmation.kind === "canonical_accept_transition") {
    const [controlVisible, bannerVisible, bannerStateHash] = await Promise.all([
      locatorIsVisible(page, confirmation.controlSelector, confirmation.controlFrameUrl),
      locatorIsVisible(page, confirmation.bannerSelector, confirmation.bannerFrameUrl),
      visibleAcceptLocatorStateHash(
        page,
        confirmation.bannerSelector,
        confirmation.bannerFrameUrl,
      ),
    ]);
    return {
      kind: confirmation.kind,
      controlVisible,
      bannerVisible,
      ...(bannerStateHash ? { bannerStateHash } : {}),
      pageUrl: page.url(),
    };
  }
  if (confirmation.kind === "local_storage_equals") {
    return {
      kind: confirmation.kind,
      lastSequence: (await readStorageWrites(confirmationScope)).at(-1)?.sequence ?? 0,
    };
  }
  if (confirmation.kind === "cmp_cookie_values_equal") {
    const states = await exactCookieStates(context, confirmation.cookies);
    return {
      kind: confirmation.kind,
      stateHashes: Object.fromEntries(confirmation.cookies.map((cookie) => [
        cookieKey(cookie),
        states[cookieKey(cookie)]?.stateHash,
      ])),
    };
  }
  if (confirmation.kind === "cmp_cookie_changed") {
    return {
      kind: confirmation.kind,
      cookieStateHash: await cookieState(context, confirmation.cookieName),
    };
  }
  if (confirmation.kind === "cmp_cookie_names_changed") {
    const cookieNames = confirmation.cookieNames.slice(0, 8);
    return {
      kind: confirmation.kind,
      cookieStateHashes: Object.fromEntries(await Promise.all(cookieNames.map(async (cookieName) => [
        cookieName,
        await cookieState(context, cookieName),
      ] as const))),
    };
  }
  if (confirmation.kind === "cmp_api_consent_state_changed") {
    const snapshot = await readCmpApiConsentSnapshot(confirmationScope, confirmation.provider);
    return {
      kind: confirmation.kind,
      canonicalState: snapshot?.canonicalState,
      eventSequence: snapshot?.eventSequence ?? 0,
    };
  }
  if (confirmation.kind === "tcf_purposes_granted_or_cmp_cookie_changed") {
    const [snapshot, cookieStateHash] = await Promise.all([
      readTcfData(page).catch(() => undefined),
      cookieState(context, confirmation.cookieName),
    ]);
    return { kind: confirmation.kind, snapshot, cookieStateHash };
  }
  const keys = confirmation.keys.slice(0, 8);
  const [snapshot, stateEntries, writes] = await Promise.all([
    readTcfData(page).catch(() => undefined),
    Promise.all(keys.map(async (key) => [
      key,
      await storageStateHash(confirmationScope, confirmation.storageType, key),
    ] as const)),
    readStorageWrites(confirmationScope),
  ]);
  return {
    kind: confirmation.kind,
    snapshot,
    storageStateHashes: Object.fromEntries(stateEntries),
    lastSequence: writes.at(-1)?.sequence ?? 0,
  };
}

async function waitForAcceptanceConfirmation(
  context: BrowserContext,
  page: Page,
  confirmationScope: Page | Frame,
  confirmation: PostAcceptActionRecipe["confirmation"],
  baseline: ConfirmationBaseline,
  actionDispatchedAtEpochMs: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ConfirmationState | undefined> {
  if (confirmation.kind === "canonical_accept_transition") {
    if (
      baseline.kind !== "canonical_accept_transition" ||
      !baseline.controlVisible ||
      !baseline.bannerVisible ||
      confirmation.bannerSelector === confirmation.controlSelector
    ) return undefined;
    const deadlineAtMs = Date.now() + timeoutMs;
    while (Date.now() <= deadlineAtMs) {
      if (signal?.aborted) return undefined;
      const [controlVisible, bannerVisible, bannerStateHash] = await Promise.all([
        locatorIsVisible(page, confirmation.controlSelector, confirmation.controlFrameUrl),
        locatorIsVisible(page, confirmation.bannerSelector, confirmation.bannerFrameUrl),
        visibleAcceptLocatorStateHash(
          page,
          confirmation.bannerSelector,
          confirmation.bannerFrameUrl,
        ),
      ]);
      const sameDocument = normalizeTargetUrl(page.url()) === normalizeTargetUrl(baseline.pageUrl);
      const transitionKind = !bannerVisible
        ? "consent_surface_hidden"
        : baseline.bannerStateHash && bannerStateHash && baseline.bannerStateHash !== bannerStateHash
          ? "consent_surface_replaced_with_acknowledgement"
          : undefined;
      if (!controlVisible && sameDocument && transitionKind) {
        return {
          stateHash: hashValue(JSON.stringify([
            "canonical_first_layer_accept_ui_transition.v1",
            transitionKind,
            baseline.pageUrl,
            confirmation.controlSelector,
            confirmation.controlFrameUrl ?? "main_frame",
            confirmation.bannerSelector,
            confirmation.bannerFrameUrl ?? "main_frame",
            baseline.bannerStateHash ?? "",
            bannerStateHash ?? "",
          ])),
          witnessType: "canonical_acceptance_state",
          expectedState: transitionKind === "consent_surface_hidden"
            ? "canonical_first_layer_accept_control_and_consent_surface_hidden_after_completed_action"
            : "canonical_first_layer_accept_control_hidden_and_consent_surface_replaced_after_completed_action",
        };
      }
      await waitForDelay(25, signal).catch(() => undefined);
    }
    return undefined;
  }
  const deadlineAtMs = Date.now() + timeoutMs;
  while (Date.now() <= deadlineAtMs) {
    if (signal?.aborted) return undefined;
    if (confirmation.kind === "local_storage_equals" && baseline.kind === confirmation.kind) {
      const value = await confirmationScope.evaluate(
        (key) => window.localStorage.getItem(key),
        confirmation.key,
      ).catch(() => null);
      const freshWrite = (await readStorageWrites(confirmationScope)).some((write) =>
        write.sequence > baseline.lastSequence &&
        write.observedAtEpochMs >= actionDispatchedAtEpochMs &&
        write.storageType === "local_storage" &&
        write.name === confirmation.key
      );
      if (freshWrite && value === confirmation.expectedValue) {
        return {
          stateHash: hashValue(value),
          witnessType: "cmp_storage_state",
          key: confirmation.key,
          expectedState: confirmation.expectedValue,
        };
      }
    } else if (confirmation.kind === "cmp_cookie_values_equal" && baseline.kind === confirmation.kind) {
      const states = await exactCookieStates(context, confirmation.cookies);
      const complete = confirmation.cookies.every((cookie) =>
        states[cookieKey(cookie)]?.value === cookie.expectedValue
      );
      const changed = confirmation.cookies.some((cookie) =>
        states[cookieKey(cookie)]?.stateHash !== baseline.stateHashes[cookieKey(cookie)]
      );
      if (complete && changed) {
        return {
          stateHash: hashValue(JSON.stringify(confirmation.cookies.map((cookie) =>
            states[cookieKey(cookie)]?.stateHash ?? null
          ))),
          witnessType: "cmp_cookie_state",
          key: confirmation.cookies.map((cookie) => cookie.name).join(",").slice(0, 160),
          expectedState: "canonical_cmp_acceptance_cookie_values_written_after_accept",
        };
      }
    } else if (confirmation.kind === "cmp_cookie_changed" && baseline.kind === confirmation.kind) {
      const currentCookieState = await cookieState(context, confirmation.cookieName);
      if (currentCookieState && currentCookieState !== baseline.cookieStateHash) {
        return {
          stateHash: currentCookieState,
          witnessType: "cmp_cookie_state",
          key: confirmation.cookieName,
          expectedState: "canonical_cmp_consent_state_changed_after_accept",
        };
      }
    } else if (confirmation.kind === "cmp_cookie_names_changed" && baseline.kind === confirmation.kind) {
      for (const cookieName of confirmation.cookieNames.slice(0, 8)) {
        const currentCookieState = await cookieState(context, cookieName);
        if (currentCookieState && currentCookieState !== baseline.cookieStateHashes[cookieName]) {
          return {
            stateHash: currentCookieState,
            witnessType: "cmp_cookie_state",
            key: cookieName,
            expectedState: "canonical_cmp_consent_state_changed_after_accept",
          };
        }
      }
    } else if (
      confirmation.kind === "cmp_api_consent_state_changed" &&
      baseline.kind === confirmation.kind
    ) {
      const snapshot = await readCmpApiConsentSnapshot(confirmationScope, confirmation.provider);
      const changed = Boolean(
        snapshot?.canonicalState && snapshot.canonicalState !== baseline.canonicalState
      );
      const freshEvent = (snapshot?.eventSequence ?? 0) > baseline.eventSequence;
      if (snapshot?.decision === "granted" && (changed || freshEvent)) {
        return {
          stateHash: hashValue(snapshot.canonicalState),
          witnessType: "cmp_api_state",
          key: confirmation.provider,
          expectedState: "all_configurable_purposes_granted_after_accept",
        };
      }
    } else if (
      confirmation.kind === "tcf_purposes_granted_or_cmp_cookie_changed" &&
      baseline.kind === confirmation.kind
    ) {
      const snapshot = await readTcfData(page).catch(() => undefined);
      if (tcfPurposesGranted(snapshot, confirmation.purposeIds, baseline.snapshot)) {
        return {
          stateHash: snapshot!.tcStringHash ?? hashValue(JSON.stringify(snapshot!.purposeConsents)),
          witnessType: "tcf_user_action_complete",
          expectedState: "configured_purposes_granted_after_accept",
        };
      }
      const currentCookieState = await cookieState(context, confirmation.cookieName);
      if (currentCookieState && currentCookieState !== baseline.cookieStateHash) {
        return {
          stateHash: currentCookieState,
          witnessType: "cmp_cookie_state",
          key: confirmation.cookieName,
          expectedState: "canonical_cmp_consent_state_changed_after_accept",
        };
      }
    } else if (
      confirmation.kind === "tcf_purposes_granted_or_cmp_storage_keys_changed" &&
      baseline.kind === confirmation.kind
    ) {
      const snapshot = await readTcfData(page).catch(() => undefined);
      if (tcfPurposesGranted(snapshot, confirmation.purposeIds, baseline.snapshot)) {
        return {
          stateHash: snapshot!.tcStringHash ?? hashValue(JSON.stringify(snapshot!.purposeConsents)),
          witnessType: "tcf_user_action_complete",
          expectedState: "configured_purposes_granted_after_accept",
        };
      }
      const writes = await readStorageWrites(confirmationScope);
      for (const key of confirmation.keys.slice(0, 8)) {
        const freshWrite = writes.some((write) =>
          write.sequence > baseline.lastSequence &&
          write.observedAtEpochMs >= actionDispatchedAtEpochMs &&
          write.storageType === confirmation.storageType &&
          write.name === key
        );
        if (!freshWrite) continue;
        const stateHash = await storageStateHash(confirmationScope, confirmation.storageType, key);
        if (stateHash && stateHash !== baseline.storageStateHashes[key]) {
          return {
            stateHash,
            witnessType: "cmp_storage_state",
            key,
            expectedState: "canonical_cmp_consent_state_changed_after_accept",
          };
        }
      }
    }
    await waitForDelay(25, signal).catch(() => undefined);
  }
  return undefined;
}

function tcfPurposesGranted(
  snapshot: TcfDataSnapshot | undefined,
  purposeIds: number[],
  baseline: TcfDataSnapshot | undefined,
) {
  return Boolean(
    snapshot?.success &&
    snapshot.eventStatus === "useractioncomplete" &&
    purposeIds.length > 0 &&
    purposeIds.every((purposeId) => snapshot.purposeConsents[String(purposeId)] === true) &&
    (!baseline || tcfFingerprint(snapshot) !== tcfFingerprint(baseline))
  );
}

function acceptanceContradictionObserved(
  confirmation: PostAcceptActionRecipe["confirmation"],
  confirmedState: ConfirmationState,
  snapshot: TcfDataSnapshot | undefined,
) {
  if (
    confirmedState.witnessType === "tcf_user_action_complete" ||
    !snapshot?.success ||
    snapshot.eventStatus !== "useractioncomplete" ||
    !("purposeIds" in confirmation) ||
    confirmation.purposeIds.length === 0
  ) return false;
  return confirmation.purposeIds.every((purposeId) =>
    snapshot.purposeConsents[String(purposeId)] === false
  );
}

async function waitForPostAcceptObservation(input: {
  confirmation: PostAcceptActionRecipe["confirmation"];
  confirmedState: ConfirmationState;
  getCapturedRequests: () => CapturedRequest[];
  observationWindowMs: number;
  page: Page;
  parentScanStartedAtMs: number;
  acceptanceRegisteredAtEpochMs: number;
  signal?: AbortSignal;
  targetUrl: string;
}): Promise<{
  completed: boolean;
  reason?: PostAcceptEvidencePacket["timing"]["observationExitReason"];
  tcfData?: TcfDataSnapshot;
  tcfObservedAtEpochMs?: number;
}> {
  const observationDeadlineAtMs = Date.now() + input.observationWindowMs;
  let earlyExitDeadlineAtMs: number | undefined;
  let firstSignalReason: Exclude<
    PostAcceptEvidencePacket["timing"]["observationExitReason"],
    "window_elapsed" | undefined
  > | undefined = undefined;
  let lastTcfPollAtMs = 0;
  let lastTcfData: TcfDataSnapshot | undefined;
  let lastTcfObservedAtEpochMs: number | undefined;
  const retainFirstSignal = (reason: typeof firstSignalReason) => {
    if (firstSignalReason) return;
    firstSignalReason = reason;
    earlyExitDeadlineAtMs = Math.min(
      observationDeadlineAtMs,
      Date.now() + POST_ACCEPT_EARLY_SIGNAL_SETTLE_MS,
    );
  };

  while (Date.now() < observationDeadlineAtMs) {
    if (input.signal?.aborted) {
      return {
        completed: false,
        ...(firstSignalReason ? { reason: firstSignalReason } : {}),
        ...(lastTcfData
          ? { tcfData: lastTcfData, tcfObservedAtEpochMs: lastTcfObservedAtEpochMs }
          : {}),
      };
    }

    if (Date.now() - lastTcfPollAtMs >= 100) {
      lastTcfPollAtMs = Date.now();
      lastTcfData = await pollWithinPostAcceptObservationDeadline(
        () => readTcfData(input.page).catch(() => undefined),
        undefined,
        earlyExitDeadlineAtMs ?? observationDeadlineAtMs,
      );
      lastTcfObservedAtEpochMs = lastTcfData ? Date.now() : undefined;
      if (acceptanceContradictionObserved(
        input.confirmation,
        input.confirmedState,
        lastTcfData,
      )) {
        retainFirstSignal("acceptance_signal_contradiction_observed");
      }
    }

    const requests = classifyRequests(
      input.getCapturedRequests(),
      input.parentScanStartedAtMs,
      input.acceptanceRegisteredAtEpochMs,
    );
    if (requests.some((request) =>
      request.nonEssential &&
      !request.inFlightAtAcceptanceRegistration &&
      typeof request.msOffsetFromAccept === "number" &&
      request.msOffsetFromAccept >= 0
    )) {
      retainFirstSignal("non_essential_request_observed");
    }

    const writes = await pollWithinPostAcceptObservationDeadline(
      () => readStorageWrites(input.page),
      [],
      earlyExitDeadlineAtMs ?? observationDeadlineAtMs,
    );
    if (writes
      .filter((write) => write.observedAtEpochMs > input.acceptanceRegisteredAtEpochMs)
      .map((write) => classifyStorageWrite(
        write,
        input.parentScanStartedAtMs,
        input.acceptanceRegisteredAtEpochMs,
        input.targetUrl,
        [],
      ))
      .some((write) => write?.nonEssential)
    ) {
      retainFirstSignal("non_essential_storage_write_observed");
    }

    if (earlyExitDeadlineAtMs !== undefined && Date.now() >= earlyExitDeadlineAtMs) {
      return {
        completed: true,
        reason: firstSignalReason!,
        ...(lastTcfData
          ? { tcfData: lastTcfData, tcfObservedAtEpochMs: lastTcfObservedAtEpochMs }
          : {}),
      };
    }

    const nextDeadlineAtMs = Math.min(
      observationDeadlineAtMs,
      earlyExitDeadlineAtMs ?? observationDeadlineAtMs,
    );
    await waitForDelay(
      Math.min(25, Math.max(0, nextDeadlineAtMs - Date.now())),
      input.signal,
    ).catch(() => undefined);
  }

  return {
    completed: !input.signal?.aborted,
    reason: firstSignalReason ?? "window_elapsed",
    ...(lastTcfData
      ? { tcfData: lastTcfData, tcfObservedAtEpochMs: lastTcfObservedAtEpochMs }
      : {}),
  };
}

async function pollWithinPostAcceptObservationDeadline<T>(
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

function buildObservations(input: {
  acceptanceRegisteredAtMs: number;
  contradictionObserved: boolean;
  postAcceptNonEssentialRequests: PostAcceptNetworkRequest[];
  postAcceptTcfState?: PostRefusalTcfState;
  writesAfterAccept: PostAcceptStorageWrite[];
}): PostAcceptObservation[] {
  const observations: PostAcceptObservation[] = [];
  for (const request of input.postAcceptNonEssentialRequests) {
    observations.push({
      observationType: "post_accept_non_essential_activity",
      observedAtMs: request.startedAtMs,
      ...(request.vendor ? { vendor: request.vendor } : {}),
      ...(request.hostname ? { hostname: request.hostname } : {}),
      requestId: request.requestId,
      msOffsetFromAccept: Math.max(0, request.msOffsetFromAccept ?? 0),
      evidenceKeys: ["confirmed_acceptance_registration", "request_started_after_accept"],
    });
  }
  for (const write of input.writesAfterAccept.filter((write) => write.nonEssential)) {
    observations.push({
      observationType: "post_accept_non_essential_activity",
      observedAtMs: write.observedAtMs,
      ...(write.vendor ? { vendor: write.vendor } : {}),
      ...(write.hostname ? { hostname: write.hostname } : {}),
      storageType: write.storageType,
      storageName: write.name,
      ...(write.identityHash ? { storageIdentityHash: write.identityHash } : {}),
      msOffsetFromAccept: write.msOffsetFromAccept,
      evidenceKeys: ["confirmed_acceptance_registration", "storage_write_after_accept"],
    });
  }
  if (input.contradictionObserved && input.postAcceptTcfState) {
    observations.push({
      observationType: "acceptance_signal_contradicts_action",
      observedAtMs: input.postAcceptTcfState.observedAtMs,
      msOffsetFromAccept: Math.max(
        0,
        input.postAcceptTcfState.observedAtMs - input.acceptanceRegisteredAtMs,
      ),
      evidenceKeys: ["confirmed_acceptance_registration", "post_accept_tcf_denial_state"],
    });
  }
  return observations.slice(0, 32);
}

function classifyRequests(
  captured: CapturedRequest[],
  scanStartedAtMs: number,
  acceptanceRegisteredAtEpochMs?: number,
): PostAcceptNetworkRequest[] {
  return captured.map((entry) => {
    const url = entry.request.url();
    const vendor = vendorFor({ type: "request", url });
    const offset = acceptanceRegisteredAtEpochMs === undefined
      ? undefined
      : Math.round(entry.startedAtEpochMs - acceptanceRegisteredAtEpochMs);
    return {
      requestId: entry.requestId,
      sanitizedUrl: sanitizeUrl(url),
      ...(hostnameFromUrl(url) ? { hostname: hostnameFromUrl(url) } : {}),
      resourceType: entry.request.resourceType(),
      startedAtMs: elapsed(scanStartedAtMs, entry.startedAtEpochMs),
      ...(entry.completedAtEpochMs === undefined
        ? {}
        : { completedAtMs: elapsed(scanStartedAtMs, entry.completedAtEpochMs) }),
      inFlightAtAcceptanceRegistration: entry.inFlightAtAcceptanceRegistration,
      ...(offset === undefined ? {} : { msOffsetFromAccept: offset }),
      ...(vendor ? { vendor: vendor.vendor, purpose: vendor.purpose } : {}),
      nonEssential: vendor ? NON_ESSENTIAL_PURPOSES.has(vendor.purpose) : false,
    };
  });
}

async function captureStorage(
  context: BrowserContext,
  page: Page,
  targetUrl: string,
  limitations: string[],
  onCookies?: (cookies: unknown[]) => void,
): Promise<PostRefusalStorageItem[]> {
  const pageStorage = await page.evaluate(() => {
    const read = (storage: Storage) => Object.entries(storage).slice(0, 384);
    let localStorage: Array<[string, string]> = [];
    let sessionStorage: Array<[string, string]> = [];
    try { localStorage = read(window.localStorage); } catch {}
    try { sessionStorage = read(window.sessionStorage); } catch {}
    return { localStorage, sessionStorage };
  }).catch(() => ({
    localStorage: [] as Array<[string, string]>,
    sessionStorage: [] as Array<[string, string]>,
  }));
  let snapshotUrl = new URL(targetUrl);
  try { snapshotUrl = new URL(page.url()); } catch {}
  const hostname = snapshotUrl.hostname;
  const origin = snapshotUrl.origin;
  const cookies = await context.cookies().catch(() => {
    limitations.push("cookie_snapshot_unavailable");
    return [];
  });
  onCookies?.(cookies);
  const items: PostRefusalStorageItem[] = [];
  for (const cookie of cookies.slice(0, 384)) {
    items.push(classifyStorageItem({
      storageType: "cookie",
      name: cookie.name,
      value: cookie.value,
      hostname: cookie.domain.replace(/^\./, "") || hostname,
      identityBasis: "cookie_name_domain_path_partition",
      identityHash: postRefusalStorageIdentityHash({
        storageType: "cookie",
        name: cookie.name,
        hostname: cookie.domain.replace(/^\./, "") || hostname,
        cookiePath: cookie.path,
        partitionKey: cookie.partitionKey,
      }),
    }));
  }
  for (const [name, value] of pageStorage.localStorage) {
    items.push(classifyStorageItem({
      storageType: "local_storage",
      name,
      value,
      hostname,
      identityBasis: "origin_storage_key",
      identityHash: postRefusalStorageIdentityHash({ storageType: "local_storage", name, origin }),
    }));
  }
  for (const [name, value] of pageStorage.sessionStorage) {
    items.push(classifyStorageItem({
      storageType: "session_storage",
      name,
      value,
      hostname,
      identityBasis: "origin_storage_key",
      identityHash: postRefusalStorageIdentityHash({ storageType: "session_storage", name, origin }),
    }));
  }
  return items.sort((left, right) =>
    Number(right.nonEssential) - Number(left.nonEssential) || storageKey(left).localeCompare(storageKey(right))
  ).slice(0, MAX_STORAGE_ITEMS);
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
  acceptedAtEpochMs: number,
  targetUrl: string,
  postStorage: PostRefusalStorageItem[],
): PostAcceptStorageWrite | undefined {
  if (!write.name) return undefined;
  const hostname = new URL(targetUrl).hostname;
  const retained = postStorage.find((item) =>
    item.storageType === write.storageType && item.name === write.name
  );
  const vendor = write.storageType === "cookie"
    ? vendorFor({ type: "cookie", cookieName: write.name, hostname })
    : vendorFor({ type: "cmp_runtime", storageKey: write.name, hostname });
  return {
    storageType: write.storageType,
    name: write.name.slice(0, 180),
    hostname,
    ...(retained?.identityHash ? { identityHash: retained.identityHash } : {}),
    observedAtMs: elapsed(scanStartedAtMs, write.observedAtEpochMs),
    msOffsetFromAccept: Math.max(0, Math.round(write.observedAtEpochMs - acceptedAtEpochMs)),
    evidenceSource: "instrumented_write",
    ...(vendor ? { vendor: vendor.vendor, purpose: vendor.purpose } : {}),
    nonEssential: vendor ? NON_ESSENTIAL_PURPOSES.has(vendor.purpose) : false,
  };
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
    sourceScanner: POST_ACCEPT_SOURCE,
    scenario: "accept_all_flow",
    consentStateAtTime: "post_accept",
    matchSource: input.type === "request"
      ? "network_request"
      : input.cookieName
        ? "cookie_name"
        : "storage_key",
  }]).sort((left, right) => right.confidence - left.confidence)[0];
}

async function installStorageWriteProbe(page: Page) {
  await page.addInitScript({ content: `(() => {
    const records = [];
    let sequence = 0;
    const retain = (record) => {
      records.push({ ...record, sequence: ++sequence });
      if (records.length > 192) records.splice(0, records.length - 192);
    };
    Object.defineProperty(window, "__certscoreReadPostAcceptWrites", {
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

async function readStorageWrites(scope: Page | Frame): Promise<InstrumentedStorageWrite[]> {
  return scope.evaluate(() => {
    const read = (window as unknown as {
      __certscoreReadPostAcceptWrites?: () => InstrumentedStorageWrite[];
    }).__certscoreReadPostAcceptWrites;
    return typeof read === "function" ? read() : [];
  }).catch(() => []);
}

async function readTcfData(page: Page): Promise<TcfDataSnapshot | undefined> {
  const raw = await page.evaluate(`(() => {
    const api = window.__tcfapi;
    if (typeof api !== "function") return Promise.resolve(undefined);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
      const timer = setTimeout(() => finish({ purposeConsents: {}, success: false }), 250);
      try {
        api("getTCData", 2, (data, success) => finish({
          ...(data && typeof data.eventStatus === "string" ? { eventStatus: data.eventStatus } : {}),
          purposeConsents: Object.fromEntries(Object.entries(data?.purpose?.consents || {})
            .filter(([key, value]) => /^\\d{1,2}$/.test(key) && typeof value === "boolean").slice(0, 24)),
          success: success === true,
          ...(data && typeof data.tcString === "string" ? { tcString: data.tcString.slice(0, 2048) } : {})
        }));
      } catch (_) { finish({ purposeConsents: {}, success: false }); }
    });
  })()`) as {
    eventStatus?: string;
    purposeConsents: Record<string, boolean>;
    success: boolean;
    tcString?: string;
  } | undefined;
  if (!raw) return undefined;
  const decoded = decodeTcfV2PurposeConsents(raw.tcString);
  return {
    eventStatus: raw.eventStatus,
    purposeConsents: raw.purposeConsents,
    success: raw.success,
    ...(raw.tcString ? { tcStringHash: hashValue(raw.tcString) } : {}),
    tcStringParseStatus: decoded.status,
    tcStringPurposeConsents: decoded.purposeConsents,
  };
}

function tcfState(snapshot: TcfDataSnapshot, observedAtMs: number): PostRefusalTcfState {
  const source = snapshot.tcStringParseStatus === "parsed_v2"
    ? snapshot.tcStringPurposeConsents
    : snapshot.success ? snapshot.purposeConsents : {};
  const purposeGrantedIds = Object.entries(source).flatMap(([key, granted]) => {
    const purposeId = Number(key);
    return granted && Number.isInteger(purposeId) && purposeId >= 1 && purposeId <= 24
      ? [purposeId]
      : [];
  }).sort((left, right) => left - right);
  return {
    observedAtMs,
    ...(snapshot.eventStatus ? { eventStatus: snapshot.eventStatus } : {}),
    apiSuccess: snapshot.success,
    ...(snapshot.tcStringHash ? { tcStringHash: snapshot.tcStringHash } : {}),
    tcStringParseStatus: snapshot.tcStringParseStatus,
    purposeGrantedIds,
    purposeGrantSource: snapshot.tcStringParseStatus === "parsed_v2"
      ? "tc_string"
      : snapshot.success ? "tcf_api" : "none",
  };
}

function tcfFingerprint(snapshot: TcfDataSnapshot) {
  return hashValue(JSON.stringify({
    eventStatus: snapshot.eventStatus ?? null,
    purposeConsents: snapshot.purposeConsents,
    tcStringHash: snapshot.tcStringHash ?? null,
  }));
}

async function exactCookieStates(
  context: BrowserContext,
  expectations: Array<{ expectedValue: string; name: string; path: string }>,
) {
  const cookies = await context.cookies();
  return Object.fromEntries(expectations.map((expectation) => {
    const matches = cookies.filter((cookie) =>
      cookie.name === expectation.name && cookie.path === expectation.path
    ).sort((left, right) => left.domain.localeCompare(right.domain));
    const value = matches.length === 1 ? matches[0]!.value : undefined;
    return [cookieKey(expectation), value === undefined ? undefined : {
      value,
      stateHash: hashValue(JSON.stringify(matches.map((cookie) => [
        cookie.name,
        cookie.domain,
        cookie.path,
        hashValue(cookie.value),
      ]))),
    }];
  }));
}

function cookieKey(input: { name: string; path: string }) {
  return `${input.name}:${input.path}`;
}

async function cookieState(context: BrowserContext, cookieName: string) {
  const states = (await context.cookies()).filter((cookie) =>
    matchesCanonicalCmpCookieName(cookie.name, cookieName)
  ).map((cookie) => [
    cookie.name,
    cookie.domain.toLowerCase().replace(/^\./, ""),
    cookie.path,
    hashValue(cookie.value),
  ]).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return states.length > 0 ? hashValue(JSON.stringify(states)) : undefined;
}

async function storageStateHash(
  scope: Page | Frame,
  storageType: "local_storage" | "session_storage",
  key: string,
) {
  const value = await scope.evaluate(({ storageType, key }) => {
    const storage = storageType === "local_storage" ? window.localStorage : window.sessionStorage;
    return storage.getItem(key);
  }, { storageType, key }).catch(() => null);
  return value === null ? undefined : hashValue(value);
}

function storageKey(item: Pick<PostRefusalStorageItem, "storageType" | "name" | "hostname" | "identityHash">) {
  return item.identityHash
    ? `${item.storageType}:identity:${item.identityHash}`
    : `${item.storageType}:${item.hostname ?? ""}:${item.name}`;
}

async function locatorIsVisible(page: Page, selector: string, childFrameUrl?: string) {
  const scope = selectorScope(page, childFrameUrl);
  return scope ? scope.locator(selector).first().isVisible().catch(() => false) : false;
}

async function visibleAcceptLocatorStateHash(
  page: Page,
  selector: string,
  childFrameUrl?: string,
): Promise<string | undefined> {
  const scope = selectorScope(page, childFrameUrl);
  if (!scope) return undefined;
  const locator = scope.locator(selector);
  const count = Math.min(await locator.count().catch(() => 0), 2);
  const visible: Locator[] = [];
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

async function waitForPassiveRedirectSettle(page: Page, timeoutMs: number, signal?: AbortSignal) {
  const deadlineAtMs = Date.now() + timeoutMs;
  let lastUrl = page.url();
  let stableSinceMs = Date.now();
  while (Date.now() <= deadlineAtMs) {
    if (signal?.aborted) return false;
    const currentUrl = page.url();
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      stableSinceMs = Date.now();
    }
    if (Date.now() - stableSinceMs >= 150) return true;
    await waitForDelay(25, signal).catch(() => undefined);
  }
  return false;
}

function classifyClickFailure(error: unknown): "actionability_timeout" | "detached" | "intercepted" | "navigation" | "other" {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("timeout")) return "actionability_timeout";
  if (message.includes("detached")) return "detached";
  if (message.includes("intercept")) return "intercepted";
  if (message.includes("navigation")) return "navigation";
  return "other";
}

function classifyBrowserError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("timeout")) return "timeout";
  if (message.includes("dns") || message.includes("name_not_resolved")) return "dns";
  if (message.includes("certificate") || message.includes("ssl")) return "tls";
  if (message.includes("connection")) return "connection";
  return "other";
}

function normalizeTargetUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function sanitizeUrl(value: string) {
  const url = new URL(value);
  url.search = "";
  url.hash = "";
  return url.toString().slice(0, 500);
}

function hostnameFromUrl(value: string) {
  try { return new URL(value).hostname.slice(0, 255); } catch { return undefined; }
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function elapsed(startedAtMs: number, atMs = Date.now()) {
  return Math.max(0, Math.round(atMs - startedAtMs));
}

function boundedMs(value: number | undefined, fallback: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value ?? fallback)));
}

async function waitForDelay(delayMs: number, signal?: AbortSignal) {
  if (delayMs <= 0) return;
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("Post-Accept observation aborted."));
    const timer = setTimeout(resolve, delayMs);
    timer.unref?.();
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Post-Accept observation aborted."));
    }, { once: true });
  });
}
