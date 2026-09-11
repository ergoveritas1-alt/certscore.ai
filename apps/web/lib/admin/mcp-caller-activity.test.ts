import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { mcpCallerIdentity, mcpCallerAnchors, mcpCallerActivitySql } from "./mcp-caller-activity";

const details = { version: 1, arguments: {}, argumentsOmitted: false, actorBasis: "requester_binding", sessionBasis: "mcp_session", rateLimit: null };
const event = { actor_id: "actor-a", session_id: "session-a", request_details: details,
  event_id: "anchor", occurred_at: "2026-09-08T12:00:00Z", surface: "mcp_light", source: "openai" };

test("identity prefers declared callers then conversations, and labels weaker bindings honestly", () => {
  assert.equal(mcpCallerIdentity(event)?.label, "Requester / IP binding");
  assert.equal(mcpCallerIdentity({ ...event, request_details: undefined })?.label, "Unverified caller binding");
  assert.equal(mcpCallerIdentity({ ...event, request_details: { ...details, sessionBasis: "provider_conversation" } })?.kind, "session");
  assert.equal(mcpCallerIdentity({ ...event, request_details: { ...details, sessionBasis: "provider_conversation", actorBasis: "authenticated" } })?.label, "Authenticated caller");
  assert.equal(mcpCallerIdentity({ ...event, request_details: { ...details, actorBasis: "provider_ephemeral" } })?.label, "Provider-declared caller");
  assert.equal(mcpCallerIdentity({ ...event, actor_id: null })?.label, "MCP session");
  assert.equal(mcpCallerIdentity({ actor_id: null, session_id: null }), null);
  assert.equal(mcpCallerAnchors([{ ...event, actor_id: null, session_id: null }]).length, 0);
  assert.equal(mcpCallerAnchors(Array.from({ length: 101 }, () => event)).length, 100);
});

test("database counts all tools/outcomes in exact windows, with provider, entrypoint and traffic isolation", {
  skip: !process.env.MCP_DISCOVERY_TEST_DATABASE_URL,
}, async () => {
  const client = new pg.Client({ connectionString: process.env.MCP_DISCOVERY_TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(`create temp table mcp_tool_invocation_events (
      occurred_at timestamptz, surface text default 'mcp_light', source text default 'openai',
      actor_id text default 'actor-a', session_id text default 'session-a',
      tool_name text default 'certscore_get_scan_status', outcome text default 'success',
      quota_outcome text default 'allowed', transport_outcome text default 'mcp_result', is_canary boolean default false
    );
    insert into mcp_tool_invocation_events(occurred_at) values
      ('2026-09-08T12:00:00Z'), ('2026-09-08T11:55:00Z'), ('2026-09-08T11:54:59.999Z'),
      ('2026-09-08T11:50:00Z'), ('2026-09-08T11:49:59.999Z'), ('2026-09-08T11:00:00Z'),
      ('2026-09-08T10:59:59.999Z'), ('2026-09-08T12:00:00.001Z'),
      ('2026-09-07T12:00:00Z'), ('2026-09-07T11:59:59.999Z');
    insert into mcp_tool_invocation_events(occurred_at, tool_name, outcome, quota_outcome, transport_outcome) values
      ('2026-09-08T10:30:00Z','certscore_scan_site','rate_limited','rate_limited','http_429'),
      ('2026-09-08T11:59:00Z','certscore_scan_site','error','allowed','mcp_error'),
      ('2026-09-08T11:59:00Z','certscore_get_scan_bundle','rate_limited','rate_limited','http_429');
    insert into mcp_tool_invocation_events(occurred_at, surface, source, actor_id, session_id, is_canary) values
      ('2026-09-08T12:00:00Z','mcp_light','anthropic','actor-a','session-a',false),
      ('2026-09-08T12:00:00Z','mcp_anonymous','openai','actor-a','session-a',false),
      ('2026-09-08T12:00:00Z','mcp_light','openai','different','different',false),
      ('2026-09-08T12:00:00Z','mcp_light','openai','actor-a','session-a',true);`);
    const run = (anchors: ReturnType<typeof mcpCallerAnchors>, includeCanary = false) => client.query(
      mcpCallerActivitySql("($1::boolean or not events.is_canary)", 2).replaceAll("public.", "pg_temp."),
      [includeCanary, JSON.stringify(anchors)],
    );
    const result = await run(mcpCallerAnchors([event]));
    assert.deepEqual(result.rows, [{ event_id: "anchor", calls5m: 4, calls10m: 6, calls60m: 8, calls24h: 11, quota_hits60m: 1 }]);
    assert.equal((await run(mcpCallerAnchors([event]), true)).rows[0].calls60m, 9);
    assert.equal((await run(mcpCallerAnchors([event]), true)).rows[0].calls24h, 12);
    assert.deepEqual((await run(mcpCallerAnchors([{ ...event, actor_id: null }]))).rows, result.rows);
    assert.equal((await run(mcpCallerAnchors([{ ...event, event_id: "older", occurred_at: "2026-09-08T11:00:00Z" }]))).rows[0].calls5m, 2);
  } finally {
    await client.end();
  }
});
