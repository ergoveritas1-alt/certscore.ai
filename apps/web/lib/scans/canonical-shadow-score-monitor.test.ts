import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizeStoredCanonicalShadowComparisons,
  type StoredCanonicalShadowComparisonMetric
} from "./canonical-shadow-score-monitor";

function metric(overrides: Partial<StoredCanonicalShadowComparisonMetric>): StoredCanonicalShadowComparisonMetric {
  return {
    candidateCoverageRatio: 1,
    candidateScore: 80,
    comparisonGroupKey: "sha256:group",
    comparisonTargetKey: "sha256:target",
    contradictionTypes: [],
    generatedAt: "2026-07-22T00:00:00.000Z",
    legacyCoverageRatio: 1,
    legacyScore: 75,
    modelVersion: "candidate-v3",
    region: "eu-west-1",
    reportUsableEvidenceRatio: 1,
    scanId: "scan-1",
    scanSource: "lambda",
    scoreDelta: 5,
    withholdingReasons: [],
    ...overrides
  };
}

test("persisted monitor summarizes drift, contradictions, withholding, and cross-region variance", () => {
  const summary = summarizeStoredCanonicalShadowComparisons([
    metric({ scanId: "scan-1" }),
    metric({ candidateScore: 70, region: "us-west-2", scanId: "scan-2", scoreDelta: -5 }),
    metric({
      candidateScore: null,
      comparisonGroupKey: "sha256:other",
      contradictionTypes: ["coverage_diverged"],
      region: "eu-central-1",
      scanId: "scan-3",
      scoreDelta: null,
      withholdingReasons: ["coverage_below_threshold"]
    })
  ]);

  assert.equal(summary.sampleCount, 3);
  assert.equal(summary.withheldRate, 0.3333);
  assert.equal(summary.contradictions.rate, 0.3333);
  assert.equal(summary.comparison.absoluteDeltaP95, 5);
  assert.equal(summary.crossRegion.maximumScoreRange, 10);
  assert.equal(summary.crossRegion.ranges[0]?.scanSource, "lambda");
  assert.equal(summary.crossSource.comparedGroupCount, 0);
  assert.deepEqual(summary.withholdingReasons, ["coverage_below_threshold"]);
});

test("persisted monitor does not compare repeats from only one region", () => {
  const summary = summarizeStoredCanonicalShadowComparisons([
    metric({ scanId: "scan-1" }),
    metric({ candidateScore: 70, scanId: "scan-2" })
  ]);

  assert.equal(summary.crossRegion.comparedGroupCount, 0);
  assert.equal(summary.crossRegion.maximumScoreRange, null);
});

test("persisted monitor reports source variance without calling it region variance", () => {
  const summary = summarizeStoredCanonicalShadowComparisons([
    metric({ scanId: "scan-1" }),
    metric({ candidateScore: 70, scanId: "scan-2", scanSource: "browser_extension" })
  ]);

  assert.equal(summary.crossRegion.comparedGroupCount, 0);
  assert.equal(summary.crossSource.comparedGroupCount, 1);
  assert.equal(summary.crossSource.maximumScoreRange, 10);
  assert.equal(summary.crossSource.ranges[0]?.region, "eu-west-1");
  assert.equal(summary.crossSource.ranges[0]?.sourceCount, 2);
});

test("persisted monitor never compares different requested URLs on the same hostname", () => {
  const summary = summarizeStoredCanonicalShadowComparisons([
    metric({ scanId: "scan-1" }),
    metric({ candidateScore: 70, comparisonTargetKey: "sha256:other-target", region: "us-west-2", scanId: "scan-2" })
  ]);

  assert.equal(summary.crossRegion.comparedGroupCount, 0);
  assert.equal(summary.crossSource.comparedGroupCount, 0);
});
