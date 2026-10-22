import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import pg from 'pg';
import { getAdminUsersOrderBy, type AdminUsersSortKey } from './admin-users-sort';
import { SCAN_TRAFFIC_CLASSIFICATION_SQL } from '../../lib/admin/scan-traffic-classification-sql';

const repository = readFileSync('apps/web/server/admin/repository.ts', 'utf8');
const databaseUrl = process.env.ADMIN_PERFORMANCE_TEST_DATABASE_URL;
async function connect() {
  assert.ok(['localhost','127.0.0.1'].includes(new URL(databaseUrl!).hostname));
  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  return db;
}

test('Users preserves submitted/claimed/request counts and sorting with grouped history', { skip: !databaseUrl }, async () => {
  const db = await connect();
  try {
    await db.query(`create temp table users(id uuid, email text, full_name text, auth_provider text, created_at timestamptz, updated_at timestamptz);
      create temp table organization_members(user_id uuid, organization_id uuid, role text, created_at timestamptz);
      create temp table organizations(id uuid, name text, slug text, plan text, plan_status text);
      create temp table better_auth_users(id text, email text, role text);
      create temp table better_auth_sessions(user_id text, created_at timestamptz);
      create temp table mcp_oauth_clients(client_id text, client_name text);
      create temp table mcp_oauth_refresh_tokens(owner_user_id text, client_id text, revoked_at timestamptz, expires_at timestamptz, created_at timestamptz, last_used_at timestamptz);
      create temp table scans(domain_id uuid, submitted_by_user_id uuid, claimed_by_user_id uuid, created_at timestamptz, completed_at timestamptz);
      create temp table scan_requests(requested_by jsonb, requested_at timestamptz);
      create temp table pulse_requests(requested_by jsonb, requested_at timestamptz);
      create temp table product_analytics_events(event_id text, user_id uuid, occurred_at timestamptz, event_name text, feature text, outcome text);
      insert into users select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid, chr(96+n)||'@example.test',null,'password',now(),now() from generate_series(1,3) n;
      insert into scans select id,id,id,'2026-09-01','2026-09-01' from users where email='a@example.test';
      insert into scans select b.id,a.id,b.id,'2026-09-02',null from users a,users b where a.email='a@example.test' and b.email='b@example.test';
      insert into scans select id,null,id,'2026-09-03','2026-09-03' from users where email='a@example.test';
      insert into scan_requests select jsonb_build_object('userId',id),'2026-09-04' from users where email='a@example.test';
      insert into pulse_requests select jsonb_build_object('userId',id),'2026-09-05' from users where email='a@example.test';
      insert into product_analytics_events select 'event-a',id,'2026-09-07','mcp_tools_listed','mcp:claude','success' from users where email='a@example.test';
      insert into better_auth_users values ('login-a','a@example.test','admin');
      insert into better_auth_sessions values ('login-a','2026-09-06');`);
    const source = repository.slice(repository.indexOf('export async function loadAdminUsersPageData('));
    const start = source.indexOf('`with selected_users');
    const sqlTemplate = source.slice(start + 1, source.indexOf('`,', start));
    for (const sort of ['user','activity','lastLogin','lastScan','access','assign','plan'] as AdminUsersSortKey[]) {
      for (const direction of ['asc','desc'] as const) {
        const sql = sqlTemplate.replace('${getAdminUsersOrderBy(sortKey, direction)}', getAdminUsersOrderBy(sort, direction));
        const rows = (await db.query(sql,[10,0])).rows;
        assert.equal(rows.length,3);
        const a = rows.find(row => row.email==='a@example.test');
        assert.equal(a.total_scans,2); assert.equal(a.completed_scans,1); assert.equal(a.domain_count,2);
        assert.equal(a.associated_scan_count,3, 'self-claimed submitted scans count once');
        assert.equal(a.scan_request_count,2, 'logical scan and API requests both count');
        assert.equal(rows.find(row=>row.email==='b@example.test').associated_scan_count,1);
        assert.equal(rows.find(row=>row.email==='c@example.test').total_scans,0);
        if (sort==='lastLogin') assert.equal(rows[0].email,'a@example.test', 'null login dates remain last in either direction');
        assert.deepEqual((await db.query(sql,[1,1])).rows, [rows[1]], 'pagination follows the global sort');
      }
    }
  } finally { await db.end(); }
});

test('cached scan classification preserves canary, ownership, IP, client, reused-scan and bot identities', { skip: !databaseUrl }, async () => {
  const db = await connect();
  try {
    await db.query(`create temp table scans(id text,scan_config_json jsonb);
      create temp table scan_pages(scan_id text,page_url text);
      create temp table scan_requests(scan_id text,fulfilled_by_scan_id text,requested_by jsonb,request_context jsonb,requested_url text);
      create temp table pulse_requests(scan_id text,requested_by jsonb,request_context jsonb,requested_url text);
      create temp table integration_api_keys(public_id text,name text,owner_user_id text,created_by text);
      create temp table users(id text,email text);
      create temp table better_auth_users(id text,email text);
      insert into scan_pages values ('canary','https://example.test/.well-known/certscore-canary/check'),('ordinary','https://example.test/');
      insert into scans values ('config-only-canary','{"normalizedUrl":"https://example.test/.well-known/certscore-canary/sentinels/test.html"}'),
        ('config-only-ordinary','{"normalizedUrl":"https://example.test/"}');
      insert into users values ('qa','qa@example.test');
      insert into integration_api_keys values ('bot','mini',null,null),('owner','ordinary','qa',null);
      insert into pulse_requests values ('owner','{"apiKeyId":"owner"}','{}',null),('ip','{}','{"provenance":{"sourceIp":"192.0.2.1/32"}}',null),('client','{}','{"client":"LOCAL-QA"}',null),('bot','{"apiKeyId":"bot"}','{}',null),('external','{}','{}',null);
      insert into scan_requests values ('original','fulfilled','{"userId":"qa"}','{}',null),('unlinked',null,'{}','{}','https://example.test/.well-known/certscore-canary/check');`);
    const row = (await db.query(SCAN_TRAFFIC_CLASSIFICATION_SQL.replaceAll('public.','pg_temp.'),[['mini'],['qa@example.test'],['192.0.2.1'],['local-qa']])).rows[0];
    assert.deepEqual(row.qa.sort(),['canary','client','config-only-canary','fulfilled','ip','owner','unlinked']);
    assert.deepEqual(row.macmini,['bot']);
  } finally { await db.end(); }
});

test('admin read paths rely on the existing scan-request migration rather than runtime DDL', () => {
  assert.doesNotMatch(repository, /ensureScanRequestLogTable/);
  const migration=readFileSync('packages/db/migrations/0105_scan_requests.sql','utf8');
  assert.match(migration, /create table if not exists public\.scan_requests/);
  assert.match(repository, /recent_users as materialized/);
});


test('admin navigation does not prefetch expensive background telemetry pages', () => {
  const layout=readFileSync('apps/web/app/app/admin/layout.tsx','utf8');
  assert.match(layout, /prefetch=\{false\}/);
  assert.doesNotMatch(layout, /prefetch=\{item\.href/);
});
