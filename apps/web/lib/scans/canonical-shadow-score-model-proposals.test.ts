import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalShadowScoreBenchmarkArtifact } from "./canonical-shadow-score-benchmark";
import {
  auditCanonicalShadowScoreModel,
  type CanonicalShadowScoreResult
} from "./canonical-shadow-score";
import {
  GDPR_EPRIVACY_SHADOW_SCORE_COVERAGE_ROW_IDS,
  GDPR_EPRIVACY_SHADOW_SCORE_ELIGIBLE_FAMILIES
} from "./canonical-shadow-score-input";
import { GDPR_EPRIVACY_SHADOW_MODEL_PROPOSALS } from "./canonical-shadow-score-model-proposals";

function policyResult(proposalId: string): CanonicalShadowScoreResult {
  const proposal = GDPR_EPRIVACY_SHADOW_MODEL_PROPOSALS.find((entry) => entry.proposalId === proposalId);
  assert.ok(proposal);
  const artifact = buildCanonicalShadowScoreBenchmarkArtifact("2026-07-22T12:00:00.000Z", proposal.model);
  const result = artifact.cases.find((entry) => entry.laneId === "policy_gaps")?.result;
  assert.ok(result);
  return result;
}

test("every rights-gap proposal is registry-complete, pending Luna, and benchmark-clean", () => {
  assert.equal(GDPR_EPRIVACY_SHADOW_MODEL_PROPOSALS.length, 3);
  for (const proposal of GDPR_EPRIVACY_SHADOW_MODEL_PROPOSALS) {
    assert.equal(proposal.model.approvalStatus, "pending_luna");
    assert.deepEqual(auditCanonicalShadowScoreModel({
      model: proposal.model,
      scoreEligibleCoverageRowIds: [...GDPR_EPRIVACY_SHADOW_SCORE_COVERAGE_ROW_IDS],
      scoreEligibleFamilies: [...GDPR_EPRIVACY_SHADOW_SCORE_ELIGIBLE_FAMILIES]
    }), {
      invalidCoverageRowWeights: [],
      invalidFamilyMaximums: [],
      invalidGlobalSettings: [],
      invalidPostureBands: [],
      missingCoverageRows: [],
      missingFamilies: [],
      staleCoverageRows: [],
      staleFamilies: []
    });
    const benchmark = buildCanonicalShadowScoreBenchmarkArtifact("2026-07-22T12:00:00.000Z", proposal.model);
    assert.deepEqual(benchmark.invariantFailures, []);
    assert.deepEqual(benchmark.candidateContradictions, []);
    assert.equal(benchmark.gdprEprivacyCutoverEligible, false);
  }
});

test("Luna proposals expose distinct bounded policy-gap outcomes", () => {
  const max30 = policyResult("rights-family-maximum-30");
  const cap54 = policyResult("high-rights-gap-cap-54");
  const cap49 = policyResult("high-rights-gap-cap-49");

  assert.deepEqual(
    { risk: max30.observedRiskIndex, score: max30.postureScore, posture: max30.posture, caps: max30.appliedCaps },
    { risk: 30, score: 70, posture: "Watch", caps: [] }
  );
  assert.deepEqual(
    { risk: cap54.observedRiskIndex, score: cap54.postureScore, posture: cap54.posture, cap: cap54.appliedCaps[0]?.maxPostureScore },
    { risk: 25, score: 54, posture: "Watch", cap: 54 }
  );
  assert.deepEqual(
    { risk: cap49.observedRiskIndex, score: cap49.postureScore, posture: cap49.posture, cap: cap49.appliedCaps[0]?.maxPostureScore },
    { risk: 25, score: 49, posture: "Action Needed", cap: 49 }
  );
});

test("Luna's selected Watch label blocks the stronger Action Needed alternative", () => {
  const proposal = GDPR_EPRIVACY_SHADOW_MODEL_PROPOSALS.find((entry) => entry.proposalId === "high-rights-gap-cap-49");
  assert.ok(proposal);
  const artifact = buildCanonicalShadowScoreBenchmarkArtifact("2026-07-22T12:00:00.000Z", proposal.model);
  assert.deepEqual(artifact.expectedBandMismatches, [
    "expected_band_mismatch:policy-rights-gap:Watch->Action Needed"
  ]);
  assert.ok(artifact.acceptanceBlockers.includes("expected_band_mismatch:policy-rights-gap:Watch->Action Needed"));
});
