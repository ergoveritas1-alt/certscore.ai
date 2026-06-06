alter table if exists public.scan_runtime_artifacts
  add column if not exists scan_no_go_assessment jsonb;
