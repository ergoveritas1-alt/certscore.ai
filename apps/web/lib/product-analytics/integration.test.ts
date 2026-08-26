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
  const client = await readFile(new URL("apps/web/lib/product-analytics/client.ts", root), "utf8");
  const handler = await readFile(new URL("apps/web/server/product-analytics/ingest-request.ts", root), "utf8");
  const compatibilityRoute = await readFile(new URL("apps/web/app/api/analytics/events/route.ts", root), "utf8");
  const operationalRoute = await readFile(new URL("apps/web/app/api/operational-events/route.ts", root), "utf8");
  assert.match(client, /fetch\("\/api\/operational-events"/);
  assert.doesNotMatch(handler, /after\(async \(\) =>/);
  assert.match(handler, /product_analytics\.write_failed/);
  assert.match(handler, /status: 201/);
  assert.match(handler, /status: 503/);
  assert.match(compatibilityRoute, /handleOperationalEventPost/);
  assert.match(operationalRoute, /handleOperationalEventPost/);
});

test("optional analytics opt-out keeps bounded event delivery but removes client identity", async () => {
  const client = await readFile(new URL("apps/web/lib/product-analytics/client.ts", root), "utf8");
  assert.doesNotMatch(client, /choice === "denied"[^\n]+return/);
  assert.match(client, /privacyBounded = input\.anonymousAggregate \|\| choice === "denied"/);
  assert.match(client, /"x-certscore-analytics-consent": choice === "denied" \? "denied"/);
  assert.match(client, /attempt < 2/);
  assert.match(client, /operational event ingestion failed/);
  assert.match(client, /console\.warn\("\[certscore\] operational event ingestion failed"/);
  assert.doesNotMatch(client, /console\.error\("\[certscore\] operational event ingestion failed"/);
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

test("event trend rows use the timestamp bucket as their React identity", async () => {
  const adminEvents = await readFile(new URL("apps/web/server/admin/product-analytics.ts", root), "utf8");
  const analyticsPage = await readFile(new URL("apps/web/app/app/admin/analytics/page.tsx", root), "utf8");
  const snapshot = await readFile(new URL("apps/web/components/admin/admin-operational-snapshot.tsx", root), "utf8");
  assert.match(adminEvents, /as bucket_start/);
  assert.match(adminEvents, /bucketStart: row\.bucket_start/);
  assert.match(analyticsPage, /key: point\.bucketStart/);
  assert.match(snapshot, /key=\{bucket\.key\}/);
  assert.doesNotMatch(analyticsPage, /key: point\.bucket,/);
});

test("admin analytics defaults to 24 hours and offers a five-minute-bucketed last-hour view", async () => {
  const snapshotContract = await readFile(new URL("apps/web/lib/admin/admin-operational-snapshot.ts", root), "utf8");
  const snapshotComponent = await readFile(new URL("apps/web/components/admin/admin-operational-snapshot.tsx", root), "utf8");
  const analyticsPage = await readFile(new URL("apps/web/app/app/admin/analytics/page.tsx", root), "utf8");
  assert.match(snapshotContract, /"1h": \{/);
  assert.match(snapshotContract, /step: "5 minutes"/);
  assert.match(analyticsPage, /option\(resolved\.snapshot \?\? resolved\.period, periods\) \?\? "24h"/);
  assert.match(snapshotComponent, /value === "1h" \? "Last hour"/);
  assert.match(snapshotComponent, /value === "24h" \? "Last 24 hours"/);
});

test("admin event rows project compact request context from already-retained telemetry", async () => {
  const adminEvents = await readFile(new URL("apps/web/server/admin/product-analytics.ts", root), "utf8");
  const analyticsPage = await readFile(new URL("apps/web/app/app/admin/analytics/page.tsx", root), "utf8");
  for (const field of ["origin_ip", "origin_ip_hash", "freshness", "request_region", "duration_ms"]) {
    assert.match(adminEvents, new RegExp(`events\\.${field}`));
  }
  assert.match(adminEvents, /to_jsonb\(events\) ->> 'requester_ip'/);
  assert.match(adminEvents, /request_context ->> 'sourceIp'/);
  assert.match(analyticsPage, />Time<\/th>/);
  assert.match(analyticsPage, />Page \/ feature<\/th>/);
  assert.match(analyticsPage, />Origin<\/th>/);
  assert.match(analyticsPage, />Request<\/th>/);
  assert.match(analyticsPage, /table-fixed/);
  assert.match(analyticsPage, /formatAdminCompactDateTime/);
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
