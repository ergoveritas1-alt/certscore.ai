import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PendingScanDetailView } from "./pending-scan-detail-view";

const baseProps = {
  createdAt: "2026-07-29T23:00:00.000Z",
  domainHostname: "example.com",
  profile: "standard",
  scanId: "89309ab5-7ea3-4797-97dc-542f5eeb537c",
  startedAt: "2026-07-29T23:00:01.000Z",
  status: "running"
};

test("active scans retain the four-step progress view", () => {
  const html = renderToStaticMarkup(
    <PendingScanDetailView {...baseProps} />
  );

  assert.match(html, /Scan in progress/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /Scanning website/);
  assert.match(html, />Prepare</);
  assert.match(html, />Scan</);
  assert.match(html, />Review</);
  assert.match(html, />Report</);
  assert.doesNotMatch(html, /The scan is complete/);
  assert.doesNotMatch(html, /Finishing your report/);
  assert.doesNotMatch(html, /Building your report/);
});

test("completed scans awaiting report projection show the finalization view", () => {
  const html = renderToStaticMarkup(
    <PendingScanDetailView
      {...baseProps}
      pendingPostCompletionWork
      status="processing"
    />
  );

  assert.match(html, /The scan is complete/);
  assert.match(html, /Finishing your report/);
  assert.doesNotMatch(html, /role="progressbar"/);
  assert.doesNotMatch(html, /Scan in progress/);
});
