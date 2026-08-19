import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("apps/web/app/app/admin/mcp/page.tsx", "utf8");
const layout = readFileSync("apps/web/app/app/admin/layout.tsx", "utf8");
const repository = readFileSync("apps/web/server/admin/mcp-telemetry.ts", "utf8");

test("Admin navigation exposes a dedicated MCP operations button", () => {
  assert.match(layout, /href: "\/app\/admin\/mcp", label: "MCP operations"/);
});

test("MCP operations page makes the request ledger the primary navigable workspace", () => {
  assert.match(page, /Light · \/mcp\/light/);
  assert.match(page, /Anonymous full · \/mcp\/anonymous/);
  assert.match(page, /Authenticated · \/mcp/);
  assert.match(page, /Self-declared headers and client names are useful routing signals/);
  assert.match(page, /MCP request activity/);
  assert.match(page, /<CardTitle>Operational snapshot<\/CardTitle>/);
  assert.match(page, /snapshotPeriods = \["1h", "24h", "7d", "30d", "1y"\]/);
  assert.match(page, /\?\? "24h"/);
  assert.match(page, /Last year \(retained data\)/);
  assert.match(page, /dashboard\.trend\.map/);
  assert.match(page, /name="toolPeriod"/);
  assert.match(page, /name="sourcePeriod"/);
  assert.match(page, /dashboard\.toolAnalytics\.label/);
  assert.match(page, /dashboard\.sourceAnalytics\.label/);
  assert.match(page, /<CardTitle>Tool distribution and latency<\/CardTitle>/);
  assert.match(page, /<CardTitle>Source and access signals<\/CardTitle>/);
  assert.match(page, /Self-declared headers and client names are useful routing signals/);
  assert.ok(page.indexOf("Tool distribution and latency") < page.indexOf("{hasActivity ? ("));
  assert.ok(page.indexOf("Source and access signals") < page.indexOf("{hasActivity ? ("));
  assert.ok(page.indexOf("Operational snapshot") < page.indexOf("MCP request activity"));
  assert.ok(page.indexOf("Operational snapshot") < page.indexOf("Tool distribution and latency"));
  assert.doesNotMatch(page, /Tool activity and latency/);
  assert.doesNotMatch(page, /Provider and access signals/);
  assert.match(page, /<AdminScansFilterForm[^>]+submitFirst>/);
  assert.match(page, /<PaginationControls/);
  assert.match(page, /sticky left-0/);
  assert.match(page, /sticky right-0/);
  assert.match(page, /getAdminAuthenticatedScanHref/);
  assert.match(page, /<details className=/);
  assert.doesNotMatch(page, /does not measure ChatGPT directory impressions/);
  assert.doesNotMatch(page, /Retention health:/);
  assert.doesNotMatch(page, /No events retained yet\. The retention target is 90 days/);
  assert.doesNotMatch(page, /Invocation telemetry/);
  assert.match(page, /Unknown source/);
  assert.match(page, /allowedAttribution/);
});

test("MCP telemetry dashboard queries bounded periods and never reads request payloads", () => {
  assert.match(repository, /SNAPSHOT_CONFIG/);
  assert.match(repository, /date_bin\('5 minutes'/);
  assert.match(repository, /date_trunc\('month'/);
  assert.match(repository, /snapshotPeriod: AdminMcpSnapshotPeriod = "24h"/);
  assert.match(repository, /toolPeriod: AdminMcpSnapshotPeriod = "24h"/);
  assert.match(repository, /sourcePeriod: AdminMcpSnapshotPeriod = "24h"/);
  assert.match(repository, /toolConfig\.bucketStart/);
  assert.match(repository, /sourceConfig\.bucketStart/);
  assert.match(repository, /snapshotConfig\.bucketStart/);
  assert.match(repository, /snapshotConfig\.bucketEnd/);
  assert.match(repository, /occurred_at >= now\(\) - interval '30 days'/);
  assert.match(repository, /limit 20/);
  assert.doesNotMatch(repository, /limit 40/);
  assert.match(repository, /MCP_TELEMETRY_RETENTION_DAYS/);
  assert.match(repository, /min\(occurred_at\) as oldest_event_at/);
  assert.match(repository, /expired_event_count/);
  assert.match(repository, /listAdminMcpTelemetryEventsPage/);
  assert.match(repository, /target_hostname ilike/);
  assert.match(repository, /limit \$\{limitParameter\}/);
  assert.doesNotMatch(repository, /prompt|authorization|request_body|response_body|raw_header/i);
});
