alter table if exists public.scan_runtime_artifacts
  add column if not exists post_reject_tracking_reduction_evidence jsonb;
