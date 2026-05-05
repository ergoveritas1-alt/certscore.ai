alter table if exists public.scan_runtime_artifacts
  add column if not exists pre_submit_text_capture_probe_diagnostic jsonb;
