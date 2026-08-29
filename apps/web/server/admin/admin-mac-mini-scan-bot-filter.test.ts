import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ADMIN_TRAFFIC_SCOPES,
  INTERNAL_QA_EMAILS,
  INTERNAL_QA_MCP_CLIENT_NAMES,
  INTERNAL_QA_REQUESTER_IPS,
  adminTrafficScopeVisibility,
  isAdminTrafficClassificationVisible,
  resolveAdminTrafficScope,
} from "../../lib/admin/admin-traffic-scope";
import { MAC_MINI_SCAN_BOT_API_KEY_NAMES } from "../../lib/admin/mac-mini-scan-bot";

const analyticsPage = readFileSync("apps/web/app/app/admin/analytics/page.tsx", "utf8");
const pulsePage = readFileSync("apps/web/app/app/admin/pulse/page.tsx", "utf8");
const scansPage = readFileSync("apps/web/app/app/admin/scans/page.tsx", "utf8");
const mcpPage = readFileSync("apps/web/app/app/admin/mcp/page.tsx", "utf8");
const analyticsRepository = readFileSync("apps/web/server/admin/product-analytics.ts", "utf8");
const pulseRepository = readFileSync("apps/web/server/admin/list-pulse-requests.ts", "utf8");
const scansRepository = readFileSync("apps/web/server/admin/repository.ts", "utf8");
const mcpRepository = readFileSync("apps/web/server/admin/mcp-telemetry.ts", "utf8");
const trafficFilters = readFileSync("apps/web/components/admin/admin-traffic-filters.tsx", "utf8");

test("one canonical preset independently controls Internal / QA and Mac mini visibility", () => {
  assert.deepEqual(ADMIN_TRAFFIC_SCOPES, ["external", "include_internal_qa", "include_mac_mini", "all"]);
  assert.deepEqual(adminTrafficScopeVisibility("external"), { includeInternalQa: false, includeMacMini: false });
  assert.deepEqual(adminTrafficScopeVisibility("include_internal_qa"), { includeInternalQa: true, includeMacMini: false });
  assert.deepEqual(adminTrafficScopeVisibility("include_mac_mini"), { includeInternalQa: false, includeMacMini: true });
  assert.deepEqual(adminTrafficScopeVisibility("all"), { includeInternalQa: true, includeMacMini: true });
  assert.equal(resolveAdminTrafficScope({}), "external");
  assert.equal(resolveAdminTrafficScope({ traffic: "all" }), "all");
  assert.equal(resolveAdminTrafficScope({ traffic: "invalid" }), "external");
  assert.equal(resolveAdminTrafficScope({ includeCanary: "1" }), "include_internal_qa");
  assert.equal(resolveAdminTrafficScope({ scanBotFilter: "1" }), "include_mac_mini");
  assert.equal(resolveAdminTrafficScope({ includeCanary: "1", scanBotFilter: "1" }), "all");
});

test("Mac mini classification takes precedence over overlapping Internal / QA identity", () => {
  const overlap = { isInternalQa: true, isMacMini: true };
  assert.equal(isAdminTrafficClassificationVisible("external", overlap), false);
  assert.equal(isAdminTrafficClassificationVisible("include_internal_qa", overlap), false);
  assert.equal(isAdminTrafficClassificationVisible("include_mac_mini", overlap), true);
  assert.equal(isAdminTrafficClassificationVisible("all", overlap), true);

  assert.equal(isAdminTrafficClassificationVisible("include_mac_mini", {
    isInternalQa: true,
    isMacMini: false,
  }), false);
  assert.equal(isAdminTrafficClassificationVisible("include_internal_qa", {
    isInternalQa: false,
    isMacMini: true,
  }), false);
});

test("the Internal / QA identity list contains the requested exact identities", () => {
  assert.deepEqual(INTERNAL_QA_EMAILS, ["bmasek@gmail.com"]);
  assert.deepEqual(INTERNAL_QA_REQUESTER_IPS, ["66.27.64.248"]);
  assert.deepEqual(INTERNAL_QA_MCP_CLIENT_NAMES, ["codex-jdpp-repeatability-20260820"]);
  assert.ok(MAC_MINI_SCAN_BOT_API_KEY_NAMES.length >= 1);

  for (const repository of [analyticsRepository, pulseRepository, scansRepository, mcpRepository]) {
    assert.match(repository, /INTERNAL_QA_EMAILS|platformAdminEmailsParameter/);
    assert.match(repository, /INTERNAL_QA_REQUESTER_IPS/);
    assert.match(repository, /INTERNAL_QA_MCP_CLIENT_NAMES/);
  }

  assert.match(mcpRepository, /host\(\$\{prefix\}requester_ip\)/);
  assert.match(analyticsRepository, /host\(events\.requester_ip\)/);
  assert.doesNotMatch(mcpRepository, /requester_ip::text, ''\) = any\(\$\{requesterIpParameter\}/);
  assert.doesNotMatch(analyticsRepository, /to_jsonb\(events\) ->> 'requester_ip', ''\) = any/);
  assert.match(mcpRepository, /if \(!includeCanary\) \{[\s\S]*dashboardFilterValues\.push/);
  assert.match(mcpRepository, /retentionDaysParameter = `\$\$\{dashboardFilterValues\.length \+ 1\}`/);
  assert.doesNotMatch(mcpRepository, /\$6::int \* interval '1 day'/);
});

test("all four pages render the same minimal auto-applying traffic dropdown", () => {
  for (const page of [analyticsPage, pulsePage, scansPage, mcpPage]) {
    assert.match(page, /<AdminTrafficFilters/);
  }
  assert.match(trafficFilters, /aria-label="Traffic visibility"/);
  assert.match(trafficFilters, /name="traffic"/);
  assert.match(trafficFilters, /requestSubmit\(\)/);
  assert.match(trafficFilters, /ADMIN_TRAFFIC_SCOPES\.map/);
  assert.doesNotMatch(trafficFilters, /type="submit"/);
  assert.doesNotMatch(trafficFilters, />Apply</);
});

test("Mac mini filtering remains credential-based across operational repositories", () => {
  for (const repository of [analyticsRepository, pulseRepository, scansRepository]) {
    assert.match(repository, /MAC_MINI_SCAN_BOT_API_KEY_NAMES/);
  }
  assert.match(analyticsRepository, /events\.is_mac_mini_scan_bot = false/);
  assert.match(pulseRepository, /api_key\.name/);
  assert.match(scansRepository, /mac_mini_scan_bot_filter/);
  assert.match(scansRepository, /adminTrafficVisibilitySql/);
  assert.match(scansRepository, /excludeMacMiniParameter[\s\S]*macMiniFilter[\s\S]*not \$\{macMiniFilter\}[\s\S]*includeInternalQaParameter/);
});
