import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../../", import.meta.url);

test("analytics schema excludes sensitive payload and raw network fields", async () => {
  const migration = await readFile(new URL("packages/db/migrations/0184_product_analytics.sql", root), "utf8");
  assert.doesNotMatch(migration, /^\s+(?:raw_ip|ip_address|request_body|form_value|keystroke|session_replay|password|auth_token)\s+/im);
  assert.match(migration, /scan_id uuid references public\.scans/);
  assert.match(migration, /90-day raw-event retention target/);
});

test("opt-out persistence removes linkable identity", async () => {
  const repository = await readFile(new URL("apps/web/server/product-analytics/repository.ts", root), "utf8");
  assert.match(repository, /optedOut \? null : payload\.sessionId/);
  assert.match(repository, /optedOut \? null : payload\.actorId/);
  assert.match(repository, /optedOut \? null : context\.userId/);
  assert.match(repository, /optedOut \? null : payload\.scanId/);
});

test("analytics storage failure is isolated from the customer request", async () => {
  const route = await readFile(new URL("apps/web/app/api/analytics/events/route.ts", root), "utf8");
  assert.match(route, /after\(async \(\) =>/);
  assert.match(route, /product_analytics\.write_failed/);
  assert.match(route, /status: 202/);
});
