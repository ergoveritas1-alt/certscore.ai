alter table if exists public.scan_runtime_artifacts
  add column if not exists visual_evidence_artifacts jsonb not null default '[]'::jsonb;

