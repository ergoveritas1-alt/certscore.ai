alter table if exists public.scan_runtime_artifacts
  add column if not exists consent_timeline jsonb,
  add column if not exists request_purpose_classification_confidence jsonb not null default '[]'::jsonb,
  add column if not exists reject_path_depth_and_availability jsonb,
  add column if not exists bot_block_challenge_evidence jsonb;
