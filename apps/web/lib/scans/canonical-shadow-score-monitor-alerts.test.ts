import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalShadowScoreLunaDecision } from "./canonical-shadow-score-luna-decision";
import { GDPR_EPRIVACY_SHADOW_LUNA_DECISION } from "./canonical-shadow-score-luna-decision";
import { summarizeStoredCanonicalShadowComparisons } from "./canonical-shadow-score-monitor";
import { evaluateCanonicalShadowScoreMonitoring } from "./canonical-shadow-score-monitor-alerts";

function approvedDecision(): CanonicalShadowScoreLunaDecision {
  return {
    ...structuredClone(GDPR_EPRIVACY_SHADOW_LUNA_DECISION),
    monitoringBaselines: {
      status: "approved_by_luna",
      decisionEvidenceArtifact: "artifacts/scoring/luna/monitoring-baselines.json",
      thresholds: {
        minimumSampleCount: 2,
        minimumComparableCount: 2,
        minimumCrossRegionGroupCount: 1,
        minimumCrossSourceGroupCount: 1,
        minimumEquivalentInputCrossSourceGroupCount: 1,
        maximumAbsoluteScoreDeltaP95: 10,
        maximumContradictionRate: 0.1,
        maximumWithheldRate: 0.2,
        maximumCrossRegionScoreRange: 5,
        maximumCrossSourceScoreRange: 5,
        maximumEquivalentInputCrossSourceScoreRange: 5
      }
    }
  };
}

function summary() {
  return summarizeStoredCanonicalShadowComparisons([
    {
      candidateCoverageRatio: 1,
      candidateScore: 80,
      comparisonGroupKey: "sha256:group",
      comparisonTargetKey: "sha256:target",
      coverageProjectionFingerprint: "sha256:coverage",
      coverageProjectionRowCount: 39,
      contradictionTypes: [],
      generatedAt: "2026-07-22T00:00:00.000Z",
      inputProjectionFingerprint: "sha256:identical",
      findingProjectionFingerprint: "sha256:findings",
      findingProjectionCount: 1,
      legacyCoverageRatio: 1,
      legacyScore: 75,
      modelVersion: GDPR_EPRIVACY_SHADOW_LUNA_DECISION.modelVersion,
      region: "eu-west-1",
      reportUsableEvidenceRatio: 1,
      scanId: "scan-1",
      scanSource: "lambda",
      scoreDelta: 5,
      withholdingReasons: []
    },
    {
      candidateCoverageRatio: 1,
      candidateScore: 80,
      comparisonGroupKey: "sha256:group",
      comparisonTargetKey: "sha256:target",
      coverageProjectionFingerprint: "sha256:coverage",
      coverageProjectionRowCount: 39,
      contradictionTypes: [],
      generatedAt: "2026-07-22T00:01:00.000Z",
      inputProjectionFingerprint: "sha256:identical",
      findingProjectionFingerprint: "sha256:findings",
      findingProjectionCount: 1,
      legacyCoverageRatio: 1,
      legacyScore: 75,
      modelVersion: GDPR_EPRIVACY_SHADOW_LUNA_DECISION.modelVersion,
      region: "eu-central-1",
      reportUsableEvidenceRatio: 1,
      scanId: "scan-2",
      scanSource: "eu_de",
      scoreDelta: 5,
      withholdingReasons: []
    },
    {
      candidateCoverageRatio: 1,
      candidateScore: 80,
      comparisonGroupKey: "sha256:group",
      comparisonTargetKey: "sha256:target",
      coverageProjectionFingerprint: "sha256:coverage",
      coverageProjectionRowCount: 39,
      contradictionTypes: [],
      generatedAt: "2026-07-22T00:02:00.000Z",
      inputProjectionFingerprint: "sha256:identical",
      findingProjectionFingerprint: "sha256:findings",
      findingProjectionCount: 1,
      legacyCoverageRatio: 1,
      legacyScore: 75,
      modelVersion: GDPR_EPRIVACY_SHADOW_LUNA_DECISION.modelVersion,
      region: "eu-west-1",
      reportUsableEvidenceRatio: 1,
      scanId: "scan-3",
      scanSource: "browser_extension",
      scoreDelta: 5,
      withholdingReasons: []
    }
  ]);
}

test("monitoring alert judgments are withheld while Luna baselines are pending", () => {
  const evaluation = evaluateCanonicalShadowScoreMonitoring(summary());

  assert.equal(evaluation.status, "withheld");
  assert.equal(evaluation.reason, "monitoring_baselines_pending_luna");
  assert.deepEqual(evaluation.alerts, []);
});

test("approved monitoring baselines evaluate every governed metric", () => {
  const evaluation = evaluateCanonicalShadowScoreMonitoring(summary(), approvedDecision());

  assert.equal(evaluation.status, "within_approved_baseline");
  assert.equal(evaluation.reason, null);
  assert.deepEqual(evaluation.alerts, []);
});

test("approved monitoring baselines pause rollout on exceeded and undersampled metrics", () => {
  const decision = approvedDecision();
  decision.monitoringBaselines.thresholds.minimumSampleCount = 10;
  decision.monitoringBaselines.thresholds.maximumAbsoluteScoreDeltaP95 = 1;
  const evaluation = evaluateCanonicalShadowScoreMonitoring(summary(), decision);

  assert.equal(evaluation.status, "pause_rollout");
  assert.deepEqual(evaluation.alerts.map((alert) => alert.code), [
    "insufficient_sample_count",
    "absolute_score_delta_p95_above_limit"
  ]);
});

test("invalid approved monitoring baselines fail closed", () => {
  const decision = approvedDecision();
  decision.monitoringBaselines.thresholds.maximumWithheldRate = null;
  const evaluation = evaluateCanonicalShadowScoreMonitoring(summary(), decision);

  assert.equal(evaluation.status, "withheld");
  assert.equal(evaluation.reason, "monitoring_baselines_invalid");
  assert.deepEqual(evaluation.alerts, []);
});
