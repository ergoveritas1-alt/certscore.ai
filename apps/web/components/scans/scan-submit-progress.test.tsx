import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  clampScanProgressHandoffValue,
  ScanSubmissionPendingIndicator,
  ScanSubmitProgressBar,
  SCAN_PROGRESS_HALF_LIFE_MS,
  describeScanProgressPhase,
  getNextScanProgressValue
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

test("the full progress bar can begin from the compact submission handoff", () => {
  const html = renderToStaticMarkup(
    <ScanSubmitProgressBar
      active
      initialProgressValue={12.5}
      nowMs={12_000}
      progressStage="scan"
      scanStatus="running"
      startedAtMs={0}
    />
  );

  assert.match(html, /aria-valuenow="12.5"/);
  assert.match(html, /width:12.5%/);
});

test("submission handoff remains inside Prepare instead of snapping to the Scan boundary", () => {
  assert.equal(clampScanProgressHandoffValue({ currentStep: 0, reportReady: false, value: 12.5 }), 12.5);
  assert.equal(clampScanProgressHandoffValue({ currentStep: 0, reportReady: false, value: 40 }), 25);
  assert.equal(clampScanProgressHandoffValue({ currentStep: 1, reportReady: false, value: 12.5 }), 12.5);
});

test("each scan segment halves its remaining distance on every progress beat", () => {
  assert.equal(SCAN_PROGRESS_HALF_LIFE_MS, 6_000);
  const firstBeat = getNextScanProgressValue({ currentStep: 0, currentValue: 0 });
  const secondBeat = getNextScanProgressValue({ currentStep: 0, currentValue: firstBeat });
  const thirdBeat = getNextScanProgressValue({ currentStep: 0, currentValue: secondBeat });

  assert.equal(firstBeat, 12.5);
  assert.equal(secondBeat, 18.75);
  assert.equal(thirdBeat, 21.875);
  assert.equal(getNextScanProgressValue({ currentStep: 1, currentValue: 25 }), 37.5);
  assert.equal(getNextScanProgressValue({ currentStep: 2, currentValue: 50 }), 62.5);
  assert.equal(getNextScanProgressValue({ currentStep: 3, currentValue: 75 }), 85.5);
  assert.equal(getNextScanProgressValue({ currentStep: 3, currentValue: 95.9 }), 95.9);
});

test("normal half-life movement uses the full six-second interval at a linear rate", () => {
  const html = renderToStaticMarkup(<ScanSubmissionPendingIndicator />);

  assert.match(html, /transition-duration:6000ms/);
  assert.match(html, /transition-timing-function:linear/);
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

  assert.match(html, /aria-valuenow="75"/);
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
    describeScanProgressPhase({ elapsedMs: 13_599, estimatedDurationMs }),
    "preparing scanner"
  );
  assert.equal(
    describeScanProgressPhase({ elapsedMs: 13_600, estimatedDurationMs }),
    "capturing page evidence"
  );
  assert.equal(
    describeScanProgressPhase({ elapsedMs: 27_999, estimatedDurationMs }),
    "capturing page evidence"
  );
  assert.equal(
    describeScanProgressPhase({ elapsedMs: 28_000, estimatedDurationMs }),
    "checking policies"
  );
  assert.equal(
    describeScanProgressPhase({ elapsedMs: 35_199, estimatedDurationMs }),
    "checking policies"
  );
  assert.equal(
    describeScanProgressPhase({ elapsedMs: 35_200, estimatedDurationMs }),
    "processing retained evidence"
  );
});
