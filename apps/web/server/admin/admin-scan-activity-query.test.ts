import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import { adminScanActivitySnapshotSql, type AdminScanActivitySnapshotData } from "./admin-scan-activity-query";
const require = createRequire(new URL("../../../../packages/db/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");
const databaseUrl = process.env.ADMIN_ACTIVITY_TEST_DATABASE_URL ?? process.env.BROWSER_TEST_DATABASE_URL;

// Local/CI-only fixture transaction; no production database or scan creation.
test("shared SQL reconciles chart, table, prior window and latest time at exact boundaries", { skip: !databaseUrl }, async () => {
  assert.match(databaseUrl!, /(?:localhost|127\.0\.0\.1|^postgresql:\/\/\/)/);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("create temp table fixture_scans(id text primary key, created_at timestamptz, started_at timestamptz, completed_at timestamptz)");
    await client.query("insert into fixture_scans values ('new','2026-10-26T20:00Z','2026-10-26T20:00Z','2026-10-28T19:20Z')");
    const base = `with parameter_types as (select ${Array.from({ length: 26 }, (_, i) => `$${i + 1}::${i === 7 || i === 8 ? "int" : "text"}`).join(",")}),
    filtered_activity as materialized (
      select * from (values
        ('scan:new','scan','new',null::text,'2026-10-28T19:20Z'::timestamptz,'completed',null::boolean,null::text,'fresh','eu_de'),
        ('request:reuse','request','new','reuse','2026-10-28T19:30Z'::timestamptz,'completed',false,null,'reused','eu_de'),
        ('scan:start','scan','start',null,'2026-10-27T20:00Z'::timestamptz,'failed',false,null,'fresh','eu_ir'),
        ('scan:previous','scan','previous',null,'2026-10-27T19:59Z'::timestamptz,'completed',false,null,'fresh','eu_de'),
        ('scan:cutoff','scan','cutoff',null,'2026-10-28T20:00Z'::timestamptz,'completed',false,null,'fresh','eu_de'),
        ('scan:future','scan','future',null,'2026-10-28T20:01Z'::timestamptz,'completed',false,null,'fresh','eu_de')
      ) a(activity_id,row_kind,scan_id,request_public_id,activity_at,status,no_go_flag,access_posture_class,freshness_filter,scan_from_filter)
    )`;
    const sql = adminScanActivitySnapshotSql(base).replaceAll("public.scans", "fixture_scans");
    const params = Array(28).fill(null); params[7] = 20; params[8] = 0; params[26] = "2026-10-28T20:00Z"; params[27] = "2026-10-27T20:00Z";
    const run = async () => (await client.query<AdminScanActivitySnapshotData>(sql, params)).rows[0]!;
    const result = await run();
    assert.equal(result.metrics.items, 3);
    assert.equal(result.metrics.runs, 2);
    assert.equal(result.metrics.requests, 1);
    assert.equal(result.metrics.completed, 1, "nullable no-go metadata must match the Completed table filter");
    assert.equal(result.metrics.failed, 1);
    assert.equal(result.metrics.reused, 1);
    assert.equal(result.rows.length, 3);
    assert.equal(result.rows[0]!.activity_id, "request:reuse");
    assert.equal(Date.parse(result.metrics.newest_at!), Date.parse(result.rows[0]!.activity_at));
    assert.equal(result.trend.reduce((n,b) => n+b.items,0), result.metrics.items);
    assert.equal(result.regions.reduce((n,b) => n+b.count,0), result.metrics.items);
    assert.equal(result.previous.items, 1);
    params[8] = 100;
    const emptyPage = await run();
    assert.equal(emptyPage.rows.length, 0);
    assert.deepEqual(emptyPage.metrics, result.metrics, "pagination never changes the chart or total");
    params[27] = "2026-10-28T20:00Z";
    const empty = await run();
    assert.equal(empty.metrics.items, 0); assert.equal(empty.metrics.newest_at, null);
    assert.equal(empty.trend.reduce((n,b) => n+b.items,0), 0);
  } finally { await client.query("rollback"); await client.end(); }
});

test("page uses one authorized cached cohort and refresh invalidates chart and table together", () => {
  const actions = readFileSync("apps/web/server/admin/list-admin-scans.ts", "utf8");
  const page = readFileSync("apps/web/app/app/admin/scans/page.tsx", "utf8");
  const repository = readFileSync("apps/web/server/admin/repository.ts", "utf8");
  assert.match(actions, /requirePlatformAdminContext\(\);\s+return loadCachedAdminScanActivityPage/);
  assert.match(actions, /revalidateTag\(ADMIN_SCAN_ACTIVITY_CACHE_TAG\)/);
  assert.match(actions, /revalidate: 30, tags: \[ADMIN_SCAN_ACTIVITY_CACHE_TAG\]/);
  assert.match(actions, /const page = await enrichAdminScanActivityPage\(snapshot\);\s+return \{ \.\.\.page, snapshot \}/);
  assert.match(page, /\(await scanPagePromise\)\.snapshot/);
  assert.doesNotMatch(page, /getAdminScanOperationalSnapshot|listAdminScansPage/);
  assert.match(page, /formatRequestedDateTime\(scan\.activityAt\)/);
  assert.match(repository, /adminScanActivitySnapshotSql\(adminScanActivityBaseSql\(\)\)/);
  assert.match(repository, /and no_go_flag is not true/);
});
