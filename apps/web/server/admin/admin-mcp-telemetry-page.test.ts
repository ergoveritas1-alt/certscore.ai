import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("apps/web/app/app/admin/mcp/page.tsx", "utf8");
const layout = readFileSync("apps/web/app/app/admin/layout.tsx", "utf8");
const repository = readFileSync("apps/web/server/admin/mcp-telemetry.ts", "utf8");
const snapshotComponent = readFileSync("apps/web/components/admin/admin-operational-snapshot.tsx", "utf8");
const snapshotContract = readFileSync("apps/web/lib/admin/admin-operational-snapshot.ts", "utf8");
const persistence = readFileSync("apps/web/server/mcp-telemetry/repository.ts", "utf8");
const requestContextMigration = readFileSync("packages/db/migrations/0187_mcp_invocation_request_context.sql", "utf8");

test("Admin navigation exposes a dedicated MCP operations button", () => {
  assert.match(layout, /href: "\/app\/admin\/mcp", label: "MCP operations"/);
});

test("MCP operations page makes the request ledger the primary navigable workspace", () => {
  assert.match(page, /Light · \/mcp\/light/);
  assert.match(page, /Anonymous full · \/mcp\/anonymous/);
  assert.match(page, /Authenticated · \/mcp/);
  assert.match(page, /Self-declared headers and client names are useful routing signals/);
  assert.match(page, /MCP request activity/);
  assert.match(page, /<AdminOperationalSnapshot/);
  assert.match(page, /<CardTitle>MCP growth funnel<\/CardTitle>/);
  assert.match(page, /Landing-page visits and setup clicks remain aggregate first-party analytics/);
  for (const stage of ["Initialized", "Tools listed", "First tool", "Scan requested", "Completed scans", "Bundle retrieved", "Repeat use"]) {
    assert.match(page, new RegExp(stage));
  }
  assert.match(snapshotComponent, /<CardTitle>Operational snapshot<\/CardTitle>/);
  assert.match(snapshotContract, /\["1h", "24h", "7d", "30d", "1y"\]/);
  assert.match(page, /\?\? "24h"/);
  assert.match(page, /Last year \(retained data\)/);
  assert.match(page, /dashboard\.trend\.map/);
  assert.match(snapshotComponent, /Pacific time/);
  assert.match(page, /name="toolPeriod"/);
  assert.match(page, /name="sourcePeriod"/);
  assert.match(page, /dashboard\.toolAnalytics\.label/);
  assert.match(page, /dashboard\.sourceAnalytics\.label/);
  assert.match(page, /<CardTitle>Tool distribution and latency<\/CardTitle>/);
  assert.match(page, /<CardTitle>Source and access signals<\/CardTitle>/);
  assert.match(page, /Self-declared headers and client names are useful routing signals/);
  assert.ok(page.indexOf("Tool distribution and latency") < page.indexOf("{hasActivity ? ("));
  assert.ok(page.indexOf("Source and access signals") < page.indexOf("{hasActivity ? ("));
  assert.ok(page.indexOf("<AdminOperationalSnapshot") < page.indexOf("MCP request activity"));
  assert.ok(page.indexOf("<AdminOperationalSnapshot") < page.indexOf("Tool distribution and latency"));
  assert.ok(page.indexOf("Frequently requested hostnames") < page.indexOf("<CardTitle>MCP growth funnel</CardTitle>"));
  assert.ok(page.indexOf("Source and access signals") < page.indexOf("<CardTitle>MCP growth funnel</CardTitle>"));
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
  assert.match(page, /Unattributed/);
  assert.match(page, /sourceLabel/);
  assert.match(page, /label: "Caller attribution"/);
  assert.match(page, /label: "Client \/ channel"/);
  assert.match(page, /sourceConfidenceLabel/);
  assert.match(page, /Directory discovery is not distinguishable from a custom connector/);
  assert.match(page, /Requester \/ caller IP/);
  assert.match(page, /sourceIpLabel/);
  assert.match(page, /\{sourceIpLabel\(event\)\}/);
  assert.match(page, /clientDetail\(event\)/);
  assert.match(page, /requestedResourceLabel\(event\)/);
  assert.match(page, /Scan ID \$\{event\.requested_resource\}/);
  assert.match(page, /Recognized client info/);
  assert.match(page, /Unrecognized client info/);
  assert.match(page, /No client signal/);
  assert.match(page, /From scan/);
  for (const heading of [
    "Requested", "Page", "Tranco", "Score", "Top", "Privacy / CMP", "A/R/O", "Access",
    "Transparency", "Transport", "Runtime", "Time", "Outcome", "From", "Freshness", "Language",
    "Industry", "Mode", "Usage", "Scan ID", "Scanner egress",
  ]) {
    assert.match(page, new RegExp(`label: "${heading.replaceAll("/", "\\/")}"`));
  }
  assert.match(page, /EvidenceGroupCell/);
  assert.match(page, /event\.evidence_matrix/);
  assert.match(page, /event\.scanner_egress_id/);
  assert.match(page, /event\.scan_elapsed_seconds/);
});

test("MCP telemetry dashboard queries bounded periods and never reads request payloads", () => {
  assert.match(repository, /ADMIN_OPERATIONAL_SNAPSHOT_CONFIG/);
  assert.match(snapshotContract, /date_bin\('5 minutes'/);
  assert.match(snapshotContract, /date_trunc\('month'/);
  assert.match(repository, /snapshotPeriod: AdminMcpSnapshotPeriod = "24h"/);
  assert.match(repository, /toolPeriod: AdminMcpSnapshotPeriod = "24h"/);
  assert.match(repository, /sourcePeriod: AdminMcpSnapshotPeriod = "24h"/);
  assert.match(repository, /toolConfig\.bucketStart/);
  assert.match(repository, /sourceConfig\.bucketStart/);
  assert.match(repository, /snapshotConfig\.bucketStart/);
  assert.match(repository, /snapshotConfig\.bucketEnd/);
  assert.match(repository, /revalidate: 30/);
  assert.match(repository, /bucket at time zone 'America\/Los_Angeles'/);
  assert.match(repository, /occurred_at >= now\(\) - interval '30 days'/);
  assert.match(repository, /limit 20/);
  assert.doesNotMatch(repository, /limit 40/);
  assert.match(repository, /MCP_TELEMETRY_RETENTION_DAYS/);
  assert.match(repository, /from public\.mcp_activation_events activation/);
  assert.match(repository, /repeat_actor_7d_count/);
  assert.match(repository, /repeat_actor_30d_count/);
  assert.match(repository, /count\(distinct date_trunc\('day'/);
  assert.match(repository, /events\.scan_status in \('completed', 'completed_limited'\)/);
  assert.match(repository, /min\(occurred_at\) as oldest_event_at/);
  assert.match(repository, /expired_event_count/);
  assert.match(repository, /listAdminMcpTelemetryEventsPage/);
  assert.match(repository, /target_hostname ilike/);
  assert.match(repository, /left join public\.scans canonical_scan/);
  assert.match(repository, /left join public\.domains canonical_domain/);
  assert.match(repository, /from public\.scan_snapshots retained/);
  assert.match(repository, /from public\.scan_pages page/);
  assert.match(repository, /snapshot\.admin_evidence_matrix/);
  assert.match(repository, /snapshot\.certscore_overall::int as score/);
  assert.match(repository, /snapshot\.top_finding_count::int as top_finding_count/);
  assert.match(repository, /canonical_scan\.egress_id as scanner_egress_id/);
  assert.match(repository, /canonical_scan\.egress_provider as scanner_egress_provider/);
  assert.match(repository, /extract\(epoch from \(canonical_scan\.completed_at - canonical_scan\.started_at\)\)/);
  assert.match(repository, /parseAdminEvidenceMatrix/);
  assert.match(repository, /isAdminMcpEvidenceUnavailable/);
  assert.match(repository, /evidenceUnavailable \? null : parseAdminEvidenceMatrix/);
  assert.match(repository, /score: evidenceUnavailable \? null : event\.score/);
  assert.match(repository, /top_finding_count: evidenceUnavailable \? null : event\.top_finding_count/);
  assert.match(repository, /target_provenance/);
  assert.match(repository, /perspective_provenance/);
  assert.match(repository, /requesterIpAttributionFromRequest/);
  assert.match(repository, /events\.requester_ip::text as retained_requester_ip/);
  assert.match(repository, /events\.requested_resource/);
  assert.match(repository, /events\.client_name/);
  assert.match(repository, /from public\.pulse_requests request[\s\S]*request\.scan_id::text = events\.scan_id/);
  assert.match(repository, /from public\.scan_requests request[\s\S]*fulfilled_by_scan_id[\s\S]*events\.scan_id/);
  assert.match(repository, /canonical_scan\.scan_config_json ->> 'scanFrom' in \('eu_de', 'eu_ie', 'california'\)/);
  assert.match(repository, /limit \$\{limitParameter\}/);
  assert.doesNotMatch(repository, /prompt|authorization|request_body|response_body|raw_header/i);
});

test("MCP traffic exclusions resolve linked scan identities once per query", () => {
  assert.match(repository, /scan_id = any\(array\(/);
  assert.doesNotMatch(repository, /where request\.scan_id::text = \$\{prefix\}scan_id/);
  assert.doesNotMatch(repository, /fulfilled_by_scan_id, request\.scan_id\)::text = \$\{prefix\}scan_id/);
});

test("MCP invocation persistence retains bounded request attribution for failed calls", () => {
  for (const column of [
    "client_name", "requester_ip", "requester_ip_hash", "requester_network",
    "requested_resource_type", "requested_resource",
  ]) {
    assert.match(persistence, new RegExp(`event\\.${column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())}`));
    assert.match(requestContextMigration, new RegExp(`add column if not exists ${column}`));
  }
  assert.match(requestContextMigration, /90-day retention target/);
  assert.match(requestContextMigration, /URL paths, and URL query values/);
  assert.match(requestContextMigration, /set requested_resource_type = 'scan_id',[\s\S]*requested_resource = scan_id/);
  assert.doesNotMatch(persistence, /request_body|raw_header|authorization|prompt/i);
});
