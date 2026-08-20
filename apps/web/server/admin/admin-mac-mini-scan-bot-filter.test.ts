import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MAC_MINI_SCAN_BOT_API_KEY_NAMES,
  resolveExcludeMacMiniScanBot
} from "../../lib/admin/mac-mini-scan-bot";

const analyticsPage = readFileSync("apps/web/app/app/admin/analytics/page.tsx", "utf8");
const pulsePage = readFileSync("apps/web/app/app/admin/pulse/page.tsx", "utf8");
const scansPage = readFileSync("apps/web/app/app/admin/scans/page.tsx", "utf8");
const analyticsRepository = readFileSync("apps/web/server/admin/product-analytics.ts", "utf8");
const pulseRepository = readFileSync("apps/web/server/admin/list-pulse-requests.ts", "utf8");
const scansRepository = readFileSync("apps/web/server/admin/repository.ts", "utf8");
const trafficFilters = readFileSync("apps/web/components/admin/admin-traffic-filters.tsx", "utf8");

test("Mac mini scan-bot traffic is excluded by default and can be explicitly included", () => {
  assert.equal(resolveExcludeMacMiniScanBot({}), true);
  assert.equal(resolveExcludeMacMiniScanBot({ scanBotFilter: "1" }), false);
  assert.equal(resolveExcludeMacMiniScanBot({ scanBotFilter: "1", excludeMacMiniScanBot: "1" }), true);
  assert.ok(MAC_MINI_SCAN_BOT_API_KEY_NAMES.length >= 1);

  for (const page of [analyticsPage, pulsePage, scansPage]) {
    assert.match(page, /resolveExcludeMacMiniScanBot/);
    assert.match(page, /excludeMacMiniScanBot/);
    assert.match(page, /scanBotFilter/);
  }
  for (const repository of [analyticsRepository, pulseRepository, scansRepository]) {
    assert.match(repository, /MAC_MINI_SCAN_BOT_API_KEY_NAMES/);
  }
  assert.match(analyticsRepository, /is_mac_mini_scan_bot = false/);
  assert.match(pulseRepository, /api_key\.name/);
  assert.match(scansRepository, /mac_mini_scan_bot_filter/);
  assert.match(trafficFilters, /aria-label="Traffic visibility"/);
  assert.match(trafficFilters, /aria-label="Canary traffic"/);
  assert.match(trafficFilters, /aria-label="Mac mini scan bot traffic"/);
  assert.equal((trafficFilters.match(/type="submit">Apply/g) ?? []).length, 1);
});

test("Events uses exclusion language, includes all bot classes, and renders compact breakdown grids", () => {
  assert.match(analyticsPage, /> Exclude internal \/ QA</);
  assert.match(analyticsPage, /> Exclude Mac mini scan bot</);
  assert.doesNotMatch(analyticsPage, /Include bots/);
  assert.doesNotMatch(analyticsRepository, /events\.is_bot = false/);
  assert.match(analyticsPage, /2xl:grid-cols-5/);
  assert.match(analyticsPage, /xl:grid-cols-3/);
});
