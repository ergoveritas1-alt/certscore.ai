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
  assert.match(html, /First 1,000 ms/);
  assert.match(html, /Advertising \/ marketing/);
  assert.match(html, /Analytics \/ session replay/);
  assert.doesNotMatch(html, /<details|honored|suppressed|compliant|%/i);
  comparison.activity.advertisingMarketing = { baselineRequests: 0, gpcRequests: 0, baselineServices: 0, gpcServices: 0 };
  assert.doesNotMatch(renderToStaticMarkup(<GpcActivityComparison comparison={comparison} />), /NaN|%|suppressed/);
  assert.equal(renderToStaticMarkup(<GpcActivityComparison />), "");
});
