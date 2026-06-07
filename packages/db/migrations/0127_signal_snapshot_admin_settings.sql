alter table public.organization_settings
  add column if not exists show_signal_snapshot_review_lenses boolean not null default true,
  add column if not exists show_signal_snapshot_scan_interruption boolean not null default true,
  add column if not exists show_signal_snapshot_fingerprinting boolean not null default true;
