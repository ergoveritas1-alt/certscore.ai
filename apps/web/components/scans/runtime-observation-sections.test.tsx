import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RuntimeInventorySummaryCard } from "./runtime-observation-sections";

test("inventory header owns the primary CTA and hides details until expanded", () => {
  const render = (initiallyOpen: boolean) => renderToStaticMarkup(
    <RuntimeInventorySummaryCard eyebrow="Resource inventory" heading="Resources" inventory={[]} detailsLabel="Resource details" detailsHint="Evidence legend" initiallyOpen={initiallyOpen} action={<button>Copy inventory</button>}>
      <table><tbody><tr><td>Retained resource</td></tr></tbody></table>
    </RuntimeInventorySummaryCard>,
  );
  const closed = render(false);
  assert.match(closed, /data-density="comfortable"><section aria-label="Resource inventory"/);
  assert.match(closed, /<section[^>]+aria-label="Resource details"[^>]+hidden=""/);
  assert.doesNotMatch(closed, /bg-sky-50\/60 px-4 py-4/);
  assert.doesNotMatch(closed, /border-y border-zinc-200|mt-8 border-t/);
  assert.match(closed, /aria-expanded="false"/);
  assert.match(closed, /hidden=""/);
  assert.doesNotMatch(closed, /4 domains/);
  assert.ok(closed.indexOf('hidden=""') < closed.indexOf("Copy inventory"));
  assert.ok(closed.indexOf("Evidence legend") < closed.indexOf("Copy inventory"));
  assert.ok(closed.indexOf("Show details") < closed.indexOf("Copy inventory"));
  const open = render(true);
  assert.match(open, /aria-expanded="true"/);
  assert.match(open, /Hide details/);
  assert.doesNotMatch(open, /hidden=""/);
  assert.match(open, /Evidence legend/);
});
