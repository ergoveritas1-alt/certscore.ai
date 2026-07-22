import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalShadowScoreComparisonArtifact } from "./canonical-shadow-score-artifact";
import { summarizeCanonicalShadowScoreCohort } from "./canonical-shadow-score-cohort";
import { deriveCanonicalShadowScore, type CanonicalShadowScoreModel } from "./canonical-shadow-score";

const MODEL: CanonicalShadowScoreModel = {
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
};

function artifact(input: {
  coverageLimited?: boolean;
  legacyScore: number;
  region: string;
  scanId: string;
  scanSource?: string;
  severity?: "high" | "medium" | "low";
}) {
  const candidate = deriveCanonicalShadowScore({
    coverageRows: input.coverageLimited
      ? [{ assessmentStatus: "coverage_limitation", evidenceState: "not_testable", rowId: "privacy_notice_availability" }]
      : [{ assessmentStatus: "checked", evidenceState: "observed", rowId: "privacy_notice_availability" }],
    findings: input.severity
      ? [{ family: "contradiction", findingId: `finding_${input.scanId}`, severity: input.severity }]
      : [],
    model: MODEL
  });
  return buildCanonicalShadowScoreComparisonArtifact({
    candidate,
    context: { comparisonGroupKey: "sha256:same-target", region: input.region, scanSource: input.scanSource ?? "lambda" },
    generatedAt: "2026-07-22T00:00:00.000Z",
    inputProjectionFingerprint: `sha256:${input.scanId}`,
    legacy: {
      coverageConfidence: "high",
      coverageRatio: 1,
      reportInScopeRowCount: 1,
      reportUsableEvidenceRatio: 1,
      reportUsableRowCount: 1,
      score: input.legacyScore,
      scoreKind: "gdpr_eprivacy_evidence",
      scoreSource: "wc01.regulatory-coverage-score",
      scoreVersion: "gdpr-eprivacy-evidence.legacy-v1"
    },
    scanId: input.scanId
  });
}

test("cohort summary reports score drift, withholding, contradictions, and cross-region variance", () => {
  const summary = summarizeCanonicalShadowScoreCohort([
    artifact({ legacyScore: 72, region: "eu-west-1", scanId: "scan-a", severity: "medium" }),
    artifact({ legacyScore: 80, region: "us-west-2", scanId: "scan-b", severity: "high" }),
    artifact({ coverageLimited: true, legacyScore: 65, region: "eu-central-1", scanId: "scan-c" })
  ]);

  assert.equal(summary.sampleCount, 3);
  assert.equal(summary.scoredCount, 2);
  assert.equal(summary.withheldCount, 1);
  assert.equal(summary.withheldRate, 0.3333);
  assert.equal(summary.comparison.comparableCount, 2);
  assert.equal(summary.crossRegion.comparedGroupCount, 1);
  assert.equal(summary.crossRegion.maximumScoreRange, 15);
  assert.equal(summary.crossRegion.ranges[0]?.regionCount, 2);
  assert.equal(summary.crossRegion.ranges[0]?.scanSource, "lambda");
  assert.equal(summary.crossSource.comparedGroupCount, 0);
  assert.equal(summary.cutoverEligibleCount, 0);
});

test("cohort summary does not label same-region repeats as cross-region evidence", () => {
  const summary = summarizeCanonicalShadowScoreCohort([
    artifact({ legacyScore: 72, region: "eu-west-1", scanId: "scan-a", severity: "medium" }),
    artifact({ legacyScore: 80, region: "eu-west-1", scanId: "scan-b", severity: "high" })
  ]);

  assert.equal(summary.crossRegion.comparedGroupCount, 0);
  assert.equal(summary.crossRegion.maximumScoreRange, null);
  assert.deepEqual(summary.crossRegion.ranges, []);
});

test("cohort summary separates cross-source variance from cross-region variance", () => {
  const summary = summarizeCanonicalShadowScoreCohort([
    artifact({ legacyScore: 72, region: "eu-west-1", scanId: "scan-a", scanSource: "lambda", severity: "medium" }),
    artifact({ legacyScore: 80, region: "eu-west-1", scanId: "scan-b", scanSource: "browser_extension", severity: "high" })
  ]);

  assert.equal(summary.crossRegion.comparedGroupCount, 0);
  assert.equal(summary.crossSource.comparedGroupCount, 1);
  assert.equal(summary.crossSource.maximumScoreRange, 15);
  assert.equal(summary.crossSource.ranges[0]?.region, "eu-west-1");
  assert.equal(summary.crossSource.ranges[0]?.sourceCount, 2);
});
