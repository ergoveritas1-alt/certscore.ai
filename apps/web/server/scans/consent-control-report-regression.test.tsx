import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import retained from "../../lib/scans/test-fixtures/sits-retained-consent-assessment-20261005.json";
import type { ScanDetailResponse } from "./get-scan-by-id";
import { getPersistedCanonicalReportProjection } from "./persisted-canonical-report-projection";
import { buildPersistedScanReportProjection, readPersistedScanReportProjection, SCAN_REPORT_PROJECTION_VERSION } from "./scan-report-projection-contract";

Object.assign(globalThis, { React });
const require = createRequire(import.meta.url);
(require.cache as Record<string, unknown>)[require.resolve("server-only")] = { exports: {}, loaded: true };

test("retained SITS limited consent visit renders all three binary controls in public and authenticated reports", async () => {
  const { buildTimelineReportModel } = await import("../../components/scans/report-lab/timeline-report-model");
  const { ShadowScanReport } = await import("../../components/scans/report-lab/shadow-scan-report");
  const record = {
    scan: { id: retained.sourceScanId, status: "completed", domainHostname: "sits.com", pageUrl: "https://sits.com/en/",
      createdAt: retained.capturedAt, completedAt: retained.capturedAt, scanConfigJson: null },
    domainBenchmark: null, signals: [], validationFindings: [], trackerVendors: [],
    policyEnrichment: [], policyReviewQueue: [], preconsentViolations: [], events: [],
    snapshot: { certscore_overall: 56 }, runtimeArtifacts: { consentControlAssessment: structuredClone(retained.assessment) },
    canonicalReportProjection: {
      artifactVersion: "persisted-canonical-report-projection-v2", consentControlSummary: null,
      checklistRows: [], collectionSurfaceAssessment: null, derivedContext: {}, globalUnifiedFindings: [],
      legacyScoreAssessmentInput: { scanId: retained.sourceScanId }, normalizedConcerns: [],
      ownerUnifiedFindings: [], topFindingIds: [],
    },
  } as unknown as ScanDetailResponse;
  const before = structuredClone(record);
  const persisted = buildPersistedScanReportProjection(record);
  const hydrated = readPersistedScanReportProjection({ scan: record.scan, snapshot: {
    report_projection_computed_at: retained.capturedAt, report_projection_payload: persisted.payload,
    report_projection_payload_sha256: persisted.sha256, report_projection_payload_size_bytes: persisted.sizeBytes,
    report_projection_status: "ready", report_projection_version: SCAN_REPORT_PROJECTION_VERSION,
  } });
  assert.ok(hydrated);
  const canonical = getPersistedCanonicalReportProjection(hydrated);
  assert.equal(canonical?.consentControlSummary?.policyVersion, "observed_control_report.v2");
  assert.equal(canonical?.consentControlSummary?.sourceHash, retained.assessment.provenance.sourceHash);
  assert.deepEqual(hydrated.runtimeArtifacts?.consentControlAssessment, retained.assessment);
  assert.deepEqual(record, before);
  const report = buildTimelineReportModel(hydrated);
  if (report.resultDisposition === "no_go") throw new Error("Expected usable report");
  assert.equal(report.consentControlsAvailable, true);
  assert.deepEqual(report.controls, { accept: "Not observed", reject: "Not observed", options: "Not observed" });
  assert.equal(report.score.value, 56);
  assert.equal(report.acceptPath, null);
  assert.equal(report.rejectPath, null);
  assert.deepEqual(report.findings, []);
  const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
  for (const mode of ["authenticated", "public"] as const) {
    const html = renderToStaticMarkup(
      <AppRouterContext.Provider value={router}>
        <PathnameContext.Provider value={mode === "public" ? "/scan/fixture" : "/app/scans/fixture"}>
          <ShadowScanReport mode={mode} variant="timeline" report={report} />
        </PathnameContext.Provider>
      </AppRouterContext.Provider>,
    );
    assert.ok((html.match(/>Not observed</g) ?? []).length >= 3, "all three control statuses render");
    for (const label of ["Accept", "Reject", "Options"]) assert.match(html, new RegExp(`>${label}<`));
    assert.doesNotMatch(html, />Unknown<|consent inspection is incomplete/i);
  }
});
