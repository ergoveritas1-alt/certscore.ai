alter table if exists public.scan_runtime_artifacts
  add column if not exists cookie_attribute_summary jsonb,
  add column if not exists gpc_verification jsonb;
