alter table public.scanner_quality_windows
  add column if not exists source_type text not null default 'load_test',
  add column if not exists source_window_id text,
  add column if not exists window_start_completed_at timestamptz,
  add column if not exists window_end_completed_at timestamptz;

create index if not exists scanner_quality_windows_source_egress_created_idx
  on public.scanner_quality_windows (source_type, egress_id, created_at desc);

create index if not exists scanner_quality_windows_source_created_idx
  on public.scanner_quality_windows (source_type, created_at desc);

create table if not exists public.scanner_quality_aggregation_cursors (
  source_type text not null,
  egress_id text not null,
  last_completed_at timestamptz,
  last_scan_id uuid,
  updated_at timestamptz not null default now(),
  primary key (source_type, egress_id)
);

create index if not exists scanner_quality_aggregation_cursors_updated_idx
  on public.scanner_quality_aggregation_cursors (updated_at desc);
