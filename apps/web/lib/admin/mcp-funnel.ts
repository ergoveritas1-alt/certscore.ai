export const MCP_FUNNEL_FOLLOW_UP_MINUTES = [10, 30, 60] as const;
export const MCP_FUNNEL_RESULT_TOOLS = [
  "certscore_get_scan_bundle", "certscore_get_scan", "certscore_get_report", "certscore_get_evidence",
  "certscore_export_findings", "certscore_list_findings", "certscore_explain_finding",
  "certscore_get_pre_consent_cookies_trackers", "certscore_get_latest_domain_scan",
  "certscore_get_latest_domain_pre_consent_cookies_trackers",
] as const;

export type McpFunnelSession = {
  session_id: string; client_name: string | null; surface: string; source: string; initialized_at: string;
  mature: boolean; listed: boolean; calls: number; attempted: boolean; admitted: boolean;
  new_scan: boolean; reused: boolean; delivered: boolean; any_result: boolean;
  errors: number; quota_hits: number; status_calls: number; admitted_scans: number;
  truncation_known: number; truncated: number; purpose: string; integration: string;
  partial: boolean; no_go: boolean;
};
export type McpFunnelData = {
  sessions: McpFunnelSession[]; total_sessions: number; outside_cohort_calls: number;
  missing_session_calls: number; as_of: string;
};

// Parameters are shared with the workflow loader (1–10), then follow-up minutes,
// canonical no-go outcomes and result-tool names. SQL fragments are repository-owned.
export function mcpFunnelSql(input: { invocationVisibility: string; activationVisibility: string }) {
  const same = (a: string, b: string) => `${a}.session_id = ${b}.session_id and ${a}.surface = ${b}.surface and ${a}.source = ${b}.source and ${a}.client_name is not distinct from ${b}.client_name`;
  return `with recent_calls as materialized (
    select events.*, (${input.invocationVisibility}) as visible
    from public.mcp_tool_invocation_events events
    where occurred_at between now() - ($1::int * interval '1 hour') and now()
      and ($2::text is null or client_name = $2) and ($3::text is null or surface = $3) and ($4::text is null or source = $4)
  ), starts as materialized (
    select activation.session_id, activation.client_name, activation.surface, activation.source, min(activation.occurred_at) as initialized_at
    from public.mcp_activation_events activation
    where activation.stage = 'mcp_initialized' and activation.session_id is not null
      and activation.occurred_at between now() - ($1::int * interval '1 hour') and now()
      and ($2::text is null or activation.client_name = $2) and ($3::text is null or activation.surface = $3) and ($4::text is null or activation.source = $4)
      and (${input.activationVisibility})
      and not exists (select 1 from public.mcp_activation_events older where ${same('older', 'activation')}
        and older.stage = 'mcp_initialized' and older.occurred_at < now() - ($1::int * interval '1 hour'))
      and not exists (select 1 from recent_calls excluded where not excluded.visible
        and excluded.session_id = activation.session_id and excluded.surface = activation.surface and excluded.source = activation.source)
    group by activation.session_id, activation.client_name, activation.surface, activation.source
  ), cohort as materialized (
    select * from starts order by initialized_at desc, session_id, surface, source, client_name nulls last limit 5000
  ), matched as materialized (
    select events.*, cohort.initialized_at,
      events.tool_name = 'certscore_scan_site' and events.outcome = 'success' and events.scan_decision in ('new','reused') and events.scan_id is not null as admitted,
      case when events.tool_name = 'certscore_scan_site' then nullif(to_jsonb(events)->'request_details'->'taskContext'->>'purpose','unknown') end as purpose_hint,
      case when events.tool_name = 'certscore_scan_site'
        and to_jsonb(events)->'request_details'->'taskContext'->>'integrationId' is not null
        and to_jsonb(events)->'request_details'->'taskContext'->>'integrationVersion' is not null
        then jsonb_build_array(to_jsonb(events)->'request_details'->'taskContext'->>'integrationId',
          to_jsonb(events)->'request_details'->'taskContext'->>'integrationVersion',
          to_jsonb(events)->'request_details'->'taskContext'->>'skillVersion')::text end as integration_hint
    from cohort join recent_calls events on ${same('events', 'cohort')}
      and events.occurred_at >= cohort.initialized_at and events.occurred_at <= cohort.initialized_at + ($11::int * interval '1 minute')
      and events.visible
  ), admissions as materialized (
    select session_id, client_name, surface, source, scan_id, min(occurred_at) as accepted_at
    from matched where admitted group by session_id, client_name, surface, source, scan_id
  ), measured as (
    select cohort.*,
      cohort.initialized_at + ($11::int * interval '1 minute') <= now() as mature,
      exists (select 1 from public.mcp_activation_events listed where ${same('listed','cohort')} and listed.stage = 'mcp_tools_listed'
        and listed.occurred_at between cohort.initialized_at and least(now(), cohort.initialized_at + ($11::int * interval '1 minute'))) as listed,
      count(events.event_id)::int as calls,
      coalesce(bool_or(events.tool_name = 'certscore_scan_site'),false) as attempted,
      coalesce(bool_or(events.admitted),false) as admitted,
      coalesce(bool_or(events.admitted and events.scan_decision = 'new'),false) as new_scan,
      coalesce(bool_or(events.admitted and events.scan_decision = 'reused'),false) as reused,
      coalesce(bool_or(events.outcome = 'success' and events.tool_name = any($13::text[]) and accepted.accepted_at < events.occurred_at),false) as delivered,
      coalesce(bool_or(events.outcome = 'success' and events.tool_name = any($13::text[])),false) as any_result,
      count(events.event_id) filter(where events.outcome <> 'success')::int as errors,
      count(events.event_id) filter(where events.quota_outcome = 'rate_limited')::int as quota_hits,
      count(events.event_id) filter(where events.tool_name = 'certscore_get_scan_status' and accepted.accepted_at < events.occurred_at)::int as status_calls,
      count(distinct events.scan_id) filter(where events.admitted)::int as admitted_scans,
      count(events.event_id) filter(where to_jsonb(events)->'request_details'->'response'->>'truncated' in ('true','false'))::int as truncation_known,
      count(events.event_id) filter(where to_jsonb(events)->'request_details'->'response'->>'truncated' = 'true')::int as truncated,
      case when min(events.purpose_hint) = max(events.purpose_hint) then min(events.purpose_hint)
        when count(events.purpose_hint) > 0 then 'multiple' else 'unknown' end as purpose,
      case when min(events.integration_hint) = max(events.integration_hint) then min(events.integration_hint)
        when count(events.integration_hint) > 0 then 'multiple' else 'unknown' end as integration,
      coalesce(bool_or(events.admitted and snapshot.scan_outcome = 'completed_partial'),false) as partial,
      coalesce(bool_or(events.admitted and snapshot.scan_outcome = any($12::text[])),false) as no_go
    from cohort left join matched events on ${same('events','cohort')}
    left join admissions accepted on ${same('accepted','events')} and accepted.scan_id = events.scan_id
    left join public.scan_snapshots snapshot on snapshot.scan_id = case when events.admitted
      and events.scan_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then events.scan_id::uuid else null end
    group by cohort.session_id, cohort.client_name, cohort.surface, cohort.source, cohort.initialized_at
  )
  select now() as as_of, (select count(*)::int from starts) as total_sessions,
    (select count(*)::int from recent_calls events where events.visible and not exists(select 1 from starts where ${same('starts','events')})) as outside_cohort_calls,
    (select count(*)::int from recent_calls where visible and session_id is null) as missing_session_calls,
    coalesce((select jsonb_agg(to_jsonb(measured) order by initialized_at desc, session_id) from measured),'[]'::jsonb) as sessions`;
}

export function summarizeMcpFunnel(sessions: McpFunnelSession[]) {
  const mature = sessions.filter(row => row.mature);
  const n = (predicate: (row: McpFunnelSession) => boolean) => mature.filter(predicate).length;
  return { connected: mature.length, pending: sessions.length - mature.length,
    listed: n(r => r.listed), called: n(r => r.calls > 0), attempted: n(r => r.attempted),
    admitted: n(r => r.admitted), newScan: n(r => r.new_scan), reused: n(r => r.reused), delivered: n(r => r.delivered),
    resultOnly: n(r => r.any_result && !r.attempted), withErrors: n(r => r.errors > 0), quotaSessions: n(r => r.quota_hits > 0),
    purposeKnown: n(r => r.purpose !== 'unknown'), integrationKnown: n(r => r.integration !== 'unknown'),
    partial: n(r => r.partial), noGo: n(r => r.no_go),
    statusCalls: mature.reduce((sum,r) => sum+r.status_calls,0), admittedScans: mature.reduce((sum,r) => sum+r.admitted_scans,0),
    truncationKnown: mature.reduce((sum,r) => sum+r.truncation_known,0), truncated: mature.reduce((sum,r) => sum+r.truncated,0),
  };
}

export function mcpFunnelBreakdown(sessions: McpFunnelSession[]) {
  const groups = new Map<string, McpFunnelSession[]>();
  for (const row of sessions.filter(r => r.mature)) {
    const key = JSON.stringify([row.client_name, row.surface, row.source, row.purpose, row.integration]);
    const group = groups.get(key); if (group) group.push(row); else groups.set(key,[row]);
  }
  return [...groups.entries()].map(([key, rows]) => ({key, first: rows[0]!, ...summarizeMcpFunnel(rows)}))
    .sort((a,b) => b.connected-a.connected || a.key.localeCompare(b.key));
}
