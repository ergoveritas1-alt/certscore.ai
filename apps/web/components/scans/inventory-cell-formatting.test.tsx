import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { InventoryConfidenceDots, InventoryPurposeChip } from "./inventory-cell-formatting";

test("parent and child confidence share dots without losing vendor-match precision", () => {
  for (const [score, label, count] of [[0.92, "high", 3], [0.7, "medium", 2], [0.5, "low", 1]] as const) {
    const child = renderToStaticMarkup(<InventoryConfidenceDots confidence={score} description={`Vendor match confidence: ${score * 100}%`} />);
    const parent = renderToStaticMarkup(<InventoryConfidenceDots confidence={label} />);
    assert.equal((child.match(/bg-slate-500/g) ?? []).length, count);
    assert.equal((parent.match(/bg-slate-500/g) ?? []).length, count);
    assert.match(child, /Vendor match confidence:/);
  }
  assert.equal((renderToStaticMarkup(<InventoryConfidenceDots confidence="Not retained" />).match(/bg-slate-500/g) ?? []).length, 0);
});

test("purpose badges preserve retained purpose rather than inheriting parent classification", () => {
  const html = renderToStaticMarkup(<InventoryPurposeChip purpose="infrastructure" />);
  assert.match(html, /rounded-md/);
  assert.match(html, /title="infrastructure"/);
  assert.doesNotMatch(html, /CDN/);
});
