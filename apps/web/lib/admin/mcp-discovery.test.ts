import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import pg from "pg";
import { discoveryBehavior, mcpClientHref, mcpDiscoverySql, type McpDiscoveryClient } from "./mcp-discovery";

test("discovery behavior distinguishes tool use without guessing a bot identity", () => {
  assert.equal(discoveryBehavior({ tool_calls: 0, catalog_reads: 4 }), "Catalogue only");
  assert.equal(discoveryBehavior({ tool_calls: 0, catalog_reads: 0 }), "Handshake only");
  assert.equal(discoveryBehavior({ tool_calls: 1, catalog_reads: 0 }), "Tool use observed");
});

test("cross-view links preserve exact names, provider, surface and traffic scope", () => {
  const url = new URL(mcpClientHref("usage", { clientName: "probe & test/%", surface: "mcp_light", source: "unknown", traffic: "all", period: "1h" }), "http://localhost:3000");
  assert.equal(url.searchParams.get("client"), "probe & test/%");
  assert.equal(url.searchParams.get("surface"), "mcp_light");
  assert.equal(url.searchParams.get("source"), "unknown");
  assert.equal(url.searchParams.get("traffic"), "all");
  assert.equal(url.searchParams.get("timeSpan"), "4h");
  assert.equal(url.searchParams.get("tab"), "usage");
  assert.equal(url.searchParams.has("q"), false);
});

test("discovery is admin-gated, cached, and does not load the usage dashboard", () => {
  const repository = readFileSync("apps/web/server/admin/mcp-telemetry.ts", "utf8");
  const page = readFileSync("apps/web/app/app/admin/mcp/page.tsx", "utf8");
  const loader = repository.slice(repository.indexOf("export async function loadAdminMcpDiscovery"));
  assert.ok(loader.indexOf("await requirePlatformAdminContext()") < loader.indexOf("return loadCachedAdminMcpDiscovery("));
  assert.match(repository, /admin-mcp-discovery-v3.*revalidate: 30/);
  assert.ok(page.indexOf('return <McpDiscoveryView') < page.indexOf('const [dashboard, eventPage]'));
  assert.match(repository, /client_name = \$\{addValue\(filters.clientName/);
});

// Run explicitly against a local database. All fixtures are connection-local temporary tables.
const databaseUrl = process.env.MCP_DISCOVERY_TEST_DATABASE_URL;
test("PostgreSQL aggregation preserves coverage, filtering, counts and traffic isolation", { skip: !databaseUrl }, async () => {
  const url = new URL(databaseUrl!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Fixtures require a local database");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`create temporary table mcp_tool_invocation_events (
      auth_class text default 'anonymous', client_name text, surface text default 'mcp_light', source text default 'unknown',
      attribution_confidence text default 'declared', occurred_at timestamptz default now(),
      session_id text, actor_id text, requester_ip inet, request_details jsonb, quota_outcome text default 'allowed', transport_outcome text default 'mcp_result', tool_name text, outcome text, error_code text, is_canary boolean default false
    );
    create temporary table mcp_activation_events (
      auth_class text default 'anonymous', client_name text, surface text default 'mcp_light', source text default 'unknown',
      attribution_confidence text default 'declared', occurred_at timestamptz default now(),
      session_id text, actor_id text, stage text
    );
    insert into mcp_activation_events(client_name,session_id,stage) values
      ('probe','p','mcp_initialized'), ('probe','p','mcp_tools_listed'),
      ('user','u','mcp_initialized'), ('user','u','mcp_tools_listed'),
      ('user','u','mcp_first_tool_invoked'), ('user','u','mcp_scan_requested'),
      ('linked-internal','i','mcp_initialized'), ('qa-only','q','mcp_initialized'),
      ('handshake','h','mcp_initialized');
    insert into mcp_activation_events(client_name,session_id,stage,occurred_at) values
      ('old','old','mcp_initialized',now()-interval '2 days'),
      ('future','future','mcp_initialized',now()+interval '1 day');
    insert into mcp_activation_events(client_name,session_id,stage,source,attribution_confidence) values
      ('probe','p2','mcp_initialized','openai','verified');
    insert into mcp_activation_events(client_name,session_id,stage,surface) values
      ('other-surface','i','mcp_initialized','mcp_anonymous');
    insert into mcp_tool_invocation_events(client_name,session_id,tool_name,outcome,error_code) values
      ('user','u','certscore_scan_site','success',null),
      ('user','u','certscore_get_scan_bundle','success',null),
      ('user','u','certscore_get_scan_status','error','invalid_scan_id'),
      ('user','u','certscore_get_scan_bundle','rate_limited','rate_limited'),
      ('probe-extra','e','certscore_get_scan_status','success',null),
      ('invocation-only','n','certscore_get_scan_status','error','invalid_scan_id');
    insert into mcp_tool_invocation_events(client_name,session_id,tool_name,outcome,is_canary) values
      ('linked-internal','i','certscore_scan_site','success',true);`);
    await client.query(readFileSync("packages/db/migrations/0196_mcp_request_details.sql", "utf8").replaceAll("public.", "pg_temp."));
    await assert.rejects(client.query("insert into mcp_tool_invocation_events(request_details) values ($1::jsonb)", [JSON.stringify({ oversized: "x".repeat(4100) })]), /mcp_request_details_bounded/);
    await client.query(`update mcp_tool_invocation_events set actor_id='actor-a', requester_ip='192.0.2.10', request_details='{"actorBasis":"provider_ephemeral"}' where client_name='user';
      update mcp_tool_invocation_events set quota_outcome='rate_limited', transport_outcome='http_429' where outcome='rate_limited';`);
    const sql = mcpDiscoverySql({ invocationVisibility: "not events.is_canary", activationVisibility: "activation.client_name <> 'qa-only'" }).replaceAll("public.", "pg_temp.");
    const run = async (overrides: { search?: string; surface?: string; exact?: string; source?: string; limit?: number; offset?: number } = {}) => {
      const { rows } = await client.query<{ total_count: number; items: McpDiscoveryClient[] }>(sql,
        [24, overrides.search ?? "", overrides.surface ?? null, overrides.exact ?? null, overrides.limit ?? 100, overrides.offset ?? 0, overrides.source ?? null]);
      return rows[0]!;
    };
    const result = await run();
    assert.equal(result.total_count, 7);
    assert.equal(result.items.some(row => ["old", "future", "qa-only", "linked-internal"].includes(row.client_name!)), false);
    const user = result.items.find(row => row.client_name === "user")!;
    assert.deepEqual([user.initializations, user.catalog_reads, user.sessions, user.tool_calls, user.tool_errors, user.scan_requests, user.bundles], [1, 1, 1, 4, 2, 1, 1]);
    assert.deepEqual([user.actors, user.requester_ips, user.identified_callers, user.identity_covered_calls, user.quota_hits, user.http_429], [1, 1, 1, 4, 1, 1]);
    assert.deepEqual(user.error_codes, ["invalid_scan_id", "rate_limited"]);
    assert.deepEqual(user.methods, ["initialize", "tools/call", "tools/list"]);
    const probe = (await run({ exact: "probe", source: "unknown" })).items[0]!;
    assert.equal(probe.tool_calls, 0);
    assert.deepEqual(probe.confidence, ["declared"]);
    assert.equal((await run({ exact: "probe" })).total_count, 2, "provider groups must not upgrade each other's confidence");
    assert.equal((await run({ search: "PROBE" })).total_count, 3);
    assert.equal((await run({ search: "%" })).total_count, 0, "search must treat wildcard text literally");
    assert.equal((await run({ surface: "mcp_anonymous" })).items[0]?.client_name, "other-surface", "session exclusions stay scoped to entrypoint");
    assert.equal((await run({ exact: "probe' OR true --" })).total_count, 0);
    const emptyPage = await run({ offset: 100 });
    // Anonymous actor bindings can represent a shared IP; they must not hide
    // another session's initialization, even when the QA session is excluded.
    await client.query(`update mcp_tool_invocation_events set actor_id='shared-ip' where client_name='linked-internal';
      insert into mcp_activation_events(client_name, session_id, actor_id, stage) values ('shared-ip-customer','customer-session','shared-ip','mcp_initialized');
      insert into mcp_tool_invocation_events(client_name, session_id, actor_id, tool_name, outcome) values ('shared-ip-customer','customer-session','shared-ip','certscore_get_scan_status','success');`);
    const sharedIpCustomer = (await run({ exact: "shared-ip-customer" })).items[0]!;
    assert.equal(sharedIpCustomer.initializations, 1);
    assert.equal(sharedIpCustomer.tool_calls, 1);
    assert.equal(emptyPage.total_count, 7);
    assert.deepEqual(emptyPage.items, []);
    assert.equal((await run({ limit: 1 })).items.length, 1);
  } finally {
    await client.end();
  }
});
