import {installConsentReceiptCapture,receiptCaptureToken,retainReceiptCookies} from './consent-receipt-capture.js';
import { isComplianzControl } from "./complianz-consent-state.js";
import { CMP_PASSIVE_EVENT_INIT_SCRIPT, installCmpPassiveDiagnostics } from "./cmp-passive-diagnostics.js";
import { retainNotificationAcknowledgment, type ExistingApiRead } from "./notification-acknowledgment.js";
import { installOneTrustSdkSourceCapture } from "./onetrust-sdk-source.js";
import { confirmationDiagnostics } from "./consent-confirmation-diagnostics.js";
import { firstVerifiedConsentRead } from "./consent-confirmation-read.js";
import { installBorlabsDeferredDialogReveal } from "./borlabs-passive-dialog-reveal.js";
import { waitForConsentDocumentOrNamedControl, isRegisteredLoadingConsentRecipe } from "./consent-document-readiness.js";
import { appendResolverDiagnostic, canonicalResolverDiagnostic } from "./consent-action-resolver-diagnostics.js";
import { buildObservedActionSourceProof } from "./observed-action-source-proof.js";
import { installActionDomStorageCapture } from "./action-dom-storage-capture.js";
import { readActionWriteCapture, buildActionWriteCoverage } from "./action-main-document-write-coverage.js";
import { createActionRequestRetention } from "./action-request-retention.js";
import { LATE_FORM_CAPTURE_EXTENSION_MS, startAfterAcceptClickFormSnapshots, startRegisteredPostAcceptFormSnapshots } from "./post-accept-form-snapshots.js";
import type { FormSnapshotReviewer } from "./collection-surface-snapshots.js";
import { startPostAcceptFormCapture } from "./post-accept-form-capture.js";
import { readConsentActionLabelFields } from "./consent-action-label-fields.js";
import { terminalConsentDecisionRead } from "./terminal-consent-decision.js";
import { inspectCustomAcceptControl, isCustomAcceptControlCandidate, sameCustomAcceptControlBinding } from "./custom-accept-control.js";
import { CONSENT_ACTION_RECIPE_CANDIDATE_MAX, prioritizeConsentActionRecipes, consentActionBindingDeadline, liveConsentActionCmp } from "./consent-action-recipe-priority.js";
import type { ActionTcfData } from "./consent-action-tcf-state.js";
import { captureOneTrustBaseline, oneTrustBaselineLimitation, type OneTrustBaseline } from "./onetrust-consent-state.js";
import { decodeTcfV2PurposeConsents, readConsentActionTcfData } from "./consent-action-tcf-state.js";
import { canonicalConsentSurfacePresent, consentScopePermitsInteraction, distinctActionTargets, hasActionControlStructure } from "./cmp-action-target.js";
import { finishOptionalRuntimeGraph, installRuntimeGraphCapture } from "./runtime-evidence-graph-capture.js";
import { finishAfterActionWindow } from "./after-action-capture.js";
import {
  CONSENT_ACTION_POST_CLICK_REQUEST_LIMIT,
  consentReceiptChangeValue,
  POST_ACCEPT_DEFAULT_OBSERVATION_WINDOW_MS,
  postAcceptEvidencePacketSchema,

  type ConsentActionControlProof,
  type CustomAcceptControlBinding,
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
import { captureGoogleConsentModeRequest, resolveCanonicalVendor } from "@certscore/vendor-resolver";
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
  postRefusalStorageIdentityHash,
  classifyNavigationFailure,
  inspectRecoverableCommittedDocument,
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
import { evaluateCmpApiConfirmation } from "./cmp-api-confirmation.js";
import { assertConsentActionDispatchAllowed, buildConsentActionControlProof, consentActionLabelNeedsRediscovery, waitForTransparentConsentControl } from "./cmp-action-control-proof.js";
import { matchingStateWriteTime, readActionStateWrites, verifiedCanonicalStateWrite, verifiedCookieDecision, verifiedChangedOneTrustDecision, type SemanticState } from "./consent-action-semantic-state.js";
import {
  captureConsentControlGeometry,
  type ConsentControlCandidateEvidence,
} from "./consent-control-geometry.js";
import { matchesCanonicalCmpCookieName } from "./cmp-cookie-name.js";
import {
  cmpRecipeRequiresViewportHitTarget,
  dispatchLocatorClickWithVerifiedGeometry,
  inspectLocatorActionability,
  inspectLocatorConsentReadiness,
  locatorEnabledWithinDeadline,
  locatorActionabilitySupportsVerifiedDispatch,
  locatorHasViewportHitTarget,
  waitForLocatorVerifiedGeometry,
  type ConsentControlReadOptions,
} from "./cmp-control-actionability.js";
import {
  installConsentActionDiscovery,
  type ConsentActionDiscovery,
} from "./consent-action-discovery.js";
import { actionStorageCollectionDiagnostics, normalizeActionStorageSnapshot, type ActionStorageCollectionDiagnostics } from "./action-storage-snapshot.js";

type ResolverSnapshot = Omit<NonNullable<PostRefusalInteractionDiagnostics["resolver"]>["snapshots"][number], "attempt" | "elapsedMs">;
type ResolverReporter = (snapshot: ResolverSnapshot) => void;

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
  customControlBinding?: CustomAcceptControlBinding;
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
        provider: "termly" | "transcend" | "borlabs" | "osano" | "hubspot" | "drupal_eu_cookie" | "didomi" | "cookie_information" | "cookiescript" | "finsweet";
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
  formSnapshotReviewer?: FormSnapshotReviewer;
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
  /** Artifact-only calibration may finish the existing configured window after a positive. */
  requireFullConfiguredWindow?: boolean;
  confirmationTimeoutMs?: number;
  actionSearchTimeoutMs?: number;
  resultBudgetMs?: number;
  browser?: Browser;
  signal?: AbortSignal;
  onLifecycleEvent?: (event: { type: "action_dispatched"; atMs: number }) => void;
  onLateFormDetected?: () => void;
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
  cookieAssignment?: string;
  documentUrl?: string;
  deletion?: boolean;
  value?: string;
  storageType: "cookie" | "local_storage" | "session_storage";
  name: string;
  observedAtEpochMs: number;
  sequence: number;
};

type TcfDataSnapshot = {
  apiSource?: "addEventListener" | "getTCData";
  purposeEvidence?: ActionTcfData["purposeEvidence"];
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
      surfacePresent: boolean;
      complianzControlBound?: boolean;
      bannerStateHash?: string;
      pageUrl: string;
    }
  | { kind: "local_storage_equals"; lastSequence: number }
  | { kind: "cmp_cookie_changed"; cookieStateHash?: string }
  | { kind: "cmp_cookie_names_changed"; cookieStateHashes: Record<string, string | undefined> }
  | {
      kind: "cmp_api_consent_state_changed";
      canonicalState?: string;
      configurationSha256?: string;
      eventSequence: number;
      apiRead?: ExistingApiRead;
    }
  | {
      kind: "tcf_purposes_granted_or_cmp_cookie_changed";
      snapshot?: TcfDataSnapshot;
      cookieStateHash?: string;
      oneTrustBaseline?: OneTrustBaseline;
    }
  | {
      kind: "tcf_purposes_granted_or_cmp_storage_keys_changed";
      snapshot?: TcfDataSnapshot;
      storageStateHashes: Record<string, string | undefined>;
      lastSequence: number;
    }
  | { kind: "cmp_cookie_values_equal"; stateHashes: Record<string, string | undefined> };

type ConfirmationState = {
  oneTrustGroupEvidence?: SemanticState["oneTrustGroupEvidence"];
  complianzReceiptEvidence?: SemanticState["complianzReceiptEvidence"];
  tcfApiSource?: "addEventListener" | "getTCData";
  tcfPurposeEvidence?: ActionTcfData["purposeEvidence"];
  observedAtEpochMs?: number;
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
  let resultBudgetDeadlineAtMs = resultBudgetMs > 0
    ? branchStartedAtMs + resultBudgetMs
    : undefined;
  const resultBudgetAbortController = new AbortController();
  let resultBudgetExhausted = false;
  let resultBudgetTimer: NodeJS.Timeout | undefined;
  let lateFormBudgetExtended = false;
  const scheduleResultBudget = () => {
    if (resultBudgetTimer) clearTimeout(resultBudgetTimer);
    if (resultBudgetDeadlineAtMs === undefined) return;
    resultBudgetTimer = setTimeout(() => {
      resultBudgetExhausted = true;
      resultBudgetAbortController.abort(new Error("Post-Accept observer result budget exhausted."));
    }, Math.max(0, resultBudgetDeadlineAtMs - Date.now()));
    resultBudgetTimer.unref?.();
  };
  scheduleResultBudget();
  const extendResultBudgetForLateForm = () => {
    if (resultBudgetDeadlineAtMs === undefined) return undefined;
    if (!lateFormBudgetExtended && !resultBudgetAbortController.signal.aborted && !input.signal?.aborted) {
      resultBudgetDeadlineAtMs += LATE_FORM_CAPTURE_EXTENSION_MS;
      lateFormBudgetExtended = true;
      scheduleResultBudget();
      try { input.onLateFormDetected?.(); } catch { /* Progress reporting cannot change observed evidence. */ }
    }
    return resultBudgetDeadlineAtMs;
  };
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
    observationEndedAtMs: undefined as number | undefined,
    observationExitReason: undefined as PostAcceptEvidencePacket["timing"]["observationExitReason"],
  };
  const diagnostics: PostRefusalInteractionDiagnostics = {
    resolver: { snapshots: [], truncated: false },
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
  const preActionRequests: CapturedRequest[] = [];
  const postActionRequests: CapturedRequest[] = [];
  const postActionRetention = createActionRequestRetention(postActionRequests, CONSENT_ACTION_POST_CLICK_REQUEST_LIMIT);
  const captureCoverage = { requestsDroppedBeforeAction: 0, requestsDroppedAfterAction: 0 };
  let sourceDocumentChanged = false;
  let sourcePendingAtEnd = 0;
  let sourceHookInstalledAtMs: number | undefined;
  const requestStartedAtEpochMs = new WeakMap<Request, number>();
  const retainedRequests = () => [
    ...preActionRequests.slice(0, Math.max(0, MAX_REQUESTS - postActionRequests.length)),
    ...postActionRequests,
  ];

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
  let formSnapshotHandle: ReturnType<typeof startRegisteredPostAcceptFormSnapshots> | undefined;
  let formSnapshotCapture: PostAcceptEvidencePacket["formSnapshotCapture"];
  let formCaptureHandle: ReturnType<typeof startPostAcceptFormCapture> | undefined;
  let formCapture: PostAcceptEvidencePacket["formCapture"];
  let afterActionCapture: PostAcceptEvidencePacket["afterActionCapture"];
  let terminalDecisionEvidence: PostAcceptEvidencePacket["terminalDecisionEvidence"];
  const confirmationDiagnostic = confirmationDiagnostics();
  let decisionEvidence: PostAcceptEvidencePacket["decisionEvidence"] = {
    policyVersion: "semantic_consent_registration.v2", decision: "unknown", basis: "unverified",
  };
  let browser = input.browser;
  let ownsBrowser = false;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let graphCapture: Awaited<ReturnType<typeof installRuntimeGraphCapture>> | undefined;
  let notificationAcknowledgment: import("@certscore/contracts").NotificationAcknowledgment | undefined;
  let lastHubSpotRead: ExistingApiRead | undefined;
  const recordHubSpotRead = (snapshot: import("./cmp-api-consent-state").CmpApiConsentSnapshot | undefined) => {
    lastHubSpotRead = snapshot ? {snapshot,readAtEpochMs:Date.now()} : undefined;
  };
  let receiptCapture: ReturnType<typeof installConsentReceiptCapture> | undefined;
  let passiveCmpCapture: ReturnType<typeof installCmpPassiveDiagnostics> | undefined;
  let oneTrustSdkCapture: ReturnType<typeof installOneTrustSdkSourceCapture> | undefined;
  let originDomStorageCapture: Awaited<ReturnType<typeof installActionDomStorageCapture>> | undefined;
  let actionDiscovery: ConsentActionDiscovery | undefined;
  const storageCollectionDiagnostics: { preAction?: ActionStorageCollectionDiagnostics; postAction?: ActionStorageCollectionDiagnostics } = {};

  const cancellation = () => {
    if (!effectiveSignal?.aborted) return false;
    cancellationObservedAtMs ??= elapsed(parentScanStartedAtMs);
    return true;
  };

  const remainingResultBudgetMs = (requestedMs: number) => {
    if (resultBudgetDeadlineAtMs === undefined) return requestedMs;
    return Math.max(0, Math.min(requestedMs, resultBudgetDeadlineAtMs - Date.now()));
  };

  // Await finalization before async cleanup: otherwise a validation/write failure
  // can be unhandled while the browser closes, before the Lambda caller catches.
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
    mainDocumentWriteCoverage?: import("@certscore/contracts").ActionMainDocumentWriteCoverage;
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
    if (captureCoverage.requestsDroppedAfterAction > 0) limitations.push("post_action_network_capture_truncated");
    captureCoverage.requestsDroppedBeforeAction += Math.max(0, preActionRequests.length + postActionRequests.length - retainedRequests().length);
    formCapture ??= formCaptureHandle?.finish();
    const completedAtMs = Date.now();
    const consentReceiptCapture=receiptCapture?.finish(selectedRecipe?.controlFrameUrl?undefined:{
      targetSha256:actionControlProof?.authorizedTargetSha256,frameIdentitySha256:actionControlProof?.frameIdentitySha256,
      clickOutcome:diagnostics.click.outcome},completedAtMs);
    const originDomStorageObservation = originDomStorageCapture?.finish(completedAtMs);
    const confirmed = fields.registration.status === "confirmed" &&
      fields.registration.acceptanceExercised &&
      fields.registration.acceptanceRegisteredAtMs !== undefined;
    const resolverRecipe = selectedRecipe ?? (recipes.length === 1 ? recipes[0] : undefined);
    const packet = postAcceptEvidencePacketSchema.parse({
      ...finishOptionalRuntimeGraph(graphCapture, "post_accept", confirmed ? undefined : "action_not_confirmed"),
      artifactVersion: "certscore.post_accept_evidence.v2",
      ...(consentReceiptCapture?{consentReceiptCapture}:{}),
      confirmationDiagnostics: confirmationDiagnostic.retained(),
      ...(passiveCmpCapture ? {passiveCmpDiagnostics:passiveCmpCapture.finish(completedAtMs)} : {}),
      ...(notificationAcknowledgment ? {notificationAcknowledgment} : {}),
      ...(formCapture ? { formCapture } : {}),
      ...(formSnapshotCapture ? { formSnapshotCapture } : {}),
      ...(afterActionCapture ? { afterActionCapture } : {}),
      ...(terminalDecisionEvidence ? { terminalDecisionEvidence } : {}),
      decisionEvidence,
      captureCoverage: { ...captureCoverage, postActionRetention: postActionRetention.summary() },
      ...(fields.mainDocumentWriteCoverage && fields.registration.actionDispatchedAtMs !== undefined ? {
        observedActionSourceProof: buildObservedActionSourceProof({
          authorization: { kind: input.interactionAuthorization.kind, authorizationId: input.interactionAuthorization.authorizationId,
            scanId: input.scanId, requestedTargetSha256: hashValue(normalizeTargetUrl(input.url)), authorizedBeforeAction: true },
          scanClockOriginAtMs: parentScanStartedAtMs, writeCoverage: fields.mainDocumentWriteCoverage, hookInstalledAtMs: sourceHookInstalledAtMs,
          actionDocumentStable: !sourceDocumentChanged, requestListenerInstalledBeforeAction: true,
          requestWindowStartedAtMs: parentScanStartedAtMs + fields.registration.actionDispatchedAtMs,
          configuredWindowMs: observationWindowMs, cancelled: effectiveSignal?.aborted === true,
          semanticDecisionConfirmed: decisionEvidence?.basis === "verified_state" && decisionEvidence.decision === "granted" && diagnostics.click.outcome === "completed",
          retention: postActionRetention.summary(), pendingCount: sourcePendingAtEnd, retainedRequestIds: postActionRequests.map(row => row.requestId),
          rows: (fields.requests ?? []).filter(row => postActionRequests.some(source => source.requestId === row.requestId)),
        })
      } : {}),
      artifactOnly: true,
      productionProjectable:
        input.productionProjectable === true && confirmed && observationCoverageSufficient &&
        Boolean(actionControlProof) && captureCoverage.requestsDroppedAfterAction === 0,
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
        collectionDiagnostics: storageCollectionDiagnostics,
        ...(originDomStorageObservation ? { originDomStorageObservation } : {}),
        ...(fields.mainDocumentWriteCoverage ? { mainDocumentWriteCoverage: fields.mainDocumentWriteCoverage } : {}),
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
      return await finalize({
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
      return await finalize({
        resolverFound: false,
        resolverReason: reason,
        registration: unconfirmedRegistration("aborted", reason),
      });
    }
    context = await browser.newContext({ ...chromiumContextOptions(), ignoreHTTPSErrors: false });
    await installWebBotAuthRoute(context);
    if (input.interactionAuthorization.kind === "scan_target_resolution") {
      await installPublicNetworkGuardRoute(context);
    }
    page = await context.newPage();
    passiveCmpCapture = installCmpPassiveDiagnostics(page);
    receiptCapture = installConsentReceiptCapture(page,{scanId:input.scanId,action:'accept',clockOriginAtEpochMs:parentScanStartedAtMs,signal:effectiveSignal});
    oneTrustSdkCapture = installOneTrustSdkSourceCapture(page);
    await installBorlabsDeferredDialogReveal(page, observationTargetUrl);
    originDomStorageCapture = await installActionDomStorageCapture(page, observationTargetUrl, undefined, {
      onSession: session => oneTrustSdkCapture?.bindNativeSession(session, {
        deadlineAtEpochMs: resultBudgetDeadlineAtMs, signal: effectiveSignal,
      }),
    });
    if (input.runtimeGraph) graphCapture = await installRuntimeGraphCapture(page, {
      ...input.runtimeGraph, captureId: input.scanId, scenario: "post_accept", startedAt: new Date(parentScanStartedAtMs).toISOString(),
    });
    actionDiscovery = await installConsentActionDiscovery(page);
    await installStorageWriteProbe(page);
    let mainNavigationRequestCount = 0;
    page.on("framenavigated", frame => { if (actionDispatched && frame === page?.mainFrame()) sourceDocumentChanged = true; });
    page.on("request", (request) => {
      // Optional form images may continue in this session after the action
      // window closes. They must not grow or truncate its request evidence.
      if (timing.observationEndedAtMs !== undefined) return;
      if (request.isNavigationRequest() && request.frame() === page?.mainFrame()) {
        mainNavigationRequestCount += 1;
      }
      const startedAtEpochMs = request.timing().startTime > 0 ? request.timing().startTime : Date.now();
      requestStartedAtEpochMs.set(request, startedAtEpochMs);
      const redirectedFrom = request.redirectedFrom();
      const ancestorStart = redirectedFrom ? requestStartedAtEpochMs.get(redirectedFrom) : undefined;
      // Preserve ancestry even when an ancestor's row exceeds the retention cap.
      if (ancestorStart !== undefined) requestStartedAtEpochMs.set(request, Math.min(startedAtEpochMs, ancestorStart));
      const bucket = actionDispatched ? postActionRequests : preActionRequests;
      if (!actionDispatched && bucket.length >= MAX_REQUESTS) {
        captureCoverage.requestsDroppedBeforeAction += 1;
        return;
      }
      const requestId = `post_accept_request_${++nextRequestNumber}`;
      const captured: CapturedRequest = {
        request, requestId, startedAtEpochMs,
        inFlightAtAcceptanceRegistration: acceptanceRegisteredAtEpochMs !== undefined &&
          ancestorStart !== undefined && ancestorStart < acceptanceRegisteredAtEpochMs,
      };
      if (actionDispatched) {
        const wasFull = bucket.length >= CONSENT_ACTION_POST_CLICK_REQUEST_LIMIT;
        const selection = postActionRetention.offer(captured);
        if (wasFull) captureCoverage.requestsDroppedAfterAction += 1;
        if (selection.evicted) activeRequestIds.delete(selection.evicted.requestId);
        if (!selection.retained) return;
      } else bucket.push(captured);
      requestIds.set(request, requestId);
      activeRequestIds.add(requestId);
    });
    const markCompleted = (request: Request) => {
      const requestId = requestIds.get(request);
      if (!requestId) return;
      activeRequestIds.delete(requestId);
      const captured = retainedRequests().find((entry) => entry.requestId === requestId);
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
        return await finalize({
          resolverFound: false,
          resolverReason: reason,
          registration: unconfirmedRegistration("aborted", reason),
          requests: classifyRequests(retainedRequests(), parentScanStartedAtMs),
        });
      }
      const failureClass = classifyNavigationFailure(error);
      // Match Reject's committed-document recovery without another navigation
      // or settle wait. Exact-target authorization is rechecked before action.
      const recovery = await inspectRecoverableCommittedDocument(
        page, effectiveAuthorization, failureClass, authorizationScanId, 0,
      );
      diagnostics.navigation = {
        outcome: recovery.recovered ? "recovered_after_error" : "failed", failureClass,
        documentCommitted: recovery.documentCommitted, finalUrlAuthorized: recovery.finalUrlAuthorized,
        ...(recovery.recovered ? { recoveryMethod: "committed_document" as const } : {}),
      };
      if (!recovery.recovered) {
        limitations.push(`target_navigation_failed:${failureClass}`);
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
        return await finalize({
          resolverFound: false,
          resolverReason: "redirect_target_not_authorized",
          registration: unconfirmedRegistration("not_attempted", "redirect_target_not_authorized"),
          requests: classifyRequests(retainedRequests(), parentScanStartedAtMs),
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
      return await finalize({
        resolverFound: false,
        resolverReason: "redirect_target_not_authorized",
        registration: unconfirmedRegistration("not_attempted", "redirect_target_not_authorized"),
        requests: classifyRequests(retainedRequests(), parentScanStartedAtMs),
      });
    }
    diagnostics.navigation.finalUrlAuthorized = true;

    const resolverStartedAtMs = Date.now();
    let previousSnapshot: string | undefined;
    let resolverAttempt = 0;
    const recordResolverSnapshot: ResolverReporter = (snapshot) => {
      const signature = JSON.stringify(snapshot);
      if (signature === previousSnapshot) return;
      previousSnapshot = signature;
      appendResolverDiagnostic(diagnostics.resolver!, snapshot, ++resolverAttempt, Date.now() - resolverStartedAtMs);
    };
    const searchDeadline = resolverStartedAtMs + remainingResultBudgetMs(actionSearchTimeoutMs);
    const readiness = actionSearchTimeoutMs === 0 ? {documentReady:true,resolution:undefined} :
      await waitForConsentDocumentOrNamedControl<AcceptRecipeResolution>({page,deadlineAtMs:searchDeadline,signal:effectiveSignal,discovery:actionDiscovery,
        probe:async (sliceMs,probeSignal)=>{
          const active=await resolveActiveRuntimeRecipes(page!,recipes,actionDiscovery);
          if(active.length!==1 || !isRegisteredLoadingConsentRecipe(active[0]!,"accept"))return undefined;
          const candidate=await waitForDeterministicRecipe(page!,active,sliceMs,probeSignal,actionDiscovery,recordResolverSnapshot);
          return candidate.status==="found" && candidate.scope===page ? candidate : undefined;
        }});
    const documentReady=readiness.documentReady;
    const searchEnded=effectiveSignal?.aborted || (actionSearchTimeoutMs>0 && Date.now()>=searchDeadline);
    if ((!documentReady || searchEnded) && !readiness.resolution) recordResolverSnapshot({ source: "named_recipe", state: documentReady ? "binding_budget_exhausted" : "document_loading",
      selectorMatchCount: 0, visibleCount: 0, enabledCount: 0, labelMatchCount: 0, actionableCount: 0, cmpIds: [], controlLabels: [] });
    const searchRemaining = () => actionSearchTimeoutMs === 0 ? 0 : Math.max(1, searchDeadline - Date.now());
    let resolution: AcceptRecipeResolution = readiness.resolution ?? ((!documentReady || searchEnded)
      ? { status: effectiveSignal?.aborted ? "aborted" : "not_found" }
      : input.allowCanonicalAcceptDiscovery
      ? await waitForDeterministicOrCanonicalAcceptRecipe(
          page,
          recipes,
          searchRemaining(),
          effectiveSignal,
          actionDiscovery,
          recordResolverSnapshot,
        )
      : await waitForDeterministicRecipe(
          page,
          recipes,
          searchRemaining(),
          effectiveSignal,
          actionDiscovery,
          recordResolverSnapshot,
        ));
    timing.resolverMs = Math.max(0, Date.now() - resolverStartedAtMs);
    if (resolution.status !== "found" && resolution.status !== "aborted" &&
      actionSearchTimeoutMs > 0 && timing.resolverMs >= actionSearchTimeoutMs) {
      limitations.push(resolution.status === "ambiguous"
        ? "resolver_ambiguity_unresolved_at_deadline" : "resolver_search_budget_exhausted");
    }
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
      return await finalize({
        resolverFound: false,
        resolverReason: reason,
        registration: unconfirmedRegistration(
          resolution.status === "aborted" ? "aborted" : "not_attempted",
          reason,
        ),
        requests: classifyRequests(retainedRequests(), parentScanStartedAtMs),
      });
    }
    selectedRecipe = resolution.recipe;
    let control = resolution.control;
    let confirmationScope = resolution.scope;
    const preActionStorage = await captureStorage(context, page, observationTargetUrl, limitations, undefined, (d) => { storageCollectionDiagnostics.preAction = d; });
    const preActionCapturedAtMs = elapsed(parentScanStartedAtMs);
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

    let actionabilityError: unknown;
    let useVerifiedGeometryDispatch = false;
    const actionReadinessDeadline = Date.now() + (input.allowCanonicalAcceptDiscovery ? 3_000 : 2_500);
    const actionReadinessRemaining = (maximumMs: number) => remainingResultBudgetMs(Math.min(maximumMs, Math.max(0, actionReadinessDeadline - Date.now())));
    const actionabilityReadOptions = (): ConsentControlReadOptions => ({
      deadlineAtMs: Math.min(actionReadinessDeadline, resultBudgetDeadlineAtMs ?? Infinity),
      signal: effectiveSignal, scope: confirmationScope,
    });
    try {
      await trialAcceptControl(page, control, selectedRecipe);
    } catch (error) {
      actionabilityError = error;
    }
    if (
      actionabilityError &&
      classifyClickFailure(actionabilityError) === "actionability_timeout"
    ) {
      const actionability = await inspectLocatorActionability(control, actionabilityReadOptions());
      if (locatorActionabilitySupportsVerifiedDispatch(actionability)) {
        actionabilityError = undefined;
        useVerifiedGeometryDispatch = true;
        diagnostics.click.actionability = actionability;
        limitations.push("action_dispatch_verified_geometry_fallback");
      }
    }
    if (actionabilityError) {
      resolution = actionReadinessRemaining(500) > 0 ? await waitForDeterministicRecipe(
        page,
        [selectedRecipe],
        actionReadinessRemaining(500),
        effectiveSignal,
        actionDiscovery,
      ) : { status: "not_found" };
      if (resolution.status === "not_found" && input.allowCanonicalAcceptDiscovery && actionReadinessRemaining(500) > 0) {
        resolution = await waitForCanonicalAcceptControlRecipe(
          page,
          actionReadinessRemaining(500),
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
              actionReadinessRemaining(1_000),
              effectiveSignal,
              confirmationScope,
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
    // A failed re-resolution must not discard its still-unused geometry slice.
    // Final proof, target authorization and semantic registration remain required.
    if (actionabilityError && !selectedRecipe.accessibleControl && actionReadinessRemaining(1_000) > 0 &&
      ["actionability_timeout", "intercepted"].includes(classifyClickFailure(actionabilityError))) {
      const actionability = await waitForLocatorVerifiedGeometry(control, actionReadinessRemaining(1_000), effectiveSignal, confirmationScope);
      if (actionability) {
        actionabilityError = undefined; useVerifiedGeometryDispatch = true;
        diagnostics.click.actionability = actionability;
        if (!limitations.includes("action_dispatch_verified_geometry_fallback")) limitations.push("action_dispatch_verified_geometry_fallback");
      }
    }
    if (actionabilityError) {
      const actionability = await inspectLocatorActionability(control, actionabilityReadOptions());
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
      return await finalize({
        resolverFound: true,
        registration: {
          status: "unconfirmed",
          acceptanceExercised: false,
          reason: "deterministic_accept_control_click_failed",
          witnesses: [],
        },
        preActionCapturedAtMs,
        preActionStorage,
        requests: classifyRequests(retainedRequests(), parentScanStartedAtMs),
      });
    }

    let confirmationBaseline = await captureConfirmationBaseline(
      context,
      page,
      confirmationScope,
      selectedRecipe.confirmation,
      control,
    );
    if ("oneTrustBaseline" in confirmationBaseline) {
      for (const reason of confirmationBaseline.oneTrustBaseline?.diagnosticReasons ?? []) confirmationDiagnostic.reason(reason);
      const reason = oneTrustBaselineLimitation(confirmationBaseline.oneTrustBaseline);
      if (reason) limitations.push(reason);
    }
    let proofResolution = await buildConsentActionControlProof({
      deadlineAtMs: resultBudgetDeadlineAtMs,
      onLabelInspection: recordResolverSnapshot,
      signal: effectiveSignal,
      action: "accept",
      ...(authorizedExactTargetUrl
        ? { authorizedTargetSha256: hashValue(normalizeTargetUrl(authorizedExactTargetUrl)) }
        : {}),
      ...(selectedRecipe.cmpId ? { cmpId: selectedRecipe.cmpId } : {}),
      control,
      ...(confirmationScope !== page
        ? { controlFrameUrl: confirmationScope.url() }
        : {}),
      ...(selectedRecipe.accessibleControl
        ? { expectedAccessibleControl: selectedRecipe.accessibleControl }
        : {}),
      observedAtMs: elapsed(parentScanStartedAtMs),
      page,
      recipeId: selectedRecipe.recipeId,
      selectorHint: selectedRecipe.controlSelector,
      expectedCustomControlBinding: selectedRecipe.customControlBinding,
    });
    if (
      proofResolution.status !== "verified" &&
      (proofResolution.reason === "resolved_control_no_longer_actionable" ||
        proofResolution.reason === "resolved_control_scope_not_interactive" ||
        (input.allowCanonicalAcceptDiscovery && consentActionLabelNeedsRediscovery(proofResolution))) &&
      !cancellation()
    ) {
      try {
        assertConsentActionDispatchAllowed(
          page,
          effectiveSignal,
          authorizedExactTargetUrl
            ? hashValue(normalizeTargetUrl(authorizedExactTargetUrl))
            : undefined,
        );
        const recoveryDeadline = Math.max(resolverStartedAtMs + actionSearchTimeoutMs, actionReadinessDeadline);
        const remainingRecoveryBudgetMs = () => Math.max(0, recoveryDeadline - Date.now());
        if (remainingRecoveryBudgetMs() === 0) {
          throw new Error("late_control_recovery_search_budget_exhausted");
        }
        if (proofResolution.reason === "resolved_control_scope_not_interactive" &&
          !await waitForTransparentConsentControl({action: "accept", control, page,
            selectorHint: selectedRecipe.controlSelector,
            ...(confirmationScope !== page ? {controlFrameUrl: confirmationScope.url()} : {}),
            authorizedTargetSha256: authorizedExactTargetUrl ? hashValue(normalizeTargetUrl(authorizedExactTargetUrl)) : undefined,
            deadlineAtMs: recoveryDeadline, signal: effectiveSignal})) {
          throw new Error("transparent_consent_scope_not_ready");
        }
        // An unverified named label must not repeatedly select the same control.
        // Use only remaining search/shared-readiness time for live discovery.
        let lateResolution: AcceptRecipeResolution = consentActionLabelNeedsRediscovery(proofResolution)
          ? { status: "not_found" }
          : await waitForDeterministicRecipe(
            page,
            [selectedRecipe],
            Math.min(250, remainingRecoveryBudgetMs()),
            effectiveSignal,
            actionDiscovery,
            recordResolverSnapshot,
          );
        if (lateResolution.status === "not_found" && input.allowCanonicalAcceptDiscovery && remainingRecoveryBudgetMs() >= 250) {
          lateResolution = await waitForCanonicalAcceptControlRecipe(
            page,
            remainingRecoveryBudgetMs(),
            effectiveSignal,
            [selectedRecipe],
            actionDiscovery,
            undefined,
            recordResolverSnapshot,
            recoveryDeadline,
          );
        }
        if (lateResolution.status === "found") {
          selectedRecipe = lateResolution.recipe;
          control = lateResolution.control;
          confirmationScope = lateResolution.scope;
          useVerifiedGeometryDispatch = false;
          diagnostics.click.reResolvedBeforeDispatch = true;
          confirmationBaseline = await captureConfirmationBaseline(
            context,
            page,
            confirmationScope,
            selectedRecipe.confirmation,
            control,
          );
          proofResolution = await buildConsentActionControlProof({
            deadlineAtMs: resultBudgetDeadlineAtMs,
            onLabelInspection: recordResolverSnapshot,
            signal: effectiveSignal,
            action: "accept",
            ...(authorizedExactTargetUrl
              ? { authorizedTargetSha256: hashValue(normalizeTargetUrl(authorizedExactTargetUrl)) }
              : {}),
            ...(selectedRecipe.cmpId ? { cmpId: selectedRecipe.cmpId } : {}),
            control,
            ...(confirmationScope !== page ? { controlFrameUrl: confirmationScope.url() } : {}),
            ...(selectedRecipe.accessibleControl ? { expectedAccessibleControl: selectedRecipe.accessibleControl } : {}),
            observedAtMs: elapsed(parentScanStartedAtMs),
            page,
            recipeId: selectedRecipe.recipeId,
            selectorHint: selectedRecipe.controlSelector,
            expectedCustomControlBinding: selectedRecipe.customControlBinding,
          });
        }
      } catch (error) {
        proofResolution = {
          status: "label_unverifiable",
          reason: error instanceof Error ? error.message : "late_control_reresolution_failed",
        };
      }
    }
    if (proofResolution.status !== "verified") {
      limitations.push(proofResolution.status, proofResolution.reason);
      return await finalize({
        resolverFound: false,
        resolverReason: proofResolution.status,
        registration: unconfirmedRegistration(cancellation() ? "aborted" : "not_attempted", proofResolution.reason),
        preActionCapturedAtMs,
        preActionStorage,
        requests: classifyRequests(retainedRequests(), parentScanStartedAtMs),
      });
    }
    actionControlProof = proofResolution.proof;
    const actionDispatchedAtEpochMs = Date.now();
    receiptCapture?.dispatch(actionDispatchedAtEpochMs);
    const actionDispatchedAtMs = elapsed(parentScanStartedAtMs, actionDispatchedAtEpochMs);
    actionDispatched = true;
    try { input.onLifecycleEvent?.({ type: "action_dispatched", atMs: actionDispatchedAtMs }); }
    catch { limitations.push("lifecycle_listener_failed"); }
    let clickError: unknown;
    let actionDocumentChanged = false;
    const watchActionDocument = (frame: import("playwright").Frame) => { if (frame === page!.mainFrame()) actionDocumentChanged = true; };
    page.on("framenavigated", watchActionDocument);
    try {
      await dispatchAcceptControl(
        page,
        control,
        selectedRecipe,
        useVerifiedGeometryDispatch,
        () => assertConsentActionDispatchAllowed(page!, effectiveSignal, actionControlProof?.authorizedTargetSha256),
        { deadlineAtMs: resultBudgetDeadlineAtMs, signal: effectiveSignal, scope: confirmationScope },
      );
    } catch (error) {
      clickError = error;
    } finally {
      page.off("framenavigated", watchActionDocument);
    }
    if (!clickError && observationWindowMs > 0) {
      formCaptureHandle = startPostAcceptFormCapture({ page,
        exactTargetUrl: normalizeTargetUrl(authorizedExactTargetUrl ?? observationTargetUrl),
        parentScanStartedAtMs, actionDispatchedAtMs, windowMs: remainingResultBudgetMs(observationWindowMs), signal: effectiveSignal, documentChangedBeforeStart: actionDocumentChanged });
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
      (state) => { decisionEvidence = { policyVersion: "semantic_consent_registration.v2",
        decision: state.decision, basis: "verified_state", observedStateSha256: state.stateHash,
        ...(state.complianzReceiptEvidence ? {complianzReceiptEvidence:state.complianzReceiptEvidence} : {}),
        ...(state.oneTrustGroupEvidence ? { oneTrustGroupEvidence: state.oneTrustGroupEvidence } : {}),
        observedAtMs: elapsed(parentScanStartedAtMs, state.observedAtEpochMs ?? Date.now()),
        timestampBasis: state.observedAtEpochMs === undefined ? "verified_state_observed" : "instrumented_state_write" }; },
      { pass: () => confirmationDiagnostic.pass(false), reason: confirmationDiagnostic.reason, apiSnapshot:recordHubSpotRead },
    );
    if (confirmedState) confirmationDiagnostic.reason("verified_decision");
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
      const captureStartedAtMs = Date.now();
      const targetStillAuthorized = () => {
        try { return !page!.isClosed() && normalizeTargetUrl(page!.url()) === normalizeTargetUrl(authorizedExactTargetUrl ?? observationTargetUrl); }
        catch { return false; }
      };
      if (input.formSnapshotReviewer && diagnostics.click.outcome === "completed" && !actionDocumentChanged &&
        targetStillAuthorized() && !effectiveSignal?.aborted) {
        formSnapshotHandle = startAfterAcceptClickFormSnapshots({ page,
          exactTargetUrl: normalizeTargetUrl(authorizedExactTargetUrl ?? observationTargetUrl), parentScanStartedAtMs,
          actionDispatchedAtMs, reviewer: input.formSnapshotReviewer,
          deadlineAtMs: Math.min(actionDispatchedAtEpochMs + observationWindowMs,
            resultBudgetDeadlineAtMs ?? Number.POSITIVE_INFINITY), signal: effectiveSignal,
          onDocumentBound: token => formCaptureHandle?.bindMainDocument(token) });
      }
      const terminalRead = terminalConsentDecisionRead({
        onOutcome: confirmationDiagnostic.terminal,
        action: "accept", authorizedTargetSha256: actionControlProof?.authorizedTargetSha256,
        parentScanStartedAtMs, dispatchedAtEpochMs: actionDispatchedAtEpochMs, observationWindowMs,
        signal: effectiveSignal, targetStillAuthorized, read: () => waitForAcceptanceConfirmation(context!, page!, confirmationScope, selectedRecipe!.confirmation, confirmationBaseline, actionDispatchedAtEpochMs!, 0, effectiveSignal, undefined, { pass: () => { receiptCapture?.phase('terminal'); confirmationDiagnostic.pass(true); }, reason: confirmationDiagnostic.terminalReason, apiSnapshot:recordHubSpotRead }),
      });
      const stopReason = await finishAfterActionWindow({
        onFinalWindow: terminalRead.start,
        dispatchedAtEpochMs: actionDispatchedAtEpochMs, observationWindowMs,
        clickCompleted: diagnostics.click.outcome === "completed", signal: effectiveSignal, targetStillAuthorized,
      });
      formCapture = formCaptureHandle?.finish();
      formSnapshotCapture = await formSnapshotHandle?.finish();
      timing.observationMs = Math.max(0, Date.now() - captureStartedAtMs);
      if (stopReason !== "window_elapsed") limitations.push(`after_action_capture:${stopReason}`);
      cancellation();
      let postActionStorage: PostRefusalStorageItem[] | undefined;
      if (!effectiveSignal?.aborted && targetStillAuthorized()) {
        postActionStorage = await captureStorage(context, page, observationTargetUrl, limitations, undefined, (d) => { storageCollectionDiagnostics.postAction = d; }).catch(() => undefined);
      }
      const capturedWrites = !effectiveSignal?.aborted && targetStillAuthorized()
        ? await readStorageWrites(page).catch(() => []) : [];
      const captureEndedAtMs = elapsed(parentScanStartedAtMs);
      const requests = classifyRequests(retainedRequests(), parentScanStartedAtMs);
      afterActionCapture = {
        policyVersion: "bounded_after_action_capture.v1", action: "accept",
        activationStatus: diagnostics.click.outcome === "completed" ? "completed" : "uncertain",
        actionDispatchedAtMs, captureEndedAtMs, requestedWindowMs: observationWindowMs, stopReason,
        requestsDropped: captureCoverage.requestsDroppedAfterAction,
        storageSnapshotRetained: postActionStorage !== undefined,
        storageWriteCoverage: "bounded_main_document_sample",
        storageWrites: capturedWrites.filter((write) => write.observedAtEpochMs >= actionDispatchedAtEpochMs)
          .flatMap((write) => {
            const row = classifyStorageWrite(write, parentScanStartedAtMs, actionDispatchedAtEpochMs, observationTargetUrl, postActionStorage ?? []);
            return row ? [{ storageType: row.storageType, name: row.name, hostname: row.hostname,
              observedAtMs: row.observedAtMs, nonEssential: row.nonEssential, vendor: row.vendor }] : [];
          }).slice(0, 48),
        requestIds: requests.filter((row) => row.startedAtMs >= actionDispatchedAtMs && row.startedAtMs <= captureEndedAtMs).map((row) => row.requestId),
      };
      terminalDecisionEvidence = terminalRead.retained(afterActionCapture);
      if (terminalDecisionEvidence) confirmationDiagnostic.terminalReason("verified_decision");
      if (selectedRecipe.confirmation.kind === "cmp_api_consent_state_changed" && selectedRecipe.confirmation.provider === "hubspot" &&
        confirmationBaseline.kind === "cmp_api_consent_state_changed" && (confirmationScope === page || confirmationScope === page.mainFrame())) {
        notificationAcknowledgment = retainNotificationAcknowledgment({before:confirmationBaseline.apiRead,after:lastHubSpotRead,
          proof:actionControlProof,capture:afterActionCapture,storage:postActionStorage??[],writes:capturedWrites,
          clockOriginAtMs:parentScanStartedAtMs,mainDocumentStable:!sourceDocumentChanged&&!actionDocumentChanged&&!effectiveSignal?.aborted,
          clickCompleted:diagnostics.click.outcome === "completed",terminalDecisionConfirmed:!!terminalDecisionEvidence});
      }
      return await finalize({
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
        ...(postActionStorage ? { postActionStorage, postActionCapturedAtMs: captureEndedAtMs } : {}),
        requests,
      });
    }

    acceptanceRegisteredAtEpochMs = confirmedState.observedAtEpochMs ?? Date.now();
    if (confirmedState.observedAtEpochMs === undefined) limitations.push("registration_timestamp_is_observation_upper_bound");
    graphCapture?.confirmAction(parentScanStartedAtMs + elapsed(parentScanStartedAtMs, acceptanceRegisteredAtEpochMs));
    void graphCapture?.snapshotStorage();
    const acceptanceRegisteredAtMs = elapsed(parentScanStartedAtMs, acceptanceRegisteredAtEpochMs);
    decisionEvidence = { policyVersion: "semantic_consent_registration.v2", decision: "granted", basis: "verified_state",
      ...(confirmedState.tcfPurposeEvidence ? { tcfPurposeEvidence: confirmedState.tcfPurposeEvidence } : {}),
      ...(confirmedState.tcfApiSource ? { tcfApiSource: confirmedState.tcfApiSource } : {}),
      ...(confirmedState.complianzReceiptEvidence ? {complianzReceiptEvidence:confirmedState.complianzReceiptEvidence} : {}),
      ...(confirmedState.oneTrustGroupEvidence ? { oneTrustGroupEvidence: confirmedState.oneTrustGroupEvidence } : {}),
      observedStateSha256: confirmedState.stateHash,
      observedAtMs: acceptanceRegisteredAtMs, timestampBasis: confirmedState.observedAtEpochMs === undefined
        ? "verified_state_observed" : "instrumented_state_write" };
    activeRequestIdsAtAcceptanceRegistration = [...activeRequestIds].slice(0, 48);
    for (const captured of retainedRequests()) {
      captured.startedAtEpochMs = captured.request.timing().startTime > 0
        ? captured.request.timing().startTime : captured.startedAtEpochMs;
      const ancestor = captured.request.redirectedFrom();
      const ancestorStart = ancestor ? requestStartedAtEpochMs.get(ancestor) : undefined;
      captured.inFlightAtAcceptanceRegistration ||= captured.startedAtEpochMs < acceptanceRegisteredAtEpochMs ||
        (ancestorStart !== undefined && ancestorStart < acceptanceRegisteredAtEpochMs);
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
    formCaptureHandle?.continueThrough(acceptanceRegisteredAtMs,
      remainingResultBudgetMs(observationWindowMs));

    if (input.formSnapshotReviewer && diagnostics.click.outcome === "completed" && !actionDocumentChanged) {
      formSnapshotHandle = startRegisteredPostAcceptFormSnapshots({ page,
        exactTargetUrl: normalizeTargetUrl(authorizedExactTargetUrl ?? observationTargetUrl), parentScanStartedAtMs,
        actionDispatchedAtMs, acceptanceRegisteredAtMs, reviewer: input.formSnapshotReviewer,
        deadlineAtMs: Math.min(parentScanStartedAtMs + acceptanceRegisteredAtMs + observationWindowMs,
          resultBudgetDeadlineAtMs ?? Number.POSITIVE_INFINITY), signal: effectiveSignal,
        onLateFormDetected: extendResultBudgetForLateForm,
        onDocumentBound: token => formCaptureHandle?.bindMainDocument(token) });
    }
    const observationStartedAtMs = Date.now();
    const observationResult = await waitForPostAcceptObservation({
      confirmation: selectedRecipe.confirmation,
      confirmedState,
      getCapturedRequests: () => retainedRequests(),
      observationWindowMs,
      page,
      parentScanStartedAtMs,
      acceptanceRegisteredAtEpochMs,
      canExitEarly: () => !input.requireFullConfiguredWindow && (!formSnapshotHandle || formSnapshotHandle.done()),
      signal: effectiveSignal,
      targetUrl: observationTargetUrl,
    });
    formCapture = formCaptureHandle?.finish();
    const observationEndedAtEpochMs = Date.now();
    timing.observationMs = Math.max(0, observationEndedAtEpochMs - observationStartedAtMs);
    timing.observationEndedAtMs = elapsed(parentScanStartedAtMs, observationEndedAtEpochMs);
    sourcePendingAtEnd = postActionRequests.filter(row => activeRequestIds.has(row.requestId)).length;
    originDomStorageCapture?.finish();
    // The storage read and optional masked-image completion are independent
    // same-session reads after the observation window. Overlap their browser
    // work so an image cannot spend the result's finalization allowance.
    const [finishedSnapshot, storageRead, writeCapture] = await Promise.all([
      formSnapshotHandle?.finish() ?? Promise.resolve(undefined),
      captureStorage(context, page, observationTargetUrl, limitations, graphCapture?.cookies,
        (d) => { storageCollectionDiagnostics.postAction = d; }).then(storage => ({
          storage, capturedAtMs: elapsed(parentScanStartedAtMs),
        })),
      readActionWriteCapture<InstrumentedStorageWrite>(page, "__certscoreReadPostAcceptWrites"),
    ]);
    const instrumentedWrites = writeCapture.writes;
    sourceHookInstalledAtMs = writeCapture.metadata?.hookInstalledAtMs;
    const postActionStorage = storageRead.storage;
    formSnapshotCapture = finishedSnapshot;
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
    void graphCapture?.snapshotStorage();
    const postActionCapturedAtMs = storageRead.capturedAtMs;
    const requests = classifyRequests(
      retainedRequests(),
      parentScanStartedAtMs,
      acceptanceRegisteredAtEpochMs,
    );
    const postAcceptNonEssentialRequests = requests.filter((request) =>
      request.nonEssential &&
      !request.inFlightAtAcceptanceRegistration &&
      typeof request.msOffsetFromAccept === "number" &&
      request.msOffsetFromAccept >= 0
    ).slice(0, 24);
    const eligibleWritesAfterAccept = instrumentedWrites
      .filter((write) => write.observedAtEpochMs > acceptanceRegisteredAtEpochMs! &&
        write.observedAtEpochMs <= observationEndedAtEpochMs)
      .map((write) => classifyStorageWrite(
        write,
        parentScanStartedAtMs,
        acceptanceRegisteredAtEpochMs!,
        observationTargetUrl,
        postActionStorage,
      ))
      .filter((write): write is PostAcceptStorageWrite => Boolean(write))
      .filter((write) => write.nonEssential);
    const writesAfterAccept = eligibleWritesAfterAccept.slice(0, 48);
    const preActionByIdentity = new Map(preActionStorage.map((item) => [storageKey(item), item]));
    const itemsCreatedOrChangedAfterAccept = postActionStorage.filter((item) => {
      const before = preActionByIdentity.get(storageKey(item));
      return item.nonEssential && before?.valueHash !== item.valueHash;
    }).slice(0, 24);
    // Use the decision read retained inside the action window. Image-only
    // settling must not introduce a later consent contradiction.
    const finalTcfSnapshot = observationResult.tcfData;
    const finalTcfObservedAtEpochMs = observationResult.tcfData &&
        observationResult.tcfObservedAtEpochMs !== undefined
      ? observationResult.tcfObservedAtEpochMs
      : undefined;
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

    return await finalize({
      resolverFound: true,
      registration,
      preActionCapturedAtMs,
      postActionCapturedAtMs,
      preActionStorage,
      postActionStorage,
      requests,
      postAcceptNonEssentialRequests,
      mainDocumentWriteCoverage: buildActionWriteCoverage({ metadata: writeCapture.metadata, targetUrl: observationTargetUrl,
        windowStartedAtMs: acceptanceRegisteredAtEpochMs, windowEndedAtMs: observationEndedAtEpochMs,
        windowCompleted: observationResult.completed && observationResult.reason === "window_elapsed",
        retainedWindowCount: instrumentedWrites.filter(write => write.observedAtEpochMs > acceptanceRegisteredAtEpochMs! && write.observedAtEpochMs <= observationEndedAtEpochMs).length,
        eligibleWindowCount: eligibleWritesAfterAccept.length, retainedEligibleCount: writesAfterAccept.length,
        // Unclassified writes cannot establish a negative; retain an explicit limitation.
        unresolvedWindowCount: instrumentedWrites.filter(write => {
          if (write.observedAtEpochMs <= acceptanceRegisteredAtEpochMs! || write.observedAtEpochMs > observationEndedAtEpochMs) return false;
          const purpose = vendorFor({ type: write.storageType === "cookie" ? "cookie" : "cmp_runtime",
            cookieName: write.storageType === "cookie" ? write.name : undefined,
            storageKey: write.storageType === "cookie" ? undefined : write.name,
            hostname: new URL(observationTargetUrl).hostname })?.purpose;
          return !purpose || purpose === "unknown";
        }).length,
      }),
      writesAfterAccept,
      itemsCreatedOrChangedAfterAccept,
      ...(postAcceptTcfState ? { postAcceptTcfState } : {}),
      observations,
    });
  } finally {
    // Finalization already froze the optional sample. Cleanup must run even if
    // a capture-side failure interrupted packet construction.
    try { await formSnapshotHandle?.finish(); } catch { /* Optional image work is bounded and cannot block cleanup. */ }
    try { formCaptureHandle?.finish(); } catch { /* Optional form evidence cannot block browser cleanup. */ }
    if (resultBudgetTimer) clearTimeout(resultBudgetTimer);
    finishOptionalRuntimeGraph(graphCapture, "post_accept", "action_capture_closed");
    originDomStorageCapture?.finish();
    actionDiscovery?.dispose();
    passiveCmpCapture?.finish();
    receiptCapture?.finish();
    oneTrustSdkCapture?.dispose();
    await context?.close().catch(() => undefined);
    if (ownsBrowser) await browser?.close().catch(() => undefined);
  }
}

function validatedRecipes(input: PostAcceptObserverInput) {
  const selected = input.recipeCandidates?.length ? input.recipeCandidates : [input.recipe];
  if (selected.length > CONSENT_ACTION_RECIPE_CANDIDATE_MAX) {
    throw new Error(`Post-Accept recipe candidate set exceeds the bounded maximum of ${CONSENT_ACTION_RECIPE_CANDIDATE_MAX}.`);
  }
  const deduped = new Map<string, PostAcceptActionRecipe>();
  for (const recipe of selected) {
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
  reportDiagnostic?: ResolverReporter,
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
    let matches: Array<{
      recipe: PostAcceptActionRecipe;
      control: Locator;
      scope: Page | Frame;
    }> = [];
    let selectorMatchCount = 0;
    let visibleCount = 0;
    let enabledCount = 0;
    let labelMatchCount = 0;
    const matchedCmpIds = new Set<string>();
    const matchedControlLabels = new Set<string>();
    const reportIncompleteSweep = () => reportDiagnostic?.({ source: "named_recipe", state: "binding_budget_exhausted",
      selectorMatchCount, visibleCount, enabledCount, labelMatchCount, actionableCount: 0,
      cmpIds: [...matchedCmpIds], controlLabels: [...matchedControlLabels] });
    const viewportPendingRecipeIds: string[] = [];
    let scopeNotInteractive = false;
    const recipesForAttempt = prioritizedRecipeId
      ? recipes.filter((recipe) => recipe.recipeId === prioritizedRecipeId)
      : recipes;
    for (const recipe of recipesForAttempt) {
      if (signal?.aborted) return { status: "aborted" };
      // Never claim uniqueness from a truncated multi-recipe sweep.
      if (timeoutMs > 0 && Date.now() >= deadlineAtMs) { reportIncompleteSweep(); return { status: "not_found" }; }
      for (const scope of selectorScopes(page, recipe.controlFrameUrl)) {
        if (signal?.aborted) return { status: "aborted" };
        if (timeoutMs > 0 && Date.now() >= deadlineAtMs) { reportIncompleteSweep(); return { status: "not_found" }; }
        if (recipe.accessibleControl?.kind === "scoped_accessible_control") {
          const control = await resolveScopedAccessibleControl(scope, recipe.accessibleControl);
          if (control) {
            selectorMatchCount += 1;
            visibleCount += 1;
            enabledCount += 1;
            labelMatchCount += 1;
            if (
              !cmpRecipeRequiresViewportHitTarget(recipe.cmpId) ||
              await locatorHasViewportHitTarget(control, { deadlineAtMs: timeoutMs > 0 ? deadlineAtMs : undefined, signal, scope })
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
          ) {
            selectorMatchCount += 1; visibleCount += 1; enabledCount += 1; labelMatchCount += 1;
            matches.push({ recipe, control: host.first(), scope });
          }
          continue;
        }
        const locator = scope.locator(recipe.controlSelector);
        const rawCount = await locator.count().catch(() => 0);
        if (rawCount > 8) return { status: "ambiguous" };
        const count = rawCount;
        selectorMatchCount += count;
        if (count > 0) {
          if (recipe.cmpId) matchedCmpIds.add(recipe.cmpId);
          if (recipe.controlExpectedNormalizedLabel) matchedControlLabels.add(recipe.controlExpectedNormalizedLabel);
        }
        for (let index = 0; index < count; index += 1) {
          const control = locator.nth(index);
          const [visible, enabled] = await Promise.all([
            control.isVisible().catch(() => false),
            locatorEnabledWithinDeadline(control, deadlineAtMs),
          ]);
          const expectedLabelPresent = recipe.controlExpectedNormalizedLabel === undefined ||
            (await normalizedAcceptLocatorLabels(control)).includes(
              recipe.controlExpectedNormalizedLabel,
            );
          if (visible) visibleCount += 1;
          if (enabled) enabledCount += 1;
          if (expectedLabelPresent) labelMatchCount += 1;
          if (visible && enabled && expectedLabelPresent) {
            const readiness = await inspectLocatorConsentReadiness(control, { deadlineAtMs: timeoutMs > 0 ? deadlineAtMs : undefined, signal, scope });
            if (!readiness.scopeInteractive) { scopeNotInteractive = true; continue; }
            if (locatorActionabilitySupportsVerifiedDispatch(readiness.actionability)) {
              matches.push({ recipe, control, scope });
            } else {
              viewportPendingRecipeIds.push(recipe.recipeId);
            }
          }
        }
      }
    }
    matches = await distinctActionTargets(matches, deadlineAtMs, signal);
    if (signal?.aborted) return { status: "aborted" };
    // A final frame read can finish after the search slice. Its partial sweep
    // is diagnostic only; it cannot establish a unique actionable control.
    if (timeoutMs > 0 && Date.now() >= deadlineAtMs) { reportIncompleteSweep(); return { status: "not_found" }; }
    reportDiagnostic?.({ source: "named_recipe",
      state: matches.length > 1 ? "multiple_actionable" : matches.length === 1 ? "single_actionable"
        : selectorMatchCount === 0 ? "selector_absent" : visibleCount === 0 ? "control_hidden"
          : enabledCount === 0 ? "control_disabled" : labelMatchCount === 0 ? "label_mismatch"
            : scopeNotInteractive ? "control_hidden" : viewportPendingRecipeIds.length > 0 ? "control_not_hit_target" : "geometry_unavailable",
      selectorMatchCount: Math.min(64, selectorMatchCount), visibleCount: Math.min(64, visibleCount),
      enabledCount: Math.min(64, enabledCount), labelMatchCount: Math.min(64, labelMatchCount),
      actionableCount: Math.min(64, matches.length),
      cmpIds: [...new Set([...matchedCmpIds, ...matches.map(match => match.recipe.cmpId).filter((id): id is string => Boolean(id))])].slice(0, 8),
      controlLabels: [...new Set([...matchedControlLabels, ...matches.map(match => match.recipe.controlExpectedNormalizedLabel).filter((label): label is string => Boolean(label))])].slice(0, 4),
    });
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
  reportDiagnostic?: ResolverReporter,
): Promise<AcceptRecipeResolution> {
  const deadlineAtMs = Date.now() + timeoutMs;
  let geometryCmpName: string | undefined;
  const rememberCmp = (name: string) => { geometryCmpName = name; };
  // Network events identify one canonical CMP before selector resolution when
  // possible. Resolve its live, canonically classified first-layer control
  // before consulting the registered selector. The named recipe still owns
  // semantic confirmation; its selector is now a bounded fallback for pages
  // whose live geometry cannot be retained.
  let activeRuntimeRecipes = await resolveActiveRuntimeRecipes(page, recipes, discovery);
  // A positive OneTrust runtime hint only routes the existing named-control
  // verification. Check its live unique control before a broad geometry read
  // can occupy the renderer; all action and semantic gates remain unchanged.
  if (activeRuntimeRecipes.length === 1 && activeRuntimeRecipes[0]?.cmpId === "OneTrust") {
    const namedBudgetMs = Math.min(750, Math.max(0, deadlineAtMs - Date.now()));
    if (namedBudgetMs > 0) {
      const namedResolution = await waitForDeterministicRecipe(
        page, activeRuntimeRecipes, namedBudgetMs, signal, discovery, reportDiagnostic,
      );
      if (namedResolution.status === "found" || namedResolution.status === "aborted") return namedResolution;
    }
  }
  if (activeRuntimeRecipes.length > 0) {
    const canonicalBudgetMs = Math.min(1_000, Math.max(0, deadlineAtMs - Date.now()));
    if (canonicalBudgetMs > 0 && activeRuntimeRecipes.length === 1) {
      const canonicalResolution = await waitForCanonicalAcceptControlRecipe(
        page,
        canonicalBudgetMs,
        signal,
        recipes,
        discovery,
        rememberCmp,
        reportDiagnostic,
        deadlineAtMs,
      );
      if (
        canonicalResolution.status === "found" ||
        canonicalResolution.status === "aborted" ||
        canonicalResolution.status === "ambiguous"
      ) return canonicalResolution;
    }
  }

  let sawAmbiguousResolution = false;
  // A production worker receives the bounded canonical registry, not one
  // site-specific recipe. Give the canonical classifier one geometry pass
  // before an all-registry selector sweep can consume the short search slice.
  // This is also the authorized best-attempt path for non-CMP first layers.
  // It reuses the existing deadline and adds no navigation or observer time.
  if (recipes.length > 1 && activeRuntimeRecipes.length === 0) {
    const initialCanonicalBudgetMs = Math.min(1_000, Math.max(0, deadlineAtMs - Date.now()));
    if (initialCanonicalBudgetMs > 0) {
      const initialCanonicalResolution = await waitForCanonicalAcceptControlRecipe(
        page,
        initialCanonicalBudgetMs,
        signal,
        recipes,
        discovery,
        rememberCmp,
        reportDiagnostic,
        deadlineAtMs,
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
    activeRuntimeRecipes = await resolveActiveRuntimeRecipes(page, recipes, discovery);
    if (Date.now() >= deadlineAtMs) break;
    const boundedRecipes = prioritizeConsentActionRecipes(recipes, activeRuntimeRecipes, geometryCmpName);
    const namedResolution = await waitForDeterministicRecipe(
      page,
      boundedRecipes,
      // A runtime-identified CMP needs time to finish one uniqueness sweep
      // across frames. A 50 ms slice repeatedly discarded valid main-frame
      // matches before child-frame checks, especially for contextual controls
      // that intentionally do not meet the generic label threshold.
      // Reallocate the existing search budget; the outer deadline is unchanged.
      Math.min(750, Math.max(0, deadlineAtMs - Date.now())),
      signal,
      discovery,
      reportDiagnostic,
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
      rememberCmp,
      reportDiagnostic,
      deadlineAtMs,
    );
    if (canonicalResolution.status === "found" || canonicalResolution.status === "aborted") {
      return canonicalResolution;
    }
    if (canonicalResolution.status === "ambiguous") sawAmbiguousResolution = true;
  } while (Date.now() < deadlineAtMs);

  // No unbudgeted all-registry sweep after the search deadline.
  return { status: sawAmbiguousResolution ? "ambiguous" : "not_found" };
}

async function waitForCanonicalAcceptControlRecipe(
  page: Page,
  timeoutMs: number,
  signal?: AbortSignal,
  registeredRecipes: PostAcceptActionRecipe[] = [],
  discovery?: ConsentActionDiscovery,
  onCmpDetected?: (name: string) => void,
  reportDiagnostic?: ResolverReporter,
  outerDeadlineAtMs?: number,
): Promise<AcceptRecipeResolution> {
  const deadlineAtMs = Date.now() + timeoutMs;
  let sawAmbiguousCanonicalControl = false;
  do {
    if (signal?.aborted) return { status: "aborted" };
    const attemptRevision = discovery?.revision ?? 0;
    const geometry = await captureConsentControlGeometry(page, {
      candidateLimit: 48,
      containerLimit: 16,
      avoidOverlappingFrameReads: true,
      timeoutMs: Math.max(1, Math.min(750, deadlineAtMs - Date.now())),
    }).catch(() => undefined);
    if (geometry?.cmp.name) onCmpDetected?.(geometry.cmp.name);
    let candidates = geometry?.candidates.filter((candidate) =>
        candidate.actionType === "accept_all" &&
        (hasActionControlStructure(candidate) || (!geometry?.cmp.detected &&
          candidate.consentContextConfirmed && isCustomAcceptControlCandidate(candidate))) &&
        candidate.decisionStatus === "confirmed_visible" &&
        candidate.layer === "first_layer" &&
        candidate.enabled &&
        candidate.intersectsViewport &&
        candidate.classifierConfidence >= 0.8 &&
        (candidate.consentContextConfirmed || geometry?.cmp.detected === true) &&
        Boolean(candidate.selectorHint) &&
        Boolean(candidate.containerSelectorHint)
      ) ?? [];
    const customBindings = new Map<ConsentControlCandidateEvidence, CustomAcceptControlBinding>();
    let customBindingUnverified = false;
    const customCandidates = candidates.filter(candidate => !hasActionControlStructure(candidate));
    // Never establish uniqueness from a truncated candidate set.
    if (customCandidates.length > 8) return { status: "ambiguous" };
    const customBindingDeadline = consentActionBindingDeadline(deadlineAtMs, outerDeadlineAtMs);
    for (const candidate of customCandidates) {
      if (signal?.aborted) return { status: "aborted" };
      const scope = exactAcceptSelectorScope(page, candidate.frameContext.frameKind === "child_frame"
        ? candidate.frameContext.frameUrl : undefined);
      const binding = scope.status === "found"
        ? await inspectCustomAcceptControl(scope.scope.locator(candidate.selectorHint), candidate.containerSelectorHint!, customBindingDeadline, candidate.normalizedLabel)
        : undefined;
      if (binding) customBindings.set(candidate, binding);
      else customBindingUnverified = true;
    }
    candidates = candidates.filter(candidate => hasActionControlStructure(candidate) || customBindings.has(candidate));
    // A custom control and a native control with the same label may be two
    // distinct choices. Do not let native-wrapper alias reduction discard it.
    if (customBindings.size === 0) candidates = collapseEquivalentCanonicalAcceptCandidates(candidates);
    const snapshot: ResolverSnapshot = canonicalResolverDiagnostic({
      geometry, action: "accept_all", actionableCount: candidates.length, bindingUnverified: customBindingUnverified,
    });
    reportDiagnostic?.(snapshot);
    const bindingState = (state: typeof snapshot.state) => reportDiagnostic?.({ ...snapshot, state, actionableCount: 0 });
    if (customBindingUnverified && candidates.length > 0) {
      // An unreadable competing custom choice cannot establish uniqueness for
      // another control, including when its bounded binding read timed out.
      bindingState("control_binding_unverified");
      return { status: "ambiguous" };
    }
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
      const bindingDeadlineAtMs = consentActionBindingDeadline(deadlineAtMs, outerDeadlineAtMs);
      if (bindingDeadlineAtMs <= Date.now()) { bindingState("binding_budget_exhausted"); break; }
      const controlFrameUrl = candidate.frameContext.frameKind === "child_frame"
        ? candidate.frameContext.frameUrl
        : undefined;
      const scope = exactAcceptSelectorScope(page, controlFrameUrl);
      if (scope.status === "ambiguous") {
        bindingState("scope_ambiguous");
        sawAmbiguousCanonicalControl = true;
        continue;
      }
      if (scope.status !== "found") { bindingState("frame_not_found"); continue; }
      const containerSelector = candidate.containerSelectorHint!;
      const containers = scope.scope.locator(containerSelector);
      if (await containers.count().catch(() => 0) !== 1) {
        bindingState("scope_ambiguous");
        sawAmbiguousCanonicalControl = true;
        continue;
      }
      if (!await consentScopePermitsInteraction(containers.first())) { bindingState("scope_not_interactive"); continue; }
      const controlSelector = candidate.selectorHint === containerSelector ||
          candidate.selectorHint.startsWith(`${containerSelector} `)
        ? candidate.selectorHint
        : `:is(${candidate.selectorHint}):is(${containerSelector}, ${containerSelector} *)`;
      const controls = scope.scope.locator(controlSelector);
      const controlCount = Math.min(await controls.count().catch(() => 0), 9);
      if (controlCount > 8) { bindingState("multiple_actionable"); return { status: "ambiguous" }; }
      const actionableControls: Locator[] = [];
      let failedStage: typeof snapshot.state = "selector_absent";
      const stages: Array<typeof snapshot.state> = ["selector_absent", "control_hidden", "control_disabled", "label_mismatch", "control_not_hit_target"];
      const failed = (stage: typeof snapshot.state) => {
        if (stages.indexOf(stage) > stages.indexOf(failedStage)) failedStage = stage;
      };
      for (let index = 0; index < controlCount; index += 1) {
        const control = controls.nth(index);
        if (!await control.isVisible().catch(() => false)) { failed("control_hidden"); continue; }
        if (Date.now() >= bindingDeadlineAtMs) { bindingState("binding_budget_exhausted"); break; }
        if (!await locatorEnabledWithinDeadline(control, bindingDeadlineAtMs)) { failed("control_disabled"); continue; }
        if (!(await normalizedAcceptLocatorLabels(control)).includes(candidate.normalizedLabel)) { failed("label_mismatch"); continue; }
        if (!await locatorHasViewportHitTarget(control, { deadlineAtMs: bindingDeadlineAtMs, signal, scope: scope.scope })) { failed("control_not_hit_target"); continue; }
        actionableControls.push(control);
      }
      if (actionableControls.length > 1) {
        bindingState("multiple_actionable");
        sawAmbiguousCanonicalControl = true;
        continue;
      }
      if (actionableControls.length !== 1) { bindingState(failedStage); continue; }
      const candidateCmpName = await liveConsentActionCmp(actionableControls[0]!, registeredRecipes, bindingDeadlineAtMs);
      const customControlBinding = customBindings.get(candidate);
      // A custom generic binding must not bypass any named CMP's exact recipe.
      if (customControlBinding && candidateCmpName) { bindingState("control_binding_unverified"); continue; }
      if (!candidate.consentContextConfirmed && !candidateCmpName) { bindingState("scope_not_interactive"); continue; }
      const registeredCmpRecipe = selectCanonicalAcceptConfirmationRecipe(registeredRecipes, candidateCmpName);
      const recipe: PostAcceptActionRecipe = {
        artifactVersion: "certscore.post_accept_action_recipe.v1",
        recipeId: `canonical-control:accept:${customControlBinding ? "custom-v1" : "v1"}:${hashValue([
          candidate.normalizedLabel,
          candidate.selectorHint,
          containerSelector,
          controlFrameUrl ?? "main_frame",
          registeredCmpRecipe?.recipeId ?? "generic_confirmation",
        ].join("\n")).slice(0, 24)}`,
        ...(registeredCmpRecipe?.cmpId
          ? { cmpId: registeredCmpRecipe.cmpId }
          : candidateCmpName
            ? { cmpId: candidateCmpName }
            : {}),
        resolverMethod: registeredCmpRecipe?.resolverMethod ??
          "canonical_consent_control_registry_recipe",
        controlSelector,
        controlExpectedNormalizedLabel: candidate.normalizedLabel,
        ...(customControlBinding ? { customControlBinding } : {}),
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
      // Finish the full frame/selector uniqueness sweep using remaining outer
      // search time. The former 100 ms slice could repeatedly discard a valid
      // candidate. No overall deadline or observation window is extended.
      const confirmationSearchMs = Math.min(750, Math.max(0, (outerDeadlineAtMs ?? deadlineAtMs) - Date.now()));
      if (confirmationSearchMs <= 0) { bindingState("binding_budget_exhausted"); break; }
      const resolved = await waitForDeterministicRecipe(
        page,
        [recipe],
        confirmationSearchMs,
        signal,
        discovery,
        reportDiagnostic,
      );
      if (resolved.status === "found" && Date.now() >= (outerDeadlineAtMs ?? deadlineAtMs)) {
        bindingState("binding_budget_exhausted");
        break;
      }
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
    const fields = await handle.evaluate(readConsentActionLabelFields).catch(() => ({}));
    const labels = Object.values(fields).filter((value): value is string => Boolean(value?.trim()));
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
  assertDispatchAllowed?: () => void,
  readOptions?: ConsentControlReadOptions,
) {
  assertDispatchAllowed?.();
  if (recipe.customControlBinding) {
    const binding = await inspectCustomAcceptControl(control, recipe.customControlBinding.bannerSelector, Date.now() + 100, recipe.controlExpectedNormalizedLabel);
    if (!sameCustomAcceptControlBinding(binding, recipe.customControlBinding)) {
      throw new Error("Custom Accept control binding changed before dispatch.");
    }
    assertDispatchAllowed?.();
  }
  if (recipe.accessibleControl?.kind === "closed_shadow_accessible_control") {
    await dispatchClosedShadowAccessibleControl(page, recipe.accessibleControl, assertDispatchAllowed);
    return;
  }
  if (useVerifiedGeometryDispatch) {
    await dispatchLocatorClickWithVerifiedGeometry(control, 2_000, assertDispatchAllowed, readOptions);
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
  control: Locator,
): Promise<ConfirmationBaseline> {
  if (confirmation.kind === "canonical_accept_transition") {
    const [controlVisible, surfacePresent, bannerStateHash] = await Promise.all([
      locatorIsVisible(page, confirmation.controlSelector, confirmation.controlFrameUrl),
      locatorIsVisible(page, confirmation.bannerSelector, confirmation.bannerFrameUrl).then((visible) =>
        visible || (confirmation.bannerFrameUrl === confirmation.controlFrameUrl
          ? canonicalConsentSurfacePresent(confirmationScope, control, confirmation.bannerSelector)
          : false)),
      visibleAcceptLocatorStateHash(
        page,
        confirmation.bannerSelector,
        confirmation.bannerFrameUrl,
      ),
    ]);
    return {
      kind: confirmation.kind,
      controlVisible,
      surfacePresent,
      complianzControlBound: confirmation.controlSelector.includes(".cmplz-") && await isComplianzControl(control),
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
      configurationSha256: snapshot?.configurationSha256,
      eventSequence: snapshot?.eventSequence ?? 0,
      ...(snapshot ? {apiRead:{snapshot,readAtEpochMs:Date.now()}} : {}),
    };
  }
  if (confirmation.kind === "tcf_purposes_granted_or_cmp_cookie_changed") {
    const [snapshot, cookieStateHash, oneTrustBaseline] = await Promise.all([
      readTcfData(page).catch(() => undefined),
      cookieState(context, confirmation.cookieName),
      confirmation.cookieName === "OptanonConsent" ? captureOneTrustBaseline(context, confirmationScope) : undefined,
    ]);
    return { kind: confirmation.kind, snapshot, cookieStateHash, oneTrustBaseline };
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
  onDecisionObserved?: (state: SemanticState) => void,
  diagnostics?: { pass: () => void; reason: (reason: import("@certscore/contracts").ConsentConfirmationReason) => void; apiSnapshot?: (snapshot: import("./cmp-api-consent-state").CmpApiConsentSnapshot | undefined) => void },
): Promise<ConfirmationState | undefined> {
  if (confirmation.kind === "canonical_accept_transition") {
    if (baseline.kind !== "canonical_accept_transition" || !baseline.controlVisible || !baseline.surfacePresent) return undefined;
    const deadlineAtMs = Date.now() + timeoutMs;
    let firstRead=true;
    while (firstRead || Date.now() <= deadlineAtMs) {
      firstRead=false;diagnostics?.pass();
      if (signal?.aborted) { diagnostics?.reason("confirmation_aborted"); return undefined; }
      const state = await verifiedCanonicalStateWrite({
        context, scope: confirmationScope, actionAt: actionDispatchedAtEpochMs, onDiagnostic: diagnostics?.reason,
        complianzControlBound: baseline.complianzControlBound,
      });
      if (state) onDecisionObserved?.(state);
      if (state && state.decision !== "granted") diagnostics?.reason("opposite_or_mixed_decision");
      else if (!state) diagnostics?.reason("no_registered_complete_decision");
      if (state?.decision === "granted" &&
        normalizeTargetUrl(page.url()) === normalizeTargetUrl(baseline.pageUrl)) {
        return { stateHash: state.stateHash, key: state.key, observedAtEpochMs: state.observedAtEpochMs,
          ...(state.complianzReceiptEvidence ? {complianzReceiptEvidence:state.complianzReceiptEvidence} : {}),
          witnessType: "canonical_acceptance_state",
          expectedState: "canonical_granted_consent_decision_written_after_action" };
      }
      if (Date.now() >= deadlineAtMs) return undefined;
      await waitForDelay(25, signal).catch(() => undefined);
    }
    return undefined;
  }
  const deadlineAtMs = Date.now() + timeoutMs;
  let firstRead=true;
  while (firstRead || Date.now() <= deadlineAtMs) {
    firstRead=false;diagnostics?.pass();
    if (signal?.aborted) { diagnostics?.reason("confirmation_aborted"); return undefined; }
    if (confirmation.kind === "local_storage_equals" && baseline.kind === confirmation.kind) {
      const writes = await readStorageWrites(confirmationScope);
      const value = await confirmationScope.evaluate(
        (key) => window.localStorage.getItem(key),
        confirmation.key,
      ).catch(() => null);
      const freshWrite = writes.some((write) =>
        write.sequence > baseline.lastSequence &&
        write.observedAtEpochMs >= actionDispatchedAtEpochMs &&
        write.storageType === "local_storage" &&
        write.name === confirmation.key && write.value === value
      );
      if (value === null) diagnostics?.reason("receipt_missing");
      else if (value !== confirmation.expectedValue) diagnostics?.reason("no_registered_complete_decision");
      else if (!freshWrite) diagnostics?.reason("no_fresh_decision");
      if (freshWrite && value === confirmation.expectedValue) {
        return {
          observedAtEpochMs: matchingStateWriteTime(writes, confirmation.key, value, actionDispatchedAtEpochMs, "local_storage"),
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
      if (confirmation.cookies.some(cookie => !states[cookieKey(cookie)])) diagnostics?.reason("receipt_missing");
      else if (!complete) diagnostics?.reason("no_registered_complete_decision");
      else if (!changed) diagnostics?.reason("no_fresh_decision");
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
      if (!currentCookieState) diagnostics?.reason("receipt_missing");
      else if (currentCookieState === baseline.cookieStateHash) diagnostics?.reason("no_fresh_decision");
      if (currentCookieState && currentCookieState !== baseline.cookieStateHash) {
        const semantic = await verifiedCookieDecision({ context, scope: confirmationScope,
            cookieName: confirmation.cookieName, actionAt: actionDispatchedAtEpochMs, onDiagnostic: diagnostics?.reason });
          if (semantic) onDecisionObserved?.(semantic);
          if (semantic && semantic.decision !== "granted") diagnostics?.reason("opposite_or_mixed_decision");
          if (semantic?.decision === "granted") return {
            stateHash: semantic.stateHash, key: semantic.key, observedAtEpochMs: semantic.observedAtEpochMs,
            ...(semantic.complianzReceiptEvidence ? {complianzReceiptEvidence:semantic.complianzReceiptEvidence} : {}),
            ...(semantic.oneTrustGroupEvidence ? { oneTrustGroupEvidence: semantic.oneTrustGroupEvidence } : {}),
            witnessType: "cmp_cookie_state", expectedState: "canonical_cmp_granted_decision_after_action",
          };
      }
    } else if (confirmation.kind === "cmp_cookie_names_changed" && baseline.kind === confirmation.kind) {
      for (const cookieName of confirmation.cookieNames.slice(0, 8)) {
        const currentCookieState = await cookieState(context, cookieName);
        if (!currentCookieState) diagnostics?.reason("receipt_missing");
        else if (currentCookieState === baseline.cookieStateHashes[cookieName]) diagnostics?.reason("no_fresh_decision");
        if (currentCookieState && currentCookieState !== baseline.cookieStateHashes[cookieName]) {
          const semantic = await verifiedCookieDecision({ context, scope: confirmationScope,
            cookieName: cookieName, actionAt: actionDispatchedAtEpochMs, onDiagnostic: diagnostics?.reason });
          if (semantic) onDecisionObserved?.(semantic);
          if (semantic && semantic.decision !== "granted") diagnostics?.reason("opposite_or_mixed_decision");
          if (semantic?.decision === "granted") return {
            stateHash: semantic.stateHash, key: semantic.key, observedAtEpochMs: semantic.observedAtEpochMs,
            ...(semantic.complianzReceiptEvidence ? {complianzReceiptEvidence:semantic.complianzReceiptEvidence} : {}),
            ...(semantic.oneTrustGroupEvidence ? { oneTrustGroupEvidence: semantic.oneTrustGroupEvidence } : {}),
            witnessType: "cmp_cookie_state", expectedState: "canonical_cmp_granted_decision_after_action",
          };
        }
      }
    } else if (
      confirmation.kind === "cmp_api_consent_state_changed" &&
      baseline.kind === confirmation.kind
    ) {
      const snapshot = await readCmpApiConsentSnapshot(confirmationScope, confirmation.provider, diagnostics?.reason);
      if (confirmation.provider === "hubspot") diagnostics?.apiSnapshot?.(snapshot);
      const eligibility = snapshot && evaluateCmpApiConfirmation({provider: confirmation.provider,
        baseline, snapshot, decision: "granted", actionDispatchedAtEpochMs});
      if (eligibility && !eligibility.eligible) diagnostics?.reason(eligibility.reason);
      if (snapshot && eligibility?.eligible) {
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
      let decoded: SemanticState | undefined;
      const tcfRead = readTcfData(page).then((snapshot): ConfirmationState | undefined => {
        if (!tcfPurposesGranted(snapshot, confirmation.purposeIds, baseline.snapshot)) return undefined;
        return {stateHash: snapshot!.tcStringHash ?? hashValue(JSON.stringify(snapshot!.purposeConsents)),
          witnessType: "tcf_user_action_complete", tcfApiSource: snapshot!.apiSource,
          tcfPurposeEvidence: snapshot!.purposeEvidence, expectedState: "configured_purposes_granted_after_accept"};
      });
      const cookieRead = async (): Promise<ConfirmationState | undefined> => {
        if (confirmation.cookieName === "OptanonConsent" && baseline.oneTrustBaseline?.status === "verified") {
          decoded = await verifiedChangedOneTrustDecision({context, scope: confirmationScope,
            cookieName: confirmation.cookieName, actionAt: actionDispatchedAtEpochMs,
            oneTrustBaseline: baseline.oneTrustBaseline, onDiagnostic: diagnostics?.reason});
        } else {
          const currentCookieState = await cookieState(context, confirmation.cookieName);
          if (!currentCookieState || currentCookieState === baseline.cookieStateHash) {
            diagnostics?.reason(currentCookieState ? "no_fresh_decision" : "receipt_missing");return undefined;
          }
          decoded = await verifiedCookieDecision({context, scope: confirmationScope,
            cookieName: confirmation.cookieName, actionAt: actionDispatchedAtEpochMs,
            oneTrustBaseline: baseline.oneTrustBaseline, onDiagnostic: diagnostics?.reason});
        }
        if (decoded?.decision !== "granted") {if(decoded)diagnostics?.reason("opposite_or_mixed_decision");return undefined;}
        return {stateHash:decoded.stateHash,key:decoded.key,observedAtEpochMs:decoded.observedAtEpochMs,
          ...(decoded.complianzReceiptEvidence ? {complianzReceiptEvidence:decoded.complianzReceiptEvidence} : {}),
          ...(decoded.oneTrustGroupEvidence ? {oneTrustGroupEvidence:decoded.oneTrustGroupEvidence}:{}),
          witnessType:"cmp_cookie_state",expectedState:"canonical_cmp_granted_decision_after_action"};
      };
      const result = await firstVerifiedConsentRead([tcfRead,cookieRead()]);
      if(decoded&&(!result||result.witnessType==="cmp_cookie_state"))onDecisionObserved?.(decoded);
      if(result)return result;
    } else if (
      confirmation.kind === "tcf_purposes_granted_or_cmp_storage_keys_changed" &&
      baseline.kind === confirmation.kind
    ) {
      let decoded: SemanticState | undefined;
      const tcfRead = readTcfData(page).then((snapshot): ConfirmationState | undefined => {
        if (!tcfPurposesGranted(snapshot, confirmation.purposeIds, baseline.snapshot)) return undefined;
        return {stateHash:snapshot!.tcStringHash??hashValue(JSON.stringify(snapshot!.purposeConsents)),
          witnessType:"tcf_user_action_complete",tcfApiSource:snapshot!.apiSource,
          tcfPurposeEvidence:snapshot!.purposeEvidence,expectedState:"configured_purposes_granted_after_accept"};
      });
      const storageRead = async (): Promise<ConfirmationState | undefined> => {
        const writes=await readStorageWrites(confirmationScope);
        for(const key of confirmation.keys.slice(0,8)){
          const freshWrite=writes.some(write=>write.sequence>baseline.lastSequence&&write.observedAtEpochMs>=actionDispatchedAtEpochMs&&write.storageType===confirmation.storageType&&write.name===key);
          if(!freshWrite)continue;
          const stateHash=await storageStateHash(confirmationScope,confirmation.storageType,key);
          if(!stateHash||stateHash===baseline.storageStateHashes[key])continue;
          decoded=await verifiedCanonicalStateWrite({context,scope:confirmationScope,actionAt:actionDispatchedAtEpochMs,registeredKeys:confirmation.keys,onDiagnostic:diagnostics?.reason});
          if(decoded?.decision!=="granted"||decoded.key!==key){if(decoded)diagnostics?.reason("opposite_or_mixed_decision");continue;}
          return {stateHash:decoded.stateHash,key:decoded.key,observedAtEpochMs:decoded.observedAtEpochMs,
            ...(decoded.complianzReceiptEvidence ? {complianzReceiptEvidence:decoded.complianzReceiptEvidence} : {}),
            ...(decoded.oneTrustGroupEvidence?{oneTrustGroupEvidence:decoded.oneTrustGroupEvidence}:{}),
            witnessType:"cmp_storage_state",expectedState:"canonical_cmp_granted_decision_after_action"};
        }
        diagnostics?.reason("no_registered_complete_decision");return undefined;
      };
      const result=await firstVerifiedConsentRead([tcfRead,storageRead()]);
      if(decoded&&(!result||result.witnessType==="cmp_storage_state"))onDecisionObserved?.(decoded);
      if(result)return result;
    }
    if (Date.now() >= deadlineAtMs) return undefined;
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
  canExitEarly?: () => boolean;
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

    // Keep yielding while optional images overlap the original window. An
    // expired early-signal deadline must not create a zero-delay busy loop.
    const canExitEarly = input.canExitEarly?.() ?? true;
    const currentDeadlineAtMs = canExitEarly
      ? earlyExitDeadlineAtMs ?? observationDeadlineAtMs : observationDeadlineAtMs;
    if (Date.now() - lastTcfPollAtMs >= 100) {
      lastTcfPollAtMs = Date.now();
      lastTcfData = await pollWithinPostAcceptObservationDeadline(
        () => readTcfData(input.page).catch(() => undefined),
        undefined,
        currentDeadlineAtMs,
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
      currentDeadlineAtMs,
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

    if (earlyExitDeadlineAtMs !== undefined && Date.now() >= earlyExitDeadlineAtMs && (input.canExitEarly?.() ?? true)) {
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
      currentDeadlineAtMs,
    );
    await waitForDelay(
      Math.min(25, Math.max(0, nextDeadlineAtMs - Date.now())),
      input.signal,
    ).catch(() => undefined);
  }

  return {
    completed: !input.signal?.aborted,
    reason: "window_elapsed",
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
    const googleConsentMode = captureGoogleConsentModeRequest({ url, requestId: entry.requestId, timestampMs: elapsed(scanStartedAtMs, entry.startedAtEpochMs) });
    const offset = acceptanceRegisteredAtEpochMs === undefined
      ? undefined
      : elapsed(scanStartedAtMs, entry.startedAtEpochMs) - elapsed(scanStartedAtMs, acceptanceRegisteredAtEpochMs);
    return {
      requestId: entry.requestId,
      sanitizedUrl: sanitizeUrl(url),
      ...(googleConsentMode ? { googleConsentMode } : {}),
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
  onDiagnostics?: (diagnostics: ActionStorageCollectionDiagnostics) => void,
): Promise<PostRefusalStorageItem[]> {
  let pageStorageAvailable = true;
  const pageStorage = await page.evaluate(() => {
    let localStorage: Array<[string, string]> = [];
    let sessionStorage: Array<[string, string]> = [];
    let localStorageAvailable = true; let sessionStorageAvailable = true;
    try { localStorage = Object.entries(window.localStorage).slice(0, 385); } catch { localStorageAvailable = false; }
    try { sessionStorage = Object.entries(window.sessionStorage).slice(0, 385); } catch { sessionStorageAvailable = false; }
    return { localStorage, sessionStorage, localStorageAvailable, sessionStorageAvailable };
  }).catch(() => {
    pageStorageAvailable = false;
    return { localStorage: [] as Array<[string, string]>, sessionStorage: [] as Array<[string, string]>, localStorageAvailable: false, sessionStorageAvailable: false };
  });
  let snapshotUrl = new URL(targetUrl);
  try { snapshotUrl = new URL(page.url()); } catch {}
  const hostname = snapshotUrl.hostname;
  const origin = snapshotUrl.origin;
  let cookiesAvailable = true;
  const rawCookies = await context.cookies().catch(() => {
    cookiesAvailable = false;
    limitations.push("cookie_snapshot_unavailable");
    return [];
  });
  const normalized = normalizeActionStorageSnapshot({ cookies: rawCookies, localStorage: pageStorage?.localStorage, sessionStorage: pageStorage?.sessionStorage });
  if (normalized.droppedCookies > 0 && !limitations.includes("cookie_snapshot_invalid_entries")) limitations.push("cookie_snapshot_invalid_entries");
  if (normalized.droppedLocalStorage > 0 && !limitations.includes("local_storage_snapshot_invalid_entries")) limitations.push("local_storage_snapshot_invalid_entries");
  if (normalized.droppedSessionStorage > 0 && !limitations.includes("session_storage_snapshot_invalid_entries")) limitations.push("session_storage_snapshot_invalid_entries");
  onCookies?.(normalized.cookies);
  const items: PostRefusalStorageItem[] = [];
  for (const cookie of normalized.cookies.slice(0, 384)) {
    items.push(classifyStorageItem({
      expiresAtEpochSeconds: cookie.expires,
      capturedAtEpochSeconds: Date.now() / 1000,
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
  for (const [name, value] of normalized.localStorage.slice(0, 384)) {
    items.push(classifyStorageItem({
      storageType: "local_storage",
      name,
      value,
      hostname,
      identityBasis: "origin_storage_key",
      identityHash: postRefusalStorageIdentityHash({ storageType: "local_storage", name, origin }),
    }));
  }
  for (const [name, value] of normalized.sessionStorage.slice(0, 384)) {
    items.push(classifyStorageItem({
      storageType: "session_storage",
      name,
      value,
      hostname,
      identityBasis: "origin_storage_key",
      identityHash: postRefusalStorageIdentityHash({ storageType: "session_storage", name, origin }),
    }));
  }
  const retainedItems = items.sort((left, right) =>
    Number(right.nonEssential) - Number(left.nonEssential) || storageKey(left).localeCompare(storageKey(right))
  ).slice(0, MAX_STORAGE_ITEMS);
  const retainedCount = (type: PostRefusalStorageItem["storageType"]) => retainedItems.filter((item) => item.storageType === type).length;
  const channel = (count: number, dropped: number, available: boolean) => ({
    count: Math.min(count, 384), dropped, available, limit: MAX_STORAGE_ITEMS,
    retainedCount: 0,
    ...(count > 384 ? { sampled: true, sampledDroppedCount: 1 } : {}),
  });
  const diagnostics = actionStorageCollectionDiagnostics({
    cookies: { ...channel(normalized.cookies.length, normalized.droppedCookies, cookiesAvailable), retainedCount: retainedCount("cookie") },
    localStorage: { ...channel(normalized.localStorage.length, normalized.droppedLocalStorage, pageStorageAvailable && pageStorage.localStorageAvailable), retainedCount: retainedCount("local_storage") },
    sessionStorage: { ...channel(normalized.sessionStorage.length, normalized.droppedSessionStorage, pageStorageAvailable && pageStorage.sessionStorageAvailable), retainedCount: retainedCount("session_storage") },
  });
  onDiagnostics?.(diagnostics);
  return retainedItems;
}

function classifyStorageItem(input: {
  expiresAtEpochSeconds?: number;
  capturedAtEpochSeconds?: number;
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
    ...(input.expiresAtEpochSeconds !== undefined ? { expiresAtEpochSeconds: input.expiresAtEpochSeconds, capturedAtEpochSeconds: input.capturedAtEpochSeconds } : {}),
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
  if (write.storageType === "cookie" && (write.deletion || write.value === "")) return undefined;
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
    msOffsetFromAccept: Math.max(0, elapsed(scanStartedAtMs, write.observedAtEpochMs) - elapsed(scanStartedAtMs, acceptedAtEpochMs)),
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
  return resolveCanonicalVendor({
    ...input,
    sourceScanner: POST_ACCEPT_SOURCE,
    scenario: "accept_all_flow",
    consentStateAtTime: "post_accept",
    matchSource: input.type === "request"
      ? "network_request"
      : input.cookieName
        ? "cookie_name"
        : "storage_key",
  }).observation;
}

async function installStorageWriteProbe(page: Page) {
  await page.addInitScript({ content: `(() => {
    const records = [];
    const hookInstalledAtMs = performance.timeOrigin + performance.now();
    let sequence = 0;
    let installedCookieSetter;
    let installedStorageSetter;
    const retain = (record) => {
      records.push({ ...record, sequence: ++sequence });
      if (records.length > 192) records.splice(0, records.length - 192);
    };
    Object.defineProperty(window, "__certscoreReadPostAcceptWrites", {
      configurable: false,
      enumerable: false,
      value: Object.assign(() => records.slice(-96).map((record) => ({ ...record })), { coverage: () => ({
        observedLifetimeCount: sequence, ringEvictedCount: Math.max(0, sequence - 192),
        readbackOmittedCount: Math.max(0, records.length - 96),
        storageHookHealthy: Storage.prototype.setItem === installedStorageSetter,
        cookieHookHealthy: !!installedCookieSetter && Object.getOwnPropertyDescriptor(Document.prototype, "cookie")?.set === installedCookieSetter,
        documentUrl: location.href, documentTimeOriginMs: performance.timeOrigin, hookInstalledAtMs,
      }) }),
      writable: false,
    });
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = installedStorageSetter = function(key, value) {
      let storageType = "local_storage";
      try { storageType = this === window.sessionStorage ? "session_storage" : "local_storage"; } catch (_) {}
      const result = originalSetItem.call(this, key, value);
      retain({ storageType, name: String(key).slice(0, 180), value: String(value).length <= 2048 ? String(value) : undefined, observedAtEpochMs: performance.timeOrigin + performance.now() });
      return result;
    };
    const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
    if (cookieDescriptor && cookieDescriptor.get && cookieDescriptor.set && cookieDescriptor.configurable) {
      Object.defineProperty(Document.prototype, "cookie", {
        configurable: true,
        enumerable: cookieDescriptor.enumerable,
        get: cookieDescriptor.get,
        set: installedCookieSetter = function(value) {
          const name = String(value).split("=", 1)[0].trim().slice(0, 180);
          const result = cookieDescriptor.set.call(this, value);
          const cookieValue = String(value).slice(String(value).indexOf("=") + 1).split(";", 1)[0];
          const attributes = String(value).split(";").slice(1).map((attribute) => attribute.trim());
          const maxAge = attributes.find((attribute) => attribute.toLowerCase().startsWith("max-age="))?.slice(8);
          const expires = attributes.find((attribute) => attribute.toLowerCase().startsWith("expires="))?.slice(8);
          const deletion = maxAge !== undefined ? Number(maxAge) <= 0 : expires !== undefined && Date.parse(expires) <= Date.now();
          retain({ storageType: "cookie", name, deletion, value: cookieValue.length <= 2048 ? cookieValue : undefined,
            ...((/consent|optanon|^cmplz_|^__cmp|^cmapi_|(?:^|[.])notice_(?:gdpr_prefs|preferences)$|(?:^|[.])cmapi_cookie_privacy$/i.test(name) || /^_iub_cs(?:-(?:s)?[0-9]{1,16})?$/i.test(name)) ? {
              cookieAssignment: String(value).length <= 4096 ? String(value) : undefined,
              documentUrl: location.href.length <= 2048 ? location.href : undefined,
            } : {}), observedAtEpochMs: performance.timeOrigin + performance.now() });
          return result;
        },
      });
    }
  })();` + CMP_PASSIVE_EVENT_INIT_SCRIPT });
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
  const raw = await readConsentActionTcfData(page);
  if (!raw) return undefined;
  const decoded = decodeTcfV2PurposeConsents(raw.tcString);
  return {
    apiSource: raw.apiSource,
    purposeEvidence: raw.purposeEvidence,
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
  const token=receiptCaptureToken(context);
  const cookies=await context.cookies();
  retainReceiptCookies(token,cookies,cookieName);
  const states = cookies.filter((cookie) =>
    matchesCanonicalCmpCookieName(cookie.name, cookieName)
  ).map((cookie) => [
    cookie.name,
    cookie.domain.toLowerCase().replace(/^\./, ""),
    cookie.path,
    hashValue(consentReceiptChangeValue(cookie.name, cookie.value)),
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
