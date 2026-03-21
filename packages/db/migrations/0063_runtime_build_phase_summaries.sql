alter table if exists public.scan_runtime_artifacts
  add column if not exists build_phase_summaries jsonb not null default '[]'::jsonb;
