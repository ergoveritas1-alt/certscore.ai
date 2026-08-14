create table if not exists public.light_mcp_new_scan_events (
  id bigserial primary key,
  requester_key text not null,
  requested_at timestamptz not null default now()
);

create index if not exists light_mcp_new_scan_events_requested_at_idx
  on public.light_mcp_new_scan_events (requested_at desc);

create index if not exists light_mcp_new_scan_events_requester_requested_at_idx
  on public.light_mcp_new_scan_events (requester_key, requested_at desc);
