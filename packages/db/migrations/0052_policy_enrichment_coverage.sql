alter table public.policy_enrichment
  add column if not exists policy_notice_contact_present boolean,
  add column if not exists policy_termination_or_suspension_present boolean,
  add column if not exists policy_cancellation_or_refund_present boolean,
  add column if not exists policy_field_coverage jsonb not null default '{}'::jsonb,
  add column if not exists policy_coverage_ratio double precision,
  add column if not exists policy_snippet_count integer,
  add column if not exists policy_structurally_weak boolean;
