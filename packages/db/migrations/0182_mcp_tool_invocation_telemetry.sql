create table if not exists public.mcp_tool_invocation_events (
  event_id uuid primary key,
  occurred_at timestamptz not null,
  source text not null check (source in ('openai', 'anthropic', 'unknown')),
  source_attribution text not null check (source_attribution in ('verified_network', 'self_declared_header', 'self_declared_client', 'unknown')),
  integration text not null check (integration = 'certscore-mcp'),
  surface text not null check (surface in ('mcp_light', 'mcp_anonymous', 'mcp_authenticated')),
  endpoint text not null check (endpoint in ('/mcp/light', '/mcp/anonymous', '/mcp')),
  tool_name text not null,
  request_id uuid not null,
  session_id text,
  actor_id text,
  auth_class text not null check (auth_class in ('anonymous', 'authenticated')),
  client_family text not null check (client_family in ('openai_chatgpt', 'openai_codex', 'anthropic_claude', 'other', 'unknown')),
  target_hostname text,
  freshness text check (freshness is null or freshness in ('latest', 'refresh')),
  scan_from text check (scan_from is null or scan_from in ('eu_de', 'eu_ie', 'california')),
  scan_id text,
  scan_decision text not null check (scan_decision in ('reused', 'new', 'unavailable', 'not_applicable')),
  scan_status text,
  outcome text not null check (outcome in ('success', 'error', 'rate_limited')),
  transport_outcome text not null check (transport_outcome in ('mcp_result', 'mcp_error', 'http_429')),
  duration_ms integer not null check (duration_ms between 0 and 3600000),
  quota_outcome text not null check (quota_outcome in ('allowed', 'rate_limited', 'not_applicable')),
  error_code text,
  created_at timestamptz not null default now(),
  check (char_length(tool_name) between 1 and 100),
  check (session_id is null or session_id ~ '^[a-f0-9]{24}$'),
  check (actor_id is null or actor_id ~ '^[a-f0-9]{24}$'),
  check (target_hostname is null or char_length(target_hostname) between 1 and 253),
  check (scan_id is null or char_length(scan_id) between 1 and 128),
  check (error_code is null or char_length(error_code) between 1 and 100)
);

create index if not exists mcp_tool_invocation_events_occurred_at_idx
  on public.mcp_tool_invocation_events (occurred_at desc);

create index if not exists mcp_tool_invocation_events_surface_occurred_at_idx
  on public.mcp_tool_invocation_events (surface, occurred_at desc);

create index if not exists mcp_tool_invocation_events_tool_occurred_at_idx
  on public.mcp_tool_invocation_events (tool_name, occurred_at desc);

create index if not exists mcp_tool_invocation_events_hostname_occurred_at_idx
  on public.mcp_tool_invocation_events (target_hostname, occurred_at desc)
  where target_hostname is not null;

create index if not exists mcp_tool_invocation_events_session_occurred_at_idx
  on public.mcp_tool_invocation_events (session_id, occurred_at desc)
  where session_id is not null;

comment on table public.mcp_tool_invocation_events is
  'Privacy-minimized hosted MCP invocation telemetry. The ingestion path targets 90-day retention and prunes expired rows on subsequent writes; contains no prompts, tool payloads, auth tokens, raw headers, raw IPs, or raw provider identifiers.';
