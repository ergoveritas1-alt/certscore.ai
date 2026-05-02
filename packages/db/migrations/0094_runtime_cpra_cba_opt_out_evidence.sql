alter table if exists public.scan_runtime_artifacts
  add column if not exists cpra_cba_opt_out_evidence jsonb;
