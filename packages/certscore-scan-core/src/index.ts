import path from "node:path";
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import {
  type CanonicalEvidenceBundle,
  type CmpRuntimeObservation,
  type CookieEvent,
  type ConsentUiObservation,
  type CookieSnapshot,
  type DomSnapshotArtifact,
  type EvidenceRef,
  type IframeEvent,
  type NetworkEvent,
  type NetworkResponseEvent,
  type PolicySurfaceObservation,
  type RuntimeCoverageSummary,
  type RuntimeEvidenceEvent,
  type ScanProfile,
  type ScanNoGoAssessment,
  type ScanEvidenceLaneAssessment,
  type ScreenshotArtifact,
  type ConsentFlowScenario,
  type StorageSnapshot,
  type VisualAccessReview,
  type VisualCaptureSummary,
  SCHEMA_VERSION,
  canonicalEvidenceBundleSchema,
  deriveConsentSurfaceInspectionOutcome,
  derivePolicySurfaceInspectionOutcome,
  isVerifiedTerminalConsentPacket,
} from "@certscore/contracts";
import { resolveVendorObservations } from "@certscore/vendor-resolver";
import type { ScanNoGoReasonCode } from "@website-signal-risk-scanner/shared";
import { chromium, type Browser } from "playwright";
import { createArtifactWriter, type ArtifactWriter } from "./artifact-writer.js";
import { withBoundedCookieInitiatorMetadata } from "./bounded-initiator-url.js";
import {
  buildObservedJourneys,
  classifyCookieEvents,
  summarizeObservedJourneys,
} from "./journey-builder.js";
import { createOpenAiNanoPolicyAssistProviderFromEnv } from "./nano-policy-assist-provider.js";
import { getScanProfile } from "./profiles.js";
import { consentFlowRuntimeScannerPlaceholder, policySurfaceScannerPlaceholder } from "./scanners/placeholders.js";
import {
  consentUiObservationFromConfirmedGeometryControls,
  detectConsentUi,
  LATE_CONSENT_GEOMETRY_SHADOW_BUDGET_MS,
  preConsentRuntimeScanner,
  readRapidFirstLayerConsentUiObservation,
  readDeclaredDocumentLanguage,
  reconcileConsentUiRecapture,
  type PreConsentRuntimeScannerResult,
} from "./scanners/pre-consent-runtime-scanner.js";
import {
  countRecoveredPolicySurfaceObservations,
  mergePolicySurfaceObservations,
  policySurfaceObservationsFromRetainedRenderedLinks,
  policySurfaceScanner,
  recoverPolicyDocumentsFromRetainedRenderedLinks,
  type PolicySurfaceScannerResult,
} from "./scanners/policy-surface-scanner.js";
import { chromiumContextOptions, chromiumLaunchOptions, chromiumProxyOptions } from "./playwright-runtime.js";
import { captureConsentControlGeometry } from "./consent-control-geometry.js";
import {
  buildConsentGeometryEgressDiagnostic,
  collectConsentGeometryPageAccess,
} from "./consent-geometry-access.js";
import { maybeFulfillHeavyResource } from "./resource-stubbing.js";
import { installWebBotAuthRoute } from "./web-bot-auth-routing.js";
import { throwIfAborted } from "./abort.js";
import {
  classifyNavigationFailure,
  isLikelyInfrastructureHomepageTarget,
  isNavigationTransportFailure,
  navigationTransportRecoveryUrls,
} from "./transport-fallback.js";

type ConsentFlowRuntimeScanner = typeof import("./scanners/consent-flow-runtime-scanner.js").consentFlowRuntimeScanner;
type ConsentFlowRuntimeInput = Parameters<ConsentFlowRuntimeScanner>[0];
type ConsentFlowRuntimeResult = Awaited<ReturnType<ConsentFlowRuntimeScanner>>;
const MAX_MODULE_TIMING_BREAKDOWN_ENTRIES = 40;
const PRE_CONSENT_DEADLINE_SETTLE_GRACE_MS = 250;
const MIN_PRE_CONSENT_VISUAL_FALLBACK_START_BUDGET_MS = 1_000;

export {
  chromiumLaunchArgs,
  chromiumContextOptions,
  chromiumLaunchOptions,
  chromiumProxyOptions,
  isAwsLambdaRuntime,
  lambdaChromiumSingleProcessEnabled,
} from "./playwright-runtime.js";

export { proxyFetch } from "./proxy-fetch.js";

export {
  assertPublicTestContactAllowed,
  PUBLIC_TEST_CONTACT_HOLDS,
  publicTestContactHoldForUrl,
  type PublicTestContactHold,
} from "./public-test-contact-holds.js";

export {
  captureConsentControlGeometry,
  type ConsentControlCandidateEvidence,
  type ConsentControlCmpEvidence,
  type ConsentControlContainerEvidence,
  type ConsentControlDecisionStatus,
  type ConsentControlGeometryActionType,
  type ConsentControlGeometryArtifact,
  type ConsentControlGeometryLayer,
  type ConsentControlRect,
} from "./consent-control-geometry.js";

export {
  buildReviewPacket,
  normalizeNanoVisualReview,
  runConsentGeometryNanoVisualReview,
  type ConsentGeometryNanoVisualReview,
  type ConsentGeometryNanoVisualReviewSummary,
  type NanoVisualAgreement,
  type NanoVisualBoolean,
  type NanoVisualReviewStatus,
} from "./consent-geometry-visual-review.js";

export interface RunScanInput {
  signal?: AbortSignal;
  url: string;
  profile?: ScanProfile["profileId"];
  outDir?: string;
  region?: string;
  captureReplay?: boolean;
  captureReplayAuxiliaryProbes?: "all" | "none" | "form" | "accessibility";
  captureReplayTrace?: boolean;
  privacyControlUrls?: string[];
  scenarioPlanningMode?: "legacy_sequential" | "planned_parallel";
  scenarioConcurrency?: number;
  allowedConsentFlowScenarios?: ConsentFlowScenario[];
  policyPlanningDeadlineMs?: number;
  policyOutputGraceMs?: number;
  /** Absolute policy-lane deadline used to preserve scanner shutdown and result-publication time. */
  policySurfaceDeadlineAtMs?: number;
  policySurfaceSeeds?: PolicySurfaceSeed[];
  preConsentScreenshotMode?: "always" | "selective" | "never";
  preConsentScreenshotTimeoutMs?: number;
  /**
   * Non-blocking handoff fired immediately after a representative pre-consent
   * screenshot is written. Consumers may begin retention review in parallel,
   * but must not infer findings from screenshot pixels.
   */
  onPreConsentScreenshotCaptured?: (screenshot: ScreenshotArtifact) => void;
  /** Local diagnostic override; production callers retain the 10s default. */
  lateConsentGateMs?: number;
  preConsentVisualFallbackDeadlineMs?: number;
  /** Absolute deadline for optional visual recovery, preserving time to finalize retained scan output. */
  preConsentVisualFallbackDeadlineAtMs?: number;
  /** Internal/test override that may shorten, but never extend, the profile module budget. */
  preConsentModuleDeadlineMs?: number;
  consentFlowScreenshotMode?: "auto" | "none";
  consentFlowDeadlineMs?: number;
  consentFlowActionFinalSettleMs?: number;
  scenarioResourceMode?: "normal" | "lean" | "cmp_safe";
  consentFlowPreActionObservationMs?: number;
  consentFlowActionSearchDeadlineMs?: number;
  consentActionRecipe?: ConsentActionRecipeInput;
  consentFlowOneTrustHiddenActionMode?: "off" | "diagnostic";
  consentFlowExternalBaselinePlanning?: "enrich" | "reuse_only";
  consentFlowForceAllowedScenarioPlanning?: boolean;
  postConsentFlowsEnabled?: boolean;
  browserReuseMode?: "per_module" | "single";
  /**
   * Isolates independently mergeable evidence work for Lambda fan-out. The
   * default preserves the existing single-process scan behavior.
   */
  evidenceLane?: "combined" | "consent_proof" | "runtime_evidence" | "policy_evidence";
  /**
   * Allows a dedicated runtime-evidence worker to finish only the deterministic
   * canonical projection after its parent capture deadline is observed. This
   * never extends browser capture or permits work owned by another lane.
   */
  allowRuntimeEvidenceFinalizationAfterAbort?: boolean;
  /**
   * Non-blocking policy-lane handoff. Consumers may retain or review this
   * evidence early, but must not project it until it matches the terminal
   * CanonicalEvidenceBundle.
   */
  onPolicySurfaceComplete?: (result: PolicySurfaceScannerResult) => void;
}

export interface PolicySurfaceSeed {
  confidence?: number;
  hintType: string;
  source: "prior_scan_hint" | "canonical_legal_surface_hint";
  url: string;
}

export interface ConsentActionRecipeInput {
  artifactVersion: "certscore.v2.consent-action-recipe.v1";
  generatedAt: string;
  normalizedUrl: string;
  scenarios: Array<{
    actionType?: string;
    candidates: Array<{
      actionType?: string;
      confidence?: number;
      frameKind?: string;
      frameUrl?: string;
      labelText: string;
      selectorSummary?: string;
      visible?: boolean;
    }>;
    scenario: string;
    targetUrl?: string;
  }>;
}

export function buildRetainedRenderedPolicyFallbackResult(input: {
  completedAtMs: number;
  evidenceRef?: EvidenceRef;
  observations: PolicySurfaceObservation[];
  startedAtMs: number;
}): PolicySurfaceScannerResult {
  return {
    moduleRun: {
      moduleName: "policySurfaceScanner",
      status: "partial",
      startedAt: new Date(input.startedAtMs).toISOString(),
      completedAt: new Date(input.completedAtMs).toISOString(),
      durationMs: Math.max(0, input.completedAtMs - input.startedAtMs),
      timingBreakdown: [{
        label: "rendered policy-link partial handoff",
        durationMs: 0,
        detail: `Retained ${input.observations.length} canonical policy link(s) from the pre-consent browser after dedicated policy output did not settle.`,
      }],
      recoveryDiagnostics: {
        attempted: true,
        attemptCount: 1,
        modes: ["pre_consent_rendered_policy_link_handoff"],
        durationMs: 0,
      },
      evidenceRefs: input.evidenceRef ? [input.evidenceRef] : [],
      errors: [
        "The dedicated policy scanner did not settle before output, but bounded rendered policy-link evidence was retained from the pre-consent browser.",
      ],
    },
    policySurfaceObservations: input.observations,
    artifactRefs: [],
  };
}

/**
 * Normalize the dedicated policy lane before exposing its non-blocking early
 * handoff. The terminal bundle applies the same canonical URL/type merge, so
 * callers never see raw duplicate candidates that the retained bundle would
 * later collapse.
 */
export function normalizePolicySurfaceResultForEarlyHandoff(
  result: PolicySurfaceScannerResult,
): PolicySurfaceScannerResult {
  return {
    ...result,
    policySurfaceObservations: mergePolicySurfaceObservations(
      result.policySurfaceObservations,
      [],
    ),
  };
}

export async function runScan(input: RunScanInput): Promise<CanonicalEvidenceBundle> {
  throwIfAborted(input.signal);
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const scanProfile = getScanProfile(input.profile ?? "tiny");
  const evidenceLane = input.evidenceLane ?? "combined";
  const normalizedUrl = normalizeUrl(input.url);
  const scanId = `scan_${startedAtMs}_${safeHostname(normalizedUrl)}`;
  const outDir = input.outDir ?? path.join(process.cwd(), "artifacts", scanId);
  const phaseRecorder = createScanPhaseRecorder(outDir, startedAtMs);
  if (input.postConsentFlowsEnabled === true) {
    await phaseRecorder.record("consent_flow_runtime", "skipped", {
      reason: "post_consent_flows_intentionally_disabled",
    });
    throw new Error("Post-consent consent-flow runtime is intentionally disabled for WC01 scanner runs.");
  }
  await phaseRecorder.record("scan_start", "started", {
    captureReplay: input.captureReplay === true,
    profile: scanProfile.profileId,
    scenarioPlanningMode: input.scenarioPlanningMode ?? "legacy_sequential",
  });

  const preConsentEnabled = evidenceLane === "consent_proof" ||
    evidenceLane === "runtime_evidence" ||
    (evidenceLane === "combined" && scanProfile.enabledModules.includes("preConsentRuntimeScanner"));
  const policySurfaceEnabled = evidenceLane === "policy_evidence" ||
    (evidenceLane === "combined" && scanProfile.enabledModules.includes("policySurfaceScanner"));
  const effectiveEnabledModules = [
    ...(preConsentEnabled ? ["preConsentRuntimeScanner" as const] : []),
    ...(policySurfaceEnabled ? ["policySurfaceScanner" as const] : []),
  ];
  const effectiveScanProfile = {
    ...scanProfile,
    enabledModules: effectiveEnabledModules,
    label: evidenceLane === "combined" ? scanProfile.label : `${scanProfile.label} (${evidenceLane} lane)`,
  };
  const profileConsentFlowEnabled = evidenceLane === "combined" &&
    scanProfile.enabledModules.includes("consentFlowRuntimeScanner");
  const consentFlowEnabled = false;
  const plannedParallel = input.scenarioPlanningMode === "planned_parallel";
  const leanPreConsent = input.scenarioResourceMode === "lean" ||
    input.scenarioResourceMode === "cmp_safe" ||
    input.captureReplay === true;
  const effectivePreConsentScreenshotMode = evidenceLane === "runtime_evidence" || evidenceLane === "policy_evidence"
    ? "never"
    : input.preConsentScreenshotMode ?? (leanPreConsent ? "selective" : "always");
  const nanoPolicyAssistProvider = policySurfaceEnabled ? createOpenAiNanoPolicyAssistProviderFromEnv() : undefined;
  const nanoConsentUiAssistProvider = consentFlowEnabled
    ? (await import("./nano-consent-ui-assist-provider.js")).createOpenAiNanoConsentUiAssistProviderFromEnv()
    : undefined;
  if (policySurfaceEnabled && !nanoPolicyAssistProvider?.classifyLinks) {
    await phaseRecorder.record("nano_policy_assist_provider", "failed", {
      reason: "missing_openai_api_key_or_provider",
    });
    throw new Error("Nano policy assist is required for CertScore v2 policy-surface profiles. Set OPENAI_API_KEY before running policy, standard, or full profiles.");
  }
  await phaseRecorder.record("nano_policy_assist_provider", policySurfaceEnabled ? "completed" : "skipped");
  if (consentFlowEnabled && !nanoConsentUiAssistProvider?.classifyControls) {
    await phaseRecorder.record("nano_consent_assist_provider", "failed", {
      reason: "missing_openai_api_key_or_provider",
    });
    throw new Error("Nano consent UI assist is required for CertScore v2 consent-flow profiles. Set OPENAI_API_KEY before enabling post-consent flow scans.");
  }
  await phaseRecorder.record("nano_consent_assist_provider", consentFlowEnabled ? "completed" : "skipped");
  const artifactWriter = await createArtifactWriter(outDir);
  await phaseRecorder.record("artifact_writer", "completed", { outDir });
  const useSingleBrowser = input.browserReuseMode === "single" && (preConsentEnabled || policySurfaceEnabled);
  let sharedBrowser: Browser | undefined;
  const policySurfaceAbortController = new AbortController();
  if (useSingleBrowser) {
    await phaseRecorder.record("shared_browser", "started", {
      mode: "single_chromium_process",
    });
    sharedBrowser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
    await phaseRecorder.record("shared_browser", "completed");
  }

  try {
  await phaseRecorder.record("module_promises_start", "started", {
    consentFlowEnabled,
    postConsentFlowsDeferred: profileConsentFlowEnabled && !consentFlowEnabled,
    policySurfaceEnabled,
    preConsentEnabled,
    evidenceLane,
  });
  const canonicalPreConsentModuleDeadlineMs = Math.max(
    1_000,
    Math.min(input.preConsentModuleDeadlineMs ?? scanProfile.internalBudgetMs, scanProfile.internalBudgetMs),
  );
  const lateConsentGeometryShadowEnabled = evidenceLane === "consent_proof" &&
    isLateConsentGeometryShadowEnabled();
  const preConsentModuleDeadlineMs = canonicalPreConsentModuleDeadlineMs +
    (lateConsentGeometryShadowEnabled ? LATE_CONSENT_GEOMETRY_SHADOW_BUDGET_MS : 0);
  let latestPreConsentLifecycleCheckpoint: {
    atMs: number;
    label: "scanner_started" | "browser_launch" | "browser_context" | "probe_install" | "page_navigation";
    status: "started" | "completed";
  } | undefined;
  const preConsentResultPromise = preConsentEnabled
    ? settlePreConsentRuntimeWithinDeadline({
      deadlineMs: preConsentModuleDeadlineMs,
      getLatestLifecycleCheckpoint: () => latestPreConsentLifecycleCheckpoint,
      startedAtMs,
      run: (softDeadlineSignal) => preConsentRuntimeScanner({
        url: input.url,
        normalizedUrl,
        scanStartedAtMs: startedAtMs,
        internalBudgetMs: scanProfile.internalBudgetMs,
        artifactWriter,
        captureScope: evidenceLane === "consent_proof"
          ? "consent_proof"
          : evidenceLane === "runtime_evidence"
            ? "runtime_evidence"
            : "combined",
        browser: sharedBrowser,
        stubHeavyResources: input.captureReplay,
        screenshotCaptureMode: "viewport_first",
        screenshotMode: effectivePreConsentScreenshotMode,
        screenshotTimeoutMs: input.preConsentScreenshotTimeoutMs,
        onScreenshotCaptured: input.onPreConsentScreenshotCaptured,
        lateConsentGateMs: input.lateConsentGateMs,
        lateConsentGeometryShadowEnabled,
        onLifecycleCheckpoint: (checkpoint) => {
          latestPreConsentLifecycleCheckpoint = checkpoint;
        },
        softDeadlineSignal,
        waitMode: leanPreConsent ? "fast" : "full",
        retainRenderedPolicyRecoverySession: evidenceLane === "combined",
        signal: input.signal,
      }),
    })
    : Promise.resolve(emptyPreConsentResult(nowIso(startedAtMs)));
  const policySurfaceResultPromise = policySurfaceEnabled
    ? policySurfaceScanner({
      url: input.url,
      normalizedUrl,
      region: input.region,
      scanStartedAtMs: startedAtMs,
      internalBudgetMs: scanProfile.internalBudgetMs,
      absoluteDeadlineAtMs: input.policySurfaceDeadlineAtMs,
      artifactWriter,
      browser: sharedBrowser,
      nanoAssistProvider: nanoPolicyAssistProvider,
      policySurfaceSeeds: input.policySurfaceSeeds,
      discoveryMode: input.scenarioPlanningMode === "planned_parallel" ? "fast" : "full",
      signal: input.signal
        ? AbortSignal.any([input.signal, policySurfaceAbortController.signal])
        : policySurfaceAbortController.signal,
    }).then(
      (value) => {
        const normalizedValue = normalizePolicySurfaceResultForEarlyHandoff(value);
        input.onPolicySurfaceComplete?.(normalizedValue);
        return { status: "fulfilled" as const, value: normalizedValue };
      },
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    )
    : Promise.resolve(undefined);

  let preConsentResult: Awaited<typeof preConsentResultPromise>;
  try {
    await phaseRecorder.record("pre_consent_runtime", preConsentEnabled ? "started" : "skipped");
    preConsentResult = await preConsentResultPromise;
    throwUnlessRuntimeEvidenceFinalizationOnly({
      allowRuntimeEvidenceFinalizationAfterAbort: input.allowRuntimeEvidenceFinalizationAfterAbort,
      evidenceLane,
      signal: input.signal,
    });
    await phaseRecorder.record("pre_consent_runtime", "completed", {
      durationMs: preConsentResult.moduleRun.durationMs,
      status: preConsentResult.moduleRun.status,
    });
  } catch (error) {
    await phaseRecorder.record("pre_consent_runtime", "failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    await policySurfaceResultPromise;
    throw error;
  }
  if (preConsentEnabled && shouldRetryPreConsentWithHeaded(preConsentResult)) {
    if (sharedBrowser) {
      await phaseRecorder.record("pre_consent_headed_retry", "skipped", {
        reason: "single_browser_mode_enabled",
        originalError: preConsentResult.moduleRun.errors[0] ?? "headless_runtime_failure",
      });
    } else if (input.captureReplay === true && !isCaptureReplayHeadedRetryEnabled()) {
      await phaseRecorder.record("pre_consent_headed_retry", "skipped", {
        reason: "capture_replay_headed_retry_disabled",
        originalError: preConsentResult.moduleRun.errors[0] ?? "headless_runtime_failure",
      });
    } else {
      await phaseRecorder.record("pre_consent_headed_retry", "started", {
        reason: preConsentResult.moduleRun.errors[0] ?? "headless_runtime_failure",
      });
      const firstAttemptErrors = preConsentResult.moduleRun.errors ?? [];
      const headedRetryResult = await preConsentRuntimeScanner({
        url: input.url,
        normalizedUrl,
        scanStartedAtMs: startedAtMs,
        internalBudgetMs: scanProfile.internalBudgetMs,
        artifactWriter,
        captureScope: evidenceLane === "consent_proof"
          ? "consent_proof"
          : evidenceLane === "runtime_evidence"
            ? "runtime_evidence"
            : "combined",
        browserMode: "headed",
        stubHeavyResources: input.captureReplay,
        screenshotCaptureMode: "viewport_first",
        screenshotMode: effectivePreConsentScreenshotMode,
        screenshotTimeoutMs: input.preConsentScreenshotTimeoutMs,
        onScreenshotCaptured: input.onPreConsentScreenshotCaptured,
        waitMode: leanPreConsent ? "fast" : "full",
        retainRenderedPolicyRecoverySession: evidenceLane === "combined",
      });
      preConsentResult = {
        ...headedRetryResult,
        moduleRun: {
          ...headedRetryResult.moduleRun,
          errors: [
            `Headed local fallback used after headless runtime failure: ${firstAttemptErrors[0] ?? "unknown failure"}`,
            ...(headedRetryResult.moduleRun.errors ?? []),
          ],
        },
      };
      await phaseRecorder.record("pre_consent_headed_retry", "completed", {
        durationMs: headedRetryResult.moduleRun.durationMs,
        status: headedRetryResult.moduleRun.status,
      });
    }
  }
  const shouldCaptureIncompleteConsentVisualFallback = preConsentEnabled &&
    shouldAttemptIncompleteConsentVisualFallback(preConsentResult, effectivePreConsentScreenshotMode);
  const shouldCaptureScreenshotOnlyFallback = preConsentEnabled &&
    shouldAttemptScreenshotOnlyFallback(preConsentResult, effectivePreConsentScreenshotMode);
  const visualFallbackDeadlineMs = boundedPreConsentVisualFallbackDeadlineMs({
    absoluteDeadlineAtMs:
      input.preConsentVisualFallbackDeadlineAtMs ?? input.policySurfaceDeadlineAtMs,
    configuredDeadlineMs: input.preConsentVisualFallbackDeadlineMs,
  });
  if (
    (shouldCaptureScreenshotOnlyFallback || shouldCaptureIncompleteConsentVisualFallback) &&
    visualFallbackDeadlineMs !== null
  ) {
    await phaseRecorder.record("pre_consent_screenshot_only_fallback", "started", {
      reason: shouldCaptureIncompleteConsentVisualFallback
        ? "incomplete_consent_inspection"
        : preConsentResult.visualCapture.failureReason ?? "missing_pre_consent_screenshot",
    });
    const screenshotFallback = await capturePreConsentScreenshotOnlyFallback({
      artifactWriter,
      normalizedUrl,
      navigationUrls: (preConsentResult.moduleRun.errors ?? []).some(isNavigationTransportFailure)
        ? [normalizedUrl, ...navigationTransportRecoveryUrls(normalizedUrl)]
        : [normalizedUrl],
      scanStartedAtMs: startedAtMs,
      fallbackDeadlineMs: visualFallbackDeadlineMs,
      screenshotTimeoutMs: input.preConsentScreenshotTimeoutMs,
      captureMode: shouldCaptureIncompleteConsentVisualFallback ? "full_page" : "viewport",
      recoverConsentEvidence: shouldCaptureIncompleteConsentVisualFallback,
      retainedScreenshotArtifactRef: preConsentResult.screenshots[0]?.path,
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return {
        error: message,
      };
    });
    if (!("error" in screenshotFallback)) {
      if (screenshotFallback.screenshot) {
        try {
          input.onPreConsentScreenshotCaptured?.(screenshotFallback.screenshot);
        } catch {
          // The optional retention-review handoff must not alter canonical
          // evidence capture or projection when a consumer fails locally.
        }
      }
      const fallbackConsentUiObservations = screenshotFallback.consentUiObservation
        ? [screenshotFallback.consentUiObservation]
        : [];
      const fallbackDomSnapshots = screenshotFallback.domSnapshot ? [screenshotFallback.domSnapshot] : [];
      const currentConsentObservation = preConsentResult.consentUiObservations.at(-1);
      const recoveryResolution = currentConsentObservation && screenshotFallback.consentUiObservation
        ? reconcileConsentUiRecapture({
          current: currentConsentObservation,
          candidate: screenshotFallback.consentUiObservation,
          strongerBasis: "recovery:independent_consent_capture_stronger_controls",
          completedWithoutControlsBasis: "recovery:independent_consent_capture_completed_without_first_layer_controls",
        })
        : null;
      const typedCompletedNegativeRecovery =
        currentConsentObservation?.captureStatus === "incomplete" &&
        currentConsentObservation.controls.length === 0 &&
        screenshotFallback.consentRecoveryCompleted &&
        screenshotFallback.consentUiObservation?.captureStatus === "no_evidence";
      const baseReconciledConsentObservation = typedCompletedNegativeRecovery
        ? screenshotFallback.consentUiObservation
        : recoveryResolution?.observation ?? screenshotFallback.consentUiObservation;
      const recoveryGeometryPath = screenshotFallback.consentUiObservation?.evidenceRefs.find((reference) =>
        reference.artifactId === "consent_control_geometry"
      )?.path;
      const reconciledConsentObservation = baseReconciledConsentObservation &&
          screenshotFallback.consentRecoveryCompleted &&
          recoveryGeometryPath
        ? markConsentRecoveryCompleted(baseReconciledConsentObservation, recoveryGeometryPath)
        : baseReconciledConsentObservation;
      const retainedConsentUiObservations = reconciledConsentObservation
        ? [
          ...preConsentResult.consentUiObservations.slice(0, Math.max(0, preConsentResult.consentUiObservations.length - 1)),
          reconciledConsentObservation,
        ]
        : preConsentResult.consentUiObservations;
      preConsentResult = {
        ...preConsentResult,
        screenshots: screenshotFallback.screenshot
          ? [
            screenshotFallback.screenshot,
            ...preConsentResult.screenshots.filter((screenshot) =>
              screenshot.artifactId !== screenshotFallback.screenshot?.artifactId
            ),
          ]
          : preConsentResult.screenshots,
        visualCapture: screenshotFallback.screenshot
          ? screenshotFallback.visualCapture
          : preConsentResult.visualCapture,
        consentUiObservations: retainedConsentUiObservations,
        domSnapshots: [
          ...preConsentResult.domSnapshots,
          ...fallbackDomSnapshots,
        ],
        moduleRun: {
          ...preConsentResult.moduleRun,
          timingBreakdown: [
            ...(preConsentResult.moduleRun.timingBreakdown ?? []),
            {
              label: "independent consent visual fallback",
              durationMs: 0,
              outcome: "recovered",
              detail: screenshotFallback.consentRecoveryCompleted
                ? "Independent bounded consent recovery retained typed inventory and geometry after incomplete primary inspection."
                : shouldCaptureIncompleteConsentVisualFallback
                  ? "Independent full-page fallback retained bounded consent-surface evidence after incomplete primary inspection."
                  : fallbackConsentUiObservations.length > 0
                    ? "Visual fallback retained a screenshot and bounded consent-surface evidence after the primary context closed."
                    : "Screenshot-only visual fallback retained a pre-consent screenshot after the primary context closed.",
            },
          ],
        },
      };
      await phaseRecorder.record("pre_consent_screenshot_only_fallback", "completed", {
        artifactId: screenshotFallback.screenshot?.artifactId,
        consentRecoveryCompleted: screenshotFallback.consentRecoveryCompleted,
      });
    } else {
      preConsentResult = {
        ...preConsentResult,
        visualCapture: {
          ...preConsentResult.visualCapture,
          notes: uniqueStrings([
            ...preConsentResult.visualCapture.notes,
            `Screenshot-only fallback failed: ${screenshotFallback.error.replace(/\s+/g, " ").trim().slice(0, 180)}`,
          ]),
        },
        moduleRun: {
          ...preConsentResult.moduleRun,
          errors: [
            ...(preConsentResult.moduleRun.errors ?? []),
            `Screenshot-only visual fallback failed: ${screenshotFallback.error}`,
          ],
        },
      };
      await phaseRecorder.record("pre_consent_screenshot_only_fallback", "failed", {
        error: screenshotFallback.error,
      });
    }
  } else {
    await phaseRecorder.record("pre_consent_screenshot_only_fallback", "skipped", {
      reason: !preConsentEnabled
        ? "pre_consent_runtime_disabled"
        : (shouldCaptureScreenshotOnlyFallback || shouldCaptureIncompleteConsentVisualFallback) &&
            visualFallbackDeadlineMs === null
          ? "insufficient_scan_deadline"
          : "not_needed",
    });
  }
  const earlyScanNoGoEvidence = !preConsentEnabled || input.captureReplay === true
    ? null
    : buildScanNoGoAssessment({
      consentUiObservations: preConsentResult.consentUiObservations,
      domSnapshots: preConsentResult.domSnapshots,
      modulesRun: [preConsentResult.moduleRun],
      normalizedUrl,
      networkEvents: preConsentResult.networkEvents,
      networkResponseEvents: preConsentResult.networkResponseEvents,
      policySurfaceObservations: [],
      screenshots: preConsentResult.screenshots,
    });
  const earlyConfirmedNoGo = earlyScanNoGoEvidence?.scanNoGoAssessment.decision === "no_go";
  await phaseRecorder.record("scan_no_go_fast_gate", earlyConfirmedNoGo ? "completed" : "skipped", {
    decision: earlyScanNoGoEvidence?.scanNoGoAssessment.decision ?? "go",
    reasonCode: earlyScanNoGoEvidence?.primaryReasonCode,
  });
  await phaseRecorder.record("policy_surface_for_replay", input.captureReplay && policySurfaceEnabled && !plannedParallel ? "started" : "skipped");
  let policySurfaceSettled = input.captureReplay && policySurfaceEnabled && !plannedParallel
    ? await policySurfaceResultPromise
    : undefined;
  if (policySurfaceSettled?.status === "rejected") {
    await phaseRecorder.record("policy_surface_for_replay", "failed", {
      error: policySurfaceSettled.reason instanceof Error ? policySurfaceSettled.reason.message : String(policySurfaceSettled.reason),
    });
    throw policySurfaceSettled.reason;
  }
  if (policySurfaceSettled?.status === "fulfilled") {
    await phaseRecorder.record("policy_surface_for_replay", "completed", {
      durationMs: policySurfaceSettled.value.moduleRun.durationMs,
      status: policySurfaceSettled.value.moduleRun.status,
    });
  }
  const seededPrivacyControlUrls = normalizeSeedUrls(input.privacyControlUrls ?? []);
  if (!policySurfaceSettled && plannedParallel && policySurfaceEnabled && !earlyConfirmedNoGo) {
    throwIfAborted(input.signal);
    await phaseRecorder.record("policy_surface_planning_deadline", "started", {
      deadlineMs: input.policyPlanningDeadlineMs ?? 1_500,
    });
    policySurfaceSettled = await settlePolicySurfaceBeforeDeadline(
      policySurfaceResultPromise,
      input.policyPlanningDeadlineMs ?? 1_500,
    );
    await phaseRecorder.record("policy_surface_planning_deadline", policySurfaceSettled?.status === "fulfilled" ? "completed" : "skipped");
  }
  const replayPrivacyControlUrls = policySurfaceSettled?.status === "fulfilled"
    ? privacyControlUrlsFromPolicySurfaces(policySurfaceSettled.value.policySurfaceObservations)
    : [];
  await phaseRecorder.record("consent_flow_runtime", consentFlowEnabled ? "started" : "skipped", {
    captureReplay: input.captureReplay === true,
    deferredFromProductionScanner: profileConsentFlowEnabled && !consentFlowEnabled,
    replayPrivacyControlUrlCount: replayPrivacyControlUrls.length,
    seededPrivacyControlUrlCount: seededPrivacyControlUrls.length,
  });
  const consentFlowResult = consentFlowEnabled
    ? await runConsentFlowWithHeadedRetry({
      url: input.url,
      normalizedUrl,
      privacyControlUrls: uniqueStrings([...seededPrivacyControlUrls, ...replayPrivacyControlUrls]).slice(0, 3),
      scanStartedAtMs: startedAtMs,
      internalBudgetMs: scanProfile.internalBudgetMs,
      artifactWriter,
      captureReplay: input.captureReplay,
      captureReplayAuxiliaryProbes: input.captureReplayAuxiliaryProbes,
      captureReplayTrace: input.captureReplayTrace,
      stubHeavyResources: input.captureReplay,
      enableNanoConsentUiAssist: true,
      nanoConsentUiAssistProvider,
      scenarioPlanningMode: input.scenarioPlanningMode,
      scenarioConcurrency: input.scenarioConcurrency,
      allowedScenarios: input.allowedConsentFlowScenarios,
      policyPlanningDeadlineMs: input.policyPlanningDeadlineMs,
      consentFlowDeadlineMs: input.consentFlowDeadlineMs,
      plannedActionFinalSettleMs: input.consentFlowActionFinalSettleMs,
      preActionObservationMs: input.consentFlowPreActionObservationMs,
      actionSearchDeadlineMs: input.consentFlowActionSearchDeadlineMs,
      consentActionRecipe: input.consentActionRecipe,
      oneTrustHiddenActionMode: input.consentFlowOneTrustHiddenActionMode,
      externalBaselinePlanning: input.consentFlowExternalBaselinePlanning,
      forceAllowedScenarioPlanning: input.consentFlowForceAllowedScenarioPlanning,
      scenarioResourceMode: input.scenarioResourceMode,
      screenshotMode: input.consentFlowScreenshotMode,
      policyPlanningStatus: policyPlanningStatus(policySurfaceEnabled, policySurfaceSettled),
      policyPrivacyControlUrlCount: replayPrivacyControlUrls.length,
      preConsentBaseline: plannedParallel ? preConsentResult : undefined,
    })
    : undefined;
  if (consentFlowResult) {
    await phaseRecorder.record("consent_flow_runtime", "completed", {
      durationMs: consentFlowResult.moduleRun.durationMs,
      status: consentFlowResult.moduleRun.status,
    });
  }
  const policyRequiredForOutput = policySurfaceRequiredForUnboundedOutput({
    captureReplay: input.captureReplay === true,
    earlyConfirmedNoGo,
    plannedParallel,
    policySurfaceEnabled,
  });
  let policySurfaceOutputDeadlineExpired = false;
  if (earlyConfirmedNoGo && policySurfaceEnabled && !policySurfaceSettled) {
    const noGoPolicyGraceMs = Math.min(5_000, Math.max(0, scanProfile.internalBudgetMs - (Date.now() - startedAtMs) - 750));
    await phaseRecorder.record("policy_surface_no_go_diagnostic_grace", noGoPolicyGraceMs > 0 ? "started" : "skipped", {
      deadlineMs: noGoPolicyGraceMs,
    });
    policySurfaceSettled = await settlePolicySurfaceBeforeDeadline(policySurfaceResultPromise, noGoPolicyGraceMs);
    await phaseRecorder.record(
      "policy_surface_no_go_diagnostic_grace",
      policySurfaceSettled?.status === "fulfilled" ? "completed" : "skipped",
    );
    if (!policySurfaceSettled) {
      await phaseRecorder.record("policy_surface_no_go_cancellation", "started", {
        reason: "policy_output_not_required_after_confirmed_no_go",
      });
      policySurfaceAbortController.abort(
        new Error("Policy-surface work canceled after the confirmed no-go diagnostic grace window."),
      );
      await policySurfaceResultPromise;
      await phaseRecorder.record("policy_surface_no_go_cancellation", "completed");
    }
  }
  const runtimeEvidenceFinalizationAfterAbort = isRuntimeEvidenceFinalizationOnly({
    allowRuntimeEvidenceFinalizationAfterAbort: input.allowRuntimeEvidenceFinalizationAfterAbort,
    evidenceLane,
    signal: input.signal,
  });
  throwUnlessRuntimeEvidenceFinalizationOnly({
    allowRuntimeEvidenceFinalizationAfterAbort: input.allowRuntimeEvidenceFinalizationAfterAbort,
    evidenceLane,
    signal: input.signal,
  });
  if (runtimeEvidenceFinalizationAfterAbort) {
    await phaseRecorder.record("runtime_evidence_deadline_finalization", "started", {
      captureDurationMs: preConsentResult.moduleRun.durationMs,
      captureStatus: preConsentResult.moduleRun.status,
      reason: "parent_capture_deadline_observed_after_typed_runtime_capture",
    });
  }
  await phaseRecorder.record("policy_surface_for_output", policyRequiredForOutput ? "started" : "skipped");
  if (policyRequiredForOutput) {
    if (input.policySurfaceDeadlineAtMs === undefined) {
      policySurfaceSettled ??= await policySurfaceResultPromise;
    } else {
      const remainingPolicyOutputWaitMs = Math.max(
        0,
        input.policySurfaceDeadlineAtMs - Date.now(),
      );
      policySurfaceSettled ??= await settlePolicySurfaceBeforeDeadline(
        policySurfaceResultPromise,
        remainingPolicyOutputWaitMs,
      );
      if (!policySurfaceSettled) {
        policySurfaceOutputDeadlineExpired = true;
        policySurfaceAbortController.abort(
          new Error("Policy-surface output deadline expired; retained rendered-link evidence will be used when available."),
        );
      }
    }
  } else if (policySurfaceEnabled && !earlyConfirmedNoGo) {
    const policyOutputGraceMs = input.policyOutputGraceMs ?? 0;
    await phaseRecorder.record("policy_surface_output_grace", policyOutputGraceMs > 0 ? "started" : "skipped", {
      deadlineMs: policyOutputGraceMs,
    });
    policySurfaceSettled ??= await settlePolicySurfaceBeforeDeadline(policySurfaceResultPromise, policyOutputGraceMs);
    if (policyOutputGraceMs > 0) {
      await phaseRecorder.record("policy_surface_output_grace", policySurfaceSettled?.status === "fulfilled" ? "completed" : "skipped");
    }
  }
  if (policySurfaceSettled?.status === "rejected") {
    await phaseRecorder.record("policy_surface_for_output", "failed", {
      error: policySurfaceSettled.reason instanceof Error ? policySurfaceSettled.reason.message : String(policySurfaceSettled.reason),
    });
    throw policySurfaceSettled.reason;
  }
  const domSnapshot = preConsentResult.domSnapshots[0];
  const renderedPolicyEvidenceRef = domSnapshot
    ? { refId: domSnapshot.artifactId, artifactId: domSnapshot.artifactId, path: domSnapshot.path }
    : undefined;
  const retainedRenderedPolicyObservations = policySurfaceEnabled
    ? policySurfaceObservationsFromRetainedRenderedLinks({
        links: preConsentResult.renderedPolicyLinks,
        evidenceRef: renderedPolicyEvidenceRef,
      })
    : [];
  let policySurfaceResult = policySurfaceSettled?.value;
  if (policySurfaceEnabled && !policySurfaceResult && retainedRenderedPolicyObservations.length > 0) {
    policySurfaceResult = buildRetainedRenderedPolicyFallbackResult({
      completedAtMs: Date.now(),
      evidenceRef: renderedPolicyEvidenceRef,
      observations: retainedRenderedPolicyObservations,
      startedAtMs,
    });
  }
  if (policySurfaceEnabled && policySurfaceResult) {
    const recoveredPolicySurfaceCount = countRecoveredPolicySurfaceObservations(
      policySurfaceResult.policySurfaceObservations,
      retainedRenderedPolicyObservations,
    );
    policySurfaceResult.policySurfaceObservations = mergePolicySurfaceObservations(
      policySurfaceResult.policySurfaceObservations,
      retainedRenderedPolicyObservations,
    );
    let renderedDocumentRecovery: Awaited<ReturnType<typeof recoverPolicyDocumentsFromRetainedRenderedLinks>>;
    try {
      renderedDocumentRecovery = await recoverPolicyDocumentsFromRetainedRenderedLinks({
        scannerInput: {
          url: input.url,
          normalizedUrl,
          scanStartedAtMs: startedAtMs,
          internalBudgetMs: 6_000,
          artifactWriter,
          browser: preConsentResult.renderedPolicyRecoveryBrowser ?? sharedBrowser,
          renderedRecoveryPage: preConsentResult.renderedPolicyRecoveryPage,
          nanoAssistProvider: nanoPolicyAssistProvider,
          discoveryMode: "fast",
          signal: input.signal,
        },
        links: preConsentResult.renderedPolicyLinks,
        existingObservations: policySurfaceResult.policySurfaceObservations,
        evidenceRef: renderedPolicyEvidenceRef,
      });
    } finally {
      await preConsentResult.renderedPolicyRecoveryBrowser?.close().catch(() => undefined);
    }
    if (renderedDocumentRecovery.observations.length > 0) {
      policySurfaceResult.policySurfaceObservations = mergePolicySurfaceObservations(
        policySurfaceResult.policySurfaceObservations,
        renderedDocumentRecovery.observations,
      );
      policySurfaceResult.artifactRefs.push(...renderedDocumentRecovery.artifactRefs);
      policySurfaceResult.moduleRun.timingBreakdown = [
        ...(policySurfaceResult.moduleRun.timingBreakdown ?? []),
        ...renderedDocumentRecovery.timingBreakdown,
      ].slice(0, MAX_MODULE_TIMING_BREAKDOWN_ENTRIES);
      policySurfaceResult.moduleRun.completedAt = new Date().toISOString();
      policySurfaceResult.moduleRun.durationMs = Math.max(
        policySurfaceResult.moduleRun.durationMs ?? 0,
        Date.now() - Date.parse(policySurfaceResult.moduleRun.startedAt),
      );
    }
    if (recoveredPolicySurfaceCount > 0) {
      if (["failed", "not_testable", "skipped_budget"].includes(policySurfaceResult.moduleRun.status)) {
        policySurfaceResult.moduleRun.status = "partial";
        policySurfaceResult.moduleRun.errors.push(
          "The dedicated policy browser did not retain policy-document content, but canonical policy links were observed in the successful pre-consent browser.",
        );
      }
      policySurfaceResult.moduleRun.timingBreakdown = [
        ...(policySurfaceResult.moduleRun.timingBreakdown ?? []),
        {
          label: "rendered policy-link handoff",
          durationMs: 0,
          detail: `Recovered ${recoveredPolicySurfaceCount} canonical policy surface(s) retained by the successful pre-consent browser.`,
        },
      ].slice(0, 40);
      const existingRecovery = policySurfaceResult.moduleRun.recoveryDiagnostics;
      policySurfaceResult.moduleRun.recoveryDiagnostics = {
        attempted: true,
        attemptCount: (existingRecovery?.attemptCount ?? 0) + 1,
        modes: [...new Set([
          ...(existingRecovery?.modes ?? []),
          "pre_consent_rendered_policy_link_handoff",
        ])].slice(0, 12),
        durationMs: existingRecovery?.durationMs ?? 0,
      };
      if (renderedPolicyEvidenceRef && !policySurfaceResult.moduleRun.evidenceRefs.some(
        (ref) => ref.artifactId === renderedPolicyEvidenceRef.artifactId,
      )) {
        policySurfaceResult.moduleRun.evidenceRefs.push(renderedPolicyEvidenceRef);
      }
    }
    await phaseRecorder.record("policy_surface_for_output", "completed", {
      deadlineFallbackUsed: policySurfaceOutputDeadlineExpired,
      durationMs: policySurfaceResult.moduleRun.durationMs,
      recoveredRenderedPolicyLinks: recoveredPolicySurfaceCount,
      retainedRenderedPolicyLinks: retainedRenderedPolicyObservations.length,
      status: policySurfaceResult.moduleRun.status,
    });
  } else if (policySurfaceOutputDeadlineExpired) {
    await phaseRecorder.record("policy_surface_for_output", "skipped", {
      reason: "policy_surface_deadline_expired_before_output",
    });
  }

  const vendorResolverStartedAtMs = Date.now();
  const vendorResolverStartedAt = new Date(vendorResolverStartedAtMs).toISOString();
  await phaseRecorder.record("vendor_resolver", earlyConfirmedNoGo ? "skipped" : "started", {
    reason: earlyConfirmedNoGo ? "confirmed_scan_no_go" : undefined,
  });
  const normalizedVendorObservations = earlyConfirmedNoGo
    ? []
    : resolveVendorObservations(
      [
        ...preConsentResult.vendorResolverInputs,
        ...(consentFlowResult?.vendorResolverInputs ?? []),
      ],
    );
  const vendorResolverCompletedAtMs = Date.now();
  const vendorResolverModuleRun: CanonicalEvidenceBundle["modulesRun"][number] = {
    moduleName: "vendorResolver",
    status: earlyConfirmedNoGo ? "not_testable" : "completed",
    startedAt: vendorResolverStartedAt,
    completedAt: new Date(vendorResolverCompletedAtMs).toISOString(),
    durationMs: vendorResolverCompletedAtMs - vendorResolverStartedAtMs,
    evidenceRefs: [],
    errors: earlyConfirmedNoGo ? ["Skipped because the fast gate confirmed that the normal public site was not reached."] : [],
  };
  await phaseRecorder.record("vendor_resolver", earlyConfirmedNoGo ? "skipped" : "completed", {
    durationMs: vendorResolverModuleRun.durationMs,
    vendorObservations: normalizedVendorObservations.length,
  });
  const now = new Date().toISOString();
  const consentFlowDisabledReason = "Post-consent consent-flow runtime is intentionally disabled for WC01 scanner runs; first-layer controls and policy surfaces are retained without clicking.";
  const modulesRun = [
    ...(preConsentEnabled ? [preConsentResult.moduleRun] : []),
    ...(consentFlowResult
      ? [consentFlowResult.moduleRun]
      : profileConsentFlowEnabled
        ? [consentFlowRuntimeScannerPlaceholder(now, consentFlowDisabledReason)]
        : []),
    vendorResolverModuleRun,
    ...(policySurfaceResult
      ? [policySurfaceResult.moduleRun]
      : policySurfaceEnabled
        ? [policySurfaceScannerPlaceholder(now, plannedParallel
          ? "Policy-surface scanner was not ready before the planned consent DAG deadline or bounded output grace window."
          : undefined)]
        : []),
  ];
  const networkEvents = [
    ...preConsentResult.networkEvents,
    ...(consentFlowResult?.networkEvents ?? []),
  ];
  const networkResponseEvents = [
    ...preConsentResult.networkResponseEvents,
    ...(consentFlowResult?.networkResponseEvents ?? []),
  ];
  const cookieSnapshots = [
    ...preConsentResult.cookieSnapshots,
    ...(consentFlowResult?.cookieSnapshots ?? []),
  ];
  const cookieEvents = classifyCookieEvents(
    [
      ...preConsentResult.cookieEvents,
      ...(consentFlowResult?.cookieEvents ?? []),
    ],
    normalizedVendorObservations,
  ).map(withBoundedCookieInitiatorMetadata);
  const observedJourneys = buildObservedJourneys({
    networkEvents,
    networkResponseEvents,
    cookieEvents,
    cookieSnapshots,
    storageSnapshots: preConsentResult.storageSnapshots,
    scriptEvents: preConsentResult.scriptEvents,
    iframeEvents: preConsentResult.iframeEvents,
    normalizedVendorObservations,
  });
  const journeySummary = summarizeObservedJourneys(observedJourneys);
  const derivedRuntimeSignals = {
    thirdPartyVendorsObserved: normalizedVendorObservations.some(
      (vendor) => !["consent_management", "infrastructure", "security", "performance_monitoring"].includes(vendor.purpose),
    ),
    preConsentTrackingObserved: observedJourneys.some((journey) =>
      journey.journeyType === "tracker" ||
      (journey.purpose !== undefined &&
        ["analytics", "advertising", "session_replay"].includes(journey.purpose) &&
        journey.observedBehaviors.some((behavior) =>
        [
          "collection_endpoint_observed",
          "cookie_set",
          "cookie_sent",
          "identifier_parameter_observed",
          "advertising_click_id_observed",
          "session_replay_collection_observed",
        ].includes(behavior),
        )),
    ),
    thirdPartyCookiesPreConsentObserved: observedJourneys.some(
      (journey) =>
        journey.journeyType === "cookie" &&
        journey.firstObservedConsentState === "pre_consent" &&
        journey.firstPartyOrThirdParty === "third_party" &&
        !["consent_management", "security", "infrastructure"].includes(journey.purpose ?? "unknown"),
    ),
    consentBannerLikelyPresent:
      preConsentResult.consentUiObservations[0]?.likelyPresent,
    sessionReplayOrBehavioralAnalyticsObserved: observedJourneys.some(
      (journey) => journey.purpose === "session_replay",
    ),
    journeySummary,
    notes: [],
  };
  const baseRuntimeCoverage = withLocalRegionalEgressLimitation(deriveRuntimeCoverageSummary({
    cookieEvents,
    cookieSnapshots,
    enabledModules: effectiveEnabledModules,
  modulesRun,
  networkEvents,
  normalizedVendorObservations,
  observedJourneys,
  consentUiObservations: [
    ...preConsentResult.consentUiObservations,
    ...(consentFlowResult?.consentUiObservations ?? []),
  ],
  cmpRuntimeObservations: preConsentResult.cmpRuntimeObservations,
  }), {
    env: process.env,
    region: input.region ?? "local",
  });
  const scanNoGoEvidence = earlyScanNoGoEvidence ?? buildScanNoGoAssessment({
    consentUiObservations: [
      ...preConsentResult.consentUiObservations,
      ...(consentFlowResult?.consentUiObservations ?? []),
    ],
    domSnapshots: [
      ...preConsentResult.domSnapshots,
      ...(consentFlowResult?.domSnapshots ?? []),
    ],
    networkEvents,
    networkResponseEvents,
    policySurfaceObservations: policySurfaceResult?.policySurfaceObservations ?? [],
    screenshots: [
      ...preConsentResult.screenshots,
      ...(consentFlowResult?.screenshots ?? []),
    ],
    modulesRun,
    normalizedUrl,
  });
  const runtimeCoverage = scanNoGoEvidence?.scanNoGoAssessment.decision === "no_go"
    ? {
      ...baseRuntimeCoverage,
      coverageStatus: "limited_none" as const,
      limitationKeys: uniqueStrings([
        ...baseRuntimeCoverage.limitationKeys,
        scanNoGoEvidence.primaryReasonCode,
        "scan_no_go_assessment",
      ]),
      notes: uniqueStrings([
        ...baseRuntimeCoverage.notes,
        scanNoGoEvidence.primaryReasonCode === "navigation_transport_failure"
          ? "Initial navigation failed before public-page evidence could be retained, so runtime evidence should be treated as not testable for this run."
          : "Initial-load evidence shows a terminal no-go page instead of the normal public site, so runtime evidence should be treated as not reportable.",
      ]),
    }
    : scanNoGoEvidence
      ? {
        ...baseRuntimeCoverage,
        limitationKeys: uniqueStrings([
          ...baseRuntimeCoverage.limitationKeys,
          "scan_no_go_diagnostics",
        ]),
        notes: uniqueStrings([
          ...baseRuntimeCoverage.notes,
          "Potential no-go evidence was observed but contradicted by retained normal-site evidence, so the scan continued.",
        ]),
      }
      : baseRuntimeCoverage;

  const scanEvidenceLaneAssessment = buildScanEvidenceLaneAssessment({
    normalizedUrl,
    policySurfaceObservations: policySurfaceResult?.policySurfaceObservations ?? [],
    runtimeCoverage,
    scanNoGoAssessment: scanNoGoEvidence?.scanNoGoAssessment ?? null,
    transportSecurityObservationCount: preConsentResult.transportSecurityObservations.length,
  });

  const boundedModulesRun = modulesRun.map(boundModuleRunTimingBreakdown);
  const consentSurfaceInspection = deriveConsentSurfaceInspectionOutcome({
    cmpRuntimeObservations: preConsentResult.cmpRuntimeObservations,
    consentUiObservations: preConsentResult.consentUiObservations,
    domSnapshots: preConsentResult.domSnapshots,
    modulesRun: boundedModulesRun,
    networkEvents,
    runtimeCoverage,
    scanNoGoDecision: scanNoGoEvidence?.scanNoGoAssessment.decision,
    screenshots: preConsentResult.screenshots,
    visualCapture: preConsentResult.visualCapture,
  });
  const policySurfaceInspection = derivePolicySurfaceInspectionOutcome({
    modulesRun: boundedModulesRun,
    policySurfaceObservations: policySurfaceResult?.policySurfaceObservations ?? [],
  });
  const bundle = compactCanonicalEvidenceBundleForRetention(canonicalEvidenceBundleSchema.parse({
    scanId,
    url: input.url,
    normalizedUrl,
    startedAt,
    completedAt: new Date().toISOString(),
    region: input.region ?? "local",
    scanProfile: effectiveScanProfile,
    modulesRun: boundedModulesRun,
    runtimeTimeline: [
      ...preConsentResult.runtimeTimeline,
      ...(consentFlowResult?.runtimeTimeline ?? []),
    ],
    networkEvents,
    networkResponseEvents,
    automatedAccessObservation: preConsentResult.automatedAccessObservation,
    siteResourceSizeSummary: summarizeSiteResourceSizes(networkResponseEvents),
    cookieEvents,
    cookieSnapshots,
    storageSnapshots: preConsentResult.storageSnapshots,
    scriptEvents: preConsentResult.scriptEvents,
    iframeEvents: preConsentResult.iframeEvents,
    consentUiObservations: [
      ...preConsentResult.consentUiObservations,
      ...(consentFlowResult?.consentUiObservations ?? []),
    ],
    collectionSurfaceObservations: preConsentResult.collectionSurfaceObservations,
    consentInteractionEvents: consentFlowResult?.consentInteractionEvents ?? [],
    consentFlowObservations: consentFlowResult?.consentFlowObservations ?? [],
    consentActionCandidates: consentFlowResult?.consentActionCandidates ?? [],
    consentActionAttempts: consentFlowResult?.consentActionAttempts ?? [],
    consentFlowComparisons: consentFlowResult?.consentFlowComparisons ?? [],
    policySurfaceObservations: policySurfaceResult?.policySurfaceObservations ?? [],
    transportSecurityObservations: preConsentResult.transportSecurityObservations,
    cmpRuntimeObservations: preConsentResult.cmpRuntimeObservations,
    screenshots: [
      ...preConsentResult.screenshots,
      ...(consentFlowResult?.screenshots ?? []),
    ],
    domSnapshots: [
      ...preConsentResult.domSnapshots,
      ...(consentFlowResult?.domSnapshots ?? []),
    ],
    normalizedVendorObservations,
    observedJourneys,
    derivedRuntimeSignals,
    runtimeCoverage,
    consentSurfaceInspection,
    policySurfaceInspection,
    visualCapture: preConsentResult.visualCapture,
    ...(scanNoGoEvidence
      ? {
        scanNoGoAssessment: scanNoGoEvidence.scanNoGoAssessment,
        scan_no_go_assessment: scanNoGoEvidence.scanNoGoAssessment,
        visualAccessReview: scanNoGoEvidence.visualAccessReview,
        visual_access_review: scanNoGoEvidence.visualAccessReview,
      }
      : {}),
    scanEvidenceLaneAssessment,
    scan_evidence_lane_assessment: scanEvidenceLaneAssessment,
    artifactRefs: [
      ...preConsentResult.screenshots.map((artifact) => ({
        artifactId: artifact.artifactId,
        artifactType: "screenshot" as const,
        path: artifact.path,
        label: "Pre-consent screenshot",
      })),
      ...preConsentResult.domSnapshots.map((artifact) => ({
        artifactId: artifact.artifactId,
        artifactType: "dom_snapshot" as const,
        path: artifact.path,
        label: "Pre-consent DOM text snapshot",
      })),
      ...preConsentResult.artifactRefs,
      ...(policySurfaceResult?.artifactRefs ?? []),
      ...(consentFlowResult?.artifactRefs ?? []),
    ],
    scannerVersion: "certscore-scan-core-v2-alpha",
    schemaVersion: SCHEMA_VERSION,
  }));

  await phaseRecorder.record("canonical_bundle_write", "started");
  await artifactWriter.writeJsonArtifact("CanonicalEvidenceBundle.json", bundle);
  await phaseRecorder.record("canonical_bundle_write", "completed");
  if (runtimeEvidenceFinalizationAfterAbort) {
    await phaseRecorder.record("runtime_evidence_deadline_finalization", "completed", {
      coverageStatus: bundle.runtimeCoverage?.coverageStatus ?? "limited_none",
      retainedCookieEvents: bundle.cookieEvents.length,
      retainedNetworkEvents: bundle.networkEvents.length,
      retainedNetworkResponseEvents: bundle.networkResponseEvents.length,
    });
  }
  await phaseRecorder.record("scan_complete", "completed", {
    durationMs: Date.now() - startedAtMs,
  });
  return bundle;
  } finally {
    policySurfaceAbortController.abort(
      new Error("Policy-surface work canceled because the scan core is closing."),
    );
    if (sharedBrowser) {
      await phaseRecorder.record("shared_browser_close", "started");
      await sharedBrowser.close().catch(() => undefined);
      await phaseRecorder.record("shared_browser_close", "completed");
    }
  }
}

export function throwUnlessRuntimeEvidenceFinalizationOnly(input: {
  allowRuntimeEvidenceFinalizationAfterAbort?: boolean;
  evidenceLane: NonNullable<RunScanInput["evidenceLane"]>;
  signal?: AbortSignal;
}): void {
  if (isRuntimeEvidenceFinalizationOnly(input)) {
    return;
  }
  throwIfAborted(input.signal);
}

export function isRuntimeEvidenceFinalizationOnly(input: {
  allowRuntimeEvidenceFinalizationAfterAbort?: boolean;
  evidenceLane: NonNullable<RunScanInput["evidenceLane"]>;
  signal?: AbortSignal;
}): boolean {
  return input.signal?.aborted === true &&
    input.allowRuntimeEvidenceFinalizationAfterAbort === true &&
    input.evidenceLane === "runtime_evidence";
}

export function compactCanonicalEvidenceBundleForRetention(
  bundle: CanonicalEvidenceBundle,
  maxSerializedBytes = 400 * 1024,
): CanonicalEvidenceBundle {
  const typedEventIds = new Set([
    ...bundle.networkEvents,
    ...bundle.networkResponseEvents,
    ...bundle.cookieEvents,
    ...bundle.scriptEvents,
    ...bundle.iframeEvents,
  ].map((event) => event.eventId));
  const retainedJourneys = bundle.observedJourneys.filter((journey) => !isLowSignalEndpointJourney(journey));
  let compacted = canonicalEvidenceBundleSchema.parse({
    ...bundle,
    modulesRun: bundle.modulesRun.map(boundModuleRunTimingBreakdown),
    runtimeTimeline: bundle.runtimeTimeline
      .filter((event) => !typedEventIds.has(event.eventId))
      .map(stripRuntimeEventDiagnostics),
    networkEvents: bundle.networkEvents.map(stripNetworkEventDiagnostics),
    networkResponseEvents: bundle.networkResponseEvents.map(stripNetworkResponseDiagnostics),
    cookieEvents: bundle.cookieEvents
      .map(withBoundedCookieInitiatorMetadata)
      .map(stripRuntimeEventDiagnostics),
    scriptEvents: bundle.scriptEvents.map(stripRuntimeEventDiagnostics),
    iframeEvents: bundle.iframeEvents.map(stripRuntimeEventDiagnostics),
    observedJourneys: retainedJourneys,
    derivedRuntimeSignals: {
      ...bundle.derivedRuntimeSignals,
      preConsentTrackingObserved: retainedJourneys.some((journey) =>
        journey.journeyType === "tracker" ||
        journey.observedBehaviors.some((behavior) =>
          [
            "collection_endpoint_observed",
            "cookie_set",
            "cookie_sent",
            "identifier_parameter_observed",
            "advertising_click_id_observed",
            "session_replay_collection_observed",
          ].includes(behavior),
        ),
      ),
      thirdPartyCookiesPreConsentObserved: retainedJourneys.some(
        (journey) =>
          journey.journeyType === "cookie" &&
          journey.firstObservedConsentState === "pre_consent" &&
          journey.firstPartyOrThirdParty === "third_party" &&
          !["consent_management", "security", "infrastructure"].includes(journey.purpose ?? "unknown"),
      ),
      sessionReplayOrBehavioralAnalyticsObserved: retainedJourneys.some(
        (journey) => journey.purpose === "session_replay",
      ),
      journeySummary: summarizeObservedJourneys(retainedJourneys),
    },
    runtimeCoverage: bundle.runtimeCoverage
      ? {
        ...bundle.runtimeCoverage,
        observationCounts: {
          ...bundle.runtimeCoverage.observationCounts,
          observedJourneys: retainedJourneys.length,
        },
      }
      : undefined,
  });

  if (serializedBytes(compacted) <= maxSerializedBytes) {
    return compacted;
  }

  const referencedEventIds = collectReferencedEventIds(compacted);
  compacted = canonicalEvidenceBundleSchema.parse({
    ...compacted,
    networkEvents: retainPriorityEvents(compacted.networkEvents, referencedEventIds, 140),
    networkResponseEvents: retainPriorityEvents(compacted.networkResponseEvents, referencedEventIds, 100),
    scriptEvents: retainPriorityEvents(compacted.scriptEvents, referencedEventIds, 80),
    iframeEvents: retainPriorityEvents(compacted.iframeEvents, referencedEventIds, 60),
    runtimeTimeline: retainPriorityEvents(compacted.runtimeTimeline, referencedEventIds, 80),
  });

  if (serializedBytes(compacted) <= maxSerializedBytes) {
    return compacted;
  }

  return canonicalEvidenceBundleSchema.parse({
    ...compacted,
    networkEvents: retainPriorityEvents(compacted.networkEvents, referencedEventIds, 80),
    networkResponseEvents: retainPriorityEvents(compacted.networkResponseEvents, referencedEventIds, 60),
    scriptEvents: retainPriorityEvents(compacted.scriptEvents, referencedEventIds, 40),
    iframeEvents: retainPriorityEvents(compacted.iframeEvents, referencedEventIds, 40),
    runtimeTimeline: retainPriorityEvents(compacted.runtimeTimeline, referencedEventIds, 40),
  });
}

function boundModuleRunTimingBreakdown(
  moduleRun: CanonicalEvidenceBundle["modulesRun"][number],
): CanonicalEvidenceBundle["modulesRun"][number] {
  const timingBreakdown = moduleRun.timingBreakdown;
  if (!timingBreakdown) {
    return moduleRun;
  }
  const boundedTimingBreakdown = timingBreakdown.map((entry) => ({
    ...entry,
    ...(entry.detail ? { detail: entry.detail.slice(0, 240) } : {}),
  }));
  if (boundedTimingBreakdown.length <= MAX_MODULE_TIMING_BREAKDOWN_ENTRIES) {
    return { ...moduleRun, timingBreakdown: boundedTimingBreakdown };
  }
  const retainedCount = MAX_MODULE_TIMING_BREAKDOWN_ENTRIES - 1;
  const omitted = boundedTimingBreakdown.slice(retainedCount);
  const omittedDurationMs = omitted.reduce((total, entry) => total + entry.durationMs, 0);
  return {
    ...moduleRun,
    timingBreakdown: [
      ...boundedTimingBreakdown.slice(0, retainedCount),
      {
        label: "timing entries truncated",
        durationMs: omittedDurationMs,
        detail: `${omitted.length} timing breakdown entries omitted to keep the canonical bundle within the contract cap.`,
        outcome: "skipped",
      },
    ],
  };
}

type RetainableRuntimeEvent =
  | RuntimeEvidenceEvent
  | NetworkEvent
  | NetworkResponseEvent
  | CookieEvent
  | IframeEvent;

function isLowSignalEndpointJourney(journey: CanonicalEvidenceBundle["observedJourneys"][number]): boolean {
  if (journey.journeyType !== "endpoint") {
    return false;
  }
  if (journey.attributionStatus !== "site_owned_infrastructure") {
    return false;
  }
  if ((journey.relatedCookies ?? []).length > 0) {
    return false;
  }
  if ((journey.relatedVendors ?? []).length > 0 || (journey.relatedVendorObservationIds ?? []).length > 0) {
    return false;
  }
  return !journey.observedBehaviors.some((behavior) =>
    [
      "collection_endpoint_observed",
      "cookie_set",
      "cookie_sent",
      "identifier_parameter_observed",
      "advertising_click_id_observed",
      "session_replay_collection_observed",
      "session_replay_library_observed",
      "consent_management_observed",
    ].includes(behavior),
  );
}

function stripRuntimeEventDiagnostics<T extends RuntimeEvidenceEvent>(event: T): T {
  const { initiatorStack: _initiatorStack, ...retained } = event;
  return retained as T;
}

function stripNetworkEventDiagnostics(event: NetworkEvent): NetworkEvent {
  const { initiatorStack: _initiatorStack, ...retained } = event;
  return retained;
}

function stripNetworkResponseDiagnostics(event: NetworkResponseEvent): NetworkResponseEvent {
  const {
    timing: _timing,
    sizes: _sizes,
    cacheHeaders: _cacheHeaders,
    accessControlHeaders: _accessControlHeaders,
    initiatorStack: _initiatorStack,
    ...retained
  } = event;
  return {
    ...retained,
    cacheHeaders: {},
    accessControlHeaders: {},
  };
}

export function summarizeSiteResourceSizes(networkResponseEvents: NetworkResponseEvent[]) {
  const measuredResponses = networkResponseEvents.filter((event) =>
    event.consentStateAtTime === "pre_consent" &&
    event.pagePhase === "initial_navigation"
  );
  const responsesWithSize = measuredResponses.filter((event) =>
    event.sizes?.responseBodySize !== undefined ||
    event.sizes?.responseHeadersSize !== undefined
  );
  const responseBodyBytes = responsesWithSize.reduce(
    (total, event) => total + (event.sizes?.responseBodySize ?? 0),
    0,
  );
  const responseHeaderBytes = responsesWithSize.reduce(
    (total, event) => total + (event.sizes?.responseHeadersSize ?? 0),
    0,
  );
  return {
    measurementScope: "pre_consent_initial_navigation" as const,
    responseCount: measuredResponses.length,
    responsesWithSize: responsesWithSize.length,
    responseBodyBytes,
    responseHeaderBytes,
    totalTransferBytes: responseBodyBytes + responseHeaderBytes,
    completeness: measuredResponses.length === 0 || responsesWithSize.length === 0
      ? "unavailable" as const
      : responsesWithSize.length === measuredResponses.length
        ? "complete" as const
        : "partial" as const,
  };
}

function collectReferencedEventIds(bundle: CanonicalEvidenceBundle): Set<string> {
  const ids = new Set<string>();
  for (const journey of bundle.observedJourneys) {
    if (journey.entryPointSourceEventId) {
      ids.add(journey.entryPointSourceEventId);
    }
    for (const ref of journey.eventRefs ?? []) {
      ids.add(ref.eventId);
    }
    for (const ref of journey.evidenceRefs ?? []) {
      if (ref.eventId) {
        ids.add(ref.eventId);
      }
    }
    for (const ref of journey.relatedEvidenceRefs ?? []) {
      if (ref.eventId) {
        ids.add(ref.eventId);
      }
    }
  }
  for (const vendor of bundle.normalizedVendorObservations) {
    for (const eventId of vendor.matchedEvidenceIds ?? []) {
      ids.add(eventId);
    }
    for (const ref of vendor.matchedEvidenceRefs ?? []) {
      if (ref.eventId) {
        ids.add(ref.eventId);
      }
    }
  }
  for (const observation of bundle.consentUiObservations) {
    for (const ref of observation.evidenceRefs ?? []) {
      if (ref.eventId) {
        ids.add(ref.eventId);
      }
    }
  }
  return ids;
}

function retainPriorityEvents<T extends RetainableRuntimeEvent>(
  events: T[],
  referencedEventIds: Set<string>,
  maxEvents: number,
): T[] {
  if (events.length <= maxEvents) {
    return events;
  }
  return [...events]
    .map((event, index) => ({ event, index, score: retentionPriorityScore(event, referencedEventIds, index, events.length) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, maxEvents)
    .sort((left, right) => left.index - right.index)
    .map((item) => item.event);
}

function retentionPriorityScore(
  event: RetainableRuntimeEvent,
  referencedEventIds: Set<string>,
  index: number,
  total: number,
): number {
  let score = 0;
  if (referencedEventIds.has(event.eventId)) {
    score += 1_000;
  }
  if (event.thirdParty === true || event.firstParty === false) {
    score += 120;
  }
  if ("cookieNamesSent" in event && event.cookieNamesSent.length > 0) {
    score += 110;
  }
  if ("cookieNamesSet" in event && event.cookieNamesSet.length > 0) {
    score += 110;
  }
  if ("setCookieMetadata" in event && event.setCookieMetadata.length > 0) {
    score += 110;
  }
  if ("hasIdentifierLikeParameters" in event && event.hasIdentifierLikeParameters) {
    score += 100;
  }
  if ("hasAdvertisingClickIdParameters" in event && event.hasAdvertisingClickIdParameters) {
    score += 100;
  }
  if ("collectionEndpointObserved" in event && event.collectionEndpointObserved) {
    score += 100;
  }
  if ("isMainFrame" in event && event.isMainFrame) {
    score += 40;
  }
  if (event.eventType === "cookie") {
    score += 90;
  }
  if (event.eventType === "iframe") {
    score += 130;
  }
  const eventUrl = "url" in event && typeof event.url === "string" ? event.url : "";
  if (/(?:user|id|cookie)[_-]?sync|sync(?:\.gif|\/)|setuid|getuid/i.test(eventUrl)) {
    score += 140;
  }
  if (index < 12 || index >= total - 6) {
    score += 10;
  }
  return score;
}

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value));
}

export async function handler(event: {
  url: string;
  profile?: ScanProfile["profileId"];
  outDir?: string;
  region?: string;
}): Promise<CanonicalEvidenceBundle> {
  return runScan(event);
}

export { scanProfiles } from "./profiles.js";
export { buildObservedJourneys, summarizeObservedJourneys } from "./journey-builder.js";
export { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner.js";
export {
  consentFlowRuntimeScannerPlaceholder,
  policySurfaceScannerPlaceholder,
} from "./scanners/placeholders.js";
export {
  mergePolicySurfaceObservations,
  policySurfaceScanner,
} from "./scanners/policy-surface-scanner.js";
export {
  replayConsentFlowEvidenceCorpus,
  validateConsentFlowReplayCorpus,
  type ReplayEvidenceReport,
  type ReplayEvidenceSiteReport,
} from "./consent-flow-replay-runner.js";
export { createOpenAiNanoPolicyAssistProvider, createOpenAiNanoPolicyAssistProviderFromEnv } from "./nano-policy-assist-provider.js";

type ScanPhaseStatus = "completed" | "failed" | "skipped" | "started";

type ScanPhaseCheckpoint = {
  at: string;
  detail?: Record<string, unknown>;
  elapsedMs: number;
  name: string;
  status: ScanPhaseStatus;
};

function createScanPhaseRecorder(outDir: string, startedAtMs: number) {
  const checkpoints: ScanPhaseCheckpoint[] = [];
  const phasePath = path.join(outDir, "V2ScanCorePhases.json");
  return {
    async record(name: string, status: ScanPhaseStatus, detail?: Record<string, unknown>) {
      const elapsedMs = Date.now() - startedAtMs;
      const checkpoint: ScanPhaseCheckpoint = {
        at: new Date().toISOString(),
        detail: sanitizePhaseDetail(detail),
        elapsedMs,
        name,
        status,
      };
      checkpoints.push(checkpoint);
      console.error(`[v2-scan-phase] ${name} ${status} t+${elapsedMs}ms`);
      try {
        await mkdir(outDir, { recursive: true });
        await writeFile(phasePath, `${JSON.stringify({
          phaseArtifactVersion: "certscore.v2_scan_core_phases.1",
          checkpoints: checkpoints.slice(-80),
          lastCheckpoint: checkpoint,
          outDir,
          startedAt: new Date(startedAtMs).toISOString(),
          totalCheckpoints: checkpoints.length,
        }, null, 2)}\n`);
      } catch {
        // Phase diagnostics must never change scan behavior.
      }
    },
  };
}

function sanitizePhaseDetail(detail: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!detail) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(detail).map(([key, value]) => {
    if (typeof value === "string") {
      return [key, value.slice(0, 500)];
    }
    if (typeof value === "number" || typeof value === "boolean" || value === null) {
      return [key, value];
    }
    if (Array.isArray(value)) {
      return [key, value.slice(0, 20).map((item) => typeof item === "string" ? item.slice(0, 200) : item)];
    }
    return [key, String(value).slice(0, 500)];
  }));
}

export function deriveRuntimeCoverageSummary(input: {
  cmpRuntimeObservations?: CmpRuntimeObservation[];
  consentUiObservations?: ConsentUiObservation[];
  cookieEvents: CookieEvent[];
  cookieSnapshots: CookieSnapshot[];
  enabledModules: string[];
  modulesRun: CanonicalEvidenceBundle["modulesRun"];
  networkEvents: NetworkEvent[];
  normalizedVendorObservations: CanonicalEvidenceBundle["normalizedVendorObservations"];
  observedJourneys: CanonicalEvidenceBundle["observedJourneys"];
}): RuntimeCoverageSummary {
  const preConsentEnabled = input.enabledModules.includes("preConsentRuntimeScanner");
  const preConsentRun = input.modulesRun.find((moduleRun) => moduleRun.moduleName === "preConsentRuntimeScanner");
  const thirdPartyRequests = input.networkEvents.filter(isThirdPartyNetworkEvent).length;
  const cookiesBeforeConsent = input.cookieSnapshots.reduce(
    (sum, snapshot) => sum + snapshot.cookies.length,
    0,
  );
  const observationCounts = {
    networkEvents: input.networkEvents.length,
    thirdPartyRequests,
    cookieEvents: input.cookieEvents.length,
    cookiesBeforeConsent,
    normalizedVendors: input.normalizedVendorObservations.length,
    observedJourneys: input.observedJourneys.length,
  };
  const hasRuntimeEvidence = Object.values(observationCounts).some((count) => count > 0);
  const limitationKeys: string[] = [];
  const fallbackModesUsed: RuntimeCoverageSummary["fallbackModesUsed"] = [];
  const notes: string[] = [];

  if (!preConsentEnabled) {
    return {
      coverageStatus: "not_applicable",
      limitationKeys: ["pre_consent_runtime_not_in_profile"],
      fallbackModesUsed,
      observationCounts,
      silentEmpty: false,
      notes: ["Pre-consent runtime observation was not enabled for this scan profile."],
    };
  }

  if (!preConsentRun) {
    limitationKeys.push("pre_consent_runtime_not_run");
  } else {
    if (preConsentRun.status === "failed") {
      limitationKeys.push("pre_consent_runtime_failed");
    } else if (preConsentRun.status === "partial" && !preConsentPartialIsScreenshotOnly(preConsentRun.errors)) {
      limitationKeys.push("pre_consent_runtime_partial");
    } else if (preConsentRun.status === "skipped_budget" || preConsentRun.status === "not_testable") {
      limitationKeys.push("pre_consent_runtime_not_testable");
    }
    if (preConsentRun.errors.some((error) => /headed local fallback used/i.test(error))) {
      fallbackModesUsed.push("headed");
      notes.push("Headed local fallback was used after a headless runtime navigation failure.");
    }
  }

  const silentEmpty =
    preConsentRun?.status === "completed" &&
    !hasRuntimeEvidence &&
    (preConsentRun.errors ?? []).length === 0;
  if (silentEmpty) {
    limitationKeys.push("silent_empty_runtime_completed");
  }
  if (consentUiCaptureIncomplete(input)) {
    limitationKeys.push("consent_ui_capture_timed_out");
    notes.push("The bounded pre-interaction consent-surface inventory did not complete, so absence of a consent surface is not established for this run.");
  }
  if (consentInventoryProbeFailed(input)) {
    limitationKeys.push("consent_control_inventory_probe_failed");
    notes.push("The deterministic consent-control inventory probe was unavailable, so absence of first-layer controls is not established for this run.");
  }
  if (consentGeometryCaptureUnavailable(input)) {
    limitationKeys.push("consent_control_geometry_unavailable");
    notes.push("Main-frame consent-control geometry was unavailable; blank or child-frame geometry was not used to establish control absence.");
  }
  if (cmpRuntimeObservedWithoutActionableConsentSurface(input)) {
    limitationKeys.push("cmp_runtime_without_actionable_surface");
    notes.push("CMP runtime evidence was observed, but no actionable consent surface or first-layer controls were retained in bounded capture.");
  }
  if (postConsentFlowRuntimeDisabled(input)) {
    limitationKeys.push("post_consent_flow_runtime_disabled");
    notes.push("Post-consent consent-flow runtime is intentionally disabled; action completion and post-action behavior comparisons are explicit not-testable limitations.");
  }

  const coverageStatus: RuntimeCoverageSummary["coverageStatus"] =
    silentEmpty || (!hasRuntimeEvidence && limitationKeys.length > 0)
      ? "limited_none"
      : limitationKeys.length > 0
        ? "limited_partial"
        : "usable";

  return {
    coverageStatus,
    limitationKeys: uniqueStrings(limitationKeys),
    fallbackModesUsed: uniqueStrings(fallbackModesUsed) as RuntimeCoverageSummary["fallbackModesUsed"],
    observationCounts,
    silentEmpty,
    notes,
  };
}

export function withLocalRegionalEgressLimitation(
  coverage: RuntimeCoverageSummary,
  input: { env?: NodeJS.ProcessEnv; region: string },
): RuntimeCoverageSummary {
  const env = input.env ?? process.env;
  const requestedLocale = (
    env.CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE ??
    env.CERTSCORE_CHROMIUM_LOCALE ??
    ""
  ).trim();
  const regionalLocaleRequested = /^(?:en-IE|de-DE)(?:$|[-_])/i.test(requestedLocale);
  const runningInAwsLambda = Boolean(env.AWS_LAMBDA_FUNCTION_NAME?.trim()) ||
    /^AWS_Lambda_/i.test(env.AWS_EXECUTION_ENV?.trim() ?? "");
  if (
    input.region !== "local" ||
    runningInAwsLambda ||
    !regionalLocaleRequested ||
    chromiumProxyOptions(env)
  ) {
    return coverage;
  }

  return {
    ...coverage,
    coverageStatus: coverage.coverageStatus === "usable" ? "limited_partial" : coverage.coverageStatus,
    limitationKeys: uniqueStrings([
      ...coverage.limitationKeys,
      "regional_egress_unverified_local",
    ]),
    notes: uniqueStrings([
      ...coverage.notes,
      `The localhost scan requested ${requestedLocale} browser localization without a configured regional proxy; locale and timezone were retained, but geographic egress was not verified.`,
    ]),
  };
}

function consentUiCaptureIncomplete(input: {
  consentUiObservations?: ConsentUiObservation[];
}) {
  return (input.consentUiObservations ?? []).some((observation) =>
    observation.captureStatus === "incomplete" ||
    observation.basis.includes("bounded_capture_timeout_or_failure")
  );
}

function consentInventoryProbeFailed(input: {
  consentUiObservations?: ConsentUiObservation[];
}) {
  return (input.consentUiObservations ?? []).some((observation) =>
    observation.basis.includes("inventory:probe_failed")
  );
}

function consentGeometryCaptureUnavailable(input: {
  consentUiObservations?: ConsentUiObservation[];
}) {
  return (input.consentUiObservations ?? []).some((observation) =>
    observation.basis.includes("geometry_capture_unavailable")
  );
}

function cmpRuntimeObservedWithoutActionableConsentSurface(input: {
  cmpRuntimeObservations?: CmpRuntimeObservation[];
  consentUiObservations?: ConsentUiObservation[];
}) {
  if ((input.cmpRuntimeObservations ?? []).length === 0) {
    return false;
  }
  return !(input.consentUiObservations ?? []).some((observation) =>
    observation.acceptControlObserved ||
    observation.rejectControlObserved ||
    observation.managePreferencesControlObserved ||
    observation.controls.length > 0 ||
    observation.visibleChoiceLabels.length > 0
  );
}

function postConsentFlowRuntimeDisabled(input: {
  enabledModules: string[];
  modulesRun: CanonicalEvidenceBundle["modulesRun"];
}) {
  if (!input.enabledModules.includes("consentFlowRuntimeScanner")) {
    return false;
  }
  return input.modulesRun.some((moduleRun) =>
    moduleRun.moduleName === "consentFlowRuntimeScanner" &&
    moduleRun.status === "not_testable" &&
    moduleRun.errors.some((error) => /intentionally disabled/i.test(error))
  );
}

const SCAN_NO_GO_TEXT_PATTERN =
  /access to this site has been denied|access denied|access is temporarily restricted|forbidden|http\s*403|403(?:\s*-\s*|\s+)forbidden|403\s+error|the request could not be satisfied|block access from your country|unable to give you access to (?:our|this) site|unable to access (?:www\.)?[a-z0-9.-]+|security issue was automatically identified|security service to protect itself from online attacks|request blocked|bot protection|you(?:'|’)?ve been blocked|you have been blocked|cloudflare ray id|vercel security checkpoint|vercel sicherheitskontrollpunkt|checking your browser|wir überprüfen ihren browser|dein browser wird geprüft|performing security verification|verification failed(?:\.|\s)+(?:please\s+)?try again|security check|protected by kasada|x-kpsdk|detected unusual (?:behaviour|activity)[^.]{0,180}(?:bot|browser|network)|resembles that of a bot|real (?:shopper|person|user)s?[^.]{0,80}not robots?|(?:please )?verif(?:y|ies|ying)[^.]{0,80}(?:you are|that you(?:'|’)re) human|are you (?:a )?(?:person|human) or (?:a )?robot|press and hold[^.]{0,100}verif|\bzaraz wracamy\b|(?:click|klicke)\s+(?:the|auf die)\s+(?:button|schaltfläche)\s+(?:below|unten)[^.]{0,140}(?:continue\s+(?:shopping|to proceed)|(?:mit dem )?einkauf\s+fortzufahren)/i;

const SCAN_NO_GO_NOT_FOUND_PATTERN =
  /^(?:not found(?:\s+not found)?|404(?: not found)?)[.!\s]*$|\b404\b[^\n]{0,80}(?:not found|file not found)|(?:requested (?:page|file|url)|the (?:page|file))[^\n]{0,80}not found|the page you (?:requested|are looking for) (?:could not be found|does not exist)/i;
const SCAN_NO_GO_RATE_LIMIT_PATTERN = /\b429\b[^\n]{0,80}(?:too many requests|rate limit)|too many requests|rate limit exceeded/i;
const SCAN_NO_GO_SERVER_ERROR_PATTERN =
  /\b(?:500|502|503|504)\b[^\n]{0,100}(?:error|unavailable|gateway|timeout)|internal server error|service unavailable|bad gateway|gateway timeout/i;
const SCAN_NO_GO_MAINTENANCE_PATTERN =
  /(?:site|service|page) (?:is |will be |currently |temporarily )?(?:unavailable|offline|under maintenance|undergoing scheduled maintenance)|scheduled maintenance\b[\s\S]{0,120}(?:unavailable|offline|back soon|resume|restored)|we(?:'|’)ll be back soon|temporarily offline|page unavailable/i;
const SCAN_NO_GO_PLACEHOLDER_PATTERN =
  /\bexample domain\b|apache is functioning normally|website coming soon|site under construction|domain (?:is )?parked|domain(?:s)? (?:is |are )?(?:for sale|may be for sale)|welcome to nginx|default web site page|placeholder page|^[a-z0-9.-]+ is live!?$|this domain is an active and legitimate web address[^.]{0,160}(?:technical purposes|traffic routing|ad-tracking)|(?:agency|company|business|brand|website) (?:business )?has been acquired by[\s\S]{0,180}(?:click|continue|visit)[\s\S]{0,100}(?:website|site)/i;
const SCAN_NO_GO_APPLICATION_ERROR_PATTERN =
  /\bno company found\b|couldn['’]t find your company|missing (?:tenant|company|account) (?:slug|identifier)|unknown (?:tenant|company)|page is not available for this (?:tenant|company)/i;
const SCAN_NO_GO_LOADING_PATTERN =
  /^[^\p{L}\p{N}]{0,4}(?:loading|please wait|establishing (?:a )?secure connection|initializing)\b[\s\S]{0,120}$/iu;
const SCAN_NO_GO_TLS_PATTERN = /invalid ssl certificate|certificate (?:is )?(?:invalid|expired)|privacy error|your connection is not private/i;
const SCAN_NO_GO_CONFIGURATION_ERROR_PATTERN =
  /\{\s*"(?:detail|error)"\s*:\s*"(?:wrong domain parts[^\"]*|invalid (?:domain|host)[^\"]*|domain (?:is )?not configured[^\"]*)"|"error_code"\s*:\s*"[^"]+"[^}]{0,160}"error_msg"\s*:\s*"[^"]*(?:unavailable|configuration|invalid domain)|\berror 1001\b[\s\S]{0,240}\bdns resolution error\b|cloudflare is currently unable to resolve your requested domain|unable to complete your request[\s\S]{0,240}(?:technical difficulty|error ref)/i;
const SCAN_NO_GO_UNSUPPORTED_REGION_PATTERN =
  /visiting from the(?:\s|\|)+(?:eu|european union)[\s\S]{0,280}(?:ignore|block|deny)[^.]{0,100}(?:traffic|users?|access)|(?:site|service|content) (?:is )?not available in your (?:country|region)/i;
const SCAN_NO_GO_SITE_NOT_READY_PATTERN =
  /\bprelaunch\b[\s\S]{0,300}check back at launch|your browser can(?:'|’|‘)?t render[^.]{0,120}check back at launch/i;

const SCAN_NO_GO_SECURITY_CHALLENGE_REQUEST_PATTERN =
  /(?:^|\/)\.well-known\/vercel\/security\/|\/request-challenge(?:$|[?#])|challenge\.v2\.(?:min\.js|wasm)(?:$|[?#])|\/cdn-cgi\/challenge-platform\/|\/cdn-cgi\/challenge|challenges\.cloudflare\.com|captcha-delivery\.com|x-kpsdk|kasada/i;

const SCAN_NO_GO_NAVIGATION_FAILURE_PATTERN =
  /page\.goto|net::ERR_|ERR_HTTP2_PROTOCOL_ERROR|ERR_QUIC_PROTOCOL_ERROR|navigation timeout|timeout \d+ms exceeded/i;

const SCAN_ACCESS_BLOCK_TEXT_MARKERS = [
  /\baccess denied\b/i,
  /\b(?:403(?:\s*-\s*|\s+))?forbidden\b/i,
  /\brequest blocked\b/i,
  /\byou(?:'|’)?ve been blocked\b|\byou have been blocked\b/i,
  /\bthe request could not be satisfied\b/i,
  /\baccess (?:to this site has been denied|is temporarily restricted)\b/i,
  /\bsecurity service to protect itself from online attacks\b/i,
  /\bcloudflare ray id\b/i,
  /\bblock access from your country\b|\bnot available in your (?:country|region)\b/i,
] as const;

function countAccessBlockTextMarkers(text: string) {
  return SCAN_ACCESS_BLOCK_TEXT_MARKERS.reduce(
    (count, pattern) => count + (pattern.test(text) ? 1 : 0),
    0,
  );
}

export function buildScanNoGoAssessment(input: {
  consentUiObservations: ConsentUiObservation[];
  domSnapshots: DomSnapshotArtifact[];
  modulesRun: CanonicalEvidenceBundle["modulesRun"];
  normalizedUrl?: string;
  networkEvents: NetworkEvent[];
  networkResponseEvents: NetworkResponseEvent[];
  policySurfaceObservations: PolicySurfaceObservation[];
  screenshots: ScreenshotArtifact[];
}): {
  primaryReasonCode: string;
  scanNoGoAssessment: ScanNoGoAssessment;
  visualAccessReview: VisualAccessReview;
} | null {
  const representativeScreenshots = input.screenshots.filter(isRepresentativeScreenshotArtifact);
  const navigationFailureText = input.modulesRun
    .find((moduleRun) =>
      moduleRun.moduleName === "preConsentRuntimeScanner" &&
      moduleRun.status === "failed"
    )
    ?.errors.find((error) => SCAN_NO_GO_NAVIGATION_FAILURE_PATTERN.test(error));
  if (
    navigationFailureText &&
    representativeScreenshots.length === 0 &&
    input.domSnapshots.length === 0
  ) {
    const primaryReasonCode = classifyNavigationFailure(
      navigationFailureText,
      input.normalizedUrl,
    );
    const matchedText = boundedScanNoGoText(navigationFailureText) ?? "Initial navigation failed before page evidence could be retained.";
    const confidence = 0.92;
    const visualAccessReview: VisualAccessReview = {
      artifact_ref: null,
      confidence,
      go_no_go: "NO_GO",
      key_visual_evidence: [matchedText],
      page_state: "capture_failed",
      reason_code: primaryReasonCode,
      short_explanation: `The initial navigation failed before the scanner could retain public-page evidence: "${matchedText}"`,
      status: "missing_visual_artifact",
      version: "visual-access-review-v1",
    };
    const scanNoGoAssessment: ScanNoGoAssessment = {
      status: "available",
      version: "scan-no-go-assessment-v1",
      decision: "no_go",
      scanNoGoConfidence: confidence,
      reasonCodes: [primaryReasonCode, "scan_no_go_corroborated"],
      corroboratorCodes: ["pre_consent_navigation_failed", "no_visual_artifact_retained"],
      contradictorCodes: [],
      supportingSignals: {
        challengeSignalsDetected: false,
        documentStatusBlocked: false,
        expectedOriginReached: false,
        navigationTransportFailure: primaryReasonCode === "navigation_transport_failure",
        retainedVisualArtifactAvailable: false,
        visualNoGo: true,
        visualPageState: "capture_failed",
      },
      evidenceRefs: [
        "scan_runtime_artifacts.scan_no_go_assessment",
        "scan_runtime_artifacts.visual_access_review",
      ],
    };
    return {
      primaryReasonCode,
      scanNoGoAssessment,
      visualAccessReview,
    };
  }

  const domTextCandidates = uniqueStrings(
    input.domSnapshots
      .map((snapshot) => boundedScanNoGoText(snapshot.textExcerpt))
      .filter((text): text is string => Boolean(text)),
  );
  const textCandidates = uniqueStrings([
    ...domTextCandidates,
    ...input.consentUiObservations.map((observation) => boundedScanNoGoText(observation.textExcerpt)),
  ].filter((text): text is string => Boolean(text)));
  const longestText = [...textCandidates].sort((left, right) => right.length - left.length)[0] ?? "";
  const longestDomText = [...domTextCandidates].sort((left, right) => right.length - left.length)[0] ?? "";
  const consentSurfaceTexts = input.consentUiObservations
    .map((observation) => boundedScanNoGoText(observation.textExcerpt))
    .filter((text): text is string => Boolean(text));
  const longestConsentSurfaceText = [...consentSurfaceTexts]
    .sort((left, right) => right.length - left.length)[0] ?? "";
  const consentSurfaceWordCount = longestConsentSurfaceText
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  const actionableConsentControlObserved = input.consentUiObservations.some((observation) =>
    observation.acceptControlObserved ||
    observation.rejectControlObserved ||
    observation.managePreferencesControlObserved ||
    observation.visibleChoiceLabels.length > 0 ||
    observation.controls.some((control) => control.visible)
  );
  const mainDocumentStatus = getMainDocumentStatus(input.networkEvents, input.networkResponseEvents);
  const mainDocumentStatuses = getMainDocumentStatuses(input.networkEvents, input.networkResponseEvents);
  const successfulMainDocumentBeforeTerminal = mainDocumentStatuses.length > 1 &&
    mainDocumentStatuses.slice(0, -1).some((status) => status >= 200 && status < 400) &&
    mainDocumentStatus !== null && classifyMainDocumentStatus(mainDocumentStatus)?.hardTerminal === true;
  const successfulFirstPartyResponses = input.networkResponseEvents.filter((event) =>
    event.firstParty === true && (event.status ?? 0) >= 200 && (event.status ?? 0) < 400
  ).length;
  const substantiveDomWordCount = longestDomText.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  const substantiveRetainedDomVolumeObserved =
    longestDomText.length >= 180 &&
    substantiveDomWordCount >= 24;
  const screenshotStructure = inspectRetainedScreenshotStructure(representativeScreenshots);
  const visuallySubstantiveScreenshotObserved = screenshotStructure?.visuallySubstantive === true;
  const visuallyBlankScreenshotObserved = screenshotStructure?.visuallyBlank === true;
  // Settled DOM text is the closest textual representation of the page the
  // visitor saw. Consent probes can contain large inline scripts whose source
  // mentions blocking or challenge behavior without representing page state.
  // Only fall back to consent-surface text when no settled DOM text survived.
  const textPageState = longestDomText
    ? classifyScanNoGoText(longestDomText)
    : classifyScanNoGoText(longestText);
  const consentSurfaceTextPageState = classifyScanNoGoText(longestConsentSurfaceText);
  const substantiveDomTextObserved =
    !classifyScanNoGoText(longestDomText) &&
    longestDomText.length >= 180 &&
    substantiveDomWordCount >= 24;
  const substantiveCapturedPageTextObserved =
    substantiveDomTextObserved ||
    (
      !longestDomText &&
      !consentSurfaceTextPageState &&
      longestConsentSurfaceText.length >= 180 &&
      consentSurfaceWordCount >= 24
    );
  const substantiveConsentSurfaceTextObserved =
    input.consentUiObservations.some((observation) => observation.likelyPresent) &&
    !consentSurfaceTextPageState &&
    longestConsentSurfaceText.length >= 180 &&
    consentSurfaceWordCount >= 24;
  const visuallyBlankSuccessfulPage =
    visuallyBlankScreenshotObserved &&
    !substantiveDomTextObserved &&
    !substantiveCapturedPageTextObserved &&
    !actionableConsentControlObserved;
  const positiveSiteSignals = uniqueStrings([
    mainDocumentStatus !== null && mainDocumentStatus >= 200 && mainDocumentStatus < 400
      ? "main_document_success"
      : null,
    substantiveDomTextObserved
      ? "substantive_dom_text_observed"
      : null,
    substantiveRetainedDomVolumeObserved
      ? "substantive_retained_dom_volume_observed"
      : null,
    actionableConsentControlObserved ? "actionable_consent_control_observed" : null,
    substantiveCapturedPageTextObserved ? "substantive_captured_page_text_observed" : null,
    substantiveConsentSurfaceTextObserved ? "substantive_consent_surface_text_observed" : null,
    input.policySurfaceObservations.length > 0 ? "policy_surface_observed" : null,
    successfulFirstPartyResponses >= 4 ? "multiple_first_party_resources_loaded" : null,
    successfulMainDocumentBeforeTerminal ? "successful_main_document_before_terminal_state" : null,
    visuallySubstantiveScreenshotObserved ? "visually_substantive_screenshot_observed" : null,
    visuallyBlankSuccessfulPage ? "visually_blank_screenshot_observed" : null,
  ].filter((value): value is string => Boolean(value)));
  const strongPositiveSiteEvidence = positiveSiteSignals.some((signal) =>
    signal !== "main_document_success" &&
    signal !== "substantive_retained_dom_volume_observed" &&
    signal !== "visually_blank_screenshot_observed"
  );
  const networkChallengeEvidence = detectScanNoGoNetworkChallengeEvidence({
    networkEvents: input.networkEvents,
    networkResponseEvents: input.networkResponseEvents,
  });
  const httpPageState = classifyMainDocumentStatus(mainDocumentStatus);
  const challengePageState: ClassifiedNoGoPageState | null =
    networkChallengeEvidence &&
    (textPageState?.reasonCode === "captcha_or_challenge" ||
      (textPageState?.reasonCode === "access_denied_or_forbidden_page" &&
        !strongPositiveSiteEvidence) ||
      (httpPageState?.reasonCode === "access_denied_or_forbidden_page" &&
        !strongPositiveSiteEvidence))
      ? {
          confidence: 0.95,
          evidenceText: textPageState?.evidenceText ?? networkChallengeEvidence.evidenceText,
          hardTerminal: Boolean(textPageState) || mainDocumentStatus !== null,
          reasonCode: "captcha_or_challenge",
          visualPageState: "captcha_or_challenge",
        }
      : null;
  const explicitTextChallenge = textPageState?.reasonCode === "captcha_or_challenge"
    ? textPageState
    : null;
  const pageState = challengePageState ?? explicitTextChallenge ?? httpPageState ?? textPageState;
  const visualBlankPageState: ClassifiedNoGoPageState | null = visuallyBlankSuccessfulPage
    ? {
        confidence: 0.94,
        evidenceText: "The retained public-page screenshot was visually blank after the page settled.",
        hardTerminal: true,
        reasonCode: "blank_or_unusable_page",
        visualPageState: "blank_or_unusable",
      }
    : null;
  const settledPageState = pageState ?? visualBlankPageState;
  const nearlyEmptyPage = longestDomText.length <= 40 && substantiveDomWordCount <= 6;
  const sparseSecondLookRetained = representativeScreenshots.some((artifact) =>
    artifact.artifactId === "screenshot_pre_consent_no_go_confirmation"
  );
  const committedVisualPageRetained = representativeScreenshots.some((artifact) =>
    /^https?:\/\//i.test(artifact.url)
  );
  const temporallyConfirmedSparsePage =
    ((mainDocumentStatus !== null && mainDocumentStatus >= 200 && mainDocumentStatus < 400) || committedVisualPageRetained) &&
    longestDomText.length <= 60 &&
    substantiveDomWordCount <= 10 &&
    sparseSecondLookRetained;
  const sparseSuccessfulPage =
    mainDocumentStatus !== null &&
    mainDocumentStatus >= 200 &&
    mainDocumentStatus < 400 &&
    nearlyEmptyPage &&
    input.networkEvents.length <= 4 &&
    successfulFirstPartyResponses <= 2 &&
    input.policySurfaceObservations.length === 0;
  const partialRuntimeWithoutPageEvidence =
    input.modulesRun.some((moduleRun) =>
      moduleRun.moduleName === "preConsentRuntimeScanner" &&
      moduleRun.status === "partial" &&
      moduleRun.errors.some((error) => /(?:module budget|bounded partial evidence|runtime.*partial)/i.test(error))
    ) &&
    representativeScreenshots.length === 0 &&
    longestDomText.length <= 60 &&
    substantiveDomWordCount <= 10 &&
    input.policySurfaceObservations.length === 0 &&
    input.networkEvents.length <= 4 &&
    !actionableConsentControlObserved;
  if (!settledPageState && !networkChallengeEvidence && !sparseSuccessfulPage && !temporallyConfirmedSparsePage && !partialRuntimeWithoutPageEvidence) {
    return null;
  }

  const retainedEvidenceText = settledPageState?.evidenceText ??
    (sparseSuccessfulPage || temporallyConfirmedSparsePage || partialRuntimeWithoutPageEvidence
      ? partialRuntimeWithoutPageEvidence
        ? "The bounded pre-consent runtime ended before representative page evidence could be retained."
        : "The settled page remained sparse after a bounded second-look capture."
      : null) ??
    networkChallengeEvidence?.evidenceText ??
    "Potential security challenge evidence observed.";
  const securityChallengeRequestObserved = Boolean(networkChallengeEvidence);
  const screenshot = screenshotStructure?.screenshot ?? representativeScreenshots
    .filter((artifact) => artifact.consentStateAtTime === "pre_consent")
    .sort((left, right) => left.capturedAtMs - right.capturedAtMs)[0] ?? null;
  const primaryReasonCode = settledPageState?.reasonCode ??
    (partialRuntimeWithoutPageEvidence
      ? isLikelyInfrastructureHomepageTarget(input.normalizedUrl)
        ? "target_unreachable_or_unsuitable"
        : "loading_or_stalled"
      : sparseSuccessfulPage || temporallyConfirmedSparsePage
        ? "blank_or_unusable_page"
        : "potential_security_challenge");
  const candidateVisualPageState: VisualAccessReview["page_state"] =
    primaryReasonCode === "target_unreachable_or_unsuitable"
      ? "capture_failed"
      : settledPageState?.visualPageState ??
        (partialRuntimeWithoutPageEvidence || sparseSuccessfulPage || temporallyConfirmedSparsePage
          ? "blank_or_unusable"
          : "degraded_but_useful");
  const blockedMainDocument = mainDocumentStatus !== null && [401, 403, 407, 429, 451, 500, 502, 503, 504].includes(mainDocumentStatus);
  const explicitTerminalPage = Boolean(settledPageState) || sparseSuccessfulPage || temporallyConfirmedSparsePage || partialRuntimeWithoutPageEvidence;
  const successfulSettledMainDocument =
    mainDocumentStatus !== null &&
    mainDocumentStatus >= 200 &&
    mainDocumentStatus < 400;
  const accessBlockMarkerCount = countAccessBlockTextMarkers(longestDomText || longestText);
  const likelyIncidentalAccessBlockText =
    textPageState?.reasonCode === "access_denied_or_forbidden_page" &&
    !blockedMainDocument &&
    substantiveRetainedDomVolumeObserved &&
    accessBlockMarkerCount === 1;
  const priorSuccessfulDocumentContradiction =
    successfulMainDocumentBeforeTerminal &&
    visuallySubstantiveScreenshotObserved &&
    (
      (substantiveRetainedDomVolumeObserved && successfulFirstPartyResponses >= 8) ||
      successfulFirstPartyResponses >= 16
    );
  // Access-block wording is common in article copy, inline application text,
  // and transient interstitials. It is a candidate no-go signal until the
  // settled page is corroborated. A screenshot is never sufficient by itself:
  // require a second independent representative-page channel.
  const representativeAccessBlockContradiction =
    settledPageState?.reasonCode === "access_denied_or_forbidden_page" &&
    visuallySubstantiveScreenshotObserved &&
    (
      (
        actionableConsentControlObserved &&
        (successfulSettledMainDocument || successfulMainDocumentBeforeTerminal)
      ) ||
      priorSuccessfulDocumentContradiction ||
      (
        likelyIncidentalAccessBlockText &&
        successfulSettledMainDocument &&
        successfulFirstPartyResponses >= 4
      )
    );
  const contradictedByNormalSite =
    strongPositiveSiteEvidence &&
    (
      (!blockedMainDocument && !settledPageState?.hardTerminal) ||
      representativeAccessBlockContradiction ||
      (
        temporallyConfirmedSparsePage &&
        !settledPageState?.hardTerminal &&
        (
          actionableConsentControlObserved ||
          substantiveConsentSurfaceTextObserved ||
          visuallySubstantiveScreenshotObserved ||
          successfulFirstPartyResponses >= 4
        )
      )
    );
  const decision: ScanNoGoAssessment["decision"] =
    explicitTerminalPage && !contradictedByNormalSite
      ? "no_go"
      : "continue_with_diagnostics";
  const visualPageState: VisualAccessReview["page_state"] =
    decision === "continue_with_diagnostics" && explicitTerminalPage
      ? "degraded_but_useful"
      : candidateVisualPageState;
  const confidence = decision === "no_go"
    ? settledPageState?.confidence ?? (sparseSuccessfulPage || temporallyConfirmedSparsePage ? 0.91 : 0.9)
    : 0.72;
  const evidenceRefs = [
    "scan_runtime_artifacts.scan_no_go_assessment",
    "scan_runtime_artifacts.visual_access_review",
    screenshot ? "scan_runtime_artifacts.visual_evidence_artifacts" : null,
  ].filter((value): value is string => Boolean(value));
  const shortExplanation = decision === "no_go"
    ? `Corroborated initial-load evidence showed a terminal no-go page instead of the normal public site: "${retainedEvidenceText}"`
    : `Potential no-go evidence was observed, but normal-site evidence required the scan to continue: "${retainedEvidenceText}"`;
  const visualAccessReview: VisualAccessReview = {
    artifact_ref: screenshot ? `scan_core:${screenshot.artifactId}` : null,
    confidence,
    go_no_go: decision === "no_go" ? "NO_GO" : "GO",
    key_visual_evidence: [retainedEvidenceText],
    page_state: visualPageState,
    reason_code: primaryReasonCode,
    short_explanation: shortExplanation,
    status: "available",
    version: "visual-access-review-v1",
  };
  const scanNoGoAssessment: ScanNoGoAssessment = {
    status: "available",
    version: "scan-no-go-assessment-v1",
    decision,
    scanNoGoConfidence: confidence,
    visualScreenshotNoGoConfidence: screenshot ? confidence : undefined,
    reasonCodes: [primaryReasonCode, "scan_no_go_corroborated"],
    corroboratorCodes: [
      securityChallengeRequestObserved ? "network_security_challenge_request_observed" : null,
      networkChallengeEvidence?.corroboratorCode ?? null,
      settledPageState ? "terminal_page_text_or_status_observed" : null,
      visuallyBlankSuccessfulPage ? "visual_blank_screenshot_observed" : null,
      sparseSuccessfulPage || temporallyConfirmedSparsePage ? "settled_page_nearly_empty" : null,
      partialRuntimeWithoutPageEvidence ? "partial_runtime_without_page_evidence" : null,
      temporallyConfirmedSparsePage ? "bounded_second_look_remained_sparse" : null,
      screenshot ? "retained_visual_artifact_available" : null,
    ].filter((value): value is string => Boolean(value)),
    contradictorCodes: decision === "continue_with_diagnostics" ? positiveSiteSignals : [],
    supportingSignals: {
      challengeSignalsDetected: securityChallengeRequestObserved,
      documentStatusBlocked: blockedMainDocument,
      expectedOriginReached: mainDocumentStatus !== null && mainDocumentStatus >= 200 && mainDocumentStatus < 400,
      mainDocumentStatus,
      substantiveDomTextObserved: longestDomText.length >= 180 && substantiveDomWordCount >= 24,
      substantiveRetainedDomVolumeObserved,
      substantiveWordCount: substantiveDomWordCount,
      successfulFirstPartyResponses,
      retainedVisualArtifactAvailable: Boolean(screenshot),
      securityChallengeRequestObserved,
      actionableConsentControlObserved,
      substantiveCapturedPageTextObserved,
      substantiveConsentSurfaceTextObserved,
      consentSurfaceWordCount,
      visualHardNoGoPageState: decision === "no_go",
      visualNoGo: decision === "no_go",
      visualPageState,
      successfulMainDocumentBeforeTerminal,
      successfulSettledMainDocument,
      accessBlockMarkerCount,
      likelyIncidentalAccessBlockText,
      visuallySubstantiveScreenshotObserved,
      visuallyBlankScreenshotObserved,
      screenshotEncodedBytesPerPixel: screenshotStructure?.encodedBytesPerPixel ?? null,
      screenshotHeight: screenshotStructure?.height ?? null,
      screenshotWidth: screenshotStructure?.width ?? null,
    },
    evidenceRefs,
  };

  return {
    primaryReasonCode,
    scanNoGoAssessment,
    visualAccessReview,
  };
}

export function buildScanEvidenceLaneAssessment(input: {
  consentLaneStatus?: "usable" | "limited" | "not_testable";
  consentLimitationKeys?: string[];
  normalizedUrl: string;
  policySurfaceObservations: PolicySurfaceObservation[];
  runtimeCoverage: RuntimeCoverageSummary;
  scanNoGoAssessment: ScanNoGoAssessment | null;
  transportSecurityObservationCount: number;
}): ScanEvidenceLaneAssessment {
  const homepageNoGo = input.scanNoGoAssessment?.decision === "no_go";
  const usablePolicySurfaces = input.policySurfaceObservations.filter((observation) =>
    isIndependentlyUsablePolicySurface(observation, input.normalizedUrl)
  );
  const runtimeUsable = !homepageNoGo && input.runtimeCoverage.coverageStatus === "usable";
  const runtimeLimited = !homepageNoGo && input.runtimeCoverage.coverageStatus === "limited_partial";
  const outcome: ScanEvidenceLaneAssessment["outcome"] = runtimeUsable || runtimeLimited
    ? "usable"
    : usablePolicySurfaces.length > 0
      ? "partial_with_diagnostics"
      : "no_go";
  const runtimeLane = runtimeUsable ? "usable" as const : runtimeLimited ? "limited" as const : "unusable" as const;
  const policyLane = usablePolicySurfaces.length > 0
    ? "usable" as const
    : input.policySurfaceObservations.length > 0
      ? "limited" as const
      : "not_testable" as const;
  return {
    status: "available",
    version: "scan-evidence-lane-assessment-v1",
    outcome,
    lanes: {
      homepageRuntime: runtimeLane,
      consent: input.consentLaneStatus ?? (runtimeUsable ? "usable" : runtimeLimited ? "limited" : "not_testable"),
      cookiesTrackers: runtimeUsable ? "usable" : runtimeLimited ? "limited" : "not_testable",
      policyGdpr: policyLane,
      transport: input.transportSecurityObservationCount > 0 ? "usable" : "not_testable",
    },
    usablePolicySurfaceUrls: usablePolicySurfaces
      .map((observation) => observation.normalizedUrl ?? observation.url)
      .slice(0, 8),
    limitationKeys: uniqueStrings([
      ...input.runtimeCoverage.limitationKeys,
      ...(input.consentLimitationKeys ?? []),
      homepageNoGo ? "homepage_runtime_no_go" : null,
      outcome === "partial_with_diagnostics" ? "partial_policy_evidence_only" : null,
      policyLane !== "usable" ? "verified_policy_surface_unavailable" : null,
    ].filter((value): value is string => Boolean(value))).slice(0, 24),
    evidenceRefs: uniqueStrings([
      ...usablePolicySurfaces.flatMap((observation) => observation.evidenceRefs.map((ref) => ref.refId)),
      ...(homepageNoGo ? ["scan_runtime_artifacts.scan_no_go_assessment"] : []),
    ]).slice(0, 24),
  };
}

function isIndependentlyUsablePolicySurface(
  observation: PolicySurfaceObservation,
  requestedUrl: string,
): boolean {
  if (observation.status !== "fetched" || observation.fetchable === false) return false;
  if (typeof observation.httpStatus !== "number" || observation.httpStatus < 200 || observation.httpStatus >= 400) return false;
  if (observation.surfaceType === "unknown" || observation.surfaceType === "terms") return false;
  const text = observation.textExcerpt?.replace(/\s+/g, " ").trim() ?? "";
  const wordCount = text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  if (text.length < 240 || wordCount < 35 || observation.evidenceRefs.length === 0) return false;
  const verifiedTargetRelationship =
    ["target_controller", "first_party_brand"].includes(observation.targetRelationship ?? "") &&
    (observation.ownershipConfidence ?? 0) >= 0.75;
  if (verifiedTargetRelationship) return true;
  try {
    const requested = new URL(requestedUrl).hostname.toLowerCase().replace(/^www\./, "");
    const observed = new URL(observation.normalizedUrl ?? observation.url).hostname.toLowerCase().replace(/^www\./, "");
    return observed === requested || observed.endsWith(`.${requested}`) || requested.endsWith(`.${observed}`);
  } catch {
    return false;
  }
}

type RetainedScreenshotStructure = {
  encodedBytesPerPixel: number;
  height: number;
  screenshot: ScreenshotArtifact;
  visuallyBlank: boolean;
  visuallySubstantive: boolean;
  width: number;
};

function inspectRetainedScreenshotStructure(
  screenshots: ScreenshotArtifact[],
): RetainedScreenshotStructure | null {
  const ranked = [...screenshots].sort((left, right) =>
    screenshotNoGoReviewRank(left) - screenshotNoGoReviewRank(right)
  );
  let strongest: RetainedScreenshotStructure | null = null;
  for (const screenshot of ranked) {
    if (!isRepresentativeScreenshotArtifact(screenshot)) continue;
    let descriptor: number | null = null;
    try {
      descriptor = openSync(screenshot.path, "r");
      const header = Buffer.alloc(65_536);
      const bytesRead = readSync(descriptor, header, 0, header.length, 0);
      const dimensions = inspectScreenshotDimensions(header.subarray(0, bytesRead));
      if (!dimensions) continue;
      const { format, height, width } = dimensions;
      if (width < 64 || height < 64) continue;
      const byteLength = statSync(screenshot.path).size;
      const encodedBytesPerPixel = byteLength / (width * height);
      const candidate = {
        encodedBytesPerPixel,
        height,
        screenshot,
        visuallyBlank:
          width >= 640 &&
          height >= 400 &&
          encodedBytesPerPixel <= (format === "jpeg" ? 0.012 : 0.02),
        visuallySubstantive:
          width >= 640 &&
          height >= 400 &&
          byteLength >= (format === "jpeg" ? 30_000 : 80_000) &&
          encodedBytesPerPixel >= (format === "jpeg" ? 0.045 : 0.06),
        width,
      };
      if (!strongest || candidate.encodedBytesPerPixel > strongest.encodedBytesPerPixel) {
        strongest = candidate;
      }
    } catch {
      // Screenshot disagreement is a conservative veto only; missing local bytes do not create no-go evidence.
    } finally {
      if (descriptor !== null) closeSync(descriptor);
    }
  }
  return strongest;
}

function isRepresentativeScreenshotArtifact(screenshot: ScreenshotArtifact): boolean {
  return screenshot.captureMethod !== "primary_placeholder" &&
    screenshot.captureMethod !== "fresh_context_placeholder";
}

function inspectScreenshotDimensions(
  header: Buffer,
): { format: "jpeg" | "png"; height: number; width: number } | null {
  if (header.length >= 24 && header.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
    return {
      format: "png",
      height: header.readUInt32BE(20),
      width: header.readUInt32BE(16),
    };
  }
  if (header.length < 12 || header[0] !== 0xff || header[1] !== 0xd8) {
    return null;
  }
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 9 < header.length) {
    if (header[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (header[offset] === 0xff) offset += 1;
    const marker = header[offset];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 1;
      continue;
    }
    const segmentLength = header.readUInt16BE(offset + 1);
    if (segmentLength < 2 || offset + 1 + segmentLength > header.length) break;
    if (startOfFrameMarkers.has(marker)) {
      return {
        format: "jpeg",
        height: header.readUInt16BE(offset + 4),
        width: header.readUInt16BE(offset + 6),
      };
    }
    offset += 1 + segmentLength;
  }
  return null;
}

function screenshotNoGoReviewRank(screenshot: ScreenshotArtifact) {
  switch (screenshot.artifactId) {
    case "screenshot_pre_consent_no_go_confirmation": return 0;
    case "screenshot_pre_consent_settled": return 1;
    case "screenshot_pre_consent_cmp_controls": return 2;
    case "screenshot_pre_consent_geometry_proof": return 3;
    case "screenshot_pre_consent": return 4;
    case "screenshot_pre_consent_full_page": return 5;
    default: return 6;
  }
}

type ClassifiedNoGoPageState = {
  confidence: number;
  evidenceText: string;
  hardTerminal: boolean;
  reasonCode: ScanNoGoReasonCode;
  visualPageState: VisualAccessReview["page_state"];
};

function classifyScanNoGoText(text: string): ClassifiedNoGoPageState | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  const evidenceText = boundedScanNoGoText(normalized) ?? normalized;
  if (SCAN_NO_GO_TLS_PATTERN.test(normalized)) {
    return { confidence: 0.97, evidenceText, hardTerminal: true, reasonCode: "tls_or_certificate_error", visualPageState: "visual_error_shell" };
  }
  if (SCAN_NO_GO_CONFIGURATION_ERROR_PATTERN.test(normalized)) {
    return { confidence: 0.96, evidenceText, hardTerminal: true, reasonCode: "configuration_error", visualPageState: "visual_error_shell" };
  }
  if (SCAN_NO_GO_UNSUPPORTED_REGION_PATTERN.test(normalized)) {
    return { confidence: 0.97, evidenceText, hardTerminal: true, reasonCode: "unsupported_region", visualPageState: "access_blocked" };
  }
  if (SCAN_NO_GO_SITE_NOT_READY_PATTERN.test(normalized)) {
    return { confidence: 0.97, evidenceText, hardTerminal: true, reasonCode: "site_not_ready", visualPageState: "parked_or_placeholder" };
  }
  if (SCAN_NO_GO_RATE_LIMIT_PATTERN.test(normalized)) {
    return { confidence: 0.98, evidenceText, hardTerminal: true, reasonCode: "rate_limited_429", visualPageState: "access_blocked" };
  }
  if (SCAN_NO_GO_NOT_FOUND_PATTERN.test(normalized)) {
    return { confidence: 0.97, evidenceText, hardTerminal: true, reasonCode: "not_found_404", visualPageState: "wrong_site_or_soft_404" };
  }
  if (SCAN_NO_GO_SERVER_ERROR_PATTERN.test(normalized)) {
    return { confidence: 0.97, evidenceText, hardTerminal: true, reasonCode: "server_error_5xx", visualPageState: "maintenance_or_unavailable" };
  }
  if (SCAN_NO_GO_PLACEHOLDER_PATTERN.test(normalized)) {
    return { confidence: 0.95, evidenceText, hardTerminal: true, reasonCode: "parked_or_placeholder", visualPageState: "parked_or_placeholder" };
  }
  if (SCAN_NO_GO_APPLICATION_ERROR_PATTERN.test(normalized)) {
    return { confidence: 0.94, evidenceText, hardTerminal: true, reasonCode: "not_found_404", visualPageState: "wrong_site_or_soft_404" };
  }
  if (SCAN_NO_GO_MAINTENANCE_PATTERN.test(normalized)) {
    return { confidence: 0.95, evidenceText, hardTerminal: true, reasonCode: "maintenance_or_unavailable", visualPageState: "maintenance_or_unavailable" };
  }
  if (SCAN_NO_GO_TEXT_PATTERN.test(normalized)) {
    const challenge = /not a bot|not robots?|person or (?:a )?robot|verif(?:y|ies|ying)[^.]{0,80}(?:you are|that you(?:'|’)re) human|verification failed(?:\.|\s)+(?:please\s+)?try again|press and hold[^.]{0,100}verif|security (?:check|verification)|checking your browser|dein browser wird geprüft|performing security verification|protected by kasada|x-kpsdk|resembles that of a bot|(?:click|klicke)\s+(?:the|auf die)\s+(?:button|schaltfläche)\s+(?:below|unten)[^.]{0,140}(?:continue\s+(?:shopping|to proceed)|(?:mit dem )?einkauf\s+fortzufahren)/i.test(normalized);
    return {
      confidence: challenge ? 0.95 : 0.93,
      evidenceText,
      hardTerminal: true,
      reasonCode: challenge ? "captcha_or_challenge" : "access_denied_or_forbidden_page",
      visualPageState: challenge ? "captcha_or_challenge" : "access_blocked",
    };
  }
  if (SCAN_NO_GO_LOADING_PATTERN.test(normalized)) {
    return { confidence: 0.92, evidenceText, hardTerminal: false, reasonCode: "loading_or_stalled", visualPageState: "blank_or_unusable" };
  }
  return null;
}

export function classifyScanNoGoTextForCalibration(text: string) {
  const classified = classifyScanNoGoText(boundedScanNoGoText(text) ?? "");
  return classified
    ? {
        confidence: classified.confidence,
        reasonCode: classified.reasonCode,
        visualPageState: classified.visualPageState,
      }
    : null;
}

function classifyMainDocumentStatus(status: number | null): ClassifiedNoGoPageState | null {
  if (status === null) return null;
  if (status === 404 || status === 410) {
    return { confidence: 0.99, evidenceText: `The main document returned HTTP ${status}.`, hardTerminal: true, reasonCode: "not_found_404", visualPageState: "wrong_site_or_soft_404" };
  }
  if (status === 429) {
    return { confidence: 0.99, evidenceText: "The main document returned HTTP 429.", hardTerminal: true, reasonCode: "rate_limited_429", visualPageState: "access_blocked" };
  }
  if ([401, 403, 407, 451].includes(status)) {
    return { confidence: 0.99, evidenceText: `The main document returned HTTP ${status}.`, hardTerminal: true, reasonCode: "access_denied_or_forbidden_page", visualPageState: "access_blocked" };
  }
  if ([500, 502, 503, 504].includes(status)) {
    return { confidence: 0.99, evidenceText: `The main document returned HTTP ${status}.`, hardTerminal: true, reasonCode: "server_error_5xx", visualPageState: "maintenance_or_unavailable" };
  }
  return null;
}

function getMainDocumentStatus(
  networkEvents: NetworkEvent[],
  networkResponseEvents: NetworkResponseEvent[],
): number | null {
  return getMainDocumentStatuses(networkEvents, networkResponseEvents).at(-1) ?? null;
}

function getMainDocumentStatuses(
  networkEvents: NetworkEvent[],
  networkResponseEvents: NetworkResponseEvent[],
): number[] {
  const mainDocumentRequestIds = new Set(networkEvents
    .filter((event) => event.resourceType === "document" && event.isMainFrame === true)
    .map((event) => event.requestId));
  return networkResponseEvents
    .filter((event) => event.requestId && mainDocumentRequestIds.has(event.requestId))
    .map((event) => event.status)
    .filter((status): status is number => typeof status === "number");
}

function detectScanNoGoNetworkChallengeEvidence(input: {
  networkEvents: NetworkEvent[];
  networkResponseEvents: NetworkResponseEvent[];
}): { corroboratorCode: string; evidenceText: string } | null {
  const challengeRequest = input.networkEvents.find((event) =>
    SCAN_NO_GO_SECURITY_CHALLENGE_REQUEST_PATTERN.test(event.url ?? "")
  );
  if (challengeRequest) {
    return {
      corroboratorCode: /kasada|x-kpsdk/i.test(challengeRequest.url ?? "")
        ? "network_kasada_challenge"
        : /captcha-delivery\.com|datadome/i.test(challengeRequest.url ?? "")
        ? "network_datadome_challenge"
        : "network_cloudflare_challenge",
      evidenceText: "Network request to a security challenge endpoint was observed.",
    };
  }

  const blockedWafResponse = input.networkResponseEvents.find((event) => {
    if (event.firstParty !== true) {
      return false;
    }
    const status = event.status ?? 0;
    if (![401, 403, 407, 409, 429, 451, 503].includes(status)) {
      return false;
    }
    const cookieNames = [
      ...(event.cookieNamesSet ?? []),
      ...(event.setCookieMetadata ?? []).map((cookie) => cookie.name),
    ];
    const evidenceText = [
      event.url ?? "",
      event.responseUrl ?? "",
      event.hostname ?? "",
      ...cookieNames,
      event.responseHeaders?.contentType ?? "",
    ].join(" ");
    return /(?:^|\b)datadome(?:\b|$)|captcha-delivery\.com|kasada|x-kpsdk/i.test(evidenceText);
  });
  if (!blockedWafResponse) {
    return null;
  }

  const responseEvidenceText = [
    blockedWafResponse.url ?? "",
    blockedWafResponse.responseUrl ?? "",
    blockedWafResponse.hostname ?? "",
    ...(blockedWafResponse.cookieNamesSet ?? []),
    ...(blockedWafResponse.setCookieMetadata ?? []).map((cookie) => cookie.name),
    blockedWafResponse.responseHeaders?.contentType ?? "",
  ].join(" ");

  return {
    corroboratorCode: /kasada|x-kpsdk/i.test(responseEvidenceText)
      ? "network_kasada_challenge"
      : "network_datadome_challenge",
    evidenceText: `First-party document response returned HTTP ${blockedWafResponse.status} with WAF challenge evidence.`,
  };
}

function boundedScanNoGoText(value: string | null | undefined) {
  return value ? value.replace(/\s+/g, " ").trim().slice(0, 360) : null;
}

function preConsentPartialIsScreenshotOnly(errors: string[]) {
  return errors.length > 0 && errors.every((error) =>
    /screenshot fallback used|page\.screenshot/i.test(error)
  );
}

function isThirdPartyNetworkEvent(event: NetworkEvent) {
  return event.thirdParty === true || event.isThirdParty === true;
}

function uniqueStrings<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

export function shouldAttemptScreenshotOnlyFallback(
  result: Awaited<ReturnType<typeof preConsentRuntimeScanner>>,
  screenshotMode: RunScanInput["preConsentScreenshotMode"],
) {
  if (screenshotMode === "never") {
    return false;
  }
  const placeholderOnly =
    result.visualCapture.status === "placeholder" ||
    result.visualCapture.failureReason === "placeholder_used" ||
    (
      result.screenshots.length > 0 &&
      result.screenshots.every((screenshot) =>
        screenshot.captureMethod === "primary_placeholder" ||
        screenshot.captureMethod === "fresh_context_placeholder"
      )
    );
  if (result.visualCapture.status === "available" && !placeholderOnly) {
    return false;
  }
  if (result.screenshots.length > 0 && !placeholderOnly) {
    return false;
  }
  const retainedEvidence =
    result.networkEvents.length > 0 ||
    result.networkResponseEvents.length > 0 ||
    result.cookieEvents.length > 0 ||
    result.vendorResolverInputs.length > 0 ||
    result.collectionSurfaceObservations.length > 0;
  if (!retainedEvidence) {
    return false;
  }
  if (placeholderOnly) {
    return true;
  }
  const errorText = [
    result.visualCapture.failureReason,
    ...result.visualCapture.notes,
    ...(result.moduleRun.errors ?? []),
  ].join("\n");
  return /page_closed|target page, context or browser has been closed|page\.goto|page\/context closed/i.test(errorText);
}

export function boundedPreConsentVisualFallbackDeadlineMs(input: {
  absoluteDeadlineAtMs?: number;
  configuredDeadlineMs?: number;
  nowMs?: number;
}): number | null {
  const configuredDeadlineMs = Math.max(
    MIN_PRE_CONSENT_VISUAL_FALLBACK_START_BUDGET_MS,
    input.configuredDeadlineMs ?? 15_000,
  );
  if (input.absoluteDeadlineAtMs === undefined) {
    return configuredDeadlineMs;
  }
  const remainingMs = input.absoluteDeadlineAtMs - (input.nowMs ?? Date.now());
  if (remainingMs < MIN_PRE_CONSENT_VISUAL_FALLBACK_START_BUDGET_MS) {
    return null;
  }
  return Math.min(configuredDeadlineMs, remainingMs);
}

export function shouldAttemptIncompleteConsentVisualFallback(
  result: Awaited<ReturnType<typeof preConsentRuntimeScanner>>,
  screenshotMode: RunScanInput["preConsentScreenshotMode"],
) {
  if (screenshotMode === "never") {
    return false;
  }
  if (hasCompleteRetainedConsentProofPacket(result)) {
    return false;
  }
  const typedInspectionIncomplete = consentInspectionNeedsRecovery({
    moduleStatus: result.moduleRun.status,
    observations: result.consentUiObservations,
  });
  if (typedInspectionIncomplete) {
    return true;
  }
  if (result.screenshots.length === 0) {
    return false;
  }
  const errorText = [
    result.visualCapture.failureReason,
    ...result.visualCapture.notes,
    ...(result.moduleRun.errors ?? []),
  ].join("\n");
  const observationText = result.consentUiObservations
    .flatMap((observation) => observation.basis)
    .join("\n");
  const inspectionIncomplete = /consent[_ -]ui[_ -]capture[_ -]timed[_ -]out|consent[_ -]surface[_ -]inspection|settled[_ -]inventory[_ -]missing|pre[_ -]consent[_ -]runtime[_ -]partial/i.test(
    `${errorText}\n${observationText}`,
  );
  return inspectionIncomplete;
}

export function hasCompleteRetainedConsentProofPacket(
  result: Pick<
    Awaited<ReturnType<typeof preConsentRuntimeScanner>>,
    "consentUiObservations" | "screenshots"
  >,
): boolean {
  const representativeScreenshots = result.screenshots.filter((screenshot) =>
    !screenshot.captureMethod?.includes("placeholder")
  );
  if (representativeScreenshots.length === 0) {
    return false;
  }

  return result.consentUiObservations.some((observation) => {
    const completedChannels = observation.captureDiagnostics?.completedChannels ?? [];
    const timedOutChannels = observation.captureDiagnostics?.timedOutChannels ?? [];
    const failedChannels = observation.captureDiagnostics?.failedChannels ?? [];
    const coherentInventory = observation.inventoryOutcome === "complete_with_controls"
      ? observation.captureStatus === "observed" && observation.likelyPresent && observation.controls.length > 0
      : observation.inventoryOutcome === "complete_empty" &&
        observation.captureStatus === "no_evidence" &&
        !observation.likelyPresent &&
        observation.controls.length === 0;
    const pairedSameSessionCompletion = observation.basis.some((basis) =>
      basis === "inventory:paired_settled_frame_completed" ||
      basis === "recapture:paired_settled_frame_typed_controls"
    );
    const completeTypedPacket =
      coherentInventory &&
      observation.layerInspected === "first_layer" &&
      completedChannels.includes("dom_inventory") &&
      completedChannels.includes("geometry") &&
      timedOutChannels.length === 0 &&
      failedChannels.length === 0 &&
      (observation.inventoryDiagnostics?.blockingInaccessibleFrameCount ?? 0) === 0 &&
      !observation.basis.some((basis) =>
        basis === "geometry_capture_unavailable" ||
        basis === "geometry:incomplete_not_authoritative" ||
        basis === "geometry:document_mismatch_not_authoritative"
      );
    if (!completeTypedPacket) {
      return false;
    }

    return isVerifiedTerminalConsentPacket(observation, {
      representativeScreenshots,
    }) || (
      pairedSameSessionCompletion &&
      representativeScreenshots.some((screenshot) =>
        retainedScreenshotMatchesConsentObservation(screenshot, observation)
      )
    );
  });
}

function retainedScreenshotMatchesConsentObservation(
  screenshot: ScreenshotArtifact,
  observation: ConsentUiObservation,
): boolean {
  const observationToken = observation.documentIdentity?.token;
  const screenshotToken = screenshot.documentIdentity?.token;
  if (observationToken || screenshotToken) {
    return Boolean(observationToken && screenshotToken && observationToken === screenshotToken);
  }
  if (!observation.documentUrl) {
    return false;
  }
  return normalizedDocumentIdentity(observation.documentUrl) === normalizedDocumentIdentity(screenshot.url);
}

export function consentInspectionNeedsRecovery(input: {
  moduleStatus: CanonicalEvidenceBundle["modulesRun"][number]["status"];
  observations: ConsentUiObservation[];
}): boolean {
  const verifiedRecoveryCompleted = input.observations.some((observation) =>
    isVerifiedTerminalConsentPacket(observation)
  );
  if (verifiedRecoveryCompleted) {
    return false;
  }
  return ["partial", "failed", "skipped_budget", "not_testable"].includes(input.moduleStatus) ||
    input.observations.length === 0 ||
    input.observations.some((observation) =>
    observation.captureStatus === "incomplete" ||
    (observation.captureDiagnostics?.timedOutChannels.length ?? 0) > 0 ||
    (observation.captureDiagnostics?.failedChannels.length ?? 0) > 0 ||
    observation.basis.some((basis) =>
      /geometry_capture_unavailable|geometry:incomplete_not_authoritative|runtime_partial/i.test(basis)
    )
  );
}

export async function capturePreConsentScreenshotOnlyFallback(input: {
  artifactWriter: ArtifactWriter;
  fallbackDeadlineMs?: number;
  navigationUrl?: string;
  navigationUrls?: string[];
  normalizedUrl: string;
  scanStartedAtMs: number;
  screenshotTimeoutMs?: number;
  captureMode?: "viewport" | "full_page";
  recoverConsentEvidence?: boolean;
  retainedScreenshotArtifactRef?: string;
}): Promise<{
  screenshot?: ScreenshotArtifact;
  visualCapture: VisualCaptureSummary;
  consentUiObservation?: ConsentUiObservation;
  domSnapshot?: DomSnapshotArtifact;
  consentRecoveryCompleted: boolean;
}> {
  const screenshotPath = input.artifactWriter.artifactPath("screenshot-pre-consent.png");
  const fallbackStartedAtMs = Date.now();
  const timeoutForStep = (maxMs: number, minMs = 1) => {
    if (input.fallbackDeadlineMs === undefined) {
      return maxMs;
    }
    const remainingMs = input.fallbackDeadlineMs - (Date.now() - fallbackStartedAtMs);
    if (remainingMs <= 0) {
      throw new Error(`Pre-consent visual fallback deadline exhausted after ${Date.now() - fallbackStartedAtMs}ms.`);
    }
    return Math.max(minMs, Math.min(maxMs, remainingMs));
  };
  const optionalTimeoutForStep = (maxMs: number, minMs = 1) => {
    try {
      return timeoutForStep(maxMs, minMs);
    } catch {
      return null;
    }
  };
  const browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
  const fallbackDeadlineTimer = input.fallbackDeadlineMs === undefined
    ? undefined
    : setTimeout(() => {
      void browser.close().catch(() => undefined);
    }, input.fallbackDeadlineMs);
  try {
    const context = await browser.newContext(chromiumContextOptions());
    try {
      if (input.recoverConsentEvidence) {
        await context.route("**/*", async (route) => {
          if (await maybeFulfillHeavyResource(route)) return;
          await route.continue();
        });
      }
      await installWebBotAuthRoute(context);
      const page = await context.newPage();
      const navigationUrls = input.navigationUrls?.length
        ? input.navigationUrls
        : [input.navigationUrl ?? input.normalizedUrl];
      let navigationError: unknown;
      let navigationRecovered = false;
      let navigationHttpStatus: number | undefined;
      for (const [index, navigationUrl] of navigationUrls.entries()) {
        try {
          const response = await page.goto(navigationUrl, {
            waitUntil: "commit",
            timeout: timeoutForStep(Math.max(2_000, Math.min(input.screenshotTimeoutMs ?? 5_000, 15_000))),
          });
          navigationHttpStatus = response?.status();
          navigationRecovered = index > 0;
          navigationError = undefined;
          break;
        } catch (error) {
          navigationError = error;
          if (!isNavigationTransportFailure(error)) throw error;
        }
      }
      if (navigationError) throw navigationError;
      const domContentLoadedTimeoutMs = optionalTimeoutForStep(1_500);
      if (domContentLoadedTimeoutMs !== null) {
        await page.waitForLoadState("domcontentloaded", { timeout: domContentLoadedTimeoutMs }).catch(() => undefined);
      }
      const networkIdleTimeoutMs = optionalTimeoutForStep(input.recoverConsentEvidence ? 500 : 1_000);
      if (networkIdleTimeoutMs !== null) {
        await page.waitForLoadState("networkidle", { timeout: networkIdleTimeoutMs }).catch(() => undefined);
      }
      const captureMode = input.captureMode ?? "viewport";
      const viewportSettleTimeoutMs = captureMode === "viewport"
        ? optionalTimeoutForStep(350, 100)
        : null;
      if (viewportSettleTimeoutMs !== null) {
        await page.waitForTimeout(viewportSettleTimeoutMs).catch(() => undefined);
      }
      if (captureMode === "full_page" && !input.recoverConsentEvidence) {
        const passiveSettleTimeoutMs = optionalTimeoutForStep(3_000, 250);
        if (passiveSettleTimeoutMs !== null) {
          await page.waitForTimeout(passiveSettleTimeoutMs).catch(() => undefined);
        }
      }
      const recoverySettleTimeoutMs = input.recoverConsentEvidence
        ? optionalTimeoutForStep(500, 100)
        : null;
      if (recoverySettleTimeoutMs !== null) {
        await page.waitForTimeout(recoverySettleTimeoutMs).catch(() => undefined);
      }
      let screenshot: ScreenshotArtifact | undefined;
      if (!input.recoverConsentEvidence) {
        await page.screenshot({
          fullPage: captureMode === "full_page",
          path: screenshotPath,
          timeout: timeoutForStep(Math.max(1_000, Math.min(input.screenshotTimeoutMs ?? 5_000, 15_000))),
        });
        screenshot = {
          artifactId: captureMode === "full_page" ? "screenshot_pre_consent_full_page" : "screenshot_pre_consent",
          capturedAtMs: Date.now() - input.scanStartedAtMs,
          captureMethod: captureMode === "full_page" ? "fresh_context_full_page" : "independent_visual_fallback_viewport",
          path: screenshotPath,
          url: page.url(),
          pagePhase: captureMode === "full_page" ? "network_idle" : "dom_content_loaded",
          consentStateAtTime: "pre_consent",
        };
      }
      const domTextTimeoutMs = optionalTimeoutForStep(input.recoverConsentEvidence ? 600 : 2_000);
      const domText = domTextTimeoutMs === null
        ? ""
        : await page.locator("body").innerText({ timeout: domTextTimeoutMs }).catch(() => "");
      const domArtifactId = input.recoverConsentEvidence
        ? "dom_text_pre_consent_recovery"
        : "dom_text_pre_consent";
      const domPath = domText
        ? await input.artifactWriter.writeTextArtifact(
          input.recoverConsentEvidence
            ? "dom-text-pre-consent-recovery.txt"
            : "dom-text-pre-consent.txt",
          domText.slice(0, 100_000),
        )
        : undefined;
      const documentLanguage = await readDeclaredDocumentLanguage(page);
      const consentUiTimeoutMs = optionalTimeoutForStep(input.recoverConsentEvidence ? 1_250 : 1_500);
      let consentUiObservation = consentUiTimeoutMs === null
        ? undefined
        : input.recoverConsentEvidence
          ? await readRapidFirstLayerConsentUiObservation(
            page,
            input.scanStartedAtMs,
            consentUiTimeoutMs,
            "retry",
          ).catch(() => undefined)
          : await detectConsentUi(
            page,
            input.scanStartedAtMs,
            consentUiTimeoutMs,
            captureMode === "full_page"
              ? {
                allowFullDocumentCmpControls: true,
                waitForControlsOnTextOnlySurface: true,
              }
              : undefined,
          ).catch(() => undefined);
      let consentRecoveryCompleted = false;
      if (input.recoverConsentEvidence && consentUiObservation) {
        const geometryTimeoutMs = optionalTimeoutForStep(1_250, 250);
        if (geometryTimeoutMs !== null) {
          const access = await collectConsentGeometryPageAccess(page, navigationHttpStatus, {
            frameTextTimeoutMs: Math.min(250, geometryTimeoutMs),
            supplementalBodyText: domText,
          });
          const geometry = await captureConsentControlGeometry(page, {
            screenshotArtifactRef: input.retainedScreenshotArtifactRef,
            timeoutMs: geometryTimeoutMs,
          });
          const geometryDocumentMatches = normalizedDocumentIdentity(geometry.pageUrl) === normalizedDocumentIdentity(page.url());
          const geometryComplete =
            access.status === "loaded" &&
            geometryDocumentMatches &&
            geometry.pageUrl !== "about:blank" &&
            geometry.viewport.width > 0 &&
            geometry.viewport.height > 0 &&
            geometry.summary.confidence > 0;
          const geometryArtifactPath = await input.artifactWriter.writeJsonArtifact(
            geometryComplete
              ? "ConsentControlGeometryEvidence.json"
              : "ConsentControlGeometryRecoveryDiagnostic.json",
            {
              ...geometry,
              observedAtMs: Date.now() - input.scanStartedAtMs,
              access,
              egress: buildConsentGeometryEgressDiagnostic(),
              artifactOnly: true,
              productionFindingIntegration: false,
            },
          );
          const geometryObservation = geometryComplete
            ? consentUiObservationFromConfirmedGeometryControls({
              artifactPath: geometryArtifactPath,
              geometry,
              scanStartedAtMs: input.scanStartedAtMs,
              text: domText,
            })
            : null;
          if (geometryObservation) {
            consentUiObservation = reconcileConsentUiRecapture({
              current: consentUiObservation,
              candidate: geometryObservation,
              strongerBasis: "geometry:confirmed_first_layer_controls",
              completedWithoutControlsBasis: "geometry:no_visible_first_layer_controls",
            }).observation;
          }
          const inventoryComplete = consentUiObservation.captureStatus !== "incomplete" &&
            consentUiObservation.captureDiagnostics?.completedChannels.includes("dom_inventory") === true;
          consentRecoveryCompleted = inventoryComplete && geometryComplete;
          if (consentRecoveryCompleted) {
            consentUiObservation = markConsentRecoveryCompleted(consentUiObservation, geometryArtifactPath);
          }
        }
      }
      if (consentUiObservation && domPath) {
        consentUiObservation.evidenceRefs = [
          ...consentUiObservation.evidenceRefs,
          { refId: domArtifactId, artifactId: domArtifactId, path: domPath },
        ];
      }
      return {
        screenshot,
        visualCapture: {
          status: screenshot ? "available" : "unavailable",
          ...(screenshot ? {} : { failureReason: "skipped_by_mode" as const }),
          captureMethod: captureMode === "full_page" ? "fresh_context_full_page" : "independent_visual_fallback_viewport",
          artifactRefs: screenshot ? [{
            artifactId: captureMode === "full_page" ? "screenshot_pre_consent_full_page" : "screenshot_pre_consent",
            artifactType: "screenshot",
            path: screenshotPath,
            label: "Pre-consent screenshot",
            sensitivity: "safe",
            redactionStatus: "not_needed",
            relatedEventIds: [],
          }] : [],
          notes: [
            ...(navigationRecovered
              ? [`Independent visual fallback recovered through bounded navigation alternative ${page.url()}.`]
              : []),
            input.recoverConsentEvidence
              ? consentRecoveryCompleted
                ? "Typed DOM-inventory and geometry evidence retained by an independent bounded consent recovery after incomplete primary inspection."
                : "Independent bounded consent recovery remained incomplete; retained diagnostics did not upgrade canonical consent coverage."
              : captureMode === "full_page"
              ? "Full-page screenshot and bounded consent-surface evidence retained by an independent visual fallback after incomplete primary consent inspection."
              : consentUiObservation
                ? "Screenshot and bounded consent-surface evidence retained by an independent visual fallback after the primary runtime page/context closed."
                : "Screenshot retained by an independent screenshot-only fallback after the primary runtime page/context closed.",
          ],
        },
        consentUiObservation,
        domSnapshot: domPath
          ? {
            artifactId: domArtifactId,
            capturedAtMs: Date.now() - input.scanStartedAtMs,
            path: domPath,
            url: page.url(),
            ...(documentLanguage ? { documentLanguage } : {}),
            textExcerpt: domText.slice(0, 2_000),
            pagePhase: "dom_content_loaded",
            consentStateAtTime: "pre_consent",
          }
          : undefined,
        consentRecoveryCompleted,
      };
    } finally {
      await context.close().catch(() => undefined);
    }
  } finally {
    if (fallbackDeadlineTimer) {
      clearTimeout(fallbackDeadlineTimer);
    }
    await browser.close().catch(() => undefined);
  }
}

function normalizedDocumentIdentity(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

function markConsentRecoveryCompleted(
  observation: ConsentUiObservation,
  geometryArtifactPath: string,
): ConsentUiObservation {
  const completedChannels = uniqueStrings([
    ...(observation.captureDiagnostics?.completedChannels ?? []),
    "dom_inventory",
    "geometry",
  ]) as NonNullable<ConsentUiObservation["captureDiagnostics"]>["completedChannels"];
  return {
    ...observation,
    captureStatus: observation.likelyPresent || observation.controls.length > 0 ? "observed" : "no_evidence",
    inventoryOutcome: observation.controls.length > 0 ? "complete_with_controls" : "complete_empty",
    captureDiagnostics: {
      completedChannels,
      timedOutChannels: (observation.captureDiagnostics?.timedOutChannels ?? [])
        .filter((channel) => !completedChannels.includes(channel)),
      failedChannels: (observation.captureDiagnostics?.failedChannels ?? [])
        .filter((channel) => !completedChannels.includes(channel)),
    },
    basis: uniqueStrings([
      ...observation.basis,
      "settled_control_inventory_completed",
      "geometry:captured",
      "recovery:independent_consent_capture_completed",
    ]),
    evidenceRefs: [
      ...observation.evidenceRefs,
      {
        artifactId: "consent_control_geometry",
        eventType: "consent_control_geometry",
        label: "Bounded independent consent-control geometry evidence",
        path: geometryArtifactPath,
        refId: "consent_control_geometry_evidence",
      },
    ],
  };
}

function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  if (!parsed.pathname) {
    parsed.pathname = "/";
  }
  parsed.hash = "";
  return parsed.toString();
}

function normalizeSeedUrls(urls: string[]): string[] {
  return urls
    .map((url) => {
      try {
        return normalizeUrl(url);
      } catch {
        return undefined;
      }
    })
    .filter((url): url is string => Boolean(url));
}

function safeHostname(url: string): string {
  return new URL(url).hostname.replace(/[^a-z0-9.-]+/gi, "_");
}

function privacyControlUrlsFromPolicySurfaces(observations: PolicySurfaceObservation[]): string[] {
  return uniqueStrings(observations
    .filter((observation) =>
      ["your_privacy_choices", "do_not_sell_or_share", "consent_preferences", "cookie_settings"].includes(observation.surfaceType) &&
      observation.status !== "failed" &&
      observation.status !== "not_observed" &&
      Boolean(observation.normalizedUrl ?? observation.url)
    )
    .sort((left, right) => privacySurfacePriority(left.surfaceType) - privacySurfacePriority(right.surfaceType) ||
      (right.confidence ?? 0) - (left.confidence ?? 0))
    .map((observation) => observation.normalizedUrl ?? observation.url))
    .slice(0, 3);
}

function privacySurfacePriority(surfaceType: PolicySurfaceObservation["surfaceType"]): number {
  switch (surfaceType) {
    case "your_privacy_choices":
      return 0;
    case "do_not_sell_or_share":
      return 1;
    case "consent_preferences":
      return 2;
    case "cookie_settings":
      return 3;
    default:
      return 10;
  }
}

async function settlePolicySurfaceBeforeDeadline<T>(
  promise: Promise<T>,
  deadlineMs: number,
): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), Math.max(0, deadlineMs))),
  ]);
}

export function policySurfaceRequiredForUnboundedOutput(input: {
  captureReplay: boolean;
  earlyConfirmedNoGo: boolean;
  plannedParallel: boolean;
  policySurfaceEnabled: boolean;
}): boolean {
  return input.policySurfaceEnabled &&
    !input.earlyConfirmedNoGo;
}

function policyPlanningStatus(
  policySurfaceEnabled: boolean,
  policySurfaceSettled: { status: "fulfilled" | "rejected" } | undefined,
): "policy_surface_ready_for_planning" | "policy_surface_not_ready_for_planning" | "policy_surface_unavailable" {
  if (!policySurfaceEnabled) {
    return "policy_surface_unavailable";
  }
  return policySurfaceSettled?.status === "fulfilled"
    ? "policy_surface_ready_for_planning"
    : "policy_surface_not_ready_for_planning";
}

function nowIso(startedAtMs: number): string {
  return new Date(startedAtMs).toISOString();
}

async function runConsentFlowWithHeadedRetry(
  input: ConsentFlowRuntimeInput,
): Promise<ConsentFlowRuntimeResult> {
  const { consentFlowRuntimeScanner } = await import("./scanners/consent-flow-runtime-scanner.js");
  const firstAttempt = await consentFlowRuntimeScanner(input);
  if (!shouldRetryConsentFlowWithHeaded(firstAttempt)) {
    return firstAttempt;
  }

  const firstAttemptErrors = firstAttempt.moduleRun.errors ?? [];
  const headedRetryResult = await consentFlowRuntimeScanner({
    ...input,
    browserMode: "headed",
  });
  return {
    ...headedRetryResult,
    moduleRun: {
      ...headedRetryResult.moduleRun,
      errors: [
        `Headed local fallback used after headless consent-flow failure: ${firstAttemptErrors[0] ?? "unknown failure"}`,
        ...(headedRetryResult.moduleRun.errors ?? []),
      ],
    },
  };
}

function shouldRetryPreConsentWithHeaded(
  result: Awaited<ReturnType<typeof preConsentRuntimeScanner>>,
) {
  if (result.moduleRun.status !== "failed") {
    return false;
  }
  if (!isLocalHeadedFallbackEnabled()) {
    return false;
  }
  const errorText = (result.moduleRun.errors ?? []).join("\n");
  return /ERR_HTTP2_PROTOCOL_ERROR|ERR_QUIC_PROTOCOL_ERROR|net::ERR_|Timeout \d+ms exceeded|page\.goto/i.test(errorText);
}

function shouldRetryConsentFlowWithHeaded(
  result: ConsentFlowRuntimeResult,
) {
  if (result.moduleRun.status !== "failed") {
    return false;
  }
  if (!isLocalHeadedFallbackEnabled()) {
    return false;
  }
  const errorText = (result.moduleRun.errors ?? []).join("\n");
  return /ERR_HTTP2_PROTOCOL_ERROR|ERR_QUIC_PROTOCOL_ERROR|net::ERR_|Timeout \d+ms exceeded|page\.goto/i.test(errorText);
}

function isLocalHeadedFallbackEnabled() {
  const explicit = process.env.CERTSCORE_V2_HEADED_FALLBACK?.trim();
  if (explicit === "0" || explicit === "false") {
    return false;
  }
  if (explicit === "1" || explicit === "true") {
    return true;
  }
  return process.env.NODE_ENV !== "production" && process.platform === "darwin" && !process.env.CI;
}

function isCaptureReplayHeadedRetryEnabled() {
  const explicit = process.env.CERTSCORE_V2_CAPTURE_REPLAY_HEADED_RETRY?.trim();
  return explicit === "1" || explicit === "true";
}

export function isLateConsentGeometryShadowEnabled() {
  const explicit = process.env.CERTSCORE_CONSENT_LATE_GEOMETRY_SHADOW_ENABLED?.trim().toLowerCase();
  return explicit === "1" || explicit === "true";
}

export async function settlePreConsentRuntimeWithinDeadline(input: {
  deadlineMs: number;
  getLatestLifecycleCheckpoint?: () => {
    atMs: number;
    label: string;
    status: "started" | "completed";
  } | undefined;
  graceMs?: number;
  run: (softDeadlineSignal: AbortSignal) => Promise<PreConsentRuntimeScannerResult>;
  startedAtMs: number;
}): Promise<PreConsentRuntimeScannerResult> {
  const controller = new AbortController();
  const deadlineMessage =
    `Pre-consent runtime reached its ${input.deadlineMs}ms module budget; retained bounded partial evidence.`;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  const deadlinePromise = new Promise<"deadline">((resolve) => {
    deadlineTimer = setTimeout(() => {
      controller.abort(new Error(deadlineMessage));
      resolve("deadline");
    }, input.deadlineMs);
  });
  const workPromise = Promise.resolve().then(() => input.run(controller.signal));

  try {
    const initialResult = await Promise.race([
      workPromise.then((value) => ({ kind: "result" as const, value })),
      deadlinePromise.then(() => ({ kind: "deadline" as const })),
    ]);
    if (initialResult.kind === "result") {
      return initialResult.value;
    }

    const graceMs = Math.max(0, input.graceMs ?? PRE_CONSENT_DEADLINE_SETTLE_GRACE_MS);
    const graceResult = await Promise.race([
      workPromise.then((value) => ({ kind: "result" as const, value })),
      new Promise<{ kind: "fallback" }>((resolve) => {
        graceTimer = setTimeout(() => resolve({ kind: "fallback" }), graceMs);
      }),
    ]);
    if (graceResult.kind === "result") {
      return graceResult.value;
    }

    return deadlineLimitedPreConsentResult({
      completedAtMs: Date.now(),
      deadlineMs: input.deadlineMs,
      latestLifecycleCheckpoint: input.getLatestLifecycleCheckpoint?.(),
      startedAtMs: input.startedAtMs,
    });
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (graceTimer) clearTimeout(graceTimer);
  }
}

function deadlineLimitedPreConsentResult(input: {
  completedAtMs: number;
  deadlineMs: number;
  latestLifecycleCheckpoint?: {
    atMs: number;
    label: string;
    status: "started" | "completed";
  };
  startedAtMs: number;
}): PreConsentRuntimeScannerResult {
  const startedAt = nowIso(input.startedAtMs);
  const completedAt = nowIso(input.completedAtMs);
  const checkpointDetail = input.latestLifecycleCheckpoint
    ? ` Last lifecycle checkpoint: ${input.latestLifecycleCheckpoint.label}:${input.latestLifecycleCheckpoint.status}.`
    : " No lifecycle checkpoint was retained.";
  const limitation =
    `Pre-consent runtime did not settle after its ${input.deadlineMs}ms module budget; no pre-consent evidence was retained.${checkpointDetail}`;
  return {
    ...emptyPreConsentResult(startedAt),
    moduleRun: {
      moduleName: "preConsentRuntimeScanner",
      status: "skipped_budget",
      startedAt,
      completedAt,
      durationMs: Math.max(0, input.completedAtMs - input.startedAtMs),
      timingBreakdown: input.latestLifecycleCheckpoint
        ? [{
            label: "deadline lifecycle checkpoint",
            durationMs: Math.max(0, input.latestLifecycleCheckpoint.atMs - input.startedAtMs),
            detail: `${input.latestLifecycleCheckpoint.label}:${input.latestLifecycleCheckpoint.status}`,
          }]
        : [],
      evidenceRefs: [],
      errors: [limitation],
    },
    visualCapture: {
      status: "unavailable",
      failureReason: "unknown",
      artifactRefs: [],
      notes: [limitation],
    },
  };
}

function emptyPreConsentResult(startedAt: string): PreConsentRuntimeScannerResult {
  return {
    moduleRun: {
      moduleName: "preConsentRuntimeScanner",
      status: "not_run",
      startedAt,
      completedAt: startedAt,
      durationMs: 0,
      evidenceRefs: [],
      errors: [],
    },
    runtimeTimeline: [],
    networkEvents: [],
    networkResponseEvents: [],
    automatedAccessObservation: {
      status: "available",
      version: "automated-access-observation-v1",
      productionProjectable: false,
      webBotAuth: {
        enabled: false,
        signingOutcome: "disabled",
        signedHttpsRequestCount: 0,
        signedNavigationRequestCount: 0,
      },
      targetInfrastructure: {
        cloudflareObserved: false,
        providerCandidates: [],
        signalCodes: [],
      },
    },
    cookieEvents: [],
    cookieSnapshots: [],
    storageSnapshots: [],
    scriptEvents: [],
    iframeEvents: [],
    consentUiObservations: [],
    collectionSurfaceObservations: [],
    cmpRuntimeObservations: [],
    transportSecurityObservations: [],
    screenshots: [],
    visualCapture: {
      status: "unavailable",
      failureReason: "skipped_by_mode",
      artifactRefs: [],
      notes: ["Pre-consent runtime scanner was not run."],
    },
    domSnapshots: [],
    artifactRefs: [],
    vendorResolverInputs: [],
    renderedPolicyLinks: [],
  };
}
