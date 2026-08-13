import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  getProgressHandoffValue,
  getProgressHandoffStage,
  PendingScanDetailView,
  shouldRapidlyCompleteProgress,
  TERMINAL_NAVIGATION_DELAY_MS,
  TERMINAL_REFRESH_FALLBACK_MS
} from "./pending-scan-detail-view";

const testRouter = {
  back() {},
  forward() {},
  prefetch: async () => {},
  push() {},
  refresh() {},
  replace() {}
};

function renderPendingScanDetailView(
  props: React.ComponentProps<typeof PendingScanDetailView> = baseProps
) {
  return renderToStaticMarkup(
    <AppRouterContext.Provider value={testRouter}>
      <PendingScanDetailView {...props} />
    </AppRouterContext.Provider>
  );
}

const baseProps = {
  createdAt: "2026-07-29T23:00:00.000Z",
  domainHostname: "example.com",
  profile: "standard",
  scanId: "89309ab5-7ea3-4797-97dc-542f5eeb537c",
  startedAt: "2026-07-29T23:00:01.000Z",
  status: "running"
};

test("fresh submission handoff immediately reflects the authoritative stage and value", () => {
  assert.equal(getProgressHandoffStage({ hasSubmissionHandoff: true, serverStage: "scan" }), "scan");
  assert.equal(getProgressHandoffStage({ hasSubmissionHandoff: false, serverStage: "scan" }), "scan");
  assert.equal(getProgressHandoffStage({ hasSubmissionHandoff: true, serverStage: "review" }), "review");
  assert.equal(getProgressHandoffValue({ hasSubmissionHandoff: true, progressValue: 42 }), 42);
  assert.equal(getProgressHandoffValue({ hasSubmissionHandoff: false, progressValue: 42 }), null);
});

test("authoritative report readiness rapidly completes the bar before navigation", () => {
  assert.equal(TERMINAL_NAVIGATION_DELAY_MS, 0);
  assert.equal(TERMINAL_REFRESH_FALLBACK_MS, 20_000);
  assert.equal(shouldRapidlyCompleteProgress({ reportReady: true, stage: "complete", status: "completed" }), true);
  assert.equal(shouldRapidlyCompleteProgress({ reportReady: false, stage: "report", status: "completed" }), false);
});

test("active scans retain the four-step progress view", () => {
  const html = renderPendingScanDetailView();

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
  const html = renderPendingScanDetailView({
    ...baseProps,
    pendingPostCompletionWork: true,
    status: "processing"
  });

  assert.match(html, /Reviewing scan signals/);
  assert.match(html, /Reviewing/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /Scan in progress/);
});
