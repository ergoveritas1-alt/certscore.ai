import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pages = [
  readFileSync("apps/web/app/app/admin/scans/page.tsx", "utf8"),
  readFileSync("apps/web/app/app/admin/analytics/page.tsx", "utf8"),
  readFileSync("apps/web/app/app/admin/mcp/page.tsx", "utf8"),
  readFileSync("apps/web/app/app/admin/pulse/page.tsx", "utf8"),
];
const component = readFileSync("apps/web/components/admin/admin-operational-snapshot.tsx", "utf8");
const contract = readFileSync("apps/web/lib/admin/admin-operational-snapshot.ts", "utf8");
const caches = [
  readFileSync("apps/web/server/admin/admin-query-cache.ts", "utf8"),
  readFileSync("apps/web/server/admin/list-pulse-requests.ts", "utf8"),
  readFileSync("apps/web/server/admin/mcp-telemetry.ts", "utf8"),
  readFileSync("apps/web/server/admin/product-analytics.ts", "utf8"),
];

test("all four operational snapshots share the same shell and period contract", () => {
  for (const page of pages) {
    assert.match(page, /<AdminOperationalSnapshot/);
    assert.match(page, /adminOperationalSnapshotHealth/);
    assert.match(page, /adminOperationalSnapshotDelta/);
  }
  assert.match(component, /<CardTitle>Operational snapshot<\/CardTitle>/);
  assert.match(component, /Pacific time/);
  assert.match(component, /name="snapshot"/);
  assert.match(component, /grid grid-cols-3 gap-px bg-slate-100 sm:grid-cols-6/);
  assert.match(component, /lg:grid-cols-\[1\.4fr_1fr\]/);
  assert.match(component, /grid grid-cols-3 gap-1\.5/);
  assert.match(contract, /\["1h", "24h", "7d", "30d", "1y"\]/);
});

test("all four snapshot periods survive table filtering", () => {
  for (const page of pages) {
    assert.match(page, /<input name="snapshot" type="hidden"/);
  }
});

test("all four operational snapshots cache expensive aggregation for fast refreshes", () => {
  for (const source of caches) {
    assert.match(source, /unstable_cache/);
    assert.match(source, /revalidate: 30/);
  }
});

test("all four dashboards time snapshots and rows independently", () => {
  const timingLabels = [
    ["app.admin.scans.operational_snapshot", "app.admin.scans.list"],
    ["app.admin.events.operational_snapshot", "app.admin.events.rows"],
    ["app.admin.mcp_telemetry", "app.admin.mcp_telemetry.rows"],
    ["app.admin.api_activity.operational_snapshot", "app.admin.api_activity.rows"],
  ];
  pages.forEach((page, index) => {
    for (const label of timingLabels[index] ?? []) assert.match(page, new RegExp(label.replaceAll(".", "\\.")));
    assert.match(page, /Promise\.all/);
  });
});

test("all four activity ledgers expose cross-dashboard correlation links", () => {
  for (const page of pages) {
    for (const destination of ["/app/admin/scans", "/app/admin/analytics", "/app/admin/pulse", "/app/admin/mcp"]) {
      assert.match(page, new RegExp(destination.replaceAll("/", "\\/")));
    }
  }
});
