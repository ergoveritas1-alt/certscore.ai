alter table public.scan_runtime_artifacts
  add column if not exists key_page_discovery_summary jsonb;
