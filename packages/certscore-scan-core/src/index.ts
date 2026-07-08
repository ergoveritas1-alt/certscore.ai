import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import {
  type CanonicalEvidenceBundle,
  type CmpRuntimeObservation,
  type CookieEvent,
  type ConsentUiObservation,
  type CookieSnapshot,
  type DomSnapshotArtifact,
  type IframeEvent,
  type NetworkEvent,
  type NetworkResponseEvent,
  type PolicySurfaceObservation,
  type RuntimeCoverageSummary,
  type RuntimeEvidenceEvent,
  type ScanProfile,
  type ScanNoGoAssessment,
  type ScreenshotArtifact,
  type ConsentFlowScenario,
  type StorageSnapshot,
  type VisualAccessReview,
  type VisualCaptureSummary,
  SCHEMA_VERSION,
  canonicalEvidenceBundleSchema,
} from "@certscore/contracts";
import { resolveVendorObservations } from "@certscore/vendor-resolver";
import { chromium, type Browser } from "playwright";
import { createArtifactWriter, type ArtifactWriter } from "./artifact-writer.js";
import {
  buildObservedJourneys,
  classifyCookieEvents,
  summarizeObservedJourneys,
} from "./journey-builder.js";
import { createOpenAiNanoPolicyAssistProviderFromEnv } from "./nano-policy-assist-provider.js";
import { getScanProfile } from "./profiles.js";
import { consentFlowRuntimeScannerPlaceholder, policySurfaceScannerPlaceholder } from "./scanners/placeholders.js";
import { detectConsentUi, preConsentRuntimeScanner, type PreConsentRuntimeScannerResult } from "./scanners/pre-consent-runtime-scanner.js";
import { policySurfaceScanner } from "./scanners/policy-surface-scanner.js";
import { chromiumContextOptions, chromiumLaunchOptions } from "./playwright-runtime.js";

type ConsentFlowRuntimeScanner = typeof import("./scanners/consent-flow-runtime-scanner.js").consentFlowRuntimeScanner;
type ConsentFlowRuntimeInput = Parameters<ConsentFlowRuntimeScanner>[0];
type ConsentFlowRuntimeResult = Awaited<ReturnType<ConsentFlowRuntimeScanner>>;
const MAX_MODULE_TIMING_BREAKDOWN_ENTRIES = 40;

export {
  chromiumLaunchArgs,
  chromiumContextOptions,
  chromiumLaunchOptions,
  chromiumProxyOptions,
  isAwsLambdaRuntime,
  lambdaChromiumSingleProcessEnabled,
} from "./playwright-runtime.js";

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
  preConsentScreenshotMode?: "always" | "selective" | "never";
  preConsentScreenshotTimeoutMs?: number;
  preConsentVisualFallbackDeadlineMs?: number;
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

export async function runScan(input: RunScanInput): Promise<CanonicalEvidenceBundle> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const scanProfile = getScanProfile(input.profile ?? "tiny");
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

  const preConsentEnabled = scanProfile.enabledModules.includes("preConsentRuntimeScanner");
  const policySurfaceEnabled = scanProfile.enabledModules.includes("policySurfaceScanner");
  const profileConsentFlowEnabled = scanProfile.enabledModules.includes("consentFlowRuntimeScanner");
  const consentFlowEnabled = false;
  const plannedParallel = input.scenarioPlanningMode === "planned_parallel";
  const leanPreConsent = input.scenarioResourceMode === "lean" ||
    input.scenarioResourceMode === "cmp_safe" ||
    input.captureReplay === true;
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
  });
  const preConsentResultPromise = preConsentEnabled
    ? preConsentRuntimeScanner({
      url: input.url,
      normalizedUrl,
      scanStartedAtMs: startedAtMs,
      internalBudgetMs: scanProfile.internalBudgetMs,
      artifactWriter,
      browser: sharedBrowser,
      stubHeavyResources: input.captureReplay,
      screenshotCaptureMode: leanPreConsent ? "viewport_first" : "full_page_first",
      screenshotMode: input.preConsentScreenshotMode ?? (leanPreConsent ? "selective" : "always"),
      screenshotTimeoutMs: input.preConsentScreenshotTimeoutMs,
      waitMode: leanPreConsent ? "fast" : "full",
    })
    : Promise.resolve(emptyPreConsentResult(nowIso(startedAtMs)));
  const policySurfaceResultPromise = policySurfaceEnabled
    ? policySurfaceScanner({
      url: input.url,
      normalizedUrl,
      scanStartedAtMs: startedAtMs,
      internalBudgetMs: scanProfile.internalBudgetMs,
      artifactWriter,
      browser: sharedBrowser,
      nanoAssistProvider: nanoPolicyAssistProvider,
      discoveryMode: input.scenarioPlanningMode === "planned_parallel" ? "fast" : "full",
    }).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    )
    : Promise.resolve(undefined);

  let preConsentResult: Awaited<typeof preConsentResultPromise>;
  try {
    await phaseRecorder.record("pre_consent_runtime", preConsentEnabled ? "started" : "skipped");
    preConsentResult = await preConsentResultPromise;
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
        browserMode: "headed",
        stubHeavyResources: input.captureReplay,
        screenshotCaptureMode: leanPreConsent ? "viewport_first" : "full_page_first",
        screenshotMode: input.preConsentScreenshotMode ?? (leanPreConsent ? "selective" : "always"),
        screenshotTimeoutMs: input.preConsentScreenshotTimeoutMs,
        waitMode: leanPreConsent ? "fast" : "full",
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
  if (preConsentEnabled && shouldAttemptScreenshotOnlyFallback(preConsentResult, input.preConsentScreenshotMode)) {
    await phaseRecorder.record("pre_consent_screenshot_only_fallback", "started", {
      reason: preConsentResult.visualCapture.failureReason ?? "missing_pre_consent_screenshot",
    });
    const screenshotFallback = await capturePreConsentScreenshotOnlyFallback({
      artifactWriter,
      normalizedUrl,
      scanStartedAtMs: startedAtMs,
      fallbackDeadlineMs: input.preConsentVisualFallbackDeadlineMs,
      screenshotTimeoutMs: input.preConsentScreenshotTimeoutMs,
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return {
        error: message,
      };
    });
    if ("screenshot" in screenshotFallback) {
      const fallbackConsentUiObservations = screenshotFallback.consentUiObservation
        ? [screenshotFallback.consentUiObservation]
        : [];
      const fallbackDomSnapshots = screenshotFallback.domSnapshot ? [screenshotFallback.domSnapshot] : [];
      preConsentResult = {
        ...preConsentResult,
        screenshots: [screenshotFallback.screenshot],
        visualCapture: screenshotFallback.visualCapture,
        consentUiObservations: [
          ...preConsentResult.consentUiObservations,
          ...fallbackConsentUiObservations,
        ],
        domSnapshots: [
          ...preConsentResult.domSnapshots,
          ...fallbackDomSnapshots,
        ],
        moduleRun: {
          ...preConsentResult.moduleRun,
          errors: [
            ...(preConsentResult.moduleRun.errors ?? []),
            fallbackConsentUiObservations.length > 0
              ? "Visual fallback retained a pre-consent screenshot and bounded consent-surface evidence after the primary runtime page/context closed."
              : "Screenshot-only visual fallback retained a pre-consent screenshot after the primary runtime page/context closed.",
          ],
        },
      };
      await phaseRecorder.record("pre_consent_screenshot_only_fallback", "completed", {
        artifactId: screenshotFallback.screenshot.artifactId,
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
      reason: preConsentEnabled ? "not_needed" : "pre_consent_runtime_disabled",
    });
  }
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
  if (!policySurfaceSettled && plannedParallel && policySurfaceEnabled) {
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
  const policyRequiredForOutput = policySurfaceEnabled && (!plannedParallel || !consentFlowEnabled || input.captureReplay);
  await phaseRecorder.record("policy_surface_for_output", policyRequiredForOutput ? "started" : "skipped");
  if (policyRequiredForOutput) {
    policySurfaceSettled ??= await policySurfaceResultPromise;
  } else if (policySurfaceEnabled) {
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
  const policySurfaceResult = policySurfaceSettled?.value;
  if (policySurfaceResult) {
    await phaseRecorder.record("policy_surface_for_output", "completed", {
      durationMs: policySurfaceResult.moduleRun.durationMs,
      status: policySurfaceResult.moduleRun.status,
    });
  }

  const vendorResolverStartedAtMs = Date.now();
  const vendorResolverStartedAt = new Date(vendorResolverStartedAtMs).toISOString();
  await phaseRecorder.record("vendor_resolver", "started");
  const normalizedVendorObservations = resolveVendorObservations(
    [
      ...preConsentResult.vendorResolverInputs,
      ...(consentFlowResult?.vendorResolverInputs ?? []),
    ],
  );
  const vendorResolverCompletedAtMs = Date.now();
  const vendorResolverModuleRun: CanonicalEvidenceBundle["modulesRun"][number] = {
    moduleName: "vendorResolver",
    status: "completed",
    startedAt: vendorResolverStartedAt,
    completedAt: new Date(vendorResolverCompletedAtMs).toISOString(),
    durationMs: vendorResolverCompletedAtMs - vendorResolverStartedAtMs,
    evidenceRefs: [],
    errors: [],
  };
  await phaseRecorder.record("vendor_resolver", "completed", {
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
        ? [policySurfaceScannerPlaceholder(now, plannedParallel && consentFlowEnabled
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
  );
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
  const baseRuntimeCoverage = deriveRuntimeCoverageSummary({
    cookieEvents,
    cookieSnapshots,
    enabledModules: scanProfile.enabledModules,
  modulesRun,
  networkEvents,
  normalizedVendorObservations,
  observedJourneys,
  consentUiObservations: [
    ...preConsentResult.consentUiObservations,
    ...(consentFlowResult?.consentUiObservations ?? []),
  ],
  cmpRuntimeObservations: preConsentResult.cmpRuntimeObservations,
  });
  const scanNoGoEvidence = buildScanNoGoAssessment({
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
  });
  const runtimeCoverage = scanNoGoEvidence
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
          : "Initial-load evidence shows a bot/security challenge or access-block page, so runtime evidence should be treated as not reportable.",
      ]),
    }
    : baseRuntimeCoverage;

  const boundedModulesRun = modulesRun.map(boundModuleRunTimingBreakdown);
  const bundle = compactCanonicalEvidenceBundleForRetention(canonicalEvidenceBundleSchema.parse({
    scanId,
    url: input.url,
    normalizedUrl,
    startedAt,
    completedAt: new Date().toISOString(),
    region: input.region ?? "local",
    scanProfile,
    modulesRun: boundedModulesRun,
    runtimeTimeline: [
      ...preConsentResult.runtimeTimeline,
      ...(consentFlowResult?.runtimeTimeline ?? []),
    ],
    networkEvents,
    networkResponseEvents,
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
    visualCapture: preConsentResult.visualCapture,
    ...(scanNoGoEvidence
      ? {
        scanNoGoAssessment: scanNoGoEvidence.scanNoGoAssessment,
        scan_no_go_assessment: scanNoGoEvidence.scanNoGoAssessment,
        visualAccessReview: scanNoGoEvidence.visualAccessReview,
        visual_access_review: scanNoGoEvidence.visualAccessReview,
      }
      : {}),
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
  await phaseRecorder.record("scan_complete", "completed", {
    durationMs: Date.now() - startedAtMs,
  });
  return bundle;
  } finally {
    if (sharedBrowser) {
      await phaseRecorder.record("shared_browser_close", "started");
      await sharedBrowser.close().catch(() => undefined);
      await phaseRecorder.record("shared_browser_close", "completed");
    }
  }
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
    cookieEvents: bundle.cookieEvents.map(stripRuntimeEventDiagnostics),
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
    iframeEvents: retainPriorityEvents(compacted.iframeEvents, referencedEventIds, 40),
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
    iframeEvents: retainPriorityEvents(compacted.iframeEvents, referencedEventIds, 20),
    runtimeTimeline: retainPriorityEvents(compacted.runtimeTimeline, referencedEventIds, 40),
  });
}

function boundModuleRunTimingBreakdown(
  moduleRun: CanonicalEvidenceBundle["modulesRun"][number],
): CanonicalEvidenceBundle["modulesRun"][number] {
  const timingBreakdown = moduleRun.timingBreakdown;
  if (!timingBreakdown || timingBreakdown.length <= MAX_MODULE_TIMING_BREAKDOWN_ENTRIES) {
    return moduleRun;
  }
  const retainedCount = MAX_MODULE_TIMING_BREAKDOWN_ENTRIES - 1;
  const omitted = timingBreakdown.slice(retainedCount);
  const omittedDurationMs = omitted.reduce((total, entry) => total + entry.durationMs, 0);
  return {
    ...moduleRun,
    timingBreakdown: [
      ...timingBreakdown.slice(0, retainedCount),
      {
        label: "timing entries truncated",
        durationMs: omittedDurationMs,
        detail: `${omitted.length} timing breakdown entries omitted to keep the canonical bundle within the contract cap.`,
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
export { policySurfaceScanner } from "./scanners/policy-surface-scanner.js";
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
  /access to this site has been denied|access denied|access is temporarily restricted|forbidden|http\s*403|403\s*-\s*forbidden|unable to give you access to (?:our|this) site|unable to access (?:www\.)?[a-z0-9.-]+|security issue was automatically identified|security service to protect itself from online attacks|request blocked|bot protection|you(?:'|’)?ve been blocked|you have been blocked|cloudflare ray id|vercel security checkpoint|vercel sicherheitskontrollpunkt|checking your browser|wir überprüfen ihren browser|performing security verification|security check|protected by kasada|x-kpsdk|detected unusual (?:behaviour|activity)[^.]{0,180}(?:bot|browser|network)|resembles that of a bot|verif(?:y|ies|ying)[^.]{0,120}not a bot|\bzaraz wracamy\b/i;

const SCAN_NO_GO_SECURITY_CHALLENGE_REQUEST_PATTERN =
  /(?:^|\/)\.well-known\/vercel\/security\/|\/request-challenge(?:$|[?#])|challenge\.v2\.(?:min\.js|wasm)(?:$|[?#])|\/cdn-cgi\/challenge-platform\/|\/cdn-cgi\/challenge|challenges\.cloudflare\.com|captcha-delivery\.com|x-kpsdk|kasada/i;

const SCAN_NO_GO_NAVIGATION_FAILURE_PATTERN =
  /page\.goto|net::ERR_|ERR_HTTP2_PROTOCOL_ERROR|ERR_QUIC_PROTOCOL_ERROR|navigation timeout|timeout \d+ms exceeded/i;

function buildScanNoGoAssessment(input: {
  consentUiObservations: ConsentUiObservation[];
  domSnapshots: DomSnapshotArtifact[];
  modulesRun: CanonicalEvidenceBundle["modulesRun"];
  networkEvents: NetworkEvent[];
  networkResponseEvents: NetworkResponseEvent[];
  policySurfaceObservations: PolicySurfaceObservation[];
  screenshots: ScreenshotArtifact[];
}): {
  primaryReasonCode: string;
  scanNoGoAssessment: ScanNoGoAssessment;
  visualAccessReview: VisualAccessReview;
} | null {
  const navigationFailureText = input.modulesRun
    .find((moduleRun) =>
      moduleRun.moduleName === "preConsentRuntimeScanner" &&
      moduleRun.status === "failed"
    )
    ?.errors.find((error) => SCAN_NO_GO_NAVIGATION_FAILURE_PATTERN.test(error));
  if (
    navigationFailureText &&
    input.screenshots.length === 0 &&
    input.domSnapshots.length === 0
  ) {
    const matchedText = boundedScanNoGoText(navigationFailureText) ?? "Initial navigation failed before page evidence could be retained.";
    const confidence = 0.92;
    const visualAccessReview: VisualAccessReview = {
      artifact_ref: null,
      confidence,
      go_no_go: "NO_GO",
      key_visual_evidence: [matchedText],
      page_state: "capture_failed",
      reason_code: "navigation_transport_failure",
      short_explanation: `The initial navigation failed before the scanner could retain public-page evidence: "${matchedText}"`,
      status: "missing_visual_artifact",
      version: "visual-access-review-v1",
    };
    const scanNoGoAssessment: ScanNoGoAssessment = {
      status: "available",
      version: "scan-no-go-assessment-v1",
      decision: "no_go",
      scanNoGoConfidence: confidence,
      reasonCodes: ["navigation_transport_failure", "scan_no_go_corroborated"],
      corroboratorCodes: ["pre_consent_navigation_failed", "no_visual_artifact_retained"],
      contradictorCodes: [],
      supportingSignals: {
        challengeSignalsDetected: false,
        documentStatusBlocked: false,
        expectedOriginReached: false,
        navigationTransportFailure: true,
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
      primaryReasonCode: "navigation_transport_failure",
      scanNoGoAssessment,
      visualAccessReview,
    };
  }

  const textCandidates = uniqueStrings([
    ...input.domSnapshots.map((snapshot) => boundedScanNoGoText(snapshot.textExcerpt)),
    ...input.consentUiObservations.map((observation) => boundedScanNoGoText(observation.textExcerpt)),
    ...input.policySurfaceObservations.map((observation) => boundedScanNoGoText(observation.textExcerpt)),
  ].filter((text): text is string => Boolean(text)));
  const matchedText = textCandidates.find((text) => SCAN_NO_GO_TEXT_PATTERN.test(text));
  const networkChallengeEvidence = detectScanNoGoNetworkChallengeEvidence({
    networkEvents: input.networkEvents,
    networkResponseEvents: input.networkResponseEvents,
  });
  if (!matchedText && !networkChallengeEvidence) {
    return null;
  }

  const retainedEvidenceText = matchedText ?? networkChallengeEvidence?.evidenceText ?? "Security challenge evidence observed.";
  const securityChallengeRequestObserved = Boolean(networkChallengeEvidence);
  const screenshot = input.screenshots
    .filter((artifact) => artifact.consentStateAtTime === "pre_consent")
    .sort((left, right) => left.capturedAtMs - right.capturedAtMs)[0] ?? null;
  const primaryReasonCode = securityChallengeRequestObserved
    ? "captcha_or_challenge"
    : "access_denied_or_forbidden_page";
  const visualPageState: VisualAccessReview["page_state"] = securityChallengeRequestObserved
    ? "captcha_or_challenge"
    : "access_blocked";
  const confidence = securityChallengeRequestObserved ? 0.95 : 0.93;
  const evidenceRefs = [
    "scan_runtime_artifacts.scan_no_go_assessment",
    "scan_runtime_artifacts.visual_access_review",
    screenshot ? "scan_runtime_artifacts.visual_evidence_artifacts" : null,
  ].filter((value): value is string => Boolean(value));
  const shortExplanation = securityChallengeRequestObserved
    ? `The retained initial-load evidence showed a bot/security challenge instead of the normal public site: "${retainedEvidenceText}"`
    : `The retained initial-load evidence showed an access-block page instead of the normal public site: "${retainedEvidenceText}"`;
  const visualAccessReview: VisualAccessReview = {
    artifact_ref: screenshot ? "scan_core:screenshot_pre_consent" : null,
    confidence,
    go_no_go: "NO_GO",
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
    decision: "no_go",
    scanNoGoConfidence: confidence,
    visualScreenshotNoGoConfidence: screenshot ? confidence : undefined,
    reasonCodes: [primaryReasonCode, "scan_no_go_corroborated"],
    corroboratorCodes: [
      securityChallengeRequestObserved ? "network_security_challenge_request_observed" : null,
      networkChallengeEvidence?.corroboratorCode ?? null,
      matchedText ? "access_block_text_observed" : null,
      screenshot ? "retained_visual_artifact_available" : null,
    ].filter((value): value is string => Boolean(value)),
    contradictorCodes: [],
    supportingSignals: {
      challengeSignalsDetected: true,
      documentStatusBlocked: true,
      expectedOriginReached: false,
      retainedVisualArtifactAvailable: Boolean(screenshot),
      securityChallengeRequestObserved,
      visualHardNoGoPageState: true,
      visualNoGo: true,
      visualPageState,
    },
    evidenceRefs,
  };

  return {
    primaryReasonCode,
    scanNoGoAssessment,
    visualAccessReview,
  };
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

function shouldAttemptScreenshotOnlyFallback(
  result: Awaited<ReturnType<typeof preConsentRuntimeScanner>>,
  screenshotMode: RunScanInput["preConsentScreenshotMode"],
) {
  if (screenshotMode === "never" || result.screenshots.length > 0) {
    return false;
  }
  if (result.visualCapture.status === "available" || result.visualCapture.status === "placeholder") {
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
  const errorText = [
    result.visualCapture.failureReason,
    ...result.visualCapture.notes,
    ...(result.moduleRun.errors ?? []),
  ].join("\n");
  return /page_closed|target page, context or browser has been closed|page\.goto|page\/context closed/i.test(errorText);
}

export async function capturePreConsentScreenshotOnlyFallback(input: {
  artifactWriter: ArtifactWriter;
  fallbackDeadlineMs?: number;
  normalizedUrl: string;
  scanStartedAtMs: number;
  screenshotTimeoutMs?: number;
}): Promise<{
  screenshot: ScreenshotArtifact;
  visualCapture: VisualCaptureSummary;
  consentUiObservation?: ConsentUiObservation;
  domSnapshot?: DomSnapshotArtifact;
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
      const page = await context.newPage();
      await page.goto(input.normalizedUrl, {
        waitUntil: "domcontentloaded",
        timeout: timeoutForStep(Math.max(2_000, Math.min(input.screenshotTimeoutMs ?? 5_000, 15_000))),
      });
      const networkIdleTimeoutMs = optionalTimeoutForStep(1_000);
      if (networkIdleTimeoutMs !== null) {
        await page.waitForLoadState("networkidle", { timeout: networkIdleTimeoutMs }).catch(() => undefined);
      }
      await page.screenshot({
        fullPage: false,
        path: screenshotPath,
        timeout: timeoutForStep(Math.max(1_000, Math.min(input.screenshotTimeoutMs ?? 5_000, 15_000))),
      });
      const domTextTimeoutMs = optionalTimeoutForStep(2_000);
      const domText = domTextTimeoutMs === null
        ? ""
        : await page.locator("body").innerText({ timeout: domTextTimeoutMs }).catch(() => "");
      const domPath = domText
        ? await input.artifactWriter.writeTextArtifact(
          "dom-text-pre-consent.txt",
          domText.slice(0, 100_000),
        )
        : undefined;
      const consentUiTimeoutMs = optionalTimeoutForStep(1_500);
      const consentUiObservation = consentUiTimeoutMs === null
        ? undefined
        : await detectConsentUi(
          page,
          input.scanStartedAtMs,
          consentUiTimeoutMs,
        ).catch(() => undefined);
      if (consentUiObservation && domPath) {
        consentUiObservation.evidenceRefs = [
          { refId: "dom_text_pre_consent", artifactId: "dom_text_pre_consent", path: domPath },
        ];
      }
      return {
        screenshot: {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: Date.now() - input.scanStartedAtMs,
          captureMethod: "independent_visual_fallback_viewport",
          path: screenshotPath,
          url: page.url(),
          pagePhase: "dom_content_loaded",
          consentStateAtTime: "pre_consent",
        },
        visualCapture: {
          status: "available",
          captureMethod: "independent_visual_fallback_viewport",
          artifactRefs: [{
            artifactId: "screenshot_pre_consent",
            artifactType: "screenshot",
            path: screenshotPath,
            label: "Pre-consent screenshot",
            sensitivity: "safe",
            redactionStatus: "not_needed",
            relatedEventIds: [],
          }],
          notes: [
            consentUiObservation
              ? "Screenshot and bounded consent-surface evidence retained by an independent visual fallback after the primary runtime page/context closed."
              : "Screenshot retained by an independent screenshot-only fallback after the primary runtime page/context closed.",
          ],
        },
        consentUiObservation,
        domSnapshot: domPath
          ? {
            artifactId: "dom_text_pre_consent",
            capturedAtMs: Date.now() - input.scanStartedAtMs,
            path: domPath,
            url: page.url(),
            textExcerpt: domText.slice(0, 2_000),
            pagePhase: "dom_content_loaded",
            consentStateAtTime: "pre_consent",
          }
          : undefined,
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
  };
}
