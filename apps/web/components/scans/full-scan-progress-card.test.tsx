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
          message: "Scan queued and awaiting worker processing.",
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
  assert.match(html, /live · evt=runtime\.build_phase_diagnostic/);
  assert.match(html, /Status/);
  assert.match(html, /Stage/);
  assert.match(html, /Live update/);
  assert.match(html, /Progress updates automatically while the scan is queued or running\./);
  assert.doesNotMatch(html, /Step 1/);
  assert.doesNotMatch(html, /Step 2/);
  assert.doesNotMatch(html, /Step 3/);
  assert.doesNotMatch(html, /Message and metadata/);
});
