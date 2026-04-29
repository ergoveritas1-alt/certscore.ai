import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SCAN_EVENT_TYPES,
  type ScannerExecutionSummary,
  type ScannerStageOutcome
} from "@website-signal-risk-scanner/shared";
import { FullScanProgressCard, getNextDisplayedProgressValue, getProgressValue } from "./full-scan-progress-card";

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
  assert.match(html, /Live scan · 3 updates/);
  assert.match(html, /Current: Runtime snapshot capture/);
  assert.match(html, /Latest: Live scan/);
  assert.match(html, /Activity: 3 worker updates/);
  assert.match(html, /1\/1 runtime phase closed/);
  assert.match(html, /Current: Runtime snapshot capture · Running/);
  assert.doesNotMatch(html, /milestones complete/);
  assert.match(html, /bg-gradient-to-r/);
  assert.doesNotMatch(html, /animate-\[status-sheen-overlay_1\.35s_linear_infinite\]/);
  assert.match(html, /title="Signal derivation: Pending"/);
  assert.doesNotMatch(html, /Milestone details/);
  assert.doesNotMatch(html, /Recent milestone updates/);
  assert.doesNotMatch(html, /Progress updates automatically while the scan is queued or running\./);
  assert.doesNotMatch(html, /Status<\/p>/);
  assert.doesNotMatch(html, /Live update/);
});

test("keeps queued scans anchored to queue pickup messaging", () => {
  const html = renderToStaticMarkup(
    <FullScanProgressCard
      buildPhaseSummaries={[]}
      createdAt="2026-04-18T10:43:07.000Z"
      events={[
        {
          createdAt: "2026-04-18T10:43:07.000Z",
          eventType: SCAN_EVENT_TYPES.fullQueued,
          message: "Scan queued and waiting for worker pickup.",
          metadataJson: { profile: "preview", pagesRequested: 1 }
        },
        {
          createdAt: "2026-04-18T10:43:08.000Z",
          eventType: SCAN_EVENT_TYPES.unifiedFindingsDerivedCompleted,
          message: "Unified finding derivation completed.",
          metadataJson: { stage: "unified_findings", findingCount: 0 }
        }
      ]}
      executionSummary={null}
      status="queued"
    />
  );

  assert.match(html, /Full scan queued/);
  assert.match(html, /Queued\.\.\./);
  assert.match(html, /Queued · 1 update · Scan queued and waiting for worker pickup\./);
  assert.match(html, /Activity: 2 worker updates/);
  assert.doesNotMatch(html, /milestones complete/);
  assert.doesNotMatch(html, /Unified finding derivation completed\./);
  assert.doesNotMatch(html, /Scanning\.\.\./);
});

test("keeps queued progress moving while waiting for worker pickup", () => {
  const queuedAt = "2026-04-18T10:43:07.000Z";
  const events = [
    {
      createdAt: queuedAt,
      eventType: SCAN_EVENT_TYPES.fullQueued,
      message: "Scan queued and waiting for worker pickup.",
      metadataJson: { profile: "preview", pagesRequested: 1 }
    }
  ];

  assert.equal(
    getProgressValue({
      buildPhaseSummaries: [],
      createdAt: queuedAt,
      events,
      executionSummary: null,
      nowMs: Date.parse(queuedAt),
      status: "queued"
    }),
    8
  );
  assert.ok(
    getProgressValue({
      buildPhaseSummaries: [],
      createdAt: queuedAt,
      events,
      executionSummary: null,
      nowMs: Date.parse(queuedAt) + 45_000,
      status: "queued"
    }) > 13
  );
});

test("uses runtime events to avoid front-loaded progress skew", () => {
  const html = renderToStaticMarkup(
    <FullScanProgressCard
      buildPhaseSummaries={[]}
      createdAt="2026-03-22T22:14:00.000Z"
      events={[
        {
          createdAt: "2026-03-22T22:14:01.000Z",
          eventType: SCAN_EVENT_TYPES.fullStarted,
          message: "Structured snapshot scan started.",
          metadataJson: {}
        },
        {
          createdAt: "2026-03-22T22:14:30.000Z",
          eventType: "runtime.build_phase_diagnostic",
          message: "Runtime browser capture is collecting page evidence.",
          metadataJson: { phase: "browser_capture" }
        }
      ]}
      executionSummary={null}
      status="running"
    />
  );

  assert.match(html, /style="width:1%"/);
  assert.match(html, /Runtime browser capture is collecting page evidence\./);
  assert.match(html, /Current: Runtime snapshot capture · Running/);
  assert.match(html, /Next: Signal derivation/);
});

test("keeps displayed progress monotonic across lower refresh targets", () => {
  assert.equal(
    getNextDisplayedProgressValue({
      currentValue: 62,
      targetValue: 12
    }),
    62
  );
  assert.equal(
    getNextDisplayedProgressValue({
      currentValue: 62,
      targetValue: 95
    }),
    62.75
  );
});

test("keeps early active stages moving without extra worker events", () => {
  const startedAt = "2026-03-22T22:14:00.000Z";
  const summary: ScannerExecutionSummary = {
    ...makeSummary(),
    stages: []
  };
  const initialProgress = getProgressValue({
    buildPhaseSummaries: [],
    events: [
      {
        createdAt: startedAt,
        eventType: SCAN_EVENT_TYPES.fullStarted,
        message: "Structured snapshot scan started.",
        metadataJson: {}
      }
    ],
    executionSummary: summary,
    nowMs: Date.parse(startedAt),
    status: "running"
  });
  const laterProgress = getProgressValue({
    buildPhaseSummaries: [],
    events: [
      {
        createdAt: startedAt,
        eventType: SCAN_EVENT_TYPES.fullStarted,
        message: "Structured snapshot scan started.",
        metadataJson: {}
      }
    ],
    executionSummary: summary,
    nowMs: Date.parse(startedAt) + 45_000,
    status: "running"
  });

  assert.ok(initialProgress >= 13);
  assert.ok(laterProgress > initialProgress);
  assert.ok(laterProgress < 29);
});

test("keeps crawl-stage progress moving during quiet discovery work", () => {
  const baselineCompletedAt = "2026-03-22T22:14:30.000Z";
  const summary: ScannerExecutionSummary = {
    ...makeSummary(),
    stages: [
      makeStage("setup_load", "2026-03-22T22:14:10.000Z"),
      makeStage("baseline_lookup", baselineCompletedAt)
    ]
  };
  const initialProgress = getProgressValue({
    buildPhaseSummaries: [],
    events: [],
    executionSummary: summary,
    nowMs: Date.parse(baselineCompletedAt),
    status: "running"
  });
  const laterProgress = getProgressValue({
    buildPhaseSummaries: [],
    events: [],
    executionSummary: summary,
    nowMs: Date.parse(baselineCompletedAt) + 90_000,
    status: "running"
  });

  assert.ok(initialProgress >= 46);
  assert.ok(laterProgress > initialProgress);
  assert.ok(laterProgress < 57);
});

test("does not reset active-stage elapsed progress when newer stage events arrive", () => {
  const runtimeStartedAt = "2026-03-22T22:14:30.000Z";
  const summary: ScannerExecutionSummary = {
    ...makeSummary(),
    stages: [
      makeStage("setup_load", "2026-03-22T22:14:10.000Z"),
      makeStage("baseline_lookup", "2026-03-22T22:14:20.000Z"),
      makeStage("crawl_discovery", runtimeStartedAt)
    ]
  };
  const earlyProgress = getProgressValue({
    buildPhaseSummaries: [],
    events: [
      {
        createdAt: "2026-03-22T22:14:45.000Z",
        eventType: "runtime.build_phase_diagnostic",
        message: "Runtime snapshot update.",
        metadataJson: {}
      }
    ],
    executionSummary: summary,
    nowMs: Date.parse(runtimeStartedAt) + 45_000,
    status: "running"
  });
  const laterProgress = getProgressValue({
    buildPhaseSummaries: [],
    events: [
      {
        createdAt: "2026-03-22T22:14:45.000Z",
        eventType: "runtime.build_phase_diagnostic",
        message: "Runtime snapshot update.",
        metadataJson: {}
      },
      {
        createdAt: "2026-03-22T22:15:15.000Z",
        eventType: "runtime.build_phase_diagnostic",
        message: "Another runtime snapshot update.",
        metadataJson: {}
      }
    ],
    executionSummary: summary,
    nowMs: Date.parse(runtimeStartedAt) + 75_000,
    status: "running"
  });

  assert.ok(laterProgress > earlyProgress);
});

test("runtime elapsed progress overtakes event progress before a visible stall", () => {
  const runtimeStartedAt = "2026-03-22T22:14:30.000Z";
  const summary: ScannerExecutionSummary = {
    ...makeSummary(),
    stages: [
      makeStage("setup_load", "2026-03-22T22:14:10.000Z"),
      makeStage("baseline_lookup", "2026-03-22T22:14:20.000Z"),
      makeStage("crawl_discovery", runtimeStartedAt)
    ]
  };
  const progress = getProgressValue({
    buildPhaseSummaries: [],
    events: [
      {
        createdAt: "2026-03-22T22:14:38.000Z",
        eventType: "runtime.build_phase_diagnostic",
        message: "Runtime snapshot update.",
        metadataJson: {}
      }
    ],
    executionSummary: summary,
    nowMs: Date.parse(runtimeStartedAt) + 20_000,
    status: "running"
  });

  assert.ok(progress > 63);
});

test("keeps final scan stages moving between worker updates", () => {
  const runtimeCompletedAt = "2026-03-22T22:14:30.000Z";
  const summary: ScannerExecutionSummary = {
    ...makeSummary(),
    stages: [
      makeStage("setup_load", "2026-03-22T22:14:03.000Z"),
      makeStage("baseline_lookup", "2026-03-22T22:14:05.000Z"),
      makeStage("crawl_discovery", "2026-03-22T22:14:10.000Z"),
      makeStage("runtime_snapshot_capture", runtimeCompletedAt)
    ]
  };

  assert.equal(
    getProgressValue({
      buildPhaseSummaries: [],
      events: [],
      executionSummary: summary,
      nowMs: Date.parse(runtimeCompletedAt),
      status: "running"
    }),
    75
  );
  const earlyTailProgress = getProgressValue({
      buildPhaseSummaries: [],
      events: [],
      executionSummary: summary,
      nowMs: Date.parse(runtimeCompletedAt) + 35_000,
      status: "running"
    });
  const laterTailProgress = getProgressValue({
    buildPhaseSummaries: [],
    events: [],
    executionSummary: summary,
    nowMs: Date.parse(runtimeCompletedAt) + 180_000,
    status: "running"
  });

  assert.ok(earlyTailProgress > 75);
  assert.ok(earlyTailProgress < 82);
  assert.ok(laterTailProgress > 90);
});

test("keeps persistence progress moving through the final tail without reaching 100", () => {
  const signalCompletedAt = "2026-03-22T22:15:30.000Z";
  const summary: ScannerExecutionSummary = {
    ...makeSummary(),
    stages: [
      makeStage("setup_load", "2026-03-22T22:14:03.000Z"),
      makeStage("baseline_lookup", "2026-03-22T22:14:05.000Z"),
      makeStage("crawl_discovery", "2026-03-22T22:14:10.000Z"),
      makeStage("runtime_snapshot_capture", "2026-03-22T22:14:30.000Z"),
      makeStage("signal_derivation", signalCompletedAt)
    ]
  };
  const oneMinuteProgressValue = getProgressValue({
    buildPhaseSummaries: [],
    events: [],
    executionSummary: summary,
    nowMs: Date.parse(signalCompletedAt) + 60_000,
    status: "running"
  });
  const threeMinuteProgressValue = getProgressValue({
    buildPhaseSummaries: [],
    events: [],
    executionSummary: summary,
    nowMs: Date.parse(signalCompletedAt) + 180_000,
    status: "running"
  });

  assert.ok(oneMinuteProgressValue > 90);
  assert.ok(oneMinuteProgressValue < 96);
  assert.ok(threeMinuteProgressValue > oneMinuteProgressValue);
  assert.ok(threeMinuteProgressValue < 100);
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
