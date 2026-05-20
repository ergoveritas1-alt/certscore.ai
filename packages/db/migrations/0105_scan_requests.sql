create table if not exists public.scan_requests (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  request_type text not null default 'full_scan',
  request_channel text not null default 'web_full_scan',
  requested_url text,
  normalized_url text,
  normalized_domain text,
  organization_id uuid references public.organizations (id) on delete set null,
  requested_by jsonb not null default '{}'::jsonb,
  request_context jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  resolution_mode text,
  scan_id uuid references public.scans (id) on delete set null,
  fulfilled_by_scan_id uuid references public.scans (id) on delete set null,
  reuse_window_hours integer,
  reused_completed_at timestamptz,
  error_code text,
  error_message text,
  requested_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists scan_requests_requested_at_idx
  on public.scan_requests (requested_at desc);

create index if not exists scan_requests_normalized_domain_requested_at_idx
  on public.scan_requests (normalized_domain, requested_at desc);

create index if not exists scan_requests_scan_id_idx
  on public.scan_requests (scan_id);

create index if not exists scan_requests_fulfilled_by_scan_id_idx
  on public.scan_requests (fulfilled_by_scan_id);

create index if not exists scan_requests_status_requested_at_idx
  on public.scan_requests (status, requested_at desc);

drop trigger if exists set_scan_requests_updated_at on public.scan_requests;
create trigger set_scan_requests_updated_at
before update on public.scan_requests
for each row
execute function public.set_updated_at();
