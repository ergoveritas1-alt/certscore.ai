import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import {
  buildConsentScenarioShadowCompareArtifact,
  formatConsentScenarioShadowCompareMarkdown,
} from "./consent-scenario-shadow-compare.js";

test("shadow compare summarizes speed, coverage, artifacts, and trace completeness", () => {
  const artifact = buildConsentScenarioShadowCompareArtifact({
    profile: "consent",
    generatedAt: "2026-06-13T12:00:00.000Z",
    sites: [{
      url: "https://example.test",
      legacyDurationMs: 10_000,
      plannedDurationMs: 6_000,
      legacy: bundle({
        scanId: "legacy",
        lanes: ["baseline_pre_consent", "reject_all_flow", "accept_all_flow"],
        comparableComparisons: ["fresh_pre_consent_vs_after_reject"],
        externalArtifactIds: ["screenshot_before"],
      }),
      planned: bundle({
        scanId: "planned",
        lanes: ["baseline_pre_consent", "gpc_enabled", "reject_all_flow", "accept_all_flow"],
        comparableComparisons: ["fresh_pre_consent_vs_after_reject", "fresh_pre_consent_vs_gpc_enabled"],
        internalScenarioArtifacts: true,
        externalArtifactIds: ["screenshot_before"],
      }),
      plannedExecution: {
        artifactVersion: "consent_scenario_execution.v1",
        sourceScanner: "consent_flow_runtime",
        planningMode: "planned_parallel",
        generatedAt: "2026-06-13T12:00:00.000Z",
        sourceUrl: "https://example.test",
        normalizedUrl: "https://example.test/",
        policyPlanningStatus: "policy_surface_unavailable",
        healthSummary: {
          completed: 4,
          failed: 0,
          skipped: 1,
          comparisonEligible: 4,
          deadlineHit: false,
          policyLate: false,
        },
        scenarios: [{
          scenario: "privacy_opt_out_flow",
          actionType: "do_not_sell_share",
          reasonCodes: ["privacy_control_not_observed"],
          status: "skipped",
          actionProofStatus: "not_available",
          comparisonEligible: false,
          deadlineHit: false,
          failureReason: "privacy_control_not_observed",
        }],
        notes: [],
      },
      plannedTrace: {
        artifactVersion: "consent_flow_trace.v1",
        sourceScanner: "consent_flow_runtime",
        generatedAt: "2026-06-13T12:00:00.000Z",
        sourceUrl: "https://example.test",
        normalizedUrl: "https://example.test/",
        planningMode: "planned_parallel",
        scenarioNodes: [{
          scenario: "baseline_pre_consent",
          status: "completed",
          plannedReasonCodes: ["baseline_required"],
          actionProofStatus: "not_required",
          comparisonEligible: true,
          coverageAreas: ["cookies_storage_before_consent"],
          evidenceRefIds: [],
          artifactRefIds: [],
          signalSummary: {
            networkEvents: 1,
            cookieEvents: 0,
            actionCandidates: 2,
            actionAttempts: 0,
          },
        }],
        decisionEdges: [],
        coverageTrace: [{
          coverageArea: "post_reject_tracking",
          status: "testable",
          supportingScenarios: ["reject_all_flow"],
          supportingComparisonIds: ["cmp_reject"],
          limitationKeys: [],
        }],
        artifactRefIds: ["consent_scenario_plan", "consent_scenario_execution"],
        notes: [],
      },
    }],
  });

  assert.equal(artifact.summary.urlsScanned, 1);
  assert.equal(artifact.summary.p50DurationDeltaMs, -4_000);
  assert.equal(artifact.summary.p50DurationImprovementPct, 40);
  assert.equal(artifact.summary.sameOrBetterLaneCoverage, true);
  assert.equal(artifact.summary.completePlannedArtifacts, true);
  assert.equal(artifact.summary.traceComplete, true);
  assert.equal(artifact.summary.noNewProductionFacingOutputs, true);
  assert.equal(artifact.sites[0]?.notTestableReasons.includes("privacy_control_not_observed"), true);
  assert.match(formatConsentScenarioShadowCompareMarkdown(artifact), /Consent Scenario DAG Shadow Compare/);
});

test("shadow compare flags lane loss and new production-facing artifacts", () => {
  const artifact = buildConsentScenarioShadowCompareArtifact({
    profile: "consent",
    sites: [{
      url: "https://example.test",
      legacyDurationMs: 10_000,
      plannedDurationMs: 12_000,
      legacy: bundle({
        scanId: "legacy",
        lanes: ["baseline_pre_consent", "reject_all_flow"],
        comparableComparisons: ["fresh_pre_consent_vs_after_reject"],
        externalArtifactIds: ["screenshot_before"],
      }),
      planned: bundle({
        scanId: "planned",
        lanes: ["baseline_pre_consent"],
        comparableComparisons: [],
        internalScenarioArtifacts: true,
        nonInternalScenarioArtifact: true,
        externalArtifactIds: ["screenshot_before", "new_public_ref"],
      }),
    }],
  });

  assert.equal(artifact.summary.sameOrBetterLaneCoverage, false);
  assert.equal(artifact.summary.noNewProductionFacingOutputs, false);
  assert.equal(artifact.summary.increasedAmbiguitySites, 1);
  assert.equal(artifact.sites[0]?.laneCoverage.missingInPlanned.includes("reject_all_flow"), true);
  assert.equal(artifact.sites[0]?.productionOutputInvariant.blockingReasons.length, 1);
});

function bundle(input: {
  scanId: string;
  lanes: string[];
  comparableComparisons: string[];
  internalScenarioArtifacts?: boolean;
  nonInternalScenarioArtifact?: boolean;
  externalArtifactIds?: string[];
}): CanonicalEvidenceBundle {
  return {
    scanId: input.scanId,
    url: "https://example.test",
    normalizedUrl: "https://example.test/",
    modulesRun: [{
      moduleName: "consentFlowRuntimeScanner",
      status: "completed",
      startedAt: "2026-06-13T12:00:00.000Z",
      completedAt: "2026-06-13T12:00:01.000Z",
      durationMs: 1_000,
      evidenceRefs: [],
      errors: [],
    }],
    consentFlowObservations: input.lanes
      .filter((lane) => !lane.startsWith("comparison:"))
      .map((scenario) => ({
        observationId: `obs_${scenario}`,
        scenario,
        consentStateAtTime: "pre_consent",
        bannerLikelyPresent: true,
        actionCandidates: [],
        actionAttempts: [],
        evidenceRefs: [],
        artifactRefs: [],
        confidence: 0.9,
        directVsInferred: "direct",
      })),
    consentActionAttempts: input.lanes
      .filter((lane) => lane === "reject_all_flow" || lane === "accept_all_flow")
      .map((scenario) => ({
        attemptId: `attempt_${scenario}`,
        actionType: scenario === "reject_all_flow" ? "reject_all" : "accept_all",
        attempted: true,
        succeeded: true,
        timestampMs: 1,
        scenario,
        evidenceRefs: [],
      })),
    consentFlowComparisons: input.comparableComparisons.map((comparedScenarios) => ({
      comparisonId: `cmp_${comparedScenarios}`,
      comparedScenarios,
      comparableMeasurement: {
        comparable: true,
        preActionWindow: {
          scenario: "baseline_pre_consent",
          consentStateAtEnd: "pre_consent",
          startedAtMs: 1,
          completedAtMs: 2,
          networkEventCount: 1,
          cookieEventCount: 0,
        },
        postActionWindow: {
          scenario: "reject_all_flow",
          consentStateAtEnd: "post_reject",
          startedAtMs: 3,
          completedAtMs: 4,
          networkEventCount: 1,
          cookieEventCount: 0,
        },
      },
      confidence: 0.9,
      coverageLimitations: [],
      evidenceRefs: [],
    })),
    artifactRefs: [
      ...(input.externalArtifactIds ?? []).map((artifactId) => ({
        artifactId,
        artifactType: "json",
        sensitivity: "safe",
        redactionStatus: "not_needed",
        relatedEventIds: [],
      })),
      ...(input.internalScenarioArtifacts ? [
        "consent_scenario_plan",
        "consent_scenario_execution",
        "consent_flow_trace",
      ].map((artifactId, index) => ({
        artifactId,
        artifactType: "json",
        path: `/tmp/${input.scanId}/${artifactId}.json`,
        sensitivity: input.nonInternalScenarioArtifact && index === 0 ? "safe" : "internal_only",
        redactionStatus: input.nonInternalScenarioArtifact && index === 0 ? "not_needed" : "internal_only",
        relatedEventIds: [],
      })) : []),
    ],
  } as unknown as CanonicalEvidenceBundle;
}
