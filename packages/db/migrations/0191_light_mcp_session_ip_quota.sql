alter table public.light_mcp_new_scan_events
  add column if not exists ip_key text;

create index if not exists light_mcp_new_scan_events_ip_requested_at_idx
  on public.light_mcp_new_scan_events (ip_key, requested_at desc);
