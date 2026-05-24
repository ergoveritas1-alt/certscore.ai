create index if not exists scan_events_scanner_heartbeat_created_at_idx
  on public.scan_events (event_type, created_at desc)
  where scan_id is null;
