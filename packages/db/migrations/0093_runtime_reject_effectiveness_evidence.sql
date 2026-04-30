alter table if exists public.scan_runtime_artifacts
  add column if not exists consent_reject_confidence_risks jsonb not null default '[]'::jsonb,
  add column if not exists consent_reject_evidence_diff jsonb,
  add column if not exists consent_reject_interaction_trace jsonb,
  add column if not exists consent_reject_post_reject_non_essential_requests jsonb not null default '[]'::jsonb,
  add column if not exists consent_reject_request_timing_buckets jsonb not null default '[]'::jsonb,
  add column if not exists consent_reject_suppression_checks jsonb,
  add column if not exists consent_reject_vendor_classifications jsonb not null default '[]'::jsonb;
