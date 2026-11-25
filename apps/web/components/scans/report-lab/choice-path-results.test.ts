import assert from "node:assert/strict";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { CompactRejectPathCard } from "../executive-summary-card";
import { ChoicePathResults } from "./shadow-scan-report";
import { ChoicePathResults as ChoicePathResultsO2 } from "../../scanso2/report-lab/shadow-scan-report";
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


test("path execution success stays independent of the finding and consent decision", () => {
  const execution = { policyVersion: "choice_path_execution.v1", status: "succeeded",
    clickCompleted: true, observationCompleted: true, consentConfirmed: false };
  const html = render({ ...path, afterClickCoverage: "complete", execution });
  assert.match(html, /Consent unconfirmed/);
  assert.match(html, /data-path-execution-status="succeeded"/);
  assert.match(html, /Consent-state confirmation: not recorded/);
  assert.doesNotMatch(html, /Succeeded with confirmation/);
  const confirmed = render({ ...path, state: "no_issue_observed", registrationConfirmed: true,
    execution: { ...execution, status: "succeeded_with_confirmation", consentConfirmed: true } });
  assert.match(confirmed, /Succeeded with confirmation/);
  const limited = render({ ...path, afterClickCoverage: "partial",
    execution: { ...execution, status: "limited", observationCompleted: false } });
  assert.match(limited, /Limited/);
  assert.doesNotMatch(limited, /Succeeded/);
});

for (const [surface, component] of [["scans", ChoicePathResults], ["scanso2", ChoicePathResultsO2]] as const) {
  test(`${surface}: both action cards show canonical completion independently of registration`, () => {
    const execution = { policyVersion: "choice_path_execution.v1", status: "succeeded",
      clickCompleted: true, observationCompleted: true, consentConfirmed: false };
    const report = { rejectPath: { ...path, execution }, acceptPath: { ...path, execution, label: "After-Accept observation recorded" },
      choicePathComparison: null } as unknown as ShadowReportData;
    const html = renderToStaticMarkup(createElement(component, { report }));
    assert.equal((html.match(/data-path-execution-status="succeeded"/g) ?? []).length, 2);
    assert.equal((html.match(/Consent-state confirmation: not recorded/g) ?? []).length, 2);
    assert.doesNotMatch(html, /Succeeded with confirmation/);
  });
}
