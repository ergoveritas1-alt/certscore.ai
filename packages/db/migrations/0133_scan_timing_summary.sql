alter table if exists public.scan_runtime_artifacts
  add column if not exists scan_timing_summary jsonb;
