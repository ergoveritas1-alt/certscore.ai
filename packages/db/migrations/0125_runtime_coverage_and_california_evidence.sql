alter table if exists public.scan_runtime_artifacts
  add column if not exists coverage_limitation_evidence jsonb,
  add column if not exists california_privacy_evidence jsonb;
