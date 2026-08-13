import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScanReportSubmissionProgressView } from "./scan-report-rescan-transition";

test("report rescan submission immediately renders the full progress treatment", () => {
  const html = renderToStaticMarkup(
    <ScanReportSubmissionProgressView
      profile="standard"
      startedAtMs={Date.now()}
      targetLabel="https://example.com/"
    />
  );

  assert.match(html, /Scan:.*https:\/\/example\.com\//);
  assert.match(html, /Scan in progress/);
  assert.match(html, /Capturing page evidence/);
  assert.match(html, />Prepare</);
  assert.match(html, />Scan</);
  assert.match(html, />Review</);
  assert.match(html, />Report</);
  assert.match(html, /role="progressbar"/);
});
