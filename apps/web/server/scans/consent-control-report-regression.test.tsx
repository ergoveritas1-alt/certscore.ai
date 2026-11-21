import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { deriveConsentControlAssessment } from "@certscore/contracts";
import { z } from "zod";
import { isAfterActionReportEligible } from "../../lib/scans/after-action-report-eligibility";
import retained from "../../lib/scans/test-fixtures/sits-retained-consent-assessment-20261005.json";
import type { ScanDetailResponse } from "./get-scan-by-id";
import { getPersistedCanonicalReportProjection } from "./persisted-canonical-report-projection";
import { buildPersistedScanReportProjection, readPersistedScanReportProjection, SCAN_REPORT_PROJECTION_VERSION } from "./scan-report-projection-contract";

Object.assign(globalThis, { React });
const require = createRequire(import.meta.url);
(require.cache as Record<string, unknown>)[require.resolve("server-only")] = { exports: {}, loaded: true };

function reportRecord(scanId: string, pageUrl: string, assessment: unknown) {
  return {
    scan: { id: scanId, status: "completed", domainHostname: new URL(pageUrl).hostname, pageUrl,
      createdAt: retained.capturedAt, completedAt: retained.capturedAt, scanConfigJson: null },
    domainBenchmark: null, signals: [], validationFindings: [], trackerVendors: [],
    policyEnrichment: [], policyReviewQueue: [], preconsentViolations: [], events: [],
    snapshot: { certscore_overall: 56 }, runtimeArtifacts: { consentControlAssessment: assessment },
    canonicalReportProjection: {
      artifactVersion: "persisted-canonical-report-projection-v2", consentControlSummary: null,
      checklistRows: [], collectionSurfaceAssessment: null, derivedContext: {}, globalUnifiedFindings: [],
      legacyScoreAssessmentInput: { scanId: scanId }, normalizedConcerns: [],
      ownerUnifiedFindings: [], topFindingIds: [],
    },
  } as unknown as ScanDetailResponse;
}

test("retained SITS limited consent visit renders all three binary controls in public and authenticated reports", async () => {
  const { buildTimelineReportModel } = await import("../../components/scans/report-lab/timeline-report-model");
  const { ShadowScanReport } = await import("../../components/scans/report-lab/shadow-scan-report");
  const record = reportRecord(retained.sourceScanId, "https://sits.com/en/", structuredClone(retained.assessment));
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

const bannerRows = z.array(z.tuple([z.string(), z.enum(["accept_all", "reject_all", "manage_preferences"])]));
const replayFile = new URL("../../../../artifacts/daily-scan-audit/runs/20261120-local-necessary-cookie-reporting/replay.json", import.meta.url);
const { cases } = z.object({ cases: z.array(z.object({
  domain: z.string(), scanId: z.string(), before: bannerRows, after: bannerRows,
  rejectObservedBefore: z.boolean(), acceptObservedBefore: z.boolean(),
})) }).parse(JSON.parse(readFileSync(replayFile, "utf8")));

for (const banner of cases) {
  test(`retained ${banner.domain} banner renders consistent first-layer choices and CMP details`, async () => {
    const { buildTimelineReportModel } = await import("../../components/scans/report-lab/timeline-report-model");
    const { EvidenceDirectory } = await import("../../components/scans/report-lab/shadow-scan-report");
    const url = `https://${banner.domain}/`;
    const assessment = deriveConsentControlAssessment({
      scan: { scanId: banner.scanId, requestedUrl: url, finalUrl: url },
      document: { identityStatus: "matched", canonicalDocumentId: url },
      coverage: { status: "complete", completedChannels: ["dom_inventory", "geometry"] },
      observations: [{
        observationId: "retained-banner", documentId: url, observedAtMs: 0, likelyPresent: true,
        captureStatus: "observed", layerInspected: "first_layer", inventoryOutcome: "complete_with_controls",
        controls: banner.before.map(([label, actionType], i) => ({
          label, actionType, evidenceId: `row-${i}`, layer: "first_layer", visible: true, actionable: true,
        })),
      }],
    });
    const before = structuredClone(assessment);
    const record = reportRecord(banner.scanId, url, assessment);
    const report = buildTimelineReportModel(record);
    if (report.resultDisposition === "no_go") throw new Error("Expected usable report");
    const hasOptions = banner.domain === "unibo.it";
    assert.deepEqual(report.controls, { accept: "Observed", reject: "Observed", options: hasOptions ? "Observed" : "Not observed" });
    assert.equal(report.cmpAudit?.experience?.controls?.reject, "observed");
    const reject = report.cmpAudit?.rows.find(row => row.id === "reject");
    assert.equal(reject?.status, "Observed");
    if (!banner.rejectObservedBefore) assert.ok(reject?.sourceIds.some(id => assessment.evidence.some(row =>
      row.evidenceId === id && banner.after.some(([label, kind]) => label === row.label && kind === "reject_all"))));
    const html = renderToStaticMarkup(<EvidenceDirectory report={report} />);
    assert.match(html, new RegExp(`${hasOptions ? 3 : 2} of 3 controls observed`));
    assert.match(html, />reject<\/dt><dd[^>]*>Observed<\/dd>/);
    assert.match(html, /Reject or an equivalent refusal option was available on the banner/);
    assert.equal(isAfterActionReportEligible(assessment, "reject"), banner.rejectObservedBefore);
    assert.equal(isAfterActionReportEligible(assessment, "accept"), banner.acceptObservedBefore);
    assert.deepEqual(assessment, before);
    assert.equal(report.score.value, 56);
  });
}
