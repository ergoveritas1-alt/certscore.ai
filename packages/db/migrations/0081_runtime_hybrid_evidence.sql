alter table if exists public.scan_runtime_artifacts
add column if not exists hybrid_runtime_evidence jsonb;
