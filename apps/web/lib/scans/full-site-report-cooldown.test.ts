import assert from "node:assert/strict";
import test from "node:test";
import { clearFullSiteReportCooldown, readFullSiteReportCooldown, saveFullSiteReportCooldown } from "./full-site-report-cooldown";

test("server read cooldown survives refresh for the same scan and expires", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const until = saveFullSiteReportCooldown(storage, "scan-a", "407", 1_000);
  assert.equal(until, 408_000);
  assert.equal(readFullSiteReportCooldown(storage, "scan-a", 2_000), until);
  assert.equal(readFullSiteReportCooldown(storage, "scan-b", 2_000), 0);
  assert.equal(readFullSiteReportCooldown(storage, "scan-a", until), 0);
  clearFullSiteReportCooldown(storage, "scan-a");
  assert.equal(readFullSiteReportCooldown(storage, "scan-a", 2_000), 0);
});

test("invalid retry headers use a bounded fallback", () => {
  const storage = { getItem() { return null; }, setItem() {} };
  assert.equal(saveFullSiteReportCooldown(storage, "scan", null, 1_000), 61_000);
  assert.equal(saveFullSiteReportCooldown(storage, "scan", "nonsense", 1_000), 61_000);
});
