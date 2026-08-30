create table if not exists public.mcp_activation_events (
  event_id uuid primary key,
  occurred_at timestamptz not null,
  stage text not null check (stage in (
    'mcp_initialized', 'mcp_tools_listed', 'mcp_first_tool_invoked', 'mcp_scan_requested'
  )),
  surface text not null check (surface in ('mcp_light', 'mcp_anonymous', 'mcp_authenticated')),
  auth_class text not null check (auth_class in ('anonymous', 'authenticated')),
  session_id text,
  actor_id text,
  source text not null check (source in ('openai', 'anthropic', 'google', 'xai', 'other', 'unknown')),
  source_attribution text not null check (source_attribution in (
    'verified_network', 'self_declared_header', 'self_declared_client', 'unknown'
  )),
  caller_product text not null check (caller_product in (
    'chatgpt', 'codex', 'claude', 'claude_code', 'gemini_cli', 'grok', 'other', 'unknown'
  )),
  client_family text not null check (client_family in (
    'openai_chatgpt', 'openai_codex', 'anthropic_claude', 'anthropic_claude_code',
    'google_gemini_cli', 'xai_grok', 'other', 'unknown'
  )),
  client_name text,
  attribution_confidence text not null check (attribution_confidence in (
    'verified', 'corroborated', 'declared', 'inferred', 'unknown'
  )),
  attribution_signals jsonb not null default '[]'::jsonb,
  attribution_ruleset_version text not null,
  execution_channel text not null check (execution_channel in (
    'hosted_connector', 'api_managed_mcp', 'desktop_cli', 'custom_mcp', 'unknown'
  )),
  installation_origin text not null check (installation_origin in (
    'openai_directory', 'anthropic_directory', 'xai_catalog', 'direct', 'unknown'
  )),
  created_at timestamptz not null default now(),
  check (session_id is null or session_id ~ '^[a-f0-9]{24}$'),
  check (actor_id is null or actor_id ~ '^[a-f0-9]{24}$'),
  check (session_id is not null or actor_id is not null),
  check ((surface = 'mcp_authenticated') = (auth_class = 'authenticated')),
  check (client_name is null or char_length(client_name) between 1 and 100),
  check (jsonb_typeof(attribution_signals) = 'array')
);

create index if not exists mcp_activation_events_occurred_at_idx
  on public.mcp_activation_events (occurred_at desc);

create index if not exists mcp_activation_events_surface_stage_occurred_at_idx
  on public.mcp_activation_events (surface, stage, occurred_at desc);

create index if not exists mcp_activation_events_session_occurred_at_idx
  on public.mcp_activation_events (session_id, occurred_at desc)
  where session_id is not null;

create index if not exists mcp_activation_events_actor_occurred_at_idx
  on public.mcp_activation_events (actor_id, occurred_at desc)
  where actor_id is not null;

comment on table public.mcp_activation_events is
  'Privacy-minimized hosted MCP activation stages with a 90-day retention target. Stores only bounded client classifications and HMAC-derived opaque actor/session IDs; excludes prompts, URLs, tool payloads, response bodies, tokens, raw headers, raw IPs, and marketplace user identifiers.';
