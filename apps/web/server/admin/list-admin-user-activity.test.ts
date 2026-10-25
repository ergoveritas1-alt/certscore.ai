import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";

const compiled = build({
  entryPoints: [resolve("apps/web/server/admin/list-admin-user-activity.ts")],
  bundle: true, write: false, platform: "node", format: "cjs",
  plugins: [{ name: "activity-io", setup(builder) {
    const fixtures: Record<string, string> = {
      "@website-signal-risk-scanner/db": "export const query = (...args) => fixture.query(...args); export const queryOne = async (...args) => (await fixture.query(...args)).rows[0] ?? null;",
      "./platform-admin": "export const requirePlatformAdminContext = () => fixture.authorize();"
    };
    builder.onResolve({ filter: /.*/ }, ({ path }) => path in fixtures ? { path, namespace: "fixture" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: fixtures[path]!, loader: "js" }));
  }}]
});

async function harness(options: { deny?: boolean; missingUser?: boolean; associatedScans?: number; eventCount?: number; forbid?: "events" | "scans"; scanRows?: Array<Record<string, unknown>> } = {}) {
  const calls: Array<{ kind: string; values: unknown[] }> = [];
  let authorized = false;
  const fixture = {
    authorize() { if (options.deny) throw new Error("Unauthorized"); authorized = true; },
    async query(sql: string, values: unknown[], mode: { readOnly?: boolean }) {
      assert.equal(authorized, true);
      assert.equal(mode.readOnly, true);
      assert.equal(values[0], "user-fixture");
      assert.doesNotMatch(sql, /create |insert |update |delete /i);
      let kind: string, rows: unknown[];
      if (sql.includes("with selected_membership")) {
        kind = "user";
        rows = options.missingUser ? [] : [{ id: "user-fixture", email: "owner@example.com", full_name: null, created_at: "2026-10-01", last_login_at: null, organization_name: null }];
      } else if (sql.includes("product_analytics_events")) {
        assert.notEqual(options.forbid, "events", "Inactive event history was queried");
        kind = sql.includes("select count(*)") ? "event-count" : "event-rows";
        rows = kind === "event-count" ? [{ count: options.eventCount ?? 41 }] : [{ event_id: `event-offset-${values[2]}` }];
      } else {
        assert.notEqual(options.forbid, "scans", "Inactive scan history was queried");
        if (sql.includes("as associated_scans")) { kind = "scan-metrics"; rows = [{ associated_scans: options.associatedScans ?? 16, total_scans: 15, completed_scans: 14, domains: 3 }]; }
        else if (sql.includes("select scans.id")) { kind = "scan-rows"; rows = options.scanRows ?? [{ id: `scan-offset-${values[2]}`, association: "submitted", pages_scanned: 1, full_site_pages_scanned: null, status: "completed" }]; }
        else if (sql.includes("select scans.status")) { kind = "scan-status"; rows = [{ status: "completed", count: 14 }]; }
        else if (sql.includes("as scan_request_count")) { kind = "requests"; rows = [{ scan_request_count: 20, last_scan_requested_at: "2026-10-25" }]; }
        else if (sql.includes("as api_route")) { kind = "api-routes"; rows = [{ api_route: "SDK", count: 3, channels: ["sdk"], last_requested_at: "2026-10-25" }]; }
        else throw new Error("Unexpected activity query");
      }
      calls.push({ kind, values });
      return { rows };
    }
  };
  const module = { exports: {} as { loadAdminUserActivity: (...args: unknown[]) => Promise<any> } };
  runInNewContext((await compiled).outputFiles![0]!.text, { module, exports: module.exports, fixture });
  return { load: module.exports.loadAdminUserActivity, calls };
}

test("scan activity is the default and never reads the inactive event history", async () => {
  const { load, calls } = await harness({ forbid: "events" });
  const result = await load(" user-fixture ");
  assert.equal(result.tab, "scans");
  assert.equal(result.page, 1);
  assert.equal(result.metrics.associatedScans, 16);
  assert.equal(result.scans.length, 1);
  assert.equal(result.apiRoutes.find((route: { route: string }) => route.route === "SDK").count, 3);
  assert.equal("events" in result, false);
  assert.equal(calls.length, 6);
});

test("logged-in activity reads only the account and selected event page/count", async () => {
  const { load, calls } = await harness({ forbid: "scans" });
  const result = await load("user-fixture", 10, 0, 20, 20, "events");
  assert.equal(result.tab, "events");
  assert.equal(result.page, 2);
  assert.equal(result.eventCount, 41);
  assert.equal(result.events[0].event_id, "event-offset-20");
  assert.equal("metrics" in result, false);
  assert.equal("scans" in result, false);
  assert.equal(calls.length, 3);
});

test("user scan activity uses full-site captures rather than the starting-page count", async () => {
  const scanRows = [
    { id: "cotp-eu-de", pages_scanned: 1, full_site_pages_scanned: 270 },
    { id: "cotp-eu-ir", pages_scanned: 1, full_site_pages_scanned: 171 },
    { id: "single-page", pages_scanned: 1, full_site_pages_scanned: null },
    { id: "legacy-multiple-pages", pages_scanned: 3, full_site_pages_scanned: null },
    { id: "crawl-not-captured", pages_scanned: 1, full_site_pages_scanned: 0 },
  ];
  const { load, calls } = await harness({ forbid: "events", scanRows });
  const result = await load("user-fixture");
  assert.deepEqual(Array.from(result.scans, (scan: { pagesScanned: number }) => scan.pagesScanned), [270, 171, 1, 3, 0]);
  assert.equal(calls.length, 6);
});

test("out-of-range scan pagination repeats only the bounded scan-row read", async () => {
  const { load, calls } = await harness();
  const result = await load("user-fixture", 10, 1000);
  assert.equal(result.page, 2);
  assert.equal(result.scans[0].id, "scan-offset-10");
  assert.equal(calls.filter(call => call.kind === "scan-rows").length, 2);
  assert.equal(calls.filter(call => call.kind === "user").length, 1);
  assert.equal(calls.filter(call => call.kind === "scan-metrics").length, 1);
  assert.equal(calls.length, 7);
});

test("out-of-range event pagination repeats only the event-row read", async () => {
  const { load, calls } = await harness({ forbid: "scans" });
  const result = await load("user-fixture", 10, 0, 20, 1000, "events");
  assert.equal(result.page, 3);
  assert.equal(result.events[0].event_id, "event-offset-40");
  assert.equal(calls.filter(call => call.kind === "event-count").length, 1);
  assert.equal(calls.length, 4);
});

test("zero-count pages clamp to page one and query limits remain bounded", async () => {
  const { load, calls } = await harness({ associatedScans: 0 });
  const result = await load("user-fixture", 1000, 1000);
  assert.equal(result.page, 1);
  assert.equal(calls.filter(call => call.kind === "scan-rows").every(call => call.values[1] === 100), true);
  assert.equal(calls.at(-1)?.values[2], 0);
});

test("authorization and missing users prevent all unrelated history reads", async () => {
  const denied = await harness({ deny: true });
  await assert.rejects(denied.load("user-fixture"), /Unauthorized/);
  assert.equal(denied.calls.length, 0);
  const missing = await harness({ missingUser: true });
  assert.equal(await missing.load("user-fixture"), null);
  assert.equal(missing.calls.length, 1);
  assert.equal(await missing.load(" "), null);
  assert.equal(missing.calls.length, 1);
});

test("event reads retain the user boundary, 90-day window and stable pagination order", async () => {
  const source = await readFile("apps/web/server/admin/list-admin-user-activity.ts", "utf8");
  assert.match(source, /where e\.user_id = \$1 and e\.occurred_at >= now\(\) - interval '90 days'/);
  assert.match(source, /order by e\.occurred_at desc, e\.event_id desc/);
  assert.doesNotMatch(source, /ensureScanRequestLogTable/);
});
