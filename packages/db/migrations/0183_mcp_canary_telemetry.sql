alter table public.mcp_tool_invocation_events
  add column if not exists is_canary boolean not null default false;

create index if not exists mcp_tool_invocation_events_non_canary_occurred_at_idx
  on public.mcp_tool_invocation_events (occurred_at desc)
  where is_canary = false;

comment on column public.mcp_tool_invocation_events.is_canary is
  'True only when the bounded MCP target input uses the CertScore canary path prefix; no target path is retained.';
