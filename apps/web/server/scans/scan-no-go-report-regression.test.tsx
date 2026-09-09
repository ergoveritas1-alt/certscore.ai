import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import retained from "../../lib/scans/test-fixtures/authentication-no-go-20260909.json";
import type { ScanDetailResponse } from "./get-scan-by-id";
import {
  buildPersistedScanReportProjection, readPersistedScanReportProjection, SCAN_REPORT_PROJECTION_VERSION,
} from "./scan-report-projection-contract";

// Workspace UI packages use classic JSX in the Node test runner.
Object.assign(globalThis, { React });
const require = createRequire(import.meta.url);
(require.cache as Record<string, unknown>)[require.resolve("server-only")] = { exports: {}, loaded: true };

function scan(): ScanDetailResponse {
  return {
    scan: {
      id: retained.sourceScanId, status: "completed", domainHostname: "forenaxis-command.michaelmancini1968.chatgpt.site",
      pageUrl: "https://forenaxis-command.michaelmancini1968.chatgpt.site/",
      createdAt: "2026-09-09T11:50:39.000Z", completedAt: "2026-09-09T11:51:05.000Z",
      startedAt: "2026-09-09T11:50:39.000Z", scanFromLabel: "Germany", scanFromValue: "eu_de",
      scanConfigJson: null,
    },
    domainBenchmark: null, signals: [], validationFindings: [], trackerVendors: [],
    policyEnrichment: [], policyReviewQueue: [], preconsentViolations: [],
    events: [], runtimeArtifacts: structuredClone(retained.runtimeArtifacts),
    snapshot: { certscore_overall: 100, privacy_score: 100, top_finding_count: 1 },
  } as unknown as ScanDetailResponse;
}

function readable(persisted: ReturnType<typeof buildPersistedScanReportProjection>) {
  return {
    scan: persisted.payload.scan,
    snapshot: {
      report_projection_computed_at: "2026-09-09T11:51:05.000Z",
      report_projection_payload: persisted.payload,
      report_projection_payload_sha256: persisted.sha256,
      report_projection_payload_size_bytes: persisted.sizeBytes,
      report_projection_status: "ready", report_projection_version: SCAN_REPORT_PROJECTION_VERSION,
    },
  };
}

test("retained 401 stays unscored through persistence, checksum-verified read, timeline and public/authenticated rendering", async () => {
  const { buildTimelineReportModel } = await import("../../components/scans/report-lab/timeline-report-model");
  const { ShadowScanReport } = await import("../../components/scans/report-lab/shadow-scan-report");
  const persisted = buildPersistedScanReportProjection(scan());
  assert.equal(persisted.payload.snapshot?.certscore_overall, null);
  const hydrated = readPersistedScanReportProjection(readable(persisted));
  assert.ok(hydrated);
  const report = buildTimelineReportModel(hydrated);
  assert.equal(report.resultDisposition, "no_go");
  assert.equal(report.score.value, null);
  assert.equal("findings" in report, false);
  assert.equal("metrics" in report, false);
  // The real renderer is exercised for both routes and every report variant.
  const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
  for (const mode of ["authenticated", "public"] as const) {
    for (const variant of ["timeline", "briefing", "triage", "scorecard", "minimal"] as const) {
      const html = renderToStaticMarkup(
        <AppRouterContext.Provider value={router}>
          <PathnameContext.Provider value={mode === "public" ? "/scan/fixture" : "/app/scans/fixture"}>
            <ShadowScanReport mode={mode} variant={variant} report={report} />
          </PathnameContext.Provider>
        </AppRouterContext.Provider>,
      );
      assert.match(html, /Sign-in required/);
      assert.match(html, /Not scored/);
      assert.match(html, /HTTP 401/);
      assert.doesNotMatch(html, /Overall score|100\/100|Executive overview|INDUSTRY BENCHMARK|Top issues needing attention|Evidence index|Cookies and trackers timeline/);
    }
  }
});

test("previously saved numeric scores are withheld after verification, without mutating stored payloads", () => {
  const record = scan();
  // Reproduce the old writer: serialize the stale score without the new no-go write gate.
  const persisted = buildPersistedScanReportProjection({ ...record, runtimeArtifacts: null });
  const legacy = buildPersistedScanReportProjection({
    ...persisted.payload,
    runtimeArtifacts: { scanNoGoAssessment: { decision: "continue_with_diagnostics" } },
  });
  // Create a checksum-valid historical no-go payload with the serializer's canonical ordering.
  const historical = structuredClone(legacy.payload);
  historical.runtimeArtifacts = record.runtimeArtifacts;
  // Match the canonical serializer to construct a historical payload, independently of the new write gate.
  const sort = (value: unknown): unknown => Array.isArray(value) ? value.map(sort) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort((value as Record<string, unknown>)[key])])) : value;
  const serialized = JSON.stringify(sort(historical));
  const input = readable({ ...legacy, payload: historical, serialized, sizeBytes: Buffer.byteLength(serialized), sha256: createHash("sha256").update(serialized).digest("hex") });
  const read = readPersistedScanReportProjection(input);
  assert.ok(read);
  assert.equal(read.snapshot?.certscore_overall, null);
  assert.equal(historical.snapshot?.certscore_overall, 100);
  assert.deepEqual(read.runtimeArtifacts, record.runtimeArtifacts);
  input.snapshot.report_projection_payload_sha256 = "f".repeat(64);
  assert.equal(readPersistedScanReportProjection(input), null, "no-go must not bypass integrity checks");
});

test("a recovered partial report remains a normal report despite an independent lane's visual NO_GO", async () => {
  const { buildTimelineReportModel } = await import("../../components/scans/report-lab/timeline-report-model");
  const record = scan();
  record.runtimeArtifacts = {
    scanNoGoAssessment: { ...retained.runtimeArtifacts.scanNoGoAssessment, decision: "continue_with_diagnostics" },
    visualAccessReview: retained.runtimeArtifacts.visualAccessReview,
    scanEvidenceLaneAssessment: { outcome: "partial_with_diagnostics" },
  };
  // A supported historical canonical packet; no new findings are derived from the access hints.
  const partialRecord = { ...record, canonicalReportProjection: {
    artifactVersion: "persisted-canonical-report-projection-v2", checklistRows: [],
    collectionSurfaceAssessment: null, derivedContext: {}, globalUnifiedFindings: [],
    legacyScoreAssessmentInput: { scanId: record.scan.id }, normalizedConcerns: [],
    ownerUnifiedFindings: [], topFindingIds: [],
  } } as unknown as ScanDetailResponse;
  const hydrated = readPersistedScanReportProjection(readable(buildPersistedScanReportProjection(partialRecord)));
  assert.ok(hydrated);
  const model = buildTimelineReportModel(hydrated);
  assert.equal(model.resultDisposition, undefined);
  assert.equal(model.score.value, 100);
  assert.ok("metrics" in model);
});

test("API and Pulse expose the same retained authentication blocker and never restore the stale score", async () => {
  const { buildApiV2ScanResource, buildApiV2ScanStatus } = await import("../../lib/api-v2/scan-resource");
  const { buildPulseNoGoState } = await import("../../lib/pulse/projection");
  for (const record of [scan(), { ...scan(), runtimeArtifacts: null, snapshot: { certscore_overall: 100, scan_no_go_assessment: retained.runtimeArtifacts.scanNoGoAssessment } }]) {
    const resource = buildApiV2ScanResource(record);
    const status = buildApiV2ScanStatus(record);
    assert.equal(resource.score, null);
    assert.equal(resource.noGo?.reasonCode, "authentication_required");
    assert.equal(status.score, null);
    assert.equal(status.noGo?.reasonCode, "authentication_required");
  }
  assert.equal(buildPulseNoGoState(scan().runtimeArtifacts)?.noGo.reasonCode, "authentication_required");
});

test("the production projection writer withholds score and top findings before database persistence", async () => {
  const { deriveScanReportProjection } = await import("./scan-report-projection");
  const record = scan();
  // Host ranking is unrelated to eligibility; omit it so this replay has no DB lookup.
  record.scan.domainHostname = null;
  const { value, canonicalReportProjection } = await deriveScanReportProjection(record);
  assert.equal(value.score, null);
  assert.equal(value.scoreSource, null);
  assert.equal(value.scoreVersion, null);
  assert.equal(value.topFindingCount, 0);
  assert.equal(value.findingCount, 0);
  assert.equal(canonicalReportProjection.legacyScoreAssessmentInput.scoreValue, null);
  assert.deepEqual(canonicalReportProjection.topFindingIds, []);
});
