import assert from "node:assert/strict";
import test from "node:test";
import { preliminarySiteInventoryMetrics } from "./preliminary-site-inventory-metrics";
import { runtimePreviewFixture } from "./pre-consent-runtime-preview-fixture";

test("checkpoint counts populate compatible fields without inventing classifications or frame totals", () => {
  const metrics = preliminarySiteInventoryMetrics({ ...runtimePreviewFixture, summary: { ...runtimePreviewFixture.summary, cookieCount: 40 }, truncated: { ...runtimePreviewFixture.truncated, cookies: true } })!;
  assert.equal(metrics[0]!.value, 40, "Uses retained total, not the bounded cookie sample");
  assert.equal(metrics[1]!.value, 4);
  assert.equal(metrics[1]!.lowerBound, true, "Third-party traffic is not all traffic");
  assert.equal(metrics[2]!.value, null, "Embed groups do not count frame instances");
  assert.ok(metrics.every(metric => metric.counts === undefined));
  assert.equal(preliminarySiteInventoryMetrics({ ...runtimePreviewFixture, runtimeCoverage: { status: "limited_none", limitationKeys: [] } }), null);
});
