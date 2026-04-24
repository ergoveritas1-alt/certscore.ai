import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyBaselineDeltas } from "./report-production-finding-frequency";

function makeReport(scanCount: number) {
  return {
    generatedAt: "2026-04-24T00:00:00.000Z",
    scope: {
      completedFrom: "2026-04-18T00:00:00.000Z",
      completedTo: "2026-04-23T00:00:00.000Z",
      distinctDomains: 1,
      distinctOrganizations: 1,
      scanCount: 100,
      scanType: "full"
    },
    statusCounts: {
      auditOnly: 0,
      review: 0,
      surface: scanCount,
      totalOwnerFindings: scanCount
    },
    topFindings: [
      {
        auditOnlyCount: 0,
        auditOnlyScanCount: 0,
        anyStatusScanCount: scanCount,
        findingId: "preconsent_tracking",
        reviewCount: 0,
        reviewScanCount: 0,
        sampleSummary: "Observed vendor activity before consent.",
        scanCount,
        scanPct: scanCount,
        surfaceCount: scanCount
      }
    ]
  };
}

test("production finding report applies baseline deltas", () => {
  const dir = mkdtempSync(join(tmpdir(), "production-finding-frequency-"));
  const baselinePath = join(dir, "baseline.json");
  writeFileSync(baselinePath, JSON.stringify(makeReport(40)), "utf8");

  const report = applyBaselineDeltas(makeReport(45), baselinePath);

  assert.equal(report.topFindings[0]?.deltaScanCount, 5);
  assert.equal(report.topFindings[0]?.deltaScanPct, 5);
});
