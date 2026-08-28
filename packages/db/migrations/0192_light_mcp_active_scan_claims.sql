create table if not exists public.light_mcp_active_scan_claims (
  id uuid primary key default gen_random_uuid(),
  requester_key text not null,
  ip_key text not null,
  scan_id uuid references public.scans (id) on delete set null,
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz
);

create index if not exists light_mcp_active_scan_claims_requester_idx
  on public.light_mcp_active_scan_claims (requester_key, expires_at desc);

create index if not exists light_mcp_active_scan_claims_ip_idx
  on public.light_mcp_active_scan_claims (ip_key, expires_at desc);

create index if not exists light_mcp_active_scan_claims_scan_idx
  on public.light_mcp_active_scan_claims (scan_id);
