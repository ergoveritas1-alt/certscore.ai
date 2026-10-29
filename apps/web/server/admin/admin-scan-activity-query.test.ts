import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import { scanActivityTrafficClassificationCtes, SCAN_TRAFFIC_CLASSIFICATION_SQL } from "../../lib/admin/scan-traffic-classification-sql";
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
    assert.equal(result.previous.runs, 1);
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

test("page uses one authorized live cohort and refresh updates chart and table together", () => {
  const actions = readFileSync("apps/web/server/admin/list-admin-scans.ts", "utf8");
  const page = readFileSync("apps/web/app/app/admin/scans/page.tsx", "utf8");
  const repository = readFileSync("apps/web/server/admin/repository.ts", "utf8");
  assert.match(actions, /requirePlatformAdminContext\(\);\s+const snapshot = await loadAdminScanActivitySnapshot/);
  assert.doesNotMatch(actions, /revalidateTag|loadCachedAdminScanActivityPage/);
  assert.doesNotMatch(actions, /unstable_cache/);
  assert.match(actions, /const page = await enrichAdminScanActivityPage\(snapshot, includeReportDetails\);\s+return \{ \.\.\.page, snapshot \}/);
  assert.match(actions, /status: row\.status \?\? item\.status/, "active polling must use the captured state when enrichment sees a later completion");
  assert.match(page, /\(await scanPagePromise\)\.snapshot/);
  assert.doesNotMatch(page, /getAdminScanOperationalSnapshot|listAdminScansPage/);
  assert.match(page, /formatRequestedDateTime\(scan\.activityAt\)/);
  assert.match(repository, /adminScanActivitySnapshotSql\(adminScanActivityBaseSql\(true, true\), true, trafficSql\)/);
  assert.match(repository, /and no_go_flag is not true/);
  assert.match(repository, /boundedTraffic \? "activity_visible_scans"/);
  assert.match(adminScanActivitySnapshotSql("with scan_activity as (select 1)",true), /activity_visible_scans as materialized/);
});

test("basic scan rows retain summary columns while evidence details remain on demand", () => {
  const actions = readFileSync("apps/web/server/admin/list-admin-scans.ts", "utf8");
  const repository = readFileSync("apps/web/server/admin/repository.ts", "utf8");
  const page = readFileSync("apps/web/app/app/admin/scans/page.tsx", "utf8");
  assert.match(actions, /getAdminScanActivityPage[^\n]+includeReportDetails = false/);
  assert.match(actions, /loadAdminScanCreationAttributions\(selectedScanIds\)/);
  assert.doesNotMatch(actions, /includeReportDetails \? loadAdminScanCreationAttributions/);
  assert.doesNotMatch(actions, /includeReportDetails \? loadLatestVersionedScoreAssessments/);
  assert.match(repository, /includeReportDetails \? `admin_evidence_matrix/);
  assert.doesNotMatch(repository, /includeReportDetails \? loadTopFindingCounts\(\)/);
  assert.match(page, /Show report details/);
  assert.match(page, /<AdminBasicScanTable scans=\{scans\}/);
  assert.match(page, /details: showReportDetails \? "1" : ""/);
  assert.match(page, /operationalSnapshot\.previous\.runs/);
});

test("bounded traffic proof preserves old original owners and ignores later internal reuse", { skip: !databaseUrl }, async () => {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const ids = [1,2,3,4,5].map(n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`);
  try {
    await client.query("begin");
    await client.query(`create temp table fixture_scans(id uuid, scan_config_json jsonb);
      create temp table fixture_scan_pages(scan_id uuid,page_url text);
      create temp table fixture_integration_api_keys(public_id text,name text,owner_user_id text,created_by text);
      create temp table fixture_users(id text,email text);
      create temp table fixture_better_auth_users(id text,email text);
      create temp table fixture_pulse_requests(scan_id uuid,public_id text,requested_at timestamptz,requested_by jsonb,request_context jsonb,requested_url text,request_channel text,resolution_mode text);
      create temp table fixture_scan_requests(fulfilled_by_scan_id uuid,scan_id uuid,public_id text,requested_at timestamptz,requested_by jsonb,request_context jsonb,requested_url text,request_channel text,resolution_mode text)`);
    for (let i=0;i<ids.length;i++) await client.query("insert into fixture_scans values ($1,$2)", [ids[i], i===3 ? {normalizedUrl:"https://owned.invalid/.well-known/certscore-canary/test"} : {}]);
    await client.query("insert into fixture_integration_api_keys values ('bot-key','macmini',null,null)");
    await client.query("insert into fixture_users values ('qa-user','qa@local.test')");
    for(let i=0;i<ids.length;i++) await client.query("insert into fixture_scan_requests values (null,$1,$2,'2026-01-01Z',$3,'{}','https://example.invalid/','api-full-scan','queued_new_scan')", [ids[i],`origin-${i}`,i===1 ? {apiKeyId:"bot-key"} : i===2 ? {userId:"qa-user"} : {}]);
    await client.query("insert into fixture_scan_requests values (null,$1,'late-reuse','2026-10-28Z',$2,'{}','https://example.invalid/','mcp','reused_existing_scan')",[ids[0],{userId:"qa-user",apiKeyId:"bot-key"}]);
    const params = Array(25).fill(null); params[21]=["macmini"]; params[22]=["qa@local.test"]; params[23]=[]; params[24]=[];
    const prefix=`with types as (select ${Array.from({length:21},(_,i)=>`$${i+1}::text`).join(",")}), activity_candidates(scan_id) as (values ${ids.slice(0,4).map(id=>`('${id}'::uuid)`).join(",")}), `;
    const sql=prefix+scanActivityTrafficClassificationCtes("select scan_id from activity_candidates")+` select
      (select array_agg(scan_id::text order by scan_id) from activity_canary_scan_ids) qa,
      (select array_agg(scan_id::text order by scan_id) from activity_classified where macmini) macmini`;
    const bounded=(await client.query(sql.replaceAll("public.","fixture_"),params)).rows[0];
    const global=(await client.query(SCAN_TRAFFIC_CLASSIFICATION_SQL.replaceAll("public.","fixture_"),params.slice(21))).rows[0];
    assert.deepEqual(bounded.qa,[ids[2],ids[3]]);
    assert.deepEqual(bounded.macmini,[ids[1]]);
    assert.deepEqual([...global.qa].filter(id=>ids.slice(0,4).includes(id)).sort(),bounded.qa);
    assert.deepEqual([...global.macmini].filter(id=>ids.slice(0,4).includes(id)).sort(),bounded.macmini);
    assert.ok(!bounded.qa.includes(ids[0]),"a later internal result lookup cannot relabel the original external run");
  } finally { await client.query("rollback"); await client.end(); }
});

test("manual and active-scan refresh share one live page request", () => {
  const refresh=readFileSync("apps/web/app/app/admin/scans/admin-scans-auto-refresh.tsx","utf8");
  assert.equal(refresh.match(/window\.location\.reload\(\)/g)?.length,1);
  assert.doesNotMatch(refresh,/useRouter|useTransition|router\.refresh/);
  assert.doesNotMatch(refresh,/refreshAdminScanActivity/);
});
