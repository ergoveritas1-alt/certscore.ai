import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScanSubmitProgressBar, describeScanProgressPhase } from "./scan-submit-progress";

test("scan progress is indeterminate and never claims a fabricated percentage", () => {
  const html = renderToStaticMarkup(
    <ScanSubmitProgressBar
      active
      nowMs={120_000}
      progressEstimate={{ estimatedDurationMs: 36_000, modeLabel: "standard scan" }}
      startedAtMs={0}
    />
  );

  assert.doesNotMatch(html, /% ready/);
  assert.doesNotMatch(html, /aria-valuenow/);
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
