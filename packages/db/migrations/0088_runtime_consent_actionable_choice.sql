alter table if exists public.scan_runtime_artifacts
  add column if not exists consent_actionable_choice_observed boolean;
