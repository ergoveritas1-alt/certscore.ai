import {
  type ArtifactRef,
  type ConsentActionAttempt,
  type ConsentActionCandidate,
  type ConsentActionType,
  type ConsentFlowComparison,
  type ConsentFlowObservation,
  type ConsentFlowScenario,
  type ConsentInteractionEvent,
  type ConsentScenarioPlanningMode,
  type ConsentScenarioPolicyPlanningStatus,
  type ConsentState,
  type ConsentUiObservation,
  type CookieEvent,
  type CookieSnapshot,
  type DomSnapshotArtifact,
  type EvidenceRef,
  type NetworkEvent,
  type NetworkResponseEvent,
  type NormalizedVendorObservation,
  type RuntimeEvidenceEvent,
  type ScanModuleRun,
  type ScreenshotArtifact,
} from "@certscore/contracts";
import { resolveEndpointGeography, resolveVendorObservations, type VendorResolverInput } from "@certscore/vendor-resolver";
import { writeFile } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext, type Frame, type Page, type Request, type Response, type Route } from "playwright";
import type { ArtifactWriter } from "../artifact-writer.js";
import { chromiumLaunchOptions } from "../playwright-runtime.js";
import {
  classifyCookieParty,
  classifyHostnameParty,
  getHostname,
  getRegistrableDomain,
  getRegistrableDomainFromUrl,
} from "../domain-utils.js";
import {
  normalizeResponseSizes,
  parseSetCookieMetadata,
  pickHeaders,
  querySignalsFromUrl,
  redactSetCookieHeader,
  responseTiming,
  safeResponseHeaders,
  type FixtureRouteFulfiller,
} from "./pre-consent-runtime-scanner.js";
import type { PreConsentRuntimeScannerResult } from "./pre-consent-runtime-scanner.js";
import { maybeFulfillHeavyResource, type HeavyResourcePreserveOptions } from "../resource-stubbing.js";
import {
  normalizeResearchCandidate,
  writeConsentActionRecipeResearchArtifact,
  type ConsentRecipeResearchCandidate,
} from "./consent-action-recipe-research.js";
import { writeConsentFlowTraceArtifact } from "./consent-flow-trace.js";
import {
  writeConsentScenarioExecutionArtifact,
  writeConsentScenarioPlanArtifact,
} from "./consent-scenario-artifacts.js";
import {
  executeConsentScenarioPlan,
  type ConsentScenarioExecutionEntry,
  type ScenarioPhaseTiming,
} from "./consent-scenario-executor.js";
import {
  buildConsentScenarioPlan,
  comparePlanItems,
  consentScenarioOrder,
  type ConsentScenarioPlan,
  type ConsentReplayAuxiliaryProbeMode,
  type ConsentScenarioPlanItem,
} from "./consent-scenario-planner.js";
import {
  consentStateForScenarioExecution,
  createConsentScenarioIdFactory,
  type ScenarioIdFactory,
} from "./consent-scenario-runner.js";

const SOURCE_SCANNER = "consent_flow_runtime";
const ONE_PIXEL_TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);
const PLANNED_BASELINE_CONTROL_LIMIT = 72;
const PLANNED_ACTION_CONTROL_LIMIT = 42;
const PLANNED_POST_ACTION_CONTROL_LIMIT = 32;
const PLANNED_RECIPE_CANDIDATE_LIMIT = 28;
const BASELINE_REUSE_WIDE_PAGE_THRESHOLD = 36;
const PLANNED_MIN_CONTROL_SCORE = 25;

export interface ConsentFlowRuntimeScannerInput {
  url: string;
  normalizedUrl: string;
  privacyControlUrls?: string[];
  scanStartedAtMs: number;
  internalBudgetMs: number;
  artifactWriter: ArtifactWriter;
  browserMode?: "headless" | "headed";
  captureReplay?: boolean;
  captureReplayAuxiliaryProbes?: ConsentReplayAuxiliaryProbeMode;
  captureReplayTrace?: boolean;
  stubHeavyResources?: boolean;
  routeFulfillers?: FixtureRouteFulfiller[];
  enableNanoConsentUiAssist?: boolean;
  nanoConsentUiAssistProvider?: NanoConsentUiAssistProvider;
  scenarioPlanningMode?: ConsentScenarioPlanningMode;
  scenarioConcurrency?: number;
  allowedScenarios?: ConsentFlowScenario[];
  policyPlanningDeadlineMs?: number;
  consentFlowDeadlineMs?: number;
  policyPlanningStatus?: ConsentScenarioPolicyPlanningStatus;
  policyPrivacyControlUrlCount?: number;
  scenarioResourceMode?: "normal" | "lean" | "cmp_safe";
  screenshotMode?: "auto" | "none";
  preConsentBaseline?: PreConsentRuntimeScannerResult;
  plannedActionFinalSettleMs?: number;
  preActionObservationMs?: number;
  actionSearchDeadlineMs?: number;
  consentActionRecipe?: ConsentActionRecipeInput;
  oneTrustHiddenActionMode?: "off" | "diagnostic";
  externalBaselinePlanning?: "enrich" | "reuse_only";
  forceAllowedScenarioPlanning?: boolean;
}

export interface ConsentActionRecipeInput {
  artifactVersion: "certscore.v2.consent-action-recipe.v1";
  generatedAt: string;
  normalizedUrl: string;
  scenarios: ConsentActionRecipeScenario[];
}

export interface ConsentActionRecipeScenario {
  actionType?: string;
  candidates: ConsentActionRecipeCandidate[];
  scenario: string;
  targetUrl?: string;
}

export interface ConsentActionRecipeCandidate {
  actionType?: string;
  confidence?: number;
  frameKind?: string;
  frameUrl?: string;
  labelText: string;
  selectorSummary?: string;
  visible?: boolean;
}

export interface ConsentFlowRuntimeScannerResult {
  moduleRun: ScanModuleRun;
  runtimeTimeline: RuntimeEvidenceEvent[];
  networkEvents: NetworkEvent[];
  networkResponseEvents: NetworkResponseEvent[];
  cookieEvents: CookieEvent[];
  cookieSnapshots: CookieSnapshot[];
  consentUiObservations: ConsentUiObservation[];
  consentInteractionEvents: ConsentInteractionEvent[];
  screenshots: ScreenshotArtifact[];
  domSnapshots: DomSnapshotArtifact[];
  consentFlowObservations: ConsentFlowObservation[];
  consentActionCandidates: ConsentActionCandidate[];
  consentActionAttempts: ConsentActionAttempt[];
  consentFlowComparisons: ConsentFlowComparison[];
  artifactRefs: ArtifactRef[];
  vendorResolverInputs: VendorResolverInput[];
}

export interface NanoConsentUiAssistProvider {
  classifyControls(input: NanoConsentUiClassificationInput): Promise<NanoConsentUiClassificationResult>;
}

export interface NanoConsentUiClassificationInput {
  assistId: string;
  pageUrl: string;
  candidates: Array<{
    actionId: string;
    labelText: string;
    normalizedLabel: string;
    domLocation?: string;
    selectorSummary?: string;
  }>;
}

export interface NanoConsentUiClassificationResult {
  assistId: string;
  classifications: Array<{
    actionId: string;
    actionType: ConsentActionType;
    confidence: number;
    shouldClick: boolean;
    uncertaintyNotes?: string[];
  }>;
}

export interface ScenarioCapture {
  scenario: ConsentFlowScenario;
  consentState: ConsentState;
  actionType?: ConsentActionType;
  moduleStartedAtMs: number;
  nanoAssistErrors: string[];
  networkEvents: NetworkEvent[];
  networkResponseEvents: NetworkResponseEvent[];
  cookieEvents: CookieEvent[];
  cookieSnapshots: CookieSnapshot[];
  consentUiObservation: ConsentUiObservation;
  consentInteractionEvents: ConsentInteractionEvent[];
  screenshots: ScreenshotArtifact[];
  domSnapshots: DomSnapshotArtifact[];
  actionCandidates: ConsentActionCandidate[];
  actionAttempts: ConsentActionAttempt[];
  consentFlowObservation: ConsentFlowObservation;
  artifactRefs: ArtifactRef[];
  vendorResolverInputs: VendorResolverInput[];
  recipeResearchCandidates: ConsentRecipeResearchCandidate[];
  phaseTimings: ScenarioPhaseTiming[];
}

interface ScenarioRuntimeDiagnosticState {
  activeRequestIds: Set<string>;
  blockedResourceCounts: Record<string, number>;
  cmpSurfaceProbe?: CmpSurfaceProbeDiagnostic;
  consoleMessages: Array<{ level: string; text: string }>;
  finalSettleMs: number;
  finalSettleStartedAtMs: number;
  pageErrors: string[];
  requestFailures: Array<{
    failureText?: string;
    method: string;
    requestId?: string;
    resourceType: string;
    url: string;
  }>;
  recipeDiagnostics?: ScenarioRecipeDiagnostic;
  resourceTypeCounts: Record<string, number>;
}

interface ScenarioRecipeDiagnostic {
  candidateLabels: string[];
  equivalentCandidateCount: number;
  equivalentVisibleCandidateCount: number;
  recipeCandidateCount: number;
  status: "not_applicable" | "missing" | "present_empty" | "present_not_matched" | "reacquired";
  targetUrl?: string;
}

interface ConsentFlowComparisonCapture {
  scenario: ConsentFlowScenario;
  consentState: ConsentState;
  networkEvents: NetworkEvent[];
  networkResponseEvents?: NetworkResponseEvent[];
  cookieEvents: CookieEvent[];
  consentInteractionEvents?: ConsentInteractionEvent[];
  actionAttempts: ConsentActionAttempt[];
  vendorResolverInputs?: VendorResolverInput[];
  normalizedVendorObservations?: NormalizedVendorObservation[];
}

export interface ConsentFlowComparisonEvidenceInput {
  networkEvents: NetworkEvent[];
  cookieEvents: CookieEvent[];
  consentActionAttempts: ConsentActionAttempt[];
  consentFlowObservations?: ConsentFlowObservation[];
  normalizedVendorObservations?: NormalizedVendorObservation[];
}

interface RawControlCandidate {
  actionId: string;
  candidateIndex: number;
  labelText: string;
  normalizedLabel: string;
  selectorSummary: string;
  domLocation?: string;
  contextTextExcerpt?: string;
  frameContext?: ConsentActionCandidate["frameContext"];
  visible: boolean;
  enabled: boolean;
  role?: string;
  ariaLabel?: string;
}

interface CmpSurfaceProbeDiagnostic {
  attemptedCalls: string[];
  controlsVisibleAfterProbe: number;
  oneTrustDomState?: {
    consentSdkPresent: boolean;
    hiddenButtonLabels: string[];
    pcSdkPresent: boolean;
    pcSdkVisible: boolean;
    visibleButtonLabels: string[];
  };
  observedOneTrustGlobals: string[];
  preferenceSurfaceObserved: boolean;
}

interface ClassifiedActionCandidates {
  actionCandidates: ConsentActionCandidate[];
  nanoAssistErrors: string[];
}

interface ClassifyActionCandidateOptions {
  allowPreferenceOpenerAsTargetPath?: boolean;
  allowNanoAssist?: boolean;
  nanoCandidateLimit?: number;
  skipNanoWhenHighConfidenceTarget?: boolean;
  targetActionType?: ConsentActionType;
}

type ConsentActionProof = NonNullable<ConsentActionAttempt["actionProof"]>;

export async function consentFlowRuntimeScanner(
  input: ConsentFlowRuntimeScannerInput,
): Promise<ConsentFlowRuntimeScannerResult> {
  const moduleStartedAtMs = Date.now();
  const moduleStartedAt = new Date(moduleStartedAtMs).toISOString();
  const captures: ScenarioCapture[] = [];
  const planningMode = input.scenarioPlanningMode ?? "legacy_sequential";

  if (planningMode === "planned_parallel") {
    return runPlannedParallelConsentFlow(input, moduleStartedAt, moduleStartedAtMs);
  }

  const legacyDeadlineAtMs = input.consentFlowDeadlineMs
    ? moduleStartedAtMs + input.consentFlowDeadlineMs
    : undefined;
  try {
    const baselineCapture = await runScenario(input, {
      scenario: "baseline_pre_consent",
      consentState: "pre_consent",
      moduleStartedAtMs,
      deadlineAtMs: legacyDeadlineAtMs,
    });
    captures.push(baselineCapture);
    captures.push(await runScenario(input, {
      scenario: "reject_all_flow",
      consentState: "post_reject",
      actionType: "reject_all",
      moduleStartedAtMs,
      deadlineAtMs: legacyDeadlineAtMs,
    }, { baselineCapture }));
    captures.push(await runScenario(input, {
      scenario: "accept_all_flow",
      consentState: "post_accept",
      actionType: "accept_all",
      moduleStartedAtMs,
      deadlineAtMs: legacyDeadlineAtMs,
    }, { baselineCapture }));
    captures.push(await runScenario(input, {
      scenario: "gpc_enabled",
      consentState: "pre_consent",
      moduleStartedAtMs,
      deadlineAtMs: legacyDeadlineAtMs,
    }, { baselineCapture }));
    if (input.captureReplay) {
      const auxiliaryProbes = enabledReplayAuxiliaryProbes(input);
      const privacyControlUrl = input.privacyControlUrls?.[0];
      if (privacyControlUrl) {
        captures.push(await runScenario(input, {
          scenario: "privacy_opt_out_flow",
          consentState: "post_reject",
          actionType: "do_not_sell_share",
          targetUrl: privacyControlUrl,
          moduleStartedAtMs,
          deadlineAtMs: legacyDeadlineAtMs,
        }, { baselineCapture }));
      }
      if (auxiliaryProbes.form) {
        captures.push(await runScenario(input, {
          scenario: "form_collection_probe",
          consentState: "pre_consent",
          moduleStartedAtMs,
          deadlineAtMs: legacyDeadlineAtMs,
        }, { baselineCapture }));
      }
      if (auxiliaryProbes.accessibility) {
        captures.push(await runScenario(input, {
          scenario: "accessibility_probe",
          consentState: "pre_consent",
          moduleStartedAtMs,
          deadlineAtMs: legacyDeadlineAtMs,
        }, { baselineCapture }));
      }
    }

    const comparisons = buildComparisons(captures);
    return flattenResult(moduleStartedAt, moduleStartedAtMs, captures, comparisons);
  } catch (error) {
    return {
      moduleRun: moduleRun(
        "failed",
        moduleStartedAt,
        moduleStartedAtMs,
        unique([
          ...captures.flatMap((capture) => capture.nanoAssistErrors),
          error instanceof Error ? error.message : String(error),
        ]),
      ),
      runtimeTimeline: captures.flatMap((capture) => runtimeTimeline(capture)),
      networkEvents: captures.flatMap((capture) => capture.networkEvents),
      networkResponseEvents: captures.flatMap((capture) => capture.networkResponseEvents),
      cookieEvents: captures.flatMap((capture) => capture.cookieEvents),
      cookieSnapshots: captures.flatMap((capture) => capture.cookieSnapshots),
      consentUiObservations: captures.map((capture) => capture.consentUiObservation),
      consentInteractionEvents: captures.flatMap((capture) => capture.consentInteractionEvents),
      screenshots: captures.flatMap((capture) => capture.screenshots),
      domSnapshots: captures.flatMap((capture) => capture.domSnapshots),
      consentFlowObservations: captures.map((capture) => capture.consentFlowObservation),
      consentActionCandidates: captures.flatMap((capture) => capture.actionCandidates),
      consentActionAttempts: captures.flatMap((capture) => capture.actionAttempts),
      consentFlowComparisons: [],
      artifactRefs: captures.flatMap((capture) => capture.artifactRefs),
      vendorResolverInputs: captures.flatMap((capture) => capture.vendorResolverInputs),
    };
  }
}

async function runPlannedParallelConsentFlow(
  input: ConsentFlowRuntimeScannerInput,
  moduleStartedAt: string,
  moduleStartedAtMs: number,
): Promise<ConsentFlowRuntimeScannerResult> {
  const browserMode = input.browserMode ?? "headless";
  let browser = await chromium.launch(chromiumLaunchOptions({ headless: browserMode !== "headed" }));
  const consentFlowDeadlineMs = input.consentFlowDeadlineMs ?? input.internalBudgetMs;
  const deadlineAtMs = moduleStartedAtMs + consentFlowDeadlineMs;
  const scenarioConcurrency = Math.max(1, Math.min(defaultScenarioConcurrency(input), 4));
  const artifactRefs: ArtifactRef[] = [];
  const retainedCaptures: ScenarioCapture[] = [];
  let plan: ConsentScenarioPlan | undefined;
  let executionEntries: ConsentScenarioExecutionEntry[] = [];
  let externalBaselineReused = false;
  try {
    const baselineItem: ConsentScenarioPlanItem = {
      scenario: "baseline_pre_consent",
      reasonCodes: ["baseline_required"],
    };
    const externalBaseline = preConsentBaselineCapture(input, moduleStartedAtMs);
    const initialBaseline = externalBaseline ?? await runScenario(input, {
      scenario: "baseline_pre_consent",
      consentState: "pre_consent",
      moduleStartedAtMs,
      deadlineAtMs,
    }, {
      browser,
      idFactory: createConsentScenarioIdFactory("baseline_pre_consent"),
      deadlineAtMs,
    });
    const baseline = externalBaseline && input.externalBaselinePlanning !== "reuse_only"
      ? await enrichExternalBaselineForPlanning(input, browser, initialBaseline, deadlineAtMs)
      : initialBaseline;
    externalBaselineReused = Boolean(externalBaseline);
    retainedCaptures.push(baseline);
    plan = buildConsentScenarioPlan({
      baseline: {
        actionCandidates: baseline.actionCandidates,
        bannerLikelyPresent: baseline.consentUiObservation.likelyPresent,
        cmpEvidenceObserved: baseline.consentUiObservation.likelyPresent || preConsentCmpEvidenceObserved(input),
        textExcerpt: baseline.consentFlowObservation.textExcerpt,
      },
      captureReplay: input.captureReplay,
      captureReplayAuxiliaryProbes: input.captureReplayAuxiliaryProbes,
      privacyControlUrls: input.privacyControlUrls,
      policyPlanningStatus: input.policyPlanningStatus,
      policyPrivacyControlUrlCount: input.policyPrivacyControlUrlCount,
      deadlineHit: Date.now() > deadlineAtMs,
    });
    plan = forceAllowedScenarioPlanItems(plan, input);
    applyBaselineRecipeTargets(plan.plannedScenarios, baseline, input.normalizedUrl);
    const planRef = await writeConsentScenarioPlanArtifact({
      artifactWriter: input.artifactWriter,
      mode: "planned_parallel",
      sourceUrl: input.url,
      normalizedUrl: input.normalizedUrl,
      plan,
      scenarioConcurrency,
      policyPlanningDeadlineMs: input.policyPlanningDeadlineMs,
      consentFlowDeadlineMs,
    });
    artifactRefs.push(planRef);
    const allowedScenarioSet = input.allowedScenarios
      ? new Set<ConsentFlowScenario>(input.allowedScenarios)
      : null;
    const plannedWithoutBaseline = plan.plannedScenarios.filter((item) =>
      item.scenario !== "baseline_pre_consent" &&
      (!allowedScenarioSet || allowedScenarioSet.has(item.scenario))
    );
    const runPlannedScenarioWithBrowserRetry = async (item: ConsentScenarioPlanItem): Promise<ScenarioCapture> => {
      if (item.scenario === "baseline_pre_consent") {
        return baseline;
      }
      const scenarioDeadlineAtMs = plannedScenarioExecutionDeadlineAtMs(item, deadlineAtMs);
      const run = () => runScenario(input, {
        scenario: item.scenario,
        consentState: consentStateForScenarioExecution(item.scenario),
        actionType: item.actionType,
        targetUrl: item.targetUrl,
        moduleStartedAtMs,
        deadlineAtMs: scenarioDeadlineAtMs,
      }, {
        browser,
        idFactory: createConsentScenarioIdFactory(item.scenario),
        baselineCapture: baseline,
        deadlineAtMs: scenarioDeadlineAtMs,
      });
      try {
        return await run();
      } catch (error) {
        if (!isBrowserContextClosedError(error) || scenarioDeadlineNearlyHit(scenarioDeadlineAtMs, 8_000)) {
          throw error;
        }
        await closeBrowserWithTimeout(browser);
        browser = await chromium.launch(chromiumLaunchOptions({ headless: browserMode !== "headed" }));
        return run();
      }
    };
    const execution = await executeConsentScenarioPlan({
      plannedScenarios: [baselineItem, ...plannedWithoutBaseline],
      skippedScenarios: plan.skippedScenarios,
      concurrency: scenarioConcurrency,
      deadlineAtMs,
      async runScenario(item) {
        return runPlannedScenarioWithBrowserRetry(item);
      },
    });
    executionEntries = execution.entries;
    const captures = execution.captures.sort(comparePlanItems);
    retainedCaptures.splice(0, retainedCaptures.length, ...captures);
    const fallbackQualityRefs = await writeFallbackScenarioEvidenceQualityArtifacts({
      artifactWriter: input.artifactWriter,
      capturedScenarios: new Set(captures.map((capture) => capture.scenario)),
      executionEntries,
    });
    artifactRefs.push(...fallbackQualityRefs);
    const comparisons = buildComparisons(captures);
    const executionRef = await writeConsentScenarioExecutionArtifact({
      artifactWriter: input.artifactWriter,
      mode: "planned_parallel",
      sourceUrl: input.url,
      normalizedUrl: input.normalizedUrl,
      policyPlanningStatus: plan.policyPlanningStatus,
      executionEntries,
    });
    artifactRefs.push(executionRef);
    const recipeResearchRef = await writeConsentActionRecipeResearchArtifact({
      artifactWriter: input.artifactWriter,
      mode: "planned_parallel",
      sourceUrl: input.url,
      normalizedUrl: input.normalizedUrl,
      captures,
      executionEntries: execution.entries,
    });
    artifactRefs.push(recipeResearchRef);
    const traceRef = await writeConsentFlowTraceArtifact({
      artifactWriter: input.artifactWriter,
      mode: "planned_parallel",
      sourceUrl: input.url,
      normalizedUrl: input.normalizedUrl,
      plan,
      executionEntries,
      captures,
      comparisons,
      relatedArtifactRefs: [...artifactRefs, ...captures.flatMap((capture) => capture.artifactRefs)],
    });
    artifactRefs.push(traceRef);
    const result = flattenResult(moduleStartedAt, moduleStartedAtMs, captures, comparisons, {
      omitRawEvidenceForScenarios: externalBaselineReused ? new Set<ConsentFlowScenario>(["baseline_pre_consent"]) : undefined,
    });
    return {
      ...result,
      artifactRefs: [...result.artifactRefs, ...artifactRefs],
      moduleRun: {
        ...result.moduleRun,
        status: result.moduleRun.status,
        errors: result.moduleRun.errors ?? [],
      },
    };
  } catch (error) {
    const captures = retainedCaptures.sort(comparePlanItems);
    if (plan && !artifactRefs.some((ref) => ref.artifactId === "consent_scenario_execution")) {
      const fallbackEntries = executionEntries.length > 0
        ? executionEntries
        : fallbackConsentScenarioExecutionEntries({
          plan,
          captures,
          error,
          deadlineAtMs,
        });
      const fallbackRef = await writeConsentScenarioExecutionArtifact({
        artifactWriter: input.artifactWriter,
        mode: "planned_parallel",
        sourceUrl: input.url,
        normalizedUrl: input.normalizedUrl,
        policyPlanningStatus: plan.policyPlanningStatus,
        executionEntries: fallbackEntries,
        notes: [`planned_parallel_failed_before_execution_artifact: ${errorMessage(error)}`],
      }).catch(() => undefined);
      if (fallbackRef) {
        artifactRefs.push(fallbackRef);
      }
      const capturedScenarios = new Set(captures.map((capture) => capture.scenario));
      const fallbackQualityRefs = await writeFallbackScenarioEvidenceQualityArtifacts({
        artifactWriter: input.artifactWriter,
        capturedScenarios,
        executionEntries: fallbackEntries,
      }).catch(() => []);
      artifactRefs.push(...fallbackQualityRefs);
    }
    return {
      moduleRun: moduleRun(
        "failed",
        moduleStartedAt,
        moduleStartedAtMs,
        [error instanceof Error ? error.message : String(error)],
      ),
      runtimeTimeline: rawEvidenceCaptures(captures, externalBaselineReused).flatMap((capture) => runtimeTimeline(capture)),
      networkEvents: rawEvidenceCaptures(captures, externalBaselineReused).flatMap((capture) => capture.networkEvents),
      networkResponseEvents: rawEvidenceCaptures(captures, externalBaselineReused).flatMap((capture) => capture.networkResponseEvents),
      cookieEvents: rawEvidenceCaptures(captures, externalBaselineReused).flatMap((capture) => capture.cookieEvents),
      cookieSnapshots: rawEvidenceCaptures(captures, externalBaselineReused).flatMap((capture) => capture.cookieSnapshots),
      consentUiObservations: rawEvidenceCaptures(captures, externalBaselineReused).map((capture) => capture.consentUiObservation),
      consentInteractionEvents: captures.flatMap((capture) => capture.consentInteractionEvents),
      screenshots: rawEvidenceCaptures(captures, externalBaselineReused).flatMap((capture) => capture.screenshots),
      domSnapshots: rawEvidenceCaptures(captures, externalBaselineReused).flatMap((capture) => capture.domSnapshots),
      consentFlowObservations: captures.map((capture) => capture.consentFlowObservation),
      consentActionCandidates: captures.flatMap((capture) => capture.actionCandidates),
      consentActionAttempts: captures.flatMap((capture) => capture.actionAttempts),
      consentFlowComparisons: [],
      artifactRefs: [...rawEvidenceCaptures(captures, externalBaselineReused).flatMap((capture) => capture.artifactRefs), ...artifactRefs],
      vendorResolverInputs: captures.flatMap((capture) => capture.vendorResolverInputs),
    };
  } finally {
    await closeBrowserWithTimeout(browser);
  }
}

function forceAllowedScenarioPlanItems(
  plan: ConsentScenarioPlan,
  input: ConsentFlowRuntimeScannerInput,
): ConsentScenarioPlan {
  if (!input.forceAllowedScenarioPlanning || !input.allowedScenarios?.length || !input.consentActionRecipe) {
    return plan;
  }
  const allowed = new Set(input.allowedScenarios);
  const alreadyPlanned = new Set(plan.plannedScenarios.map((item) => item.scenario));
  const recipeScenarios = input.consentActionRecipe.scenarios.flatMap((scenario) => {
    const parsedScenario = parseConsentFlowScenarioValue(scenario.scenario);
    const parsedActionType = parseConsentActionTypeValue(scenario.actionType);
    if (!parsedScenario || !allowed.has(parsedScenario) || parsedScenario === "baseline_pre_consent" || alreadyPlanned.has(parsedScenario)) {
      return [];
    }
    return [{
      actionType: parsedActionType,
      scenario: parsedScenario,
      targetUrl: scenario.targetUrl,
    }];
  });
  if (recipeScenarios.length === 0) {
    return plan;
  }
  const forcedItems: ConsentScenarioPlanItem[] = recipeScenarios.map((scenario) => ({
    scenario: scenario.scenario,
    actionType: scenario.actionType,
    ...(scenario.targetUrl ? { targetUrl: scenario.targetUrl } : {}),
    reasonCodes: ["coordinator_plan_requested", "worker_lane_forced_planning"],
  }));
  const forcedScenarioSet = new Set(forcedItems.map((item) => item.scenario));
  return {
    ...plan,
    plannedScenarios: [...plan.plannedScenarios, ...forcedItems].sort(comparePlanItems),
    skippedScenarios: plan.skippedScenarios
      .filter((item) => !forcedScenarioSet.has(item.scenario))
      .sort(comparePlanItems),
    notes: [
      ...plan.notes,
      "Worker lane honored coordinator-planned consent scenarios even when the reused local baseline had no action candidates.",
    ],
  };
}

function parseConsentFlowScenarioValue(value: unknown): ConsentFlowScenario | undefined {
  return typeof value === "string" && (consentScenarioOrder as string[]).includes(value)
    ? value as ConsentFlowScenario
    : undefined;
}

function parseConsentActionTypeValue(value: unknown): ConsentActionType | undefined {
  switch (value) {
    case "accept_all":
    case "reject_all":
    case "manage_preferences":
    case "save_preferences":
    case "do_not_sell_share":
      return value;
    default:
      return undefined;
  }
}

function fallbackConsentScenarioExecutionEntries(input: {
  plan: ConsentScenarioPlan;
  captures: ScenarioCapture[];
  error: unknown;
  deadlineAtMs: number;
}): ConsentScenarioExecutionEntry[] {
  const completedEntries = input.captures.map((capture) => completedExecutionEntryFromCapture(capture, input.deadlineAtMs));
  const completedScenarios = new Set(completedEntries.map((entry) => entry.scenario));
  const skippedEntries: ConsentScenarioExecutionEntry[] = input.plan.skippedScenarios.map((item) => ({
    scenario: item.scenario,
    actionType: item.actionType,
    targetUrl: item.targetUrl,
    reasonCodes: item.reasonCodes,
    status: "skipped",
    actionProofStatus: "not_available",
    comparisonEligible: false,
    deadlineHit: item.skipReason === "deadline_hit" || item.skipReason === "budget_exhausted",
    failureReason: item.skipReason,
  }));
  const skippedScenarios = new Set(skippedEntries.map((entry) => entry.scenario));
  const errorText = errorMessage(input.error);
  const deadlineHit = Date.now() > input.deadlineAtMs || /deadline|closed/i.test(errorText);
  const failedEntries: ConsentScenarioExecutionEntry[] = input.plan.plannedScenarios
    .filter((item) => !completedScenarios.has(item.scenario) && !skippedScenarios.has(item.scenario))
    .map((item) => ({
      scenario: item.scenario,
      actionType: item.actionType,
      targetUrl: item.targetUrl,
      reasonCodes: item.reasonCodes,
      status: "failed",
      actionProofStatus: "not_available",
      comparisonEligible: false,
      deadlineHit,
      failureReason: deadlineHit ? "deadline_hit" : "planned_parallel_interrupted",
      error: errorText,
    }));

  return [...completedEntries, ...skippedEntries, ...failedEntries].sort(comparePlanItems);
}

function completedExecutionEntryFromCapture(
  capture: ScenarioCapture,
  deadlineAtMs: number,
): ConsentScenarioExecutionEntry {
  const actionProofStatus = scenarioActionProofStatus(capture);
  return {
    scenario: capture.scenario,
    actionType: capture.actionType,
    reasonCodes: ["retained_capture_before_failure"],
    status: "completed",
    startedAtMs: capture.moduleStartedAtMs,
    completedAtMs: Date.now(),
    durationMs: Math.max(0, Date.now() - capture.moduleStartedAtMs),
    phaseTimings: capture.phaseTimings,
    actionProofStatus,
    comparisonEligible: actionProofStatus === "not_required" || actionProofStatus === "attempted_succeeded",
    deadlineHit: Date.now() > deadlineAtMs,
  };
}

function scenarioActionProofStatus(capture: ScenarioCapture): ConsentScenarioExecutionEntry["actionProofStatus"] {
  if (!capture.actionType) {
    return "not_required";
  }
  const attempt = preferredActionAttempt(capture.actionAttempts, capture.actionType);
  if (!attempt) {
    return "not_available";
  }
  if (!attempt.attempted) {
    return "not_attempted";
  }
  return attempt.succeeded ? "attempted_succeeded" : "attempted_failed";
}

function preferredActionAttempt(
  attempts: ConsentActionAttempt[],
  actionType: ConsentActionType,
): ConsentActionAttempt | undefined {
  return attempts.find((attempt) =>
    attempt.actionType === actionType &&
    attempt.succeeded &&
    attempt.actionProof?.attemptedStatus === "attempted_succeeded"
  ) ?? attempts.find((attempt) => attempt.actionType === actionType);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isContextClosedError(error: unknown): boolean {
  return /target page, context or browser has been closed|browser has been closed|context has been closed/i.test(errorMessage(error));
}

async function runScenario(
  input: ConsentFlowRuntimeScannerInput,
  scenarioInput: {
    scenario: ConsentFlowScenario;
    consentState: ConsentState;
    actionType?: ConsentActionType;
    targetUrl?: string;
    moduleStartedAtMs: number;
    deadlineAtMs?: number;
  },
  runtime?: {
    browser?: Browser;
    idFactory?: ScenarioIdFactory;
    baselineCapture?: ScenarioCapture;
    deadlineAtMs?: number;
  },
): Promise<ScenarioCapture> {
  const targetUrl = scenarioInput.targetUrl ?? input.normalizedUrl;
  const firstPartyHostname = getHostname(input.normalizedUrl) ?? undefined;
  const firstPartyDomain = getRegistrableDomainFromUrl(input.normalizedUrl) ?? undefined;
  const nextScenarioId = runtime?.idFactory ?? createConsentScenarioIdFactory(scenarioInput.scenario);
  const networkEvents: NetworkEvent[] = [];
  const networkResponseEvents: NetworkResponseEvent[] = [];
  const cookieEvents: CookieEvent[] = [];
  const consentInteractionEvents: ConsentInteractionEvent[] = [];
  const vendorResolverInputs: VendorResolverInput[] = [];
  const requestIds = new WeakMap<Request, string>();
  const responseCapturePromises: Promise<void>[] = [];
  const captureInlineScreenshots = shouldCaptureInlineScreenshots(input, scenarioInput.scenario);
  const phaseTimings: ScenarioPhaseTiming[] = [];
  let cookieCountBeforeAction: number | null = null;
  let storageCountBeforeAction: number | null = null;
  const runtimeDiagnostics: ScenarioRuntimeDiagnosticState = {
    activeRequestIds: new Set<string>(),
    blockedResourceCounts: {},
    cmpSurfaceProbe: undefined,
    consoleMessages: [],
    finalSettleMs: 0,
    finalSettleStartedAtMs: 0,
    pageErrors: [],
    requestFailures: [],
    recipeDiagnostics: undefined,
    resourceTypeCounts: {},
  };
  let actionApplied = false;
  const replayArtifactRefs: ArtifactRef[] = [];

  async function recordPhase<T>(label: string, detail: string, fn: () => Promise<T>): Promise<T> {
    const startedAtMs = Date.now();
    try {
      return await fn();
    } finally {
      phaseTimings.push({
        label,
        detail,
        durationMs: Math.max(0, Date.now() - startedAtMs),
      });
    }
  }

  const browserMode = input.browserMode ?? "headless";
  const browser = runtime?.browser ?? await chromium.launch(chromiumLaunchOptions({ headless: browserMode !== "headed" }));
  const ownsBrowser = !runtime?.browser;
  const harPath = input.captureReplay
    ? input.artifactWriter.artifactPath(`replay_${scenarioInput.scenario}.har.zip`)
    : undefined;
  const context = await browser.newContext({
    extraHTTPHeaders: scenarioInput.scenario === "gpc_enabled" ? { "Sec-GPC": "1", DNT: "1" } : undefined,
    ignoreHTTPSErrors: true,
    viewport: { width: 1366, height: 900 },
    ...(harPath
      ? {
        recordHar: {
          content: "embed",
          mode: "minimal",
          path: harPath,
        } as const,
      }
      : {}),
  });
  let contextClosePromise: Promise<void> | undefined;
  const closeContext = () => {
    contextClosePromise ??= context.close().catch(() => undefined);
    return contextClosePromise;
  };
  const effectiveDeadlineAtMs = effectiveScenarioDeadlineAtMs(runtime?.deadlineAtMs, scenarioInput.deadlineAtMs);
  let deadlineTimer: NodeJS.Timeout | undefined;
  if (effectiveDeadlineAtMs !== undefined) {
    const delayMs = effectiveDeadlineAtMs - Date.now();
    if (delayMs <= 0) {
      await context.close().catch(() => undefined);
      throw new Error(`Scenario ${scenarioInput.scenario} deadline reached before context work started.`);
    }
    deadlineTimer = setTimeout(() => {
      void closeContext();
    }, delayMs);
  }
  if (scenarioInput.scenario === "gpc_enabled") {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "globalPrivacyControl", {
        configurable: true,
        get: () => true,
      });
      Object.defineProperty(navigator, "doNotTrack", {
        configurable: true,
        get: () => "1",
      });
    }).catch(() => undefined);
  }
  if (input.captureReplay && input.captureReplayTrace) {
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: false,
    }).catch(() => undefined);
  }
  const page = await context.newPage();

  try {
    for (const fulfiller of input.routeFulfillers ?? []) {
      await context.route(fulfiller.urlPattern, async (route: Route) => {
        await route.fulfill({
          status: fulfiller.status ?? 200,
          contentType: fulfiller.contentType ?? "text/plain",
          body: fulfiller.body ?? "",
          headers: fulfiller.headers,
        });
      });
    }
    if (input.stubHeavyResources || shouldUseGuardedResources(input, scenarioInput.scenario)) {
      const preserveOptions = shouldUseGuardedResources(input, scenarioInput.scenario)
        ? guardedLeanResourceOptions(input, runtime?.baselineCapture)
        : undefined;
      await context.route("**/*", async (route) => {
        const routeResourceType = route.request().resourceType();
        if (await maybeFulfillHeavyResource(route, preserveOptions)) {
          incrementCount(runtimeDiagnostics.blockedResourceCounts, routeResourceType);
          return;
        }
        await route.continue();
      });
    }

    page.on("request", (request) => {
      const requestUrl = request.url();
      if (!isHttpUrl(requestUrl)) {
        return;
      }
      const requestId = nextScenarioId("cf_req");
      requestIds.set(request, requestId);
      runtimeDiagnostics.activeRequestIds.add(requestId);
      incrementCount(runtimeDiagnostics.resourceTypeCounts, request.resourceType());
      const hostname = getHostname(requestUrl) ?? undefined;
      const registrableDomain = getRegistrableDomain(hostname) ?? undefined;
      const party = classifyHostnameParty(hostname, firstPartyHostname);
      const querySignals = querySignalsFromUrl(requestUrl);
      const collectionEndpoint = isCollectionEndpoint(requestUrl);
      const endpointAttribution = classifyConsentFlowEndpointAttribution({
        url: requestUrl,
        hostname,
        party,
        collectionEndpoint,
        queryParamNames: querySignals.queryParamNames,
      });
      const endpointGeography = resolveEndpointGeography({
        collectionEndpointObserved: collectionEndpoint,
        hostname,
        thirdParty: party === "third_party",
      });
      const state = actionApplied ? scenarioInput.consentState : "pre_consent";
      const event: NetworkEvent = {
        eventId: nextScenarioId("cf_net"),
        eventType: "network_request",
        requestId,
        timestampMs: elapsed(input.scanStartedAtMs),
        sourceScanner: SOURCE_SCANNER,
        scenario: scenarioInput.scenario,
        consentStateAtTime: state,
        pagePhase: actionApplied ? "post_interaction" : "initial_navigation",
        url: requestUrl,
        hostname,
        registrableDomain,
        firstParty: party === "first_party",
        thirdParty: party === "third_party",
        topLevelUrl: page.url() === "about:blank" ? input.normalizedUrl : page.url(),
        documentUrl: page.url() === "about:blank" ? undefined : page.url(),
        initiatorType: request.resourceType(),
        initiatorUrl: page.url() === "about:blank" ? undefined : page.url(),
        evidenceRefs: [],
        confidence: 0.92,
        directVsInferred: "direct",
        method: request.method(),
        resourceType: request.resourceType(),
        requestUrl,
        normalizedUrl: normalizeUrlSafely(requestUrl),
        requestHostname: hostname,
        path: pathFromUrl(requestUrl),
        queryParamNames: querySignals.queryParamNames,
        identifierParamNames: querySignals.identifierParamNames,
        advertisingClickIdParamNames: querySignals.advertisingClickIdParamNames,
        tagContainerParamNames: querySignals.tagContainerParamNames,
        hasIdentifierLikeParameters: querySignals.identifierParamNames.length > 0,
        hasAdvertisingClickIdParameters: querySignals.advertisingClickIdParamNames.length > 0,
        hasTagContainerParameters: querySignals.tagContainerParamNames.length > 0,
        isMainFrame: request.frame() === page.mainFrame(),
        isSubFrame: request.frame() !== page.mainFrame(),
        isThirdParty: party === "third_party",
        redirectChainRequestIds: [],
        requestHeaders: {
          secGpc: scenarioInput.scenario === "gpc_enabled" ? "1" : undefined,
          dnt: scenarioInput.scenario === "gpc_enabled" ? "1" : undefined,
          cookieHeaderPresent: false,
          cookieNames: [],
          authorizationHeaderPresent: false,
        },
        cookieHeaderPresent: false,
        cookieNamesSent: [],
        authorizationHeaderPresent: false,
        collectionEndpointObserved: collectionEndpoint,
        endpointCategory: endpointAttribution.category,
        endpointSubtype: endpointAttribution.subtype,
        attributionStatus: endpointAttribution.status,
        attributionReason: endpointAttribution.reason,
        resolverBasis: endpointAttribution.basis,
        endpointGeographyStatus: endpointGeography?.status,
        endpointGeographyRegion: endpointGeography?.region,
        endpointGeographyProvider: endpointGeography?.provider,
        endpointGeographyLocationLabel: endpointGeography?.locationLabel,
        endpointGeographyJurisdiction: endpointGeography?.jurisdiction,
        endpointGeographyPrecision: endpointGeography?.precision,
        endpointGeographyBasis: endpointGeography?.basis,
        relatedEvidenceRefs: [],
        requestPayloadSignals: { bodyPresent: false, bodyFieldNames: [] },
      };
      networkEvents.push(event);
      vendorResolverInputs.push({
        ...resolverInputForEvent(event),
        type: request.resourceType() === "script" ? "script" : "request",
        url: requestUrl,
        hostname,
      });
    });

    page.on("response", (response) => {
      const promise = captureResponse(response).catch(() => undefined);
      responseCapturePromises.push(promise);
    });
    page.on("requestfinished", (request) => {
      const requestId = requestIds.get(request);
      if (requestId) {
        runtimeDiagnostics.activeRequestIds.delete(requestId);
      }
    });
    page.on("requestfailed", (request) => {
      const requestId = requestIds.get(request);
      if (requestId) {
        runtimeDiagnostics.activeRequestIds.delete(requestId);
      }
      pushBounded(runtimeDiagnostics.requestFailures, {
        failureText: request.failure()?.errorText,
        method: request.method(),
        requestId,
        resourceType: request.resourceType(),
        url: sanitizeDiagnosticUrl(request.url()),
      }, 24);
    });
    page.on("pageerror", (error) => {
      pushBounded(runtimeDiagnostics.pageErrors, error.message.replace(/\s+/g, " ").slice(0, 240), 12);
    });
    page.on("console", (message) => {
      if (!["error", "warning"].includes(message.type())) {
        return;
      }
      pushBounded(runtimeDiagnostics.consoleMessages, {
        level: message.type(),
        text: message.text().replace(/\s+/g, " ").slice(0, 240),
      }, 16);
    });

    async function captureResponse(response: Response): Promise<void> {
      const responseUrl = response.url();
      if (!isHttpUrl(responseUrl)) {
        return;
      }

      const headers = await promiseWithTimeout(
        response.allHeaders().catch(() => response.headers()),
        750,
        response.headers(),
      );
      const request = response.request();
      const requestId = requestIds.get(request);
      const hostname = getHostname(responseUrl) ?? undefined;
      const registrableDomain = getRegistrableDomain(hostname) ?? undefined;
      const party = classifyHostnameParty(hostname, firstPartyHostname);
      const fallbackSetCookieHeaders = headers["set-cookie"] ? [headers["set-cookie"]] : [];
      const setCookieHeaders = await promiseWithTimeout(
        response.headerValues("set-cookie").catch(() => fallbackSetCookieHeaders),
        750,
        fallbackSetCookieHeaders,
      );
      const fixtureSetCookieHeaders = (input.routeFulfillers ?? [])
        .filter((fulfiller) => fulfiller.urlPattern.test(responseUrl))
        .flatMap((fulfiller) => fulfiller.setCookieHeaders ?? []);
      const effectiveSetCookieHeaders = [...setCookieHeaders, ...fixtureSetCookieHeaders];
      const setCookieMetadata = effectiveSetCookieHeaders
        .map((header) => parseSetCookieMetadata(header, hostname, firstPartyHostname))
        .filter((metadata): metadata is NonNullable<ReturnType<typeof parseSetCookieMetadata>> => Boolean(metadata));
      const state = actionApplied ? scenarioInput.consentState : "pre_consent";
      const currentPageUrl = page.url() === "about:blank" ? input.normalizedUrl : page.url();
      const sizes = normalizeResponseSizes(
        await promiseWithTimeout(
          response.request().sizes().catch(() => undefined),
          500,
          undefined,
        ),
      );
      networkResponseEvents.push({
        eventId: nextScenarioId("cf_resp"),
        eventType: "network_response",
        requestId,
        timestampMs: elapsed(input.scanStartedAtMs),
        sourceScanner: SOURCE_SCANNER,
        scenario: scenarioInput.scenario,
        consentStateAtTime: state,
        pagePhase: actionApplied ? "post_interaction" : "initial_navigation",
        url: responseUrl,
        hostname,
        registrableDomain,
        firstParty: party === "first_party",
        thirdParty: party === "third_party",
        topLevelUrl: currentPageUrl,
        documentUrl: currentPageUrl,
        evidenceRefs: [],
        confidence: 0.9,
        directVsInferred: "direct",
        responseUrl,
        normalizedUrl: normalizeUrlSafely(responseUrl),
        status: response.status(),
        contentType: headers["content-type"],
        mimeType: headers["content-type"],
        setCookieHeaders: effectiveSetCookieHeaders.map(redactSetCookieHeader),
        setCookieMetadata,
        cookieNamesSet: setCookieMetadata.map((metadata) => metadata.name),
        responseHeaders: safeResponseHeaders(headers),
        cacheHeaders: pickHeaders(headers, ["cache-control", "expires"]),
        locationRedirectHeader: headers.location,
        accessControlHeaders: pickHeaders(headers, [
          "access-control-allow-origin",
          "access-control-allow-credentials",
          "access-control-expose-headers",
        ]),
        timing: responseTiming(response),
        sizes,
      });
    }

    const navigationOutcome = await recordPhase("navigate_domcontentloaded", "Scenario navigation until DOMContentLoaded.", () =>
      navigateScenarioDomContentLoaded(input, page, targetUrl, scenarioInput.scenario, effectiveDeadlineAtMs)
    );
    if (navigationOutcome) {
      phaseTimings.push({
        label: "navigation_timeout_non_fatal",
        durationMs: 0,
        detail: navigationOutcome,
      });
    }
    await recordPhase(
      scenarioInput.scenario === "baseline_pre_consent" ? "baseline_network_idle" : "action_readiness_settle",
      scenarioInput.scenario === "baseline_pre_consent"
        ? "Baseline full-fidelity network-idle wait."
        : "Non-baseline action readiness probe plus bounded settle.",
      () => waitForScenarioReadiness(page, scenarioInput.scenario, input.internalBudgetMs, effectiveDeadlineAtMs),
    );
    if (scenarioInput.actionType && preActionObservationMs(input) > 0) {
      await recordPhase("pre_action_observation", "Payload-controlled bounded pre-action observation window.", () =>
        waitForTimeoutWithinDeadline(page, preActionObservationMs(input), effectiveDeadlineAtMs)
      );
    }

    const beforeDom = await recordPhase("pre_action_dom", "Pre-action DOM text capture.", () =>
      writeDomArtifact(input, page, scenarioInput.scenario, "before", "pre_consent")
    );
    cookieCountBeforeAction = await recordPhase("pre_action_cookie_count", "Pre-action cookie count snapshot.", () =>
      context.cookies().then((values) => values.length).catch(() => null)
    );
    storageCountBeforeAction = await recordPhase("pre_action_storage_count", "Pre-action storage count snapshot.", () =>
      browserStorageCount(page)
    );
    const beforeScreenshot = captureInlineScreenshots
      ? await recordPhase("pre_action_screenshot", "Pre-action screenshot capture.", () =>
        writeScreenshotArtifact(input, page, scenarioInput.scenario, "before", "pre_consent")
      )
      : undefined;
    if (scenarioInput.actionType) {
      runtimeDiagnostics.cmpSurfaceProbe = await recordPhase("cmp_api_surface_probe", "Bounded CMP API and global preference-surface probe before action candidate extraction.", () =>
        openCmpSurfaceIfAvailable(page, effectiveDeadlineAtMs)
      );
    }
    const reusableBaselineCandidates = reusableBaselineActionCandidates({
      baselineCapture: runtime?.baselineCapture,
      dom: beforeDom,
      input,
      scenario: scenarioInput.scenario,
      screenshot: beforeScreenshot,
      targetActionType: scenarioInput.actionType,
    });
    const baselineOnlyCandidateLane = shouldUseBaselineOnlyCandidates(
      input,
      scenarioInput.scenario,
      scenarioInput.actionType,
      runtime?.baselineCapture,
      reusableBaselineCandidates,
    );
    const candidateWorkDeadlineLimited = scenarioDeadlineNearlyHit(
      runtime?.deadlineAtMs ?? scenarioInput.deadlineAtMs,
      scenarioInput.actionType ? actionSearchMinimumRemainingMs(input) : 700,
    );
    const rawCandidates = baselineOnlyCandidateLane || candidateWorkDeadlineLimited
      ? await recordPhase(
        baselineOnlyCandidateLane ? "baseline_candidate_reuse" : "deadline_candidate_short_circuit",
        baselineOnlyCandidateLane
          ? "Reused baseline consent candidates instead of reclassifying this lane."
          : "Skipped lane candidate extraction because the global consent deadline was nearly exhausted.",
        async () => [] as RawControlCandidate[],
      )
      : await recordPhase("pre_action_candidate_extract", "Pre-action consent control extraction.", () =>
        extractControlCandidates(page, {
          actionType: scenarioInput.actionType,
          limit: controlCandidateLimit(input, scenarioInput.scenario, "pre_action"),
          scenario: scenarioInput.scenario,
        })
      );
    const recipeResearchCandidates = baselineOnlyCandidateLane || candidateWorkDeadlineLimited
      ? []
      : await recordPhase("recipe_candidate_extract", "Compact action recipe candidate extraction.", () =>
        extractRecipeResearchCandidates(page, scenarioInput.scenario, {
          limit: recipeCandidateLimit(input, scenarioInput.scenario),
        })
      );
    const beforeClassification = baselineOnlyCandidateLane || candidateWorkDeadlineLimited
      ? { actionCandidates: reusableBaselineCandidates, nanoAssistErrors: [] }
      : await recordPhase("pre_action_classification", "Pre-action deterministic/Nano candidate classification.", () =>
        classifyActionCandidates(input, page.url(), scenarioInput.scenario, rawCandidates, beforeDom, beforeScreenshot, {
          allowPreferenceOpenerAsTargetPath: true,
          nanoCandidateLimit: plannedNanoCandidateLimit(input, scenarioInput.scenario),
          skipNanoWhenHighConfidenceTarget: shouldPreferDeterministicTargetClassification(input, scenarioInput.scenario),
          targetActionType: scenarioInput.actionType,
        })
      );
    const targetActionType = scenarioInput.actionType;
    const oneTrustHiddenDiagnosticCandidates = targetActionType && shouldUseOneTrustHiddenActionDiagnostic(input)
      ? await recordPhase("onetrust_hidden_diagnostic_candidate_extract", "Extract local/dev diagnostic OneTrust hidden action candidates.", () =>
        extractOneTrustHiddenDiagnosticActionCandidates({
          dom: beforeDom,
          page,
          scenario: scenarioInput.scenario,
          screenshot: beforeScreenshot,
          surfaceProbe: runtimeDiagnostics.cmpSurfaceProbe,
          targetActionType,
        })
      )
      : [];
    const actionCandidates = mergeActionCandidates([
      ...reusableBaselineCandidates,
      ...beforeClassification.actionCandidates,
      ...oneTrustHiddenDiagnosticCandidates,
    ]);
    runtimeDiagnostics.recipeDiagnostics = scenarioRecipeDiagnostic({
      candidates: actionCandidates,
      input,
      scenario: scenarioInput.scenario,
    });
    if (scenarioInput.actionType) {
      const targetActionType = scenarioInput.actionType;
      await recordPhase("planner_candidate_diagnostics_write", "Write bounded planner candidate diagnostics.", () =>
        writePlannerCandidateDiagnosticsArtifact({
          actionCandidates,
          cmpSurfaceProbe: runtimeDiagnostics.cmpSurfaceProbe,
          input,
          rawCandidates,
          recipeResearchCandidates,
          scenario: scenarioInput.scenario,
          targetActionType,
        })
      );
    }
    const nanoAssistErrors = [...beforeClassification.nanoAssistErrors];
    const bannerPresentBefore = bannerLikelyPresent(actionCandidates, beforeDom.textExcerpt);
    const preActionConsentStateMarkers = await consentStateMarkers(page);
    const attempts: ConsentActionAttempt[] = [];

    if (scenarioInput.actionType) {
      const candidate = bestCandidate(actionCandidates, scenarioInput.actionType);
      const attemptId = `consent_attempt_${scenarioInput.scenario}_${scenarioInput.actionType}`;
      if (candidate?.shouldClick && candidate.confidence >= 0.78) {
        const actionTimestampMs = elapsed(input.scanStartedAtMs);
        await recordPhase("click_action", "Click selected consent action candidate.", () => clickCandidate(page, candidate));
        actionApplied = true;
        const postClickSettleMs = await recordPhase("post_click_settle", "Post-click consent-state settle.", () =>
          waitForConsentActionSettle(page, consentActionSettleBudgetMs(input, effectiveDeadlineAtMs), effectiveDeadlineAtMs)
        );
        const postActionConsentStateMarkers = await consentStateMarkers(page);
        const afterDom = await recordPhase("post_action_dom", "Post-action DOM text capture.", () =>
          writeDomArtifact(input, page, scenarioInput.scenario, "after", scenarioInput.consentState)
        );
        const budgetLimitedPostActionTail = shouldUseBudgetLimitedPostActionTail(input, scenarioInput.scenario, effectiveDeadlineAtMs);
        const postActionStateChanged = consentStateChangedAfterAction(preActionConsentStateMarkers, postActionConsentStateMarkers);
        const skipPostActionClassification = shouldSkipPostActionClassificationAfterProof(
          input,
          scenarioInput.scenario,
          true,
          postActionStateChanged,
        );
        let afterScreenshot = captureInlineScreenshots && !budgetLimitedPostActionTail && !skipPostActionClassification
          ? await recordPhase("post_action_screenshot", "Post-action screenshot capture.", () =>
            writeScreenshotArtifact(input, page, scenarioInput.scenario, "after", scenarioInput.consentState, {
              timeoutMs: screenshotTimeoutWithinDeadline(effectiveDeadlineAtMs),
            })
          )
          : undefined;
        const afterCandidates = budgetLimitedPostActionTail || skipPostActionClassification
          ? await recordPhase(
            budgetLimitedPostActionTail ? "deadline_post_action_candidate_short_circuit" : "post_action_candidate_skip_action_proof",
            budgetLimitedPostActionTail
              ? "Skipped optional post-action candidate extraction because the consent deadline was nearly exhausted."
              : "Skipped post-action candidate extraction because action proof already showed a consent state change.",
            async () => [] as RawControlCandidate[],
          )
          : await recordPhase("post_action_candidate_extract", "Post-action consent control extraction.", () =>
            extractControlCandidates(page, {
              actionType: scenarioInput.actionType,
              limit: controlCandidateLimit(input, scenarioInput.scenario, "post_action"),
              scenario: scenarioInput.scenario,
            })
          );
        const afterClassification = budgetLimitedPostActionTail || skipPostActionClassification
          ? await recordPhase(
            budgetLimitedPostActionTail ? "deadline_post_action_classification_short_circuit" : "post_action_classification_skip_action_proof",
            budgetLimitedPostActionTail
              ? "Skipped optional post-action classification because the consent deadline was nearly exhausted."
              : "Skipped post-action classification because action proof already showed a consent state change.",
            async () => ({ actionCandidates: [], nanoAssistErrors: [] }),
          )
          : await recordPhase("post_action_classification", "Post-action deterministic/Nano candidate classification.", () =>
            classifyActionCandidates(input, page.url(), scenarioInput.scenario, afterCandidates, afterDom, afterScreenshot, {
              allowNanoAssist: !shouldUseDeterministicOnlyActionTail(input, scenarioInput.scenario, effectiveDeadlineAtMs),
              nanoCandidateLimit: plannedNanoCandidateLimit(input, scenarioInput.scenario),
              targetActionType: scenarioInput.actionType,
            })
          );
        nanoAssistErrors.push(...afterClassification.nanoAssistErrors);
        const bannerPresentAfter = skipPostActionClassification
          ? false
          : bannerLikelyPresent(afterClassification.actionCandidates, afterDom.textExcerpt);
        const succeeded = bannerPresentBefore &&
          (!bannerPresentAfter || postActionStateChanged);
        const failureReason = succeeded
          ? undefined
          : directActionFailureReason({
            afterDomExcerpt: afterDom.textExcerpt,
            bannerPresentAfter,
            beforeDomExcerpt: beforeDom.textExcerpt,
            candidateContextTextExcerpt: candidate.contextTextExcerpt,
            candidateLabelText: candidate.labelText,
            postActionConsentStateMarkers,
            preActionConsentStateMarkers,
            scenario: scenarioInput.scenario,
          });
        if (!succeeded && !afterScreenshot && !budgetLimitedPostActionTail && !scenarioDeadlineNearlyHit(effectiveDeadlineAtMs, 1_200)) {
          afterScreenshot = await recordPhase("failure_screenshot", "Failure/ambiguous action screenshot capture.", () =>
            writeScreenshotArtifact(input, page, scenarioInput.scenario, "after_failure", scenarioInput.consentState, {
              timeoutMs: screenshotTimeoutWithinDeadline(effectiveDeadlineAtMs),
            })
          );
        }
        const evidenceRefs = [
          { refId: `ref_${beforeDom.artifactId}`, artifactId: beforeDom.artifactId, eventType: "dom_snapshot" as const, excerpt: beforeDom.textExcerpt },
          { refId: `ref_${afterDom.artifactId}`, artifactId: afterDom.artifactId, eventType: "dom_snapshot" as const, excerpt: afterDom.textExcerpt },
        ];
        const beforeScreenshotRef = artifactRefFromOptionalScreenshot(beforeScreenshot);
        const afterScreenshotRef = artifactRefFromOptionalScreenshot(afterScreenshot);
        const beforeDomRef = artifactRefFromDom(beforeDom);
        const afterDomRef = artifactRefFromDom(afterDom);
        attempts.push({
          attemptId,
          actionType: scenarioInput.actionType,
          attempted: true,
          succeeded,
          failureReason,
          actionProof: actionProof({
            afterDomRef,
            afterScreenshotRef,
            attempted: true,
            beforeDomRef,
            beforeScreenshotRef,
            candidate,
            evidenceRefs,
            failureReason,
            actionTimestampMs,
            afterDomExcerpt: afterDom.textExcerpt,
            beforeDomExcerpt: beforeDom.textExcerpt,
            cmpContext: detectCmpContext([beforeDom.textExcerpt, afterDom.textExcerpt, candidate.labelText, candidate.contextTextExcerpt]),
            actionPath: "direct_action",
            postActionConsentStateMarkers,
            preActionConsentStateMarkers,
            postClickSettleMs,
            succeeded,
          }),
          beforeScreenshotRef,
          afterScreenshotRef,
          beforeDomRef,
          afterDomRef,
          bannerPresentBefore,
          bannerPresentAfter,
          timestampMs: actionTimestampMs,
          scenario: scenarioInput.scenario,
          evidenceRefs,
        });
        if (
          !succeeded &&
          (scenarioInput.actionType === "reject_all" || scenarioInput.actionType === "accept_all") &&
          !scenarioDeadlineNearlyHit(effectiveDeadlineAtMs, 2_500)
        ) {
          const followupActionType = scenarioInput.actionType;
          const traversal = await recordPhase("preference_center_followup_traversal", "Follow-up preference-center traversal after direct action did not complete.", () => attemptPreferenceCenterRejectTraversal({
            input,
            page,
            scenario: scenarioInput.scenario,
            consentState: scenarioInput.consentState,
            targetActionType: followupActionType,
            scanStartedAtMs: input.scanStartedAtMs,
            actionCandidates: mergeActionCandidates([
              ...afterClassification.actionCandidates,
              ...actionCandidates,
            ]),
            beforeDom: afterDom,
            beforeScreenshot: afterScreenshot,
            bannerPresentBefore: bannerPresentAfter,
            preActionConsentStateMarkers: postActionConsentStateMarkers,
            nanoAssistErrors,
            nextId: nextScenarioId,
            deadlineAtMs: effectiveDeadlineAtMs,
            allowRejectSaveOnly: followupActionType === "reject_all",
          }));
          if (traversal) {
            actionApplied = traversal.succeeded;
            attempts.push({
              attemptId: `${attemptId}_preference_followup`,
              actionType: followupActionType,
              attempted: traversal.attempted,
              succeeded: traversal.succeeded,
              failureReason: traversal.succeeded ? undefined : traversal.failureReason,
              actionProof: traversal.actionProof,
              viaPreferenceCenter: true,
              preferenceCenterTraversal: traversal.preferenceCenterTraversal,
              beforeScreenshotRef: artifactRefFromOptionalScreenshot(afterScreenshot),
              afterScreenshotRef: traversal.afterScreenshotRef,
              beforeDomRef: artifactRefFromDom(afterDom),
              afterDomRef: traversal.afterDomRef,
              bannerPresentBefore: bannerPresentAfter,
              bannerPresentAfter: traversal.bannerPresentAfter,
              timestampMs: elapsed(input.scanStartedAtMs),
              scenario: scenarioInput.scenario,
              evidenceRefs: traversal.evidenceRefs,
            });
            actionCandidates.push(...afterClassification.actionCandidates, ...traversal.secondLayerCandidates);
            if (traversal.succeeded) {
              consentInteractionEvents.push({
                eventId: nextScenarioId("cf_consent"),
                eventType: "consent_interaction",
                timestampMs: elapsed(input.scanStartedAtMs),
                sourceScanner: SOURCE_SCANNER,
                scenario: scenarioInput.scenario,
                consentStateAtTime: scenarioInput.consentState,
                pagePhase: "post_interaction",
                url: page.url(),
                evidenceRefs: traversal.evidenceRefs,
                confidence: traversal.preferenceCenterTraversal.confidence,
                directVsInferred: "direct",
                action: followupActionType === "accept_all" ? "accept" : "reject",
                selector: traversal.clickedSelectorSummary,
                text: `${followupActionType === "accept_all" ? "accept" : "reject"} via preference center follow-up`,
              });
            }
          }
        }
        if (captureInlineScreenshots && succeeded && (scenarioInput.actionType === "accept_all" || scenarioInput.actionType === "reject_all")) {
          const reopenAttempt = await attemptPostChoicePreferenceReopen({
            input,
            page,
            scenario: scenarioInput.scenario,
            consentState: scenarioInput.consentState,
            scanStartedAtMs: input.scanStartedAtMs,
            actionCandidates: afterClassification.actionCandidates,
            beforeDom: afterDom,
            beforeScreenshot: afterScreenshot,
            bannerPresentBefore: bannerPresentAfter,
            preActionConsentStateMarkers: postActionConsentStateMarkers,
            nanoAssistErrors,
            nextId: nextScenarioId,
            deadlineAtMs: effectiveDeadlineAtMs,
          });
          if (reopenAttempt) {
            attempts.push({
              attemptId: `consent_attempt_${scenarioInput.scenario}_reopen_preferences`,
              actionType: "reopen_preferences",
              attempted: reopenAttempt.attempted,
              succeeded: reopenAttempt.succeeded,
              failureReason: reopenAttempt.succeeded ? undefined : reopenAttempt.failureReason,
              actionProof: reopenAttempt.actionProof,
              viaPreferenceCenter: true,
              preferenceCenterTraversal: reopenAttempt.preferenceCenterTraversal,
              beforeScreenshotRef: artifactRefFromOptionalScreenshot(afterScreenshot),
              afterScreenshotRef: reopenAttempt.afterScreenshotRef,
              beforeDomRef: artifactRefFromDom(afterDom),
              afterDomRef: reopenAttempt.afterDomRef,
              bannerPresentBefore: bannerPresentAfter,
              bannerPresentAfter: reopenAttempt.bannerPresentAfter,
              timestampMs: elapsed(input.scanStartedAtMs),
              scenario: scenarioInput.scenario,
              evidenceRefs: reopenAttempt.evidenceRefs,
            });
            actionCandidates.push(...afterClassification.actionCandidates, ...reopenAttempt.secondLayerCandidates);
          }
        }
        if (!succeeded && scenarioInput.actionType === "do_not_sell_share") {
          const formAttempt = await attemptPrivacyOptOutFormSubmission({
            input,
            page,
            scenario: scenarioInput.scenario,
            consentState: scenarioInput.consentState,
            scanStartedAtMs: input.scanStartedAtMs,
            beforeDom: afterDom,
            beforeScreenshot: afterScreenshot,
            candidate,
            bannerPresentBefore: bannerPresentAfter,
            preActionConsentStateMarkers: postActionConsentStateMarkers,
            nextId: nextScenarioId,
            deadlineAtMs: effectiveDeadlineAtMs,
          });
          if (formAttempt) {
            actionApplied = formAttempt.succeeded;
            attempts.push({
              attemptId: `${attemptId}_form_followup`,
              actionType: scenarioInput.actionType,
              attempted: formAttempt.attempted,
              succeeded: formAttempt.succeeded,
              failureReason: formAttempt.succeeded ? undefined : formAttempt.failureReason,
              actionProof: formAttempt.actionProof,
              beforeScreenshotRef: artifactRefFromOptionalScreenshot(afterScreenshot),
              afterScreenshotRef: formAttempt.afterScreenshotRef,
              beforeDomRef: artifactRefFromDom(afterDom),
              afterDomRef: formAttempt.afterDomRef,
              bannerPresentBefore: bannerPresentAfter,
              bannerPresentAfter: formAttempt.bannerPresentAfter,
              timestampMs: elapsed(input.scanStartedAtMs),
              scenario: scenarioInput.scenario,
              evidenceRefs: formAttempt.evidenceRefs,
            });
          } else if (customPrivacyFormVisible(afterDom.textExcerpt) || await customPrivacyFormVisibleOnPage(page)) {
            const afterDomRef = artifactRefFromDom(afterDom);
            const afterScreenshotRef = artifactRefFromOptionalScreenshot(afterScreenshot);
            const beforeDomRef = artifactRefFromDom(beforeDom);
            const beforeScreenshotRef = artifactRefFromOptionalScreenshot(beforeScreenshot);
            const formDiagnostic = await writePrivacyOptOutFormDiagnosticArtifact(input, page, scenarioInput.scenario, "after_selection");
            const diagnosticRefs = [
              artifactRefFromJsonArtifact(formDiagnostic, "privacy_opt_out_form_diagnostic_manual_review"),
            ].filter((ref): ref is ArtifactRef => Boolean(ref));
            const evidenceRefs = [
              { refId: `ref_${beforeDom.artifactId}`, artifactId: beforeDom.artifactId, eventType: "dom_snapshot" as const, excerpt: beforeDom.textExcerpt },
              { refId: `ref_${afterDom.artifactId}`, artifactId: afterDom.artifactId, eventType: "dom_snapshot" as const, excerpt: afterDom.textExcerpt },
              ...diagnosticRefs.map((ref) => ({
                refId: `ref_${ref.artifactId}`,
                artifactId: ref.artifactId,
                eventType: "dom_snapshot" as const,
                excerpt: ref.label,
              })),
            ];
            const failureReason = "manual_review_required_custom_privacy_form";
            attempts.push({
              attemptId: `${attemptId}_manual_review_custom_privacy_form`,
              actionType: scenarioInput.actionType,
              attempted: true,
              succeeded: false,
              failureReason,
              actionProof: actionProof({
                afterDomRef,
                afterScreenshotRef,
                attempted: true,
                beforeDomRef,
                beforeScreenshotRef,
                candidate,
                evidenceRefs,
                failureReason,
                actionTimestampMs: elapsed(input.scanStartedAtMs),
                afterDomExcerpt: afterDom.textExcerpt,
                beforeDomExcerpt: beforeDom.textExcerpt,
                cmpContext: detectCmpContext([beforeDom.textExcerpt, afterDom.textExcerpt, candidate.labelText, candidate.contextTextExcerpt]),
                actionPath: "privacy_opt_out_form",
                postActionConsentStateMarkers,
                preActionConsentStateMarkers,
                postClickSettleMs,
                succeeded: false,
              }),
              beforeScreenshotRef,
              afterScreenshotRef,
              beforeDomRef,
              afterDomRef,
              bannerPresentBefore,
              bannerPresentAfter,
              timestampMs: elapsed(input.scanStartedAtMs),
              scenario: scenarioInput.scenario,
              evidenceRefs,
            });
          }
        }
        consentInteractionEvents.push({
          eventId: nextScenarioId("cf_consent"),
          eventType: "consent_interaction",
          timestampMs: elapsed(input.scanStartedAtMs),
          sourceScanner: SOURCE_SCANNER,
          scenario: scenarioInput.scenario,
          consentStateAtTime: scenarioInput.consentState,
          pagePhase: "post_interaction",
          url: page.url(),
          evidenceRefs: attempts[0]?.evidenceRefs ?? [],
          confidence: candidate.confidence,
          directVsInferred: "direct",
          action: scenarioInput.actionType === "accept_all" ? "accept" : scenarioInput.actionType === "reject_all" ? "reject" : "settings",
          selector: candidate.selectorSummary,
          text: candidate.labelText,
        });
      } else if (scenarioInput.actionType === "do_not_sell_share") {
        const formAttempt = await attemptPrivacyOptOutFormSubmission({
          input,
          page,
          scenario: scenarioInput.scenario,
          consentState: scenarioInput.consentState,
          scanStartedAtMs: input.scanStartedAtMs,
          beforeDom,
          beforeScreenshot,
          candidate,
          bannerPresentBefore,
          preActionConsentStateMarkers,
          nextId: nextScenarioId,
          deadlineAtMs: effectiveDeadlineAtMs,
        });
        if (formAttempt) {
          actionApplied = formAttempt.succeeded;
          attempts.push({
            attemptId,
            actionType: scenarioInput.actionType,
            attempted: formAttempt.attempted,
            succeeded: formAttempt.succeeded,
            failureReason: formAttempt.succeeded ? undefined : formAttempt.failureReason,
            actionProof: formAttempt.actionProof,
            beforeScreenshotRef: artifactRefFromOptionalScreenshot(beforeScreenshot),
            afterScreenshotRef: formAttempt.afterScreenshotRef,
            beforeDomRef: artifactRefFromDom(beforeDom),
            afterDomRef: formAttempt.afterDomRef,
            bannerPresentBefore,
            bannerPresentAfter: formAttempt.bannerPresentAfter,
            timestampMs: elapsed(input.scanStartedAtMs),
            scenario: scenarioInput.scenario,
            evidenceRefs: formAttempt.evidenceRefs,
          });
          if (formAttempt.succeeded) {
            consentInteractionEvents.push({
              eventId: nextScenarioId("cf_consent"),
              eventType: "consent_interaction",
              timestampMs: elapsed(input.scanStartedAtMs),
              sourceScanner: SOURCE_SCANNER,
              scenario: scenarioInput.scenario,
              consentStateAtTime: scenarioInput.consentState,
              pagePhase: "post_interaction",
              url: page.url(),
              evidenceRefs: formAttempt.evidenceRefs,
              confidence: formAttempt.candidate?.confidence ?? 0.84,
              directVsInferred: "direct",
              action: "settings",
              selector: formAttempt.candidate?.selectorSummary,
              text: formAttempt.candidate?.labelText ?? "privacy opt-out form",
            });
          }
        } else {
          const evidenceRefs = [{ refId: `ref_${beforeDom.artifactId}`, artifactId: beforeDom.artifactId, eventType: "dom_snapshot" as const, excerpt: beforeDom.textExcerpt }];
          const beforeScreenshotRef = artifactRefFromOptionalScreenshot(beforeScreenshot);
          const beforeDomRef = artifactRefFromDom(beforeDom);
          const failureReason = candidate ? "candidate_confidence_too_low" : "candidate_not_observed";
          attempts.push({
            attemptId,
            actionType: scenarioInput.actionType,
            attempted: false,
            succeeded: false,
            failureReason,
            actionProof: actionProof({
              attempted: false,
              beforeDomRef,
              beforeScreenshotRef,
              candidate,
              evidenceRefs,
              failureReason,
              beforeDomExcerpt: beforeDom.textExcerpt,
              cmpContext: detectCmpContext([beforeDom.textExcerpt, candidate?.labelText, candidate?.contextTextExcerpt]),
              actionPath: "not_attempted",
              preActionConsentStateMarkers,
              succeeded: false,
            }),
            beforeScreenshotRef,
            beforeDomRef,
            bannerPresentBefore,
            timestampMs: elapsed(input.scanStartedAtMs),
            scenario: scenarioInput.scenario,
            evidenceRefs,
          });
        }
      } else if (scenarioInput.actionType === "reject_all" || scenarioInput.actionType === "accept_all") {
        const targetActionType = scenarioInput.actionType;
        const diagnosticRejectSaveCandidate = targetActionType === "reject_all" && shouldUseOneTrustHiddenActionDiagnostic(input)
          ? bestCandidate(actionCandidates, "save_preferences")
          : undefined;
        if (
          !candidate &&
          diagnosticRejectSaveCandidate?.shouldClick &&
          diagnosticRejectSaveCandidate.confidence >= 0.78 &&
          !bestPreferenceSurfaceOpener(actionCandidates)
        ) {
          const actionTimestampMs = elapsed(input.scanStartedAtMs);
          await recordPhase("diagnostic_reject_save_action", "Local/dev diagnostic OneTrust reject flow save-only action.", () =>
            clickCandidate(page, diagnosticRejectSaveCandidate)
          );
          const postClickSettleMs = await recordPhase("post_click_settle", "Post-click consent-state settle.", () =>
            waitForConsentActionSettle(page, consentActionSettleBudgetMs(input, effectiveDeadlineAtMs), effectiveDeadlineAtMs)
          );
          const postActionConsentStateMarkers = await consentStateMarkers(page);
          const afterDom = await recordPhase("post_action_dom", "Post-action DOM text capture.", () =>
            writeDomArtifact(input, page, scenarioInput.scenario, "after_diagnostic_reject_save", scenarioInput.consentState)
          );
          const postActionStateChanged = consentStateChangedAfterAction(preActionConsentStateMarkers, postActionConsentStateMarkers);
          const preferenceSurfaceChanged = domTextChangedAfterAction(beforeDom.textExcerpt, afterDom.textExcerpt);
          const succeeded = postActionStateChanged || preferenceSurfaceChanged;
          const failureReason = succeeded ? undefined : "preference_center_reject_path_not_completed";
          const evidenceRefs = [
            { refId: `ref_${beforeDom.artifactId}`, artifactId: beforeDom.artifactId, eventType: "dom_snapshot" as const, excerpt: beforeDom.textExcerpt },
            { refId: `ref_${afterDom.artifactId}`, artifactId: afterDom.artifactId, eventType: "dom_snapshot" as const, excerpt: afterDom.textExcerpt },
          ];
          const beforeScreenshotRef = artifactRefFromOptionalScreenshot(beforeScreenshot);
          const beforeDomRef = artifactRefFromDom(beforeDom);
          const afterDomRef = artifactRefFromDom(afterDom);
          actionApplied = succeeded;
          attempts.push({
            attemptId,
            actionType: scenarioInput.actionType,
            attempted: true,
            succeeded,
            failureReason,
            actionProof: actionProof({
              afterDomRef,
              attempted: true,
              beforeDomRef,
              beforeScreenshotRef,
              candidate: diagnosticRejectSaveCandidate,
              evidenceRefs,
              failureReason,
              actionTimestampMs,
              afterDomExcerpt: afterDom.textExcerpt,
              beforeDomExcerpt: beforeDom.textExcerpt,
              cmpContext: detectCmpContext([
                beforeDom.textExcerpt,
                afterDom.textExcerpt,
                diagnosticRejectSaveCandidate.labelText,
                diagnosticRejectSaveCandidate.contextTextExcerpt,
              ]),
              actionPath: "preference_center_reject_all_save",
              postActionConsentStateMarkers,
              preActionConsentStateMarkers,
              postClickSettleMs,
              succeeded,
            }),
            beforeScreenshotRef,
            beforeDomRef,
            afterDomRef,
            bannerPresentBefore,
            bannerPresentAfter: false,
            timestampMs: actionTimestampMs,
            scenario: scenarioInput.scenario,
            evidenceRefs,
          });
          if (succeeded) {
            consentInteractionEvents.push({
              eventId: nextScenarioId("cf_consent"),
              eventType: "consent_interaction",
              timestampMs: actionTimestampMs,
              sourceScanner: SOURCE_SCANNER,
              scenario: scenarioInput.scenario,
              consentStateAtTime: scenarioInput.consentState,
              pagePhase: "post_interaction",
              url: page.url(),
              evidenceRefs,
              confidence: diagnosticRejectSaveCandidate.confidence,
              directVsInferred: "direct",
              action: "reject",
              selector: diagnosticRejectSaveCandidate.selectorSummary,
              text: "reject via diagnostic OneTrust save-only action",
            });
          }
        } else {
        const traversal = await recordPhase("preference_center_traversal", "Preference-center open/action/save traversal.", () => attemptPreferenceCenterRejectTraversal({
          input,
          page,
          scenario: scenarioInput.scenario,
          consentState: scenarioInput.consentState,
          targetActionType,
          scanStartedAtMs: input.scanStartedAtMs,
          actionCandidates,
          beforeDom,
          beforeScreenshot,
          bannerPresentBefore,
          preActionConsentStateMarkers,
          nanoAssistErrors,
          nextId: nextScenarioId,
          deadlineAtMs: effectiveDeadlineAtMs,
          allowRejectSaveOnly: shouldUseOneTrustHiddenActionDiagnostic(input) && targetActionType === "reject_all",
        }));
        if (traversal) {
          actionApplied = traversal.succeeded;
          attempts.push({
            attemptId,
            actionType: scenarioInput.actionType,
            attempted: traversal.attempted,
            succeeded: traversal.succeeded,
            failureReason: traversal.succeeded ? undefined : traversal.failureReason,
            actionProof: traversal.actionProof,
            viaPreferenceCenter: true,
            preferenceCenterTraversal: traversal.preferenceCenterTraversal,
            beforeScreenshotRef: artifactRefFromOptionalScreenshot(beforeScreenshot),
            afterScreenshotRef: traversal.afterScreenshotRef,
            beforeDomRef: artifactRefFromDom(beforeDom),
            afterDomRef: traversal.afterDomRef,
            bannerPresentBefore,
            bannerPresentAfter: traversal.bannerPresentAfter,
            timestampMs: elapsed(input.scanStartedAtMs),
            scenario: scenarioInput.scenario,
            evidenceRefs: traversal.evidenceRefs,
          });
          actionCandidates.push(...traversal.secondLayerCandidates);
          if (traversal.succeeded) {
            consentInteractionEvents.push({
              eventId: nextScenarioId("cf_consent"),
              eventType: "consent_interaction",
              timestampMs: elapsed(input.scanStartedAtMs),
              sourceScanner: SOURCE_SCANNER,
              scenario: scenarioInput.scenario,
              consentStateAtTime: scenarioInput.consentState,
              pagePhase: "post_interaction",
              url: page.url(),
              evidenceRefs: traversal.evidenceRefs,
              confidence: traversal.preferenceCenterTraversal.confidence,
              directVsInferred: "direct",
              action: scenarioInput.actionType === "accept_all" ? "accept" : "reject",
              selector: traversal.clickedSelectorSummary,
              text: `${scenarioInput.actionType === "accept_all" ? "accept" : "reject"} via preference center`,
            });
          }
        } else {
          const evidenceRefs = [{ refId: `ref_${beforeDom.artifactId}`, artifactId: beforeDom.artifactId, eventType: "dom_snapshot" as const, excerpt: beforeDom.textExcerpt }];
          const beforeScreenshotRef = artifactRefFromOptionalScreenshot(beforeScreenshot);
          const beforeDomRef = artifactRefFromDom(beforeDom);
          const failureReason = candidate ? "candidate_confidence_too_low" : "candidate_not_observed";
          attempts.push({
            attemptId,
            actionType: scenarioInput.actionType,
            attempted: false,
            succeeded: false,
            failureReason,
            actionProof: actionProof({
              attempted: false,
              beforeDomRef,
              beforeScreenshotRef,
              candidate,
              evidenceRefs,
              failureReason,
              beforeDomExcerpt: beforeDom.textExcerpt,
              cmpContext: detectCmpContext([beforeDom.textExcerpt, candidate?.labelText, candidate?.contextTextExcerpt]),
              actionPath: "not_attempted",
              preActionConsentStateMarkers,
              succeeded: false,
            }),
            beforeScreenshotRef,
            beforeDomRef,
            bannerPresentBefore,
            timestampMs: elapsed(input.scanStartedAtMs),
            scenario: scenarioInput.scenario,
            evidenceRefs,
          });
        }
        }
      } else {
        const evidenceRefs = [{ refId: `ref_${beforeDom.artifactId}`, artifactId: beforeDom.artifactId, eventType: "dom_snapshot" as const, excerpt: beforeDom.textExcerpt }];
        const beforeScreenshotRef = artifactRefFromOptionalScreenshot(beforeScreenshot);
        const beforeDomRef = artifactRefFromDom(beforeDom);
        const failureReason = candidate ? "candidate_confidence_too_low" : "candidate_not_observed";
        attempts.push({
          attemptId,
          actionType: scenarioInput.actionType,
          attempted: false,
          succeeded: false,
          failureReason,
          actionProof: actionProof({
            attempted: false,
            beforeDomRef,
            beforeScreenshotRef,
            candidate,
            evidenceRefs,
            failureReason,
            beforeDomExcerpt: beforeDom.textExcerpt,
            cmpContext: detectCmpContext([beforeDom.textExcerpt, candidate?.labelText, candidate?.contextTextExcerpt]),
            actionPath: "not_attempted",
            preActionConsentStateMarkers,
            succeeded: false,
          }),
          beforeScreenshotRef,
          beforeDomRef,
          bannerPresentBefore,
          timestampMs: elapsed(input.scanStartedAtMs),
          scenario: scenarioInput.scenario,
          evidenceRefs,
        });
      }
    }

    const finalSettleMs = finalScenarioSettleMs(input, scenarioInput.scenario);
    runtimeDiagnostics.finalSettleMs = finalSettleMs;
    runtimeDiagnostics.finalSettleStartedAtMs = elapsed(input.scanStartedAtMs);
    await recordPhase("final_settle", `Final bounded post-scenario settle (${finalSettleMs}ms).`, () =>
      waitForTimeoutWithinDeadline(page, finalSettleMs, effectiveDeadlineAtMs)
    );
    await recordPhase("response_capture_flush", "Flush bounded async response metadata capture.", async () => {
      await Promise.all(responseCapturePromises.splice(0)).catch(() => undefined);
    });
    const cookies = await recordPhase("cookie_snapshot", "Browser context cookie snapshot.", async () => {
      try {
        return await context.cookies();
      } catch (error) {
        if (!isContextClosedError(error)) {
          throw error;
        }
        phaseTimings.push({
          label: "cookie_snapshot_context_closed_non_fatal",
          detail: "Cookie snapshot was unavailable because the scenario context had already closed after DOM/action evidence capture.",
          durationMs: 0,
        });
        return [];
      }
    });
    const storageCountAfterAction = await recordPhase("final_storage_count", "Final storage count snapshot.", () =>
      browserStorageCount(page)
    );
    const cookieSnapshot = cookieSnapshotForScenario(cookies, input, scenarioInput.scenario, actionApplied ? scenarioInput.consentState : "pre_consent");
    const snapshotCookieEvents = cookies.map((cookie) => {
      const hostname = cookie.domain.replace(/^\./, "");
      const party = classifyHostnameParty(hostname, firstPartyHostname);
      const event: CookieEvent = {
        eventId: nextScenarioId("cf_cookie"),
        eventType: "cookie",
        timestampMs: elapsed(input.scanStartedAtMs),
        sourceScanner: SOURCE_SCANNER,
        scenario: scenarioInput.scenario,
        consentStateAtTime: actionApplied ? scenarioInput.consentState : "pre_consent",
        pagePhase: actionApplied ? "post_interaction" : "network_idle",
        url: targetUrl,
        hostname,
        registrableDomain: getRegistrableDomain(hostname) ?? undefined,
        firstParty: party === "first_party",
        thirdParty: party === "third_party",
        evidenceRefs: [{ refId: `ref_${cookieSnapshot.artifactId}`, artifactId: cookieSnapshot.artifactId, label: cookie.name }],
        confidence: 0.85,
        directVsInferred: "direct",
        cookieName: cookie.name,
        cookieDomain: cookie.domain,
        cookiePath: cookie.path,
        sameSite: cookie.sameSite,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        cookieParty: party,
        vendorAssociated: /^_ga|_gid|_fbp|_clck/i.test(cookie.name),
        cookiePurpose: knownCookiePurpose(cookie.name),
        cookieClassificationBasis: ["browser_snapshot"],
        operation: "browser_snapshot",
        valueRedacted: true,
      };
      vendorResolverInputs.push({
        ...resolverInputForEvent(event, cookie.name),
        type: "cookie",
        cookieName: cookie.name,
        hostname,
        matchSource: "cookie_name",
      });
      return event;
    });
    cookieEvents.push(...snapshotCookieEvents);
    if (input.captureReplay) {
      replayArtifactRefs.push(...await captureReplayArtifacts({
        actionApplied,
        actionAttempts: attempts,
        actionCandidates,
        context,
        harPath,
        input,
        networkEvents,
        page,
        scenarioInput,
        sourceUrl: targetUrl,
      }));
    }

    const consentUiObservation: ConsentUiObservation = {
      observationId: `consent_ui_${scenarioInput.scenario}`,
      observedAtMs: elapsed(input.scanStartedAtMs),
      likelyPresent: bannerPresentBefore,
      basis: bannerPresentBefore ? ["consent_flow_action_candidates"] : ["no_confident_consent_controls"],
      textExcerpt: beforeDom.textExcerpt,
      layerInspected: "unknown",
      visibleChoiceLabels: [],
      acceptControlObserved: false,
      rejectControlObserved: false,
      managePreferencesControlObserved: false,
      controls: [],
      evidenceRefs: [{ refId: `ref_${beforeDom.artifactId}`, artifactId: beforeDom.artifactId, path: beforeDom.path }],
      confidence: bannerPresentBefore ? 0.76 : 0.45,
    };
    const diagnosticsRef = await recordPhase("runtime_diagnostics_write", "Write bounded per-scenario runtime diagnostics.", () =>
      writeScenarioRuntimeDiagnosticsArtifact({
        actionApplied,
        attempts,
        capture: {
          cookieEvents,
          networkEvents,
          networkResponseEvents,
          phaseTimings,
          scenario: scenarioInput.scenario,
        },
        input,
        runtimeDiagnostics,
      })
    );
    const qualityRef = await recordPhase("scenario_evidence_quality_write", "Write bounded per-scenario evidence quality artifact.", () =>
      writeScenarioEvidenceQualityArtifact({
        actionApplied,
        attempts,
        cookieCountAfterAction: cookies.length,
        cookieCountBeforeAction,
        evidenceExcerptCount: countScenarioEvidenceExcerpts({
          attempts,
          beforeDomExcerpt: beforeDom.textExcerpt,
        }),
        input,
        runtimeDiagnostics,
        scenario: scenarioInput.scenario,
        storageCountAfterAction,
        storageCountBeforeAction,
        totals: {
          actionCandidateCount: actionCandidates.length,
          cookieEventCount: cookieEvents.length,
          finalWindowNetworkEventCount: networkEvents.filter((event) =>
            event.timestampMs >= runtimeDiagnostics.finalSettleStartedAtMs
          ).length,
          networkEventCount: networkEvents.length,
          networkResponseEventCount: networkResponseEvents.length,
          postActionNetworkEventCount: networkEvents.filter((event) => event.pagePhase === "post_interaction").length,
        },
        uiObservation: consentUiObservation,
      })
    );

    const artifacts = [
      artifactRefFromDom(beforeDom),
      artifactRefFromOptionalScreenshot(beforeScreenshot),
      diagnosticsRef,
      qualityRef,
      ...attempts.flatMap((attempt) => [
        attempt.afterDomRef,
        attempt.afterScreenshotRef,
        ...(attempt.preferenceCenterTraversal?.domArtifactRefs ?? []),
        ...(attempt.preferenceCenterTraversal?.screenshotArtifactRefs ?? []),
      ].filter((ref): ref is ArtifactRef => Boolean(ref))),
      ...replayArtifactRefs,
    ].filter((ref): ref is ArtifactRef => Boolean(ref));

    return {
      scenario: scenarioInput.scenario,
      consentState: scenarioInput.consentState,
      actionType: scenarioInput.actionType,
      moduleStartedAtMs: scenarioInput.moduleStartedAtMs,
      nanoAssistErrors,
      networkEvents,
      networkResponseEvents,
      cookieEvents,
      cookieSnapshots: [cookieSnapshot],
      consentUiObservation,
      consentInteractionEvents,
      screenshots: [
        beforeScreenshot,
        ...attempts.flatMap((attempt) => attempt.afterScreenshotRef ? [screenshotFromRef(attempt.afterScreenshotRef, page.url(), scenarioInput.consentState)] : []),
        ...attempts.flatMap((attempt) =>
          (attempt.preferenceCenterTraversal?.screenshotArtifactRefs ?? []).map((ref) =>
            screenshotFromRef(ref, page.url(), "pre_consent"),
          ),
        ),
      ].filter((screenshot): screenshot is ScreenshotArtifact => Boolean(screenshot)),
      domSnapshots: [
        beforeDom,
        ...attempts.flatMap((attempt) => attempt.afterDomRef ? [domFromRef(attempt.afterDomRef, page.url(), scenarioInput.consentState)] : []),
        ...attempts.flatMap((attempt) =>
          (attempt.preferenceCenterTraversal?.domArtifactRefs ?? []).map((ref) =>
            domFromRef(ref, page.url(), "pre_consent"),
          ),
        ),
      ],
      actionCandidates,
      actionAttempts: attempts,
      consentFlowObservation: {
        observationId: `consent_flow_${scenarioInput.scenario}`,
        sourceScanner: SOURCE_SCANNER,
        scenario: scenarioInput.scenario,
        consentStateAtTime: actionApplied ? scenarioInput.consentState : "pre_consent",
        bannerLikelyPresent: bannerPresentBefore,
        actionCandidates,
        actionAttempts: attempts,
        textExcerpt: beforeDom.textExcerpt,
        evidenceRefs: [{ refId: `ref_${beforeDom.artifactId}`, artifactId: beforeDom.artifactId, excerpt: beforeDom.textExcerpt }],
        artifactRefs: artifacts,
        confidence: bannerPresentBefore ? 0.76 : 0.45,
        directVsInferred: "direct",
      },
      artifactRefs: artifacts,
      vendorResolverInputs,
      recipeResearchCandidates,
      phaseTimings,
    };
  } finally {
    if (deadlineTimer) {
      clearTimeout(deadlineTimer);
    }
    await promiseWithTimeout(closeContext(), contextCloseTimeoutMs(input), undefined);
    if (ownsBrowser) {
      await closeBrowserWithTimeout(browser);
    }
  }
}

function flattenResult(
  moduleStartedAt: string,
  moduleStartedAtMs: number,
  captures: ScenarioCapture[],
  comparisons: ConsentFlowComparison[],
  options: {
    omitRawEvidenceForScenarios?: Set<ConsentFlowScenario>;
  } = {},
): ConsentFlowRuntimeScannerResult {
  const errors = unique(captures.flatMap((capture) => capture.nanoAssistErrors));
  const rawCaptures = options.omitRawEvidenceForScenarios
    ? captures.filter((capture) => !options.omitRawEvidenceForScenarios?.has(capture.scenario))
    : captures;
  return {
    moduleRun: moduleRun(errors.length > 0 ? "partial" : "completed", moduleStartedAt, moduleStartedAtMs, errors),
    runtimeTimeline: rawCaptures.flatMap(runtimeTimeline),
    networkEvents: rawCaptures.flatMap((capture) => capture.networkEvents),
    networkResponseEvents: rawCaptures.flatMap((capture) => capture.networkResponseEvents),
    cookieEvents: rawCaptures.flatMap((capture) => capture.cookieEvents),
    cookieSnapshots: rawCaptures.flatMap((capture) => capture.cookieSnapshots),
    consentUiObservations: rawCaptures.map((capture) => capture.consentUiObservation),
    consentInteractionEvents: captures.flatMap((capture) => capture.consentInteractionEvents),
    screenshots: rawCaptures.flatMap((capture) => capture.screenshots),
    domSnapshots: rawCaptures.flatMap((capture) => capture.domSnapshots),
    consentFlowObservations: captures.map((capture) => capture.consentFlowObservation),
    consentActionCandidates: captures.flatMap((capture) => capture.actionCandidates),
    consentActionAttempts: captures.flatMap((capture) => capture.actionAttempts),
    consentFlowComparisons: comparisons,
    artifactRefs: rawCaptures.flatMap((capture) => capture.artifactRefs),
    vendorResolverInputs: captures.flatMap((capture) => capture.vendorResolverInputs),
  };
}

function rawEvidenceCaptures(captures: ScenarioCapture[], omitExternalBaseline: boolean): ScenarioCapture[] {
  return omitExternalBaseline
    ? captures.filter((capture) => capture.scenario !== "baseline_pre_consent")
    : captures;
}

function preConsentBaselineCapture(
  input: ConsentFlowRuntimeScannerInput,
  moduleStartedAtMs: number,
): ScenarioCapture | undefined {
  const preConsent = input.preConsentBaseline;
  if (!preConsent || input.scenarioPlanningMode !== "planned_parallel") {
    return undefined;
  }
  if (preConsent.moduleRun.status === "failed") {
    return undefined;
  }
  const dom = preConsent.domSnapshots[0];
  if (!dom) {
    return undefined;
  }
  const screenshot = preConsent.screenshots[0];
  const artifacts = [
    artifactRefFromDom(dom),
    artifactRefFromOptionalScreenshot(screenshot),
  ].filter((ref): ref is ArtifactRef => Boolean(ref));
  const consentUiObservation = preConsent.consentUiObservations[0] ?? {
    observationId: "consent_ui_baseline_pre_consent_reused",
    observedAtMs: elapsed(input.scanStartedAtMs),
    likelyPresent: false,
    basis: ["pre_consent_runtime_no_confident_consent_controls"],
    textExcerpt: dom.textExcerpt,
    layerInspected: "unknown" as const,
    visibleChoiceLabels: [],
    acceptControlObserved: false,
    rejectControlObserved: false,
    managePreferencesControlObserved: false,
    controls: [],
    evidenceRefs: [{ refId: `ref_${dom.artifactId}`, artifactId: dom.artifactId, path: dom.path }],
    confidence: 0.45,
  };
  return {
    scenario: "baseline_pre_consent",
    consentState: "pre_consent",
    moduleStartedAtMs,
    nanoAssistErrors: [],
    networkEvents: preConsent.networkEvents,
    networkResponseEvents: preConsent.networkResponseEvents,
    cookieEvents: preConsent.cookieEvents,
    cookieSnapshots: preConsent.cookieSnapshots,
    consentUiObservation,
    consentInteractionEvents: [],
    screenshots: screenshot ? [screenshot] : [],
    domSnapshots: [dom],
    actionCandidates: [],
    actionAttempts: [],
    consentFlowObservation: {
      observationId: "consent_flow_baseline_pre_consent",
      sourceScanner: SOURCE_SCANNER,
      scenario: "baseline_pre_consent",
      consentStateAtTime: "pre_consent",
      bannerLikelyPresent: false,
      actionCandidates: [],
      actionAttempts: [],
      textExcerpt: dom.textExcerpt,
      evidenceRefs: [{ refId: `ref_${dom.artifactId}`, artifactId: dom.artifactId, excerpt: dom.textExcerpt }],
      artifactRefs: artifacts,
      confidence: consentUiObservation.likelyPresent || preConsent.cmpRuntimeObservations.length > 0 ? 0.76 : 0.45,
      directVsInferred: "direct",
    },
    artifactRefs: artifacts,
    vendorResolverInputs: [],
    recipeResearchCandidates: [],
    phaseTimings: [{
      label: "external_pre_consent_baseline_reuse",
      detail: "Reused preConsentRuntimeScanner output as planned-DAG baseline to preserve consent-flow budget for scenario lanes.",
      durationMs: 0,
    }],
  };
}

function preConsentCmpEvidenceObserved(input: ConsentFlowRuntimeScannerInput): boolean {
  const preConsent = input.preConsentBaseline;
  if (!preConsent || preConsent.moduleRun.status === "failed") {
    return false;
  }
  return preConsent.cmpRuntimeObservations.length > 0 ||
    preConsent.consentUiObservations.some((observation) => observation.likelyPresent);
}

async function enrichExternalBaselineForPlanning(
  input: ConsentFlowRuntimeScannerInput,
  browser: Browser,
  baseline: ScenarioCapture,
  deadlineAtMs: number,
): Promise<ScenarioCapture> {
  if (baseline.actionCandidates.length > 0) {
    return baseline;
  }
  const dom = baseline.domSnapshots[0];
  if (!dom) {
    return baseline;
  }
  const startedAtMs = Date.now();
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1366, height: 900 },
  }).catch(() => undefined);
  if (!context) {
    return baseline;
  }
  try {
    for (const fulfiller of input.routeFulfillers ?? []) {
      await context.route(fulfiller.urlPattern, async (route: Route) => {
        await route.fulfill({
          status: fulfiller.status ?? 200,
          contentType: fulfiller.contentType ?? "text/plain",
          body: fulfiller.body ?? "",
          headers: fulfiller.headers,
        });
      });
    }
    if (input.stubHeavyResources) {
      await context.route("**/*", async (route) => {
        if (await maybeFulfillHeavyResource(route)) {
          return;
        }
        await route.continue();
      });
    }
    const page = await context.newPage();
    const navigationTimeoutMs = Math.min(8_000, remainingDeadlineMs(deadlineAtMs, 8_000));
    if (navigationTimeoutMs <= 0) {
      return baseline;
    }
    await page.goto(input.normalizedUrl, { waitUntil: "domcontentloaded", timeout: navigationTimeoutMs }).catch(() => undefined);
    await waitForTimeoutWithinDeadline(page, 750, deadlineAtMs);
    const surfaceProbe = await openCmpSurfaceIfAvailable(page, deadlineAtMs);
    const rawCandidates = await extractControlCandidates(page, {
      limit: PLANNED_BASELINE_CONTROL_LIMIT,
      scenario: "baseline_pre_consent",
    });
    const screenshot = baseline.screenshots[0];
    const classification = await classifyActionCandidates(input, page.url(), "baseline_pre_consent", rawCandidates, dom, screenshot, {
      allowPreferenceOpenerAsTargetPath: true,
      nanoCandidateLimit: plannedNanoCandidateLimit(input, "baseline_pre_consent"),
      skipNanoWhenHighConfidenceTarget: true,
    });
    const oneTrustHiddenDiagnosticCandidates = shouldUseOneTrustHiddenActionDiagnostic(input)
      ? [
        ...await extractOneTrustHiddenDiagnosticActionCandidates({
          dom,
          page,
          scenario: "baseline_pre_consent",
          screenshot,
          surfaceProbe,
          targetActionType: "accept_all",
        }),
        ...await extractOneTrustHiddenDiagnosticActionCandidates({
          dom,
          page,
          scenario: "baseline_pre_consent",
          screenshot,
          surfaceProbe,
          targetActionType: "reject_all",
        }),
      ]
      : [];
    const actionCandidates = mergeActionCandidates([
      ...classification.actionCandidates,
      ...oneTrustHiddenDiagnosticCandidates,
    ]).filter(candidateLikelyConsentRelevant);
    if (actionCandidates.length === 0) {
      return {
        ...baseline,
        nanoAssistErrors: unique([...baseline.nanoAssistErrors, ...classification.nanoAssistErrors]),
        phaseTimings: [
          ...baseline.phaseTimings,
          {
            label: "external_baseline_candidate_enrichment",
            detail: "Coordinator refreshed the reused baseline page for bounded action-candidate discovery; no actionable candidates were retained.",
            durationMs: Math.max(0, Date.now() - startedAtMs),
          },
        ],
      };
    }
    const likelyPresent = baseline.consentUiObservation.likelyPresent || bannerLikelyPresent(actionCandidates, dom.textExcerpt);
    return {
      ...baseline,
      actionCandidates,
      nanoAssistErrors: unique([...baseline.nanoAssistErrors, ...classification.nanoAssistErrors]),
      consentUiObservation: {
        ...baseline.consentUiObservation,
        likelyPresent,
        basis: unique([
          ...baseline.consentUiObservation.basis,
          "external_baseline_candidate_enrichment",
        ]),
        confidence: Math.max(baseline.consentUiObservation.confidence, likelyPresent ? 0.78 : 0.45),
      },
      consentFlowObservation: {
        ...baseline.consentFlowObservation,
        actionCandidates,
        bannerLikelyPresent: likelyPresent,
        confidence: Math.max(baseline.consentFlowObservation.confidence, likelyPresent ? 0.78 : 0.45),
      },
      phaseTimings: [
        ...baseline.phaseTimings,
        {
          label: "external_baseline_candidate_enrichment",
          detail: "Coordinator refreshed the reused baseline page for bounded action-candidate discovery.",
          durationMs: Math.max(0, Date.now() - startedAtMs),
        },
      ],
    };
  } catch {
    return baseline;
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function classifyActionCandidates(
  input: ConsentFlowRuntimeScannerInput,
  pageUrl: string,
  scenario: ConsentFlowScenario,
  rawCandidates: RawControlCandidate[],
  dom: DomSnapshotArtifact,
  screenshot: ScreenshotArtifact | undefined,
  options: ClassifyActionCandidateOptions = {},
): Promise<ClassifiedActionCandidates> {
  if (rawCandidates.length === 0) {
    return { actionCandidates: [], nanoAssistErrors: [] };
  }

  const deterministic = rawCandidates.map((candidate) => {
    const classification = classifyControlText(candidate.normalizedLabel, candidate.ariaLabel, candidate.contextTextExcerpt);
    const privacyOptOutClassification = scenario === "privacy_opt_out_flow"
      ? classifyPrivacyOptOutControl(candidate.normalizedLabel, candidate.ariaLabel, candidate.contextTextExcerpt)
      : undefined;
    return actionCandidateFromRaw(
      candidate,
      scenario,
      privacyOptOutClassification?.actionType ?? classification.actionType,
      privacyOptOutClassification?.confidence ?? classification.confidence,
      privacyOptOutClassification?.method ?? classification.method,
      dom,
      screenshot,
    );
  });

  if (options.skipNanoWhenHighConfidenceTarget && hasHighConfidenceDeterministicPath(deterministic, options)) {
    return { actionCandidates: deterministic, nanoAssistErrors: [] };
  }

  if (options.allowNanoAssist === false || !input.enableNanoConsentUiAssist || !input.nanoConsentUiAssistProvider) {
    return { actionCandidates: deterministic, nanoAssistErrors: [] };
  }

  const assistId = `nano_consent_ui_${scenario}`;
  const nanoCandidates = rankedNanoCandidates(deterministic, options);
  if (nanoCandidates.length === 0) {
    return { actionCandidates: deterministic, nanoAssistErrors: [] };
  }
  const providerInput = {
    assistId,
    pageUrl,
    candidates: nanoCandidates.map((candidate) => ({
      actionId: candidate.actionId,
      labelText: candidate.labelText,
      normalizedLabel: candidate.normalizedLabel,
      domLocation: candidate.domLocation,
      selectorSummary: candidate.selectorSummary,
    })),
  };
  let result: NanoConsentUiClassificationResult;
  try {
    result = await input.nanoConsentUiAssistProvider.classifyControls(providerInput);
  } catch (error) {
    const message = boundedError(`Nano consent UI assist failed for ${scenario}`, error);
    return {
      actionCandidates: deterministic.map((candidate) =>
        candidateLikelyConsentRelevant(candidate)
          ? withNanoUncertainty(candidate, assistId, message)
          : { ...candidate, shouldClick: false },
      ),
      nanoAssistErrors: [message],
    };
  }
  const byId = new Map(result.classifications.map((item) => [item.actionId, item]));
  return {
    actionCandidates: deterministic.map((candidate) => {
      const assisted = byId.get(candidate.actionId);
      if (!assisted) {
        if (highConfidenceDeterministicAction(candidate)) {
          return candidate;
        }
        return { ...candidate, shouldClick: false };
      }
      if (
        candidate.actionType === "reject_all" &&
        highConfidenceDeterministicAction(candidate) &&
        assisted.actionType === "accept_all" &&
        /accept\s+(?:essential|required|necessary)(?:\s+only)?/i.test(`${candidate.normalizedLabel} ${candidate.labelText}`)
      ) {
        return candidate;
      }
      if (highConfidenceExplicitAssistedAction(assisted.actionType, assisted.confidence)) {
        return {
          ...candidate,
          actionType: assisted.actionType,
          confidence: assisted.confidence,
          detectionMethod: "nano_assisted_ui_classification",
          shouldClick: (assisted.actionType === "do_not_sell_share" || !privacyChoiceOnlyActionLabel(candidate)) &&
            (assisted.shouldClick || highConfidenceExplicitAssistedAction(assisted.actionType, assisted.confidence)),
          assistMetadata: [{
            assistId,
            modelAssistProvider: "nano",
            assistType: "consent_ui_classification",
            confidence: assisted.confidence,
            uncertaintyNotes: assisted.uncertaintyNotes ?? [],
            usedForFinalFinding: false,
          }],
        };
      }
      if (highConfidenceDeterministicAction(candidate) &&
        (assisted.actionType === "unknown" || assisted.confidence < candidate.confidence)) {
        return candidate;
      }
      return {
        ...candidate,
        actionType: assisted.actionType,
        confidence: assisted.confidence,
        detectionMethod: "nano_assisted_ui_classification",
        shouldClick: (assisted.actionType === "do_not_sell_share" || !privacyChoiceOnlyActionLabel(candidate)) &&
          assisted.confidence >= 0.78 &&
          (assisted.shouldClick || highConfidenceExplicitAssistedAction(assisted.actionType, assisted.confidence)),
        assistMetadata: [{
          assistId,
          modelAssistProvider: "nano",
          assistType: "consent_ui_classification",
          confidence: assisted.confidence,
          uncertaintyNotes: assisted.uncertaintyNotes ?? [],
          usedForFinalFinding: false,
        }],
      };
    }),
    nanoAssistErrors: [],
  };
}

function highConfidenceDeterministicAction(candidate: ConsentActionCandidate): boolean {
  if (candidate.detectionMethod !== "deterministic_text") {
    return false;
  }
  if (candidate.actionType === "reject_all") {
    return candidate.confidence >= 0.85;
  }
  if (candidate.actionType === "save_preferences") {
    return candidate.confidence >= 0.85;
  }
  if (candidate.actionType === "do_not_sell_share") {
    return candidate.confidence >= 0.86;
  }
  return candidate.confidence >= 0.9 &&
    candidate.actionType === "accept_all";
}

function hasHighConfidenceDeterministicPath(
  candidates: ConsentActionCandidate[],
  options: ClassifyActionCandidateOptions,
): boolean {
  const targetActionType = options.targetActionType;
  if (!targetActionType) {
    return false;
  }
  const target = bestCandidate(candidates, targetActionType);
  if (target && highConfidenceDeterministicAction(target)) {
    return true;
  }
  if (targetActionType === "reject_all" || targetActionType === "accept_all") {
    return candidates.some((candidate) =>
      candidate.visible &&
      candidate.enabled &&
      candidate.detectionMethod === "deterministic_text" &&
      (candidate.actionType === "save_preferences" ||
        (options.allowPreferenceOpenerAsTargetPath === true && candidate.actionType === "manage_preferences")) &&
      candidate.confidence >= 0.84
    );
  }
  return false;
}

function rankedNanoCandidates(
  candidates: ConsentActionCandidate[],
  options: ClassifyActionCandidateOptions,
): ConsentActionCandidate[] {
  const limit = options.nanoCandidateLimit;
  const ranked = [...candidates].sort((left, right) =>
    nanoCandidatePriority(right, options.targetActionType) - nanoCandidatePriority(left, options.targetActionType) ||
    left.actionId.localeCompare(right.actionId)
  );
  return typeof limit === "number" ? ranked.slice(0, Math.max(0, limit)) : ranked;
}

function nanoCandidatePriority(
  candidate: ConsentActionCandidate,
  targetActionType: ConsentActionType | undefined,
): number {
  let score = candidate.confidence;
  if (targetActionType && candidate.actionType === targetActionType) {
    score += 1.2;
  }
  if ((targetActionType === "reject_all" || targetActionType === "accept_all") &&
    candidate.actionType === "manage_preferences") {
    score += 0.8;
  }
  if (candidate.actionType === "save_preferences") {
    score += 0.5;
  }
  if (candidateLikelyConsentRelevant(candidate)) {
    score += 0.35;
  }
  if (!candidate.visible || !candidate.enabled) {
    score -= 2;
  }
  return score;
}

function highConfidenceExplicitAssistedAction(actionType: ConsentActionType, confidence: number): boolean {
  if (["accept_all", "save_preferences", "do_not_sell_share"].includes(actionType)) {
    return confidence >= 0.9;
  }
  return actionType === "reject_all" && confidence >= 0.85;
}

function privacyChoiceOnlyActionLabel(candidate: ConsentActionCandidate): boolean {
  const value = `${candidate.normalizedLabel} ${candidate.labelText}`.toLowerCase();
  return /\bdo\s+not\s+(sell|share)|\bdo\s+not\s+sell\s+or\s+share\b|\byour\s+privacy\s+choices\b|\badchoices\b/.test(value);
}

function withNanoUncertainty(
  candidate: ConsentActionCandidate,
  assistId: string,
  note: string,
): ConsentActionCandidate {
  return {
    ...candidate,
    shouldClick: false,
    assistMetadata: [{
      assistId,
      modelAssistProvider: "nano",
      assistType: "consent_ui_classification",
      confidence: 0,
      uncertaintyNotes: [note],
      usedForFinalFinding: false,
    }],
  };
}

function boundedError(prefix: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${prefix}: ${message}`.replace(/\s+/g, " ").trim().slice(0, 240);
}

function candidateLikelyConsentRelevant(candidate: ConsentActionCandidate): boolean {
  const value = `${candidate.normalizedLabel} ${candidate.labelText}`.toLowerCase();
  return candidate.actionType !== "unknown" ||
    /cookie|privacy|choice|choices|consent|preference|preferences|settings|options|ad choices|do not sell|do not share|accept|agree|allow|reject|decline|deny|refuse|necessary|essential|save|continue/.test(value);
}

function controlCandidateLimit(
  input: ConsentFlowRuntimeScannerInput,
  scenario: ConsentFlowScenario,
  phase: "pre_action" | "post_action",
): number | undefined {
  if (input.scenarioPlanningMode !== "planned_parallel") {
    return undefined;
  }
  if (phase === "post_action") {
    return PLANNED_POST_ACTION_CONTROL_LIMIT;
  }
  if (scenario === "baseline_pre_consent") {
    return PLANNED_BASELINE_CONTROL_LIMIT;
  }
  if (scenario === "gpc_enabled") {
    return 0;
  }
  return PLANNED_ACTION_CONTROL_LIMIT;
}

function recipeCandidateLimit(
  input: ConsentFlowRuntimeScannerInput,
  scenario: ConsentFlowScenario,
): number | undefined {
  if (input.scenarioPlanningMode !== "planned_parallel") {
    return undefined;
  }
  if (scenario === "gpc_enabled") {
    return 0;
  }
  return PLANNED_RECIPE_CANDIDATE_LIMIT;
}

function plannedNanoCandidateLimit(
  input: ConsentFlowRuntimeScannerInput,
  scenario: ConsentFlowScenario,
): number | undefined {
  if (input.scenarioPlanningMode !== "planned_parallel") {
    return undefined;
  }
  if (scenario === "baseline_pre_consent") {
    return undefined;
  }
  if (scenario === "privacy_opt_out_flow") {
    return 18;
  }
  if (scenario === "reject_all_flow" || scenario === "accept_all_flow") {
    return 14;
  }
  return 10;
}

function shouldPreferDeterministicTargetClassification(
  input: ConsentFlowRuntimeScannerInput,
  scenario: ConsentFlowScenario,
): boolean {
  return input.scenarioPlanningMode === "planned_parallel" &&
    (scenario === "reject_all_flow" || scenario === "accept_all_flow" || scenario === "privacy_opt_out_flow");
}

function reusableBaselineActionCandidates(input: {
  baselineCapture: ScenarioCapture | undefined;
  dom: DomSnapshotArtifact;
  input: ConsentFlowRuntimeScannerInput;
  scenario: ConsentFlowScenario;
  screenshot: ScreenshotArtifact | undefined;
  targetActionType?: ConsentActionType;
}): ConsentActionCandidate[] {
  if (input.input.scenarioPlanningMode !== "planned_parallel" || !input.baselineCapture) {
    return [];
  }
  if (input.scenario === "baseline_pre_consent" || input.scenario === "privacy_opt_out_flow") {
    return [];
  }
  const allowedActionTypes = new Set<ConsentActionType>(
    input.scenario === "gpc_enabled"
      ? ["accept_all", "reject_all", "manage_preferences", "save_preferences", "do_not_sell_share"]
      : [
        input.targetActionType,
        "manage_preferences",
        "save_preferences",
      ].filter((value): value is ConsentActionType => Boolean(value)),
  );
  const screenshotRef = artifactRefFromOptionalScreenshot(input.screenshot);
  return input.baselineCapture.actionCandidates
    .filter((candidate) =>
      allowedActionTypes.has(candidate.actionType) &&
      candidate.visible &&
      candidate.enabled &&
      candidate.confidence >= (candidate.actionType === "manage_preferences" ? 0.76 : 0.78) &&
      candidateLikelyConsentRelevant(candidate)
    )
    .sort((left, right) =>
      baselineReuseScore(right, input.targetActionType) - baselineReuseScore(left, input.targetActionType) ||
      left.actionId.localeCompare(right.actionId)
    )
    .slice(0, input.scenario === "gpc_enabled" ? 16 : 12)
    .map((candidate, index) => ({
      ...candidate,
      actionId: `${input.scenario}_baseline_reuse_${index}_${candidate.actionId}`,
      evidenceRefs: [{
        refId: `ref_${input.dom.artifactId}_baseline_reuse_${index}`,
        artifactId: input.dom.artifactId,
        eventType: "dom_snapshot",
        label: candidate.labelText,
        excerpt: candidate.labelText,
      }],
      screenshotArtifactRefs: screenshotRef ? [screenshotRef] : [],
    }));
}

function baselineReuseScore(
  candidate: ConsentActionCandidate,
  targetActionType: ConsentActionType | undefined,
): number {
  let score = candidateActionScore(candidate, targetActionType ?? candidate.actionType);
  if (targetActionType && candidate.actionType === targetActionType) {
    score += 0.5;
  }
  if (candidate.actionType === "manage_preferences") {
    score += 0.2;
  }
  if (candidate.detectionMethod === "nano_assisted_ui_classification") {
    score += 0.1;
  }
  return score;
}

function shouldUseBaselineOnlyCandidates(
  input: ConsentFlowRuntimeScannerInput,
  scenario: ConsentFlowScenario,
  actionType: ConsentActionType | undefined,
  baselineCapture: ScenarioCapture | undefined,
  reusableCandidates: ConsentActionCandidate[],
): boolean {
  if (input.scenarioPlanningMode !== "planned_parallel") {
    return false;
  }
  if (scenario === "gpc_enabled") {
    return true;
  }
  if (!baselineCapture || !actionType || reusableCandidates.length === 0) {
    return false;
  }
  if (scenario === "privacy_opt_out_flow") {
    return false;
  }
  const hasActionPath = reusableCandidates.some((candidate) =>
    candidate.actionType === actionType || candidate.actionType === "manage_preferences"
  );
  return hasActionPath && baselineCapture.actionCandidates.length >= BASELINE_REUSE_WIDE_PAGE_THRESHOLD;
}

function scenarioDeadlineNearlyHit(deadlineAtMs: number | undefined, minimumRemainingMs: number): boolean {
  return typeof deadlineAtMs === "number" && deadlineAtMs - Date.now() < minimumRemainingMs;
}

function isBrowserContextClosedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /target page, context or browser has been closed|browserContext\.newPage|browser has been closed/i.test(message);
}

function isChoiceActionScenario(scenario: ConsentFlowScenario): boolean {
  return scenario === "reject_all_flow" || scenario === "accept_all_flow" || scenario === "privacy_opt_out_flow";
}

function shouldUseBudgetLimitedPostActionTail(
  input: ConsentFlowRuntimeScannerInput,
  scenario: ConsentFlowScenario,
  deadlineAtMs: number | undefined,
): boolean {
  return input.scenarioPlanningMode === "planned_parallel" &&
    isChoiceActionScenario(scenario) &&
    scenarioDeadlineNearlyHit(deadlineAtMs, 2_200);
}

function shouldSkipPostActionClassificationAfterProof(
  input: ConsentFlowRuntimeScannerInput,
  scenario: ConsentFlowScenario,
  attempted: boolean,
  consentStateChanged: boolean,
): boolean {
  return input.scenarioPlanningMode === "planned_parallel" &&
    isChoiceActionScenario(scenario) &&
    attempted &&
    consentStateChanged;
}

function shouldUseDeterministicOnlyActionTail(
  input: ConsentFlowRuntimeScannerInput,
  scenario: ConsentFlowScenario,
  deadlineAtMs: number | undefined,
): boolean {
  return input.scenarioPlanningMode === "planned_parallel" &&
    isChoiceActionScenario(scenario) &&
    scenarioDeadlineNearlyHit(deadlineAtMs, 4_500);
}

function consentActionSettleBudgetMs(input: ConsentFlowRuntimeScannerInput, deadlineAtMs: number | undefined): number {
  if (input.scenarioPlanningMode !== "planned_parallel") {
    return 3_000;
  }
  const remainingMs = remainingDeadlineMs(deadlineAtMs, 3_000);
  if (remainingMs < 2_500) {
    return 650;
  }
  if (remainingMs < 4_500) {
    return 1_000;
  }
  return 2_000;
}

async function navigateScenarioDomContentLoaded(
  input: ConsentFlowRuntimeScannerInput,
  page: Page,
  targetUrl: string,
  scenario: ConsentFlowScenario,
  deadlineAtMs: number | undefined,
): Promise<string | undefined> {
  const baseTimeoutMs = scenario === "baseline_pre_consent"
    ? 12_000
    : input.scenarioPlanningMode === "planned_parallel" ? 6_000 : 8_000;
  const timeout = Math.min(input.internalBudgetMs, baseTimeoutMs, remainingDeadlineMs(deadlineAtMs, baseTimeoutMs));
  if (timeout <= 0) {
    if (input.scenarioPlanningMode === "planned_parallel" && scenario !== "baseline_pre_consent") {
      return "Skipped non-baseline navigation because the scenario budget was already exhausted.";
    }
    throw new Error(`Scenario ${scenario} deadline reached before navigation.`);
  }
  try {
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout,
    });
    return undefined;
  } catch (error) {
    if (shouldTreatScenarioNavigationTimeoutAsNonFatal(input, scenario, error)) {
      return `Navigation did not reach DOMContentLoaded within ${timeout}ms; retained partial lane evidence and continued.`;
    }
    throw error;
  }
}

function shouldTreatScenarioNavigationTimeoutAsNonFatal(
  input: ConsentFlowRuntimeScannerInput,
  scenario: ConsentFlowScenario,
  error: unknown,
): boolean {
  if (input.scenarioPlanningMode !== "planned_parallel" || scenario === "baseline_pre_consent") {
    return false;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /page\.goto: Timeout|Navigation timeout|Timeout \d+ms exceeded/i.test(message);
}

function screenshotTimeoutWithinDeadline(deadlineAtMs: number | undefined): number {
  if (typeof deadlineAtMs !== "number") {
    return 5_000;
  }
  return Math.max(250, Math.min(5_000, deadlineAtMs - Date.now() - 250));
}

async function waitForTimeoutWithinDeadline(page: Page, requestedMs: number, deadlineAtMs?: number): Promise<void> {
  const waitMs = Math.min(requestedMs, remainingDeadlineMs(deadlineAtMs, requestedMs));
  if (waitMs <= 0) {
    return;
  }
  await page.waitForTimeout(waitMs).catch((error) => {
    if (deadlineAtMs !== undefined && Date.now() >= deadlineAtMs) {
      return;
    }
    throw error;
  });
}

function remainingDeadlineMs(deadlineAtMs: number | undefined, fallbackMs: number): number {
  if (typeof deadlineAtMs !== "number") {
    return fallbackMs;
  }
  return Math.max(0, deadlineAtMs - Date.now());
}

function mergeActionCandidates(candidates: ConsentActionCandidate[]): ConsentActionCandidate[] {
  const byKey = new Map<string, ConsentActionCandidate>();
  for (const candidate of candidates) {
    const key = [
      candidate.selectorSummary,
      candidate.actionType,
      candidate.normalizedLabel,
    ].join("|");
    const existing = byKey.get(key);
    if (!existing || baselineReuseScore(candidate, candidate.actionType) > baselineReuseScore(existing, existing.actionType)) {
      byKey.set(key, candidate);
    }
  }
  return [...byKey.values()].sort((left, right) =>
    baselineReuseScore(right, right.actionType) - baselineReuseScore(left, left.actionType) ||
    left.actionId.localeCompare(right.actionId)
  );
}

function rankAndLimitRawCandidates(
  candidates: RawControlCandidate[],
  options: {
    actionType?: ConsentActionType;
    limit?: number;
    scenario?: ConsentFlowScenario;
  },
): RawControlCandidate[] {
  if (options.limit === 0) {
    return [];
  }
  const ranked = candidates
    .map((candidate, index) => ({
      candidate,
      index,
      score: rawControlCandidateScore(candidate, options.actionType, options.scenario),
    }))
    .filter((entry) => typeof options.limit !== "number" || entry.score >= PLANNED_MIN_CONTROL_SCORE)
    .sort((left, right) =>
      right.score - left.score ||
      (left.candidate.frameContext?.frameKind ?? "").localeCompare(right.candidate.frameContext?.frameKind ?? "") ||
      left.candidate.candidateIndex - right.candidate.candidateIndex ||
      left.index - right.index
    )
    .map((entry) => entry.candidate);
  return typeof options.limit === "number" ? ranked.slice(0, options.limit) : ranked;
}

export function rawControlCandidateScore(
  candidate: RawControlCandidate,
  actionType: ConsentActionType | undefined,
  scenario: ConsentFlowScenario | undefined,
): number {
  const labelValue = `${candidate.normalizedLabel} ${candidate.labelText} ${candidate.ariaLabel ?? ""}`.toLowerCase();
  const value = `${labelValue} ${candidate.contextTextExcerpt ?? ""}`.toLowerCase();
  let score = candidate.enabled ? 5 : 0;
  score += candidate.frameContext?.frameKind === "main_frame" ? 2 : 0;
  if (/cookie|consent|privacy|preference|preferences|settings|choice|choices|cmp|onetrust|trustarc|sourcepoint|didomi|cookiebot/.test(value)) {
    score += 30;
  }
  if (/\bad choices\b|privacy and ad settings|review all privacy|your privacy choices|data privacy rights|state privacy rights|privacy rights|cookie settings|cookie preferences|privacy settings|privacy preference|preference center|manage cookies|manage preferences|privacy preferences/.test(value)) {
    score += 80;
  }
  if (/accept|agree|allow|reject|decline|deny|refuse|necessary|essential|save|confirm|apply|submit|opt[- ]out|do not sell|do not share/.test(value)) {
    score += 35;
  }
  if (actionType === "reject_all" && /reject|decline|deny|refuse|necessary|essential|opt[- ]out/.test(value)) {
    score += 45;
  }
  if (actionType === "accept_all" && /accept|agree|allow|consent/.test(value)) {
    score += 45;
  }
  if (actionType === "do_not_sell_share" || scenario === "privacy_opt_out_flow") {
    if (/do not sell|do not share|privacy choices|privacy and ad settings|review all privacy|data privacy rights|state privacy rights|privacy rights|opt[- ]out|targeted advertising/.test(value)) {
      score += 50;
    }
  }
  if (/privacy policy|cookie policy|terms of|accessibility|careers|advertise|subscribe|newsletter/.test(labelValue)) {
    score -= 80;
  }
  if (/readers?' choice|choice awards?|book now|watch now|save story/.test(labelValue)) {
    score -= 80;
  }
  if (candidate.role === "a" && !/accept|agree|allow|reject|decline|deny|refuse|necessary|essential|save|confirm|apply|submit|settings|preferences|choices|rights|opt[- ]out|do not sell|do not share/.test(labelValue)) {
    score -= 30;
  }
  return score;
}

export function textFallbackConsentControlAction(label: string, scenario?: ConsentFlowScenario): {
  actionType: ConsentActionType;
  confidence: number;
} | undefined {
  const normalized = label.toLowerCase().replace(/\s+/g, " ").trim();
  if (/^(do not sell or share my personal information|do not sell or share|do not sell my personal information|your privacy choices|your data privacy rights|data privacy rights|your state privacy rights|state privacy rights|your us state privacy rights|us state privacy rights)$/.test(normalized)) {
    return { actionType: "do_not_sell_share", confidence: 0.88 };
  }
  if (/^(review all privacy and ad settings|privacy settings|cookie settings|privacy preferences|manage preferences)$/.test(normalized)) {
    return {
      actionType: scenario === "privacy_opt_out_flow" ? "do_not_sell_share" : "manage_preferences",
      confidence: scenario === "privacy_opt_out_flow" ? 0.86 : 0.84,
    };
  }
  if (/^(reject all|decline all|only necessary|necessary only|essential only)$/.test(normalized)) {
    return { actionType: "reject_all", confidence: 0.9 };
  }
  if (/^(accept all|allow all|accept cookies|i agree)$/.test(normalized)) {
    return { actionType: "accept_all", confidence: 0.9 };
  }
  return undefined;
}

async function extractControlCandidates(
  page: Page,
  options: {
    actionType?: ConsentActionType;
    limit?: number;
    scenario?: ConsentFlowScenario;
  } = {},
): Promise<RawControlCandidate[]> {
  const candidates: RawControlCandidate[] = [];
  const frames = page.frames();
  for (const [frameIndex, frame] of frames.entries()) {
    const frameCandidates = await frame.evaluate((input) => {
      type DeepControl = {
        domLocation: string;
        element: Element;
        shadowPath: number[];
      };
      type RawCandidate = {
        actionId: string;
        candidateIndex: number;
        labelText: string;
        normalizedLabel: string;
        selectorSummary: string;
        domLocation: string;
        contextTextExcerpt: string;
        frameContext: {
          frameKind: "main_frame" | "sub_frame";
          frameUrl: string;
          frameName?: string;
        };
        visible: boolean;
        enabled: boolean;
        role: string;
        ariaLabel?: string;
      };
      const controlSelector = "button, [role='button'], input[type='button'], input[type='submit'], a, [aria-label], [data-testid], [data-test], [id*='consent' i], [id*='privacy' i], [class*='consent' i], [class*='privacy' i], [class*='cookie' i]";
      const controls: DeepControl[] = [];
      const visit = (root: Document | ShadowRoot, shadowPath: number[], hostPath: string[]) => {
        const rootControls = [...root.querySelectorAll(controlSelector)];
        for (const [controlIndex, element] of rootControls.entries()) {
          controls.push({
            domLocation: [...hostPath, element.tagName.toLowerCase()].slice(-6).join(">"),
            element,
            shadowPath: [...shadowPath, controlIndex],
          });
        }
        const shadowHosts = [...root.querySelectorAll("*")].filter((element) => Boolean(element.shadowRoot));
        for (const [hostIndex, host] of shadowHosts.entries()) {
          const shadowRoot = host.shadowRoot;
          if (shadowRoot) {
            visit(shadowRoot, [...shadowPath, -1, hostIndex], [...hostPath, `${host.tagName.toLowerCase()}#shadow`]);
          }
        }
      };
      visit(document, [], ["document"]);
      const contextTextExcerpt = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
      const candidates: RawCandidate[] = controls.map(({ domLocation, element, shadowPath }, index) => {
        const rect = element.getBoundingClientRect();
        const inputElement = element as HTMLInputElement;
        const childImage = element instanceof HTMLImageElement ? element : element.querySelector("img[alt], img[title]");
        const htmlElement = element as HTMLElement;
        const visibleText = htmlElement.innerText || element.textContent || "";
        const text = (
          visibleText ||
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          childImage?.getAttribute("aria-label") ||
          childImage?.getAttribute("title") ||
          childImage?.getAttribute("alt") ||
          inputElement.value ||
          element.getAttribute("data-testid") ||
          element.getAttribute("data-test") ||
          element.id ||
          element.className?.toString() ||
          ""
        ).replace(/\s+/g, " ").trim();
        const parentNames: string[] = [domLocation].filter(Boolean);
        let parent = element.parentElement;
        while (parent && parentNames.length < 4) {
          parentNames.push(parent.tagName.toLowerCase());
          parent = parent.parentElement;
        }
        return {
          actionId: `consent_control_${input.frameIndex}_${index}`,
          candidateIndex: index,
          labelText: text.slice(0, 160),
          normalizedLabel: text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 160),
          selectorSummary: input.frameIndex === 0
            ? `deepControlIndex:${index};shadowPath:${shadowPath.join(".")}`
            : `frameIndex:${input.frameIndex};deepControlIndex:${index};shadowPath:${shadowPath.join(".")}`,
          domLocation: parentNames.join(">"),
          contextTextExcerpt,
          frameContext: {
            frameKind: input.frameIndex === 0 ? "main_frame" as const : "sub_frame" as const,
            frameUrl: input.frameUrl,
            frameName: input.frameName || undefined,
          },
          visible: rect.width > 0 && rect.height > 0,
          enabled: !(element as HTMLButtonElement).disabled && element.getAttribute("aria-disabled") !== "true",
          role: element.getAttribute("role") || element.tagName.toLowerCase(),
          ariaLabel: element.getAttribute("aria-label") || undefined,
        };
      }).filter((candidate) => candidate.labelText.length > 0 && candidate.visible);
      const existingLabels = new Set(candidates.map((candidate) => candidate.normalizedLabel));
      const bodyText = document.body?.innerText ?? "";
      const fallbackLabels = [
        "Review All Privacy and Ad Settings",
        "Do Not Sell or Share My Personal Information",
        "Your Privacy Choices",
        "Privacy Settings",
        "Cookie Settings",
        "Manage Preferences",
        "Reject All",
        "Decline All",
        "Only Necessary",
        "Accept All",
        "Allow All",
        "Accept Cookies",
      ];
      for (const label of fallbackLabels) {
        const normalizedLabel = label.toLowerCase().replace(/\s+/g, " ").trim();
        if (existingLabels.has(normalizedLabel) || !bodyText.includes(label)) {
          continue;
        }
        candidates.push({
          actionId: `consent_text_control_${input.frameIndex}_${candidates.length}`,
          candidateIndex: candidates.length,
          labelText: label,
          normalizedLabel,
          selectorSummary: input.frameIndex === 0
            ? `textControl:${encodeURIComponent(label)}`
            : `frameIndex:${input.frameIndex};textControl:${encodeURIComponent(label)}`,
          domLocation: "document>text_control",
          contextTextExcerpt,
          frameContext: {
            frameKind: input.frameIndex === 0 ? "main_frame" as const : "sub_frame" as const,
            frameUrl: input.frameUrl,
            frameName: input.frameName || undefined,
          },
          visible: true,
          enabled: true,
          role: "text",
        });
      }
      return candidates;
    }, {
      frameIndex,
      frameName: frame.name(),
      frameUrl: frame.url(),
    }).catch(() => []);
    candidates.push(...frameCandidates);
  }
  const textFallbackCandidates = await extractTextFallbackControlCandidates(page, options.scenario);
  const existingLabels = new Set(candidates.map((candidate) => candidate.normalizedLabel));
  for (const candidate of textFallbackCandidates) {
    if (!existingLabels.has(candidate.normalizedLabel)) {
      existingLabels.add(candidate.normalizedLabel);
      candidates.push(candidate);
    }
  }
  return rankAndLimitRawCandidates(candidates, options);
}

async function extractTextFallbackControlCandidates(
  page: Page,
  scenario: ConsentFlowScenario | undefined,
): Promise<RawControlCandidate[]> {
  const candidates: RawControlCandidate[] = [];
  for (const [frameIndex, frame] of page.frames().entries()) {
    const bodyText = await frame.locator("body").innerText({ timeout: 500 }).catch(() => "");
    if (!bodyText) {
      continue;
    }
    const normalizedBodyText = bodyText.toLowerCase().replace(/\s+/g, " ");
    const contextTextExcerpt = bodyText.replace(/\s+/g, " ").trim().slice(0, 500);
    const fallbackLabels = [
      "Review All Privacy and Ad Settings",
      "Do Not Sell or Share My Personal Information",
      "Your Privacy Choices",
      "Your Data Privacy Rights",
      "Data Privacy Rights",
      "Your State Privacy Rights",
      "State Privacy Rights",
      "Your US State Privacy Rights",
      "US State Privacy Rights",
      "Privacy Settings",
      "Cookie Settings",
      "Manage Preferences",
      "Reject All",
      "Decline All",
      "Only Necessary",
      "Accept All",
      "Allow All",
      "Accept Cookies",
    ];
    for (const label of fallbackLabels) {
      const normalizedLabel = label.toLowerCase().replace(/\s+/g, " ").trim();
      if (!normalizedBodyText.includes(normalizedLabel) || !textFallbackConsentControlAction(label, scenario)) {
        continue;
      }
      candidates.push({
        actionId: `consent_text_control_${frameIndex}_${candidates.length}`,
        candidateIndex: candidates.length,
        labelText: label,
        normalizedLabel,
        selectorSummary: frameIndex === 0
          ? `textControl:${encodeURIComponent(label)}`
          : `frameIndex:${frameIndex};textControl:${encodeURIComponent(label)}`,
        domLocation: "document>text_control",
        contextTextExcerpt,
        frameContext: {
          frameKind: frameIndex === 0 ? "main_frame" : "sub_frame",
          frameUrl: frame.url(),
          frameName: frame.name() || undefined,
        },
        visible: true,
        enabled: true,
        role: "text",
      });
    }
  }
  return candidates;
}

async function extractRecipeResearchCandidates(
  page: Page,
  scenario: ConsentFlowScenario,
  options: { limit?: number } = {},
): Promise<ConsentRecipeResearchCandidate[]> {
  const candidates: ConsentRecipeResearchCandidate[] = [];
  const frames = page.frames();
  for (const [frameIndex, frame] of frames.entries()) {
    const frameCandidates = await frame.evaluate((input) => {
      type DeepControl = {
        domLocation: string;
        element: Element;
      };
      const controlSelector = "a, button, [role='button'], input[type='button'], input[type='submit'], [aria-label], [data-testid], [data-test], [id*='consent' i], [id*='privacy' i], [class*='consent' i], [class*='privacy' i], [class*='cookie' i]";
      const controls: DeepControl[] = [];
      const visit = (root: Document | ShadowRoot, hostPath: string[]) => {
        for (const element of [...root.querySelectorAll(controlSelector)]) {
          controls.push({
            domLocation: [...hostPath, element.tagName.toLowerCase()].slice(-6).join(">"),
            element,
          });
        }
        const shadowHosts = [...root.querySelectorAll("*")].filter((element) => Boolean(element.shadowRoot));
        for (const host of shadowHosts) {
          const shadowRoot = host.shadowRoot;
          if (shadowRoot) {
            visit(shadowRoot, [...hostPath, `${host.tagName.toLowerCase()}#shadow`]);
          }
        }
      };
      visit(document, ["document"]);
      return controls.map(({ domLocation, element }, index) => {
        const rect = element.getBoundingClientRect();
        const anchor = element instanceof HTMLAnchorElement ? element : element.closest("a");
        const inputElement = element as HTMLInputElement;
        const htmlElement = element as HTMLElement;
        const visibleText = htmlElement.innerText || element.textContent || "";
        const childImage = element instanceof HTMLImageElement ? element : element.querySelector("img[alt], img[title]");
        const text = (
          visibleText ||
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          childImage?.getAttribute("aria-label") ||
          childImage?.getAttribute("title") ||
          childImage?.getAttribute("alt") ||
          inputElement.value ||
          element.getAttribute("data-testid") ||
          element.getAttribute("data-test") ||
          element.id ||
          element.className?.toString() ||
          anchor?.textContent ||
          ""
        ).replace(/\s+/g, " ").trim();
        const parentNames: string[] = [domLocation].filter(Boolean);
        let parent = element.parentElement;
        while (parent && parentNames.length < 4) {
          parentNames.push(parent.tagName.toLowerCase());
          parent = parent.parentElement;
        }
        return {
          candidateId: `${input.scenario}_recipe_candidate_${input.frameIndex}_${index}`,
          labelText: text,
          href: anchor?.href || element.getAttribute("href") || undefined,
          domLocation: parentNames.join(">"),
          frameKind: input.frameIndex === 0 ? "main_frame" as const : "sub_frame" as const,
          frameUrl: input.frameUrl,
          visible: rect.width > 0 && rect.height > 0,
        };
      }).filter((candidate) => candidate.labelText.length > 0 && candidate.visible);
    }, {
      frameIndex,
      frameUrl: frame.url(),
      scenario,
    }).catch(() => []);
    for (const candidate of frameCandidates) {
      const normalized = normalizeResearchCandidate(candidate);
      if (normalized) {
        candidates.push(normalized);
      }
    }
  }
  return candidates
    .sort((left, right) => right.confidence - left.confidence || left.candidateId.localeCompare(right.candidateId))
    .slice(0, options.limit ?? 80);
}

function actionCandidateFromRaw(
  raw: RawControlCandidate,
  scenario: ConsentFlowScenario,
  actionType: ConsentActionType,
  confidence: number,
  detectionMethod: ConsentActionCandidate["detectionMethod"],
  dom: DomSnapshotArtifact,
  screenshot: ScreenshotArtifact | undefined,
): ConsentActionCandidate {
  const screenshotRef = artifactRefFromOptionalScreenshot(screenshot);
  return {
    actionId: `${scenario}_${raw.actionId}`,
    actionType,
    labelText: raw.labelText,
    normalizedLabel: raw.normalizedLabel,
    selectorSummary: raw.selectorSummary,
    domLocation: raw.domLocation,
    contextTextExcerpt: raw.contextTextExcerpt,
    frameContext: raw.frameContext,
    visible: raw.visible,
    enabled: raw.enabled,
    confidence,
    detectionMethod,
    shouldClick: confidence >= 0.78 && actionType !== "unknown",
    evidenceRefs: [{ refId: `ref_${dom.artifactId}_${raw.candidateIndex}`, artifactId: dom.artifactId, eventType: "dom_snapshot", label: raw.labelText, excerpt: raw.labelText }],
    screenshotArtifactRefs: screenshotRef ? [screenshotRef] : [],
    assistMetadata: [],
  };
}

function classifyControlText(label: string, ariaLabel?: string, contextTextExcerpt?: string): {
  actionType: ConsentActionType;
  confidence: number;
  method: ConsentActionCandidate["detectionMethod"];
} {
  const value = `${label} ${ariaLabel ?? ""}`.toLowerCase();
  const context = `${contextTextExcerpt ?? ""}`.toLowerCase();
  if (/reject all|reject optional|reject non[-\s]?essential|do not accept|decline all|decline optional|decline non[-\s]?essential|deny all|deny optional|deny non[-\s]?essential|refuse all|refuse optional|refuse non[-\s]?essential|only necessary|necessary only|only essential|essential only|accept (?:essential|required|necessary)(?: only)?/.test(value)) {
    return { actionType: "reject_all", confidence: 0.91, method: "deterministic_text" };
  }
  if (/^opt out$|^opt-out$/.test(label) && /privacy|cookie|advertising|targeted|sell|share|consent|data processing/.test(context)) {
    return { actionType: "reject_all", confidence: 0.86, method: "deterministic_text" };
  }
  if (/^reject$|^decline$|^deny$|^refuse$/.test(label)) {
    return { actionType: "reject_all", confidence: 0.9, method: "deterministic_text" };
  }
  if (/accept all|allow all|agree to all|accept cookies|i agree/.test(value)) {
    return { actionType: "accept_all", confidence: 0.91, method: "deterministic_text" };
  }
  if (/^accept$|^agree$|^consent$/.test(label)) {
    return { actionType: "accept_all", confidence: 0.8, method: "deterministic_text" };
  }
  if (/(?:save|confirm|submit|apply)(?: my)? (?:choice|choices|preferences)/.test(value)) {
    return { actionType: "save_preferences", confidence: 0.88, method: "deterministic_text" };
  }
  if (/manage preferences|cookie settings|privacy settings|privacy preference|preference center|\bsettings\b|customize|preferences|more options|choices/.test(value)) {
    return { actionType: "manage_preferences", confidence: 0.84, method: "deterministic_text" };
  }
  if (/continue/.test(value)) {
    return { actionType: "unknown", confidence: 0.42, method: "deterministic_text" };
  }
  return { actionType: "unknown", confidence: 0.2, method: "deterministic_text" };
}

export function classifyPrivacyOptOutControl(label: string, ariaLabel?: string, contextTextExcerpt?: string): {
  actionType: ConsentActionType;
  confidence: number;
  method: ConsentActionCandidate["detectionMethod"];
} | undefined {
  const value = `${label} ${ariaLabel ?? ""}`.toLowerCase();
  const context = `${contextTextExcerpt ?? ""}`.toLowerCase();
  if (/do not sell|do not share|do not sell or share|your privacy choices|privacy and ad settings|review all privacy|(?:your )?(?:data |state |us state )?privacy rights|opt out|opt-out|exclude my data|do not use my data|limit use of my sensitive/.test(value) &&
    /privacy|advertising|targeted|sell|share|data processing|personal information/.test(`${value} ${context}`)) {
    return { actionType: "do_not_sell_share", confidence: 0.88, method: "deterministic_text" };
  }
  return undefined;
}

async function openCmpSurfaceIfAvailable(page: Page, deadlineAtMs?: number): Promise<CmpSurfaceProbeDiagnostic> {
  const probeTimeoutMs = Math.min(1_500, remainingDeadlineMs(deadlineAtMs, 1_500));
  if (probeTimeoutMs <= 0) {
    return {
      attemptedCalls: [],
      controlsVisibleAfterProbe: 0,
      oneTrustDomState: undefined,
      observedOneTrustGlobals: [],
      preferenceSurfaceObserved: false,
    };
  }
  const probe = await promiseWithTimeout(page.evaluate(() => {
    const w = window as typeof window & {
      __tcfapi?: (...args: unknown[]) => unknown;
      __uspapi?: (...args: unknown[]) => unknown;
      Didomi?: { preferences?: { show?: () => unknown }; showPreferences?: () => unknown };
      OneTrust?: { ToggleInfoDisplay?: () => unknown; LoadBanner?: () => unknown };
      Optanon?: { ToggleInfoDisplay?: () => unknown };
      _sp_?: { gdpr?: { loadPrivacyManagerModal?: (...args: unknown[]) => unknown }; loadPrivacyManagerModal?: (...args: unknown[]) => unknown };
    };
    const attempts: string[] = [];
    const observedOneTrustGlobals = Object.keys(w)
      .filter((key) => /onetrust|optanon|__tcfapi|__uspapi/i.test(key))
      .slice(0, 40);
    const tryCall = (label: string, fn: (() => unknown) | undefined) => {
      if (typeof fn !== "function") {
        return;
      }
      try {
        fn();
        attempts.push(label);
      } catch {
        // Best-effort probe only.
      }
    };
    tryCall("OneTrust.ToggleInfoDisplay", w.OneTrust?.ToggleInfoDisplay?.bind(w.OneTrust));
    tryCall("Optanon.ToggleInfoDisplay", w.Optanon?.ToggleInfoDisplay?.bind(w.Optanon));
    tryCall("OneTrust.LoadBanner", w.OneTrust?.LoadBanner?.bind(w.OneTrust));
    tryCall("Didomi.preferences.show", w.Didomi?.preferences?.show?.bind(w.Didomi.preferences));
    tryCall("Didomi.showPreferences", w.Didomi?.showPreferences?.bind(w.Didomi));
    tryCall("Sourcepoint.loadPrivacyManagerModal", w._sp_?.loadPrivacyManagerModal?.bind(w._sp_));
    tryCall("Sourcepoint.gdpr.loadPrivacyManagerModal", w._sp_?.gdpr?.loadPrivacyManagerModal?.bind(w._sp_.gdpr));
    if (typeof w.__tcfapi === "function") {
      try {
        w.__tcfapi("displayConsentUi", 2, () => undefined);
        attempts.push("__tcfapi.displayConsentUi");
      } catch {
        // Best-effort probe only.
      }
    }
    if (typeof w.__uspapi === "function") {
      try {
        w.__uspapi("displayUspUi", 1, () => undefined);
        attempts.push("__uspapi.displayUspUi");
      } catch {
        // Best-effort probe only.
      }
    }
    return { attempts, observedOneTrustGlobals };
  }).catch(() => ({ attempts: [], observedOneTrustGlobals: [] })), probeTimeoutMs, { attempts: [], observedOneTrustGlobals: [] });
  const waitTimeoutMs = Math.min(2_000, remainingDeadlineMs(deadlineAtMs, 2_000));
  if (probe.attempts.length > 0 && waitTimeoutMs > 0) {
    await page.waitForFunction(() => {
      const text = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();
      const visibleControls = [...document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit'], a, [aria-label]")].filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      return Boolean(document.querySelector("#onetrust-pc-sdk, #onetrust-banner-sdk, .ot-sdk-container, .otPcTab")) ||
        /privacy preference center|preference center|confirm my choices|save choices|reject all|accept all/i.test(text) ||
        visibleControls.some((element) => {
          const label = (
            element.textContent ||
            element.getAttribute("aria-label") ||
            element.getAttribute("value") ||
            ""
          ).replace(/\s+/g, " ").trim();
          return /confirm my choices|save choices|reject all|accept all|privacy preference|cookie settings/i.test(label);
        });
    }, undefined, { timeout: waitTimeoutMs }).catch(() => undefined);
  }
  await waitForTimeoutWithinDeadline(page, probe.attempts.length > 0 ? 750 : 500, deadlineAtMs);
  const surface = await page.evaluate(() => {
    const controls = [...document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit'], a, [aria-label]")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const oneTrustButtons = [...document.querySelectorAll("#onetrust-consent-sdk button, #onetrust-consent-sdk [role='button'], #onetrust-consent-sdk input[type='button'], #onetrust-consent-sdk input[type='submit'], #onetrust-consent-sdk a")].map((element) => {
      const rect = element.getBoundingClientRect();
      const label = (
        element.textContent ||
        element.getAttribute("aria-label") ||
        element.getAttribute("value") ||
        element.getAttribute("title") ||
        ""
      ).replace(/\s+/g, " ").trim().slice(0, 120);
      return {
        label,
        visible: rect.width > 0 && rect.height > 0,
      };
    }).filter((item) => item.label.length > 0);
    const pcSdk = document.querySelector("#onetrust-pc-sdk");
    const pcRect = pcSdk?.getBoundingClientRect();
    const text = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();
    return {
      controlsVisibleAfterProbe: controls.length,
      oneTrustDomState: {
        consentSdkPresent: Boolean(document.querySelector("#onetrust-consent-sdk")),
        hiddenButtonLabels: oneTrustButtons.filter((button) => !button.visible).map((button) => button.label).slice(0, 20),
        pcSdkPresent: Boolean(pcSdk),
        pcSdkVisible: Boolean(pcRect && pcRect.width > 0 && pcRect.height > 0),
        visibleButtonLabels: oneTrustButtons.filter((button) => button.visible).map((button) => button.label).slice(0, 20),
      },
      preferenceSurfaceObserved: Boolean(document.querySelector("#onetrust-pc-sdk, #onetrust-banner-sdk, .ot-sdk-container, .otPcTab")) ||
        /privacy preference center|preference center|confirm my choices|save choices|reject all|accept all/i.test(text),
    };
  }).catch(() => ({
    controlsVisibleAfterProbe: 0,
    oneTrustDomState: undefined,
    preferenceSurfaceObserved: false,
  }));
  return {
    attemptedCalls: probe.attempts,
    controlsVisibleAfterProbe: surface.controlsVisibleAfterProbe,
    oneTrustDomState: surface.oneTrustDomState,
    observedOneTrustGlobals: probe.observedOneTrustGlobals,
    preferenceSurfaceObserved: surface.preferenceSurfaceObserved,
  };
}

async function extractOneTrustHiddenDiagnosticActionCandidates(input: {
  dom: DomSnapshotArtifact;
  page: Page;
  scenario: ConsentFlowScenario;
  screenshot: ScreenshotArtifact | undefined;
  surfaceProbe?: CmpSurfaceProbeDiagnostic;
  targetActionType: ConsentActionType;
}): Promise<ConsentActionCandidate[]> {
  if (!input.surfaceProbe?.oneTrustDomState?.consentSdkPresent ||
    input.surfaceProbe.oneTrustDomState.pcSdkVisible) {
    return [];
  }
  if (
    input.targetActionType !== "accept_all" &&
    input.targetActionType !== "reject_all" &&
    input.targetActionType !== "do_not_sell_share"
  ) {
    return [];
  }
  const diagnosticLabels = unique([
    ...input.surfaceProbe.oneTrustDomState.hiddenButtonLabels,
    ...input.surfaceProbe.oneTrustDomState.visibleButtonLabels,
  ]);
  const apiControls = input.surfaceProbe.oneTrustDomState.consentSdkPresent
    ? input.targetActionType === "accept_all"
      ? [{ actionType: "accept_all" as const, confidence: 0.86, label: "OneTrust.AllowAll API" }]
      : input.targetActionType === "reject_all"
        ? [{ actionType: "reject_all" as const, confidence: 0.86, label: "OneTrust.RejectAll API" }]
        : []
    : [];
  const hiddenControls = [
    ...apiControls,
    ...diagnosticLabels
    .flatMap((label) => {
      const classification = oneTrustHiddenDiagnosticLabelAction(label, input.targetActionType);
      return classification ? [{ ...classification, label }] : [];
    }),
  ]
    .slice(0, 8);
  const screenshotRef = artifactRefFromOptionalScreenshot(input.screenshot);
  return hiddenControls.map((control, index): ConsentActionCandidate => {
    const labelText = `${control.label} (OneTrust hidden diagnostic activation)`;
    return {
      actionId: `${input.scenario}_onetrust_hidden_${index}`,
      actionType: control.actionType,
      labelText,
      normalizedLabel: labelText.toLowerCase().replace(/\s+/g, " ").trim(),
      selectorSummary: `diagnosticOneTrustHiddenLabel:${encodeURIComponent(control.label)}`,
      domLocation: "#onetrust-consent-sdk hidden control",
      contextTextExcerpt: "Local/dev diagnostic mode observed a hidden OneTrust preference-center control and attempted programmatic activation for evidence-quality debugging.",
      frameContext: {
        frameKind: "main_frame",
        frameUrl: input.page.url(),
      },
      visible: true,
      enabled: true,
      confidence: control.confidence,
      detectionMethod: "css_selector",
      shouldClick: true,
      evidenceRefs: [{
        refId: `ref_${input.dom.artifactId}_onetrust_hidden_${index}`,
        artifactId: input.dom.artifactId,
        eventType: "dom_snapshot",
        label: control.label,
        excerpt: control.label,
      }],
      screenshotArtifactRefs: screenshotRef ? [screenshotRef] : [],
      assistMetadata: [],
    };
  });
}

export function oneTrustHiddenDiagnosticLabelAction(
  label: string,
  targetActionType: ConsentActionType,
): { actionType: Extract<ConsentActionType, "accept_all" | "reject_all" | "manage_preferences" | "save_preferences" | "do_not_sell_share">; confidence: number } | undefined {
  const normalized = label.toLowerCase().replace(/\s+/g, " ").trim();
  if (targetActionType === "accept_all" && /^(accept|allow all|accept all|accept cookies|i agree)$/.test(normalized)) {
    return { actionType: "accept_all", confidence: 0.88 };
  }
  if (
    (targetActionType === "accept_all" || targetActionType === "reject_all") &&
    /^(privacy center|privacy settings|privacy preferences|cookie settings|manage preferences)$/.test(normalized)
  ) {
    return { actionType: "manage_preferences", confidence: 0.84 };
  }
  if (targetActionType === "reject_all" &&
    /^(reject|accept essential|reject all|reject optional|decline all|deny all|only necessary|necessary only|essential only)$/.test(normalized)) {
    return { actionType: "reject_all", confidence: 0.86 };
  }
  if (targetActionType === "reject_all" && /^(confirm my choices|save choices|save preferences|apply)$/.test(normalized)) {
    return { actionType: "save_preferences", confidence: 0.82 };
  }
  if (
    targetActionType === "do_not_sell_share" &&
    /^(do not sell|do not sell my personal information|do not sell or share|do not share|opt out|opt-out|opt out form|opt-out form|opt out of sale|privacy choices|privacy request|data privacy rights|your data privacy rights|state privacy rights|your state privacy rights|us state privacy rights|your us state privacy rights|submit data request|data request|submit request)$/.test(normalized)
  ) {
    return { actionType: "do_not_sell_share", confidence: 0.8 };
  }
  if (
    targetActionType === "do_not_sell_share" &&
    /^(privacy center|privacy settings|privacy preferences|cookie settings|manage preferences|your privacy choices)$/.test(normalized)
  ) {
    return { actionType: "manage_preferences", confidence: 0.78 };
  }
  return undefined;
}

function shouldUseOneTrustHiddenActionDiagnostic(input: ConsentFlowRuntimeScannerInput) {
  return input.oneTrustHiddenActionMode === "diagnostic" &&
    input.scenarioPlanningMode === "planned_parallel";
}

async function clickCandidate(page: Page, candidate: ConsentActionCandidate): Promise<void> {
  const oneTrustHiddenLabelMatch = /^diagnosticOneTrustHiddenLabel:(.+)$/.exec(candidate.selectorSummary ?? "");
  if (oneTrustHiddenLabelMatch?.[1]) {
    const label = decodeURIComponent(oneTrustHiddenLabelMatch[1]);
    const actionType = candidate.actionType;
    const frame = page.frames()[0];
    if (!frame) {
      throw new Error("diagnostic_onetrust_hidden_frame_not_found");
    }
    await frame.evaluate(({ targetActionType, targetLabel }) => {
      const oneTrust = (window as unknown as {
        OneTrust?: {
          AllowAll?: () => unknown;
          Close?: () => unknown;
          RejectAll?: () => unknown;
          ToggleInfoDisplay?: () => unknown;
        };
      }).OneTrust;
      if (targetActionType === "accept_all" && typeof oneTrust?.AllowAll === "function") {
        oneTrust.AllowAll();
        if (typeof oneTrust.Close === "function") {
          oneTrust.Close();
        }
        return;
      }
      if (targetActionType === "reject_all" && typeof oneTrust?.RejectAll === "function") {
        oneTrust.RejectAll();
        if (typeof oneTrust.Close === "function") {
          oneTrust.Close();
        }
        return;
      }
      if (targetActionType === "manage_preferences" && typeof oneTrust?.ToggleInfoDisplay === "function") {
        oneTrust.ToggleInfoDisplay();
        return;
      }
      const controls = [...document.querySelectorAll("#onetrust-consent-sdk button, #onetrust-consent-sdk [role='button'], #onetrust-consent-sdk input[type='button'], #onetrust-consent-sdk input[type='submit'], #onetrust-consent-sdk a")];
      let element: HTMLElement | undefined;
      for (const control of controls) {
        const htmlElement = control as HTMLElement;
        const inputElement = control as HTMLInputElement;
        const rawLabel = (
          htmlElement.innerText ||
          control.textContent ||
          inputElement.value ||
          control.getAttribute("aria-label") ||
          control.getAttribute("title")
        );
        const labelText = (rawLabel ?? "").replace(/\s+/g, " ").trim();
        if (labelText.toLowerCase() === targetLabel.toLowerCase()) {
          element = htmlElement;
          break;
        }
      }
      if (!element) {
        throw new Error("diagnostic_onetrust_hidden_label_not_found");
      }
      element.click();
    }, { targetActionType: actionType, targetLabel: label });
    return;
  }
  const textControlMatch = /(?:frameIndex:(\d+);)?textControl:(.+)$/.exec(candidate.selectorSummary ?? "");
  if (textControlMatch?.[2]) {
    const frameIndex = textControlMatch[1] ? Number(textControlMatch[1]) : 0;
    const label = decodeURIComponent(textControlMatch[2]);
    const frame = page.frames()[frameIndex];
    if (!frame) {
      throw new Error(`Consent text control frame not found: ${candidate.selectorSummary ?? "none"}`);
    }
    await clickTextControlCandidate(frame, label, candidate);
    return;
  }
  const deepMatch = /(?:frameIndex:(\d+);)?deepControlIndex:(\d+)/.exec(candidate.selectorSummary ?? "");
  const match = deepMatch ?? /(?:frameIndex:(\d+);)?controlIndex:(\d+)/.exec(candidate.selectorSummary ?? "");
  const frameIndex = match?.[1] ? Number(match[1]) : 0;
  const index = match?.[2] ? Number(match[2]) : Number.NaN;
  if (!Number.isInteger(index) || !Number.isInteger(frameIndex)) {
    throw new Error(`Unsupported consent control selector summary: ${candidate.selectorSummary ?? "none"}`);
  }
  const frame = page.frames()[frameIndex];
  if (!frame) {
    throw new Error(`Consent control frame not found: ${candidate.selectorSummary ?? "none"}`);
  }
  await frame.evaluate((input) => {
    const flatSelector = "button, [role='button'], input[type='button'], input[type='submit'], a";
    const deepSelector = "button, [role='button'], input[type='button'], input[type='submit'], a, [aria-label], [data-testid], [data-test], [id*='consent' i], [id*='privacy' i], [class*='consent' i], [class*='privacy' i], [class*='cookie' i]";
    const deepControls: Element[] = [];
    const visit = (root: Document | ShadowRoot) => {
      deepControls.push(...root.querySelectorAll(deepSelector));
      for (const host of [...root.querySelectorAll("*")]) {
        if (host.shadowRoot) {
          visit(host.shadowRoot);
        }
      }
    };
    visit(document);
    const controls = input.deep
      ? deepControls
      : [...document.querySelectorAll(flatSelector)];
    const element = controls[input.candidateIndex] as HTMLElement | undefined;
    if (!element) {
      throw new Error("candidate_element_not_found");
    }
    element.click();
  }, { deep: Boolean(deepMatch), candidateIndex: index });
}

async function clickTextControlCandidate(
  frame: Frame,
  label: string,
  candidate: ConsentActionCandidate,
): Promise<void> {
  const clickableSelector = [
    "button",
    "[role='button']",
    "[role='link']",
    "a",
    "label",
    "summary",
    "input[type='button']",
    "input[type='submit']",
    "input[type='checkbox']",
    "input[type='radio']",
    "[tabindex]",
    "[onclick]",
    "[data-testid]",
    "[data-test]",
    "[class*='button' i]",
    "[class*='btn' i]",
  ].join(",");
  const attempts = [
    frame.getByText(label, { exact: true }).first(),
    frame.getByRole("button", { name: label, exact: true }).first(),
    frame.getByRole("link", { name: label, exact: true }).first(),
    frame.getByLabel(label, { exact: true }).first(),
    frame.locator(clickableSelector).filter({ hasText: label }).first(),
  ];
  for (const locator of attempts) {
    const clicked = await locator.click({ force: true, timeout: 1_200 })
      .then(() => true)
      .catch(() => false);
    if (clicked) {
      return;
    }
  }
  const textObserved = await frame.getByText(label, { exact: true }).first().isVisible({ timeout: 750 })
    .catch(() => false) ||
    await frame.getByText(label, { exact: false }).first().isVisible({ timeout: 750 })
      .catch(() => false);
  if (textObserved) {
    throw new Error([
      "text_control_observed_without_clickable_target",
      `action=${candidate.actionType}`,
      `label=${label}`,
    ].join("; "));
  }
  throw new Error([
    "planner_text_control_not_reacquired",
    `action=${candidate.actionType}`,
    `label=${label}`,
  ].join("; "));
}

function actionProof(input: {
  afterDomRef?: ArtifactRef;
  afterScreenshotRef?: ArtifactRef;
  afterDomExcerpt?: string;
  attempted: boolean;
  beforeDomRef?: ArtifactRef;
  beforeScreenshotRef?: ArtifactRef;
  beforeDomExcerpt?: string;
  candidate?: ConsentActionCandidate;
  actionPath?: ConsentActionProof["actionPath"];
  cmpContext?: { family?: string; provider?: string };
  evidenceRefs: EvidenceRef[];
  failureReason?: string;
  actionTimestampMs?: number;
  postClickSettleMs?: number;
  postActionConsentStateMarkers?: string[];
  preActionConsentStateMarkers?: string[];
  succeeded: boolean;
}): ConsentActionProof {
  return {
    proofVersion: "consent_action_proof.v1",
    candidateObserved: Boolean(input.candidate),
    candidateActionId: input.candidate?.actionId,
    candidateLabelText: input.candidate?.labelText,
    candidateNormalizedActionType: input.candidate?.actionType,
    candidateSelectorSummary: input.candidate?.selectorSummary,
    candidateConfidence: input.candidate?.confidence,
    candidateDetectionMethod: input.candidate?.detectionMethod,
    actionPath: input.actionPath,
    cmpFamily: input.cmpContext?.family,
    cmpProvider: input.cmpContext?.provider,
    frameContext: input.candidate?.frameContext,
    attemptedStatus: input.attempted
      ? input.succeeded ? "attempted_succeeded" : "attempted_failed"
      : "not_attempted",
    failureReason: input.failureReason,
    actionTimestampMs: input.actionTimestampMs,
    postClickSettleMs: input.postClickSettleMs,
    beforeScreenshotRef: input.beforeScreenshotRef,
    afterScreenshotRef: input.afterScreenshotRef,
    beforeDomRef: input.beforeDomRef,
    afterDomRef: input.afterDomRef,
    beforeDomExcerpt: boundedExcerpt(input.beforeDomExcerpt, 1000),
    afterDomExcerpt: boundedExcerpt(input.afterDomExcerpt, 1000),
    preActionConsentStateMarkers: input.preActionConsentStateMarkers ?? [],
    postActionConsentStateMarkers: input.postActionConsentStateMarkers ?? [],
    evidenceRefs: input.evidenceRefs,
  };
}

async function writePlannerCandidateDiagnosticsArtifact(input: {
  actionCandidates: ConsentActionCandidate[];
  cmpSurfaceProbe?: CmpSurfaceProbeDiagnostic;
  input: ConsentFlowRuntimeScannerInput;
  rawCandidates: RawControlCandidate[];
  recipeResearchCandidates: ConsentRecipeResearchCandidate[];
  scenario: ConsentFlowScenario;
  targetActionType: ConsentActionType;
}): Promise<void> {
  await input.input.artifactWriter.writeJsonArtifact(`ConsentPlannerCandidateDiagnostics-${input.scenario}.json`, {
    actionCandidateSummary: summarizeActionCandidates(input.actionCandidates, input.targetActionType),
    artifactOnly: true,
    artifactVersion: "certscore.v2.consent_planner_candidate_diagnostics.v1",
    cmpSurfaceProbe: input.cmpSurfaceProbe ?? {
      attemptedCalls: [],
      controlsVisibleAfterProbe: 0,
      observedOneTrustGlobals: [],
      preferenceSurfaceObserved: false,
    },
    generatedAt: new Date().toISOString(),
    productionFindingIntegration: false,
    rawCandidateSummary: summarizeRawControlCandidates(input.rawCandidates, input.targetActionType),
    recipeResearchCandidateSummary: input.recipeResearchCandidates.slice(0, 30).map((candidate) => ({
      candidateId: candidate.candidateId,
      confidence: candidate.confidence,
      domLocation: candidate.domLocation,
      frameKind: candidate.frameKind,
      frameUrl: boundedExcerpt(candidate.frameUrl, 300),
      labelText: candidate.labelText,
      reasonCodes: candidate.reasonCodes,
      suggestedScenario: candidate.suggestedScenario,
    })),
    scenario: input.scenario,
    sourceScanner: SOURCE_SCANNER,
    targetActionType: input.targetActionType,
  });
}

function summarizeRawControlCandidates(
  candidates: RawControlCandidate[],
  targetActionType: ConsentActionType,
) {
  return candidates.slice(0, 50).map((candidate) => {
    const classification = classifyControlText(candidate.normalizedLabel, candidate.ariaLabel, candidate.contextTextExcerpt);
    return {
      ariaLabel: boundedExcerpt(candidate.ariaLabel, 160),
      classification,
      contextTextExcerpt: boundedExcerpt(candidate.contextTextExcerpt, 240),
      domLocation: boundedExcerpt(candidate.domLocation, 180),
      enabled: candidate.enabled,
      frameKind: candidate.frameContext?.frameKind,
      frameUrl: boundedExcerpt(candidate.frameContext?.frameUrl, 300),
      labelText: candidate.labelText,
      rejectionReasons: rawCandidateRejectionReasons(candidate, classification, targetActionType),
      role: candidate.role,
      selectorSummary: candidate.selectorSummary,
      visible: candidate.visible,
    };
  });
}

function summarizeActionCandidates(
  candidates: ConsentActionCandidate[],
  targetActionType: ConsentActionType,
) {
  return candidates.slice(0, 50).map((candidate) => ({
    actionType: candidate.actionType,
    confidence: candidate.confidence,
    detectionMethod: candidate.detectionMethod,
    enabled: candidate.enabled,
    labelText: candidate.labelText,
    rejectionReasons: actionCandidateRejectionReasons(candidate, targetActionType),
    selectorSummary: candidate.selectorSummary,
    shouldClick: candidate.shouldClick,
    visible: candidate.visible,
  }));
}

function rawCandidateRejectionReasons(
  candidate: RawControlCandidate,
  classification: ReturnType<typeof classifyControlText>,
  targetActionType: ConsentActionType,
): string[] {
  const reasons: string[] = [];
  if (!candidate.visible) {
    reasons.push("not_visible");
  }
  if (!candidate.enabled) {
    reasons.push("not_enabled");
  }
  if (classification.actionType === "unknown") {
    reasons.push("classified_unknown");
  }
  if (classification.actionType !== targetActionType &&
    !(targetActionType === "reject_all" && ["manage_preferences", "save_preferences"].includes(classification.actionType)) &&
    !(targetActionType === "accept_all" && ["manage_preferences", "save_preferences"].includes(classification.actionType))) {
    reasons.push("not_target_action_type");
  }
  if (classification.confidence < 0.78) {
    reasons.push("confidence_below_click_threshold");
  }
  return reasons;
}

function actionCandidateRejectionReasons(
  candidate: ConsentActionCandidate,
  targetActionType: ConsentActionType,
): string[] {
  const reasons: string[] = [];
  if (!candidate.visible) {
    reasons.push("not_visible");
  }
  if (!candidate.enabled) {
    reasons.push("not_enabled");
  }
  if (!candidate.shouldClick) {
    reasons.push("should_click_false");
  }
  if (candidate.confidence < 0.78) {
    reasons.push("confidence_below_click_threshold");
  }
  if (candidate.actionType !== targetActionType &&
    !(targetActionType === "reject_all" && ["manage_preferences", "save_preferences"].includes(candidate.actionType)) &&
    !(targetActionType === "accept_all" && ["manage_preferences", "save_preferences"].includes(candidate.actionType))) {
    reasons.push("not_target_action_type");
  }
  return reasons;
}

function boundedExcerpt(value: string | undefined, maxLength: number): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, maxLength);
}

function detectCmpContext(values: Array<string | undefined>): { family?: string; provider?: string } {
  const value = values.filter(Boolean).join(" ").toLowerCase();
  if (/onetrust|optanon|ot-sdk|otbanner|otnotice/.test(value)) {
    return { family: "OneTrust", provider: "OneTrust" };
  }
  if (/trustarc|truste|notice_choice|consent\.trustarc/.test(value)) {
    return { family: "TrustArc", provider: "TrustArc" };
  }
  if (/cookiebot|cookiebot\.com|cybotcookiebot/.test(value)) {
    return { family: "Cookiebot", provider: "Cookiebot" };
  }
  if (/didomi|didomi_token|didomi\.io/.test(value)) {
    return { family: "Didomi", provider: "Didomi" };
  }
  if (/sourcepoint|sp_message|sp_choice|privacy-manager/.test(value)) {
    return { family: "Sourcepoint", provider: "Sourcepoint" };
  }
  if (/ketch|ketch_consent|ketchjs|ketchcdn/.test(value)) {
    return { family: "Ketch", provider: "Ketch" };
  }
  if (/cookie preference|cookie preferences|privacy preference|privacy preferences|consent setting|cookie settings/.test(value)) {
    return { family: "generic_cmp", provider: "unknown" };
  }
  return {};
}

async function consentStateMarkers(page: Page): Promise<string[]> {
  const markers = await page.evaluate(() => {
    const markerPattern = /consent|cookie|optanon|onetrust|trustarc|truste|cookiebot|didomi|sourcepoint|sp_|ketch|privacy/i;
    const names = new Set<string>();
    const cookieNames = document.cookie
      .split(";")
      .map((item) => item.split("=")[0]?.trim())
      .filter(Boolean) as string[];
    for (const name of cookieNames) {
      if (markerPattern.test(name)) {
        names.add(`cookie:${name}`);
      }
    }
    for (const storage of [window.localStorage, window.sessionStorage]) {
      const prefix = storage === window.localStorage ? "localStorage" : "sessionStorage";
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key && markerPattern.test(key)) {
          names.add(`${prefix}:${key}`);
        }
      }
    }
    const attributes = ["data-consent-state", "data-cookie-consent", "data-preferences-open"];
    for (const attribute of attributes) {
      for (const element of [...document.querySelectorAll(`[${attribute}]`)]) {
        const value = element.getAttribute(attribute);
        names.add(`dom:${attribute}${value ? `=${value.slice(0, 60)}` : ""}`);
      }
    }
    return [...names].slice(0, 40);
  }).catch(() => []);
  return markers.map((marker) => marker.replace(/\s+/g, " ").trim().slice(0, 180));
}

function consentStateChangedAfterAction(beforeMarkers: string[], afterMarkers: string[]): boolean {
  if (afterMarkers.length === 0) {
    return false;
  }
  const before = new Set(beforeMarkers);
  if (afterMarkers.some((marker) => !before.has(marker))) {
    return true;
  }
  return afterMarkers.length !== beforeMarkers.length;
}

async function captureReplayArtifacts(input: {
  actionApplied: boolean;
  actionAttempts: ConsentActionAttempt[];
  actionCandidates: ConsentActionCandidate[];
  context: BrowserContext;
  harPath?: string;
  input: ConsentFlowRuntimeScannerInput;
  networkEvents: NetworkEvent[];
  page: Page;
  sourceUrl: string;
  scenarioInput: {
    scenario: ConsentFlowScenario;
    consentState: ConsentState;
    actionType?: ConsentActionType;
  };
}): Promise<ArtifactRef[]> {
  const scenario = input.scenarioInput.scenario;
  const tracePath = input.input.captureReplayTrace
    ? input.input.artifactWriter.artifactPath(`replay_${scenario}.trace.zip`)
    : undefined;
  const storageStatePath = input.input.artifactWriter.artifactPath(`replay_${scenario}.storage-state.json`);
  if (tracePath) {
    await input.context.tracing.stop({ path: tracePath }).catch(() => undefined);
  }
  await input.context.storageState({ path: storageStatePath }).catch(() => undefined);
  const frameSnapshots = await captureFrameSnapshots(input.page);
  const controls = dedupeReplayControls([
    ...replayControlsFromActionCandidates(input.actionCandidates),
    ...await captureReplayControls(input.page),
  ]);
  const frameSnapshotPath = await input.input.artifactWriter.writeJsonArtifact(`replay_${scenario}.frames.json`, {
    capturedAtMs: elapsed(input.input.scanStartedAtMs),
    frameSnapshots,
    replayArtifactVersion: "consent_flow_replay_frames.v1",
    scenario,
    sourceScanner: SOURCE_SCANNER,
  });
  const controlsPath = await input.input.artifactWriter.writeJsonArtifact(`replay_${scenario}.controls.json`, {
    capturedAtMs: elapsed(input.input.scanStartedAtMs),
    controls,
    replayArtifactVersion: "consent_flow_replay_controls.v1",
    scenario,
    sourceScanner: SOURCE_SCANNER,
  });
  const originalConsentEvidencePath = await input.input.artifactWriter.writeJsonArtifact(`replay_${scenario}.original-consent-evidence.json`, {
    actionApplied: input.actionApplied,
    actionAttempts: input.actionAttempts,
    actionCandidates: input.actionCandidates,
    networkEvents: input.networkEvents,
    replayArtifactVersion: "consent_flow_replay_original_evidence.v1",
    scenario,
    sourceScanner: SOURCE_SCANNER,
  });
  const manifest = {
    actionApplied: input.actionApplied,
    actionType: input.scenarioInput.actionType,
    artifactPaths: {
      controls: controlsPath,
      frameSnapshots: frameSnapshotPath,
      har: input.harPath,
      originalConsentEvidence: originalConsentEvidencePath,
      storageState: storageStatePath,
      ...(tracePath ? { trace: tracePath } : {}),
    },
    capturedAtMs: elapsed(input.input.scanStartedAtMs),
    frameCount: frameSnapshots.length,
    networkEventCount: input.networkEvents.length,
    normalizedUrl: input.sourceUrl,
    replayArtifactVersion: "consent_flow_replay_manifest.v1",
    scenario,
    sourceScanner: SOURCE_SCANNER,
    url: input.sourceUrl,
  };
  const manifestPath = await input.input.artifactWriter.writeJsonArtifact(`replay_${scenario}.manifest.json`, manifest);
  const observedAtMs = elapsed(input.input.scanStartedAtMs);
  const refs: ArtifactRef[] = [
    {
      artifactId: `replay_${scenario}_manifest`,
      artifactType: "json",
      path: manifestPath,
      observedAtMs,
      sourceScanner: SOURCE_SCANNER,
      scenario,
      sensitivity: "internal_only",
      redactionStatus: "internal_only",
      relatedEventIds: [],
      label: "Consent-flow replay manifest",
    },
    {
      artifactId: `replay_${scenario}_storage_state`,
      artifactType: "storage_snapshot",
      path: storageStatePath,
      observedAtMs,
      sourceScanner: SOURCE_SCANNER,
      scenario,
      sensitivity: "internal_only",
      redactionStatus: "internal_only",
      relatedEventIds: [],
      label: "Consent-flow replay storage state",
    },
    {
      artifactId: `replay_${scenario}_controls`,
      artifactType: "json",
      path: controlsPath,
      observedAtMs,
      sourceScanner: SOURCE_SCANNER,
      scenario,
      sensitivity: "internal_only",
      redactionStatus: "internal_only",
      relatedEventIds: [],
      label: "Consent-flow replay controls",
    },
    {
      artifactId: `replay_${scenario}_frames`,
      artifactType: "json",
      path: frameSnapshotPath,
      observedAtMs,
      sourceScanner: SOURCE_SCANNER,
      scenario,
      sensitivity: "internal_only",
      redactionStatus: "internal_only",
      relatedEventIds: [],
      label: "Consent-flow replay frame snapshots",
    },
    {
      artifactId: `replay_${scenario}_original_consent_evidence`,
      artifactType: "json",
      path: originalConsentEvidencePath,
      observedAtMs,
      sourceScanner: SOURCE_SCANNER,
      scenario,
      sensitivity: "internal_only",
      redactionStatus: "internal_only",
      relatedEventIds: [],
      label: "Consent-flow replay original consent evidence",
    },
  ];
  if (tracePath) {
    refs.push({
      artifactId: `replay_${scenario}_trace`,
      artifactType: "other",
      path: tracePath,
      observedAtMs,
      sourceScanner: SOURCE_SCANNER,
      scenario,
      sensitivity: "internal_only",
      redactionStatus: "internal_only",
      relatedEventIds: [],
      label: "Consent-flow Playwright trace",
    });
  }
  if (input.harPath) {
    refs.push({
      artifactId: `replay_${scenario}_har`,
      artifactType: "network_archive",
      path: input.harPath,
      observedAtMs,
      sourceScanner: SOURCE_SCANNER,
      scenario,
      sensitivity: "internal_only",
      redactionStatus: "internal_only",
      relatedEventIds: [],
      label: "Consent-flow replay HAR",
    });
  }
  return refs;
}

async function captureFrameSnapshots(page: Page) {
  const snapshots = [];
  for (const [frameIndex, frame] of page.frames().entries()) {
    const snapshot = await frame.evaluate(() => ({
      htmlExcerpt: document.documentElement?.outerHTML?.slice(0, 30_000) ?? "",
      textExcerpt: document.body?.innerText?.replace(/\s+/g, " ").trim().slice(0, 10_000) ?? "",
      title: document.title,
    })).catch(() => undefined);
    snapshots.push({
      frameIndex,
      frameKind: frameIndex === 0 ? "main_frame" : "sub_frame",
      frameName: frame.name() || undefined,
      frameUrl: frame.url(),
      htmlExcerpt: snapshot?.htmlExcerpt ?? "",
      textExcerpt: snapshot?.textExcerpt ?? "",
      title: snapshot?.title ?? "",
    });
  }
  return snapshots;
}

async function captureReplayControls(page: Page) {
  const controls = [];
  for (const [frameIndex, frame] of page.frames().entries()) {
    const frameControls = await frame.evaluate(() => {
      const normalize = (value: string | null | undefined, maxLength: number) =>
        (value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
      const selector = [
        "button",
        "[role='button']",
        "input[type='button']",
        "input[type='submit']",
        "a",
        "select",
        "[aria-label]",
      ].join(",");
      return [...document.querySelectorAll(selector)].slice(0, 200).map((element, controlIndex) => {
        const htmlElement = element as HTMLElement;
        const inputElement = element as HTMLInputElement;
        const anchorElement = element as HTMLAnchorElement;
        const contextElement = htmlElement.closest("[role='dialog'], [aria-modal='true'], section, footer, header, nav, aside, div") ?? htmlElement;
        return {
          ariaLabel: normalize(element.getAttribute("aria-label"), 200) || undefined,
          contextTextExcerpt: normalize(contextElement.textContent, 500) || undefined,
          controlIndex,
          href: normalize(anchorElement.href, 300) || normalize(element.getAttribute("href"), 300) || undefined,
          id: normalize(element.id, 120) || undefined,
          labelText: normalize(htmlElement.innerText || element.textContent || inputElement.value, 200),
          name: normalize(inputElement.name || element.getAttribute("name"), 120) || undefined,
          normalizedLabel: normalize(htmlElement.innerText || element.textContent || inputElement.value || element.getAttribute("aria-label"), 200).toLowerCase(),
          role: normalize(element.getAttribute("role"), 80) || undefined,
          tagName: element.tagName.toLowerCase(),
          title: normalize(element.getAttribute("title"), 200) || undefined,
          type: normalize(inputElement.type || element.getAttribute("type"), 80) || undefined,
        };
      });
    }).catch(() => []);
    for (const control of frameControls) {
      controls.push({
        ...control,
        frameContext: {
          frameIndex,
          frameKind: frameIndex === 0 ? "main_frame" : "sub_frame",
          frameName: frame.name() || undefined,
          frameUrl: frame.url(),
        },
      });
    }
  }
  return controls;
}

function replayControlsFromActionCandidates(actionCandidates: ConsentActionCandidate[]) {
  return actionCandidates.map((candidate, controlIndex) => ({
    actionType: candidate.actionType,
    contextTextExcerpt: candidate.contextTextExcerpt,
    controlIndex,
    frameContext: {
      frameIndex: frameIndexFromSelectorSummary(candidate.selectorSummary),
      frameKind: candidate.frameContext?.frameKind ?? "main_frame",
      frameName: candidate.frameContext?.frameName,
      frameUrl: candidate.frameContext?.frameUrl,
    },
    labelText: candidate.labelText,
    normalizedLabel: candidate.normalizedLabel,
    role: candidate.detectionMethod,
    tagName: "candidate",
  }));
}

function frameIndexFromSelectorSummary(selectorSummary: string | undefined): number {
  const match = selectorSummary?.match(/frameIndex:(\d+)/);
  return match ? Number(match[1]) : 0;
}

function dedupeReplayControls<T extends {
  frameContext?: { frameIndex: number; frameUrl?: string };
  labelText?: string;
  normalizedLabel?: string;
  tagName?: string;
}>(controls: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const control of controls) {
    const key = [
      control.frameContext?.frameIndex,
      control.frameContext?.frameUrl,
      control.normalizedLabel || control.labelText,
      control.tagName,
    ].join("|");
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(control);
    }
  }
  return deduped.slice(0, 300);
}

async function waitForConsentActionSettle(page: Page, maxMs: number, deadlineAtMs?: number): Promise<number> {
  const startedAt = Date.now();
  const initialWaitMs = Math.min(1_200, maxMs);
  if (initialWaitMs > 0) {
    await waitForTimeoutWithinDeadline(page, initialWaitMs, deadlineAtMs);
  }
  while (Date.now() - startedAt < maxMs) {
    if (!(await pageHasLikelyConsentControls(page))) {
      break;
    }
    await waitForTimeoutWithinDeadline(page, 400, deadlineAtMs);
  }
  return Date.now() - startedAt;
}

async function pageHasLikelyConsentControls(page: Page): Promise<boolean> {
  const frames = page.frames();
  for (const frame of frames) {
    const present = await frame.evaluate(() => {
      const text = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 2000);
      if (/cookie consent|we use cookies|cookie preference|privacy preference|choose your consent setting/i.test(text)) {
        return true;
      }
      const controls = [...document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit'], a")];
      return controls.some((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          return false;
        }
        const label = (
          element.textContent ||
          element.getAttribute("aria-label") ||
          element.getAttribute("value") ||
          ""
        ).replace(/\s+/g, " ").trim();
        return /accept all|reject all|reject optional|reject non[-\s]?essential|decline all|decline optional|decline non[-\s]?essential|deny all|deny optional|deny non[-\s]?essential|refuse all|refuse optional|refuse non[-\s]?essential|only necessary|necessary only|only essential|essential only|cookie settings|privacy settings|manage preferences|save choices|save preferences|confirm my choice|confirm choices/i.test(label);
      });
    }).catch(() => false);
    if (present) {
      return true;
    }
  }
  return false;
}

async function attemptPrivacyOptOutFormSubmission(input: {
  input: ConsentFlowRuntimeScannerInput;
  page: Page;
  scenario: ConsentFlowScenario;
  consentState: ConsentState;
  scanStartedAtMs: number;
  beforeDom: DomSnapshotArtifact;
  beforeScreenshot: ScreenshotArtifact | undefined;
  candidate?: ConsentActionCandidate;
  bannerPresentBefore: boolean;
  preActionConsentStateMarkers: string[];
  nextId: ScenarioIdFactory;
  deadlineAtMs?: number;
}): Promise<{
  attempted: boolean;
  succeeded: boolean;
  failureReason?: string;
  bannerPresentAfter?: boolean;
  afterDomRef?: ArtifactRef;
  afterScreenshotRef?: ArtifactRef;
  evidenceRefs: EvidenceRef[];
  candidate?: ConsentActionCandidate;
  actionProof: ConsentActionProof;
} | undefined> {
  if (input.scenario !== "privacy_opt_out_flow") {
    return undefined;
  }

  let livePageText = await input.page.evaluate(() =>
    (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 5_000),
  ).catch(() => "");
  let pageContext = `${input.beforeDom.textExcerpt ?? ""} ${livePageText} ${input.page.url()}`.toLowerCase();
  let hasOptOutRight = /do not sell(?: my)?(?: personal)? information|do not sell or share|opt[- ]out of (?:the )?sale|sale (?:or|and) sharing|opt[- ]out of sharing|targeted advertising/.test(pageContext);
  let hasRequestFormContext = /california|ccpa|cpra|consumer privacy|privacy request|request form|data privacy|rights request|privacyportal|onetrust/.test(pageContext);
  if (!hasOptOutRight || !hasRequestFormContext) {
    await input.page.waitForFunction(() => {
      const text = (document.body?.innerText ?? "").replace(/\s+/g, " ").toLowerCase();
      return /do not sell(?: my)?(?: personal)? information|do not sell or share|opt[- ]out|sale (?:or|and) sharing/.test(text) &&
        /california|ccpa|cpra|privacy settings|advertising settings|right to opt out/.test(text);
    }, undefined, { timeout: 4_000 }).catch(() => undefined);
    livePageText = await input.page.evaluate(() =>
      (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 8_000),
    ).catch(() => livePageText);
    pageContext = `${input.beforeDom.textExcerpt ?? ""} ${livePageText} ${input.page.url()}`.toLowerCase();
    hasOptOutRight = /do not sell(?: my)?(?: personal)? information|do not sell or share|opt[- ]out of (?:the )?sale|sale (?:or|and) sharing|opt[- ]out of sharing|targeted advertising/.test(pageContext);
    hasRequestFormContext = /california|ccpa|cpra|consumer privacy|privacy request|request form|data privacy|rights request|privacyportal|onetrust|privacy settings|advertising settings|right to opt out/.test(pageContext);
  }
  if (!hasOptOutRight || !hasRequestFormContext) {
    return undefined;
  }

  const actionTimestampMs = elapsed(input.scanStartedAtMs);
  const optOutPattern = /do not sell(?: my)?(?: personal)? information|do not sell or share|opt[- ]out of (?:the )?sale|sale (?:or|and) sharing|opt[- ]out of sharing|targeted advertising/i;
  const affirmPattern = /affirm|certif|california resident|i am a california|under penalty|authorize/i;
  const submitPattern = /submit|send request|save|apply|confirm|continue|next/i;
  let selectedDoNotSell = false;
  let submitted = false;
  let affirmed = false;
  let affirmationRequired = false;
  let optOutSelectionAttempted = false;
  const beforeFormDiagnostic = await writePrivacyOptOutFormDiagnosticArtifact(input.input, input.page, input.scenario, "before_selection");
  let submittedLabel: string | undefined;

  const labeledControl = input.page.getByLabel(optOutPattern).first();
  if (await labeledControl.count() > 0) {
    await labeledControl.check({ force: true, timeout: 1_500 }).catch(async () => {
      await labeledControl.click({ force: true, timeout: 1_500 });
    });
    selectedDoNotSell = true;
  }

  const optOutLabel = input.page.locator("label").filter({ hasText: optOutPattern }).first();
  if (!selectedDoNotSell && await optOutLabel.count() > 0) {
    const labeledInput = optOutLabel.locator("input[type='radio'], input[type='checkbox']").first();
    if (await labeledInput.count() > 0) {
      await labeledInput.check({ force: true, timeout: 1_500 }).catch(async () => {
        await labeledInput.click({ force: true, timeout: 1_500 });
      });
      selectedDoNotSell = true;
    } else {
      await optOutLabel.click({ force: true, timeout: 1_500 });
    }
  }

  if (!selectedDoNotSell) {
    const optOutRadio = input.page.getByRole("radio", { name: optOutPattern }).first();
    if (await optOutRadio.count() > 0) {
      await optOutRadio.check({ force: true, timeout: 1_500 }).catch(async () => {
        await optOutRadio.click({ force: true, timeout: 1_500 });
      });
      selectedDoNotSell = true;
    }
  }

  if (!selectedDoNotSell) {
    const optOutControl = input.page.locator("[role='option'], [role='radio'], button, [role='button']").filter({ hasText: optOutPattern }).first();
    if (await optOutControl.count() > 0) {
      await optOutControl.click({ force: true, timeout: 1_500 });
      selectedDoNotSell = true;
    }
  }

  const verifiedOptOutChoice = await selectAndVerifyPrivacyOptOutChoice(
    input.page,
    input.input.nanoConsentUiAssistProvider,
  );
  if (verifiedOptOutChoice.attempted) {
    optOutSelectionAttempted = true;
    selectedDoNotSell = verifiedOptOutChoice.selected;
  } else if (selectedDoNotSell) {
    selectedDoNotSell = await privacyOptOutChoiceSelected(input.page);
  }

  const affirmControl = input.page.locator("label, button, [role='button'], [role='checkbox']").filter({ hasText: affirmPattern }).first();
  if (await affirmControl.count() > 0) {
    affirmationRequired = true;
    const affirmInput = affirmControl.locator("input[type='checkbox']").first();
    if (await affirmInput.count() > 0) {
      await affirmInput.check({ force: true, timeout: 1_500 }).catch(async () => {
        await affirmInput.click({ force: true, timeout: 1_500 });
      });
    } else {
      await affirmControl.click({ force: true, timeout: 1_500 });
    }
    affirmed = true;
  }

  const submitControl = input.page.getByRole("button", { name: submitPattern }).first();
  if (selectedDoNotSell && await submitControl.count() > 0) {
    submittedLabel = (await submitControl.textContent({ timeout: 1_000 }).catch(() => undefined))?.replace(/\s+/g, " ").trim().slice(0, 160);
    await submitControl.click({ force: true, timeout: 1_500 });
    submitted = true;
  }

  const result = {
    affirmationRequired,
    affirmed,
    selectedDoNotSell,
    submitted,
    submittedLabel,
  };

  if (!result.selectedDoNotSell && !result.submitted && !optOutSelectionAttempted) {
    return undefined;
  }

  const postClickSettleMs = await waitForConsentActionSettle(input.page, 3_000, input.deadlineAtMs);
  const postActionConsentStateMarkers = await consentStateMarkers(input.page);
  const afterFormDiagnostic = await writePrivacyOptOutFormDiagnosticArtifact(input.input, input.page, input.scenario, "after_selection");
  const afterDom = await writeDomArtifact(input.input, input.page, input.scenario, "after_privacy_opt_out_form", input.consentState);
  const afterScreenshot = await writeScreenshotArtifact(input.input, input.page, input.scenario, "after_privacy_opt_out_form", input.consentState);
  const afterRawCandidates = await extractControlCandidates(input.page, {
    actionType: "do_not_sell_share",
    limit: controlCandidateLimit(input.input, input.scenario, "post_action"),
    scenario: input.scenario,
  });
  const afterClassification = await classifyActionCandidates(
    input.input,
    input.page.url(),
    input.scenario,
    afterRawCandidates,
    afterDom,
    afterScreenshot,
    {
      allowNanoAssist: !shouldUseDeterministicOnlyActionTail(input.input, input.scenario, input.deadlineAtMs),
      nanoCandidateLimit: plannedNanoCandidateLimit(input.input, input.scenario),
      targetActionType: "do_not_sell_share",
    },
  );
  const bannerPresentAfter = bannerLikelyPresent(afterClassification.actionCandidates, afterDom.textExcerpt);
  const evidenceRefs = [
    { refId: `ref_${input.beforeDom.artifactId}`, artifactId: input.beforeDom.artifactId, eventType: "dom_snapshot" as const, excerpt: input.beforeDom.textExcerpt },
    { refId: `ref_${afterDom.artifactId}`, artifactId: afterDom.artifactId, eventType: "dom_snapshot" as const, excerpt: afterDom.textExcerpt },
  ];

  const syntheticCandidate = input.candidate ?? privacyOptOutFormCandidate(input.scenario, input.beforeDom, input.beforeScreenshot, result.submittedLabel);
  const formSequenceCompleted = result.selectedDoNotSell &&
    result.submitted &&
    (!result.affirmationRequired || result.affirmed);
  const pageChanged = domTextChangedAfterAction(input.beforeDom.textExcerpt, afterDom.textExcerpt) ||
    consentStateChangedAfterAction(input.preActionConsentStateMarkers, postActionConsentStateMarkers);
  const submittedAcknowledged = /thank you|submitted|request received|request has been received|confirmation|success|case number|reference number/i.test(afterDom.textExcerpt ?? "");
  const succeeded = formSequenceCompleted && (pageChanged || submittedAcknowledged || !input.bannerPresentBefore);
  const failureReason = succeeded
    ? undefined
    : !result.selectedDoNotSell ? "privacy_opt_out_form_right_not_selected"
      : result.affirmationRequired && !result.affirmed ? "privacy_opt_out_form_affirmation_not_completed"
        : !result.submitted ? "privacy_opt_out_form_submit_not_observed"
          : "privacy_opt_out_form_submission_not_confirmed";
  const beforeScreenshotRef = artifactRefFromOptionalScreenshot(input.beforeScreenshot);
  const afterScreenshotRef = artifactRefFromOptionalScreenshot(afterScreenshot);
  const beforeDomRef = artifactRefFromDom(input.beforeDom);
  const afterDomRef = artifactRefFromDom(afterDom);
  const diagnosticRefs = [
    artifactRefFromJsonArtifact(beforeFormDiagnostic, "privacy_opt_out_form_diagnostic_before_selection"),
    artifactRefFromJsonArtifact(afterFormDiagnostic, "privacy_opt_out_form_diagnostic_after_selection"),
  ].filter((ref): ref is ArtifactRef => Boolean(ref));

  return {
    attempted: result.selectedDoNotSell || result.submitted || optOutSelectionAttempted,
    succeeded,
    failureReason,
    bannerPresentAfter,
    afterDomRef,
    afterScreenshotRef,
    evidenceRefs: [
      ...evidenceRefs,
      ...diagnosticRefs.map((ref) => ({
        refId: `ref_${ref.artifactId}`,
        artifactId: ref.artifactId,
        eventType: "dom_snapshot" as const,
        excerpt: ref.label,
      })),
    ],
    candidate: syntheticCandidate,
    actionProof: actionProof({
      afterDomRef,
      afterScreenshotRef,
      attempted: result.selectedDoNotSell || result.submitted || optOutSelectionAttempted,
      beforeDomRef,
      beforeScreenshotRef,
      candidate: syntheticCandidate,
      evidenceRefs: [
        ...evidenceRefs,
        ...diagnosticRefs.map((ref) => ({
          refId: `ref_${ref.artifactId}`,
          artifactId: ref.artifactId,
          eventType: "dom_snapshot" as const,
          excerpt: ref.label,
        })),
      ],
      failureReason,
      actionTimestampMs,
      afterDomExcerpt: afterDom.textExcerpt,
      beforeDomExcerpt: input.beforeDom.textExcerpt,
      cmpContext: detectCmpContext([input.beforeDom.textExcerpt, afterDom.textExcerpt, syntheticCandidate.labelText, syntheticCandidate.contextTextExcerpt]),
      actionPath: "privacy_opt_out_form",
      postActionConsentStateMarkers,
      preActionConsentStateMarkers: input.preActionConsentStateMarkers,
      postClickSettleMs,
      succeeded,
    }),
  };
}

async function selectAndVerifyPrivacyOptOutChoice(
  page: Page,
  nanoConsentUiAssistProvider: NanoConsentUiAssistProvider | undefined,
): Promise<{ attempted: boolean; selected: boolean }> {
  if (await clickPrivacyOptOutLeadingControl(page)) {
    return { attempted: true, selected: true };
  }
  const customControl = await activatePrivacyOptOutCustomControl(page);
  if (customControl.attempted) {
    return customControl;
  }
  const deterministic = await page.evaluate(() => {
    const optOutPattern = /do not sell(?: my)?(?: personal)? information|do not sell or share|opt[- ]out|sale (?:or|and) sharing|sharing of my personal information/i;
    const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const selected = (element: Element | null | undefined) => {
      if (!element) {
        return false;
      }
      if (element instanceof HTMLInputElement) {
        return element.checked;
      }
      return element.getAttribute("aria-checked") === "true" ||
        element.getAttribute("data-checked") === "true" ||
        element.className.toString().toLowerCase().includes("checked");
    };
    const clickAndCheck = (element: Element | null | undefined) => {
      if (!element) {
        return undefined;
      }
      (element as HTMLElement).click();
      return selected(element);
    };

    const controls = [...document.querySelectorAll("input[type='radio'], input[type='checkbox'], [role='radio'], [role='checkbox']")]
      .filter(visible);
    for (const control of controls) {
      const htmlControl = control as HTMLElement;
      const id = htmlControl.id;
      const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const container = htmlControl.closest("label, [role='group'], fieldset, section, div, li") ?? htmlControl.parentElement;
      const context = normalize([
        label?.textContent,
        htmlControl.getAttribute("aria-label"),
        htmlControl.getAttribute("name"),
        htmlControl.getAttribute("value"),
        container?.textContent,
      ].filter(Boolean).join(" "));
      if (optOutPattern.test(context)) {
        const result = clickAndCheck(control);
        if (result !== undefined) {
          return { attempted: true, selected: result };
        }
      }
    }

    const textMatches = [...document.querySelectorAll("label, p, span, div, strong")]
      .filter((element) => visible(element) && optOutPattern.test(normalize(element.textContent)))
      .slice(0, 20);
    for (const textElement of textMatches) {
      const container = textElement.closest("label, [role='group'], fieldset, section, div, li") ?? textElement.parentElement;
      const control = container?.querySelector("input[type='radio'], input[type='checkbox'], [role='radio'], [role='checkbox']");
      const result = clickAndCheck(control);
      if (result !== undefined) {
        return { attempted: true, selected: result };
      }
    }

    return { attempted: false, selected: false };
  }).catch(() => ({ attempted: false, selected: false }));
  if (deterministic.attempted) {
    return deterministic;
  }
  return selectAndVerifyPrivacyOptOutChoiceWithNano(page, nanoConsentUiAssistProvider);
}

async function activatePrivacyOptOutCustomControl(page: Page): Promise<{ attempted: boolean; selected: boolean }> {
  const activated = await page.evaluate(() => {
    const optOutPattern = /do not sell(?: my)?(?: personal)? information|do not sell or share|opt[- ]out|sale (?:or|and) sharing|sharing of my personal information/i;
    const optInPattern = /accept standard advertising settings|opt in|i agree to the sale (?:or|and) sharing/i;
    const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const selected = (element: Element | null | undefined) => {
      if (!element) return false;
      if (element instanceof HTMLInputElement) return element.checked;
      const value = [
        element.getAttribute("aria-checked"),
        element.getAttribute("aria-selected"),
        element.getAttribute("data-checked"),
        element.getAttribute("data-state"),
        element.getAttribute("data-selected"),
        element.className.toString(),
      ].join(" ").toLowerCase();
      return /\btrue\b|\bchecked\b|\bselected\b|\bactive\b/.test(value);
    };
    const dispatchClick = (element: Element | null | undefined) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      element.scrollIntoView({ block: "center", inline: "center" });
      const rect = element.getBoundingClientRect();
      const clientX = rect.left + rect.width / 2;
      const clientY = rect.top + rect.height / 2;
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, view: window }));
      }
      element.click();
      return true;
    };
    const textMatches = [...document.querySelectorAll("label, p, span, div, strong")]
      .filter((element) => visible(element) && optOutPattern.test(normalize(element.textContent)))
      .slice(0, 12);
    for (const textElement of textMatches) {
      const ancestors = ancestorElements(textElement).slice(0, 8);
      const optOutRow = ancestors.find((ancestor) => {
        const text = normalize(ancestor.textContent);
        return optOutPattern.test(text) && !optInPattern.test(text.slice(0, Math.max(0, text.indexOf(normalize(textElement.textContent)) || text.length)));
      }) ?? textElement.closest("label, [role='radio'], [role='checkbox'], [role='button'], button, li, div");
      const controls = uniqueElements([
        ...(optOutRow ? [...optOutRow.querySelectorAll("input[type='radio'], input[type='checkbox'], [role='radio'], [role='checkbox'], button, [role='button'], [tabindex]")] : []),
        ...ancestors.flatMap((ancestor) => [...ancestor.querySelectorAll("input[type='radio'], input[type='checkbox'], [role='radio'], [role='checkbox']")]),
      ]).filter(visible);
      const uncheckedControls = controls.filter((control) => !selected(control));
      for (const control of [...uncheckedControls, ...controls]) {
        const controlContext = normalize([
          control.getAttribute("aria-label"),
          control.getAttribute("name"),
          control.getAttribute("value"),
          (control.closest("label, [role='group'], fieldset, section, li, div") ?? control.parentElement)?.textContent,
        ].filter(Boolean).join(" "));
        if (optInPattern.test(controlContext) && !optOutPattern.test(controlContext)) {
          continue;
        }
        if (dispatchClick(control) || dispatchClick(control.closest("label, [role='radio'], [role='checkbox'], [role='button'], button, li, div"))) {
          return true;
        }
      }
      const clickedRow = dispatchClick(optOutRow) || dispatchClick(textElement);
      if (clickedRow) {
        return true;
      }
    }
    return false;

    function ancestorElements(element: Element): Element[] {
      const values: Element[] = [];
      let cursor: Element | null = element;
      while (cursor && cursor !== document.body && values.length < 12) {
        values.push(cursor);
        cursor = cursor.parentElement;
      }
      return values;
    }

    function uniqueElements(values: Element[]): Element[] {
      return [...new Set(values)];
    }
  }).catch(() => false);
  if (!activated) {
    return { attempted: false, selected: false };
  }
  await waitForTimeoutWithinDeadline(page, 250);
  if (await privacyOptOutChoiceSelected(page)) {
    return { attempted: true, selected: true };
  }
  await page.keyboard.press("Space").catch(() => undefined);
  await waitForTimeoutWithinDeadline(page, 250);
  return { attempted: true, selected: await privacyOptOutChoiceSelected(page) };
}

async function selectAndVerifyPrivacyOptOutChoiceWithNano(
  page: Page,
  nanoConsentUiAssistProvider: NanoConsentUiAssistProvider | undefined,
): Promise<{ attempted: boolean; selected: boolean }> {
  if (!nanoConsentUiAssistProvider) {
    throw new Error("Nano consent UI assist provider is required for privacy opt-out control disambiguation.");
  }
  const candidateSnapshot = await collectPrivacyOptOutControlDisambiguationCandidates(page);
  if (candidateSnapshot.candidates.length === 0) {
    return { attempted: false, selected: false };
  }
  const result = await nanoConsentUiAssistProvider.classifyControls({
    assistId: "nano_privacy_opt_out_control_disambiguation",
    pageUrl: page.url(),
    candidates: candidateSnapshot.candidates.map((candidate) => ({
      actionId: candidate.actionId,
      labelText: candidate.labelText,
      normalizedLabel: candidate.labelText.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 240),
      domLocation: candidate.domLocation,
      selectorSummary: candidate.selectorSummary,
    })),
  });
  const candidateById = new Map(candidateSnapshot.candidates.map((candidate) => [candidate.actionId, candidate]));
  const selectedCandidate = result.classifications
    .filter((classification) =>
      classification.actionType === "do_not_sell_share" &&
      classification.shouldClick &&
      classification.confidence >= 0.72,
    )
    .sort((left, right) =>
      privacyOptOutClickCandidateRank(candidateById.get(right.actionId)) -
      privacyOptOutClickCandidateRank(candidateById.get(left.actionId)) ||
      right.confidence - left.confidence ||
      left.actionId.localeCompare(right.actionId),
    )[0];
  if (!selectedCandidate) {
    return { attempted: false, selected: false };
  }
  const clickPoint = candidateSnapshot.candidates.find((candidate) => candidate.actionId === selectedCandidate.actionId)?.clickPoint;
  const clicked = clickPoint
    ? await page.mouse.click(clickPoint.x, clickPoint.y).then(() => true, () => false)
    : await page.evaluate((actionId) => {
    const element = document.querySelector(`[data-certscore-privacy-control-id="${CSS.escape(actionId)}"]`);
    if (!element) {
      return false;
    }
    const target = clickablePrivacyControlTarget(element);
    if (!target) {
      return false;
    }
    dispatchTrustedLikeClick(target);
    return true;

    function clickablePrivacyControlTarget(element: Element): HTMLElement | undefined {
      if (element instanceof HTMLElement) {
        return element;
      }
      return undefined;
    }

    function dispatchTrustedLikeClick(element: HTMLElement): void {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        element.dispatchEvent(new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          view: window,
        }));
      }
      element.click();
    }
  }, selectedCandidate.actionId).catch(() => false);
  if (!clicked) {
    return { attempted: false, selected: false };
  }
  await waitForTimeoutWithinDeadline(page, 300);
  if (await privacyOptOutChoiceSelected(page)) {
    return { attempted: true, selected: true };
  }
  for (const candidate of candidateSnapshot.candidates
    .filter((item) => item.clickPoint && /leading_/.test(item.selectorSummary))
    .sort((left, right) => privacyOptOutClickCandidateRank(right) - privacyOptOutClickCandidateRank(left))) {
    if (!candidate.clickPoint || candidate.actionId === selectedCandidate.actionId) {
      continue;
    }
    const coordinateClicked = await page.mouse.click(candidate.clickPoint.x, candidate.clickPoint.y).then(() => true, () => false);
    if (!coordinateClicked) {
      continue;
    }
    await waitForTimeoutWithinDeadline(page, 250);
    if (await privacyOptOutChoiceSelected(page)) {
      return { attempted: true, selected: true };
    }
  }
  return { attempted: true, selected: false };
}

function privacyOptOutClickCandidateRank(candidate: {
  selectorSummary: string;
  clickPoint?: { x: number; y: number };
} | undefined): number {
  if (!candidate) {
    return 0;
  }
  if (/leading_36px|leading_56px/.test(candidate.selectorSummary)) {
    return 4;
  }
  if (/leading_18px/.test(candidate.selectorSummary)) {
    return 3;
  }
  if (candidate.clickPoint) {
    return 2;
  }
  return 1;
}

async function collectPrivacyOptOutControlDisambiguationCandidates(page: Page): Promise<{
  candidates: Array<{
    actionId: string;
    labelText: string;
    selectorSummary: string;
    domLocation: string;
    clickPoint?: { x: number; y: number };
  }>;
}> {
  return page.evaluate(() => {
    const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
    const optOutPattern = /do not sell(?: my)?(?: personal)? information|do not sell or share|opt[- ]out|sale (?:or|and) sharing|sharing of my personal information|targeted advertising/i;
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const controlSelector = [
      "input[type='radio']",
      "input[type='checkbox']",
      "[role='radio']",
      "[role='checkbox']",
      "button",
      "[role='button']",
      "[tabindex]",
      "[class*='radio' i]",
      "[class*='checkbox' i]",
      "[class*='toggle' i]",
      "[class*='choice' i]",
      "[class*='option' i]",
    ].join(",");
    const textMatches = [...document.querySelectorAll("label, p, span, div, strong")]
      .filter((element) => visible(element) && optOutPattern.test(normalize(element.textContent)))
      .slice(0, 12);
    const candidates: Array<{
      actionId: string;
      labelText: string;
      selectorSummary: string;
      domLocation: string;
      element: Element;
      distance: number;
      clickPoint?: { x: number; y: number };
    }> = [];
    let sequence = 0;
    for (const textElement of textMatches) {
      const textRect = textElement.getBoundingClientRect();
      const matchedText = normalize(textElement.textContent).slice(0, 180);
      const coordinateCandidates = [
        { label: "label_text_center", x: textRect.left + textRect.width / 2, y: textRect.top + textRect.height / 2 },
        { label: "leading_18px", x: textRect.left - 18, y: textRect.top + textRect.height / 2 },
        { label: "leading_36px", x: textRect.left - 36, y: textRect.top + textRect.height / 2 },
        { label: "leading_56px", x: textRect.left - 56, y: textRect.top + textRect.height / 2 },
      ].filter((point) => point.x >= 0 && point.y >= 0 && point.x <= window.innerWidth && point.y <= window.innerHeight);
      for (const point of coordinateCandidates) {
        const id = `privacy_opt_out_candidate_${sequence++}`;
        candidates.push({
          actionId: id,
          labelText: normalize([
            `matchedText=${matchedText}`,
            `candidateKind=coordinate`,
            `clickTarget=${point.label}`,
            `context=${normalize((textElement.closest("label, [role='group'], fieldset, section, li, div") ?? textElement.parentElement)?.textContent).slice(0, 260)}`,
          ].join(" | ")),
          selectorSummary: `privacyControlCoordinate:${point.label}`,
          domLocation: "coordinate_near_opt_out_text",
          element: textElement,
          distance: point.label === "label_text_center" ? 20 : Number(point.label.match(/\d+/)?.[0] ?? 40),
          clickPoint: { x: Math.round(point.x), y: Math.round(point.y) },
        });
      }
      const containers = ancestorElements(textElement).slice(0, 8);
      const controls = uniqueElements(
        containers.flatMap((container) => [
          ...[...container.querySelectorAll(controlSelector)],
          ...previousElementControls(container, controlSelector),
          ...nextElementControls(container, controlSelector),
        ]),
      ).filter((element) => visible(element));
      for (const control of controls.slice(0, 16)) {
        const rect = control.getBoundingClientRect();
        const centerDistance = Math.round(Math.hypot(
          (rect.left + rect.width / 2) - (textRect.left + textRect.width / 2),
          (rect.top + rect.height / 2) - (textRect.top + textRect.height / 2),
        ));
        if (centerDistance > 900) {
          continue;
        }
        const html = control as HTMLElement;
        const id = `privacy_opt_out_candidate_${sequence++}`;
        html.dataset.certscorePrivacyControlId = id;
        const container = html.closest("label, [role='group'], fieldset, section, li, div") ?? html.parentElement;
        candidates.push({
          actionId: id,
          labelText: normalize([
            `matchedText=${normalize(textElement.textContent).slice(0, 180)}`,
            `controlText=${normalize(html.textContent).slice(0, 180)}`,
            `ariaLabel=${html.getAttribute("aria-label") ?? ""}`,
            `role=${html.getAttribute("role") ?? html.tagName.toLowerCase()}`,
            `type=${html.getAttribute("type") ?? ""}`,
            `name=${html.getAttribute("name") ?? ""}`,
            `value=${html.getAttribute("value") ?? ""}`,
            `checked=${html instanceof HTMLInputElement ? String(html.checked) : html.getAttribute("aria-checked") ?? html.getAttribute("data-checked") ?? ""}`,
            `context=${normalize(container?.textContent).slice(0, 260)}`,
            `distance=${centerDistance}`,
          ].join(" | ")),
          selectorSummary: `privacyControlCandidate:${id}`,
          domLocation: `${html.tagName.toLowerCase()}${html.getAttribute("role") ? `[role=${html.getAttribute("role")}]` : ""}`,
          element: control,
          distance: centerDistance,
        });
      }
    }
    return {
      candidates: candidates
        .sort((left, right) => left.distance - right.distance || left.actionId.localeCompare(right.actionId))
        .slice(0, 16)
        .map(({ actionId, labelText, selectorSummary, domLocation, clickPoint }) => ({
          actionId,
          labelText,
          selectorSummary,
          domLocation,
          clickPoint,
        })),
    };

    function ancestorElements(element: Element): Element[] {
      const values: Element[] = [];
      let cursor: Element | null = element;
      while (cursor && cursor !== document.body && values.length < 12) {
        values.push(cursor);
        cursor = cursor.parentElement;
      }
      if (document.body) {
        values.push(document.body);
      }
      return values;
    }

    function previousElementControls(element: Element, selector: string): Element[] {
      const values: Element[] = [];
      let cursor = element.previousElementSibling;
      while (cursor && values.length < 8) {
        if (cursor.matches(selector)) {
          values.push(cursor);
        }
        values.push(...cursor.querySelectorAll(selector));
        cursor = cursor.previousElementSibling;
      }
      return values;
    }

    function nextElementControls(element: Element, selector: string): Element[] {
      const values: Element[] = [];
      let cursor = element.nextElementSibling;
      while (cursor && values.length < 8) {
        if (cursor.matches(selector)) {
          values.push(cursor);
        }
        values.push(...cursor.querySelectorAll(selector));
        cursor = cursor.nextElementSibling;
      }
      return values;
    }

    function uniqueElements(values: Element[]): Element[] {
      return [...new Set(values)];
    }
  }).catch(() => ({ candidates: [] }));
}

async function writePrivacyOptOutFormDiagnosticArtifact(
  input: ConsentFlowRuntimeScannerInput,
  page: Page,
  scenario: ConsentFlowScenario,
  phase: "before_selection" | "after_selection",
): Promise<{ artifactId: string; path: string; observedAtMs: number } | undefined> {
  const observedAtMs = elapsed(input.scanStartedAtMs);
  let diagnostic: { pageUrl: string; sections: Array<Record<string, unknown>> } | undefined = await page.evaluate(() => {
    const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
    const optOutPattern = /do not sell(?: my)?(?: personal)? information|do not sell or share|opt[- ]out|sale (?:or|and) sharing|sharing of my personal information/i;
    const optInPattern = /accept standard advertising settings|opt in|i agree to the sale (?:or|and) sharing/i;
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const selected = (element: Element) => {
      if (element instanceof HTMLInputElement) {
        return element.checked;
      }
      const value = [
        element.getAttribute("aria-checked"),
        element.getAttribute("aria-selected"),
        element.getAttribute("data-checked"),
        element.getAttribute("data-state"),
        element.getAttribute("data-selected"),
        element.className.toString(),
      ].join(" ").toLowerCase();
      return /\btrue\b|\bchecked\b|\bselected\b|\bactive\b/.test(value);
    };
    const textMatches = [...document.querySelectorAll("label, p, span, div, strong")]
      .filter((element) => visible(element) && optOutPattern.test(normalize(element.textContent)))
      .slice(0, 8);
    const sections = textMatches.map((textElement, index) => {
      const container = textElement.closest("label, [role='radiogroup'], [role='group'], fieldset, section, form, li, div") ?? textElement.parentElement;
      const controls = container
        ? [...container.querySelectorAll("input, button, [role], [tabindex], label")]
          .filter((element) => visible(element))
          .slice(0, 28)
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const html = element as HTMLElement;
            return {
              tagName: element.tagName.toLowerCase(),
              role: html.getAttribute("role"),
              type: html.getAttribute("type"),
              name: html.getAttribute("name"),
              value: html.getAttribute("value"),
              ariaLabel: html.getAttribute("aria-label"),
              ariaChecked: html.getAttribute("aria-checked"),
              ariaSelected: html.getAttribute("aria-selected"),
              dataState: html.getAttribute("data-state"),
              classHint: html.className.toString().replace(/\s+/g, " ").slice(0, 180),
              selected: selected(element),
              text: normalize(element.textContent).slice(0, 220),
              rect: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              },
            };
          })
        : [];
      const htmlExcerpt = container
        ? sanitizeHtml(container.outerHTML).slice(0, 4_000)
        : undefined;
      return {
        index,
        matchedText: normalize(textElement.textContent).slice(0, 240),
        hasOptOutText: optOutPattern.test(normalize(container?.textContent)),
        hasOptInText: optInPattern.test(normalize(container?.textContent)),
        controls,
        htmlExcerpt,
      };
    });
    return {
      pageUrl: location.href,
      sections,
    };

    function sanitizeHtml(value: string): string {
      return value
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/\s(?:href|src)=["'][^"']{160,}["']/gi, "")
        .replace(/\s(?:data-[\w-]+)=["'][^"']{240,}["']/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    }
  }).catch(() => undefined);
  if (!diagnostic || diagnostic.sections.length === 0) {
    const text = await page.locator("body").innerText({ timeout: 1_500 }).catch(() => "");
    const excerpt = boundedPrivacyFormExcerpt(text);
    if (!excerpt) {
      return undefined;
    }
    diagnostic = {
      pageUrl: page.url(),
      sections: [{
        controls: [],
        fallbackTextExcerpt: excerpt,
        hasOptInText: /accept standard advertising settings|opt in|i agree to the sale (?:or|and) sharing/i.test(excerpt),
        hasOptOutText: /do not sell(?: my)?(?: personal)? information|do not sell or share|opt[- ]out|sale (?:or|and) sharing/i.test(excerpt),
        htmlExcerpt: undefined,
        index: 0,
        matchedText: "fallback_text_privacy_opt_out_form",
      }],
    };
  }
  const artifactId = `PrivacyOptOutFormDiagnostics-${scenario}-${phase}`;
  const artifactPath = await input.artifactWriter.writeJsonArtifact(`${artifactId}.json`, {
    artifactVersion: "certscore.v2.privacy_opt_out_form_diagnostics.v1",
    sourceScanner: SOURCE_SCANNER,
    scenario,
    phase,
    observedAtMs,
    ...diagnostic,
  });
  return { artifactId, path: artifactPath, observedAtMs };
}

function boundedPrivacyFormExcerpt(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();
  const anchors = [
    lower.indexOf("do not sell or share"),
    lower.indexOf("california privacy rights act"),
    lower.indexOf("right to opt out"),
    lower.indexOf("accept standard advertising settings"),
  ].filter((index) => index >= 0);
  if (anchors.length === 0) {
    return undefined;
  }
  const start = Math.max(0, Math.min(...anchors) - 800);
  return normalized.slice(start, start + 4_000);
}

async function clickPrivacyOptOutLeadingControl(page: Page): Promise<boolean> {
  const labels = [
    "Do Not Sell or Share My Personal Information (Opt Out)",
    "Do Not Sell or Share My Personal Information",
  ];
  for (const label of labels) {
    const locator = page.getByText(label, { exact: false }).first();
    const box = await locator.boundingBox({ timeout: 750 }).catch(() => null);
    if (!box) {
      continue;
    }
    await page.mouse.click(Math.max(0, box.x - 18), box.y + (box.height / 2)).catch(() => undefined);
    await waitForTimeoutWithinDeadline(page, 250);
    if (await privacyOptOutChoiceSelected(page)) {
      return true;
    }
  }
  return false;
}

async function privacyOptOutChoiceSelected(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const optOutPattern = /do not sell(?: my)?(?: personal)? information|do not sell or share|opt[- ]out|sale (?:or|and) sharing|sharing of my personal information/i;
    const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
    const selected = (element: Element) => element instanceof HTMLInputElement
      ? element.checked
      : element.getAttribute("aria-checked") === "true" ||
        element.getAttribute("data-checked") === "true" ||
        element.className.toString().toLowerCase().includes("checked");
    const controls = [...document.querySelectorAll("input[type='radio'], input[type='checkbox'], [role='radio'], [role='checkbox']")];
    return controls.some((control) => {
      if (!selected(control)) {
        return false;
      }
      const htmlControl = control as HTMLElement;
      const id = htmlControl.id;
      const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const container = htmlControl.closest("label, [role='group'], fieldset, section, div, li") ?? htmlControl.parentElement;
      return optOutPattern.test(normalize([
        label?.textContent,
        htmlControl.getAttribute("aria-label"),
        htmlControl.getAttribute("name"),
        htmlControl.getAttribute("value"),
        container?.textContent,
      ].filter(Boolean).join(" ")));
    });
  }).catch(() => false);
}

function privacyOptOutFormCandidate(
  scenario: ConsentFlowScenario,
  dom: DomSnapshotArtifact,
  screenshot: ScreenshotArtifact | undefined,
  submittedLabel: string | undefined,
): ConsentActionCandidate {
  const screenshotRef = artifactRefFromOptionalScreenshot(screenshot);
  return {
    actionId: `${scenario}_privacy_opt_out_form`,
    actionType: "do_not_sell_share",
    labelText: submittedLabel ? `Do Not Sell My Information via ${submittedLabel}` : "Do Not Sell My Information form",
    normalizedLabel: "do not sell my information form",
    selectorSummary: "privacyOptOutForm",
    domLocation: "privacy_request_form",
    contextTextExcerpt: dom.textExcerpt,
    frameContext: {
      frameKind: "main_frame",
      frameUrl: undefined,
    },
    visible: true,
    enabled: true,
    confidence: 0.84,
    detectionMethod: "deterministic_text",
    shouldClick: true,
    evidenceRefs: [{ refId: `ref_${dom.artifactId}_privacy_opt_out_form`, artifactId: dom.artifactId, eventType: "dom_snapshot", label: "Do Not Sell My Information form", excerpt: "Do Not Sell My Information" }],
    screenshotArtifactRefs: screenshotRef ? [screenshotRef] : [],
    assistMetadata: [],
  };
}

async function attemptPostChoicePreferenceReopen(input: {
  input: ConsentFlowRuntimeScannerInput;
  page: Page;
  scenario: ConsentFlowScenario;
  consentState: ConsentState;
  scanStartedAtMs: number;
  actionCandidates: ConsentActionCandidate[];
  beforeDom: DomSnapshotArtifact;
  beforeScreenshot: ScreenshotArtifact | undefined;
  bannerPresentBefore: boolean;
  preActionConsentStateMarkers: string[];
  nanoAssistErrors: string[];
  nextId: ScenarioIdFactory;
  deadlineAtMs?: number;
}): Promise<{
  attempted: boolean;
  succeeded: boolean;
  failureReason?: string;
  bannerPresentAfter?: boolean;
  afterDomRef?: ArtifactRef;
  afterScreenshotRef?: ArtifactRef;
  evidenceRefs: EvidenceRef[];
  secondLayerCandidates: ConsentActionCandidate[];
  actionProof: ConsentActionProof;
  preferenceCenterTraversal: NonNullable<ConsentActionAttempt["preferenceCenterTraversal"]>;
} | undefined> {
  const opener = bestCookiePreferenceReopenControl(input.actionCandidates);
  if (!opener) {
    return undefined;
  }

  const traversalId = `post_choice_preference_center_${input.scenario}_${input.nextId("traversal")}`;
  const evidenceRefs: EvidenceRef[] = [
    { refId: `ref_${input.beforeDom.artifactId}`, artifactId: input.beforeDom.artifactId, eventType: "dom_snapshot", excerpt: input.beforeDom.textExcerpt },
  ];
  const actionTimestampMs = elapsed(input.scanStartedAtMs);
  await clickCandidate(input.page, opener);
  await waitForPreferenceSurfaceSettle(input.page, input.deadlineAtMs);
  const centerDom = await writeDomArtifact(input.input, input.page, input.scenario, "post_choice_preference_center", input.consentState);
  const centerScreenshot = await writeScreenshotArtifact(input.input, input.page, input.scenario, "post_choice_preference_center", input.consentState);
  const centerRawCandidates = await extractControlCandidates(input.page, {
    limit: controlCandidateLimit(input.input, input.scenario, "post_action"),
    scenario: input.scenario,
  });
  const centerClassification = await classifyActionCandidates(
    input.input,
    input.page.url(),
    input.scenario,
    centerRawCandidates,
    centerDom,
    centerScreenshot,
    {
      nanoCandidateLimit: plannedNanoCandidateLimit(input.input, input.scenario),
      targetActionType: "reopen_preferences",
    },
  );
  input.nanoAssistErrors.push(...centerClassification.nanoAssistErrors);
  evidenceRefs.push({ refId: `ref_${centerDom.artifactId}`, artifactId: centerDom.artifactId, eventType: "dom_snapshot", excerpt: centerDom.textExcerpt });

  const secondLayerCandidates = centerClassification.actionCandidates;
  const categoryToggleCount = await countVisiblePreferenceToggles(input.page);
  const secondLayerObserved =
    secondLayerCandidates.some((candidate) =>
      ["reject_all", "save_preferences", "accept_all"].includes(candidate.actionType),
    ) || categoryToggleCount > 0 || /cookie preference|cookie settings|consent preference|preference center|save choices|reject all/i.test(centerDom.textExcerpt ?? "");
  const postActionConsentStateMarkers = await consentStateMarkers(input.page);
  const succeeded = secondLayerObserved;
  const failureReason = succeeded ? undefined : "post_choice_preference_center_second_layer_not_observed";
  const bannerPresentAfter = bannerLikelyPresent(secondLayerCandidates, centerDom.textExcerpt);
  const beforeScreenshotRef = artifactRefFromOptionalScreenshot(input.beforeScreenshot);
  const afterScreenshotRef = artifactRefFromOptionalScreenshot(centerScreenshot);
  const beforeDomRef = artifactRefFromDom(input.beforeDom);
  const afterDomRef = artifactRefFromDom(centerDom);
  const postClickSettleMs = elapsed(input.scanStartedAtMs) - actionTimestampMs;
  const saveCandidate = bestCandidate(secondLayerCandidates, "save_preferences");
  const rejectCandidate = bestCandidate(secondLayerCandidates, "reject_all");
  const acceptCandidate = bestCandidate(secondLayerCandidates, "accept_all");

  return {
    attempted: true,
    succeeded,
    failureReason,
    bannerPresentAfter,
    afterDomRef,
    afterScreenshotRef,
    evidenceRefs,
    secondLayerCandidates,
    actionProof: actionProof({
      afterDomRef,
      afterScreenshotRef,
      attempted: true,
      beforeDomRef,
      beforeScreenshotRef,
      candidate: opener,
      evidenceRefs,
      failureReason,
      afterDomExcerpt: centerDom.textExcerpt,
      beforeDomExcerpt: input.beforeDom.textExcerpt,
      cmpContext: detectCmpContext([
        input.beforeDom.textExcerpt,
        centerDom.textExcerpt,
        opener.labelText,
        opener.contextTextExcerpt,
      ]),
      actionPath: "direct_action",
      actionTimestampMs,
      postClickSettleMs,
      postActionConsentStateMarkers,
      preActionConsentStateMarkers: input.preActionConsentStateMarkers,
      succeeded,
    }),
    preferenceCenterTraversal: {
      traversalId,
      firstLayerActionId: opener.actionId,
      opened: true,
      openSucceeded: secondLayerObserved,
      secondLayerObserved,
      secondLayerControlCount: secondLayerCandidates.length,
      rejectAllControlObserved: Boolean(rejectCandidate),
      saveChoicesControlObserved: Boolean(saveCandidate),
      acceptAllControlObserved: Boolean(acceptCandidate),
      categoryTogglesObserved: categoryToggleCount,
      attemptedDisableCategoryToggles: false,
      disabledCategoryToggles: 0,
      attemptedRejectViaPreferenceCenter: false,
      attemptedSaveChoices: false,
      succeeded,
      failureReason,
      confidence: succeeded ? 0.82 : 0.35,
      evidenceRefs,
      screenshotArtifactRefs: [afterScreenshotRef].filter((ref): ref is ArtifactRef => Boolean(ref)),
      domArtifactRefs: [afterDomRef],
    },
  };
}

async function attemptPreferenceCenterRejectTraversal(input: {
  input: ConsentFlowRuntimeScannerInput;
  page: Page;
  scenario: ConsentFlowScenario;
  consentState: ConsentState;
  targetActionType: Extract<ConsentActionType, "accept_all" | "reject_all">;
  scanStartedAtMs: number;
  actionCandidates: ConsentActionCandidate[];
  beforeDom: DomSnapshotArtifact;
  beforeScreenshot: ScreenshotArtifact | undefined;
  bannerPresentBefore: boolean;
  preActionConsentStateMarkers: string[];
  nanoAssistErrors: string[];
  nextId: ScenarioIdFactory;
  deadlineAtMs?: number;
  allowRejectSaveOnly?: boolean;
}): Promise<{
  attempted: boolean;
  succeeded: boolean;
  failureReason?: string;
  bannerPresentAfter?: boolean;
  afterDomRef?: ArtifactRef;
  afterScreenshotRef?: ArtifactRef;
  evidenceRefs: EvidenceRef[];
  secondLayerCandidates: ConsentActionCandidate[];
  clickedSelectorSummary?: string;
  actionProof: ConsentActionProof;
  preferenceCenterTraversal: NonNullable<ConsentActionAttempt["preferenceCenterTraversal"]>;
} | undefined> {
  const manageCandidate = bestPreferenceSurfaceOpener(input.actionCandidates);
  if (!manageCandidate) {
    return undefined;
  }

  const traversalId = `preference_center_${input.scenario}_${input.nextId("traversal")}`;
  const evidenceRefs: EvidenceRef[] = [
    { refId: `ref_${input.beforeDom.artifactId}`, artifactId: input.beforeDom.artifactId, eventType: "dom_snapshot", excerpt: input.beforeDom.textExcerpt },
  ];
  const captureInlineScreenshots = shouldCaptureInlineScreenshots(input.input, input.scenario);
  await clickCandidate(input.page, manageCandidate);
  await waitForPreferenceSurfaceSettle(input.page, input.deadlineAtMs);
  const centerDom = await writeDomArtifact(input.input, input.page, input.scenario, "preference_center", "pre_consent");
  const budgetLimitedPreferenceCenter = shouldUseDeterministicOnlyActionTail(input.input, input.scenario, input.deadlineAtMs);
  const centerScreenshot = captureInlineScreenshots && !scenarioDeadlineNearlyHit(input.deadlineAtMs, 1_500)
    ? await writeScreenshotArtifact(input.input, input.page, input.scenario, "preference_center", "pre_consent", {
      timeoutMs: screenshotTimeoutWithinDeadline(input.deadlineAtMs),
    })
    : undefined;
  const centerRawCandidates = await extractControlCandidates(input.page, {
    actionType: input.targetActionType,
    limit: controlCandidateLimit(input.input, input.scenario, "post_action"),
    scenario: input.scenario,
  });
  const centerClassification = await classifyActionCandidates(
    input.input,
    input.page.url(),
    input.scenario,
    centerRawCandidates,
    centerDom,
    centerScreenshot,
    {
      allowNanoAssist: !budgetLimitedPreferenceCenter,
      nanoCandidateLimit: plannedNanoCandidateLimit(input.input, input.scenario),
      skipNanoWhenHighConfidenceTarget: shouldPreferDeterministicTargetClassification(input.input, input.scenario),
      targetActionType: input.targetActionType,
    },
  );
  input.nanoAssistErrors.push(...centerClassification.nanoAssistErrors);
  evidenceRefs.push({ refId: `ref_${centerDom.artifactId}`, artifactId: centerDom.artifactId, eventType: "dom_snapshot", excerpt: centerDom.textExcerpt });

  const secondLayerCandidates = centerClassification.actionCandidates;
  const targetCandidate = bestCandidate(secondLayerCandidates, input.targetActionType);
  const rejectCandidate = bestCandidate(secondLayerCandidates, "reject_all");
  const saveCandidate = bestCandidate(secondLayerCandidates, "save_preferences");
  const acceptCandidate = bestCandidate(secondLayerCandidates, "accept_all");
  const categoryToggleCount = await countVisiblePreferenceToggles(input.page);
  const secondLayerObserved =
    secondLayerCandidates.some((candidate) =>
      ["reject_all", "save_preferences", "accept_all"].includes(candidate.actionType),
    ) || categoryToggleCount > 0 || /preference|settings|categories|save choices|reject all/i.test(centerDom.textExcerpt ?? "");

  let attemptedRejectViaPreferenceCenter = false;
  let attemptedSaveChoices = false;
  let attemptedDisableCategoryToggles = false;
  let disabledCategoryToggles = 0;
  let failureReason: string | undefined;
  let clickedSelectorSummary: string | undefined;
  let actionCandidateForProof: ConsentActionCandidate | undefined = targetCandidate;
  let actionPath: ConsentActionProof["actionPath"] = "preference_center_unresolved";
  let actionTimestampMs: number | undefined;
  let postClickSettleMs: number | undefined;

  if (!secondLayerObserved) {
    failureReason = "preference_center_second_layer_not_observed";
  } else if (input.targetActionType === "accept_all") {
    if (acceptCandidate?.shouldClick && acceptCandidate.confidence >= 0.78) {
      actionTimestampMs = elapsed(input.scanStartedAtMs);
      await clickCandidate(input.page, acceptCandidate);
      clickedSelectorSummary = acceptCandidate.selectorSummary;
      actionCandidateForProof = acceptCandidate;
      actionPath = "preference_center_unresolved";
      postClickSettleMs = await waitForConsentActionSettle(input.page, consentActionSettleBudgetMs(input.input, input.deadlineAtMs), input.deadlineAtMs);
    } else {
      failureReason = acceptCandidate ? "preference_center_accept_confidence_too_low" : "preference_center_accept_not_observed";
    }
  } else if (!rejectCandidate?.shouldClick || rejectCandidate.confidence < 0.78) {
    if (saveCandidate?.shouldClick && saveCandidate.confidence >= 0.78 && input.allowRejectSaveOnly === true) {
      actionTimestampMs = elapsed(input.scanStartedAtMs);
      await clickCandidate(input.page, saveCandidate);
      clickedSelectorSummary = saveCandidate.selectorSummary;
      attemptedRejectViaPreferenceCenter = true;
      attemptedSaveChoices = true;
      actionCandidateForProof = saveCandidate;
      actionPath = "preference_center_reject_all_save";
      postClickSettleMs = await waitForConsentActionSettle(input.page, consentActionSettleBudgetMs(input.input, input.deadlineAtMs), input.deadlineAtMs);
    } else if (saveCandidate?.shouldClick && saveCandidate.confidence >= 0.78 && categoryToggleCount > 0) {
      actionTimestampMs = elapsed(input.scanStartedAtMs);
      disabledCategoryToggles = await disableVisiblePreferenceToggles(input.page);
      attemptedDisableCategoryToggles = disabledCategoryToggles > 0;
      attemptedRejectViaPreferenceCenter = attemptedDisableCategoryToggles;
      actionCandidateForProof = saveCandidate;
      actionPath = "preference_center_toggle_save";
      if (attemptedDisableCategoryToggles) {
        await clickCandidate(input.page, saveCandidate);
        clickedSelectorSummary = saveCandidate.selectorSummary;
        attemptedSaveChoices = true;
        postClickSettleMs = await waitForConsentActionSettle(input.page, consentActionSettleBudgetMs(input.input, input.deadlineAtMs), input.deadlineAtMs);
      } else {
        failureReason = "preference_center_no_toggles_disabled";
      }
    } else {
      failureReason = rejectCandidate ? "preference_center_reject_confidence_too_low" : "preference_center_reject_not_observed";
    }
  } else {
    actionTimestampMs = elapsed(input.scanStartedAtMs);
    await clickCandidate(input.page, rejectCandidate);
    clickedSelectorSummary = rejectCandidate.selectorSummary;
    attemptedRejectViaPreferenceCenter = true;
    actionPath = saveCandidate ? "preference_center_reject_all_save" : "preference_center_unresolved";
    await waitForTimeoutWithinDeadline(input.page, 500, input.deadlineAtMs);
    if (saveCandidate?.shouldClick && saveCandidate.confidence >= 0.78) {
      await clickCandidate(input.page, saveCandidate);
      clickedSelectorSummary = saveCandidate.selectorSummary;
      attemptedSaveChoices = true;
      postClickSettleMs = await waitForConsentActionSettle(input.page, consentActionSettleBudgetMs(input.input, input.deadlineAtMs), input.deadlineAtMs);
    } else {
      postClickSettleMs = await waitForConsentActionSettle(input.page, consentActionSettleBudgetMs(input.input, input.deadlineAtMs), input.deadlineAtMs);
    }
  }

  const postActionConsentStateMarkers = attemptedRejectViaPreferenceCenter
    || (input.targetActionType === "accept_all" && actionCandidateForProof?.actionType === "accept_all")
    ? await consentStateMarkers(input.page)
    : [];
  const afterDom = await writeDomArtifact(input.input, input.page, input.scenario, "after_preference_center", input.consentState);
  const budgetLimitedPostActionTail = shouldUseBudgetLimitedPostActionTail(input.input, input.scenario, input.deadlineAtMs);
  const attemptedTargetAction = input.targetActionType === "accept_all"
    ? actionCandidateForProof?.actionType === "accept_all" && Boolean(actionTimestampMs)
    : attemptedRejectViaPreferenceCenter;
  const postActionStateChanged = consentStateChangedAfterAction(input.preActionConsentStateMarkers, postActionConsentStateMarkers);
  const skipPostActionClassification = shouldSkipPostActionClassificationAfterProof(
    input.input,
    input.scenario,
    Boolean(attemptedTargetAction),
    postActionStateChanged,
  );
  let afterScreenshot = captureInlineScreenshots && !budgetLimitedPostActionTail && !skipPostActionClassification
    ? await writeScreenshotArtifact(input.input, input.page, input.scenario, "after_preference_center", input.consentState, {
      timeoutMs: screenshotTimeoutWithinDeadline(input.deadlineAtMs),
    })
    : undefined;
  const afterRawCandidates = budgetLimitedPostActionTail || skipPostActionClassification
    ? []
    : await extractControlCandidates(input.page, {
      actionType: input.targetActionType,
      limit: controlCandidateLimit(input.input, input.scenario, "post_action"),
      scenario: input.scenario,
    });
  const afterClassification = budgetLimitedPostActionTail || skipPostActionClassification
    ? { actionCandidates: [], nanoAssistErrors: [] }
    : await classifyActionCandidates(
      input.input,
      input.page.url(),
      input.scenario,
      afterRawCandidates,
      afterDom,
      afterScreenshot,
      {
        allowNanoAssist: !shouldUseDeterministicOnlyActionTail(input.input, input.scenario, input.deadlineAtMs),
        nanoCandidateLimit: plannedNanoCandidateLimit(input.input, input.scenario),
        targetActionType: input.targetActionType,
      },
    );
  input.nanoAssistErrors.push(...afterClassification.nanoAssistErrors);
  const bannerPresentAfter = skipPostActionClassification
    ? false
    : bannerLikelyPresent(afterClassification.actionCandidates, afterDom.textExcerpt);
  const saveRequirementMet = input.targetActionType === "accept_all" || attemptedSaveChoices || !saveCandidate;
  const surfaceClosedOrStateChanged = !bannerPresentAfter ||
    postActionStateChanged;
  const preferenceSurfaceChanged = domTextChangedAfterAction(centerDom.textExcerpt, afterDom.textExcerpt);
  const succeeded = Boolean(attemptedTargetAction) &&
    saveRequirementMet &&
    (input.bannerPresentBefore
      ? surfaceClosedOrStateChanged
      : consentStateChangedAfterAction(input.preActionConsentStateMarkers, postActionConsentStateMarkers) || preferenceSurfaceChanged);
  if (!succeeded && !failureReason) {
    failureReason = bannerPresentAfter
      ? "preference_center_banner_still_present_after_save"
      : input.targetActionType === "accept_all" ? "preference_center_accept_path_not_completed" : "preference_center_reject_path_not_completed";
  }
  if (!succeeded && !afterScreenshot && !budgetLimitedPostActionTail && !scenarioDeadlineNearlyHit(input.deadlineAtMs, 1_200)) {
    afterScreenshot = await writeScreenshotArtifact(input.input, input.page, input.scenario, "after_preference_center_failure", input.consentState, {
      timeoutMs: screenshotTimeoutWithinDeadline(input.deadlineAtMs),
    });
  }
  evidenceRefs.push({ refId: `ref_${afterDom.artifactId}`, artifactId: afterDom.artifactId, eventType: "dom_snapshot", excerpt: afterDom.textExcerpt });

  const confidence = succeeded
    ? Math.min(0.86, Math.max(rejectCandidate?.confidence ?? 0, saveCandidate?.confidence ?? 0.78))
    : attemptedRejectViaPreferenceCenter ? 0.45 : 0.35;
  const beforeScreenshotRef = artifactRefFromOptionalScreenshot(input.beforeScreenshot);
  const afterScreenshotRef = artifactRefFromOptionalScreenshot(afterScreenshot);
  const beforeDomRef = artifactRefFromDom(input.beforeDom);
  const afterDomRef = artifactRefFromDom(afterDom);

  return {
    attempted: Boolean(attemptedTargetAction),
    succeeded,
    failureReason,
    bannerPresentAfter,
    afterDomRef,
    afterScreenshotRef,
    evidenceRefs,
    secondLayerCandidates,
    clickedSelectorSummary,
    actionProof: actionProof({
      afterDomRef,
      afterScreenshotRef,
      attempted: Boolean(attemptedTargetAction),
      beforeDomRef,
      beforeScreenshotRef,
      candidate: actionCandidateForProof,
      evidenceRefs,
      failureReason,
      afterDomExcerpt: afterDom.textExcerpt,
      beforeDomExcerpt: input.beforeDom.textExcerpt,
      cmpContext: detectCmpContext([
        input.beforeDom.textExcerpt,
        centerDom.textExcerpt,
        afterDom.textExcerpt,
        manageCandidate.labelText,
        manageCandidate.contextTextExcerpt,
        actionCandidateForProof?.labelText,
        actionCandidateForProof?.contextTextExcerpt,
      ]),
      actionPath,
      actionTimestampMs,
      postClickSettleMs,
      postActionConsentStateMarkers,
      preActionConsentStateMarkers: input.preActionConsentStateMarkers,
      succeeded,
    }),
    preferenceCenterTraversal: {
      traversalId,
      firstLayerActionId: manageCandidate.actionId,
      opened: true,
      openSucceeded: secondLayerObserved,
      secondLayerObserved,
      secondLayerControlCount: secondLayerCandidates.length,
      rejectAllControlObserved: Boolean(rejectCandidate),
      saveChoicesControlObserved: Boolean(saveCandidate),
      acceptAllControlObserved: Boolean(acceptCandidate),
      categoryTogglesObserved: categoryToggleCount,
      attemptedDisableCategoryToggles,
      disabledCategoryToggles,
      attemptedRejectViaPreferenceCenter,
      attemptedSaveChoices,
      succeeded,
      failureReason,
      confidence,
      evidenceRefs,
      screenshotArtifactRefs: [
        artifactRefFromOptionalScreenshot(centerScreenshot),
        artifactRefFromOptionalScreenshot(afterScreenshot),
      ].filter((ref): ref is ArtifactRef => Boolean(ref)),
      domArtifactRefs: [artifactRefFromDom(centerDom), artifactRefFromDom(afterDom)],
    },
  };
}

async function waitForPreferenceSurfaceSettle(page: Page, deadlineAtMs?: number): Promise<void> {
  const compactSettle = scenarioDeadlineNearlyHit(deadlineAtMs, 4_500);
  const loadTimeoutMs = Math.min(compactSettle ? 1_000 : 3_000, remainingDeadlineMs(deadlineAtMs, compactSettle ? 1_000 : 3_000));
  if (loadTimeoutMs > 0) {
    await page.waitForLoadState("domcontentloaded", { timeout: loadTimeoutMs }).catch(() => undefined);
  }
  await waitForTimeoutWithinDeadline(page, compactSettle ? 100 : 250, deadlineAtMs);
  const preferenceFunctionTimeoutMs = Math.min(
    compactSettle ? 900 : 2_500,
    remainingDeadlineMs(deadlineAtMs, compactSettle ? 900 : 2_500),
  );
  if (preferenceFunctionTimeoutMs <= 0) {
    return;
  }
  await page.waitForFunction(() => {
    const text = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();
    const controls = [...document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit'], a")];
    return controls.some((element) => {
      const rect = element.getBoundingClientRect();
      const label = (
        element.textContent ||
        element.getAttribute("aria-label") ||
        element.getAttribute("value") ||
        ""
      ).replace(/\s+/g, " ").trim();
      return rect.width > 0 && rect.height > 0 &&
        /opt out|reject|accept|save|manage settings|cookie settings|privacy settings/i.test(label);
    }) || /opt out|reject all|accept all|save choices|manage settings/i.test(text);
  }, undefined, { timeout: preferenceFunctionTimeoutMs }).catch(() => undefined);
  await waitForTimeoutWithinDeadline(page, compactSettle ? 150 : 500, deadlineAtMs);
}

async function waitForScenarioReadiness(
  page: Page,
  scenario: ConsentFlowScenario,
  internalBudgetMs: number,
  deadlineAtMs?: number,
): Promise<void> {
  if (scenario === "baseline_pre_consent") {
    await page.waitForLoadState("networkidle", {
      timeout: Math.min(3_000, internalBudgetMs, remainingDeadlineMs(deadlineAtMs, 3_000)),
    }).catch(() => undefined);
    await waitForTimeoutWithinDeadline(page, 500, deadlineAtMs);
    return;
  }

  const readinessFunctionTimeoutMs = Math.min(
    scenarioReadinessTimeoutMs(scenario),
    internalBudgetMs,
    remainingDeadlineMs(deadlineAtMs, scenarioReadinessTimeoutMs(scenario)),
  );
  if (readinessFunctionTimeoutMs <= 0) {
    return;
  }
  await page.waitForFunction(() => {
    const bodyText = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();
    const controls = [...document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit'], a")];
    if (controls.length >= 3 && bodyText.length > 200) {
      return true;
    }
    const consentControlReady = controls.some((element) => {
      const rect = element.getBoundingClientRect();
      const label = (
        element.textContent ||
        element.getAttribute("aria-label") ||
        element.getAttribute("value") ||
        ""
      ).replace(/\s+/g, " ").trim();
      return rect.width > 0 && rect.height > 0 &&
        /accept|reject|opt out|privacy choices|cookie settings|preferences|manage/i.test(label);
    });
    if (consentControlReady) {
      return true;
    }
    if (document.readyState !== "loading" && bodyText.length > 40 && performance.now() > 450) {
      return true;
    }
    if (document.readyState === "complete" && controls.length === 0 && performance.now() > 650) {
      return true;
    }
    return false;
  }, undefined, { timeout: readinessFunctionTimeoutMs }).catch(() => undefined);
  await waitForTimeoutWithinDeadline(page, 250, deadlineAtMs);
}

function domTextChangedAfterAction(before: string | undefined, after: string | undefined): boolean {
  const normalize = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
  const beforeText = normalize(before);
  const afterText = normalize(after);
  return beforeText.length > 0 && afterText.length > 0 && beforeText !== afterText;
}

async function disableVisiblePreferenceToggles(page: Page): Promise<number> {
  return page.evaluate(() => {
    let disabled = 0;
    const controls = [...document.querySelectorAll("input[type='checkbox'], [role='switch'], [aria-checked]")];
    for (const element of controls) {
      const htmlElement = element as HTMLElement;
      const rect = htmlElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      if (element instanceof HTMLInputElement && element.type === "checkbox") {
        if (element.checked) {
          element.click();
          disabled += 1;
        }
        continue;
      }
      const ariaChecked = element.getAttribute("aria-checked");
      if (ariaChecked === "true") {
        htmlElement.click();
        disabled += 1;
      }
    }
    return disabled;
  }).catch(() => 0);
}

async function countVisiblePreferenceToggles(page: Page): Promise<number> {
  return page.evaluate(() => {
    const controls = [...document.querySelectorAll("input[type='checkbox'], [role='switch'], [aria-checked]")];
    return controls.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).length;
  }).catch(() => 0);
}

export function buildConsentFlowComparisonsFromEvidence(
  input: ConsentFlowComparisonEvidenceInput,
): ConsentFlowComparison[] {
  const scenarios = unique([
    ...input.networkEvents.map((event) => event.scenario),
    ...input.cookieEvents.map((event) => event.scenario),
    ...input.consentActionAttempts.map((attempt) => attempt.scenario),
    ...(input.consentFlowObservations ?? []).map((observation) => observation.scenario),
  ]).filter(isConsentFlowScenario);
  const captures: ConsentFlowComparisonCapture[] = scenarios.map((scenario) => {
    const observations = (input.consentFlowObservations ?? []).filter((observation) => observation.scenario === scenario);
    const actionAttempts = input.consentActionAttempts.filter((attempt) => attempt.scenario === scenario);
    return {
      scenario,
      consentState: consentStateForPersistedScenario(scenario, observations, actionAttempts),
      networkEvents: input.networkEvents.filter((event) => event.scenario === scenario),
      cookieEvents: input.cookieEvents.filter((event) => event.scenario === scenario),
      actionAttempts,
      normalizedVendorObservations: input.normalizedVendorObservations ?? [],
    };
  });
  return buildComparisons(captures);
}

function isConsentFlowScenario(value: string): value is ConsentFlowScenario {
  return [
    "baseline_pre_consent",
    "reject_all_flow",
    "accept_all_flow",
    "gpc_enabled",
    "privacy_opt_out_flow",
    "form_collection_probe",
    "accessibility_probe",
  ].includes(value);
}

function consentStateForPersistedScenario(
  scenario: ConsentFlowScenario,
  observations: ConsentFlowObservation[],
  actionAttempts: ConsentActionAttempt[],
): ConsentState {
  const succeeded = actionAttempts.some((attempt) => attempt.succeeded);
  if (succeeded) {
    if (scenario === "accept_all_flow") {
      return "post_accept";
    }
    if (scenario === "reject_all_flow") {
      return "post_reject";
    }
    if (scenario === "privacy_opt_out_flow") {
      return "post_reject";
    }
  }
  return observations[0]?.consentStateAtTime ?? "pre_consent";
}

function buildComparisons(captures: ConsentFlowComparisonCapture[]): ConsentFlowComparison[] {
  const baseline = captures.find((capture) => capture.scenario === "baseline_pre_consent");
  const reject = captures.find((capture) => capture.scenario === "reject_all_flow");
  const accept = captures.find((capture) => capture.scenario === "accept_all_flow");
  const gpc = captures.find((capture) => capture.scenario === "gpc_enabled");
  const privacyOptOut = captures.find((capture) => capture.scenario === "privacy_opt_out_flow");
  const comparisons: ConsentFlowComparison[] = [];
  if (baseline && reject) {
    comparisons.push(comparison("fresh_pre_consent_vs_after_reject", baseline, reject, "reject_all"));
  }
  if (baseline && accept) {
    comparisons.push(comparison("fresh_pre_consent_vs_after_accept", baseline, accept, "accept_all"));
  }
  if (reject && accept) {
    comparisons.push(comparison("after_reject_vs_after_accept", reject, accept, "accept_all"));
  }
  if (baseline && gpc) {
    comparisons.push(comparison("fresh_pre_consent_vs_gpc_enabled", baseline, gpc, "unknown"));
  }
  if (baseline && privacyOptOut) {
    comparisons.push(comparison("fresh_pre_consent_vs_privacy_opt_out", baseline, privacyOptOut, "do_not_sell_share"));
  }
  return comparisons;
}

function comparison(
  comparedScenarios: ConsentFlowComparison["comparedScenarios"],
  left: ConsentFlowComparisonCapture,
  right: ConsentFlowComparisonCapture,
  actionType: ConsentActionType,
): ConsentFlowComparison {
  const leftSignals = scenarioSignals(left);
  const rightSignals = scenarioSignals(right);
  const requiredActions = requiredActionsForComparison(comparedScenarios, left, right, actionType);
  const missingActions = requiredActions.filter((required) =>
    !required.capture.actionAttempts.some((attempt) => attempt.actionType === required.actionType && attempt.succeeded),
  );
  const gpcHeaderObserved = comparedScenarios === "fresh_pre_consent_vs_gpc_enabled"
    ? right.networkEvents.some((event) => event.requestHeaders?.secGpc === "1")
    : true;
  const postOptOutComparison = comparedScenarios === "fresh_pre_consent_vs_after_reject" ||
    comparedScenarios === "fresh_pre_consent_vs_privacy_opt_out";
  const comparisonConfidentlyExecuted = missingActions.length === 0 && gpcHeaderObserved;
  const postOptOutActionType = comparedScenarios === "fresh_pre_consent_vs_privacy_opt_out"
    ? "do_not_sell_share"
    : "reject_all";
  const postOptOutAttempt = actionAttemptForComparison(comparedScenarios, left, right, postOptOutActionType);
  const comparableReason = comparisonConfidentlyExecuted
    ? undefined
    : [
      ...missingActions.map((missing) => `${missing.actionType}_not_confidently_executed`),
      ...(gpcHeaderObserved ? [] : ["gpc_request_header_marker_not_retained"]),
    ].join(",");
  const vendorsPersistingAfterReject = postOptOutComparison && comparisonConfidentlyExecuted
    ? intersection(leftSignals.vendors, rightSignals.vendors)
    : [];
  const vendorsSuppressedAfterReject = postOptOutComparison && comparisonConfidentlyExecuted
    ? difference(leftSignals.vendors, rightSignals.vendors)
    : [];
  const vendorsAppearingOnlyAfterAccept = comparisonIncludesAccept(comparedScenarios) && comparisonConfidentlyExecuted
    ? difference(rightSignals.vendors, leftSignals.vendors)
    : [];
  const vendorsPersistingAfterGpc = comparedScenarios === "fresh_pre_consent_vs_gpc_enabled" && comparisonConfidentlyExecuted
    ? intersection(leftSignals.vendors, rightSignals.vendors)
    : [];
  const vendorsSuppressedAfterGpc = comparedScenarios === "fresh_pre_consent_vs_gpc_enabled" && comparisonConfidentlyExecuted
    ? difference(leftSignals.vendors, rightSignals.vendors)
    : [];
  return {
    comparisonId: `consent_comparison_${comparedScenarios}`,
    comparedScenarios,
    vendorsPersistingAfterReject,
    vendorsSuppressedAfterReject,
    vendorsAppearingOnlyAfterAccept,
    vendorsPersistingAfterGpc,
    vendorsSuppressedAfterGpc,
    cookiesPersistingAfterReject: postOptOutComparison && comparisonConfidentlyExecuted
      ? intersection(leftSignals.cookies, rightSignals.cookies)
      : [],
    cookiesSetAfterAccept: comparisonIncludesAccept(comparedScenarios) && comparisonConfidentlyExecuted
      ? difference(rightSignals.cookies, leftSignals.cookies)
      : [],
    cookiesPersistingAfterGpc: comparedScenarios === "fresh_pre_consent_vs_gpc_enabled" && comparisonConfidentlyExecuted
      ? intersection(leftSignals.cookies, rightSignals.cookies)
      : [],
    cookiesSuppressedAfterGpc: comparedScenarios === "fresh_pre_consent_vs_gpc_enabled" && comparisonConfidentlyExecuted
      ? difference(leftSignals.cookies, rightSignals.cookies)
      : [],
    collectionEndpointsPersistingAfterReject: postOptOutComparison && comparisonConfidentlyExecuted
      ? intersection(leftSignals.collectionEndpoints, rightSignals.collectionEndpoints)
      : [],
    collectionEndpointsSuppressedAfterReject: postOptOutComparison && comparisonConfidentlyExecuted
      ? difference(leftSignals.collectionEndpoints, rightSignals.collectionEndpoints)
      : [],
    collectionEndpointsAppearingOnlyAfterAccept: comparisonIncludesAccept(comparedScenarios) && comparisonConfidentlyExecuted
      ? difference(rightSignals.collectionEndpoints, leftSignals.collectionEndpoints)
      : [],
    collectionEndpointsPersistingAfterGpc: comparedScenarios === "fresh_pre_consent_vs_gpc_enabled" && comparisonConfidentlyExecuted
      ? intersection(leftSignals.collectionEndpoints, rightSignals.collectionEndpoints)
      : [],
    collectionEndpointsSuppressedAfterGpc: comparedScenarios === "fresh_pre_consent_vs_gpc_enabled" && comparisonConfidentlyExecuted
      ? difference(leftSignals.collectionEndpoints, rightSignals.collectionEndpoints)
      : [],
    requestCountDeltaByVendor: deltaCounts(leftSignals.vendorCounts, rightSignals.vendorCounts),
    cookieCountDeltaByVendor: deltaCounts(leftSignals.cookieCounts, rightSignals.cookieCounts),
    journeyPhaseDeltas: unique([...leftSignals.keys, ...rightSignals.keys]).map((key) => ({
      journeyKey: key,
      displayName: key,
      observedPreConsent: leftSignals.keys.includes(key),
      observedAfterReject: postOptOutComparison ? leftSignals.keys.includes(key) || rightSignals.keys.includes(key) : right.scenario === "reject_all_flow" && rightSignals.keys.includes(key),
      observedAfterAccept: right.scenario === "accept_all_flow" && rightSignals.keys.includes(key),
      persistedAfterReject: postOptOutComparison && leftSignals.keys.includes(key) && rightSignals.keys.includes(key),
      suppressedAfterReject: postOptOutComparison && leftSignals.keys.includes(key) && !rightSignals.keys.includes(key),
      appearedOnlyAfterAccept: right.scenario === "accept_all_flow" && !leftSignals.keys.includes(key) && rightSignals.keys.includes(key),
      expandedAfterAccept: right.scenario === "accept_all_flow" && (rightSignals.counts[key] ?? 0) > (leftSignals.counts[key] ?? 0),
      evidenceRefs: [],
    })),
    comparableMeasurement: {
      comparable: comparisonConfidentlyExecuted,
      reason: comparableReason,
      preActionWindow: measurementWindow(left),
      postActionWindow: measurementWindow(right),
      rejectActionEvent: postOptOutAttempt
        ? {
          attemptId: postOptOutAttempt.attemptId,
          attempted: postOptOutAttempt.attempted,
          succeeded: postOptOutAttempt.succeeded,
          failureReason: postOptOutAttempt.failureReason,
          actionTimestampMs: postOptOutAttempt.actionProof?.actionTimestampMs ?? postOptOutAttempt.timestampMs,
          postClickSettleMs: postOptOutAttempt.actionProof?.postClickSettleMs,
          proofAvailable: Boolean(postOptOutAttempt.actionProof),
        }
        : comparedScenarios.includes("reject")
        ? {
          attempted: false,
          succeeded: false,
          failureReason: "reject_action_attempt_missing",
          proofAvailable: false,
        }
        : undefined,
    },
    confidence: comparisonConfidentlyExecuted ? 0.78 : 0.35,
    coverageLimitations: missingActions.map((missing) => ({
      limitationKey: `${missing.actionType}_not_confidently_executed`,
      description: "Consent action was not confidently executed, so post-action runtime deltas are not testable.",
      affectedFindingKeys: [],
      sourceModulesRequired: ["consentFlowRuntimeScanner"],
      sourceModulesPresent: ["consentFlowRuntimeScanner"],
    })).concat(gpcHeaderObserved ? [] : [{
      limitationKey: "gpc_request_header_marker_not_retained",
      description: "GPC comparison was not testable because the GPC request header marker was not retained.",
      affectedFindingKeys: [],
      sourceModulesRequired: ["consentFlowRuntimeScanner"],
      sourceModulesPresent: ["consentFlowRuntimeScanner"],
    }]),
    evidenceRefs: [
      ...left.networkEvents.map((event) => evidenceRefForEvent(event)),
      ...right.networkEvents.map((event) => evidenceRefForEvent(event)),
      ...left.cookieEvents.map((event) => evidenceRefForEvent(event)),
      ...right.cookieEvents.map((event) => evidenceRefForEvent(event)),
    ],
  };
}

function measurementWindow(capture: ConsentFlowComparisonCapture): NonNullable<ConsentFlowComparison["comparableMeasurement"]>["preActionWindow"] {
  const events = comparisonRuntimeTimeline(capture);
  const timestamps = events.map((event) => event.timestampMs).filter((value) => Number.isFinite(value));
  const startedAtMs = timestamps.length > 0 ? Math.min(...timestamps) : 0;
  const completedAtMs = timestamps.length > 0 ? Math.max(...timestamps) : startedAtMs;
  return {
    scenario: capture.scenario,
    consentStateAtEnd: capture.actionAttempts.some((attempt) => attempt.succeeded)
      ? capture.consentState
      : "pre_consent",
    startedAtMs,
    completedAtMs,
    networkEventCount: capture.networkEvents.length,
    cookieEventCount: capture.cookieEvents.length,
  };
}

function actionAttemptForComparison(
  comparedScenarios: ConsentFlowComparison["comparedScenarios"],
  left: ConsentFlowComparisonCapture,
  right: ConsentFlowComparisonCapture,
  actionType: ConsentActionType,
): ConsentActionAttempt | undefined {
  const preferredAttempt = (capture: ConsentFlowComparisonCapture) =>
    capture.actionAttempts.find((attempt) =>
      attempt.actionType === actionType &&
      attempt.succeeded &&
      attempt.actionProof?.attemptedStatus === "attempted_succeeded"
    ) ?? capture.actionAttempts.find((attempt) => attempt.actionType === actionType);
  if (comparedScenarios === "after_reject_vs_after_accept" && actionType === "reject_all") {
    return preferredAttempt(left);
  }
  return preferredAttempt(right);
}

function comparisonIncludesAccept(comparedScenarios: ConsentFlowComparison["comparedScenarios"]): boolean {
  return comparedScenarios === "fresh_pre_consent_vs_after_accept" ||
    comparedScenarios === "after_reject_vs_after_accept";
}

function requiredActionsForComparison(
  comparedScenarios: ConsentFlowComparison["comparedScenarios"],
  left: ConsentFlowComparisonCapture,
  right: ConsentFlowComparisonCapture,
  actionType: ConsentActionType,
): Array<{ capture: ConsentFlowComparisonCapture; actionType: ConsentActionType }> {
  if (comparedScenarios === "fresh_pre_consent_vs_gpc_enabled") {
    return [];
  }
  if (comparedScenarios === "after_reject_vs_after_accept") {
    return [
      { capture: left, actionType: "reject_all" },
      { capture: right, actionType: "accept_all" },
    ];
  }
  return [{ capture: right, actionType }];
}

function scenarioSignals(capture: ConsentFlowComparisonCapture): {
  vendors: string[];
  cookies: string[];
  collectionEndpoints: string[];
  vendorCounts: Record<string, number>;
  cookieCounts: Record<string, number>;
  keys: string[];
  counts: Record<string, number>;
} {
  const vendors = (
    capture.vendorResolverInputs
      ? resolveVendorObservations(capture.vendorResolverInputs)
      : (capture.normalizedVendorObservations ?? []).filter((vendor) => vendorObservedInScenario(vendor, capture))
  )
    .filter((vendor) => ![
      "consent_management",
      "infrastructure",
      "security",
      "performance_monitoring",
      "tag_management",
    ].includes(vendor.purpose))
    .map((vendor) => vendor.product ?? vendor.vendor);
  const collectionEndpoints = capture.networkEvents
    .filter((event) =>
      event.collectionEndpointObserved &&
      event.thirdParty &&
      ![
        "security_or_performance_support",
        "google_consent_or_tag_support",
        "tag_management",
      ].includes(event.endpointCategory ?? ""),
    )
    .map((event) => event.hostname ?? event.requestHostname ?? event.requestUrl)
    .sort();
  const cookies = capture.cookieEvents
    .filter((cookie) => cookie.cookiePurpose !== "consent_management")
    .map((cookie) => cookie.cookieName);
  const keys = unique([
    ...vendors.map((vendor) => `vendor:${vendor}`),
    ...collectionEndpoints.map((endpoint) => `endpoint:${endpoint}`),
    ...cookies.map((cookie) => `cookie:${cookie}`),
  ]);
  return {
    vendors: unique(vendors),
    cookies: unique(cookies),
    collectionEndpoints: unique(collectionEndpoints),
    vendorCounts: countBy(vendors),
    cookieCounts: countBy(cookies),
    keys,
    counts: countBy(keys),
  };
}

function vendorObservedInScenario(vendor: NormalizedVendorObservation, capture: ConsentFlowComparisonCapture): boolean {
  if (vendor.matchSources.some((source) => source.scenario === capture.scenario)) {
    return true;
  }
  const eventIds = new Set([
    ...capture.networkEvents.map((event) => event.eventId),
    ...capture.cookieEvents.map((event) => event.eventId),
  ]);
  return vendor.matchedEvidenceIds.some((eventId) => eventIds.has(eventId));
}

function cookieSnapshotForScenario(
  cookies: Awaited<ReturnType<BrowserContext["cookies"]>>,
  input: ConsentFlowRuntimeScannerInput,
  scenario: ConsentFlowScenario,
  consentState: ConsentState,
): CookieSnapshot {
  return {
    artifactId: `cookie_snapshot_${scenario}`,
    capturedAtMs: elapsed(input.scanStartedAtMs),
    consentStateAtTime: consentState,
    cookies: cookies.map((cookie) => ({
      name: cookie.name,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
    })),
    cookieNames: cookies.map((cookie) => cookie.name),
    evidenceRefs: [],
  };
}

async function writeDomArtifact(
  input: ConsentFlowRuntimeScannerInput,
  page: Page,
  scenario: ConsentFlowScenario,
  stage: string,
  consentState: ConsentState,
): Promise<DomSnapshotArtifact> {
  const text = await page.locator("body").innerText({ timeout: 1_500 }).catch(() => "");
  const artifactId = `dom_text_${scenario}_${stage}`;
  const path = await input.artifactWriter.writeTextArtifact(`${artifactId}.txt`, text.slice(0, 100_000));
  return {
    artifactId,
    capturedAtMs: elapsed(input.scanStartedAtMs),
    path,
    url: page.url(),
    textExcerpt: text.slice(0, 2_000),
    pagePhase: stage === "before" ? "network_idle" : "post_interaction",
    consentStateAtTime: consentState,
  };
}

async function writeScreenshotArtifact(
  input: ConsentFlowRuntimeScannerInput,
  page: Page,
  scenario: ConsentFlowScenario,
  stage: string,
  consentState: ConsentState,
  options: { timeoutMs?: number } = {},
): Promise<ScreenshotArtifact> {
  const artifactId = `screenshot_${scenario}_${stage}`;
  const path = input.artifactWriter.artifactPath(`${artifactId}.png`);
  await page.screenshot({ path, fullPage: true, timeout: options.timeoutMs ?? 5_000 }).catch(async () => {
    await writeFile(path, ONE_PIXEL_TRANSPARENT_PNG);
  });
  return {
    artifactId,
    capturedAtMs: elapsed(input.scanStartedAtMs),
    path,
    url: page.url(),
    pagePhase: stage === "before" ? "network_idle" : "post_interaction",
    consentStateAtTime: consentState,
  };
}

function bannerLikelyPresent(candidates: ConsentActionCandidate[], text: string | undefined): boolean {
  return candidates.some((candidate) =>
    !["unknown", "manage_preferences", "reopen_preferences"].includes(candidate.actionType) &&
    candidate.confidence >= 0.7
  ) ||
    /cookie consent|we use cookies|choose your consent setting|privacy preference/i.test(text ?? "");
}

function customPrivacyFormVisible(text: string | undefined): boolean {
  const value = (text ?? "").toLowerCase();
  return /privacy settings|right to opt out|data privacy rights|california privacy rights act|cpra|advertising settings/.test(value) &&
    /do not sell(?: or share)?(?: my)? personal information|sale (?:or|and) sharing|opt[- ]out/.test(value) &&
    /save|submit|apply|confirm|select a request type|select (?:the )?(?:below|right)/.test(value);
}

async function customPrivacyFormVisibleOnPage(page: Page): Promise<boolean> {
  const text = await page.evaluate(() =>
    (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 12_000),
  ).catch(() => "");
  return customPrivacyFormVisible(text);
}

function bestCandidate(candidates: ConsentActionCandidate[], actionType: ConsentActionType): ConsentActionCandidate | undefined {
  return candidates
    .filter((candidate) => candidate.actionType === actionType && candidate.visible && candidate.enabled)
    .sort((left, right) => candidateActionScore(right, actionType) - candidateActionScore(left, actionType))[0];
}

function candidateActionScore(candidate: ConsentActionCandidate, actionType: ConsentActionType): number {
  if (actionType !== "do_not_sell_share") {
    return candidate.confidence;
  }
  const label = `${candidate.normalizedLabel} ${candidate.labelText} ${candidate.contextTextExcerpt ?? ""}`.toLowerCase();
  return candidate.confidence +
    (/review all privacy and ad settings|privacy settings|privacy preferences|cookie settings|manage preferences/.test(label) ? 0.5 : 0) +
    (/opt[- ]out (?:of )?(?:sale|sharing|targeted advertising)/.test(label) ? 0.45 : 0) +
    (/do not sell(?: or share)?|do not share/.test(label) ? 0.3 : 0) +
    (/limit use of (?:my )?sensitive|exclude my data|do not use my data/.test(label) ? 0.3 : 0) +
    (/confirm|save|submit|apply/.test(label) ? 0.18 : 0) -
    (/your privacy choices|privacy choices|privacy controls/.test(label) &&
      !/opt[- ]out|do not sell|do not share|confirm|save|submit|apply/.test(label) ? 0.25 : 0);
}

function bestPreferenceSurfaceOpener(candidates: ConsentActionCandidate[]): ConsentActionCandidate | undefined {
  const candidatesWithScores = candidates
    .filter((candidate) => candidate.visible && candidate.enabled)
    .map((candidate) => {
      const value = `${candidate.normalizedLabel} ${candidate.labelText} ${candidate.contextTextExcerpt ?? ""}`.toLowerCase();
      const isPrivacyControl = /\byour privacy choices\b|privacy choices|privacy preference|preference center|do not sell|do not share|exclude my data|do not use my data|ad choices|cookie settings|privacy settings|manage preferences|preferences/.test(value);
      const isPolicyOnly = /privacy policy|cookie policy|privacy notice|terms of service|california notice/.test(value) &&
        !/choices|settings|preferences|do not sell|do not share|ad choices/.test(value);
      const clickEligible = candidate.shouldClick && candidate.confidence >= 0.78;
      if (isPolicyOnly || (candidate.actionType !== "manage_preferences" && !isPrivacyControl)) {
        return undefined;
      }
      if (!clickEligible && !isPrivacyControl) {
        return undefined;
      }
      return {
        candidate,
        score: candidate.confidence +
          (clickEligible ? 0.4 : 0) +
          (isPrivacyControl ? 0.25 : 0) +
          (/cookie settings|privacy settings|privacy preference|preference center|manage preferences|preferences/.test(value) ? 0.15 : 0),
      };
    })
    .filter((entry): entry is { candidate: ConsentActionCandidate; score: number } => Boolean(entry));
  return candidatesWithScores.sort((left, right) => right.score - left.score)[0]?.candidate;
}

function bestCookiePreferenceReopenControl(candidates: ConsentActionCandidate[]): ConsentActionCandidate | undefined {
  const candidatesWithScores = candidates
    .filter((candidate) => candidate.visible && candidate.enabled)
    .map((candidate) => {
      const value = `${candidate.normalizedLabel} ${candidate.labelText} ${candidate.contextTextExcerpt ?? ""}`.toLowerCase();
      const positiveCookiePreference =
        /cookie settings|cookie preferences|cookie choices|consent settings|consent preferences|manage consent|manage preferences|preference center|privacy settings|privacy preferences/.test(value);
      const privacyOnly =
        /\byour privacy choices\b|do not sell|do not share|limit use of (?:my )?sensitive|exclude my data|do not use my data|ad choices|advertising choices/.test(value) &&
        !/cookie|consent|preference|settings/.test(value);
      if (!positiveCookiePreference || privacyOnly) {
        return undefined;
      }
      const confidence = candidate.actionType === "manage_preferences"
        ? Math.max(candidate.confidence, 0.82)
        : candidate.confidence;
      if (confidence < 0.78) {
        return undefined;
      }
      return {
        candidate: { ...candidate, confidence, shouldClick: true },
        score: confidence +
          (/cookie/.test(value) ? 0.25 : 0) +
          (/consent/.test(value) ? 0.15 : 0) +
          (/manage preferences|preference center/.test(value) ? 0.1 : 0),
      };
    })
    .filter((entry): entry is { candidate: ConsentActionCandidate; score: number } => Boolean(entry));
  return candidatesWithScores.sort((left, right) => right.score - left.score)[0]?.candidate;
}

function moduleRun(
  status: ScanModuleRun["status"],
  startedAt: string,
  startedAtMs: number,
  errors: string[] = [],
): ScanModuleRun {
  return {
    moduleName: "consentFlowRuntimeScanner",
    status,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAtMs,
    evidenceRefs: [],
    errors,
  };
}

function runtimeTimeline(capture: ScenarioCapture): RuntimeEvidenceEvent[] {
  return [
    ...capture.networkEvents,
    ...capture.networkResponseEvents,
    ...capture.cookieEvents,
    ...capture.consentInteractionEvents,
  ];
}

function comparisonRuntimeTimeline(capture: ConsentFlowComparisonCapture): RuntimeEvidenceEvent[] {
  return [
    ...capture.networkEvents,
    ...(capture.networkResponseEvents ?? []),
    ...capture.cookieEvents,
    ...(capture.consentInteractionEvents ?? []),
  ];
}

function resolverInputForEvent(
  event: RuntimeEvidenceEvent,
  label?: string,
): Pick<VendorResolverInput, "evidenceId" | "evidenceRef" | "sourceEventType" | "sourceScanner" | "scenario" | "consentStateAtTime"> {
  return {
    evidenceId: event.eventId,
    evidenceRef: evidenceRefForEvent(event, label),
    sourceEventType: event.eventType,
    sourceScanner: event.sourceScanner,
    scenario: event.scenario,
    consentStateAtTime: event.consentStateAtTime,
  };
}

function evidenceRefForEvent(event: RuntimeEvidenceEvent, label?: string): EvidenceRef {
  return {
    refId: `ref_${event.eventId}`,
    eventId: event.eventId,
    eventType: event.eventType,
    label,
    url: event.url,
  };
}

function artifactRefFromDom(dom: DomSnapshotArtifact): ArtifactRef {
  return {
    artifactId: dom.artifactId,
    artifactType: "dom_snapshot",
    path: dom.path,
    observedAtMs: dom.capturedAtMs,
    sourceScanner: SOURCE_SCANNER,
    sensitivity: "redacted",
    redactionStatus: "redacted",
    relatedEventIds: [],
    label: "Consent-flow DOM text snapshot",
  };
}

function artifactRefFromScreenshot(screenshot: ScreenshotArtifact): ArtifactRef {
  return {
    artifactId: screenshot.artifactId,
    artifactType: "screenshot",
    path: screenshot.path,
    observedAtMs: screenshot.capturedAtMs,
    sourceScanner: SOURCE_SCANNER,
    sensitivity: "safe",
    redactionStatus: "not_needed",
    relatedEventIds: [],
    label: "Consent-flow screenshot",
  };
}

function artifactRefFromJsonArtifact(
  artifact: { artifactId: string; path: string; observedAtMs: number } | undefined,
  label: string,
): ArtifactRef | undefined {
  if (!artifact) {
    return undefined;
  }
  return {
    artifactId: artifact.artifactId,
    artifactType: "json",
    path: artifact.path,
    observedAtMs: artifact.observedAtMs,
    sourceScanner: SOURCE_SCANNER,
    sensitivity: "redacted",
    redactionStatus: "redacted",
    relatedEventIds: [],
    label,
  };
}

function artifactRefFromOptionalScreenshot(screenshot: ScreenshotArtifact | undefined): ArtifactRef | undefined {
  return screenshot ? artifactRefFromScreenshot(screenshot) : undefined;
}

async function writeScenarioRuntimeDiagnosticsArtifact(input: {
  actionApplied: boolean;
  attempts: ConsentActionAttempt[];
  capture: {
    cookieEvents: CookieEvent[];
    networkEvents: NetworkEvent[];
    networkResponseEvents: NetworkResponseEvent[];
    phaseTimings: ScenarioPhaseTiming[];
    scenario: ConsentFlowScenario;
  };
  input: ConsentFlowRuntimeScannerInput;
  runtimeDiagnostics: ScenarioRuntimeDiagnosticState;
}): Promise<ArtifactRef> {
  const postActionNetworkEvents = input.capture.networkEvents.filter((event) => event.pagePhase === "post_interaction");
  const finalWindowRequestEvents = input.capture.networkEvents.filter((event) =>
    event.timestampMs >= input.runtimeDiagnostics.finalSettleStartedAtMs
  );
  const finalWindowSeconds = Math.max(0.001, input.runtimeDiagnostics.finalSettleMs / 1000);
  const actionAttempt = preferredScenarioQualityAttempt(input.attempts);
  const limitationKeys = scenarioRuntimeLimitationKeys({
    actionApplied: input.actionApplied,
    activeRequestCount: input.runtimeDiagnostics.activeRequestIds.size,
    networkEvents: input.capture.networkEvents.length,
    postActionNetworkEvents: postActionNetworkEvents.length,
    requestFailures: input.runtimeDiagnostics.requestFailures.length,
    scenario: input.capture.scenario,
  });
  const path = await input.input.artifactWriter.writeJsonArtifact(`consent-runtime-diagnostics-${input.capture.scenario}.json`, {
    artifactOnly: true,
    artifactVersion: "certscore.v2.consent_runtime_diagnostics.v1",
    generatedAt: new Date().toISOString(),
    productionFindingIntegration: false,
    scenario: input.capture.scenario,
    sourceScanner: SOURCE_SCANNER,
    counts: {
      activeRequestsAtClose: input.runtimeDiagnostics.activeRequestIds.size,
      blockedHeavyResources: { ...input.runtimeDiagnostics.blockedResourceCounts },
      consoleMessages: input.runtimeDiagnostics.consoleMessages.length,
      cookieEvents: input.capture.cookieEvents.length,
      finalWindowRequestRatePerSecond: Number((finalWindowRequestEvents.length / finalWindowSeconds).toFixed(3)),
      finalWindowRequests: finalWindowRequestEvents.length,
      networkEvents: input.capture.networkEvents.length,
      networkResponseEvents: input.capture.networkResponseEvents.length,
      pageErrors: input.runtimeDiagnostics.pageErrors.length,
      postActionNetworkEvents: postActionNetworkEvents.length,
      requestFailures: input.runtimeDiagnostics.requestFailures.length,
      resourceTypes: { ...input.runtimeDiagnostics.resourceTypeCounts },
    },
    consentActionOutcome: {
      actionApplied: input.actionApplied,
      actionType: actionAttempt?.actionType,
      attempted: actionAttempt?.attempted ?? false,
      failureReason: actionAttempt?.failureReason,
      succeeded: actionAttempt?.succeeded ?? false,
    },
    limitationKeys,
    samples: {
      consoleMessages: input.runtimeDiagnostics.consoleMessages,
      pageErrors: input.runtimeDiagnostics.pageErrors,
      requestFailures: input.runtimeDiagnostics.requestFailures,
    },
    timing: {
      finalSettleMs: input.runtimeDiagnostics.finalSettleMs,
      finalSettleStartedAtMs: input.runtimeDiagnostics.finalSettleStartedAtMs,
      phaseTimings: input.capture.phaseTimings,
    },
  });
  return {
    artifactId: `consent_runtime_diagnostics_${input.capture.scenario}`,
    artifactType: "json",
    path,
    createdAt: new Date().toISOString(),
    sourceScanner: SOURCE_SCANNER,
    scenario: input.capture.scenario,
    sensitivity: "internal_only",
    redactionStatus: "internal_only",
    relatedEventIds: input.capture.networkEvents.slice(0, 50).map((event) => event.eventId),
    label: "Consent-flow runtime diagnostics",
  };
}

export function scenarioRuntimeLimitationKeys(input: {
  actionApplied: boolean;
  activeRequestCount: number;
  networkEvents: number;
  postActionNetworkEvents: number;
  requestFailures: number;
  scenario: ConsentFlowScenario;
}) {
  const keys: string[] = [];
  if (input.scenario !== "baseline_pre_consent" && input.actionApplied && input.postActionNetworkEvents < 25) {
    keys.push("thin_post_consent_network_tail");
  }
  if (input.networkEvents === 0) {
    keys.push("zero_network_events");
  }
  if (input.requestFailures > 0) {
    keys.push("request_failures_observed");
  }
  if (input.activeRequestCount > 0) {
    keys.push("active_requests_at_close");
  }
  return keys;
}

async function writeScenarioEvidenceQualityArtifact(input: {
  actionApplied: boolean;
  attempts: ConsentActionAttempt[];
  cookieCountAfterAction: number | null;
  cookieCountBeforeAction: number | null;
  evidenceExcerptCount: number;
  input: ConsentFlowRuntimeScannerInput;
  runtimeDiagnostics: ScenarioRuntimeDiagnosticState;
  scenario: ConsentFlowScenario;
  storageCountAfterAction: number | null;
  storageCountBeforeAction: number | null;
  totals: {
    actionCandidateCount: number;
    cookieEventCount: number;
    finalWindowNetworkEventCount: number;
    networkEventCount: number;
    networkResponseEventCount: number;
    postActionNetworkEventCount: number;
  };
  uiObservation: ConsentUiObservation;
}): Promise<ArtifactRef> {
  const actionAttempt = preferredScenarioQualityAttempt(input.attempts);
  const quality = scenarioEvidenceQualitySummary({
    actionApplied: input.actionApplied,
    actionAttempt,
    activeRequestCount: input.runtimeDiagnostics.activeRequestIds.size,
    evidenceExcerptCount: input.evidenceExcerptCount,
    failedRequestCount: input.runtimeDiagnostics.requestFailures.length,
    finalSettleMs: input.runtimeDiagnostics.finalSettleMs,
    networkEventCount: input.totals.networkEventCount,
    networkResponseEventCount: input.totals.networkResponseEventCount,
    postActionNetworkEventCount: input.totals.postActionNetworkEventCount,
    scenario: input.scenario,
  });
  const limitationReason = refinedScenarioLimitationReason({
    actionAttempt,
    defaultReason: quality.limitationReason,
    scenario: input.scenario,
    surfaceProbe: input.runtimeDiagnostics.cmpSurfaceProbe,
  });
  const finalWindowSeconds = Math.max(0.001, input.runtimeDiagnostics.finalSettleMs / 1000);
  const finalWindowRequestCount = input.totals.finalWindowNetworkEventCount;
  const path = await input.input.artifactWriter.writeJsonArtifact(`ScenarioEvidenceQuality-${input.scenario}.json`, {
    action: {
      actionApplied: input.actionApplied,
      actionOutcome: actionAttempt?.succeeded === true
        ? "succeeded"
        : actionAttempt?.attempted === true ? "attempted_not_succeeded" : "not_attempted",
      actionType: actionAttempt?.actionType,
      attempted: actionAttempt?.attempted ?? false,
      failureReason: actionAttempt?.failureReason,
      plannerHintsStatus: plannerHintsStatus(input.input, input.scenario),
      succeeded: actionAttempt?.succeeded ?? false,
    },
    artifactOnly: true,
    artifactVersion: "certscore.v2.scenario_evidence_quality.v1",
    counts: {
      actionCandidatesFound: input.totals.actionCandidateCount,
      activeRequestsAtClose: input.runtimeDiagnostics.activeRequestIds.size,
      blockedOrFulfilledHeavyResources: { ...input.runtimeDiagnostics.blockedResourceCounts },
      consoleMessages: input.runtimeDiagnostics.consoleMessages.length,
      cookieEvents: input.totals.cookieEventCount,
      cookiesAfterAction: input.cookieCountAfterAction,
      cookiesBeforeAction: input.cookieCountBeforeAction,
      evidenceExcerpts: input.evidenceExcerptCount,
      failedRequests: input.runtimeDiagnostics.requestFailures.length,
      finalWindowRequestRatePerSecond: Number((finalWindowRequestCount / finalWindowSeconds).toFixed(3)),
      finalWindowRequests: finalWindowRequestCount,
      pageErrors: input.runtimeDiagnostics.pageErrors.length,
      postActionRequests: input.totals.postActionNetworkEventCount,
      requests: input.totals.networkEventCount,
      resourceTypes: { ...input.runtimeDiagnostics.resourceTypeCounts },
      responses: input.totals.networkResponseEventCount,
      storageAfterAction: input.storageCountAfterAction,
      storageBeforeAction: input.storageCountBeforeAction,
    },
    generatedAt: new Date().toISOString(),
    limitationReason,
    passStatus: quality.passStatus,
    productionFindingIntegration: false,
    scenario: input.scenario,
    sourceScanner: SOURCE_SCANNER,
    timing: {
      finalSettleMs: input.runtimeDiagnostics.finalSettleMs,
      finalSettleStartedAtMs: input.runtimeDiagnostics.finalSettleStartedAtMs,
    },
    plannerRecipe: input.runtimeDiagnostics.recipeDiagnostics,
    plannerProbe: input.runtimeDiagnostics.cmpSurfaceProbe,
    ui: {
      cmpOrBannerObserved: input.uiObservation.likelyPresent,
      evidenceBasis: input.uiObservation.basis,
    },
  });
  return {
    artifactId: `scenario_evidence_quality_${input.scenario}`,
    artifactType: "json",
    path,
    createdAt: new Date().toISOString(),
    sourceScanner: SOURCE_SCANNER,
    scenario: input.scenario,
    sensitivity: "internal_only",
    redactionStatus: "internal_only",
    relatedEventIds: [],
    label: "Scenario evidence quality",
  };
}

async function writeFallbackScenarioEvidenceQualityArtifacts(input: {
  artifactWriter: ArtifactWriter;
  capturedScenarios: Set<ConsentFlowScenario>;
  executionEntries: ConsentScenarioExecutionEntry[];
}): Promise<ArtifactRef[]> {
  const refs: ArtifactRef[] = [];
  for (const entry of input.executionEntries) {
    if (entry.status !== "failed" || !isActionScenario(entry.scenario) || input.capturedScenarios.has(entry.scenario)) {
      continue;
    }
    const limitationReason = entry.failureReason ?? fallbackScenarioQualityLimitationReason({
      error: entry.error,
      reasonCodes: entry.reasonCodes,
      scenario: entry.scenario,
    });
    const path = await input.artifactWriter.writeJsonArtifact(`ScenarioEvidenceQuality-${entry.scenario}.json`, {
      action: {
        actionApplied: false,
        actionOutcome: "not_attempted",
        actionType: entry.actionType,
        attempted: false,
        failureReason: limitationReason,
        plannerHintsStatus: "unknown",
        succeeded: false,
      },
      artifactOnly: true,
      artifactVersion: "certscore.v2.scenario_evidence_quality.v1",
      counts: {
        actionCandidatesFound: 0,
        activeRequestsAtClose: 0,
        blockedOrFulfilledHeavyResources: {},
        consoleMessages: 0,
        cookieEvents: 0,
        cookiesAfterAction: null,
        cookiesBeforeAction: null,
        evidenceExcerpts: 0,
        failedRequests: 0,
        finalWindowRequestRatePerSecond: 0,
        finalWindowRequests: 0,
        pageErrors: 0,
        postActionRequests: 0,
        requests: 0,
        resourceTypes: {},
        responses: 0,
        storageAfterAction: null,
        storageBeforeAction: null,
      },
      generatedAt: new Date().toISOString(),
      limitationReason,
      passStatus: "limited",
      productionFindingIntegration: false,
      scenario: entry.scenario,
      sourceScanner: SOURCE_SCANNER,
      timing: {
        finalSettleMs: 0,
        finalSettleStartedAtMs: null,
      },
      plannerRecipe: {
        candidatesMatched: 0,
        candidatesProvided: 0,
        status: "unknown",
      },
      plannerProbe: null,
      ui: {
        cmpOrBannerObserved: false,
        evidenceBasis: ["scenario_failed_before_quality_artifact"],
      },
      executionFailure: {
        actionProofStatus: entry.actionProofStatus,
        deadlineHit: entry.deadlineHit,
        error: entry.error,
        reasonCodes: entry.reasonCodes,
        status: entry.status,
      },
    });
    refs.push({
      artifactId: `scenario_evidence_quality_${entry.scenario}`,
      artifactType: "json",
      path,
      createdAt: new Date().toISOString(),
      sourceScanner: SOURCE_SCANNER,
      scenario: entry.scenario,
      sensitivity: "internal_only",
      redactionStatus: "internal_only",
      relatedEventIds: [],
      label: "Scenario evidence quality",
    });
  }
  return refs;
}

function fallbackScenarioQualityLimitationReason(input: {
  error?: string;
  reasonCodes?: string[];
  scenario?: ConsentFlowScenario;
}) {
  const textControlReason = textControlActivationFailureLimitationReason(input.error);
  if (textControlReason) {
    return textControlReason;
  }
  if (input.error && /target page, context or browser has been closed|browser has been closed|context has been closed/i.test(input.error)) {
    if (
      input.scenario === "privacy_opt_out_flow" &&
      input.reasonCodes?.includes("privacy_control_url_observed")
    ) {
      return "privacy_control_target_closed_before_quality_artifact";
    }
    return "browser_or_context_closed_before_quality_artifact";
  }
  if (input.error && /deadline|timeout/i.test(input.error)) {
    return "scenario_deadline_before_quality_artifact";
  }
  return "scenario_failed_before_quality_artifact";
}

export function textControlActivationFailureLimitationReason(error?: string) {
  if (!error) {
    return undefined;
  }
  if (/text_control_observed_without_clickable_target/.test(error)) {
    return "privacy_control_observed_without_clickable_target";
  }
  if (/planner_text_control_not_reacquired/.test(error)) {
    return "planner_text_control_not_reacquired";
  }
  return undefined;
}

function preferredScenarioQualityAttempt(attempts: ConsentActionAttempt[]): ConsentActionAttempt | undefined {
  return attempts.find((attempt) => attempt.failureReason === "manual_review_required_custom_privacy_form") ??
    attempts.find((attempt) => attempt.attempted) ??
    attempts[0];
}

export function directActionFailureReason(input: {
  afterDomExcerpt?: string;
  bannerPresentAfter: boolean;
  beforeDomExcerpt?: string;
  candidateContextTextExcerpt?: string;
  candidateLabelText?: string;
  postActionConsentStateMarkers?: string[];
  preActionConsentStateMarkers?: string[];
  scenario: ConsentFlowScenario;
}) {
  if (!input.bannerPresentAfter) {
    return undefined;
  }
  if (input.scenario === "privacy_opt_out_flow" && customPrivacyFormVisible(input.afterDomExcerpt)) {
    return "manual_review_required_custom_privacy_form";
  }
  if (input.scenario === "privacy_opt_out_flow" && privacyCenterSurfaceStayedStatic(input)) {
    return "privacy_center_surface_observed_without_verifiable_opt_out_control";
  }
  if (input.scenario === "privacy_opt_out_flow" && privacyControlClickWithoutVerifiableStateChange(input)) {
    return "privacy_control_click_without_verifiable_state_change";
  }
  return "banner_still_present_after_click";
}

function privacyControlClickWithoutVerifiableStateChange(input: {
  candidateContextTextExcerpt?: string;
  candidateLabelText?: string;
  postActionConsentStateMarkers?: string[];
  preActionConsentStateMarkers?: string[];
}) {
  const candidateText = normalizeDiagnosticText([
    input.candidateLabelText,
    input.candidateContextTextExcerpt,
  ].filter(Boolean).join(" "));
  const privacyTargetCandidate = /\b(do not sell|do not share|personal information|privacy choices|privacy rights|privacy settings|opt[- ]out)\b/.test(candidateText);
  return privacyTargetCandidate &&
    stringArraysEquivalent(input.preActionConsentStateMarkers, input.postActionConsentStateMarkers);
}

function privacyCenterSurfaceStayedStatic(input: {
  afterDomExcerpt?: string;
  beforeDomExcerpt?: string;
  candidateContextTextExcerpt?: string;
  candidateLabelText?: string;
  postActionConsentStateMarkers?: string[];
  preActionConsentStateMarkers?: string[];
}) {
  const beforeDom = normalizeDiagnosticText(input.beforeDomExcerpt);
  const afterDom = normalizeDiagnosticText(input.afterDomExcerpt);
  const candidateText = normalizeDiagnosticText([
    input.candidateLabelText,
    input.candidateContextTextExcerpt,
  ].filter(Boolean).join(" "));
  if (!beforeDom || !afterDom || beforeDom !== afterDom) {
    return false;
  }
  const surfaceText = `${beforeDom} ${candidateText}`;
  const privacySurfaceObserved = /\b(privacy center|privacy choices|privacy settings|privacy preferences|privacy options)\b/.test(surfaceText);
  const openerLikeCandidate = /\b(your privacy choices|privacy choices|privacy center|manage privacy|privacy settings|privacy preferences|privacy options)\b/.test(candidateText);
  return privacySurfaceObserved &&
    openerLikeCandidate &&
    stringArraysEquivalent(input.preActionConsentStateMarkers, input.postActionConsentStateMarkers);
}

function normalizeDiagnosticText(value?: string) {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stringArraysEquivalent(left?: string[], right?: string[]) {
  const normalizedLeft = [...new Set((left ?? []).filter(Boolean))].sort();
  const normalizedRight = [...new Set((right ?? []).filter(Boolean))].sort();
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

export function scenarioEvidenceQualitySummary(input: {
  actionApplied: boolean;
  actionAttempt?: ConsentActionAttempt;
  activeRequestCount: number;
  evidenceExcerptCount: number;
  failedRequestCount: number;
  finalSettleMs: number;
  networkEventCount: number;
  networkResponseEventCount: number;
  postActionNetworkEventCount: number;
  scenario: ConsentFlowScenario;
}): { limitationReason?: string; passStatus: "passing" | "limited" } {
  const actionScenario = input.scenario === "accept_all_flow" ||
    input.scenario === "reject_all_flow" ||
    input.scenario === "privacy_opt_out_flow";
  if (actionScenario && !input.actionAttempt) {
    return { limitationReason: "action_not_found", passStatus: "limited" };
  }
  if (actionScenario && input.actionAttempt?.attempted !== true) {
    return { limitationReason: input.actionAttempt?.failureReason ?? "action_not_found", passStatus: "limited" };
  }
  if (actionScenario && input.actionAttempt?.succeeded !== true) {
    return { limitationReason: input.actionAttempt?.failureReason ?? "action_not_completed", passStatus: "limited" };
  }
  if (actionScenario && input.actionApplied && input.finalSettleMs < 1_500) {
    return { limitationReason: "post_action_tail_too_short", passStatus: "limited" };
  }
  const quietActionTailRetained =
    (input.scenario === "accept_all_flow" || input.scenario === "reject_all_flow") &&
    input.actionApplied &&
    input.postActionNetworkEventCount === 0 &&
    input.evidenceExcerptCount > 0 &&
    input.networkEventCount >= 10 &&
    input.networkResponseEventCount > 0 &&
    input.activeRequestCount <= 1;
  if (actionScenario && input.actionApplied && input.postActionNetworkEventCount === 0 && !quietActionTailRetained) {
    return { limitationReason: "post_action_evidence_tail_missing", passStatus: "limited" };
  }
  if (actionScenario && input.actionApplied && input.networkEventCount < 10) {
    return { limitationReason: "near_zero_runtime_evidence", passStatus: "limited" };
  }
  if (input.networkResponseEventCount === 0 && input.networkEventCount > 0) {
    return { limitationReason: "request_response_evidence_below_threshold", passStatus: "limited" };
  }
  if (input.evidenceExcerptCount === 0) {
    return { limitationReason: "evidence_excerpts_below_threshold", passStatus: "limited" };
  }
  if (input.activeRequestCount >= 10) {
    return { limitationReason: "browser_closed_while_network_materially_active", passStatus: "limited" };
  }
  if (input.failedRequestCount >= Math.max(10, Math.ceil(input.networkEventCount * 0.3))) {
    return { limitationReason: "request_failures_material", passStatus: "limited" };
  }
  return { passStatus: "passing" };
}

function refinedScenarioLimitationReason(input: {
  actionAttempt?: ConsentActionAttempt;
  defaultReason?: string;
  scenario: ConsentFlowScenario;
  surfaceProbe?: CmpSurfaceProbeDiagnostic;
}): string | undefined {
  const actionScenario = input.scenario === "accept_all_flow" ||
    input.scenario === "reject_all_flow" ||
    input.scenario === "privacy_opt_out_flow";
  if (!actionScenario) {
    return input.defaultReason;
  }
  const failureReason = input.actionAttempt?.failureReason ?? input.defaultReason;
  if (failureReason === "candidate_not_observed" &&
    input.surfaceProbe?.preferenceSurfaceObserved &&
    input.surfaceProbe.oneTrustDomState?.pcSdkPresent) {
    if (input.scenario === "accept_all_flow") {
      return "preference_surface_observed_without_accept_action";
    }
    if (input.scenario === "reject_all_flow") {
      return "preference_surface_observed_without_reject_action";
    }
    return "preference_surface_observed_without_target_action";
  }
  if (failureReason === "candidate_not_observed" &&
    input.surfaceProbe?.oneTrustDomState?.consentSdkPresent) {
    return "cmp_dom_observed_without_actionable_control";
  }
  return failureReason ?? input.defaultReason;
}

function isActionScenario(scenario: ConsentFlowScenario) {
  return scenario === "accept_all_flow" ||
    scenario === "reject_all_flow" ||
    scenario === "privacy_opt_out_flow";
}

export function countScenarioEvidenceExcerpts(input: {
  attempts: ConsentActionAttempt[];
  beforeDomExcerpt?: string;
}) {
  return [
    input.beforeDomExcerpt,
    ...input.attempts.flatMap((attempt) => [
      attempt.actionProof?.beforeDomExcerpt,
      attempt.actionProof?.afterDomExcerpt,
      attempt.actionProof?.candidateLabelText,
      attempt.actionProof?.candidateSelectorSummary,
      attempt.actionProof?.candidateNormalizedActionType,
      ...(attempt.actionProof?.preActionConsentStateMarkers ?? []),
      ...(attempt.actionProof?.postActionConsentStateMarkers ?? []),
      ...attempt.evidenceRefs.map((ref) => ref.excerpt),
    ]),
  ].filter((value) => typeof value === "string" && value.trim().length > 0).length;
}

function plannerHintsStatus(
  input: ConsentFlowRuntimeScannerInput,
  scenario: ConsentFlowScenario,
): "not_applicable" | "missing" | "present" {
  if (scenario === "baseline_pre_consent") {
    return "not_applicable";
  }
  return input.preConsentBaseline ? "present" : "missing";
}

async function browserStorageCount(page: Page): Promise<number | null> {
  return page.evaluate(() => window.localStorage.length + window.sessionStorage.length).catch(() => null);
}

function incrementCount(counts: Record<string, number>, key: string | undefined) {
  const normalized = key && key.length > 0 ? key : "unknown";
  counts[normalized] = (counts[normalized] ?? 0) + 1;
}

function pushBounded<T>(values: T[], value: T, limit: number) {
  if (values.length < limit) {
    values.push(value);
  }
}

function sanitizeDiagnosticUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = parsed.search ? "?<redacted>" : "";
    return parsed.toString().slice(0, 500);
  } catch {
    return url.slice(0, 500);
  }
}

function screenshotFromRef(ref: ArtifactRef, url: string, consentState: ConsentState): ScreenshotArtifact {
  return {
    artifactId: ref.artifactId,
    capturedAtMs: ref.observedAtMs ?? 0,
    path: ref.path ?? "",
    url,
    pagePhase: "post_interaction",
    consentStateAtTime: consentState,
  };
}

function domFromRef(ref: ArtifactRef, url: string, consentState: ConsentState): DomSnapshotArtifact {
  return {
    artifactId: ref.artifactId,
    capturedAtMs: ref.observedAtMs ?? 0,
    path: ref.path ?? "",
    url,
    pagePhase: "post_interaction",
    consentStateAtTime: consentState,
  };
}

function isCollectionEndpoint(url: string): boolean {
  return /\/(?:collect|track|pixel|pagead|events?|rec|sync|idsync)\b|\/g\/collect\b|\/pagead\//i.test(url);
}

function classifyConsentFlowEndpointAttribution(input: {
  url: string;
  hostname: string | undefined;
  party: "first_party" | "third_party" | "unknown";
  collectionEndpoint: boolean;
  queryParamNames: string[];
}): {
  status: NonNullable<NetworkEvent["attributionStatus"]>;
  reason: string;
  basis: string[];
  category?: string;
  subtype?: NetworkEvent["endpointSubtype"];
} {
  const hostname = input.hostname ?? "";
  const path = pathFromUrl(input.url) ?? "";
  const params = new Set(input.queryParamNames.map((name) => name.toLowerCase()));
  const basis = [
    hostname ? `hostname:${hostname}` : undefined,
    path ? `path:${path}` : undefined,
    input.collectionEndpoint ? "endpoint_category:collection" : undefined,
    ...input.queryParamNames.map((name) => `query_param:${name}`),
  ].filter((value): value is string => Boolean(value));

  if (/google-analytics\.com$/i.test(hostname) && /^\/(?:g\/collect|collect|j\/collect)\b/i.test(path)) {
    return {
      status: "resolved",
      reason: "resolved_to_google_analytics_collection",
      basis: [...basis, "google_endpoint_subtype:google_analytics_collection"],
      category: "analytics_collection",
      subtype: "google_analytics_collection",
    };
  }
  if (
    (/\.doubleclick\.net$/i.test(hostname) || /googleadservices\.com$/i.test(hostname) || hostname === "pagead2.googlesyndication.com") &&
    input.collectionEndpoint
  ) {
    return {
      status: "resolved",
      reason: "resolved_to_google_ads_doubleclick_endpoint",
      basis: [...basis, "google_endpoint_subtype:google_ads_or_measurement"],
      category: "advertising_collection",
      subtype: "google_ads_or_measurement",
    };
  }
  if (/\.clarity\.ms$/i.test(hostname) && /^\/(?:collect|tag)\b/i.test(path)) {
    return {
      status: "resolved",
      reason: "resolved_to_microsoft_clarity_collection_endpoint",
      basis: [...basis, "known_vendor_endpoint:microsoft_clarity"],
      category: "session_replay_collection",
    };
  }
  if (/\.demdex\.net$/i.test(hostname) && /^\/(?:id(?:\/rd)?|event|ibs:|demconf\.jpg)\b/i.test(path)) {
    return {
      status: "resolved",
      reason: "resolved_to_adobe_audience_manager_endpoint",
      basis: [...basis, "known_vendor_endpoint:adobe_demdex_audience_manager"],
      category: "analytics_collection",
    };
  }
  const knownEndpoint = classifyKnownConsentFlowEndpoint(hostname);
  if (knownEndpoint) {
    return {
      status: "resolved",
      reason: knownEndpoint.reason,
      basis: [...basis, knownEndpoint.basis],
      category: knownEndpoint.category,
    };
  }
  if ((hostname === "google.com" || hostname.endsWith(".google.com")) && (
    path.startsWith("/ccm/collect") || params.has("gcd") || params.has("gtm") || params.has("tag_exp")
  )) {
    return {
      status: "site_owned_infrastructure",
      reason: "google_consent_or_tag_support",
      basis: [...basis, "google_endpoint_subtype:google_consent_or_tag_support"],
      category: "google_consent_or_tag_support",
      subtype: "google_consent_or_tag_support",
    };
  }
  if (input.party === "first_party") {
    return {
      status: input.collectionEndpoint ? "site_owned_infrastructure" : "ignored_noise",
      reason: input.collectionEndpoint
        ? "first_party_collection_like_endpoint"
        : "first_party_request_without_collection_or_vendor_signal",
      basis,
      category: input.collectionEndpoint ? "first_party_collection" : undefined,
    };
  }
  return {
    status: input.collectionEndpoint ? "unresolved_meaningful" : "ignored_noise",
    reason: input.collectionEndpoint ? "collection_like_endpoint_in_consent_flow" : "non_collection_request_in_consent_flow",
    basis,
    category: input.collectionEndpoint ? "collection" : undefined,
  };
}

function classifyKnownConsentFlowEndpoint(hostname: string): { reason: string; basis: string; category: string } | undefined {
  const mappings: Array<[RegExp, string, string, string]> = [
    [/^ct\.pinterest\.com$/i, "resolved_to_pinterest_tag_endpoint", "known_vendor_endpoint:pinterest_tag", "advertising_collection"],
    [/^analytics\.tiktok\.com$/i, "resolved_to_tiktok_pixel_endpoint", "known_vendor_endpoint:tiktok_pixel", "advertising_collection"],
    [/\.amazon-adsystem\.com$/i, "resolved_to_amazon_ads_endpoint", "known_vendor_endpoint:amazon_ads", "advertising_collection"],
    [/^ara\.paa-reporting-advertising\.amazon$/i, "resolved_to_amazon_ads_reporting_endpoint", "known_vendor_endpoint:amazon_ads_reporting", "advertising_collection"],
    [/^prod\.tahoe-analytics\.publishers\.advertising\.a2z\.com$/i, "resolved_to_amazon_ads_reporting_endpoint", "known_vendor_endpoint:amazon_ads_reporting", "advertising_collection"],
    [/\.doubleverify\.com$/i, "resolved_to_doubleverify_endpoint", "known_vendor_endpoint:doubleverify", "advertising_collection"],
    [/\.adsrvr\.org$/i, "resolved_to_trade_desk_endpoint", "known_vendor_endpoint:the_trade_desk", "advertising_collection"],
    [/\.criteo\.(?:com|net)$/i, "resolved_to_criteo_endpoint", "known_vendor_endpoint:criteo", "advertising_collection"],
    [/\.crwdcntrl\.net$/i, "resolved_to_lotame_endpoint", "known_vendor_endpoint:lotame", "advertising_collection"],
    [/\.rlcdn\.com$/i, "resolved_to_liveramp_endpoint", "known_vendor_endpoint:liveramp", "advertising_collection"],
    [/\.openx\.net$/i, "resolved_to_openx_endpoint", "known_vendor_endpoint:openx", "advertising_collection"],
    [/\.rubiconproject\.com$/i, "resolved_to_magnite_rubicon_endpoint", "known_vendor_endpoint:magnite_rubicon", "advertising_collection"],
    [/\.casalemedia\.com$/i, "resolved_to_index_exchange_endpoint", "known_vendor_endpoint:index_exchange", "advertising_collection"],
    [/\.pubmatic\.com$/i, "resolved_to_pubmatic_endpoint", "known_vendor_endpoint:pubmatic", "advertising_collection"],
    [/\.taboola\.com$/i, "resolved_to_taboola_endpoint", "known_vendor_endpoint:taboola", "advertising_collection"],
    [/\.quantserve\.com$/i, "resolved_to_quantcast_endpoint", "known_vendor_endpoint:quantcast", "advertising_collection"],
    [/\.adsafeprotected\.com$/i, "resolved_to_integral_ad_science_endpoint", "known_vendor_endpoint:integral_ad_science", "advertising_collection"],
    [/^px\.ads\.linkedin\.com$/i, "resolved_to_linkedin_insight_endpoint", "known_vendor_endpoint:linkedin_insight", "advertising_collection"],
    [/^ep\d+\.adtrafficquality\.google$/i, "resolved_to_google_ad_traffic_quality_endpoint", "known_vendor_endpoint:google_ad_traffic_quality", "security_or_performance_support"],
    [/\.attentivemobile\.com$/i, "resolved_to_attentive_event_endpoint", "known_vendor_endpoint:attentive", "analytics_collection"],
    [/\.agkn\.com$/i, "resolved_to_neustar_agkn_endpoint", "known_vendor_endpoint:neustar_agkn", "advertising_collection"],
    [/\.revjet\.com$/i, "resolved_to_revjet_endpoint", "known_vendor_endpoint:revjet", "advertising_collection"],
    [/^(?:pixel\.byspotify\.com|pixels\.spotify\.com)$/i, "resolved_to_spotify_pixel_endpoint", "known_vendor_endpoint:spotify_pixel", "advertising_collection"],
    [/\.digital-cloud\.medallia\.com$/i, "resolved_to_medallia_digital_endpoint", "known_vendor_endpoint:medallia_digital", "analytics_collection"],
    [/\.brightline\.tv$/i, "resolved_to_brightline_video_ad_endpoint", "known_vendor_endpoint:brightline_video_ad_measurement", "advertising_collection"],
    [/\.fullstory\.com$/i, "resolved_to_fullstory_endpoint", "known_vendor_endpoint:fullstory", "session_replay_collection"],
    [/^pixel-config\.reddit\.com$/i, "resolved_to_reddit_pixel_endpoint", "known_vendor_endpoint:reddit_pixel", "advertising_collection"],
    [/\.tapad\.com$/i, "resolved_to_tapad_endpoint", "known_vendor_endpoint:tapad", "advertising_collection"],
    [/\.singular\.net$/i, "resolved_to_singular_attribution_endpoint", "known_vendor_endpoint:singular_attribution", "advertising_collection"],
    [/\.px-cloud\.net$/i, "resolved_to_human_perimeterx_security_endpoint", "known_vendor_endpoint:human_perimeterx_security", "security_or_performance_support"],
    [/\.go-mpulse\.net$/i, "resolved_to_akamai_mpulse_endpoint", "known_vendor_endpoint:akamai_mpulse", "security_or_performance_support"],
    [/\.nr-data\.net$/i, "resolved_to_new_relic_monitoring_endpoint", "known_vendor_endpoint:new_relic", "security_or_performance_support"],
    [/\.newrelic\.com$/i, "resolved_to_new_relic_monitoring_endpoint", "known_vendor_endpoint:new_relic", "security_or_performance_support"],
    [/\.forter\.com$/i, "resolved_to_forter_security_endpoint", "known_vendor_endpoint:forter_security", "security_or_performance_support"],
    [/^(?:prod\d+-)?live-chat\.sprinklr\.com$/i, "resolved_to_sprinklr_live_chat_endpoint", "known_vendor_endpoint:sprinklr_live_chat", "customer_support"],
  ];
  const match = mappings.find(([pattern]) => pattern.test(hostname));
  return match ? { reason: match[1], basis: match[2], category: match[3] } : undefined;
}

function knownCookiePurpose(name: string): CookieEvent["cookiePurpose"] {
  if (/Optanon|CookieConsent|cookiebot|didomi|trustarc/i.test(name)) {
    return "consent_management";
  }
  if (/^_ga|^_gid|^_clck|^_clsk/i.test(name)) {
    return "analytics";
  }
  if (/IDE|_fbp|fr|cto|TDID/i.test(name)) {
    return "advertising";
  }
  return "unknown";
}

function normalizeUrlSafely(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function pathFromUrl(url: string): string | undefined {
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
}

function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function elapsed(scanStartedAtMs: number): number {
  return Math.max(0, Date.now() - scanStartedAtMs);
}

function effectiveScenarioDeadlineAtMs(
  ...values: Array<number | undefined>
): number | undefined {
  const deadlines = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (deadlines.length === 0) {
    return undefined;
  }
  return Math.min(...deadlines);
}

function plannedScenarioExecutionDeadlineAtMs(
  item: ConsentScenarioPlanItem,
  globalDeadlineAtMs: number,
): number {
  return Math.min(globalDeadlineAtMs, Date.now() + plannedScenarioExecutionBudgetMs(item));
}

function plannedScenarioExecutionBudgetMs(item: ConsentScenarioPlanItem): number {
  if (item.scenario === "gpc_enabled") {
    return 8_000;
  }
  if (item.scenario === "privacy_opt_out_flow") {
    return item.targetUrl ? 36_000 : 18_000;
  }
  if (item.scenario === "reject_all_flow") {
    return 36_000;
  }
  if (item.scenario === "accept_all_flow") {
    return 24_000;
  }
  if (item.scenario === "form_collection_probe" || item.scenario === "accessibility_probe") {
    return 10_000;
  }
  return 8_000;
}

function contextCloseTimeoutMs(input: ConsentFlowRuntimeScannerInput): number {
  return input.captureReplay ? 4_000 : 1_500;
}

async function closeBrowserWithTimeout(browser: Browser): Promise<void> {
  await promiseWithTimeout(browser.close().catch(() => undefined), 4_000, undefined);
}

async function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function shouldCaptureInlineScreenshots(
  input: ConsentFlowRuntimeScannerInput,
  scenario: ConsentFlowScenario,
): boolean {
  if (input.screenshotMode === "none") {
    return false;
  }
  return !(input.scenarioPlanningMode === "planned_parallel" &&
    (scenario === "reject_all_flow" || scenario === "gpc_enabled"));
}

function defaultScenarioConcurrency(input: ConsentFlowRuntimeScannerInput): number {
  return input.scenarioConcurrency ?? (input.captureReplay ? 3 : 2);
}

function enabledReplayAuxiliaryProbes(input: ConsentFlowRuntimeScannerInput): {
  accessibility: boolean;
  form: boolean;
} {
  if (!input.captureReplay) {
    return { accessibility: false, form: false };
  }
  const mode = input.captureReplayAuxiliaryProbes ?? "all";
  return {
    accessibility: mode === "all" || mode === "accessibility",
    form: mode === "all" || mode === "form",
  };
}

function finalScenarioSettleMs(
  input: ConsentFlowRuntimeScannerInput,
  scenario: ConsentFlowScenario,
): number {
  if (input.scenarioPlanningMode !== "planned_parallel" || scenario === "baseline_pre_consent") {
    return 800;
  }
  return boundedPlannedActionFinalSettleMs(input.plannedActionFinalSettleMs);
}

function boundedPlannedActionFinalSettleMs(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 350;
  }
  return Math.min(2_000, Math.max(350, Math.trunc(value)));
}

function scenarioReadinessTimeoutMs(scenario: ConsentFlowScenario): number {
  switch (scenario) {
    case "gpc_enabled":
    case "form_collection_probe":
    case "accessibility_probe":
      return 650;
    default:
      return 900;
  }
}

function shouldUseGuardedResources(
  input: ConsentFlowRuntimeScannerInput,
  scenario: ConsentFlowScenario,
): boolean {
  return (input.scenarioResourceMode === "lean" || input.scenarioResourceMode === "cmp_safe") &&
    scenario !== "baseline_pre_consent";
}

function guardedLeanResourceOptions(
  input: ConsentFlowRuntimeScannerInput,
  baselineCapture: ScenarioCapture | undefined,
): HeavyResourcePreserveOptions {
  const protectedHostnames = new Set<string>();
  const protectedUrlPrefixes = new Set<string>();
  const protectedUrlSubstrings = new Set<string>();
  const baselineRequests = new Map(
    (baselineCapture?.networkEvents ?? [])
      .filter((event) => event.requestId)
      .map((event) => [event.requestId, event]),
  );

  for (const response of baselineCapture?.networkResponseEvents ?? []) {
    const request = response.requestId ? baselineRequests.get(response.requestId) : undefined;
    if (request?.resourceType && !["image", "media", "font"].includes(request.resourceType)) {
      continue;
    }
    const cookieNames = unique([
      ...response.cookieNamesSet,
      ...response.setCookieMetadata.map((metadata) => metadata.name),
    ]);
    if (cookieNames.length === 0 || !response.hostname) {
      continue;
    }
    const responseText = `${response.responseUrl} ${response.hostname}`;
    if (
      cookieNames.some(isStrongConsentCookieName) ||
      isConsentResourceText(responseText)
    ) {
      protectedHostnames.add(response.hostname);
    }
  }

  for (const candidate of baselineCapture?.actionCandidates ?? []) {
    const frameUrl = candidate.frameContext?.frameUrl;
    if (frameUrl && candidate.frameContext?.frameKind === "sub_frame") {
      addProtectedUrlParts(frameUrl, protectedHostnames, protectedUrlPrefixes);
    }
  }

  for (const privacyControlUrl of input.privacyControlUrls ?? []) {
    addProtectedUrlParts(privacyControlUrl, protectedHostnames, protectedUrlPrefixes);
  }

  protectedUrlSubstrings.add("consent");
  protectedUrlSubstrings.add("privacy");
  protectedUrlSubstrings.add("cmp");
  protectedUrlSubstrings.add("us_privacy");
  protectedUrlSubstrings.add("do-not-sell");
  protectedUrlSubstrings.add("optout");
  protectedUrlSubstrings.add("opt-out");
  if (input.scenarioResourceMode === "cmp_safe") {
    protectedUrlSubstrings.add("onetrust");
    protectedUrlSubstrings.add("trustarc");
    protectedUrlSubstrings.add("sourcepoint");
    protectedUrlSubstrings.add("didomi");
    protectedUrlSubstrings.add("cookiebot");
    protectedUrlSubstrings.add("privacy-manager");
    protectedUrlSubstrings.add("privacy_manager");
    protectedUrlSubstrings.add("preference");
    protectedUrlSubstrings.add("preferences");
    protectedUrlSubstrings.add("choice");
    protectedUrlSubstrings.add("choices");
  }

  return {
    protectedHostnames,
    protectedUrlPrefixes,
    protectedUrlSubstrings,
  };
}

function preActionObservationMs(input: ConsentFlowRuntimeScannerInput): number {
  return boundedTimingOverride(input.preActionObservationMs, 0, 12_000, 0);
}

function actionSearchMinimumRemainingMs(input: ConsentFlowRuntimeScannerInput): number {
  const override = boundedTimingOverride(input.actionSearchDeadlineMs, 1_000, 20_000, 1_800);
  return Math.min(1_800, override);
}

function boundedTimingOverride(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.trunc(value)))
    : fallback;
}

function scenarioRecipeDiagnostic(input: {
  candidates: ConsentActionCandidate[];
  input: ConsentFlowRuntimeScannerInput;
  scenario: ConsentFlowScenario;
}): ScenarioRecipeDiagnostic {
  return scenarioRecipeDiagnosticSummary({
    candidates: input.candidates,
    recipe: input.input.consentActionRecipe?.scenarios.find((scenario) => scenario.scenario === input.scenario),
    scenario: input.scenario,
  });
}

export function scenarioRecipeDiagnosticSummary(input: {
  candidates: Array<Pick<ConsentActionCandidate, "actionType" | "enabled" | "labelText" | "visible">>;
  recipe?: ConsentActionRecipeScenario;
  scenario: ConsentFlowScenario;
}): ScenarioRecipeDiagnostic {
  if (input.scenario === "baseline_pre_consent") {
    return {
      candidateLabels: [],
      equivalentCandidateCount: 0,
      equivalentVisibleCandidateCount: 0,
      recipeCandidateCount: 0,
      status: "not_applicable",
    };
  }
  if (!input.recipe) {
    return {
      candidateLabels: input.candidates.map((candidate) => candidate.labelText.slice(0, 120)).slice(0, 12),
      equivalentCandidateCount: 0,
      equivalentVisibleCandidateCount: 0,
      recipeCandidateCount: 0,
      status: "missing",
    };
  }
  const equivalentCandidates = input.candidates.filter((candidate) =>
    input.recipe?.candidates.some((recipeCandidate) => recipeCandidateMatches(candidate, recipeCandidate))
  );
  if (input.recipe.candidates.length === 0) {
    return {
      candidateLabels: input.candidates.map((candidate) => candidate.labelText.slice(0, 120)).slice(0, 12),
      equivalentCandidateCount: 0,
      equivalentVisibleCandidateCount: 0,
      recipeCandidateCount: 0,
      status: "present_empty",
      targetUrl: input.recipe.targetUrl,
    };
  }
  return {
    candidateLabels: input.candidates.map((candidate) => candidate.labelText.slice(0, 120)).slice(0, 12),
    equivalentCandidateCount: equivalentCandidates.length,
    equivalentVisibleCandidateCount: equivalentCandidates.filter((candidate) => candidate.visible && candidate.enabled).length,
    recipeCandidateCount: input.recipe.candidates.length,
    status: equivalentCandidates.some((candidate) => candidate.visible && candidate.enabled) ? "reacquired" : "present_not_matched",
    targetUrl: input.recipe.targetUrl,
  };
}

function recipeCandidateMatches(
  candidate: Pick<ConsentActionCandidate, "actionType" | "labelText">,
  recipeCandidate: ConsentActionRecipeCandidate,
): boolean {
  if (recipeCandidate.actionType && candidate.actionType !== recipeCandidate.actionType) {
    return false;
  }
  const candidateLabel = normalizeRecipeLabel(candidate.labelText);
  const recipeLabel = normalizeRecipeLabel(recipeCandidate.labelText);
  if (!candidateLabel || !recipeLabel) {
    return false;
  }
  return candidateLabel === recipeLabel ||
    candidateLabel.includes(recipeLabel) ||
    recipeLabel.includes(candidateLabel);
}

function normalizeRecipeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function applyBaselineRecipeTargets(
  plannedScenarios: ConsentScenarioPlanItem[],
  baselineCapture: ScenarioCapture,
  normalizedUrl: string,
): void {
  for (const item of plannedScenarios) {
    if (item.targetUrl) {
      continue;
    }
    const candidate = bestBaselineRecipeTarget(baselineCapture.recipeResearchCandidates, item.scenario, normalizedUrl);
    if (candidate?.href) {
      item.targetUrl = candidate.href;
      item.reasonCodes = unique([...item.reasonCodes, "baseline_recipe_target_reused"]);
    }
  }
}

function bestBaselineRecipeTarget(
  candidates: ConsentRecipeResearchCandidate[],
  scenario: ConsentFlowScenario,
  normalizedUrl: string,
): ConsentRecipeResearchCandidate | undefined {
  const normalizedOrigin = originOf(normalizedUrl);
  return candidates
    .filter((candidate) =>
      candidate.href &&
      candidate.suggestedScenario === scenario &&
      candidate.confidence >= 0.78 &&
      (!normalizedOrigin || sameOrigin(candidate.href, normalizedOrigin))
    )
    .sort((left, right) => right.confidence - left.confidence || left.candidateId.localeCompare(right.candidateId))[0];
}

function originOf(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function sameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function addProtectedUrlParts(
  url: string,
  protectedHostnames: Set<string>,
  protectedUrlPrefixes: Set<string>,
): void {
  try {
    const parsed = new URL(url);
    protectedHostnames.add(parsed.hostname);
    protectedUrlPrefixes.add(`${parsed.origin}${parsed.pathname}`.toLowerCase());
  } catch {
    // Ignore malformed candidate URLs; resource preservation also has text-based URL guards.
  }
}

function isStrongConsentCookieName(name: string): boolean {
  return /^(?:OptanonConsent|OptanonAlertBoxClosed|CookieConsent|Cookiebot|euconsent-v2|eupubconsent-v2|usprivacy|didomi_token|didomi_token_status|fides_consent|notice_preferences)$/i.test(name);
}

function isConsentResourceText(value: string): boolean {
  return /(?:consent|privacy|cmp|gdpr|gpp|us[_-]?privacy|ccpa|optanon|onetrust|cookiebot|didomi|trustarc|sourcepoint|quantcast|usercentrics|fides|do[-_]?not[-_]?sell|opt[-_]?out)/i.test(value);
}

function intersection(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return unique(left.filter((item) => rightSet.has(item))).sort();
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return unique(left.filter((item) => !rightSet.has(item))).sort();
}

function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort();
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function deltaCounts(left: Record<string, number>, right: Record<string, number>): Record<string, number> {
  const keys = unique([...Object.keys(left), ...Object.keys(right)]);
  return Object.fromEntries(keys.map((key) => [key, (right[key] ?? 0) - (left[key] ?? 0)]));
}
