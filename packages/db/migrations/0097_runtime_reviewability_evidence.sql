alter table if exists public.scan_runtime_artifacts
  add column if not exists accessibility_axe_evidence jsonb not null default '[]'::jsonb,
  add column if not exists consent_reject_cookie_diff_provenance jsonb,
  add column if not exists consent_reject_interaction_attribution jsonb;
