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

test("recent scan database reuse is scoped to anonymous or the requesting organization", () => {
  const source = readFileSync("apps/web/server/scans/recent-scan-reuse.ts", "utf8");

  assert.match(source, /s\.organization_id is null and d\.organization_id is null/);
  assert.match(source, /s\.organization_id is not distinct from \$\{organizationParameter\}::uuid/);
  assert.match(source, /d\.organization_id is not distinct from \$\{organizationParameter\}::uuid/);
  assert.doesNotMatch(source, /allowCrossWorkspace/);
});

test("recent scan database reuse is limited to completed full scans", () => {
  const source = readFileSync("apps/web/server/scans/recent-scan-reuse.ts", "utf8");

  assert.match(source, /s\.status = 'completed'/);
  assert.match(source, /coalesce\(s\.scan_type, 'full'\) = 'full'/);
});

test("full scan creation and reuse availability both require sufficient reusable coverage", () => {
  const createFullScanSource = readFileSync("apps/web/server/scans/create-full-scan.ts", "utf8");
  const anonymousFullScanSource = readFileSync("apps/web/server/scans/create-anonymous-full-scan.ts", "utf8");
  const availabilitySource = readFileSync("apps/web/app/api/full-scan/reuse-availability/route.ts", "utf8");

  assert.match(createFullScanSource, /minPagesRequested: pagesRequested/);
  assert.match(anonymousFullScanSource, /: pagesRequested/);
  assert.match(availabilitySource, /getPlanLimits\(dashboardContext\?\.organization\.plan \?\? "free"\)/);
  assert.match(availabilitySource, /minPagesRequested: planLimits\.maxPagesPerScan/);
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
