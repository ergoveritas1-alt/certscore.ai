import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GpcActivityComparison } from "./gpc-activity-comparison";
import { gpcActivityComparisonFixture } from "../../../../packages/certscore-contracts/src/test-fixtures/gpc-activity-comparison";

test("measured requests and duration appear directly, without a response claim", () => {
  const comparison = gpcActivityComparisonFixture();
  const html = renderToStaticMarkup(<GpcActivityComparison comparison={comparison} />);
  assert.match(html, /Baseline → GPC/);
  assert.match(html, /Requests observed during the first second after each page loaded\./);
  assert.doesNotMatch(html, /document commit/);
  assert.doesNotMatch(html, /does not describe later activity/);
  assert.match(html, /Advertising \/ marketing/);
  assert.match(html, /Analytics \/ session replay/);
  assert.doesNotMatch(html, /<details|honored|suppressed|compliant|%/i);
  comparison.activity.advertisingMarketing = { baselineRequests: 0, gpcRequests: 0, baselineServices: 0, gpcServices: 0 };
  assert.doesNotMatch(renderToStaticMarkup(<GpcActivityComparison comparison={comparison} />), /NaN|%|suppressed/);
  for (const durationMs of [250, 500, 3000, 5000, 5172, 8500, 15000] as const) {
    comparison.durationMs = durationMs;
    const duration = durationMs < 1000 ? `${durationMs} milliseconds` : `${durationMs / 1000} seconds`;
    assert.ok(renderToStaticMarkup(<GpcActivityComparison comparison={comparison} />).includes(`Requests observed during the first ${duration} after each page loaded.`));
  }
  assert.equal(renderToStaticMarkup(<GpcActivityComparison />), "");
});

test("GPC product paired collection uses a neutral keyboard-native expander alongside the request table", async () => {
  const { collectionPairFixture, collectionFixtureSource } = await import("../../../../packages/certscore-scan-core/src/test-fixtures/gpc-collection-pair.cases");
  const { buildGpcActivityComparison } = await import("../../../../packages/certscore-scan-core/src/gpc-activity-comparison");
  const pair = collectionPairFixture();
  const { buildGpcProductionObservation } = await import("../../../../packages/certscore-scan-core/src/gpc-production-observation");
  const gpc = collectionFixtureSource(pair.gpc);
  const comparison = buildGpcActivityComparison({ scanId: pair.gpc.scanId, baseline: collectionFixtureSource(pair.baseline), gpc,
    observation: buildGpcProductionObservation({ scanId: pair.gpc.scanId, source: gpc }) });
  assert.ok(comparison?.collectionComparison);
  const html = renderToStaticMarkup(<GpcActivityComparison comparison={comparison} />);
  assert.match(html, /<details/); assert.match(html, /<summary/);
  assert.match(html, /successful advertising collection/); assert.match(html, /zero does not establish absence/);
  assert.match(html, /Without GPC/); assert.match(html, /With GPC/);
  assert.doesNotMatch(html, /xcid|fixture-loader|deduct|compliance tick|role="alert"/i);
});
