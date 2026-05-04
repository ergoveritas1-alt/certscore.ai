alter table if exists public.scan_runtime_artifacts
  add column if not exists sensitive_field_evidence jsonb not null default '[]'::jsonb;
