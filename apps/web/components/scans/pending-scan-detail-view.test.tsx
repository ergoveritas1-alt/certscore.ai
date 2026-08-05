import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getProgressHandoffStage,
  getProgressTransitionSchedule,
  getProgressTransitionStages,
  PendingScanDetailView,
  shouldRapidlyCompleteProgress,
  TERMINAL_NAVIGATION_DELAY_MS
} from "./pending-scan-detail-view";

const baseProps = {
  createdAt: "2026-07-29T23:00:00.000Z",
  domainHostname: "example.com",
  profile: "standard",
  scanId: "89309ab5-7ea3-4797-97dc-542f5eeb537c",
  startedAt: "2026-07-29T23:00:01.000Z",
  status: "running"
};

test("canonical milestone jumps retain review and report as paced catch-up stages", () => {
  assert.deepEqual(getProgressTransitionStages("scan", "complete"), ["review", "report", "complete"]);
  assert.deepEqual(getProgressTransitionStages("review", "complete"), ["report", "complete"]);
  assert.deepEqual(getProgressTransitionStages("report", "report"), []);
});

test("catch-up pacing holds the opening and finishing milestones long enough to read", () => {
  assert.deepEqual(getProgressTransitionSchedule("prepare", "scan"), [
    { delayMs: 1_500, stage: "scan" }
  ]);
  assert.deepEqual(getProgressTransitionSchedule("scan", "complete"), [
    { delayMs: 1_000, stage: "review" },
    { delayMs: 3_000, stage: "report" },
    { delayMs: 5_500, stage: "complete" }
  ]);
});

test("fresh submission handoff visibly starts in Prepare before catching up to running", () => {
  assert.equal(getProgressHandoffStage({ hasSubmissionHandoff: true, serverStage: "scan" }), "prepare");
  assert.equal(getProgressHandoffStage({ hasSubmissionHandoff: false, serverStage: "scan" }), "scan");
  assert.equal(getProgressHandoffStage({ hasSubmissionHandoff: true, serverStage: "review" }), "review");
});

test("authoritative report readiness rapidly completes the bar before navigation", () => {
  assert.equal(TERMINAL_NAVIGATION_DELAY_MS, 750);
  assert.equal(shouldRapidlyCompleteProgress({ reportReady: true, stage: "complete", status: "completed" }), true);
  assert.equal(shouldRapidlyCompleteProgress({ reportReady: false, stage: "report", status: "completed" }), false);
});

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

test("completed scans awaiting report projection remain in the staged progress view", () => {
  const html = renderToStaticMarkup(
    <PendingScanDetailView
      {...baseProps}
      pendingPostCompletionWork
      status="processing"
    />
  );

  assert.match(html, /Reviewing scan signals/);
  assert.match(html, /Reviewing/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /Scan in progress/);
});
