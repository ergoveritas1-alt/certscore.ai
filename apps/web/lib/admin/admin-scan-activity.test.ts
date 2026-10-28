import assert from "node:assert/strict";
import test from "node:test";
import { adminScanActivityOperationalStatus, ADMIN_SCAN_ACTIVITY_PERIODS, adminScanActivityHref, adminScanActivityWindow, resolveAdminScanActivityPeriod } from "./admin-scan-activity";

test("legacy conflicting scopes resolve to the explicit table period; new pages default to 24h", () => {
  assert.equal(resolveAdminScanActivityPeriod({ timeSpan: "31d", snapshot: "24h" }), "31d");
  assert.equal(resolveAdminScanActivityPeriod({ snapshot: "1h" }), "1h");
  assert.equal(resolveAdminScanActivityPeriod({ timeSpan: "invalid", snapshot: "7d" }), "7d");
  assert.equal(resolveAdminScanActivityPeriod({}), "24h");
});

test("all periods use one precise cutoff and adjacent equal comparison windows across DST", () => {
  const now = new Date("2026-11-01T09:30:15.123Z");
  for (const period of ADMIN_SCAN_ACTIVITY_PERIODS) {
    const window = adminScanActivityWindow(period, now);
    assert.equal(window.end, now.toISOString());
    if (period === "all") { assert.equal(window.start, null); assert.equal(window.previousStart, null); continue; }
    assert.equal(Date.parse(window.end) - Date.parse(window.start!), Date.parse(window.start!) - Date.parse(window.previousStart!));
  }
  assert.equal(adminScanActivityWindow("24h", now).start, "2026-10-31T09:30:15.123Z");
});

test("drill-down keeps every scope filter and removes stale pagination and independent snapshot", () => {
  const scope = { snapshot: "24h", timeSpan: "31d", scanFrom: "eu_de", q: "source:mcp ip!=66.*", traffic: "external", status: "any", freshness: "fresh", access: "clear", outcome: "completed_partial", language: "de", industry: "Retail", createdVia: "mcp_light", perPage: "50", page: "3" };
  const params = new URL(adminScanActivityHref(scope, { status: "completed" }), "https://certscore.ai").searchParams;
  for (const [key, value] of Object.entries(scope)) {
    if (["snapshot", "page", "status"].includes(key)) continue;
    assert.equal(params.get(key), value, key);
  }
  assert.equal(params.get("status"), "completed");
  assert.equal(params.has("snapshot"), false);
  assert.equal(params.has("page"), false);
});

test("operational state stays bound to the chart snapshot when enrichment sees a later completion", () => {
  const running = { row_kind: "scan" as const, scan_id: "run", status: "running", no_go_flag: null, access_posture_class: null };
  assert.equal(adminScanActivityOperationalStatus(running).label, "Running");
  assert.equal(adminScanActivityOperationalStatus({ ...running, status: "completed" }).label, "Completed");
  assert.equal(adminScanActivityOperationalStatus({ ...running, status: "finalizing" }).label, "Finalizing");
  assert.equal(adminScanActivityOperationalStatus({ ...running, no_go_flag: true }).label, "No-go");
  assert.equal(adminScanActivityOperationalStatus({ ...running, status: "completed", access_posture_class: "robots_limited" }).label, "Limited");
  assert.equal(adminScanActivityOperationalStatus({ ...running, row_kind: "request", scan_id: null, status: "rejected" }).label, "Rejected");
});
