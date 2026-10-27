import assert from "node:assert/strict";
import test from "node:test";
import type { FullSiteReportResponse } from "../../server/scans/full-site-report";
import { readFullSiteReportSessionCache, writeFullSiteReportSessionCache, readFullSitePreviewSessionCache, writeFullSitePreviewSessionCache } from "./full-site-report-session-cache";
import type { FullSiteReportPreview } from "../../server/scans/full-site-report";

function fixture(status = "completed", score: number | null = 78) {
  return { score: score === null ? null : { value: score, priorityReview: [] }, summary: { state: { status }, counts: { active: 0 } } } as FullSiteReportResponse;
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

test("compact first view is scoped, expiring and excludes transient or oversized results", () => {
  const storage = memoryStorage();
  const preview = { ...fixture(), version: "full-site-report-preview.v1", cacheable: true,
    summary: { ...fixture().summary, state: { ...fixture().summary.state, scanId: "scan-a" } },
    forms: {count:0,limited:false}, hiddenLinks:null, hiddenLinkDestinations:[], failedPages:[], homepageUrl:null,
  } as FullSiteReportPreview;
  assert.equal(writeFullSitePreviewSessionCache(storage, "scan-a", "scope", preview, 1000), true);
  assert.deepEqual(readFullSitePreviewSessionCache(storage, "scan-a", "scope", 2000), preview);
  for (const [scan, scope, now] of [["scan-b", "scope", 2000], ["scan-a", "other", 2000], ["scan-a", "scope", 999], ["scan-a", "scope", 3_601_001]] as const)
    assert.equal(readFullSitePreviewSessionCache(storage, scan, scope, now), null);
  assert.equal(writeFullSitePreviewSessionCache(storage, "scan-a", "scope", {...preview, cacheable:false}, 2000), false);
  assert.equal(writeFullSitePreviewSessionCache(storage, "scan-a", "scope", {...preview, score:null}, 2000), false);
  assert.equal(writeFullSitePreviewSessionCache(storage, "scan-a", "scope", {...preview, extra:"x".repeat(500_000)} as FullSiteReportPreview, 2000), false);
  assert.equal(writeFullSitePreviewSessionCache({setItem(){throw new Error("Quota");}}, "scan-a", "scope", preview, 2000), false);
  storage.setItem("certscore:full-site-overview:v1", "malformed");
  assert.equal(readFullSitePreviewSessionCache(storage, "scan-a", "scope", 2000), null);
});

test("completed report survives a reload only for the same scan and signed-in scope", () => {
  const storage = memoryStorage();
  const report = fixture();
  assert.equal(writeFullSiteReportSessionCache(storage, "scan-a", "org:user:generation", report, 1000), true);
  assert.deepEqual(readFullSiteReportSessionCache(storage, "scan-a", "org:user:generation", 2000), report);
  assert.equal(readFullSiteReportSessionCache(storage, "scan-b", "org:user:generation", 2000), null);
  assert.equal(readFullSiteReportSessionCache(storage, "scan-a", "org:other-user:generation", 2000), null);
  assert.equal(readFullSiteReportSessionCache(storage, "scan-a", "org:user:generation", 3_602_001), null);
});

test("incomplete and oversized reports are not cached", () => {
  const storage = memoryStorage();
  assert.equal(writeFullSiteReportSessionCache(storage, "scan-a", "scope", fixture("running"), 1000), false);
  assert.equal(writeFullSiteReportSessionCache(storage, "scan-a", "scope", fixture("completed", null), 1000), false);
  const active = fixture();
  active.summary.counts.active = 1;
  assert.equal(writeFullSiteReportSessionCache(storage, "scan-a", "scope", active, 1000), false);
  assert.equal(readFullSiteReportSessionCache(storage, "scan-a", "scope", 2000), null);
  const oversized = { ...fixture(), large: "x".repeat(4_000_000) } as FullSiteReportResponse;
  assert.equal(writeFullSiteReportSessionCache(storage, "scan-a", "scope", oversized, 1000), false);
});

test("a report larger than the old cutoff can be restored after refresh", () => {
  const storage = memoryStorage();
  const report = { ...fixture(), large: "x".repeat(1_600_000) } as FullSiteReportResponse;
  assert.equal(writeFullSiteReportSessionCache(storage, "scan-a", "scope", report, 1000), true);
  assert.deepEqual(readFullSiteReportSessionCache(storage, "scan-a", "scope", 2000), report);
});


test("reports cached before accessibility grouping are not restored", () => {
  const storage = memoryStorage();
  const legacy = JSON.stringify({ version: 1, scanId: "scan-a", scope: "scope", savedAt: 1000, data: fixture() });
  storage.setItem("certscore:full-site-report:v1", legacy);
  assert.equal(readFullSiteReportSessionCache(storage, "scan-a", "scope", 2000), null);
  assert.equal(writeFullSiteReportSessionCache(storage, "scan-a", "scope", fixture(), 2000), true);
  assert.deepEqual(readFullSiteReportSessionCache(storage, "scan-a", "scope", 3000), fixture());
});


test("cached split accessibility priorities use current grouping without changing the score", () => {
  const storage = memoryStorage();
  const report = fixture();
  const priorities = ["semantic_labeling_accessibility_issue", "visual_contrast_accessibility_issue"].map((id, index) => ({
    id, rank: index + 1, title: id, summary: "Retained issue", status: "Observed" as const, priority: "high" as const,
    evidence: ["Retained evidence"], evidenceJson: { findingId: id }, correctionSteps: ["Fix the affected elements"],
    pages: [{ id: "home", url: "https://example.test/", homepage: true }],
  }));
  report.score!.priorityReview = priorities;
  assert.equal(writeFullSiteReportSessionCache(storage, "scan-a", "scope", report, 1000), true);
  const restored = readFullSiteReportSessionCache(storage, "scan-a", "scope", 2000)!;
  assert.equal(restored.score!.value, 78);
  assert.equal(restored.score!.priorityReview.length, 1);
  assert.equal(restored.score!.priorityReview[0]!.id, "accessibility_priority_group");
  assert.deepEqual(restored.score!.priorityReview[0]!.evidenceJson.findings, priorities);
  assert.equal(report.score!.priorityReview.length, 2, "the stored source is not mutated");
});
