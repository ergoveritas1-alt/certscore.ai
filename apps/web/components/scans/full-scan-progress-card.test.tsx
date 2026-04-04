import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SCAN_EVENT_TYPES,
  type ScannerExecutionSummary,
  type ScannerStageOutcome
} from "@website-signal-risk-scanner/shared";
import { FullScanProgressCard } from "./full-scan-progress-card";

function makeStage(
  stage: ScannerStageOutcome["stage"],
  completedAt: string,
  input: Partial<ScannerStageOutcome> = {}
): ScannerStageOutcome {
  return {
    attempts: input.attempts ?? 1,
    completedAt,
    durationMs: input.durationMs ?? 1_500,
    errorCategory: input.errorCategory ?? null,
    message: input.message ?? `${stage} complete`,
    metadata: input.metadata ?? null,
    outcome: input.outcome ?? "success",
    recoverable: input.recoverable ?? false,
    stage,
    startedAt: input.startedAt ?? new Date(Date.parse(completedAt) - 1_500).toISOString()
  };
}

function makeSummary(): ScannerExecutionSummary {
  return {
    completedAt: null,
    contractVersion: "scanner-execution.v1",
    degradedStages: [],
    failureCategory: null,
    lifecycle: "running",
    startedAt: "2026-03-22T22:14:00.000Z",
    stages: [
      makeStage("setup_load", "2026-03-22T22:14:03.000Z"),
      makeStage("baseline_lookup", "2026-03-22T22:14:05.000Z"),
      makeStage("crawl_discovery", "2026-03-22T22:14:10.000Z")
    ],
    updatedAt: "2026-03-22T22:14:10.000Z"
  };
}

test("renders the rich full-scan progress dashboard for running scans", () => {
  const html = renderToStaticMarkup(
    <FullScanProgressCard
      buildPhaseSummaries={[
        {
          attempts: 1,
          completedAt: "2026-03-22T22:14:18.000Z",
          durationMs: 2_100,
          error: null,
          outcome: "success",
          phase: "robots_homepage_setup",
          startedAt: "2026-03-22T22:14:16.000Z"
        }
      ]}
      createdAt="2026-03-22T22:14:00.000Z"
      events={[
        {
          createdAt: "2026-03-22T22:14:00.000Z",
          eventType: SCAN_EVENT_TYPES.fullQueued,
          message: "Scan queued and awaiting scanner pickup.",
          metadataJson: { profile: "team", pagesRequested: 5 }
        },
        {
          createdAt: "2026-03-22T22:14:01.000Z",
          eventType: SCAN_EVENT_TYPES.fullStarted,
          message: "Structured snapshot scan started.",
          metadataJson: { pagesRequested: 5 }
        },
        {
          createdAt: "2026-03-22T22:14:12.000Z",
          eventType: "runtime.build_phase_diagnostic",
          message: "Build phase robots_homepage_setup start.",
          metadataJson: { phase: "robots_homepage_setup", requestedUrl: "https://freefunz.site/" }
        }
      ]}
      executionSummary={makeSummary()}
      status="running"
    />
  );

  assert.match(html, /Full scan in progress/);
  assert.match(html, /style="width:\d+(\.\d+)?%"/);
  assert.match(html, /Live scan · 3\/7 milestones complete/);
  assert.match(html, /Current milestone:/);
  assert.match(html, /Recent milestone updates/);
  assert.match(html, /Progress updates automatically while the scan is queued or running\./);
  assert.doesNotMatch(html, /Status<\/p>/);
  assert.doesNotMatch(html, /Live update/);
});

test("surfaces early tier results while a scan is still running", () => {
  const html = renderToStaticMarkup(
    <FullScanProgressCard
      buildPhaseSummaries={[]}
      createdAt="2026-03-22T22:14:00.000Z"
      events={[
        {
          createdAt: "2026-03-22T22:14:00.000Z",
          eventType: SCAN_EVENT_TYPES.fullQueued,
          message: "Scan queued and awaiting scanner pickup.",
          metadataJson: { profile: "team", pagesRequested: 5 }
        },
        {
          createdAt: "2026-03-22T22:14:02.000Z",
          eventType: "runtime.build_phase_diagnostic",
          message: "Front-door probe complete.",
          metadataJson: {
            tier: "tier1_front_door",
            homepageFetchHttpStatus: 403,
            finalUrl: "https://www.example.com/",
            serverHeader: "cloudflare",
            blockVendorGuess: "cloudflare",
            accessPostureClass: "early_loss",
            verifiedPublicSurfacesCount: 0,
            challengeSuspected: true
          }
        }
      ]}
      executionSummary={{
        ...makeSummary(),
        stages: [
          makeStage("baseline_lookup", "2026-03-22T22:14:03.000Z", {
            metadata: {
              tier: "tier0_passive",
              resolvedHostname: "www.example.com",
              tlsIssuer: "Amazon RSA 2048 M01"
            }
          }),
          makeStage("crawl_discovery", "2026-03-22T22:14:05.000Z", {
            metadata: {
              tier: "tier1_front_door",
              homepageFetchHttpStatus: 403,
              finalUrl: "https://www.example.com/",
              serverHeader: "cloudflare",
              blockVendorGuess: "cloudflare",
              accessPostureClass: "early_loss"
            }
          }),
          makeStage("runtime_snapshot_capture", "2026-03-22T22:14:08.000Z", {
            metadata: {
              tier: "tier2_browser_surface",
              cmpVendorName: "OneTrust",
              cookieBannerPresent: true,
              thirdPartyRequestCount: 7,
              initialCookieCount: 4
            }
          })
        ]
      }}
      status="running"
    />
  );

  assert.match(html, /Early results/);
  assert.match(html, /Tier/);
  assert.match(html, /tier1_front_door/);
  assert.match(html, /Host/);
  assert.match(html, /www\.example\.com/);
  assert.match(html, /TLS issuer/);
  assert.match(html, /Amazon RSA 2048 M01/);
  assert.match(html, /Homepage/);
  assert.match(html, /HTTP 403/);
  assert.match(html, /Block vendor/);
  assert.match(html, /cloudflare/);
  assert.match(html, /Access posture/);
  assert.match(html, /Early Loss/);
  assert.match(html, /CMP/);
  assert.match(html, /OneTrust/);
  assert.match(html, /Consent surface/);
  assert.match(html, /Observed/);
  assert.match(html, /3P requests/);
  assert.match(html, />7</);
  assert.match(html, /Initial cookies/);
  assert.match(html, />4</);
});
