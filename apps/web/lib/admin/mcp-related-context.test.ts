import assert from "node:assert/strict";
import test from "node:test";
import { mcpContextAnchors, mcpRelatedContextSql, parseMcpRelatedContext } from "./mcp-related-context";
const request_details = { version: 1, arguments: {}, argumentsOmitted: false, actorBasis: "requester_binding", sessionBasis: "mcp_session", rateLimit: null };
const event = { event_id: "current", occurred_at: "2026-09-09T00:00:00Z", source: "openai", surface: "mcp_light", scan_id: "scan_123", actor_id: "a".repeat(24), session_id: "b".repeat(24), request_details };
test("related context requires scan, session and caller and never replaces this call's supplied question", () => {
  assert.equal(mcpContextAnchors([event]).length, 1);
  for (const missing of ["scan_id", "actor_id", "session_id"]) assert.equal(mcpContextAnchors([{...event,[missing]:null}]).length, 0);
  assert.equal(mcpContextAnchors([{ ...event, request_details: null }]).length, 0);
  const context = { questionSummary: "Review analytics", questionSource: "user_wording", shareForImprovement: true };
  assert.equal(mcpContextAnchors([{ ...event, request_details: { ...request_details, taskContext: context } }]).length, 0);
  const source = { source_event_id: "earlier", source_occurred_at: "2026-09-08T23:00:00Z", request_details: { ...request_details, taskContext: context } };
  assert.equal(parseMcpRelatedContext(source)?.eventId, "earlier");
  assert.equal(parseMcpRelatedContext({...source, request_details:{...request_details, taskContext:{...context,shareForImprovement:false}}}), null);
});
test("related lookup preserves every identity boundary, prior time and traffic visibility", () => {
  const sql = mcpRelatedContextSql("events.is_canary = false", 3);
  for (const field of ["session_id", "actor_id", "scan_id", "surface", "source"]) assert.ok(sql.includes(`events.${field} = anchor.${field}`));
  assert.match(sql, /events\.occurred_at < anchor\.occurred_at/);
  assert.match(sql, /interval '24 hours'/);
  assert.match(sql, /events\.is_canary = false/);
  assert.match(sql, /limit 1/);
  assert.match(sql, /jsonb_to_recordset\(\$3::jsonb\)/);
});

test("PostgreSQL context lookup cannot cross caller/session/scan or visibility boundaries", { skip: !process.env.MCP_CONTEXT_TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.MCP_CONTEXT_TEST_DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/wc01_mcp_context_qa", "Only the disposable local context QA database is allowed");
  const { Client } = await import("pg");
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query("begin");
    await db.query(`create table public.mcp_tool_invocation_events (event_id uuid primary key, occurred_at timestamptz, session_id text, actor_id text, scan_id text, source text, surface text, tool_name text, request_details jsonb, is_canary boolean)`);
    const context = { ...request_details, taskContext: { questionSummary: "Original context", questionSource: "user_wording", shareForImprovement: true } };
    const now = new Date();
    const prior = new Date(now.getTime()-60000);
    const sourceId = "11111111-1111-4111-8111-111111111111";
    await db.query("insert into public.mcp_tool_invocation_events values ($1,$2,$3,$4,$5,$6,$7,'certscore_scan_site',$8,false)", [sourceId, prior, event.session_id,event.actor_id,event.scan_id,event.source,event.surface,JSON.stringify(context)]);
    const anchor = { ...event, occurred_at: now.toISOString() };
    const lookup = async (value: typeof anchor) => (await db.query(mcpRelatedContextSql("events.is_canary = false",1),[JSON.stringify([value])])).rows;
    assert.equal((await lookup(anchor))[0]?.source_event_id,sourceId);
    for (const field of ["session_id", "actor_id", "scan_id", "source", "surface"] as const) assert.equal((await lookup({...anchor,[field]:"different"})).length,0,field);
    await db.query("update public.mcp_tool_invocation_events set is_canary=true");
    assert.equal((await lookup(anchor)).length,0);
    await db.query("update public.mcp_tool_invocation_events set is_canary=false, occurred_at=$1",[new Date(now.getTime()+60000)]);
    assert.equal((await lookup(anchor)).length,0);
    await db.query("update public.mcp_tool_invocation_events set occurred_at=$1",[new Date(now.getTime()-25*3600000)]);
    assert.equal((await lookup(anchor)).length,0);
    // Same serialization as the production check constraint, using a maximal preview.
    const { captureMcpCallerInput, boundMcpRequestDetails } = await import("@website-signal-risk-scanner/shared");
    const bounded = boundMcpRequestDetails({...request_details, actorBasis:"requester_binding", sessionBasis:"mcp_session", version:1,
      callerInput:captureMcpCallerInput(Object.fromEntries(Array.from({length:100},(_,i)=>[`extra${i}`,"日本語の説明。".repeat(40)])))});
    const bytes = await db.query("select octet_length($1::jsonb::text) as bytes",[JSON.stringify(bounded)]);
    assert.ok(bytes.rows[0].bytes <= 4096);
  } finally { await db.query("rollback"); await db.end(); }
});
