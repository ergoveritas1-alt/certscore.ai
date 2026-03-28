alter table public.scan_snapshots
  add column if not exists report_finding_count integer;
