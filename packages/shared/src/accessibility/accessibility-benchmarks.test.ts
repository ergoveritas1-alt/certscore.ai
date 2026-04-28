import assert from "node:assert/strict";
import test from "node:test";
import { deriveBenchmarkLabel, formatBenchmarkExpectedRange, WEBAIM_MILLION_2026_HOME_PAGE_FAILURE_RATE } from "./accessibility-benchmarks";

test("deriveBenchmarkLabel returns correct labels", () => {
  assert.equal(deriveBenchmarkLabel(0, false), "better_than_typical");
  assert.equal(deriveBenchmarkLabel(5, false), "typical_or_better");
  assert.equal(deriveBenchmarkLabel(10, false), "typical_or_better");
  assert.equal(deriveBenchmarkLabel(11, false), "typical");
  assert.equal(deriveBenchmarkLabel(50, false), "typical");
  assert.equal(deriveBenchmarkLabel(51, false), "worse_than_typical");
  assert.equal(deriveBenchmarkLabel(100, false), "worse_than_typical");
  assert.equal(deriveBenchmarkLabel(101, false), "severe_outlier");
  assert.equal(deriveBenchmarkLabel(51, true), "severe_outlier");
  assert.equal(deriveBenchmarkLabel(1, true), "severe_outlier");
});

test("formatBenchmarkExpectedRange returns human-readable ranges", () => {
  assert.ok(formatBenchmarkExpectedRange("better_than_typical").includes("95.9%"));
  assert.ok(formatBenchmarkExpectedRange("typical_or_better").includes("1–10"));
  assert.ok(formatBenchmarkExpectedRange("typical").includes("11–50"));
  assert.ok(formatBenchmarkExpectedRange("worse_than_typical").includes("51–100"));
  assert.ok(formatBenchmarkExpectedRange("severe_outlier").includes(">100"));
});

test("WEBAIM_MILLION_2026_HOME_PAGE_FAILURE_RATE is 0.959", () => {
  assert.equal(WEBAIM_MILLION_2026_HOME_PAGE_FAILURE_RATE, 0.959);
});
