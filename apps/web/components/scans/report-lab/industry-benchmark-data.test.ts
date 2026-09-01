import assert from "node:assert/strict";
import test from "node:test";
import {
  describeIndustryBenchmarkDifference,
  getIndustryBenchmark,
  INDUSTRY_BENCHMARK_DATA,
} from "./industry-benchmark-data";

test("describes site values relative to the industry average", () => {
  assert.equal(describeIndustryBenchmarkDifference(8, 5.4), "2.6 above industry avg");
  assert.equal(describeIndustryBenchmarkDifference(1, 4.2), "3.2 below industry avg");
  assert.equal(describeIndustryBenchmarkDifference(2, 2), "At industry average");
});

test("ships the complete evidence-corpus benchmark lookup", () => {
  assert.equal(INDUSTRY_BENCHMARK_DATA.rows.length, 10);
  assert.equal(
    INDUSTRY_BENCHMARK_DATA.rows.reduce((total, row) => total + row.sampleSize, 0),
    INDUSTRY_BENCHMARK_DATA.allIndustries.sampleSize,
  );
  assert.deepEqual(getIndustryBenchmark("News & Media (Digital Journalism)"), {
    averageNonEssentialCookiesStorage: 2.8,
    averageNonEssentialRequests: 5.7,
    label: "News & Media",
    matchedIndustry: true,
    sampleSize: 983,
    slug: "media",
  });
});
