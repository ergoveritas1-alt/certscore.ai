import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { findRecentCompletedScanInHistory, isScanWithinReuseWindow } from "./recent-scan-reuse";

test("recent scan reuse uses UTC instants for the 24 hour window", () => {
  const now = new Date("2026-05-19T12:00:00.000Z");

  assert.equal(isScanWithinReuseWindow({ completedAt: "2026-05-18T12:00:00.000Z", now }), true);
  assert.equal(isScanWithinReuseWindow({ completedAt: "2026-05-18T11:59:59.999Z", now }), false);
  assert.equal(isScanWithinReuseWindow({ completedAt: "2026-05-19T12:00:00.001Z", now }), false);
});

test("recent scan database reuse is isolated by scan-from value", () => {
  const source = readFileSync("apps/web/server/scans/recent-scan-reuse.ts", "utf8");

  assert.match(source, /scanFromParameter/);
  assert.match(source, /scan_config_json->>'scanFrom'/);
  assert.match(source, /DEFAULT_SCAN_FROM/);
});

test("recent scan database reuse can require a minimum requested page count", () => {
  const source = readFileSync("apps/web/server/scans/recent-scan-reuse.ts", "utf8");

  assert.match(source, /minPagesRequested/);
  assert.match(source, /Number\.isFinite\(input\.minPagesRequested\)/);
  assert.match(source, /s\.pages_requested >=/);
});

test("recent scan reuse selects the newest completed scan in the 24 hour window", () => {
  const now = new Date("2026-05-19T12:00:00.000Z");
  const recent = findRecentCompletedScanInHistory(
    [
      { completedAt: "2026-05-18T11:59:59.999Z", id: "too-old", status: "completed" },
      { completedAt: "2026-05-19T11:00:00.000Z", id: "newer", status: "completed" },
      { completedAt: "2026-05-19T10:00:00.000Z", id: "older", status: "completed" },
      { completedAt: "2026-05-19T11:59:00.000Z", id: "running-is-ignored", status: "running" }
    ],
    now
  );

  assert.equal(recent?.id, "newer");
});
