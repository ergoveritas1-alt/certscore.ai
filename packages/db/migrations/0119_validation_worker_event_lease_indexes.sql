create index concurrently if not exists scan_events_event_scan_created_at_idx
  on public.scan_events (event_type, scan_id, created_at desc)
  where scan_id is not null;

create index concurrently if not exists scans_completed_recent_coalesce_idx
  on public.scans ((coalesce(completed_at, updated_at, created_at)) desc)
  where status = 'completed';
