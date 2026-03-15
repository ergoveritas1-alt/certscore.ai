alter table public.scan_runtime_artifacts
  add column if not exists consent_preconsent_violation_count integer,
  add column if not exists consent_baseline_tracker_evidence_urls text[] not null default '{}',
  add column if not exists consent_post_reject_tracker_evidence_urls text[] not null default '{}',
  add column if not exists consent_post_accept_tracker_evidence_urls text[] not null default '{}';
