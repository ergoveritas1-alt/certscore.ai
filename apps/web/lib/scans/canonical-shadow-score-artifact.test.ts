import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalShadowScoreComparisonArtifact } from "./canonical-shadow-score-artifact";
import { deriveCanonicalShadowScore, type CanonicalShadowScoreModel } from "./canonical-shadow-score";

const MODEL: CanonicalShadowScoreModel = {
  approvalStatus: "pending_luna",
  criticalPostureCaps: [],
  familyMaximumRiskPoints: { contradiction: 30 },
  minimumCoverageRatioForPostureScore: 0.5,
  postureBands: [
    { actionLabel: "Monitor", minimumScore: 75, posture: "Clear" },
    { actionLabel: "Review", minimumScore: 50, posture: "Watch" },
    { actionLabel: "Act", minimumScore: 0, posture: "Action Needed" }
  ],
  severityRiskPoints: { high: 30, medium: 15, low: 5 },
  version: "test.pending-luna"
};

test("comparison artifact preserves version provenance and a bounded score delta", () => {
  const candidate = deriveCanonicalShadowScore({
    coverageRows: [{ assessmentStatus: "checked", evidenceState: "observed", rowId: "privacy_notice_availability" }],
    findings: [{ family: "contradiction", findingId: "policy_behavior_contradiction_detected", severity: "medium" }],
    model: MODEL
  });
  const artifact = buildCanonicalShadowScoreComparisonArtifact({
    candidate,
    context: {
      comparisonGroupKey: "sha256:example-domain",
      region: "eu-west-1",
      scanSource: "lambda"
    },
    generatedAt: "2026-07-22T00:00:00.000Z",
    inputProjectionFingerprint: "sha256:fixture",
    legacy: {
      score: 72,
      scoreKind: "gdpr_eprivacy_evidence",
      scoreSource: "wc01.regulatory-coverage-score",
      scoreVersion: "gdpr-eprivacy-evidence.legacy-v1"
    },
    scanId: "00000000-0000-4000-8000-000000000001"
  });

  assert.equal(artifact.candidate.postureScore, 85);
  assert.deepEqual(artifact.comparison, {
    absoluteDelta: 13,
    delta: 13,
    status: "candidate_higher"
  });
  assert.equal(artifact.schemaVersion, "canonical-shadow-score-comparison.v1");
  assert.equal(artifact.context.region, "eu-west-1");
  assert.equal(artifact.legacy.scoreVersion, "gdpr-eprivacy-evidence.legacy-v1");
});

test("comparison artifact distinguishes a withheld candidate from a numerical delta", () => {
  const candidate = deriveCanonicalShadowScore({ coverageRows: [], findings: [], model: MODEL });
  const artifact = buildCanonicalShadowScoreComparisonArtifact({
    candidate,
    generatedAt: "2026-07-22T00:00:00.000Z",
    inputProjectionFingerprint: "sha256:fixture",
    legacy: {
      score: 72,
      scoreKind: "gdpr_eprivacy_evidence",
      scoreSource: "wc01.regulatory-coverage-score",
      scoreVersion: "gdpr-eprivacy-evidence.legacy-v1"
    },
    scanId: "00000000-0000-4000-8000-000000000001"
  });

  assert.equal(artifact.comparison.delta, null);
  assert.equal(artifact.comparison.status, "candidate_withheld");
});
