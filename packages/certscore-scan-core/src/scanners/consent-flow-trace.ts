import type {
  ArtifactRef,
  ConsentFlowComparison,
  ConsentFlowScenario,
  ConsentFlowTraceArtifact,
  ConsentScenarioPlanningMode,
} from "@certscore/contracts";
import { consentFlowTraceArtifactSchema } from "@certscore/contracts";
import type { ArtifactWriter } from "../artifact-writer.js";
import { internalJsonArtifactRef, scenarioCoverageAreas } from "./consent-scenario-artifacts.js";
import type { ConsentScenarioExecutionEntry } from "./consent-scenario-executor.js";
import type { ConsentScenarioPlan } from "./consent-scenario-planner.js";

const SOURCE_SCANNER = "consent_flow_runtime";

export interface TraceScenarioCapture {
  scenario: ConsentFlowScenario;
  networkEvents: Array<{ eventId: string }>;
  cookieEvents: Array<{ eventId: string }>;
  actionCandidates: unknown[];
  actionAttempts: Array<{
    actionType: string;
    attempted: boolean;
    succeeded: boolean;
    actionProof?: { attemptedStatus?: string };
    evidenceRefs?: Array<{ refId: string }>;
  }>;
  consentFlowObservation?: {
    evidenceRefs?: Array<{ refId: string }>;
    artifactRefs?: Array<{ artifactId: string }>;
  };
  artifactRefs: ArtifactRef[];
}

export async function writeConsentFlowTraceArtifact(input: {
  artifactWriter: ArtifactWriter;
  mode: ConsentScenarioPlanningMode;
  sourceUrl: string;
  normalizedUrl: string;
  plan: ConsentScenarioPlan;
  executionEntries: ConsentScenarioExecutionEntry[];
  captures: TraceScenarioCapture[];
  comparisons: ConsentFlowComparison[];
  relatedArtifactRefs: ArtifactRef[];
}): Promise<ArtifactRef> {
  const capturesByScenario = new Map(input.captures.map((capture) => [capture.scenario, capture]));
  const scenarioNodes = input.executionEntries.map((entry) => {
    const capture = capturesByScenario.get(entry.scenario);
    return {
      scenario: entry.scenario,
      status: entry.status,
      plannedReasonCodes: entry.reasonCodes,
      actionProofStatus: entry.actionProofStatus,
      comparisonEligible: entry.comparisonEligible,
      coverageAreas: scenarioCoverageAreas(entry.scenario),
      evidenceRefIds: uniqueStrings([
        ...(capture?.consentFlowObservation?.evidenceRefs ?? []).map((ref) => ref.refId),
        ...(capture?.actionAttempts ?? []).flatMap((attempt) =>
          (attempt.evidenceRefs ?? []).map((ref) => ref.refId)
        ),
      ]),
      artifactRefIds: uniqueStrings([
        ...(capture?.artifactRefs ?? []).map((ref) => ref.artifactId),
        ...(capture?.consentFlowObservation?.artifactRefs ?? []).map((ref) => ref.artifactId),
      ]),
      signalSummary: {
        networkEvents: capture?.networkEvents.length ?? 0,
        cookieEvents: capture?.cookieEvents.length ?? 0,
        actionCandidates: capture?.actionCandidates.length ?? 0,
        actionAttempts: capture?.actionAttempts.length ?? 0,
      },
    };
  });

  const artifact = consentFlowTraceArtifactSchema.parse({
    artifactVersion: "consent_flow_trace.v1",
    sourceScanner: SOURCE_SCANNER,
    generatedAt: new Date().toISOString(),
    sourceUrl: input.sourceUrl,
    normalizedUrl: input.normalizedUrl,
    planningMode: input.mode,
    scenarioNodes,
    decisionEdges: [
      ...input.plan.plannedScenarios
        .filter((item) => item.scenario !== "baseline_pre_consent")
        .map((item) => ({
          from: "baseline_pre_consent" as const,
          to: item.scenario,
          decision: "planned" as const,
          reasonCodes: item.reasonCodes,
        })),
      ...input.plan.skippedScenarios.map((item) => ({
        from: "baseline_pre_consent" as const,
        to: item.scenario,
        decision: "skipped" as const,
        reasonCodes: item.reasonCodes,
      })),
    ],
    coverageTrace: buildCoverageTrace(input.executionEntries, input.comparisons),
    artifactRefIds: uniqueStrings(input.relatedArtifactRefs.map((ref) => ref.artifactId)),
    notes: [],
  } satisfies ConsentFlowTraceArtifact);
  const path = await input.artifactWriter.writeJsonArtifact("consent_flow_trace.json", artifact);
  return internalJsonArtifactRef("consent_flow_trace", path, "Consent flow trace");
}

function buildCoverageTrace(
  entries: ConsentScenarioExecutionEntry[],
  comparisons: ConsentFlowComparison[],
): ConsentFlowTraceArtifact["coverageTrace"] {
  const byArea = new Map<string, {
    scenarios: Set<ConsentFlowScenario>;
    limitationKeys: Set<string>;
    comparisonIds: Set<string>;
    testable: boolean;
  }>();
  for (const entry of entries) {
    for (const area of scenarioCoverageAreas(entry.scenario)) {
      const current = byArea.get(area) ?? {
        scenarios: new Set<ConsentFlowScenario>(),
        limitationKeys: new Set<string>(),
        comparisonIds: new Set<string>(),
        testable: false,
      };
      current.scenarios.add(entry.scenario);
      if (entry.comparisonEligible || (!entry.actionType && entry.status === "completed")) {
        current.testable = true;
      }
      if (entry.failureReason) {
        current.limitationKeys.add(entry.failureReason);
      }
      if (entry.deadlineHit) {
        current.limitationKeys.add("deadline_hit");
      }
      byArea.set(area, current);
    }
  }
  for (const comparison of comparisons) {
    const scenarios = scenariosForComparison(comparison.comparedScenarios);
    for (const scenario of scenarios) {
      for (const area of scenarioCoverageAreas(scenario)) {
        const current = byArea.get(area);
        if (current) {
          current.comparisonIds.add(comparison.comparisonId);
          if (comparison.comparableMeasurement?.comparable) {
            current.testable = true;
          }
          for (const limitation of comparison.coverageLimitations) {
            current.limitationKeys.add(limitation.limitationKey);
          }
        }
      }
    }
  }
  return [...byArea.entries()].map(([coverageArea, value]) => ({
    coverageArea,
    status: value.testable ? "testable" : value.scenarios.size > 0 ? "not_testable" : "skipped",
    supportingScenarios: [...value.scenarios],
    supportingComparisonIds: [...value.comparisonIds],
    limitationKeys: [...value.limitationKeys],
  }));
}

function scenariosForComparison(value: ConsentFlowComparison["comparedScenarios"]): ConsentFlowScenario[] {
  switch (value) {
    case "fresh_pre_consent_vs_after_reject":
      return ["baseline_pre_consent", "reject_all_flow"];
    case "fresh_pre_consent_vs_after_accept":
      return ["baseline_pre_consent", "accept_all_flow"];
    case "after_reject_vs_after_accept":
      return ["reject_all_flow", "accept_all_flow"];
    case "fresh_pre_consent_vs_gpc_enabled":
      return ["baseline_pre_consent", "gpc_enabled"];
    case "fresh_pre_consent_vs_privacy_opt_out":
      return ["baseline_pre_consent", "privacy_opt_out_flow"];
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
