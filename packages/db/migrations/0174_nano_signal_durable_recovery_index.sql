create index concurrently if not exists scan_events_nano_queue_recent_idx
  on public.scan_events (created_at desc, scan_id)
  where event_type = 'signals.nano_doc_enrichment_requested'
    and scan_id is not null;
