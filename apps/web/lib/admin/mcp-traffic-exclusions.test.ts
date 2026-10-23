import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { SCAN_TRAFFIC_CLASSIFICATION_SQL, scanOriginalRequesterQaSql, scanOriginalRequesterMacMiniSql, scanOriginalRequestCanarySql } from "./scan-traffic-classification-sql";
import { MCP_TRAFFIC_EXCLUSIONS_SQL } from "./mcp-traffic-exclusions";
import { scanCreatorSql } from "./scan-creation-source";

const databaseUrl = process.env.ADMIN_PERFORMANCE_TEST_DATABASE_URL ?? process.env.MCP_DISCOVERY_TEST_DATABASE_URL;
test("original requester classification survives later QA inspection, reuse and missing creator history", { skip: !databaseUrl }, async () => {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseUrl!).hostname));
  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  const sql = (query: string) => query.replaceAll("public.", "pg_temp.");
  const params = [["mini"], ["qa@example.test"], ["192.0.2.1"], ["local-qa"]];
  try {
    await db.query(`create temp table scans(id text, scan_config_json jsonb default '{}');
      create temp table scan_pages(scan_id text,page_url text);
      create temp table pulse_requests(public_id text,scan_id text,requested_at timestamptz default '2026-10-22 09:00Z',request_channel text default 'mcp',resolution_mode text default 'created_new_scan',requested_by jsonb default '{}',request_context jsonb default '{}',requested_url text);
      create temp table scan_requests(public_id text,scan_id text,fulfilled_by_scan_id text,requested_at timestamptz default '2026-10-22 09:00Z',request_channel text default 'browser',resolution_mode text default 'queued_new_scan',requested_by jsonb default '{}',request_context jsonb default '{}',requested_url text);
      create temp table integration_api_keys(public_id text,name text,owner_user_id text,created_by text);
      create temp table users(id text,email text);
      create temp table better_auth_users(id text,email text);
      insert into users values ('qa','qa@example.test'),('customer','customer@example.test');
      insert into better_auth_users values ('auth-qa','qa@example.test');
      insert into integration_api_keys values ('mini','mini',null,null),('qa-key','ordinary','qa',null),('auth-key','ordinary','auth-qa',null),('created-key','ordinary',null,'qa@example.test');
      insert into pulse_requests(public_id,scan_id,requested_by,request_context) values
        ('public-create','public','{"userId":"customer"}','{}'),
        ('unknown-create','unknown','{}','{}'),
        ('qa-create','qa','{"userId":"qa"}','{}'),
        ('key-create','key','{"apiKeyId":"qa-key"}','{}'),
        ('auth-create','auth','{"userId":"auth-qa"}','{}'),
        ('auth-key-create','auth-key','{"apiKeyId":"auth-key"}','{}'),
        ('created-create','created','{"apiKeyId":"created-key"}','{}'),
        ('ip-create','ip','{}','{"provenance":{"sourceIp":"192.0.2.1/32"}}'),
        ('client-create','client','{}','{"client":"LOCAL-QA"}'),
        ('bot-create','bot','{"apiKeyId":"mini"}','{}');
      insert into scan_requests(public_id,scan_id,fulfilled_by_scan_id,requested_by) values
        ('web-create','web','web','{"userId":"customer"}'),
        ('web-qa-create','web-qa','web-qa','{"userId":"qa"}');
      insert into scans(id) select distinct scan_id from pulse_requests union select distinct scan_id from scan_requests;
      insert into scans(id) values ('legacy'),('legacy-bot'),('config-canary'),('page-canary'),('request-canary');
      update scans set scan_config_json='{"normalizedUrl":"https://example.test/.well-known/certscore-canary/test"}' where id='config-canary';
      insert into scan_pages values ('page-canary','https://example.test/.well-known/certscore-canary/test');
      insert into pulse_requests(public_id,scan_id,requested_url) values ('canary-create','request-canary','https://example.test/.well-known/certscore-canary/test');`);
    const classify = async () => (await db.query(sql(SCAN_TRAFFIC_CLASSIFICATION_SQL), params)).rows[0];
    const mcp = async () => (await db.query(sql(MCP_TRAFFIC_EXCLUSIONS_SQL), [params[1], params[0]])).rows[0];
    const before = await classify();
    assert.deepEqual(before.qa.sort(), ["auth", "auth-key", "client", "config-canary", "created", "ip", "key", "page-canary", "qa", "request-canary", "web-qa"]);
    assert.deepEqual(before.macmini, ["bot"]);
    const mcpBefore = await mcp();
    assert.deepEqual(mcpBefore.qa.sort(), ["auth", "auth-key", "created", "key", "qa", "web-qa"]);
    assert.deepEqual(mcpBefore.macmini, ["bot"]);

    // Read/reuse requests exercise every exclusion signal, both request tables,
    // and scans for which the true creator was never retained.
    await db.query(`insert into pulse_requests(public_id,scan_id,requested_at,resolution_mode,requested_by,request_context,requested_url)
      select id||'-inspection',id,'2026-10-22 18:00Z','reused_existing_scan','{"userId":"qa","apiKeyId":"mini"}',
        '{"mode":"scanId","sourceIp":"192.0.2.1","clientName":"local-qa"}', 'https://example.test/.well-known/certscore-canary/inspection'
      from scans;
      insert into scan_requests(public_id,scan_id,fulfilled_by_scan_id,requested_at,resolution_mode,requested_by,request_context)
      select id||'-reuse',null,id,'2026-10-22 19:00Z','reused_existing_scan','{"userId":"qa","apiKeyId":"mini"}', '{"provenance":{"sourceIp":"192.0.2.1/32"}}'
      from scans;
      insert into pulse_requests(public_id,scan_id,requested_at,requested_by) values
        ('later-duplicate','public','2026-10-22 20:00Z','{"userId":"qa"}');
      insert into pulse_requests(public_id,scan_id,requested_by,request_context) values
        ('malformed-read','legacy','{"userId":"qa"}','{"mode":"scanId"}');
      insert into scan_requests(public_id,scan_id,requested_at,requested_by) values
        ('duplicate-wrapper','public','2026-10-22 09:00Z','{"userId":"qa"}');
      insert into pulse_requests(public_id,scan_id,requested_at,resolution_mode,requested_by) values
        ('external-reuse','qa','2026-10-22 20:00Z','reused_existing_scan','{"userId":"customer"}');`);
    const after = await classify();
    assert.deepEqual(after.qa.sort(), before.qa);
    assert.deepEqual(after.macmini, before.macmini);
    const mcpAfter = await mcp();
    assert.deepEqual(mcpAfter.qa.sort(), mcpBefore.qa);
    assert.deepEqual(mcpAfter.macmini, mcpBefore.macmini);

    // The filtered/search path uses the same creator semantics as cached totals.
    const rows = (await db.query(sql(`select s.id,
      ${scanOriginalRequesterQaSql("s.id", "$2", "$3", "$4")} as qa,
      ${scanOriginalRequesterMacMiniSql("s.id", "$1")} as macmini,
      ${scanOriginalRequestCanarySql("s.id")} as canary
      from scans s order by s.id`), params)).rows;
    assert.deepEqual(rows.filter(row => row.qa).map(row => row.id), ["auth", "auth-key", "client", "created", "ip", "key", "qa", "web-qa"]);
    assert.deepEqual(rows.filter(row => row.macmini).map(row => row.id), ["bot"]);
    assert.deepEqual(rows.filter(row => row.canary).map(row => row.id), ["request-canary"]);
    assert.equal((await db.query(sql(scanCreatorSql("'public'")))).rows[0].public_id, "public-create");
    assert.equal((await db.query(sql(scanCreatorSql("'legacy'")))).rowCount, 0);
  } finally { await db.end(); }
});
