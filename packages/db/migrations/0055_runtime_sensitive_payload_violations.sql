alter table public.scan_runtime_artifacts
  add column if not exists sensitive_payload_violations jsonb not null default '[]'::jsonb;
