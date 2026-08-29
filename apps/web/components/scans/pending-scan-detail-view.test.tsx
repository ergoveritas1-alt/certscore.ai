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
  assert.equal(shouldRapidlyCompleteProgress({ preConsentPreview: null, reportReady: true, stage: "complete", status: "completed" }), true);
  assert.equal(shouldRapidlyCompleteProgress({ preConsentPreview: null, reportReady: false, stage: "report", status: "completed" }), false);
});

test("active scans retain the four-step progress view", () => {
  const html = renderPendingScanDetailView();

  assert.match(html, /Scan in progress/);
  assert.match(html, /data-density="compact"/);
  assert.match(html, /space-y-4/);
  assert.match(html, /rounded-2xl[^>]*p-3/);
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

test("active scans render the report-consistent preliminary runtime sections", () => {
  const html = renderPendingScanDetailView({
    ...baseProps,
    initialPreConsentPreview: {
      type: "certscore_pre_consent_preview",
      resultStage: "preliminary",
      final: false,
      sourceLane: "runtime_evidence",
      generatedAt: "2026-07-29T23:00:07.000Z",
      runtimeCoverage: { status: "limited_partial", limitationKeys: ["bounded_checkpoint"] },
      summary: {
        cookieCount: 1,
        returnedCookieCount: 1,
        trackerCount: 1,
        trackingVendorCount: 1,
        returnedTrackingVendorCount: 1,
        thirdPartyRequestCount: 3,
        vendorCount: 1,
      },
      cookies: [{
        name: "_ga",
        domain: "example.com",
        party: "first_party",
        purpose: "analytics",
        essentiality: "non_essential",
        observedAtMs: 1_200,
      }],
      trackers: [{
        vendor: "Google",
        product: "Google Analytics",
        purpose: "analytics",
        confidence: 0.96,
        domains: ["www.google-analytics.com"],
      }],
      truncated: { cookies: false, trackers: false },
      mustContinuePolling: true,
      observationOnlyDisclaimer: "Preliminary passive observations only; continue polling.",
    },
  });

  assert.match(html, /Early observed sequence/);
  assert.match(html, /What happened by the runtime checkpoint/);
  assert.match(html, /data-density="compact"/);
  assert.match(html, /min-w-\[58rem\] relative pt-6/);
  assert.match(html, /top-\[2\.55rem\]/);
  assert.doesNotMatch(html, /top-\[4\.2rem\]/);
  assert.match(html, /Preliminary cookie and tracker inventory/);
  assert.match(html, /What we’ve observed so far/);
  assert.doesNotMatch(html, /View checkpoint examples/);
  assert.doesNotMatch(html, /These are bounded examples returned by the preliminary runtime checkpoint/);
  assert.doesNotMatch(html, /The early runtime checkpoint has partial coverage/);
  assert.match(html, /Google Analytics/);
  assert.match(html, /Checkpoint observations are not findings or final totals/);
  assert.match(html, /aria-label="Preliminary cookies and trackers"[^>]*data-scrollable="false"/);
  assert.doesNotMatch(html, /max-h-\[22rem\] overflow-y-auto/);
});

test("preliminary runtime inventory scrolls only after six rows", () => {
  const cookies = Array.from({ length: 7 }, (_, index) => ({
    name: `_preview_${index + 1}`,
    domain: "example.com",
    party: "first_party" as const,
    purpose: "analytics" as const,
    essentiality: "non_essential" as const,
    observedAtMs: 1_200 + index,
  }));
  const html = renderPendingScanDetailView({
    ...baseProps,
    initialPreConsentPreview: {
      type: "certscore_pre_consent_preview",
      resultStage: "preliminary",
      final: false,
      sourceLane: "runtime_evidence",
      generatedAt: "2026-07-29T23:00:07.000Z",
      runtimeCoverage: { status: "usable", limitationKeys: [] },
      summary: {
        cookieCount: cookies.length,
        returnedCookieCount: cookies.length,
        trackerCount: 0,
        trackingVendorCount: 0,
        returnedTrackingVendorCount: 0,
        thirdPartyRequestCount: 0,
        vendorCount: 0,
      },
      cookies,
      trackers: [],
      truncated: { cookies: false, trackers: false },
      mustContinuePolling: true,
      observationOnlyDisclaimer: "Preliminary passive observations only; continue polling.",
    },
  });

  assert.match(html, /aria-label="Preliminary cookies and trackers"[^>]*max-h-\[22rem\] overflow-y-auto[^>]*data-scrollable="true"/);
});
