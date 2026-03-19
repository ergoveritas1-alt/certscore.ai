alter table public.scan_snapshots
  add column if not exists discount_claim_present boolean not null default false,
  add column if not exists original_price_comparison_present boolean not null default false,
  add column if not exists limited_time_offer_language_present boolean not null default false,
  add column if not exists refund_policy_window_days integer,
  add column if not exists refund_policy_conditions_present boolean not null default false,
  add column if not exists refund_request_method_present boolean not null default false,
  add column if not exists store_credit_only_policy_present boolean not null default false,
  add column if not exists exchange_policy_present boolean not null default false,
  add column if not exists renewal_notice_period_present boolean not null default false,
  add column if not exists termination_for_cause_clause_present boolean not null default false,
  add column if not exists account_deletion_terms_present boolean not null default false,
  add column if not exists service_suspension_or_termination_terms_present boolean not null default false,
  add column if not exists privacy_cookie_policy_conflict_detected boolean;
