import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { internalScanProvenanceSql, type InternalScanProvenanceRun } from "./internal-scan-provenance";
import { activityTrafficDefaultVisibilitySql } from "../../apps/web/lib/admin/activity-provenance";

const scanId = "00000000-0000-4000-8000-000000000001";
const sourceScanId = "00000000-0000-4000-8000-000000000002";
const unrelated = "00000000-0000-4000-8000-000000000003";
const missing = "00000000-0000-4000-8000-000000000004";
const run: InternalScanProvenanceRun = {
  runKey: "owner-test-run", source: "operator-post-reject-proof-verification", rows: [{scanId, sourceScanId}],
};
test("service manifests reject ambiguous IDs, arbitrary sources and SQL syntax", () => {
  for (const bad of [
    {...run, runKey: "x';select 1;--"}, {...run, source: "customer"}, {...run, rows: []},
    {...run, rows: [...run.rows, ...run.rows]}, {...run, rows: [{scanId, sourceScanId: scanId}]},
    {...run, rows: [{scanId: "not-uuid", sourceScanId}]},
  ]) assert.throws(() => internalScanProvenanceSql(bad));
});

const url = process.env.INTERNAL_PROVENANCE_TEST_DATABASE_URL;
async function fixture(db: pg.Client) {
  await db.query(`create temp table scans(id uuid primary key,domain_id uuid,organization_id uuid,submitted_by_user_id uuid,
    scan_config_json jsonb,activity_traffic jsonb default '{"version":1,"class":"unknown","basis":"insufficient_provenance"}',score int default 80);
    create temp table scan_events(scan_id uuid,domain_id uuid,organization_id uuid,event_type text,message text,metadata_json jsonb);
    create temp table scan_requests(scan_id uuid,fulfilled_by_scan_id uuid);
    create temp table pulse_requests(scan_id uuid);`);
  const config = {source: run.source, ownerVerification: {runKey: run.runKey, sourceScanId}};
  await db.query("insert into scans(id,scan_config_json) values ($1,$2),($3,'{}'),($4,'{}')", [scanId, config, sourceScanId, unrelated]);
  await db.query("insert into scan_events(scan_id,event_type,metadata_json) values ($1,'full_scan.queued',$2)", [scanId, {runKey: run.runKey, sourceScanId}]);
}
const sql = (input = run) => internalScanProvenanceSql(input).replaceAll("public.", "pg_temp.");

test("verified run correction is idempotent, auditable and excludes only its own scan", {skip: !url}, async () => {
  assert.ok(["localhost","127.0.0.1"].includes(new URL(url!).hostname));
  const db = new pg.Client({connectionString: url}); await db.connect();
  try {
    await fixture(db);
    const before = (await db.query(`select id from scans where ${activityTrafficDefaultVisibilitySql("activity_traffic->>'class'")} order by id`)).rows;
    assert.equal(before.length, 3);
    // Queue producers define this once and register each batch before commit.
    await db.query("create temp table proof_rerun_input(id uuid,source uuid)");
    await db.query("insert into proof_rerun_input values ($1,$2)", [scanId, sourceScanId]);
    await db.query(sql({...run, manifestTable: "pg_temp.proof_rerun_input"}).replace("do $internal_scan_provenance$",
      "create function pg_temp.register_proof_provenance() returns void language plpgsql as $internal_scan_provenance$"));
    await db.query("begin; select pg_temp.register_proof_provenance(); commit;");
    await db.query(sql());
    const visible = (await db.query(`select id from scans where ${activityTrafficDefaultVisibilitySql("activity_traffic->>'class'")} order by id`)).rows;
    assert.deepEqual(visible.map(r => r.id), [sourceScanId, unrelated]);
    const all = (await db.query("select id,activity_traffic,score from scans order by id")).rows;
    assert.equal(all.length, 3, "include internal retains the row");
    assert.equal(all[0].activity_traffic.class, "internal");
    assert.equal(all[0].activity_traffic.runKey, run.runKey);
    assert.ok(all.every(r => r.score === 80));
    assert.equal((await db.query("select count(*)::int as n from scan_events where event_type='admin.activity_provenance.corrected'")).rows[0].n, 1);
    await db.query(sql({...run, rows: [...run.rows, {scanId: missing, sourceScanId}], requireAll: false}));
    await assert.rejects(db.query(sql({...run, rows: [...run.rows, {scanId: missing, sourceScanId}]})), /failed verification/);
  } finally {await db.end();}
});

test("config alone, mismatched event, linked request, submitter or external audience never grants internal status", {skip: !url}, async () => {
  assert.ok(["localhost","127.0.0.1"].includes(new URL(url!).hostname));
  const mutations = [
    "delete from scan_events",
    "update scan_events set metadata_json='{\"runKey\":\"other\"}'",
    "update scan_events set metadata_json=jsonb_set(metadata_json,'{sourceScanId}','\"00000000-0000-4000-8000-000000000003\"')",
    "update scans set scan_config_json=jsonb_set(scan_config_json,'{ownerVerification,runKey}','\"other\"') where id=$1",
    "insert into scan_requests values (null,$1)",
    "insert into pulse_requests values ($1)",
    "update scans set submitted_by_user_id=id where id=$1",
    "update scans set activity_traffic='{\"class\":\"external\"}' where id=$1",
  ];
  for (const mutation of mutations) {
    const db = new pg.Client({connectionString: url}); await db.connect();
    try {
      await fixture(db); await db.query(mutation, mutation.includes("$1") ? [scanId] : []);
      await assert.rejects(db.query(sql()), /failed verification/, mutation);
      assert.equal((await db.query("select count(*)::int as n from scan_events where event_type='admin.activity_provenance.corrected'")).rows[0].n, 0);
      assert.notEqual((await db.query("select activity_traffic->>'class' as kind from scans where id=$1", [scanId])).rows[0].kind, "internal");
    } finally {await db.end();}
  }
});
