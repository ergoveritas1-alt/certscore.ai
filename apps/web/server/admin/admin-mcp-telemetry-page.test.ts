import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("apps/web/app/app/admin/mcp/page.tsx", "utf8");
const layout = readFileSync("apps/web/app/app/admin/layout.tsx", "utf8");
const repository = readFileSync("apps/web/server/admin/mcp-telemetry.ts", "utf8");

test("Admin navigation exposes a dedicated MCP telemetry button", () => {
  assert.match(layout, /href: "\/app\/admin\/mcp", label: "MCP telemetry"/);
});

test("MCP telemetry page distinguishes every hosted entrypoint and states discovery limitations", () => {
  assert.match(page, /Light · \/mcp\/light/);
  assert.match(page, /Anonymous full · \/mcp\/anonymous/);
  assert.match(page, /Authenticated · \/mcp/);
  assert.match(page, /does not measure ChatGPT directory impressions/);
  assert.match(page, /Self-declared headers and client names/);
  assert.match(page, /Retention health:/);
  assert.match(page, /awaiting write-triggered pruning/);
});

test("MCP telemetry dashboard queries bounded periods and never reads request payloads", () => {
  assert.match(repository, /occurred_at >= now\(\) - interval '30 days'/);
  assert.match(repository, /limit 20/);
  assert.match(repository, /limit 40/);
  assert.match(repository, /MCP_TELEMETRY_RETENTION_DAYS/);
  assert.match(repository, /min\(occurred_at\) as oldest_event_at/);
  assert.match(repository, /expired_event_count/);
  assert.doesNotMatch(repository, /prompt|authorization|request_body|response_body|raw_header/i);
});
