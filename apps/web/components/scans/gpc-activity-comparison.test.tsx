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
