create table if not exists public.scan_pages (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  url text not null,
  page_type text,
  status text not null default 'discovered',
  http_status integer,
  load_time_ms integer,
  screenshot_path text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists scan_pages_scan_id_idx
  on public.scan_pages (scan_id);
