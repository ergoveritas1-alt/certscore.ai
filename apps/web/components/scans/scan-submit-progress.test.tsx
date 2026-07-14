import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScanSubmitProgressBar, describeScanProgressPhase } from "./scan-submit-progress";

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
