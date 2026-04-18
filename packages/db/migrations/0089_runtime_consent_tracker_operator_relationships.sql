alter table if exists public.scan_runtime_artifacts
  add column if not exists consent_baseline_tracker_operator_relationships jsonb;
