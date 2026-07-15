create table if not exists public.anonymous_scan_daily_quotas (
  requester_key text not null,
  window_date date not null,
  scan_count integer not null default 0 check (scan_count >= 0),
  last_scan_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (requester_key, window_date)
);

create index if not exists anonymous_scan_daily_quotas_updated_at_idx
  on public.anonymous_scan_daily_quotas (updated_at desc);
