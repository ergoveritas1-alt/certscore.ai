import assert from "node:assert/strict";
import test from "node:test";
import {
  auditLunaScoreDecision,
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
      expectedPostureBand: "Luna-labeled",
      evidenceArtifact: `artifacts/scoring/luna/lanes/${lane.laneId}.json`
    })),
    modelParameters: {
      status: "approved_by_luna",
      approvedModelArtifact: "docs/scoring/gdpr-eprivacy-shadow-candidate-v2.json",
      decisionEvidenceArtifact: "artifacts/scoring/luna/model-parameters.json"
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
  assert.equal(isLunaScoreDecisionApprovedForModel(
    GDPR_EPRIVACY_SHADOW_LUNA_DECISION,
    GDPR_EPRIVACY_SHADOW_LUNA_DECISION.modelVersion
  ), false);
});

test("an approval flag without evidence cannot pass the Luna gate", () => {
  const incomplete = structuredClone(GDPR_EPRIVACY_SHADOW_LUNA_DECISION);
  incomplete.decisionStatus = "approved_by_luna";

  assert.equal(isLunaScoreDecisionApprovedForModel(incomplete, incomplete.modelVersion), false);
  assert.ok(auditLunaScoreDecision(incomplete).includes("signOff.approvedBy"));
  assert.ok(auditLunaScoreDecision(incomplete).includes("benchmarkCorpus.governedPublicSampleArtifact"));
});

test("a complete version-matched Luna decision passes the gate", () => {
  const decision = approvedDecision();

  assert.deepEqual(auditLunaScoreDecision(decision), []);
  assert.equal(isLunaScoreDecisionApprovedForModel(decision, decision.modelVersion), true);
  assert.equal(isLunaScoreDecisionApprovedForModel(decision, "different-model"), false);
});
