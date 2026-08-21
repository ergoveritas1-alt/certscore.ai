import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MAC_MINI_SCAN_BOT_API_KEY_NAMES,
  MAC_MINI_SCAN_BOT_MCP_CLIENT_NAMES,
  MAC_MINI_SCAN_BOT_REQUESTER_IPS,
  resolveExcludeInternalAnalytics,
  resolveExcludeMacMiniScanBot
} from "../../lib/admin/mac-mini-scan-bot";

const analyticsPage = readFileSync("apps/web/app/app/admin/analytics/page.tsx", "utf8");
const pulsePage = readFileSync("apps/web/app/app/admin/pulse/page.tsx", "utf8");
const scansPage = readFileSync("apps/web/app/app/admin/scans/page.tsx", "utf8");
const mcpPage = readFileSync("apps/web/app/app/admin/mcp/page.tsx", "utf8");
const analyticsRepository = readFileSync("apps/web/server/admin/product-analytics.ts", "utf8");
const pulseRepository = readFileSync("apps/web/server/admin/list-pulse-requests.ts", "utf8");
const scansRepository = readFileSync("apps/web/server/admin/repository.ts", "utf8");
const mcpRepository = readFileSync("apps/web/server/admin/mcp-telemetry.ts", "utf8");
const trafficFilters = readFileSync("apps/web/components/admin/admin-traffic-filters.tsx", "utf8");

test("Mac mini scan-bot traffic is excluded by default and can be explicitly included", () => {
  assert.equal(resolveExcludeMacMiniScanBot({}), true);
  assert.equal(resolveExcludeMacMiniScanBot({ scanBotFilter: "1" }), false);
  assert.equal(resolveExcludeMacMiniScanBot({ scanBotFilter: "1", excludeMacMiniScanBot: "1" }), true);
  assert.equal(resolveExcludeMacMiniScanBot({ excludeMacMiniScanBot: "1" }), true);
  assert.ok(MAC_MINI_SCAN_BOT_API_KEY_NAMES.length >= 1);
  assert.deepEqual(MAC_MINI_SCAN_BOT_MCP_CLIENT_NAMES, ["codex-jdpp-repeatability-20260820"]);
  assert.deepEqual(MAC_MINI_SCAN_BOT_REQUESTER_IPS, ["66.27.64.248"]);

  for (const page of [analyticsPage, pulsePage, scansPage, mcpPage]) {
    assert.match(page, /resolveExcludeMacMiniScanBot/);
    assert.match(page, /excludeMacMiniScanBot/);
    assert.match(page, /scanBotFilter/);
  }
  for (const repository of [analyticsRepository, pulseRepository, scansRepository]) {
    assert.match(repository, /MAC_MINI_SCAN_BOT_API_KEY_NAMES/);
  }
  assert.match(analyticsRepository, /is_mac_mini_scan_bot = false/);
  assert.match(analyticsRepository, /MAC_MINI_SCAN_BOT_MCP_CLIENT_NAMES/);
  assert.match(analyticsRepository, /MAC_MINI_SCAN_BOT_REQUESTER_IPS/);
  assert.match(analyticsRepository, /to_jsonb\(events\) ->> 'client_name'/);
  assert.match(analyticsRepository, /to_jsonb\(events\) ->> 'requester_ip'/);
  assert.match(pulseRepository, /api_key\.name/);
  assert.match(scansRepository, /mac_mini_scan_bot_filter/);
  assert.match(mcpRepository, /MAC_MINI_SCAN_BOT_MCP_CLIENT_NAMES/);
  assert.match(mcpRepository, /MAC_MINI_SCAN_BOT_REQUESTER_IPS/);
  assert.match(mcpRepository, /lower\(coalesce\([^)]*client_name/);
  assert.match(mcpRepository, /requester_ip::text/);
  assert.match(mcpPage, /<AdminTrafficFilters/);
  assert.match(trafficFilters, /aria-label="Traffic visibility"/);
  assert.match(trafficFilters, /aria-label="Canary traffic"/);
  assert.match(trafficFilters, /aria-label="Mac mini scan bot traffic"/);
  assert.equal((trafficFilters.match(/type="submit">Apply/g) ?? []).length, 1);
});

test("Events keeps internal and Mac mini visibility independent through every query state", () => {
  assert.equal(resolveExcludeInternalAnalytics({}), true);
  assert.equal(resolveExcludeInternalAnalytics({ audienceFilters: "1" }), false);
  assert.equal(resolveExcludeInternalAnalytics({ audienceFilters: "1", excludeInternal: "1" }), true);
  assert.equal(resolveExcludeInternalAnalytics({ excludeInternal: "1" }), true);

  assert.match(analyticsPage, /resolveExcludeInternalAnalytics\(resolved\)/);
  assert.match(analyticsPage, /audienceFilters: "1"/);
  assert.match(analyticsPage, /scanBotFilter: "1"/);
  assert.match(analyticsPage, /excludeInternal: excludeInternal \? "1" : null/);
  assert.match(analyticsPage, /excludeMacMiniScanBot: excludeMacMiniScanBot \? "1" : null/);
  assert.match(analyticsPage, /<input name="audienceFilters" type="hidden" value="1" \/>/);
  assert.match(analyticsPage, /<input name="scanBotFilter" type="hidden" value="1" \/>/);

  assert.match(analyticsRepository, /platform_admin_users as/);
  assert.match(analyticsRepository, /platform_admin_api_keys as/);
  assert.match(analyticsRepository, /lower\(coalesce\(keys\.created_by, ''\)\)/);
  assert.match(analyticsRepository, /coalesce\(attribution\.is_staff, false\) as is_staff/);
  assert.match(analyticsRepository, /function visibilityClauses\(includeInternal: boolean, excludeMacMiniScanBot: boolean\)/);
  assert.match(analyticsRepository, /if \(!includeInternal\) clauses\.push\("events\.is_staff = false"\)/);
  assert.match(analyticsRepository, /if \(excludeMacMiniScanBot\) clauses\.push\("events\.is_mac_mini_scan_bot = false"\)/);
  assert.equal((analyticsRepository.match(/visibilityClauses\(includeInternal, excludeMacMiniScanBot\)/g) ?? []).length, 2);
});

test("Events uses exclusion language, includes all bot classes, and renders compact breakdown rails", () => {
  assert.match(analyticsPage, /> Exclude internal \/ QA</);
  assert.match(analyticsPage, /> Exclude Mac mini scan bot</);
  assert.doesNotMatch(analyticsPage, /Include bots/);
  assert.doesNotMatch(analyticsRepository, /events\.is_bot = false/);
  assert.match(analyticsPage, /route-activity-heading/);
  assert.match(analyticsPage, /feature-activity-heading/);
  assert.match(analyticsPage, /overflow-x-auto/);
  assert.match(analyticsPage, /h-7 min-w-\[190px\]/);
});
