alter table if exists public.browser_scan_sessions
  add column if not exists canonical_scan_id uuid references public.scans (id) on delete set null;

create index if not exists browser_scan_sessions_canonical_scan_idx
  on public.browser_scan_sessions (canonical_scan_id)
  where canonical_scan_id is not null;
