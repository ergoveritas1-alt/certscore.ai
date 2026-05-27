create index concurrently if not exists policy_evidence_evidence_hash_idx
  on public.policy_evidence (evidence_hash);

create index concurrently if not exists scan_macro_enrichments_scan_id_idx
  on public.scan_macro_enrichments (scan_id);

create index concurrently if not exists scan_events_domain_event_created_at_idx
  on public.scan_events (domain_id, event_type, created_at desc);

create index concurrently if not exists scan_page_evidence_scan_id_created_at_idx
  on public.scan_page_evidence (scan_id, created_at desc);

create index concurrently if not exists scan_signal_hits_scan_id_created_at_idx
  on public.scan_signal_hits (scan_id, created_at desc);
