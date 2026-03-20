alter table public.scan_runtime_artifacts
  add column if not exists consent_opt_in_clicks integer,
  add column if not exists consent_opt_out_clicks integer,
  add column if not exists consent_friction_delta integer,
  add column if not exists consent_redirect_or_auth_required boolean,
  add column if not exists consent_opt_in_evidence_log jsonb not null default '[]'::jsonb,
  add column if not exists consent_opt_out_evidence_log jsonb not null default '[]'::jsonb;
