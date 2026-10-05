import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { collectionSurfaceAssessmentSchema, type CollectionSurfaceAssessment } from "@certscore/contracts";
import retained from "../../lib/scans/test-fixtures/loading-form-inventory-20261005.json";
import type { ScanDetailResponse } from "./get-scan-by-id";
import { getPersistedCanonicalReportProjection } from "./persisted-canonical-report-projection";
import { buildPersistedScanReportProjection, readPersistedScanReportProjection, SCAN_REPORT_PROJECTION_VERSION } from "./scan-report-projection-contract";

Object.assign(globalThis, { React });
const require = createRequire(import.meta.url);
(require.cache as Record<string, unknown>)[require.resolve("server-only")] = { exports: {}, loaded: true };

const loadingAssessment = collectionSurfaceAssessmentSchema.parse(retained);

for (const state of ["loading", "unsettled", "unverifiable", "missing", "complete_empty"] as const) {
  test(`persisted ${state} form coverage reaches the actual report without manufacturing absence`, async () => {
    const { buildTimelineReportModel } = await import("../../components/scans/report-lab/timeline-report-model");
    const { ShadowScanReport } = await import("../../components/scans/report-lab/shadow-scan-report");
    const assessment: CollectionSurfaceAssessment | null = state === "missing" ? null : {
      ...structuredClone(loadingAssessment),
      ...(state === "unsettled" ? {
        coverage: { ...loadingAssessment.coverage!, reasonCodes: ["document_settle_incomplete"] },
        limitationKeys: ["document_settle_incomplete"],
      } : {}),
      ...(state === "complete_empty" || state === "unverifiable" ? {
        assessmentStatus: state === "complete_empty" ? "not_observed" as const : "not_testable" as const,
        coverage: { ...loadingAssessment.coverage!, status: "complete" as const, reasonCodes: [] },
        limitationKeys: state === "unverifiable" ? ["collection_surface_document_mismatch"] : [],
      } : {}),
    };
    const record = {
      scan: { id: retained.scanId, status: "completed", domainHostname: "sits.com", pageUrl: retained.pageUrl,
        createdAt: retained.assessedAt, completedAt: retained.assessedAt, scanConfigJson: null },
      domainBenchmark: null, signals: [], validationFindings: [], trackerVendors: [],
      policyEnrichment: [], policyReviewQueue: [], preconsentViolations: [], events: [],
      snapshot: { certscore_overall: 100 }, runtimeArtifacts: null,
      canonicalReportProjection: {
        artifactVersion: "persisted-canonical-report-projection-v2", checklistRows: [],
        collectionSurfaceAssessment: assessment, derivedContext: {}, globalUnifiedFindings: [],
        legacyScoreAssessmentInput: { scanId: retained.scanId }, normalizedConcerns: [],
        ownerUnifiedFindings: [], topFindingIds: [],
      },
    } as unknown as ScanDetailResponse;
    const persisted = buildPersistedScanReportProjection(record);
    const hydrated = readPersistedScanReportProjection({ scan: record.scan, snapshot: {
      report_projection_computed_at: retained.assessedAt,
      report_projection_payload: persisted.payload,
      report_projection_payload_sha256: persisted.sha256,
      report_projection_payload_size_bytes: persisted.sizeBytes,
      report_projection_status: "ready", report_projection_version: SCAN_REPORT_PROJECTION_VERSION,
    } });
    assert.ok(hydrated);
    const report = buildTimelineReportModel(hydrated);
    assert.equal(report.resultDisposition, undefined);
    if (report.resultDisposition === "no_go") throw new Error("Expected usable report");
    assert.deepEqual(report.collectionTableRows, []);
    assert.equal(report.collectionCoverage?.pagesWithoutInventory, state === "missing" ? 1 : 0);
    assert.equal(report.collectionCoverage?.limitedPages, ["loading", "unsettled", "unverifiable"].includes(state) ? 1 : 0);
    assert.equal(report.score.value, 100);
    assert.deepEqual(report.findings, []);
    assert.deepEqual(getPersistedCanonicalReportProjection(hydrated)?.collectionSurfaceAssessment, assessment);
    const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
    for (const mode of ["authenticated", "public"] as const) {
      const html = renderToStaticMarkup(
        <AppRouterContext.Provider value={router}>
          <PathnameContext.Provider value={mode === "public" ? "/scan/fixture" : "/app/scans/fixture"}>
            <ShadowScanReport mode={mode} variant="timeline" report={report} />
          </PathnameContext.Provider>
        </AppRouterContext.Provider>,
      );
      const section = html.match(/<section id="report-forms"[\s\S]*?<\/section>/)?.[0];
      assert.ok(section, "rendered report includes its forms section");
      if (state === "complete_empty") assert.match(section, /no forms observed on the scanned pages/);
      else {
        assert.match(section, /form coverage is incomplete/);
        assert.doesNotMatch(section, /no forms observed|No forms were observed/);
      }
    }
  });
}
