import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../../", import.meta.url);

test("analytics schema excludes sensitive payload and raw network fields", async () => {
  const migration = await readFile(new URL("packages/db/migrations/0184_product_analytics.sql", root), "utf8");
  const operationalMigration = await readFile(new URL("packages/db/migrations/0185_operational_event_consent.sql", root), "utf8");
  assert.doesNotMatch(migration, /^\s+(?:raw_ip|ip_address|request_body|form_value|keystroke|session_replay|password|auth_token)\s+/im);
  assert.match(migration, /scan_id uuid references public\.scans/);
  assert.match(migration, /90-day raw-event retention target/);
  assert.match(operationalMigration, /'operational'/);
  assert.match(operationalMigration, /necessary authenticated first-party activity/i);
});

test("opt-out persistence removes linkable identity", async () => {
  const repository = await readFile(new URL("apps/web/server/product-analytics/repository.ts", root), "utf8");
  assert.match(repository, /optedOut \? null : payload\.sessionId/);
  assert.match(repository, /optedOut \? null : payload\.actorId/);
  assert.match(repository, /optedOut \? null : context\.userId/);
  assert.match(repository, /optedOut \? null : payload\.scanId/);
});

test("event ingestion confirms persistence and exposes storage failure", async () => {
  const route = await readFile(new URL("apps/web/app/api/analytics/events/route.ts", root), "utf8");
  assert.doesNotMatch(route, /after\(async \(\) =>/);
  assert.match(route, /product_analytics\.write_failed/);
  assert.match(route, /status: 201/);
  assert.match(route, /status: 503/);
});

test("optional analytics opt-out keeps bounded event delivery but removes client identity", async () => {
  const client = await readFile(new URL("apps/web/lib/product-analytics/client.ts", root), "utf8");
  assert.doesNotMatch(client, /choice === "denied"[^\n]+return/);
  assert.match(client, /privacyBounded = input\.anonymousAggregate \|\| choice === "denied"/);
  assert.match(client, /"x-certscore-analytics-consent": choice === "denied" \? "denied"/);
  assert.match(client, /attempt < 2/);
  assert.match(client, /operational event ingestion failed/);
});

test("the main event projection spans every retained operational route", async () => {
  const adminEvents = await readFile(new URL("apps/web/server/admin/product-analytics.ts", root), "utf8");
  for (const source of ["product_analytics_events", "scan_requests", "pulse_requests", "mcp_tool_invocation_events", "scan_events"]) {
    assert.match(adminEvents, new RegExp(`public\\.${source}`));
  }
  for (const route of ["Web", "API", "Pulse", "SDK", "MCP", "Other"]) {
    assert.match(adminEvents, new RegExp(`"${route}"|'${route}'`));
  }
  assert.match(adminEvents, /events\.event_route = \$/);
});

test("authenticated app requests receive a deduplicated server event identity", async () => {
  const middleware = await readFile(new URL("apps/web/middleware.ts", root), "utf8");
  const layout = await readFile(new URL("apps/web/app/app/layout.tsx", root), "utf8");
  assert.match(middleware, /x-certscore-operational-event-id/);
  assert.match(middleware, /x-certscore-operational-route/);
  assert.match(layout, /persistProductAnalyticsEvent/);
  assert.match(layout, /method === "POST"/);
  assert.match(layout, /feature: "server_action"/);
  assert.match(layout, /operational_event\.write_failed/);
});
