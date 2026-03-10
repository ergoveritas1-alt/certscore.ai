do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'scan_snapshots'
      and column_name = 'terms_present'
  ) then
    alter table public.scan_snapshots
      rename column terms_present to terms_of_service_present;
  end if;
end $$;

alter table public.scan_snapshots
  add column if not exists domain text,
  add column if not exists registered_domain text,
  add column if not exists scan_timestamp timestamptz not null default timezone('utc', now()),
  add column if not exists crawl_source text not null default 'manual',
  add column if not exists crawl_tier text not null default 'standard',
  add column if not exists robots_allowed boolean not null default true,
  add column if not exists robots_fetch_status text not null default 'skipped',
  add column if not exists auth_wall_detected boolean not null default false,
  add column if not exists homepage_fetch_status text not null default 'skipped',
  add column if not exists final_url text,
  add column if not exists final_url_scheme text,
  add column if not exists redirect_count integer not null default 0,
  add column if not exists render_mode_used text not null default 'http_only',
  add column if not exists scan_confidence text not null default 'medium',
  add column if not exists partial_scan boolean not null default false,
  add column if not exists timeout_flag boolean not null default false,
  add column if not exists blocked_flag boolean not null default false,
  add column if not exists captcha_flag boolean not null default false,
  add column if not exists site_language_primary text,
  add column if not exists country_inferred text,
  add column if not exists region_state_inferred text,
  add column if not exists jurisdiction_guess text,
  add column if not exists eu_exposure_likely boolean not null default false,
  add column if not exists california_exposure_likely boolean not null default false,
  add column if not exists children_audience_likely boolean not null default false,
  add column if not exists healthcare_site_likely boolean not null default false,
  add column if not exists financial_services_site_likely boolean not null default false,
  add column if not exists ecommerce_site_likely boolean not null default false,
  add column if not exists saas_site_likely boolean not null default false,
  add column if not exists education_site_likely boolean not null default false,
  add column if not exists multilingual_site boolean not null default false,
  add column if not exists accessibility_statement_present boolean not null default false,
  add column if not exists shipping_policy_present boolean not null default false,
  add column if not exists subscription_terms_present boolean not null default false,
  add column if not exists affiliate_disclosure_present boolean not null default false,
  add column if not exists advertising_disclosure_present boolean not null default false,
  add column if not exists contact_page_present boolean not null default false,
  add column if not exists privacy_contact_method_present boolean not null default false,
  add column if not exists do_not_sell_link_present boolean not null default false,
  add column if not exists dsar_request_mechanism_present boolean not null default false,
  add column if not exists subprocessor_list_present boolean not null default false,
  add column if not exists legal_entity_name_detected boolean not null default false,
  add column if not exists physical_business_address_present boolean not null default false,
  add column if not exists email_contact_public_present boolean not null default false,
  add column if not exists phone_number_public_present boolean not null default false,
  add column if not exists privacy_email_specific_present boolean not null default false,
  add column if not exists dpo_reference_present boolean not null default false,
  add column if not exists privacy_policy_hash text,
  add column if not exists terms_policy_hash text,
  add column if not exists cookie_policy_hash text,
  add column if not exists legal_pages_presence_hash text,
  add column if not exists privacy_policy_last_updated_found text,
  add column if not exists mentions_gdpr boolean not null default false,
  add column if not exists mentions_ccpa_or_cpra boolean not null default false,
  add column if not exists mentions_coppa boolean not null default false,
  add column if not exists mentions_under_13 boolean not null default false,
  add column if not exists mentions_under_16 boolean not null default false,
  add column if not exists mentions_sensitive_data boolean not null default false,
  add column if not exists mentions_biometric_data boolean not null default false,
  add column if not exists mentions_health_data boolean not null default false,
  add column if not exists mentions_financial_data boolean not null default false,
  add column if not exists mentions_location_data boolean not null default false,
  add column if not exists mentions_data_retention boolean not null default false,
  add column if not exists mentions_data_sale_or_sharing boolean not null default false,
  add column if not exists mentions_cross_border_transfer boolean not null default false,
  add column if not exists mentions_subprocessors_or_vendors boolean not null default false,
  add column if not exists mentions_automated_decisioning boolean not null default false,
  add column if not exists mentions_ai_usage boolean not null default false,
  add column if not exists consent_mechanism_type text not null default 'none',
  add column if not exists cmp_vendor_name text,
  add column if not exists cmp_vendor_confidence double precision,
  add column if not exists reject_all_present boolean not null default false,
  add column if not exists accept_all_present boolean not null default false,
  add column if not exists granular_preferences_present boolean not null default false,
  add column if not exists preconsent_tracking_detected boolean not null default false,
  add column if not exists cookie_policy_linked_from_banner boolean not null default false,
  add column if not exists consent_mode_detected boolean not null default false,
  add column if not exists dark_pattern_accept_emphasis boolean not null default false,
  add column if not exists dark_pattern_reject_hidden boolean not null default false,
  add column if not exists prechecked_consent_boxes boolean not null default false,
  add column if not exists consent_signature_hash text,
  add column if not exists tracker_count_total integer not null default 0,
  add column if not exists analytics_tracker_count integer not null default 0,
  add column if not exists advertising_tracker_count integer not null default 0,
  add column if not exists social_tracker_count integer not null default 0,
  add column if not exists session_replay_tracker_count integer not null default 0,
  add column if not exists tag_manager_present boolean not null default false,
  add column if not exists first_party_analytics_only boolean not null default false,
  add column if not exists adtech_stack_complexity_score integer not null default 0,
  add column if not exists fingerprinting_or_identity_vendor_detected boolean not null default false,
  add column if not exists tracker_vendor_set_hash text,
  add column if not exists tracker_category_set_hash text,
  add column if not exists form_count_total integer not null default 0,
  add column if not exists contact_form_present boolean not null default false,
  add column if not exists newsletter_signup_present boolean not null default false,
  add column if not exists account_signup_present boolean not null default false,
  add column if not exists login_page_present boolean not null default false,
  add column if not exists password_reset_present boolean not null default false,
  add column if not exists checkout_or_payment_form_present boolean not null default false,
  add column if not exists file_upload_field_present boolean not null default false,
  add column if not exists email_input_present boolean not null default false,
  add column if not exists phone_input_present boolean not null default false,
  add column if not exists address_input_present boolean not null default false,
  add column if not exists payment_card_input_present boolean not null default false,
  add column if not exists date_of_birth_input_present boolean not null default false,
  add column if not exists age_gate_present boolean not null default false,
  add column if not exists age_verification_mechanism_type text not null default 'none',
  add column if not exists parental_consent_reference_present boolean not null default false,
  add column if not exists sensitive_data_form_hints_present boolean not null default false,
  add column if not exists forms_signature_hash text,
  add column if not exists pii_collection_risk_score integer not null default 0,
  add column if not exists wcag_error_count_total integer not null default 0,
  add column if not exists wcag_warning_count_total integer not null default 0,
  add column if not exists wcag_contrast_failures_count integer not null default 0,
  add column if not exists wcag_missing_alt_count integer not null default 0,
  add column if not exists wcag_form_label_error_count integer not null default 0,
  add column if not exists wcag_aria_error_count integer not null default 0,
  add column if not exists wcag_heading_structure_error_count integer not null default 0,
  add column if not exists wcag_link_name_error_count integer not null default 0,
  add column if not exists wcag_keyboard_navigation_issue_count integer not null default 0,
  add column if not exists wcag_focus_indicator_issue_count integer not null default 0,
  add column if not exists wcag_landmark_issue_count integer not null default 0,
  add column if not exists accessibility_widget_present boolean not null default false,
  add column if not exists accessibility_widget_vendor text,
  add column if not exists vpat_or_accessibility_conformance_doc_present boolean not null default false,
  add column if not exists accessibility_contact_method_present boolean not null default false,
  add column if not exists accessibility_signature_hash text,
  add column if not exists accessibility_score_automated integer not null default 0,
  add column if not exists subscription_offer_detected boolean not null default false,
  add column if not exists auto_renewal_disclosure_present boolean not null default false,
  add column if not exists cancellation_policy_present boolean not null default false,
  add column if not exists unsubscribe_mechanism_present boolean not null default false,
  add column if not exists free_trial_detected boolean not null default false,
  add column if not exists refund_or_return_window_detected boolean not null default false,
  add column if not exists shipping_terms_detected boolean not null default false,
  add column if not exists dispute_resolution_or_arbitration_present boolean not null default false,
  add column if not exists testimonial_or_review_disclosure_present boolean not null default false,
  add column if not exists security_txt_present boolean not null default false,
  add column if not exists responsible_disclosure_present boolean not null default false,
  add column if not exists bug_bounty_program_present boolean not null default false,
  add column if not exists hsts_enabled boolean not null default false,
  add column if not exists https_enforced boolean not null default false,
  add column if not exists mixed_content_detected boolean not null default false,
  add column if not exists law_enforcement_request_policy_present boolean not null default false,
  add column if not exists transparency_report_present boolean not null default false,
  add column if not exists transparency_score integer not null default 0,
  add column if not exists cms_platform text,
  add column if not exists ecommerce_platform text,
  add column if not exists frontend_framework text,
  add column if not exists hosting_or_cdn_provider text,
  add column if not exists tag_manager_vendor text,
  add column if not exists payment_processor_hints text[] not null default '{}'::text[],
  add column if not exists chat_support_vendor text,
  add column if not exists site_size_hint text,
  add column if not exists homepage_structured_hash text,
  add column if not exists certscore_overall integer not null default 0,
  add column if not exists privacy_score integer not null default 0,
  add column if not exists consent_score integer not null default 0,
  add column if not exists tracker_risk_score integer not null default 0,
  add column if not exists accessibility_score integer not null default 0,
  add column if not exists data_collection_risk_score integer not null default 0,
  add column if not exists consumer_protection_score integer not null default 0,
  add column if not exists children_privacy_risk_score integer not null default 0,
  add column if not exists regulatory_exposure_score integer not null default 0;

update public.scan_snapshots
set
  scan_timestamp = coalesce(scan_timestamp, created_at),
  tracker_count_total = greatest(tracker_count_total, tracker_vendor_count),
  domain = coalesce(
    domain,
    (
      select d.hostname
      from public.domains d
      where d.id = public.scan_snapshots.domain_id
    )
  ),
  final_url_scheme = coalesce(final_url_scheme, 'https'),
  homepage_fetch_status = coalesce(homepage_fetch_status, 'ok'),
  robots_fetch_status = coalesce(robots_fetch_status, 'skipped');

create index if not exists scan_snapshots_domain_scan_timestamp_idx
  on public.scan_snapshots (domain_id, scan_timestamp desc);

create index if not exists scan_snapshots_domain_lookup_idx
  on public.scan_snapshots (domain, scan_timestamp desc);

create table if not exists public.scan_tracker_vendors (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  domain_id uuid not null references public.domains (id) on delete cascade,
  vendor_name text not null,
  vendor_category text not null,
  detection_source text not null,
  confidence double precision not null default 0,
  first_party_or_third_party text not null default 'unknown',
  before_consent boolean not null default false,
  script_host text,
  matched_signature_id text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists scan_tracker_vendors_scan_id_idx
  on public.scan_tracker_vendors (scan_id, vendor_category);

create index if not exists scan_tracker_vendors_domain_id_idx
  on public.scan_tracker_vendors (domain_id, created_at desc);

create unique index if not exists scan_tracker_vendors_unique_idx
  on public.scan_tracker_vendors (scan_id, vendor_name, detection_source, coalesce(script_host, ''));

create table if not exists public.scan_accessibility_rule_counts (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  domain_id uuid not null references public.domains (id) on delete cascade,
  rule_code text not null,
  rule_group text not null,
  severity text not null,
  instance_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  unique (scan_id, rule_code)
);

create index if not exists scan_accessibility_rule_counts_scan_id_idx
  on public.scan_accessibility_rule_counts (scan_id, rule_group);

drop table if exists public.scan_pages cascade;

create table public.scan_pages (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  domain_id uuid not null references public.domains (id) on delete cascade,
  page_type text not null default 'other',
  page_url text not null,
  fetch_status text not null default 'skipped',
  fetched_via text not null default 'http',
  normalized_content_hash text,
  title_hash text,
  page_language text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (scan_id, page_url)
);

create index if not exists scan_pages_scan_id_idx
  on public.scan_pages (scan_id, page_type);

create table if not exists public.compliance_change_events (
  event_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  domain_id uuid not null references public.domains (id) on delete cascade,
  domain text not null,
  scan_id_current uuid not null references public.scans (id) on delete cascade,
  scan_id_previous uuid references public.scans (id) on delete set null,
  event_timestamp timestamptz not null default timezone('utc', now()),
  event_type text not null,
  field_name text,
  old_value_text text,
  new_value_text text,
  severity text not null default 'info',
  confidence double precision not null default 0.5,
  event_group text not null default 'changed'
);

create index if not exists compliance_change_events_org_time_idx
  on public.compliance_change_events (organization_id, event_timestamp desc);

create index if not exists compliance_change_events_domain_time_idx
  on public.compliance_change_events (domain_id, event_timestamp desc);

create index if not exists compliance_change_events_scan_current_idx
  on public.compliance_change_events (scan_id_current);
