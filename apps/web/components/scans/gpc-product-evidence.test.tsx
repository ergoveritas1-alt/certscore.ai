import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GpcProductEvidence } from "./gpc-product-evidence";
import { gpcProductFixture } from "../../lib/scans/test-fixtures/gpc-product";

test("main-document CMP comparison exposes scope beside settings without honoring or scoring claims", () => {
  const {cmpStateComparison: original} = gpcProductFixture();
  assert.ok(original);
  const comparison = {...original, contractVersion: "certscore.gpc-cmp-state-comparison.v2" as const, scope: "main_document" as const};
  const html = renderToStaticMarkup(<GpcProductEvidence comparison={comparison} />);
  assert.match(html, /Sale opt-out/);
  assert.match(html, /Sharing opt-out/);
  assert.match(html, /Main-document CMP snapshots\. Worker and child-frame signal delivery is not established\./);
  assert.match(html, /A difference does not establish that GPC caused it/);
  assert.doesNotMatch(html, /honored|compliant|deduction|points/i);
  assert.doesNotMatch(renderToStaticMarkup(<GpcProductEvidence comparison={original} />), /Main-document CMP snapshots/);
});
