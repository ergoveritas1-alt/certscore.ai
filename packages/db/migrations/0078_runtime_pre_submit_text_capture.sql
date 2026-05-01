alter table if exists public.scan_runtime_artifacts
  add column if not exists pre_submit_text_capture_evidence jsonb not null default '[]'::jsonb,
  add column if not exists pre_submit_text_capture_detected boolean,
  add column if not exists pre_submit_text_capture_third_party_detected boolean,
  add column if not exists pre_submit_text_capture_tracking_detected boolean;
