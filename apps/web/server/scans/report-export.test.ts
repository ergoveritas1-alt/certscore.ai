import assert from "node:assert/strict";
import test from "node:test";
import type { ScanDetailResponse } from "./get-scan-by-id";
import { buildCanonicalReportExport } from "./report-export";

function scanRecord(): ScanDetailResponse {
  const scanId = "00000000-0000-0000-0000-000000000001";
  return {
    scan: {
      id: scanId,
      domainHostname: "example.test",
      status: "completed",
      scanType: "full",
      scanFromValue: "eu_ie",
      createdAt: "2026-08-24T00:00:00.000Z",
      startedAt: "2026-08-24T00:00:01.000Z",
      completedAt: "2026-08-24T00:00:20.000Z",
      durationMs: 19_000,
      pagesRequested: 1,
      pagesScanned: 1,
    },
    canonicalReportProjection: {
      artifactVersion: "persisted-canonical-report-projection-v2",
      checklistRows: [],
      derivedContext: {},
      globalUnifiedFindings: [],
      legacyScoreAssessmentInput: { scanId },
      normalizedConcerns: [],
      ownerUnifiedFindings: [],
      topFindingIds: [],
    },
    runtimeArtifacts: {
      rawDisplayOnlyFinding: "must-not-be-exported",
    },
    trackerVendors: [],
  } as unknown as ScanDetailResponse;
}

test("builds downloads from the persisted canonical projection only", () => {
  const report = buildCanonicalReportExport(scanRecord());

  assert.ok(report);
  assert.equal(report.artifactVersion, "canonical-report-export-v2");
  assert.equal(report.scan.domainHostname, "example.test");
  assert.equal(report.executiveSummary.sentences.length, 3);
  assert.match(report.executiveSummary.sentences[2] ?? "", /not a determination of legal compliance/i);
  assert.deepEqual(report.projection.unifiedFindings, []);
  assert.equal(report.appendix.cookieAndTrackerInventory.summary.totalRows, 0);
  assert.doesNotMatch(JSON.stringify(report), /rawDisplayOnlyFinding|must-not-be-exported/);
  assert.ok(report.limitations.some((limitation) => limitation.code === "post_choice_effectiveness_not_tested"));
});

test("fails closed when a canonical persisted projection is unavailable", () => {
  const record = scanRecord() as unknown as Record<string, unknown>;
  delete record.canonicalReportProjection;

  assert.equal(buildCanonicalReportExport(record as unknown as ScanDetailResponse), null);
});
