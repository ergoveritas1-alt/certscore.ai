import assert from "node:assert/strict";
import test from "node:test";
import type { FullSiteReportResponse } from "../../server/scans/full-site-report";
import { readFullSiteReportSessionCache, writeFullSiteReportSessionCache } from "./full-site-report-session-cache";

function fixture(status = "completed", score: number | null = 78) {
  return { score: score === null ? null : { value: score }, summary: { state: { status }, counts: { active: 0 } } } as FullSiteReportResponse;
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

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
