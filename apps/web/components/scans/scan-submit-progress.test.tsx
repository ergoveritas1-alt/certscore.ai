import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ScanSubmissionPendingIndicator,
  ScanSubmitProgressBar,
  describeScanProgressPhase,
  estimateScanProgressForOptions,
  getAdaptiveScanProgressValue
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

test("dense progress retains phase detail and milestone labels with compact spacing", () => {
  const html = renderToStaticMarkup(
    <ScanSubmitProgressBar
      active
      dense
      nowMs={6_000}
      progressStage="scan"
      scanStatus="running"
      startedAtMs={0}
    />
  );

  assert.match(html, /Capturing page evidence and website signals/);
  assert.match(html, />Prepare</);
  assert.match(html, />Scan</);
  assert.match(html, /rounded-xl border border-slate-200 bg-slate-50 px-3 py-2/);
  assert.match(html, /mt-2 h-2 overflow-hidden/);
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
      nowMs={0}
      progressEstimate={{ estimatedDurationMs: 100_000, modeLabel: "standard scan" }}
      progressStage="scan"
      scanStatus="running"
      startedAtMs={0}
    />
  );

  assert.match(html, /aria-valuenow="12.5"/);
  assert.match(html, /width:12.5%/);
});

test("adaptive progress starts at zero even when scan work begins immediately", () => {
  assert.equal(getAdaptiveScanProgressValue({
    elapsedMs: 0,
    estimatedDurationMs: 12_000,
    progressStage: "scan",
    reportReady: false
  }), 0);
});

test("adaptive progress is linear through the estimate and then creeps below completion", () => {
  assert.equal(getAdaptiveScanProgressValue({ elapsedMs: 6_000, estimatedDurationMs: 12_000, reportReady: false }), 48);
  assert.equal(getAdaptiveScanProgressValue({ elapsedMs: 12_000, estimatedDurationMs: 12_000, reportReady: false }), 96);
  assert.equal(getAdaptiveScanProgressValue({ elapsedMs: 24_000, estimatedDurationMs: 12_000, reportReady: false }), 97.9);
  assert.equal(getAdaptiveScanProgressValue({ elapsedMs: 120_000, estimatedDurationMs: 12_000, reportReady: false }), 98.5);
  assert.equal(getAdaptiveScanProgressValue({ elapsedMs: 2_000, estimatedDurationMs: 12_000, progressStage: "report", reportReady: false }), 92);
  assert.equal(getAdaptiveScanProgressValue({ elapsedMs: 2_000, estimatedDurationMs: 12_000, progressStage: "complete", reportReady: true }), 100);
});

test("normal movement uses short linear transitions instead of multi-second pacing", () => {
  const html = renderToStaticMarkup(<ScanSubmissionPendingIndicator />);

  assert.match(html, /transition-duration:300ms/);
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

  assert.match(html, /aria-valuenow="98\.[3-5]"/);
  assert.match(html, /Still working through the scan/);
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

  assert.match(html, /still working through the scan/i);
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

test("local estimates reflect the faster pipeline while hosted estimates remain conservative", () => {
  assert.equal(estimateScanProgressForOptions({ profileValue: "standard", runtime: "local" }).estimatedDurationMs, 13_500);
  assert.equal(estimateScanProgressForOptions({ profileValue: "tiny", runtime: "local" }).estimatedDurationMs, 8_000);
  assert.equal(estimateScanProgressForOptions({ profileValue: "standard", runtime: "hosted" }).estimatedDurationMs, 24_000);
});
