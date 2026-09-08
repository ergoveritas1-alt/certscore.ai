import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { mcpFunnelSql, summarizeMcpFunnel, mcpFunnelBreakdown, MCP_FUNNEL_RESULT_TOOLS } from "./mcp-funnel";
import { SCAN_NO_GO_SNAPSHOT_OUTCOMES } from "@website-signal-risk-scanner/shared";

const databaseUrl = process.env.MCP_DISCOVERY_TEST_DATABASE_URL;
test("session funnel uses mature cohorts, exact identity, ordered same-scan retrieval and canonical outcomes", { skip: !databaseUrl }, async () => {
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(databaseUrl!).hostname));
  const db = new pg.Client({connectionString:databaseUrl}); await db.connect();
  try {
    await db.query(`begin;
      create temp table mcp_activation_events(session_id text,client_name text default 'app',surface text default 'mcp_light',source text default 'unknown',stage text default 'mcp_initialized',occurred_at timestamptz);
      create temp table mcp_tool_invocation_events(event_id text,session_id text,client_name text default 'app',surface text default 'mcp_light',source text default 'unknown',occurred_at timestamptz,
        tool_name text,outcome text default 'success',quota_outcome text default 'allowed',scan_id text,scan_decision text default 'not_applicable',request_details jsonb,is_canary boolean default false);
      create temp table scan_snapshots(scan_id uuid unique,scan_outcome text);
      insert into mcp_activation_events(session_id,occurred_at) values
        ('success',now()-interval '120 minutes'),('blocked',now()-interval '120 minutes'),('pending',now()-interval '5 minutes'),
        ('late',now()-interval '120 minutes'),('read-only',now()-interval '120 minutes'),('cross',now()-interval '120 minutes'),
        ('no-go',now()-interval '120 minutes'),('old',now()-interval '8 hours'),('old',now()-interval '2 hours'),
        ('hidden',now()-interval '120 minutes'),('probe',now()-interval '120 minutes');
      insert into mcp_activation_events(session_id,occurred_at) values ('success',now()-interval '119 minutes');
      insert into scan_snapshots values ('00000000-0000-4000-8000-000000000001','completed_partial'),('00000000-0000-4000-8000-000000000002','authentication_required');`);
    const scan = '00000000-0000-4000-8000-000000000001', noGo = '00000000-0000-4000-8000-000000000002';
    let id=0;
    const call=async(session:string|null,tool:string,minutesAgo:number,extra:{scan?:string;decision?:string;outcome?:string;quota?:string;client?:string;hidden?:boolean;details?:unknown}={}) => db.query(`insert into mcp_tool_invocation_events(event_id,session_id,tool_name,occurred_at,scan_id,scan_decision,outcome,quota_outcome,client_name,is_canary,request_details)
      values($1,$2,$3,now()-($4::int*interval '1 minute'),$5,$6,$7,$8,$9,$10,$11)`,[String(++id),session,tool,minutesAgo,extra.scan??scan,extra.decision??'not_applicable',extra.outcome??'success',extra.quota??'allowed',extra.client??'app',extra.hidden??false,extra.details??null]);
    await call('success','certscore_scan_site',119,{decision:'new',details:{taskContext:{purpose:'tracking_check',integrationId:'plugin',integrationVersion:'1',skillVersion:'r1'}}});
    await call('success','certscore_get_scan_status',118,{outcome:'error'});
    await call('success','certscore_get_report',117,{details:{response:{truncated:true}}});
    await call('success','certscore_get_evidence',116,{details:{response:{truncated:false}}});
    await call('success','certscore_scan_site',115,{decision:'reused'});
    await call('blocked','certscore_scan_site',119,{outcome:'rate_limited',quota:'rate_limited'});
    await call('pending','certscore_scan_site',4,{decision:'new'});
    await call('late','certscore_get_scan_bundle',120); // Before admission: not a conversion.
    await call('late','certscore_scan_site',119,{decision:'new'});
    await call('late','certscore_get_scan_bundle',80); // After follow-up deadline.
    await call('late','certscore_get_evidence',118,{scan:noGo}); // Wrong scan.
    await call('read-only','certscore_get_evidence',119);
    await call('cross','certscore_get_scan_bundle',119); // Another session's admitted scan.
    await call('cross','certscore_scan_site',119,{decision:'new',client:'another-client'}); // Same session token, different client.
    await call('no-go','certscore_scan_site',119,{decision:'new',scan:noGo});
    await call('no-go','certscore_get_scan_bundle',118,{scan:noGo});
    await call('hidden','certscore_scan_site',119,{decision:'new',hidden:true});
    await call('old','certscore_get_scan_bundle',119);
    await call('no-initialize','certscore_get_scan_status',100);
    await call(null,'certscore_get_scan_status',100);
    const sql=mcpFunnelSql({invocationVisibility:'not events.is_canary and $5::boolean and $6::text[] is not null and $7::text[] is not null and $8::text[] is not null and $9::boolean and $10::text[] is not null',activationVisibility:'true'}).replaceAll('public.','pg_temp.');
    const data=(await db.query(sql,[6,null,null,null,true,[],[],[],true,[],30,SCAN_NO_GO_SNAPSHOT_OUTCOMES,MCP_FUNNEL_RESULT_TOOLS])).rows[0]!;
    assert.equal(data.total_sessions,8); // Old and excluded sessions omitted; duplicate initialize deduplicated.
    assert.equal(data.outside_cohort_calls,4);
    assert.equal(data.missing_session_calls,1);
    const summary=summarizeMcpFunnel(data.sessions);
    assert.deepEqual([summary.connected,summary.pending,summary.called,summary.attempted,summary.admitted,summary.delivered],[7,1,6,4,3,2]);
    assert.deepEqual([summary.newScan,summary.reused,summary.resultOnly,summary.quotaSessions,summary.partial],[3,1,2,1,2]);
    assert.equal(data.sessions.find((r:any)=>r.session_id==='late').delivered,false);
    assert.equal(data.sessions.find((r:any)=>r.session_id==='cross').admitted,false);
    assert.equal(summary.truncationKnown,2); assert.equal(summary.truncated,1);
    assert.equal(summary.purposeKnown,1); assert.equal(summary.integrationKnown,1);
    assert.equal(summary.listed,0); // Direct tool calls need no tools/list activation.
    assert.ok(mcpFunnelBreakdown(data.sessions).some(g=>g.first.purpose==='tracking_check'&&g.delivered===1));
    const canonicalNoGo=SCAN_NO_GO_SNAPSHOT_OUTCOMES[0]!;
    await db.query('update scan_snapshots set scan_outcome=$1 where scan_id=$2',[canonicalNoGo,noGo]);
    const updated=(await db.query(sql,[6,null,null,null,true,[],[],[],true,[],30,SCAN_NO_GO_SNAPSHOT_OUTCOMES,MCP_FUNNEL_RESULT_TOOLS])).rows[0]!;
    assert.equal(summarizeMcpFunnel(updated.sessions).noGo,1);
    await db.query(`insert into mcp_activation_events(session_id,occurred_at)
      select 'bounded-'||i,now()-interval '3 hours' from generate_series(1,5001) i`);
    const bounded=(await db.query(sql,[6,null,null,null,true,[],[],[],true,[],30,SCAN_NO_GO_SNAPSHOT_OUTCOMES,MCP_FUNNEL_RESULT_TOOLS])).rows[0]!;
    assert.equal(bounded.total_sessions,5009);
    assert.equal(bounded.sessions.length,5000);
    assert.equal(new Set(bounded.sessions.map((row:any)=>row.session_id)).size,5000);
    const empty=(await db.query(sql,[6,'no-such-client',null,null,true,[],[],[],true,[],30,SCAN_NO_GO_SNAPSHOT_OUTCOMES,MCP_FUNNEL_RESULT_TOOLS])).rows[0]!;
    assert.equal(empty.total_sessions,0); assert.deepEqual(empty.sessions,[]);
    await db.query('rollback');
  } finally {await db.end();}
});
