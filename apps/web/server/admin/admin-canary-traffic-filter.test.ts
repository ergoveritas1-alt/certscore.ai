import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scansPage = readFileSync("apps/web/app/app/admin/scans/page.tsx", "utf8");
const pulsePage = readFileSync("apps/web/app/app/admin/pulse/page.tsx", "utf8");
const mcpPage = readFileSync("apps/web/app/app/admin/mcp/page.tsx", "utf8");
const eventsPage = readFileSync("apps/web/app/app/admin/analytics/page.tsx", "utf8");
const scansRepository = readFileSync("apps/web/server/admin/repository.ts", "utf8");
const pulseRepository = readFileSync("apps/web/server/admin/list-pulse-requests.ts", "utf8");
const mcpRepository = readFileSync("apps/web/server/admin/mcp-telemetry.ts", "utf8");
const eventsRepository = readFileSync("apps/web/server/admin/product-analytics.ts", "utf8");
const mcpCanaryBackfill = readFileSync("packages/db/migrations/0186_backfill_linked_mcp_canary_telemetry.sql", "utf8");

const pages = [scansPage, pulsePage, mcpPage, eventsPage];

test("Internal / QA traffic is excluded by default across all four admin activity surfaces", () => {
  for (const page of pages) {
    assert.match(page, /resolveAdminTrafficScope/);
    assert.match(page, /adminTrafficScopeVisibility/);
    assert.match(page, /<AdminTrafficFilters/);
  }

  assert.match(scansRepository, /not canary_filter/);
  assert.match(scansRepository, /INTERNAL_QA_EMAILS/);
  assert.match(scansRepository, /INTERNAL_QA_REQUESTER_IPS/);
  assert.match(scansRepository, /INTERNAL_QA_MCP_CLIENT_NAMES/);
  assert.match(pulseRepository, /pulseInternalQaTrafficSql/);
  assert.match(mcpRepository, /internalQaMcpTrafficFilter/);
  assert.match(eventsRepository, /internalQaRequestSql/);
  assert.match(eventsRepository, /events\.is_staff = false/);

  assert.match(mcpCanaryBackfill, /update public\.mcp_tool_invocation_events/);
  assert.match(mcpCanaryBackfill, /from public\.scan_requests request[\s\S]*requested_url[\s\S]*certscore-canary/);
  assert.match(mcpCanaryBackfill, /from public\.pulse_requests request[\s\S]*requested_url[\s\S]*certscore-canary/);
  assert.match(mcpCanaryBackfill, /from public\.scan_pages page[\s\S]*page_url[\s\S]*certscore-canary/);
});

test("Admin Scans filters traffic before detailed row enrichment and in overview queries", () => {
  assert.match(scansRepository, /const canUseDefaultActivityPath/);
  assert.ok(
    scansRepository.indexOf("if (canUseDefaultActivityPath)") < scansRepository.indexOf("const baseSql = adminScanActivityBaseSql()")
  );
  assert.match(scansRepository, /with canary_scan_ids as materialized/);
  assert.match(scansRepository, /not exists \(select 1 from canary_scan_ids canary where canary\.scan_id = s\.id\)/);
  assert.match(scansRepository, /internalQaLinkedRequestSql\("s\.id"/);
  assert.match(scansRepository, /internalQaLinkedRequestSql\("ss\.scan_id"/);
  assert.match(scansRepository, /not exists \(select 1 from mac_mini_scan_bot_scan_ids bot where bot\.scan_id = s\.id\)/);
});

test("the canonical traffic preset survives filters and pagination", () => {
  for (const page of pages) {
    assert.match(page, /traffic: trafficScope/);
    assert.doesNotMatch(page, /name="includeCanary"/);
    assert.doesNotMatch(page, /name="excludeInternal"/);
    assert.doesNotMatch(page, /name="excludeMacMiniScanBot"/);
  }
});
