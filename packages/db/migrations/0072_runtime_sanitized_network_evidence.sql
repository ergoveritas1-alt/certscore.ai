alter table if exists public.scan_runtime_artifacts
  add column if not exists sanitized_network_evidence jsonb not null default '{}'::jsonb;
