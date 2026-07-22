import assert from "node:assert/strict";
import test from "node:test";
import { runCanonicalShadowScore, type CanonicalShadowScoreRunInput } from "./canonical-shadow-score-run";

function input(): CanonicalShadowScoreRunInput {
  return {
    context: { comparisonGroupKey: "sha256:target", region: "eu-west-1", scanSource: "lambda" },
    coverageRows: [{ assessmentStatus: "checked", evidenceState: "observed", rowId: "privacy_notice_availability" }],
    findings: [{ family: "contradiction", findingId: "policy_behavior_contradiction_detected", severity: "medium" }],
    generatedAt: "2026-07-22T00:00:00.000Z",
    inputProjectionFingerprint: "sha256:fixture",
    legacy: {
      coverageConfidence: "high",
      coverageRatio: 1,
      reportInScopeRowCount: 1,
      reportUsableEvidenceRatio: 1,
      reportUsableRowCount: 1,
      score: 72,
      scoreKind: "gdpr_eprivacy_evidence",
      scoreSource: "wc01.regulatory-coverage-score",
      scoreVersion: "gdpr-eprivacy-evidence.legacy-v1"
    },
    model: {
      approvalStatus: "pending_luna",
      coverageRowWeights: { privacy_notice_availability: 1 },
      criticalPostureCaps: [],
      familyMaximumRiskPoints: { contradiction: 30 },
      minimumCoverageRatioForNoFindingPostureScore: 0.7,
      minimumCoverageRatioForPostureScore: 0.7,
      postureBands: [
        { actionLabel: "Monitor", minimumScore: 75, posture: "Clear" },
        { actionLabel: "Review", minimumScore: 50, posture: "Watch" },
        { actionLabel: "Act", minimumScore: 0, posture: "Action Needed" }
      ],
      severityRiskPoints: { high: 30, medium: 15, low: 5 },
      version: "test.pending-luna"
    },
    scanId: "00000000-0000-4000-8000-000000000001",
    scoreEligibleCoverageRowIds: ["privacy_notice_availability"],
    scoreEligibleFamilies: ["contradiction"]
  };
}

test("shadow score run emits a comparison artifact only after an exact model registry audit", () => {
  const artifact = runCanonicalShadowScore(input());

  assert.equal(artifact.candidate.postureScore, 85);
  assert.equal(artifact.candidate.cutoverEligible, false);
  assert.equal(artifact.comparison.delta, 13);
});

test("shadow score run rejects incomplete Luna family configuration", () => {
  const value = input();
  value.scoreEligibleFamilies.push("consent_tracking");

  assert.throws(() => runCanonicalShadowScore(value), /model audit failed: consent_tracking/);
});
