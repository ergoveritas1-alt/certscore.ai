import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalShadowScoreComparisonArtifact } from "./canonical-shadow-score-artifact";
import { deriveCanonicalShadowScore, type CanonicalShadowScoreModel } from "./canonical-shadow-score";

const MODEL: CanonicalShadowScoreModel = {
  approvalStatus: "pending_luna",
  coverageRowWeights: { privacy_notice_availability: 1 },
  criticalPostureCaps: [],
  familyMaximumRiskPoints: { contradiction: 30 },
  minimumCoverageRatioForNoFindingPostureScore: 0.5,
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
    scanId: "00000000-0000-4000-8000-000000000001"
  });

  assert.equal(artifact.candidate.postureScore, 85);
  assert.deepEqual(artifact.comparison, {
    absoluteDelta: 13,
    contradictions: [],
    coverage: {
      absoluteDelta: 0,
      legacyScoreInputCoverageRatio: 1,
      reportInScopeRowCount: 1,
      reportUsableEvidenceRatio: 1,
      reportUsableRowCount: 1,
      status: "aligned"
    },
    delta: 13,
    status: "candidate_higher"
  });
  assert.equal(artifact.schemaVersion, "canonical-shadow-score-comparison.v3");
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
    scanId: "00000000-0000-4000-8000-000000000001"
  });

  assert.equal(artifact.comparison.delta, null);
  assert.equal(artifact.comparison.status, "candidate_withheld");
});

test("comparison artifact blocks cutover when legacy and report coverage semantics diverge", () => {
  const approvedCandidate = deriveCanonicalShadowScore({
    coverageRows: [{ assessmentStatus: "checked", evidenceState: "observed", rowId: "privacy_notice_availability" }],
    findings: [],
    model: { ...MODEL, approvalStatus: "approved_by_luna" }
  });
  const artifact = buildCanonicalShadowScoreComparisonArtifact({
    candidate: approvedCandidate,
    generatedAt: "2026-07-22T00:00:00.000Z",
    inputProjectionFingerprint: "sha256:fixture",
    legacy: {
      coverageConfidence: "high",
      coverageRatio: 1,
      reportInScopeRowCount: 30,
      reportUsableEvidenceRatio: 28 / 30,
      reportUsableRowCount: 28,
      score: 85,
      scoreKind: "gdpr_eprivacy_evidence",
      scoreSource: "wc01.regulatory-coverage-score",
      scoreVersion: "gdpr-eprivacy-evidence.legacy-v1"
    },
    scanId: "00000000-0000-4000-8000-000000000001"
  });

  assert.equal(approvedCandidate.cutoverEligible, true);
  assert.equal(artifact.cutoverEligible, false);
  assert.deepEqual(artifact.comparison.contradictions, [
    "legacy_score_coverage_diverges_from_report_usable_evidence"
  ]);
  assert.equal(artifact.comparison.coverage.status, "diverged");
});
