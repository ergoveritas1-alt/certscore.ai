import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalShadowScoreComparisonArtifact } from "./canonical-shadow-score-artifact";
import { summarizeCanonicalShadowScoreCohort } from "./canonical-shadow-score-cohort";
import {
  deriveCanonicalShadowScore,
  type CanonicalShadowCoverageRow,
  type CanonicalShadowScoreFinding,
  type CanonicalShadowScoreModel
} from "./canonical-shadow-score";
import { buildCanonicalShadowScoreProjectionComponents } from "./canonical-shadow-score-projection-fingerprint";

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
  inputProjectionFingerprint?: string;
  legacyScore: number;
  region: string | null;
  scanId: string;
  scanSource?: string;
  severity?: "high" | "medium" | "low";
}) {
  const coverageRows: CanonicalShadowCoverageRow[] = input.coverageLimited
      ? [{ assessmentStatus: "coverage_limitation", evidenceState: "not_testable", rowId: "privacy_notice_availability" }]
      : [{ assessmentStatus: "checked", evidenceState: "observed", rowId: "privacy_notice_availability" }];
  const findings: CanonicalShadowScoreFinding[] = input.severity
      ? [{ family: "contradiction", findingId: `finding_${input.scanId}`, severity: input.severity }]
      : [];
  const candidate = deriveCanonicalShadowScore({
    coverageRows,
    findings,
    model: MODEL
  });
  return buildCanonicalShadowScoreComparisonArtifact({
    candidate,
    context: {
      comparisonGroupKey: "sha256:same-hostname",
      comparisonTargetKey: "sha256:same-requested-url",
      region: input.region,
      scanSource: input.scanSource ?? "lambda"
    },
    generatedAt: "2026-07-22T00:00:00.000Z",
    inputProjectionFingerprint: input.inputProjectionFingerprint ?? `sha256:${input.scanId}`,
    inputProjectionComponents: buildCanonicalShadowScoreProjectionComponents({ coverageRows, findings }),
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
  assert.equal(summary.calibration.sampleSufficient, false);
  assert.equal(summary.calibration.upperTail.count, 0);
  assert.equal(summary.calibration.lowerTail.count, 0);
  assert.equal(summary.calibration.upperTail.maximumRate, 0.02);
  assert.equal(summary.calibration.lowerTail.maximumRate, 0.02);
  assert.equal(summary.calibration.pass, false);
  assert.equal(summary.calibration.percentiles.p50, 70);
  assert.equal(summary.comparison.comparableCount, 2);
  assert.equal(summary.crossRegion.comparedGroupCount, 1);
  assert.equal(summary.crossRegion.maximumScoreRange, 15);
  assert.equal(summary.crossRegion.ranges[0]?.regionCount, 2);
  assert.equal(summary.crossRegion.ranges[0]?.scanSource, "lambda");
  assert.equal(summary.crossSource.comparedGroupCount, 0);
  assert.equal(summary.cutoverEligibleCount, 0);
});

test("cohort calibration gate measures both score tails without normalizing the scores", () => {
  const artifacts = Array.from({ length: 100 }, (_, index) => artifact({
    legacyScore: 50,
    region: null,
    scanId: `scan-${index}`,
    severity: index === 0 ? "high" : index < 6 ? "medium" : undefined
  }));
  const summary = summarizeCanonicalShadowScoreCohort(artifacts);

  assert.equal(summary.calibration.sampleSufficient, true);
  assert.equal(summary.calibration.upperTail.rate, 0.94);
  assert.equal(summary.calibration.lowerTail.rate, 0);
  assert.equal(summary.calibration.pass, false);
  assert.equal(summary.calibration.scoreBuckets["61-70"], 1);
  assert.equal(summary.calibration.scoreBuckets["81-90"], 5);
  assert.equal(summary.calibration.scoreBuckets["91-100"], 94);
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

test("cohort summary compares regional Lambda scan-from values as one source family", () => {
  const summary = summarizeCanonicalShadowScoreCohort([
    artifact({ legacyScore: 72, region: "eu-central-1", scanId: "scan-a", scanSource: "eu_de", severity: "high" }),
    artifact({ legacyScore: 80, region: "eu-west-1", scanId: "scan-b", scanSource: "eu_ie", severity: "high" })
  ]);

  assert.equal(summary.crossRegion.comparedGroupCount, 1);
  assert.equal(summary.crossRegion.maximumScoreRange, 0);
  assert.equal(summary.crossRegion.ranges[0]?.scanSource, "lambda");
  assert.equal(summary.crossSource.comparedGroupCount, 0);
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

test("cohort summary compares identical canonical inputs across sources with unknown browser geography", () => {
  const summary = summarizeCanonicalShadowScoreCohort([
    artifact({
      inputProjectionFingerprint: "sha256:identical",
      legacyScore: 72,
      region: "eu-west-1",
      scanId: "scan-a",
      scanSource: "eu_ie",
      severity: "high"
    }),
    artifact({
      inputProjectionFingerprint: "sha256:identical",
      legacyScore: 72,
      region: null,
      scanId: "scan-b",
      scanSource: "local_extension",
      severity: "high"
    })
  ]);

  assert.equal(summary.crossSource.comparedGroupCount, 0);
  assert.equal(summary.equivalentInputCrossSource.comparedGroupCount, 1);
  assert.equal(summary.equivalentInputCrossSource.maximumScoreRange, 0);
  assert.equal(summary.equivalentInputCrossSource.ranges[0]?.hasUnknownRegion, true);
});

test("cohort summary does not compare different requested URLs on the same hostname", () => {
  const first = artifact({ legacyScore: 72, region: "eu-west-1", scanId: "scan-a", severity: "medium" });
  const second = artifact({ legacyScore: 80, region: "us-west-2", scanId: "scan-b", severity: "high" });
  second.context.comparisonTargetKey = "sha256:other-requested-url";

  const summary = summarizeCanonicalShadowScoreCohort([first, second]);
  assert.equal(summary.crossRegion.comparedGroupCount, 0);
  assert.equal(summary.crossSource.comparedGroupCount, 0);
});
