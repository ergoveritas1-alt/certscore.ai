import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzePairedEvidenceGrowth,
  type PairedEvidenceRow,
} from "./paired-evidence-growth.js";

function row(index: number, options: {
  complete?: boolean;
  cmp?: boolean;
  count?: number;
  domainPrefix?: string;
} = {}): PairedEvidenceRow {
  const complete = options.complete ?? true;
  const cmp = options.cmp ?? index % 2 === 0;
  const count = options.count ?? 10;
  const region = {
    evidenceComplete: complete,
    projectionComplete: complete,
    cmpObserved: cmp,
    cookieDetailCount: count,
    checklistObservedCount: count / 2,
    thirdPartyNonEssentialStorageCount: count / 4,
  };
  return {
    domain: `${options.domainPrefix ?? "site"}-${index}.example`,
    rank: index * 100 + 1,
    california: { ...region },
    eu_ie: { ...region },
  };
}

test("does not label a rank-adjusted prevalence shift as evidence loss", () => {
  const baseline = Array.from({ length: 200 }, (_, index) => row(index));
  const current = Array.from({ length: 76 }, (_, index) => row(index + 50, {
    count: 7,
    cmp: index % 3 === 0,
    domainPrefix: "current",
  }));
  const report = analyzePairedEvidenceGrowth({ baseline, current, bootstrapIterations: 300 });

  assert.equal(report.verdict, "signal_prevalence_shift_without_retention_loss");
  assert.equal(report.regions.california.currentCoverage.evidenceCompleteRate, 1);
  assert.equal(report.regions.eu_ie.currentCoverage.projectionCompleteRate, 1);
  assert.equal(report.summary.matchedDomains, 0);
  assert.ok(report.summary.materiallyLowMetricsAcrossBothRegions >= 2);
});

test("fails the evidence pipeline gate when retained payload completeness drops", () => {
  const baseline = Array.from({ length: 200 }, (_, index) => row(index));
  const current = Array.from({ length: 80 }, (_, index) => row(index, {
    complete: index >= 24,
    domainPrefix: "current",
  }));
  const report = analyzePairedEvidenceGrowth({ baseline, current, bootstrapIterations: 200 });

  assert.equal(report.verdict, "evidence_pipeline_shortfall");
  assert.equal(report.regions.california.currentCoverage.evidenceCompleteRate, 0.7);
  assert.equal(report.regions.eu_ie.currentCoverage.projectionCompleteRate, 0.7);
});

test("rank reweighting prevents a known rank-mix change from becoming a false alert", () => {
  const baseline = Array.from({ length: 200 }, (_, index) => row(index, {
    count: index < 100 ? 20 : 5,
  }));
  const current = Array.from({ length: 60 }, (_, index) => row(index + 120, {
    count: 5,
    domainPrefix: "current",
  }));
  const report = analyzePairedEvidenceGrowth({ baseline, current, bootstrapIterations: 300 });

  assert.equal(report.verdict, "within_rank_adjusted_expectation");
  const cookies = report.regions.california.metrics.cookieDetailCount;
  assert.ok((cookies.currentToBaselineRatio ?? 1) < 0.5);
  assert.ok(Math.abs((cookies.currentToRankAdjustedExpectedRatio ?? 0) - 1) < 0.05);
  assert.equal(cookies.belowRankAdjustedInterval, false);
});

test("fails closed for a cohort too small to support a production conclusion", () => {
  const baseline = Array.from({ length: 200 }, (_, index) => row(index));
  const current = Array.from({ length: 12 }, (_, index) => row(index, { domainPrefix: "current" }));
  const report = analyzePairedEvidenceGrowth({ baseline, current, bootstrapIterations: 100 });

  assert.equal(report.verdict, "insufficient_sample");
});
