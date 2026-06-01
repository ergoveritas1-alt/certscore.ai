alter table if exists public.scan_runtime_artifacts
  add column if not exists visual_access_review jsonb;
