export const MCP_DISCOVERY_PERIODS = { "1h": 1, "6h": 6, "24h": 24, "7d": 168, "30d": 720 } as const;
export type McpDiscoveryPeriod = keyof typeof MCP_DISCOVERY_PERIODS;

export type McpDiscoveryClient = {
  client_name: string | null;
  surface: string;
  source: string;
  confidence: string[];
  first_seen: string;
  last_seen: string;
  sessions: number;
  actors: number;
  requester_ips: number;
  identified_callers: number;
  identity_covered_calls: number;
  quota_hits: number;
  http_429: number;
  initializations: number;
  catalog_reads: number;
  tool_calls: number;
  tool_errors: number;
  scan_requests: number;
  bundles: number;
  methods: string[];
  error_codes: string[];
};

export function discoveryBehavior(row: Pick<McpDiscoveryClient, "tool_calls" | "catalog_reads">) {
  if (row.tool_calls > 0) return "Tool use observed";
  return row.catalog_reads > 0 ? "Catalogue only" : "Handshake only";
}

export function mcpClientHref(tab: "usage" | "discovery" | "workflows", input: {
  clientName?: string | null; surface?: string | null; source?: string | null; traffic: string; period?: string;
}) {
  const params = new URLSearchParams({ tab, traffic: input.traffic });
  if (input.clientName) params.set("client", input.clientName);
  if (input.surface) params.set("surface", input.surface);
  if (input.source) params.set("source", input.source);
  // Usage has no one-hour table filter; it supports the other discovery periods exactly.
  params.set("timeSpan", tab === "usage" && input.period === "1h" ? "4h" : input.period ?? "24h");
  return `/app/admin/mcp?${params}`;
}

// The two clauses are repository-owned SQL, never request input. All filters use parameters.
export function mcpDiscoverySql(input: { invocationVisibility: string; activationVisibility: string }) {
  return `with recent_calls as materialized (
    select events.*, (${input.invocationVisibility}) as visible
      from public.mcp_tool_invocation_events events
     where occurred_at >= now() - ($1::int * interval '1 hour') and occurred_at <= now()
  ), activity as (
    select activation.client_name, activation.surface, activation.source, activation.attribution_confidence,
           activation.occurred_at, activation.session_id, activation.actor_id,
           null::inet as requester_ip, null::text as actor_basis, null::text as quota_outcome, null::text as transport_outcome,
           case activation.stage when 'mcp_initialized' then 'initialize' else 'tools/list' end as method,
           null::text as tool_name, null::text as outcome, null::text as error_code
      from public.mcp_activation_events activation
     where activation.occurred_at >= now() - ($1::int * interval '1 hour')
       and activation.occurred_at <= now()
       and activation.stage in ('mcp_initialized', 'mcp_tools_listed')
       and (${input.activationVisibility})
       and not exists (
         select 1 from recent_calls excluded
          where not excluded.visible and excluded.surface = activation.surface and excluded.source = activation.source
            and ((activation.session_id is not null and excluded.session_id = activation.session_id)
              or (activation.session_id is null and activation.auth_class = 'authenticated' and activation.actor_id is not null and excluded.actor_id = activation.actor_id and excluded.auth_class = 'authenticated'))
       )
    union all
    select client_name, surface, source, attribution_confidence, occurred_at, session_id, actor_id,
           requester_ip, to_jsonb(recent_calls) -> 'request_details' ->> 'actorBasis', quota_outcome, transport_outcome,
           'tools/call', tool_name, outcome, error_code
      from recent_calls where visible
  ), grouped as (
    select client_name, surface, source,
           array_agg(distinct attribution_confidence order by attribution_confidence) as confidence,
           min(occurred_at) as first_seen, max(occurred_at) as last_seen,
           count(distinct session_id)::int as sessions,
           count(distinct actor_id)::int as actors,
           count(distinct requester_ip)::int as requester_ips,
           count(distinct actor_id) filter (where actor_basis in ('authenticated', 'provider_ephemeral'))::int as identified_callers,
           count(*) filter (where actor_id is not null and actor_basis in ('authenticated', 'provider_ephemeral'))::int as identity_covered_calls,
           count(*) filter (where quota_outcome = 'rate_limited')::int as quota_hits,
           count(*) filter (where transport_outcome = 'http_429')::int as http_429,
           count(*) filter (where method = 'initialize')::int as initializations,
           count(*) filter (where method = 'tools/list')::int as catalog_reads,
           count(*) filter (where method = 'tools/call')::int as tool_calls,
           count(*) filter (where outcome in ('error', 'rate_limited'))::int as tool_errors,
           count(*) filter (where tool_name = 'certscore_scan_site')::int as scan_requests,
           count(*) filter (where tool_name = 'certscore_get_scan_bundle' and outcome = 'success')::int as bundles,
           array_agg(distinct method order by method) as methods,
           (array_agg(distinct error_code order by error_code) filter (where error_code is not null))[1:10] as error_codes
      from activity
     where ($2::text = '' or strpos(lower(coalesce(client_name, '')), lower($2)) > 0)
       and ($3::text is null or surface = $3)
       and ($4::text is null or client_name = $4)
       and ($7::text is null or source = $7)
     group by client_name, surface, source
  )
  select (select count(*)::int from grouped) as total_count,
         coalesce((select jsonb_agg(to_jsonb(page) order by last_seen desc, client_name nulls last, surface, source)
           from (select * from grouped order by last_seen desc, client_name nulls last, surface, source limit $5 offset $6) page), '[]'::jsonb) as items`;
}
