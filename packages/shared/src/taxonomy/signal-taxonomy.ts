/**
 * Primary categories organize observable website signals for product surfacing.
 * Regulatory tags stay secondary so future fields can be added without treating
 * regulator mappings as the main taxonomy.
 */
export type PrimaryScanCategoryId =
  | "privacy_consent_user_choice"
  | "consumer_transparency_disclosures"
  | "data_collection_third_party_ecosystem"
  | "sensitive_data_identity_signals"
  | "accessibility"
  | "security_trust_governance"
  | "ai_automation_emerging_practices";

export type RegulatoryTag =
  | "ftc_consumer_protection"
  | "gdpr_eu_privacy"
  | "ccpa_cpra"
  | "accessibility_ada_wcag"
  | "state_privacy"
  | "child_privacy"
  | "auto_renew_subscription";

export type ScanTaxonomyEntry = {
  key: string;
  displayName: string;
  description?: string;
  primaryCategory: PrimaryScanCategoryId;
  subcategory?: string;
  regulatoryTags?: RegulatoryTag[];
  displayPriority?: number;
  hiddenFromDefaultView?: boolean;
};

export const PRIMARY_SCAN_CATEGORY_ORDER: PrimaryScanCategoryId[] = [
  "privacy_consent_user_choice",
  "consumer_transparency_disclosures",
  "data_collection_third_party_ecosystem",
  "sensitive_data_identity_signals",
  "accessibility",
  "security_trust_governance",
  "ai_automation_emerging_practices"
];

export const PRIMARY_SCAN_CATEGORY_META: Record<
  PrimaryScanCategoryId,
  {
    description: string;
    label: string;
  }
> = {
  privacy_consent_user_choice: {
    label: "Privacy, Consent & User Choice",
    description: "How the site presents consent controls, observable pre-consent behavior, and privacy-related user choice mechanisms."
  },
  consumer_transparency_disclosures: {
    label: "Consumer Transparency & Disclosures",
    description: "Public-facing legal, policy, subscription, refund, and commercial transparency signals."
  },
  data_collection_third_party_ecosystem: {
    label: "Data Collection & Third-Party Ecosystem",
    description: "How the site collects data and interacts with advertising, analytics, support, and other outside services."
  },
  sensitive_data_identity_signals: {
    label: "Sensitive Data & Identity Signals",
    description: "Observed indicators that the site may request more sensitive categories of personal or identity-related information."
  },
  accessibility: {
    label: "Accessibility",
    description: "Automated accessibility signals and observed mismatches between accessibility claims and detectable issue patterns."
  },
  security_trust_governance: {
    label: "Security, Trust & Governance",
    description: "Technical security posture plus public trust, governance, and transparency signals."
  },
  ai_automation_emerging_practices: {
    label: "AI, Automation & Emerging Practices",
    description: "Visible AI and automation-related experiences, disclosures, and documentation surfaced on the website."
  }
};

export const REGULATORY_OVERLAY_COPY = {
  description:
    "Observed signals grouped by the regulators or oversight domains they most closely relate to. This is signal context, not a legal determination.",
  label: "Regulatory"
} as const;

type SnapshotCategorySeed = Omit<ScanTaxonomyEntry, "description" | "displayName" | "key"> & {
  fields: string[];
};

function buildSnapshotFieldMap(seeds: SnapshotCategorySeed[]) {
  return Object.fromEntries(
    seeds.flatMap((seed) =>
      seed.fields.map((field, index) => [
        field,
        {
          key: field,
          displayName: field,
          primaryCategory: seed.primaryCategory,
          subcategory: seed.subcategory,
          regulatoryTags: seed.regulatoryTags,
          displayPriority: seed.displayPriority ?? index + 1,
          hiddenFromDefaultView: seed.hiddenFromDefaultView ?? false
        } satisfies ScanTaxonomyEntry
      ])
    )
  ) satisfies Record<string, ScanTaxonomyEntry>;
}

export const SNAPSHOT_FIELD_TAXONOMY = buildSnapshotFieldMap([
  {
    primaryCategory: "privacy_consent_user_choice",
    subcategory: "Consent Experience",
    regulatoryTags: ["gdpr_eu_privacy", "ccpa_cpra", "state_privacy"],
    fields: [
      "cookie_banner_present",
      "consent_mechanism_type",
      "cmp_vendor_name",
      "reject_all_present",
      "accept_all_present",
      "granular_preferences_present",
      "cookie_policy_linked_from_banner",
      "consent_persistence_mechanism_detected",
      "consent_banner_layout_type",
      "consent_banner_position",
      "cookie_category_count",
      "consent_mode_detected",
      "default_tracking_state"
    ]
  },
  {
    primaryCategory: "privacy_consent_user_choice",
    subcategory: "Consent Manipulation Signals",
    regulatoryTags: ["gdpr_eu_privacy", "ccpa_cpra", "state_privacy"],
    fields: [
      "dark_pattern_accept_emphasis",
      "dark_pattern_reject_hidden",
      "dark_pattern_reject_button_missing",
      "dark_pattern_accept_button_prominence",
      "prechecked_consent_boxes",
      "dark_pattern_forced_consent_wall",
      "dark_pattern_accept_only_banner",
      "dark_pattern_dismiss_without_reject"
    ]
  },
  {
    primaryCategory: "privacy_consent_user_choice",
    subcategory: "Pre-Consent Tracking",
    regulatoryTags: ["gdpr_eu_privacy", "ccpa_cpra", "state_privacy"],
    fields: [
      "preconsent_tracking_detected",
      "preconsent_violation_count",
      "preconsent_tracker_vendors",
      "preconsent_tracker_evidence_urls",
      "tracking_before_consent_detected",
      "first_party_cookie_set_before_consent",
      "third_party_cookie_set_before_consent",
      "cookie_count_total",
      "third_party_cookie_count"
    ]
  },
  {
    primaryCategory: "privacy_consent_user_choice",
    subcategory: "Privacy Rights & Controls",
    regulatoryTags: ["gdpr_eu_privacy", "ccpa_cpra", "state_privacy"],
    fields: [
      "do_not_sell_link_present",
      "dsar_request_mechanism_present",
      "privacy_request_form_present",
      "data_access_request_present",
      "data_deletion_request_present",
      "privacy_contact_channel_type",
      "consent_withdrawal_mechanism_present",
      "user_rights_friction_score"
    ]
  },
  {
    primaryCategory: "consumer_transparency_disclosures",
    subcategory: "Core Legal Pages",
    regulatoryTags: ["ftc_consumer_protection", "gdpr_eu_privacy", "ccpa_cpra", "accessibility_ada_wcag"],
    fields: [
      "privacy_policy_present",
      "privacy_policy_surface_missing",
      "privacy_policy_fetch_failed",
      "terms_of_service_present",
      "terms_of_service_surface_missing",
      "terms_of_service_fetch_failed",
      "cookie_policy_present",
      "cookie_policy_surface_missing",
      "cookie_policy_fetch_failed",
      "accessibility_statement_present",
      "accessibility_statement_surface_missing",
      "accessibility_statement_fetch_failed",
      "contact_page_present",
      "contact_page_surface_missing",
      "contact_page_fetch_failed",
      "key_page_discovery_unresolved_after_bounded_search",
      "privacy_policy_word_count",
      "privacy_policy_last_updated_date"
    ]
  },
  {
    primaryCategory: "consumer_transparency_disclosures",
    subcategory: "Consumer Policies",
    regulatoryTags: ["ftc_consumer_protection", "auto_renew_subscription"],
    fields: [
      "refund_policy_present",
      "shipping_policy_present",
      "legal_entity_name_detected",
      "physical_business_address_present",
      "email_contact_public_present",
      "phone_number_public_present"
    ]
  },
  {
    primaryCategory: "consumer_transparency_disclosures",
    subcategory: "Subscription & Billing Transparency",
    regulatoryTags: ["ftc_consumer_protection", "auto_renew_subscription"],
    fields: [
      "subscription_terms_present",
      "subscription_offer_detected",
      "auto_renew_disclosure_present",
      "auto_renewal_disclosure_present",
      "subscription_cancellation_policy_present",
      "cancellation_policy_present",
      "free_trial_detected",
      "discount_claim_present",
      "original_price_comparison_present",
      "limited_time_offer_language_present",
      "refund_or_return_window_detected",
      "refund_policy_window_days",
      "refund_policy_conditions_present",
      "refund_request_method_present",
      "store_credit_only_policy_present",
      "exchange_policy_present",
      "renewal_notice_period_present",
      "termination_for_cause_clause_present",
      "account_deletion_terms_present",
      "service_suspension_or_termination_terms_present",
      "unsubscribe_mechanism_present"
    ]
  },
  {
    primaryCategory: "consumer_transparency_disclosures",
    subcategory: "Commercial Pressure / Scarcity Signals",
    regulatoryTags: ["ftc_consumer_protection", "auto_renew_subscription"],
    fields: ["dark_pattern_countdown_timer_present", "dark_pattern_fake_scarcity_language", "testimonial_or_review_disclosure_present"]
  },
  {
    primaryCategory: "consumer_transparency_disclosures",
    subcategory: "Policy Consistency & Behavior",
    regulatoryTags: ["ftc_consumer_protection", "gdpr_eu_privacy", "ccpa_cpra"],
    fields: ["policy_behavior_conflict_detected", "policy_terms_conflict_detected", "privacy_cookie_policy_conflict_detected"]
  },
  {
    primaryCategory: "data_collection_third_party_ecosystem",
    subcategory: "Analytics & Tracking",
    regulatoryTags: ["gdpr_eu_privacy", "ccpa_cpra", "state_privacy"],
    fields: [
      "tracker_count_total",
      "analytics_tracker_count",
      "tag_manager_present",
      "tag_manager_vendor",
      "tracker_vendor_concentration_score",
      "tracker_diversity_score",
      "third_party_script_domain_count"
    ]
  },
  {
    primaryCategory: "data_collection_third_party_ecosystem",
    subcategory: "Advertising & Retargeting",
    regulatoryTags: ["ftc_consumer_protection", "gdpr_eu_privacy", "ccpa_cpra", "state_privacy"],
    fields: [
      "advertising_tracker_count",
      "ad_network_google_ads",
      "ad_network_meta_ads",
      "retargeting_pixel_detected"
    ]
  },
  {
    primaryCategory: "data_collection_third_party_ecosystem",
    subcategory: "Session Replay / Behavioral Tools",
    regulatoryTags: ["ftc_consumer_protection", "gdpr_eu_privacy", "ccpa_cpra", "state_privacy"],
    fields: ["session_replay_tracker_count", "session_replay_tool_detected"]
  },
  {
    primaryCategory: "data_collection_third_party_ecosystem",
    subcategory: "Commerce / Support / Integrations",
    regulatoryTags: ["ftc_consumer_protection"],
    fields: [
      "form_count_total",
      "checkout_or_payment_form_present",
      "payment_processor_hints",
      "chat_support_vendor",
      "tracker_vendor_set_hash",
      "tracker_category_set_hash"
    ]
  },
  {
    primaryCategory: "sensitive_data_identity_signals",
    subcategory: "Identity Inputs",
    regulatoryTags: ["gdpr_eu_privacy", "state_privacy", "child_privacy"],
    fields: [
      "form_collects_ssn",
      "form_collects_government_id",
      "form_collects_birthdate",
      "date_of_birth_input_present"
    ]
  },
  {
    primaryCategory: "sensitive_data_identity_signals",
    subcategory: "Financial Inputs",
    regulatoryTags: ["gdpr_eu_privacy", "state_privacy"],
    fields: ["form_collects_financial_information", "payment_card_input_present", "checkout_or_payment_form_present"]
  },
  {
    primaryCategory: "sensitive_data_identity_signals",
    subcategory: "Health Inputs",
    regulatoryTags: ["gdpr_eu_privacy", "state_privacy"],
    fields: ["form_collects_health_information", "high_sensitivity_data_collection_detected", "sensitive_data_form_hints_present"]
  },
  {
    primaryCategory: "sensitive_data_identity_signals",
    subcategory: "Location / Demographic Inputs",
    regulatoryTags: ["gdpr_eu_privacy", "state_privacy", "child_privacy"],
    fields: ["form_collects_geolocation", "address_input_present", "age_gate_present", "parental_consent_reference_present"]
  },
  {
    primaryCategory: "accessibility",
    subcategory: "Automated Issue Signals",
    regulatoryTags: ["accessibility_ada_wcag"],
    fields: [
      "wcag_error_count_total",
      "wcag_warning_count_total",
      "wcag_missing_alt_count",
      "wcag_form_label_error_count",
      "wcag_aria_error_count",
      "wcag_heading_structure_error_count",
      "wcag_link_name_error_count"
    ]
  },
  {
    primaryCategory: "accessibility",
    subcategory: "Navigation & Interaction",
    regulatoryTags: ["accessibility_ada_wcag"],
    fields: ["wcag_keyboard_navigation_issue_count", "wcag_focus_indicator_issue_count", "wcag_landmark_issue_count"]
  },
  {
    primaryCategory: "accessibility",
    subcategory: "Contrast & Visual Issues",
    regulatoryTags: ["accessibility_ada_wcag"],
    fields: ["wcag_contrast_failures_count", "accessibility_score_automated"]
  },
  {
    primaryCategory: "accessibility",
    subcategory: "Accessibility Claims & Statements",
    regulatoryTags: ["accessibility_ada_wcag"],
    fields: [
      "accessibility_statement_present",
      "accessibility_contact_method_present",
      "accessibility_widget_present",
      "vpat_or_accessibility_conformance_doc_present",
      "wcag_level_claimed",
      "accessibility_claim_mismatch_detected",
      "accessibility_litigation_risk_score"
    ]
  },
  {
    primaryCategory: "security_trust_governance",
    subcategory: "Transport & Headers",
    regulatoryTags: ["ftc_consumer_protection"],
    fields: [
      "tls_version_min_supported",
      "certificate_authority",
      "hsts_enabled",
      "csp_header_present",
      "permissions_policy_present",
      "security_headers_score",
      "mixed_content_detected"
    ]
  },
  {
    primaryCategory: "security_trust_governance",
    subcategory: "DNS & Authentication",
    regulatoryTags: ["ftc_consumer_protection"],
    fields: ["dnssec_enabled", "spf_record_present", "dmarc_record_present", "dkim_record_detected"]
  },
  {
    primaryCategory: "security_trust_governance",
    subcategory: "Trust & Disclosure",
    regulatoryTags: ["ftc_consumer_protection"],
    fields: [
      "security_txt_present",
      "vulnerability_disclosure_page_present",
      "trust_center_present",
      "responsible_disclosure_present",
      "bug_bounty_program_present",
      "transparency_report_present"
    ]
  },
  {
    primaryCategory: "security_trust_governance",
    subcategory: "Incident / Vulnerability Transparency",
    regulatoryTags: ["ftc_consumer_protection"],
    fields: ["incident_status_page_present", "infrastructure_change_detected", "security_header_posture_changed"]
  },
  {
    primaryCategory: "ai_automation_emerging_practices",
    subcategory: "Visible AI Assistants",
    regulatoryTags: ["ftc_consumer_protection"],
    fields: ["ai_chatbot_present", "ai_chatbot_vendor", "ai_assistant_widget_detected"]
  },
  {
    primaryCategory: "ai_automation_emerging_practices",
    subcategory: "AI Documentation & Disclosures",
    regulatoryTags: ["ftc_consumer_protection", "gdpr_eu_privacy"],
    fields: ["ai_disclosure_text_present", "ai_terms_or_policy_ai_reference", "ai_help_center_ai_reference"]
  },
  {
    primaryCategory: "ai_automation_emerging_practices",
    subcategory: "AI Search / Answer Experiences",
    regulatoryTags: ["ftc_consumer_protection"],
    fields: ["ai_search_or_answer_experience_detected"]
  },
  {
    primaryCategory: "ai_automation_emerging_practices",
    subcategory: "Hiring / Automated Decision Signals",
    regulatoryTags: ["ftc_consumer_protection", "state_privacy"],
    fields: ["ai_hiring_automation_signal_detected"]
  }
]);

export function getSnapshotFieldTaxonomy(field: string) {
  return SNAPSHOT_FIELD_TAXONOMY[field] ?? null;
}

export function groupSnapshotFieldsByPrimaryCategory(fields: string[]) {
  return PRIMARY_SCAN_CATEGORY_ORDER.map((categoryId) => ({
    category: PRIMARY_SCAN_CATEGORY_META[categoryId],
    categoryId,
    entries: (fields
      .map((field) => getSnapshotFieldTaxonomy(field))
      .filter(Boolean) as ScanTaxonomyEntry[])
      .filter((entry) => entry.primaryCategory === categoryId)
      .sort((left, right) => (left.displayPriority ?? 999) - (right.displayPriority ?? 999))
  })).filter((group) => group.entries.length > 0);
}

export function mapLegacySignalCategory(category: string) {
  if (category === "privacy") {
    return "privacy_consent_user_choice" as const;
  }

  if (category === "accessibility") {
    return "accessibility" as const;
  }

  if (category === "disclosure" || category === "legal") {
    return "consumer_transparency_disclosures" as const;
  }

  if (category === "security") {
    return "security_trust_governance" as const;
  }

  if (category === "commerce") {
    return "data_collection_third_party_ecosystem" as const;
  }

  return "consumer_transparency_disclosures" as const;
}

export function mapSignalKeyToTaxonomy(input: { category: string; key: string; label: string }) {
  const exact: Record<string, Partial<ScanTaxonomyEntry>> = {
    "commerce.ad_network_google_ads": {
      primaryCategory: "data_collection_third_party_ecosystem",
      subcategory: "Advertising & Retargeting"
    },
    "commerce.ad_network_meta_ads": {
      primaryCategory: "data_collection_third_party_ecosystem",
      subcategory: "Advertising & Retargeting"
    },
    "commerce.retargeting_pixel_detected": {
      primaryCategory: "data_collection_third_party_ecosystem",
      subcategory: "Advertising & Retargeting"
    },
    "privacy.video_content_tracking_exposure_detected": {
      primaryCategory: "data_collection_third_party_ecosystem",
      subcategory: "Advertising & Retargeting"
    },
    "commerce.session_replay_tool_detected": {
      primaryCategory: "data_collection_third_party_ecosystem",
      subcategory: "Session Replay / Behavioral Tools"
    },
    "privacy.session_replay_runtime_detected": {
      primaryCategory: "data_collection_third_party_ecosystem",
      subcategory: "Session Replay / Behavioral Tools"
    },
    "privacy.session_replay_runtime_vendors": {
      primaryCategory: "data_collection_third_party_ecosystem",
      subcategory: "Session Replay / Behavioral Tools"
    },
    "disclosure.session_replay_disclosure_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Privacy & Cookie Disclosures"
    },
    "disclosure.session_replay_disclosure_pages": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Privacy & Cookie Disclosures"
    },
    "commerce.ai_chatbot_present": {
      primaryCategory: "ai_automation_emerging_practices",
      subcategory: "Visible AI Assistants"
    },
    "commerce.ai_assistant_widget_detected": {
      primaryCategory: "ai_automation_emerging_practices",
      subcategory: "Visible AI Assistants"
    },
    "commerce.ai_disclosure_text_present": {
      primaryCategory: "ai_automation_emerging_practices",
      subcategory: "AI Documentation & Disclosures"
    },
    "commerce.ai_terms_or_policy_ai_reference": {
      primaryCategory: "ai_automation_emerging_practices",
      subcategory: "AI Documentation & Disclosures"
    },
    "commerce.ai_help_center_ai_reference": {
      primaryCategory: "ai_automation_emerging_practices",
      subcategory: "AI Documentation & Disclosures"
    },
    "commerce.ai_search_or_answer_experience_detected": {
      primaryCategory: "ai_automation_emerging_practices",
      subcategory: "AI Search / Answer Experiences"
    },
    "commerce.ai_hiring_automation_signal_detected": {
      primaryCategory: "ai_automation_emerging_practices",
      subcategory: "Hiring / Automated Decision Signals"
    },
    "privacy.consent_reject_persisted_tracker_vendors": {
      primaryCategory: "privacy_consent_user_choice",
      subcategory: "Consent Enforcement Evidence"
    },
    "privacy.consent_reject_new_tracker_vendors": {
      primaryCategory: "privacy_consent_user_choice",
      subcategory: "Consent Enforcement Evidence"
    },
    "privacy.consent_accept_new_tracker_vendors": {
      primaryCategory: "privacy_consent_user_choice",
      subcategory: "Consent Enforcement Evidence"
    },
    "privacy.preconsent_violation_count": {
      primaryCategory: "privacy_consent_user_choice",
      subcategory: "Pre-Consent Tracking"
    },
    "privacy.preconsent_tracker_vendors": {
      primaryCategory: "privacy_consent_user_choice",
      subcategory: "Pre-Consent Tracking"
    },
    "privacy.preconsent_tracker_evidence_urls": {
      primaryCategory: "privacy_consent_user_choice",
      subcategory: "Pre-Consent Tracking"
    },
    "privacy.policy_runtime_functional_misalignment_detected": {
      primaryCategory: "privacy_consent_user_choice",
      subcategory: "Privacy Rights & Controls"
    },
    "disclosure.policy_runtime_missing_technical_disclosure_detected": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Policy Consistency & Behavior"
    },
    "disclosure.policy_runtime_disclosure_likely_obstructed": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Policy Consistency & Behavior"
    },
    "privacy.cookie_runtime_disclosure_gap_detected": {
      primaryCategory: "data_collection_third_party_ecosystem",
      subcategory: "Analytics & Tracking"
    },
    "disclosure.cookie_policy_structurally_obstructed": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Privacy & Cookie Disclosures"
    },
    "commerce.form_collects_ssn": {
      primaryCategory: "sensitive_data_identity_signals",
      subcategory: "Identity Inputs"
    },
    "commerce.form_collects_government_id": {
      primaryCategory: "sensitive_data_identity_signals",
      subcategory: "Identity Inputs"
    },
    "commerce.form_collects_birthdate": {
      primaryCategory: "sensitive_data_identity_signals",
      subcategory: "Identity Inputs"
    },
    "commerce.form_collects_financial_information": {
      primaryCategory: "sensitive_data_identity_signals",
      subcategory: "Financial Inputs"
    },
    "commerce.form_collects_health_information": {
      primaryCategory: "sensitive_data_identity_signals",
      subcategory: "Health Inputs"
    },
    "commerce.form_collects_geolocation": {
      primaryCategory: "sensitive_data_identity_signals",
      subcategory: "Location / Demographic Inputs"
    },
    "commerce.high_sensitivity_data_collection_detected": {
      primaryCategory: "sensitive_data_identity_signals",
      subcategory: "Health Inputs"
    },
    "commerce.auto_renew_disclosure_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Subscription & Billing Transparency"
    },
    "commerce.subscription_cancellation_policy_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Subscription & Billing Transparency"
    },
    "commerce.free_trial_detected": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Subscription & Billing Transparency"
    },
    "commerce.affiliate_disclosure_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Consumer Policies",
      regulatoryTags: ["ftc_consumer_protection"]
    },
    "commerce.discount_claim_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Subscription & Billing Transparency",
      regulatoryTags: ["ftc_consumer_protection", "auto_renew_subscription"]
    },
    "commerce.original_price_comparison_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Subscription & Billing Transparency",
      regulatoryTags: ["ftc_consumer_protection", "auto_renew_subscription"]
    },
    "commerce.limited_time_offer_language_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Commercial Pressure / Scarcity Signals",
      regulatoryTags: ["ftc_consumer_protection", "auto_renew_subscription"]
    },
    "commerce.refund_policy_window_days": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Subscription & Billing Transparency",
      regulatoryTags: ["ftc_consumer_protection", "auto_renew_subscription"]
    },
    "commerce.refund_policy_conditions_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Subscription & Billing Transparency",
      regulatoryTags: ["ftc_consumer_protection", "auto_renew_subscription"]
    },
    "commerce.refund_request_method_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Subscription & Billing Transparency",
      regulatoryTags: ["ftc_consumer_protection", "auto_renew_subscription"]
    },
    "commerce.store_credit_only_policy_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Subscription & Billing Transparency",
      regulatoryTags: ["ftc_consumer_protection", "auto_renew_subscription"]
    },
    "commerce.exchange_policy_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Subscription & Billing Transparency",
      regulatoryTags: ["ftc_consumer_protection", "auto_renew_subscription"]
    },
    "commerce.renewal_notice_period_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Subscription & Billing Transparency",
      regulatoryTags: ["ftc_consumer_protection", "auto_renew_subscription"]
    },
    "commerce.termination_for_cause_clause_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Subscription & Billing Transparency",
      regulatoryTags: ["ftc_consumer_protection", "auto_renew_subscription"]
    },
    "commerce.account_deletion_terms_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Subscription & Billing Transparency",
      regulatoryTags: ["ftc_consumer_protection", "auto_renew_subscription"]
    },
    "commerce.service_suspension_or_termination_terms_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Subscription & Billing Transparency",
      regulatoryTags: ["ftc_consumer_protection", "auto_renew_subscription"]
    },
    "accessibility.vpat_or_accessibility_conformance_doc_present": {
      primaryCategory: "accessibility",
      subcategory: "Accessibility Claims & Statements",
      regulatoryTags: ["accessibility_ada_wcag"]
    },
    "accessibility.wcag_level_claimed": {
      primaryCategory: "accessibility",
      subcategory: "Accessibility Claims & Statements",
      regulatoryTags: ["accessibility_ada_wcag"]
    },
    "accessibility.accessibility_contact_method_present": {
      primaryCategory: "accessibility",
      subcategory: "Accessibility Claims & Statements",
      regulatoryTags: ["accessibility_ada_wcag"]
    },
    "privacy.privacy_rights_path_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Privacy Rights & Controls",
      regulatoryTags: ["gdpr_eu_privacy", "ccpa_cpra"]
    },
    "privacy.privacy_contact_path_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Privacy Rights & Controls",
      regulatoryTags: ["gdpr_eu_privacy", "ccpa_cpra"]
    },
    "privacy.gpc_disclosure_present": {
      primaryCategory: "privacy_consent_user_choice",
      subcategory: "Privacy Rights & Controls",
      regulatoryTags: ["ccpa_cpra"]
    },
    "privacy.tracking_technologies_disclosure_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Privacy & Cookie Disclosures",
      regulatoryTags: ["gdpr_eu_privacy", "ccpa_cpra"]
    },
    "privacy.targeted_advertising_disclosure_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Privacy Rights & Controls",
      regulatoryTags: ["ccpa_cpra", "gdpr_eu_privacy"]
    },
    "privacy.third_party_advertising_disclosure_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Privacy & Cookie Disclosures",
      regulatoryTags: ["ccpa_cpra", "gdpr_eu_privacy"]
    },
    "privacy.behavioral_analytics_disclosure_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Privacy & Cookie Disclosures",
      regulatoryTags: ["gdpr_eu_privacy", "ccpa_cpra"]
    },
    "privacy.children_privacy_disclosure_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Privacy & Cookie Disclosures",
      regulatoryTags: ["gdpr_eu_privacy", "ccpa_cpra"]
    },
    "commerce.arbitration_clause_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Subscription & Billing Transparency",
      regulatoryTags: ["ftc_consumer_protection"]
    },
    "context.privacy_cookie_policy_conflict_detected": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Policy Consistency & Behavior",
      regulatoryTags: ["ftc_consumer_protection", "gdpr_eu_privacy", "ccpa_cpra"]
    },
    "context.policy_terms_conflict_detected": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Policy Consistency & Behavior",
      regulatoryTags: ["ftc_consumer_protection", "gdpr_eu_privacy", "ccpa_cpra"]
    },
    "context.access_blocked_by_robots": {
      primaryCategory: "security_trust_governance",
      subcategory: "Access & Crawl Coverage"
    },
    "context.access_http_forbidden": {
      primaryCategory: "security_trust_governance",
      subcategory: "Access & Crawl Coverage"
    },
    "context.access_bot_challenge_detected": {
      primaryCategory: "security_trust_governance",
      subcategory: "Access & Crawl Coverage"
    },
    "context.access_auth_wall_detected": {
      primaryCategory: "security_trust_governance",
      subcategory: "Access & Crawl Coverage"
    },
    "context.access_partial_scan": {
      primaryCategory: "security_trust_governance",
      subcategory: "Access & Crawl Coverage"
    },
    "privacy.dark_pattern_reject_button_missing": {
      primaryCategory: "privacy_consent_user_choice",
      subcategory: "Consent Manipulation Signals"
    },
    "privacy.dark_pattern_accept_button_prominence": {
      primaryCategory: "privacy_consent_user_choice",
      subcategory: "Consent Manipulation Signals"
    },
    "privacy.dark_pattern_forced_consent_wall": {
      primaryCategory: "privacy_consent_user_choice",
      subcategory: "Consent Manipulation Signals"
    },
    "privacy.dark_pattern_accept_only_banner": {
      primaryCategory: "privacy_consent_user_choice",
      subcategory: "Consent Manipulation Signals"
    },
    "privacy.dark_pattern_dismiss_without_reject": {
      primaryCategory: "privacy_consent_user_choice",
      subcategory: "Consent Manipulation Signals"
    },
    "privacy.dark_pattern_countdown_timer_present": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Commercial Pressure / Scarcity Signals"
    },
    "privacy.dark_pattern_fake_scarcity_language": {
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Commercial Pressure / Scarcity Signals"
    },
    "security.vulnerability_disclosure_page_present": {
      primaryCategory: "security_trust_governance",
      subcategory: "Trust & Disclosure"
    },
    "security.trust_center_present": {
      primaryCategory: "security_trust_governance",
      subcategory: "Trust & Disclosure"
    },
    "security.incident_status_page_present": {
      primaryCategory: "security_trust_governance",
      subcategory: "Incident / Vulnerability Transparency"
    }
  };

  const exactMatch = exact[input.key];
  if (exactMatch?.primaryCategory) {
    return {
      key: input.key,
      displayName: input.label,
      primaryCategory: exactMatch.primaryCategory,
      subcategory: exactMatch.subcategory,
      regulatoryTags: exactMatch.regulatoryTags ?? []
    } satisfies ScanTaxonomyEntry;
  }

  if (input.key.startsWith("accessibility.")) {
    return {
      key: input.key,
      displayName: input.label,
      primaryCategory: "accessibility",
      subcategory: "Automated Issue Signals",
      regulatoryTags: ["accessibility_ada_wcag"]
    } satisfies ScanTaxonomyEntry;
  }

  if (input.key.startsWith("privacy.")) {
    return {
      key: input.key,
      displayName: input.label,
      primaryCategory: "privacy_consent_user_choice",
      subcategory: "Privacy Rights & Controls",
      regulatoryTags: ["gdpr_eu_privacy", "ccpa_cpra", "state_privacy"]
    } satisfies ScanTaxonomyEntry;
  }

  if (input.key.startsWith("disclosure.")) {
    return {
      key: input.key,
      displayName: input.label,
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Core Legal Pages",
      regulatoryTags: ["ftc_consumer_protection", "gdpr_eu_privacy", "ccpa_cpra"]
    } satisfies ScanTaxonomyEntry;
  }

  if (input.key.startsWith("security.")) {
    return {
      key: input.key,
      displayName: input.label,
      primaryCategory: "security_trust_governance",
      subcategory: "Transport & Headers",
      regulatoryTags: ["ftc_consumer_protection"]
    } satisfies ScanTaxonomyEntry;
  }

  if (input.key.startsWith("context.")) {
    return {
      key: input.key,
      displayName: input.label,
      primaryCategory: "consumer_transparency_disclosures",
      subcategory: "Consumer Policies",
      regulatoryTags: ["ftc_consumer_protection"]
    } satisfies ScanTaxonomyEntry;
  }

  return {
    key: input.key,
    displayName: input.label,
    primaryCategory: mapLegacySignalCategory(input.category),
    subcategory: undefined,
    regulatoryTags: []
  } satisfies ScanTaxonomyEntry;
}

export function getPrimaryCategoryLabel(category: PrimaryScanCategoryId) {
  return PRIMARY_SCAN_CATEGORY_META[category].label;
}

export function getPrimaryCategoryDescription(category: PrimaryScanCategoryId) {
  return PRIMARY_SCAN_CATEGORY_META[category].description;
}
