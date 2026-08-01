import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ScanSubmissionPendingIndicator,
  ScanSubmitProgressBar,
  describeScanProgressPhase,
  getScanProgressTarget
} from "./scan-submit-progress";

test("scan submission remains neutral until the server returns a scan status", () => {
  const html = renderToStaticMarkup(<ScanSubmissionPendingIndicator />);

  assert.match(html, /Getting things ready/);
  assert.match(html, /0s elapsed/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="0"/);
  assert.doesNotMatch(html, /Building your report/);
  assert.doesNotMatch(html, /Finishing your report/);
  assert.doesNotMatch(html, /Checking policies/);
  assert.doesNotMatch(html, /w-1\/3/);
});

test("server scan status determines the active progress phase", () => {
  const html = renderToStaticMarkup(
    <ScanSubmitProgressBar
      active
      nowMs={120_000}
      scanStatus="running"
      startedAtMs={0}
    />
  );

  assert.match(html, /Scanning website/);
  assert.match(html, /Capturing page evidence and website signals/);
  assert.doesNotMatch(html, /Taking longer than usual/);
  assert.doesNotMatch(html, /Building your report/);
});

test("canonical progress milestones override coarse scan status", () => {
  const reviewHtml = renderToStaticMarkup(
    <ScanSubmitProgressBar active nowMs={40_000} progressStage="review" scanStatus="completed" startedAtMs={0} />
  );
  const reportHtml = renderToStaticMarkup(
    <ScanSubmitProgressBar active nowMs={42_000} progressStage="report" scanStatus="completed" startedAtMs={0} />
  );
  assert.match(reviewHtml, /Reviewing scan signals/);
  assert.match(reportHtml, /Preparing your report/);
});

test("scan-stage target advances linearly without asymptotically stalling", () => {
  assert.equal(getScanProgressTarget({ currentStep: 0, elapsedMs: 0, estimatedDurationMs: 36_000, reportReady: false }), 0);
  const preparing = getScanProgressTarget({ currentStep: 0, elapsedMs: 5_400, estimatedDurationMs: 36_000, reportReady: false });
  const early = getScanProgressTarget({ currentStep: 1, elapsedMs: 13_000, estimatedDurationMs: 36_000, reportReady: false });
  const late = getScanProgressTarget({ currentStep: 1, elapsedMs: 46_000, estimatedDurationMs: 36_000, reportReady: false });
  assert.ok(preparing > 0 && preparing < 24);
  assert.ok(early > 25 && early < late);
  assert.equal(late, 49);
  assert.equal(getScanProgressTarget({ currentStep: 2, elapsedMs: 46_000, estimatedDurationMs: 36_000, reportReady: false }), 74);
  const reporting = getScanProgressTarget({ currentStep: 3, elapsedMs: 46_000, estimatedDurationMs: 36_000, reportReady: false });
  assert.ok(reporting > 75 && reporting < 96);
  assert.equal(getScanProgressTarget({ currentStep: 3, elapsedMs: 90_000, estimatedDurationMs: 36_000, reportReady: false }), 96);
});

test("scan progress communicates a conservative milestone estimate", () => {
  const html = renderToStaticMarkup(
    <ScanSubmitProgressBar
      active
      nowMs={120_000}
      progressEstimate={{ estimatedDurationMs: 36_000, modeLabel: "standard scan" }}
      startedAtMs={0}
    />
  );

  assert.match(html, /aria-valuenow="0"/);
  assert.match(html, /Taking longer than usual/);
  assert.match(html, /Scan/);
  assert.match(html, /role="progressbar"/);
});

test("scan progress reports a delayed state after twice the estimate", () => {
  const html = renderToStaticMarkup(
    <ScanSubmitProgressBar
      active
      nowMs={120_001}
      progressEstimate={{ estimatedDurationMs: 36_000, modeLabel: "standard scan" }}
      startedAtMs={1}
    />
  );

  assert.match(html, /taking longer than usual/);
  assert.match(html, /120s elapsed/);
});

test("late estimated phase remains evidence processing rather than claiming report readiness", () => {
  assert.equal(
    describeScanProgressPhase({ elapsedMs: 90_000, estimatedDurationMs: 36_000 }),
    "processing retained evidence"
  );
});

test("estimated timing gives scan capture the longest phase", () => {
  const estimatedDurationMs = 40_000;

  assert.equal(
    describeScanProgressPhase({ elapsedMs: 11_999, estimatedDurationMs }),
    "preparing scanner"
  );
  assert.equal(
    describeScanProgressPhase({ elapsedMs: 12_000, estimatedDurationMs }),
    "capturing page evidence"
  );
  assert.equal(
    describeScanProgressPhase({ elapsedMs: 27_199, estimatedDurationMs }),
    "capturing page evidence"
  );
  assert.equal(
    describeScanProgressPhase({ elapsedMs: 27_200, estimatedDurationMs }),
    "checking policies"
  );
  assert.equal(
    describeScanProgressPhase({ elapsedMs: 33_599, estimatedDurationMs }),
    "checking policies"
  );
  assert.equal(
    describeScanProgressPhase({ elapsedMs: 33_600, estimatedDurationMs }),
    "processing retained evidence"
  );
});
