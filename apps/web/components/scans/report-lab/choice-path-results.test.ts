import assert from "node:assert/strict";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { CompactRejectPathCard } from "../executive-summary-card";
import { ChoicePathResults } from "./shadow-scan-report";
import type { ShadowReportData } from "./shadow-report-data";

// The Node/tsx test runtime uses classic JSX; Next supplies the automatic runtime.
(globalThis as typeof globalThis & { React: typeof React }).React = React;

const path = {
  label: "After-Reject observation recorded", note: "The Reject control was clicked. Two requests were recorded.",
  state: "incomplete", scoreEffect: "none", evidenceRows: [], timelineEvents: [],
  observationWindowMs: 3000, resolverMethod: null, registrationConfirmed: false,
};
function render(rejectPath: unknown) {
  return renderToStaticMarkup(createElement(ChoicePathResults, {
    report: { rejectPath, acceptPath: null, choicePathComparison: null } as ShadowReportData,
  }));
}

test("a recorded after-click observation remains visible without promoting the decision", () => {
  const html = render({ ...path, afterClickCoverage: "complete" });
  assert.match(html, /Observation recorded/);
  assert.match(html, /Two requests were recorded/);
  assert.match(html, /Consent-state confirmation: not recorded/);
  assert.match(html, /data-reject-path-state="incomplete"/);
  assert.doesNotMatch(html, /Reject confirmed|No issue observed|Issue observed/);
});

test("partial capture remains visible and explicitly partial; an absent capture is not invented", () => {
  assert.match(render({ ...path, afterClickCoverage: "partial" }), /Partial observation/);
  assert.equal(render(path), "");
});

test("a canonical tracking review does not imply confirmed refusal", () => {
  const html = render({ ...path, state: "review_signal", label: "Tracking observed after Reject" });
  assert.match(html, /Tracking observed after Reject/);
  assert.match(html, /Consent-state confirmation: not recorded/);
  assert.doesNotMatch(html, /Reject confirmed/);
});


test("the executive Reject card shows the observed review evidence", () => {
  const html = renderToStaticMarkup(createElement(CompactRejectPathCard, { projection: {
    ...path, state: "review_signal", scoreEffect: "none", label: "Tracking observed after Reject",
    note: "Two analytics requests began after Reject.",
  } }));
  assert.match(html, /Tracking observed after Reject/);
  assert.match(html, /Two analytics requests began after Reject/);
  assert.doesNotMatch(html, /Reject confirmed/);
});
