import assert from "node:assert/strict";
import test from "node:test";
import {
  auditLunaScoreDecision,
  getLunaAcceptedScoreComparisonDifferences,
  GDPR_EPRIVACY_SHADOW_LUNA_DECISION,
  isLunaScoreDecisionApprovedForModel,
  type CanonicalShadowScoreLunaDecision
} from "./canonical-shadow-score-luna-decision";

function approvedDecision(): CanonicalShadowScoreLunaDecision {
  return {
    ...structuredClone(GDPR_EPRIVACY_SHADOW_LUNA_DECISION),
    decisionStatus: "approved_by_luna",
    coverageSemantics: {
      ...structuredClone(GDPR_EPRIVACY_SHADOW_LUNA_DECISION.coverageSemantics),
      status: "approved_by_luna",
      selectedCustomerFacingMetric: "report_usable_evidence",
      decisionEvidenceArtifact: "artifacts/scoring/luna/coverage-decision.json"
    },
    benchmarkCorpus: {
      status: "approved_by_luna",
      corpusId: "luna-corpus-v1",
      centralContactHistoryExportArtifact: "artifacts/scoring/luna/contact-history.json",
      canonicalSelectorArtifact: "artifacts/scoring/luna/selector.json",
      retainedReplayArtifact: "artifacts/scoring/luna/retained-replay.json",
      ownedCanaryArtifact: "artifacts/scoring/luna/owned-canaries.json",
      governedPublicSampleArtifact: "artifacts/scoring/luna/public-sample.json"
    },
    expectedBandLanes: GDPR_EPRIVACY_SHADOW_LUNA_DECISION.expectedBandLanes.map((lane) => ({
      ...lane,
      status: "approved_by_luna",
      expectedPostureBand: lane.expectedPostureBand ?? "Withheld",
      evidenceArtifact: `artifacts/scoring/luna/lanes/${lane.laneId}.json`
    })),
    modelParameters: {
      status: "approved_by_luna",
      approvedModelArtifact: "docs/scoring/gdpr-eprivacy-shadow-candidate-v3.json",
      decisionEvidenceArtifact: "artifacts/scoring/luna/model-parameters.json"
    },
    monitoringBaselines: {
      status: "approved_by_luna",
      decisionEvidenceArtifact: "artifacts/scoring/luna/monitoring-baselines.json",
      thresholds: {
        minimumSampleCount: 50,
        minimumComparableCount: 30,
        minimumCrossRegionGroupCount: 5,
        minimumCrossSourceGroupCount: 5,
        maximumAbsoluteScoreDeltaP95: 25,
        maximumContradictionRate: 0.02,
        maximumWithheldRate: 0.25,
        maximumCrossRegionScoreRange: 5,
        maximumCrossSourceScoreRange: 5
      }
    },
    signOff: {
      status: "approved_by_luna",
      approvedBy: "Luna",
      approvedAt: "2026-07-22T12:00:00.000Z",
      approvalEvidenceArtifact: "artifacts/scoring/luna/final-sign-off.json"
    }
  };
}

test("the checked-in Luna decision packet is valid, explicit, and still pending", () => {
  assert.deepEqual(auditLunaScoreDecision(GDPR_EPRIVACY_SHADOW_LUNA_DECISION), []);
  assert.equal(GDPR_EPRIVACY_SHADOW_LUNA_DECISION.coverageSemantics.recommendedCustomerFacingMetric, "report_usable_evidence");
  assert.equal(GDPR_EPRIVACY_SHADOW_LUNA_DECISION.coverageSemantics.status, "approved_by_luna");
  assert.equal(GDPR_EPRIVACY_SHADOW_LUNA_DECISION.coverageSemantics.selectedCustomerFacingMetric, "report_usable_evidence");
  assert.equal(GDPR_EPRIVACY_SHADOW_LUNA_DECISION.monitoringBaselines.status, "pending_luna");
  assert.equal(isLunaScoreDecisionApprovedForModel(
    GDPR_EPRIVACY_SHADOW_LUNA_DECISION,
    GDPR_EPRIVACY_SHADOW_LUNA_DECISION.modelVersion
  ), false);
  assert.ok(GDPR_EPRIVACY_SHADOW_LUNA_DECISION.expectedBandLanes.every(
    (lane) => lane.expectedPostureBand !== null && lane.evidenceArtifact !== null
  ));
});

test("Luna's approved coverage semantic accepts only the exact model's legacy migration difference", () => {
  assert.deepEqual(
    getLunaAcceptedScoreComparisonDifferences(
      GDPR_EPRIVACY_SHADOW_LUNA_DECISION,
      GDPR_EPRIVACY_SHADOW_LUNA_DECISION.modelVersion
    ),
    ["legacy_score_coverage_diverges_from_report_usable_evidence"]
  );
  assert.deepEqual(
    getLunaAcceptedScoreComparisonDifferences(
      GDPR_EPRIVACY_SHADOW_LUNA_DECISION,
      "different-model"
    ),
    []
  );
});

test("pending final approval cannot erase Luna's selected lane labels", () => {
  const incomplete = structuredClone(GDPR_EPRIVACY_SHADOW_LUNA_DECISION);
  incomplete.expectedBandLanes[0]!.expectedPostureBand = null;
  incomplete.expectedBandLanes[0]!.evidenceArtifact = null;

  assert.ok(auditLunaScoreDecision(incomplete).includes("expectedBandLanes.low_signal.expectedPostureBand"));
  assert.ok(auditLunaScoreDecision(incomplete).includes("expectedBandLanes.low_signal.evidenceArtifact"));
});

test("an approval flag without evidence cannot pass the Luna gate", () => {
  const incomplete = structuredClone(GDPR_EPRIVACY_SHADOW_LUNA_DECISION);
  incomplete.decisionStatus = "approved_by_luna";

  assert.equal(isLunaScoreDecisionApprovedForModel(incomplete, incomplete.modelVersion), false);
  assert.ok(auditLunaScoreDecision(incomplete).includes("signOff.approvedBy"));
  assert.ok(auditLunaScoreDecision(incomplete).includes("benchmarkCorpus.governedPublicSampleArtifact"));
  assert.ok(auditLunaScoreDecision(incomplete).includes("monitoringBaselines.status"));
});

test("approved monitoring baselines require every bounded threshold and evidence", () => {
  const incomplete = approvedDecision();
  incomplete.monitoringBaselines.thresholds.maximumWithheldRate = null;
  incomplete.monitoringBaselines.decisionEvidenceArtifact = null;

  const errors = auditLunaScoreDecision(incomplete);
  assert.ok(errors.includes("monitoringBaselines.thresholds.maximumWithheldRate"));
  assert.ok(errors.includes("monitoringBaselines.decisionEvidenceArtifact"));
  assert.equal(isLunaScoreDecisionApprovedForModel(incomplete, incomplete.modelVersion), false);
});

test("a complete version-matched Luna decision passes the gate", () => {
  const decision = approvedDecision();

  assert.deepEqual(auditLunaScoreDecision(decision), []);
  assert.equal(isLunaScoreDecisionApprovedForModel(decision, decision.modelVersion), true);
  assert.equal(isLunaScoreDecisionApprovedForModel(decision, "different-model"), false);
});
