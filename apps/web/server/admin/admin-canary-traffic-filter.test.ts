import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scansPage = readFileSync("apps/web/app/app/admin/scans/page.tsx", "utf8");
const pulsePage = readFileSync("apps/web/app/app/admin/pulse/page.tsx", "utf8");
const mcpPage = readFileSync("apps/web/app/app/admin/mcp/page.tsx", "utf8");
const scansRepository = readFileSync("apps/web/server/admin/repository.ts", "utf8");
const pulseRepository = readFileSync("apps/web/server/admin/list-pulse-requests.ts", "utf8");
const mcpRepository = readFileSync("apps/web/server/admin/mcp-telemetry.ts", "utf8");

test("canary traffic is excluded by default across admin activity surfaces", () => {
  for (const page of [scansPage, pulsePage, mcpPage]) {
    assert.match(page, /includeCanary = .*includeCanary === "1"/);
    assert.match(page, /<CanaryTrafficToggle/);
  }
  assert.match(scansRepository, /not canary_filter/);
  assert.match(pulseRepository, /requested_url, ''\) !~\* '\^https\?:\/\/\[\^\/\?#\]\+\/\\\\\.well-known\/certscore-canary\/'/);
  assert.match(mcpRepository, /is_canary = false/);
  assert.doesNotMatch(scansRepository, /hostname.*ergoveritas|ergoveritas.*hostname/i);
  assert.doesNotMatch(pulseRepository, /hostname.*ergoveritas|ergoveritas.*hostname/i);
});

test("canary state survives filters and pagination when explicitly enabled", () => {
  for (const page of [scansPage, pulsePage, mcpPage]) {
    assert.match(page, /name="includeCanary"/);
    assert.match(page, /includeCanary: includeCanary \? "1" : null/);
  }
});
