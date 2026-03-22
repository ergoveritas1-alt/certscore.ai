export type ReportPrimaryPillarId =
  | "policies_rights_disclosures"
  | "consent_tracking_data_collection"
  | "consumer_protection_commercial_practices"
  | "accessibility"
  | "regulatory_enforcement_overlay";

export type ReportSectionId =
  | "privacy_notices_rights_data_handling"
  | "terms_legal_disclosures"
  | "policy_clarity_consistency_review"
  | "consent_controls_enforcement"
  | "tracking_third_party_ecosystem"
  | "sensitive_data_collection"
  | "offers_pricing_claims"
  | "billing_cancellation_post_purchase_rights"
  | "access_barriers_task_completion"
  | "accessibility_commitments_conformance_support"
  | "us_consumer_protection_ftc_coppa"
  | "eu_privacy_consent_gdpr_eprivacy_edpb"
  | "ca_privacy_rights_controls_ccpa_cpra_cppa"
  | "us_accessibility_enforcement_ada_doj"
  | "international_privacy_comparators";

export type ReportEvidenceCategoryId =
  | "notice_scope_entity_identity"
  | "rights_request_mechanisms"
  | "data_handling_disclosures"
  | "privacy_contacts_accountability"
  | "terms_coverage_enforceability_signals"
  | "billing_renewal_refund_terms"
  | "cancellation_termination_disclosures"
  | "legal_commercial_disclosure_coverage"
  | "clarity_completeness_risk"
  | "cross_document_consistency"
  | "policy_to_behavior_contradictions"
  | "manual_review_triggers"
  | "consent_interface_control_availability"
  | "choice_symmetry_dark_pattern_indicators"
  | "consent_framework_cmp_signals"
  | "enforcement_outcomes_after_user_choice"
  | "vendor_tracker_inventory"
  | "third_party_network_cookie_surface"
  | "adtech_analytics_replay_footprint"
  | "preconsent_tracking_incidents"
  | "collection_surface_entry_points"
  | "identity_financial_data_collection"
  | "health_location_other_sensitive_data_collection"
  | "minor_related_age_gated_collection_context"
  | "price_fee_transparency"
  | "offer_framing_promotional_mechanics"
  | "urgency_scarcity_pressure_tactics"
  | "commercial_claims_disclosure_adequacy"
  | "checkout_payment_disclosures"
  | "billing_recurring_charge_mechanics"
  | "cancellation_termination_rights"
  | "refunds_credits_post_purchase_remedies"
  | "perceivability_barriers"
  | "navigation_interaction_barriers"
  | "form_task_completion_barriers"
  | "representative_rule_level_evidence"
  | "public_accessibility_commitments"
  | "conformance_vpat_references"
  | "support_accommodation_contact_paths"
  | "claim_consistency_accessibility_posture"
  | "disclosures_claim_substantiation"
  | "choice_architecture_dark_patterns"
  | "subscription_billing_cancellation_fairness"
  | "children_youth_directed_data_practices"
  | "consent_lawful_basis_user_choice"
  | "transparency_notice_data_subject_rights"
  | "governance_accountability_transfers"
  | "tracking_profiling_sensitive_data_risk"
  | "consumer_rights_request_handling"
  | "sale_sharing_targeted_advertising_controls"
  | "opt_out_choice_design_dark_pattern_risk"
  | "profiling_high_risk_data_use_signals"
  | "perceivable_content_barriers"
  | "navigation_interaction_form_barriers"
  | "accessibility_commitments_support_paths"
  | "conformance_posture_litigation_indicators"
  | "notice_rights_baseline"
  | "privacy_governance_contactability"
  | "sensitive_data_vulnerable_user_protections"
  | "cross_border_data_handling_transparency";

export type ReportPrimaryPillarDefinition = {
  id: ReportPrimaryPillarId;
  label: string;
  sectionIds: ReportSectionId[];
};

export type ReportSectionDefinition = {
  id: ReportSectionId;
  pillarId: ReportPrimaryPillarId;
  label: string;
  evidenceCategoryIds: ReportEvidenceCategoryId[];
};

export type ReportEvidenceCategoryDefinition = {
  id: ReportEvidenceCategoryId;
  sectionId: ReportSectionId;
  label: string;
};

export type ReportSignalSource =
  | "snapshot_signal"
  | "runtime_artifact_signal"
  | "policy_enrichment_signal";

export type ReportSignalDefinition = {
  id: string;
  source: ReportSignalSource;
  key: string;
  label: string;
  primaryEvidenceCategoryId: ReportEvidenceCategoryId;
  secondaryEvidenceCategoryIds: ReportEvidenceCategoryId[];
  overlayEvidenceCategoryIds: ReportEvidenceCategoryId[];
};

export type ReportSignalEvidenceCategoryLink = {
  evidenceCategoryId: ReportEvidenceCategoryId;
  relation: "primary" | "secondary" | "overlay";
};

export type ReportUnifiedFindingCategoryAlignment = {
  evidenceCategoryId: ReportEvidenceCategoryId;
  relation: "owner" | "mirror" | "overlay";
};

export type ReportUnifiedFindingSignalMapping = {
  source: ReportSignalSource;
  key: string;
};

export type ReportUnifiedFindingDefinition = {
  id: string;
  label: string;
  categoryAlignments: ReportUnifiedFindingCategoryAlignment[];
  signalMappings: ReportUnifiedFindingSignalMapping[];
  validationRuleKeys: string[];
  aliases?: string[];
  presentationKey?: string;
};

// Canonical taxonomy IDs are intentionally stable. Evolve mappings and labels
// without changing pillar, section, or evidence-category IDs unless a
// structural flaw is identified.
const toRecord = <T extends { id: string }>(items: T[]) =>
  Object.fromEntries(items.map((item) => [item.id, item])) as Record<T["id"], T>;

const defineReportSignal = (
  source: ReportSignalSource,
  key: string,
  label: string,
  primaryEvidenceCategoryId: ReportEvidenceCategoryId,
  secondaryEvidenceCategoryIds: ReportEvidenceCategoryId[] = [],
  overlayEvidenceCategoryIds: ReportEvidenceCategoryId[] = []
): ReportSignalDefinition => ({
  id: `${source}:${key}`,
  source,
  key,
  label,
  primaryEvidenceCategoryId,
  secondaryEvidenceCategoryIds,
  overlayEvidenceCategoryIds
});

const defineUnifiedFindingAlignments = (
  owner: ReportEvidenceCategoryId,
  mirrors: ReportEvidenceCategoryId[] = [],
  overlays: ReportEvidenceCategoryId[] = []
): ReportUnifiedFindingCategoryAlignment[] => [
  { evidenceCategoryId: owner, relation: "owner" },
  ...mirrors.map((evidenceCategoryId) => ({ evidenceCategoryId, relation: "mirror" as const })),
  ...overlays.map((evidenceCategoryId) => ({ evidenceCategoryId, relation: "overlay" as const }))
];

const defineReportUnifiedFinding = (input: {
  id: string;
  label: string;
  owner: ReportEvidenceCategoryId;
  mirrors?: ReportEvidenceCategoryId[];
  overlays?: ReportEvidenceCategoryId[];
  signalMappings?: ReportUnifiedFindingSignalMapping[];
  validationRuleKeys?: string[];
  aliases?: string[];
  presentationKey?: string;
}): ReportUnifiedFindingDefinition => ({
  id: input.id,
  label: input.label,
  categoryAlignments: defineUnifiedFindingAlignments(input.owner, input.mirrors, input.overlays),
  signalMappings: input.signalMappings ?? [],
  validationRuleKeys: input.validationRuleKeys ?? [],
  aliases: input.aliases ?? [],
  presentationKey: input.presentationKey
});

export const REPORT_PRIMARY_PILLARS: ReportPrimaryPillarDefinition[] = [
  {
    id: "policies_rights_disclosures",
    label: "Policies, Rights & Disclosures",
    sectionIds: [
      "privacy_notices_rights_data_handling",
      "terms_legal_disclosures",
      "policy_clarity_consistency_review"
    ]
  },
  {
    id: "consent_tracking_data_collection",
    label: "Consent, Tracking & Data Collection",
    sectionIds: [
      "consent_controls_enforcement",
      "tracking_third_party_ecosystem",
      "sensitive_data_collection"
    ]
  },
  {
    id: "consumer_protection_commercial_practices",
    label: "Consumer Protection & Commercial Practices",
    sectionIds: [
      "offers_pricing_claims",
      "billing_cancellation_post_purchase_rights"
    ]
  },
  {
    id: "accessibility",
    label: "Accessibility",
    sectionIds: [
      "access_barriers_task_completion",
      "accessibility_commitments_conformance_support"
    ]
  },
  {
    id: "regulatory_enforcement_overlay",
    label: "Regulatory & Enforcement Overlay",
    sectionIds: [
      "us_consumer_protection_ftc_coppa",
      "eu_privacy_consent_gdpr_eprivacy_edpb",
      "ca_privacy_rights_controls_ccpa_cpra_cppa",
      "us_accessibility_enforcement_ada_doj",
      "international_privacy_comparators"
    ]
  }
];

export const REPORT_SECTIONS: ReportSectionDefinition[] = [
  {
    id: "privacy_notices_rights_data_handling",
    pillarId: "policies_rights_disclosures",
    label: "Privacy notices, rights & data handling",
    evidenceCategoryIds: [
      "notice_scope_entity_identity",
      "rights_request_mechanisms",
      "data_handling_disclosures",
      "privacy_contacts_accountability"
    ]
  },
  {
    id: "terms_legal_disclosures",
    pillarId: "policies_rights_disclosures",
    label: "Terms & legal disclosures",
    evidenceCategoryIds: [
      "terms_coverage_enforceability_signals",
      "billing_renewal_refund_terms",
      "cancellation_termination_disclosures",
      "legal_commercial_disclosure_coverage"
    ]
  },
  {
    id: "policy_clarity_consistency_review",
    pillarId: "policies_rights_disclosures",
    label: "Policy clarity, consistency & review",
    evidenceCategoryIds: [
      "clarity_completeness_risk",
      "cross_document_consistency",
      "policy_to_behavior_contradictions",
      "manual_review_triggers"
    ]
  },
  {
    id: "consent_controls_enforcement",
    pillarId: "consent_tracking_data_collection",
    label: "Consent controls & enforcement",
    evidenceCategoryIds: [
      "consent_interface_control_availability",
      "choice_symmetry_dark_pattern_indicators",
      "consent_framework_cmp_signals",
      "enforcement_outcomes_after_user_choice"
    ]
  },
  {
    id: "tracking_third_party_ecosystem",
    pillarId: "consent_tracking_data_collection",
    label: "Tracking & third-party ecosystem",
    evidenceCategoryIds: [
      "vendor_tracker_inventory",
      "third_party_network_cookie_surface",
      "adtech_analytics_replay_footprint",
      "preconsent_tracking_incidents"
    ]
  },
  {
    id: "sensitive_data_collection",
    pillarId: "consent_tracking_data_collection",
    label: "Sensitive data collection",
    evidenceCategoryIds: [
      "collection_surface_entry_points",
      "identity_financial_data_collection",
      "health_location_other_sensitive_data_collection",
      "minor_related_age_gated_collection_context"
    ]
  },
  {
    id: "offers_pricing_claims",
    pillarId: "consumer_protection_commercial_practices",
    label: "Offers, pricing & claims",
    evidenceCategoryIds: [
      "price_fee_transparency",
      "offer_framing_promotional_mechanics",
      "urgency_scarcity_pressure_tactics",
      "commercial_claims_disclosure_adequacy"
    ]
  },
  {
    id: "billing_cancellation_post_purchase_rights",
    pillarId: "consumer_protection_commercial_practices",
    label: "Billing, cancellation & post-purchase rights",
    evidenceCategoryIds: [
      "checkout_payment_disclosures",
      "billing_recurring_charge_mechanics",
      "cancellation_termination_rights",
      "refunds_credits_post_purchase_remedies"
    ]
  },
  {
    id: "access_barriers_task_completion",
    pillarId: "accessibility",
    label: "Access barriers & task completion",
    evidenceCategoryIds: [
      "perceivability_barriers",
      "navigation_interaction_barriers",
      "form_task_completion_barriers",
      "representative_rule_level_evidence"
    ]
  },
  {
    id: "accessibility_commitments_conformance_support",
    pillarId: "accessibility",
    label: "Accessibility commitments, conformance & support",
    evidenceCategoryIds: [
      "public_accessibility_commitments",
      "conformance_vpat_references",
      "support_accommodation_contact_paths",
      "claim_consistency_accessibility_posture"
    ]
  },
  {
    id: "us_consumer_protection_ftc_coppa",
    pillarId: "regulatory_enforcement_overlay",
    label: "U.S. consumer protection (FTC, COPPA)",
    evidenceCategoryIds: [
      "disclosures_claim_substantiation",
      "choice_architecture_dark_patterns",
      "subscription_billing_cancellation_fairness",
      "children_youth_directed_data_practices"
    ]
  },
  {
    id: "eu_privacy_consent_gdpr_eprivacy_edpb",
    pillarId: "regulatory_enforcement_overlay",
    label: "EU privacy and consent (GDPR, ePrivacy, EDPB, EU DPAs)",
    evidenceCategoryIds: [
      "consent_lawful_basis_user_choice",
      "transparency_notice_data_subject_rights",
      "governance_accountability_transfers",
      "tracking_profiling_sensitive_data_risk"
    ]
  },
  {
    id: "ca_privacy_rights_controls_ccpa_cpra_cppa",
    pillarId: "regulatory_enforcement_overlay",
    label: "CA privacy rights and controls (CCPA, CPRA, CPPA)",
    evidenceCategoryIds: [
      "consumer_rights_request_handling",
      "sale_sharing_targeted_advertising_controls",
      "opt_out_choice_design_dark_pattern_risk",
      "profiling_high_risk_data_use_signals"
    ]
  },
  {
    id: "us_accessibility_enforcement_ada_doj",
    pillarId: "regulatory_enforcement_overlay",
    label: "U.S. accessibility enforcement (ADA, DOJ)",
    evidenceCategoryIds: [
      "perceivable_content_barriers",
      "navigation_interaction_form_barriers",
      "accessibility_commitments_support_paths",
      "conformance_posture_litigation_indicators"
    ]
  },
  {
    id: "international_privacy_comparators",
    pillarId: "regulatory_enforcement_overlay",
    label: "International privacy comparators (PIPEDA, OPC, LGPD, ANPD, POPIA, FADP, FDPIC)",
    evidenceCategoryIds: [
      "notice_rights_baseline",
      "privacy_governance_contactability",
      "sensitive_data_vulnerable_user_protections",
      "cross_border_data_handling_transparency"
    ]
  }
];

export const REPORT_EVIDENCE_CATEGORIES: ReportEvidenceCategoryDefinition[] = [
  {
    id: "notice_scope_entity_identity",
    sectionId: "privacy_notices_rights_data_handling",
    label: "notice presence, scope & entity identity"
  },
  {
    id: "rights_request_mechanisms",
    sectionId: "privacy_notices_rights_data_handling",
    label: "rights & request mechanisms"
  },
  {
    id: "data_handling_disclosures",
    sectionId: "privacy_notices_rights_data_handling",
    label: "data handling disclosures"
  },
  {
    id: "privacy_contacts_accountability",
    sectionId: "privacy_notices_rights_data_handling",
    label: "privacy contacts & accountability"
  },
  {
    id: "terms_coverage_enforceability_signals",
    sectionId: "terms_legal_disclosures",
    label: "terms, legal coverage & enforceability signals"
  },
  {
    id: "billing_renewal_refund_terms",
    sectionId: "terms_legal_disclosures",
    label: "billing, renewal, and refund terms"
  },
  {
    id: "cancellation_termination_disclosures",
    sectionId: "terms_legal_disclosures",
    label: "cancellation and termination disclosures"
  },
  {
    id: "legal_commercial_disclosure_coverage",
    sectionId: "terms_legal_disclosures",
    label: "legal and commercial disclosure coverage"
  },
  {
    id: "clarity_completeness_risk",
    sectionId: "policy_clarity_consistency_review",
    label: "clarity and completeness risk"
  },
  {
    id: "cross_document_consistency",
    sectionId: "policy_clarity_consistency_review",
    label: "cross-document consistency"
  },
  {
    id: "policy_to_behavior_contradictions",
    sectionId: "policy_clarity_consistency_review",
    label: "policy-to-behavior contradictions"
  },
  {
    id: "manual_review_triggers",
    sectionId: "policy_clarity_consistency_review",
    label: "manual review triggers"
  },
  {
    id: "consent_interface_control_availability",
    sectionId: "consent_controls_enforcement",
    label: "consent interface and control availability"
  },
  {
    id: "choice_symmetry_dark_pattern_indicators",
    sectionId: "consent_controls_enforcement",
    label: "choice symmetry and dark-pattern indicators"
  },
  {
    id: "consent_framework_cmp_signals",
    sectionId: "consent_controls_enforcement",
    label: "consent framework and CMP signals"
  },
  {
    id: "enforcement_outcomes_after_user_choice",
    sectionId: "consent_controls_enforcement",
    label: "enforcement outcomes after user choice"
  },
  {
    id: "vendor_tracker_inventory",
    sectionId: "tracking_third_party_ecosystem",
    label: "vendor and tracker inventory"
  },
  {
    id: "third_party_network_cookie_surface",
    sectionId: "tracking_third_party_ecosystem",
    label: "third-party network and cookie surface"
  },
  {
    id: "adtech_analytics_replay_footprint",
    sectionId: "tracking_third_party_ecosystem",
    label: "adtech, analytics, and replay footprint"
  },
  {
    id: "preconsent_tracking_incidents",
    sectionId: "tracking_third_party_ecosystem",
    label: "pre-consent tracking incidents"
  },
  {
    id: "collection_surface_entry_points",
    sectionId: "sensitive_data_collection",
    label: "collection surface and entry points"
  },
  {
    id: "identity_financial_data_collection",
    sectionId: "sensitive_data_collection",
    label: "identity and financial data collection"
  },
  {
    id: "health_location_other_sensitive_data_collection",
    sectionId: "sensitive_data_collection",
    label: "health, location, and other sensitive data collection"
  },
  {
    id: "minor_related_age_gated_collection_context",
    sectionId: "sensitive_data_collection",
    label: "minor-related and age-gated collection context"
  },
  {
    id: "price_fee_transparency",
    sectionId: "offers_pricing_claims",
    label: "price and fee transparency"
  },
  {
    id: "offer_framing_promotional_mechanics",
    sectionId: "offers_pricing_claims",
    label: "offer framing and promotional mechanics"
  },
  {
    id: "urgency_scarcity_pressure_tactics",
    sectionId: "offers_pricing_claims",
    label: "urgency, scarcity, and pressure tactics"
  },
  {
    id: "commercial_claims_disclosure_adequacy",
    sectionId: "offers_pricing_claims",
    label: "commercial claims and disclosure adequacy"
  },
  {
    id: "checkout_payment_disclosures",
    sectionId: "billing_cancellation_post_purchase_rights",
    label: "checkout and payment disclosures"
  },
  {
    id: "billing_recurring_charge_mechanics",
    sectionId: "billing_cancellation_post_purchase_rights",
    label: "billing and recurring charge mechanics"
  },
  {
    id: "cancellation_termination_rights",
    sectionId: "billing_cancellation_post_purchase_rights",
    label: "cancellation and termination rights"
  },
  {
    id: "refunds_credits_post_purchase_remedies",
    sectionId: "billing_cancellation_post_purchase_rights",
    label: "refunds, credits, and post-purchase remedies"
  },
  {
    id: "perceivability_barriers",
    sectionId: "access_barriers_task_completion",
    label: "perceivability barriers"
  },
  {
    id: "navigation_interaction_barriers",
    sectionId: "access_barriers_task_completion",
    label: "navigation and interaction barriers"
  },
  {
    id: "form_task_completion_barriers",
    sectionId: "access_barriers_task_completion",
    label: "form and task-completion barriers"
  },
  {
    id: "representative_rule_level_evidence",
    sectionId: "access_barriers_task_completion",
    label: "automated issue summary & rule-level evidence"
  },
  {
    id: "public_accessibility_commitments",
    sectionId: "accessibility_commitments_conformance_support",
    label: "public accessibility commitments"
  },
  {
    id: "conformance_vpat_references",
    sectionId: "accessibility_commitments_conformance_support",
    label: "conformance and VPAT references"
  },
  {
    id: "support_accommodation_contact_paths",
    sectionId: "accessibility_commitments_conformance_support",
    label: "support, accommodation, tooling & contact paths"
  },
  {
    id: "claim_consistency_accessibility_posture",
    sectionId: "accessibility_commitments_conformance_support",
    label: "claim consistency and accessibility posture"
  },
  {
    id: "disclosures_claim_substantiation",
    sectionId: "us_consumer_protection_ftc_coppa",
    label: "disclosures and claim substantiation"
  },
  {
    id: "choice_architecture_dark_patterns",
    sectionId: "us_consumer_protection_ftc_coppa",
    label: "choice architecture and dark patterns"
  },
  {
    id: "subscription_billing_cancellation_fairness",
    sectionId: "us_consumer_protection_ftc_coppa",
    label: "subscription, billing, and cancellation fairness"
  },
  {
    id: "children_youth_directed_data_practices",
    sectionId: "us_consumer_protection_ftc_coppa",
    label: "children's and youth-directed data practices"
  },
  {
    id: "consent_lawful_basis_user_choice",
    sectionId: "eu_privacy_consent_gdpr_eprivacy_edpb",
    label: "consent, lawful basis, and user choice"
  },
  {
    id: "transparency_notice_data_subject_rights",
    sectionId: "eu_privacy_consent_gdpr_eprivacy_edpb",
    label: "transparency, notice, and data-subject rights"
  },
  {
    id: "governance_accountability_transfers",
    sectionId: "eu_privacy_consent_gdpr_eprivacy_edpb",
    label: "governance, accountability, and transfers"
  },
  {
    id: "tracking_profiling_sensitive_data_risk",
    sectionId: "eu_privacy_consent_gdpr_eprivacy_edpb",
    label: "tracking, profiling, and sensitive-data risk"
  },
  {
    id: "consumer_rights_request_handling",
    sectionId: "ca_privacy_rights_controls_ccpa_cpra_cppa",
    label: "consumer rights and request handling"
  },
  {
    id: "sale_sharing_targeted_advertising_controls",
    sectionId: "ca_privacy_rights_controls_ccpa_cpra_cppa",
    label: "sale, sharing, and targeted-advertising controls"
  },
  {
    id: "opt_out_choice_design_dark_pattern_risk",
    sectionId: "ca_privacy_rights_controls_ccpa_cpra_cppa",
    label: "opt-out choice design and dark-pattern risk"
  },
  {
    id: "profiling_high_risk_data_use_signals",
    sectionId: "ca_privacy_rights_controls_ccpa_cpra_cppa",
    label: "profiling and high-risk data-use signals"
  },
  {
    id: "perceivable_content_barriers",
    sectionId: "us_accessibility_enforcement_ada_doj",
    label: "perceivable content barriers"
  },
  {
    id: "navigation_interaction_form_barriers",
    sectionId: "us_accessibility_enforcement_ada_doj",
    label: "navigation, interaction, and form barriers"
  },
  {
    id: "accessibility_commitments_support_paths",
    sectionId: "us_accessibility_enforcement_ada_doj",
    label: "accessibility commitments and support paths"
  },
  {
    id: "conformance_posture_litigation_indicators",
    sectionId: "us_accessibility_enforcement_ada_doj",
    label: "conformance posture and litigation indicators"
  },
  {
    id: "notice_rights_baseline",
    sectionId: "international_privacy_comparators",
    label: "notice and rights baseline"
  },
  {
    id: "privacy_governance_contactability",
    sectionId: "international_privacy_comparators",
    label: "privacy governance and contactability"
  },
  {
    id: "sensitive_data_vulnerable_user_protections",
    sectionId: "international_privacy_comparators",
    label: "sensitive-data and vulnerable-user protections"
  },
  {
    id: "cross_border_data_handling_transparency",
    sectionId: "international_privacy_comparators",
    label: "cross-border data handling and transparency"
  }
];

export const REPORT_SIGNALS: ReportSignalDefinition[] = [
  defineReportSignal(
    "snapshot_signal",
    "disclosure.privacy_policy_present",
    "Privacy policy fetched",
    "notice_scope_entity_identity",
    [],
    ["transparency_notice_data_subject_rights", "notice_rights_baseline"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "disclosure.privacy_policy_surface_missing",
    "Privacy policy surface not detected",
    "notice_scope_entity_identity",
    [],
    ["transparency_notice_data_subject_rights", "notice_rights_baseline"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "disclosure.privacy_policy_fetch_failed",
    "Privacy policy page unavailable",
    "notice_scope_entity_identity",
    [],
    ["transparency_notice_data_subject_rights", "notice_rights_baseline"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.cookie_banner_present",
    "Cookie banner present",
    "consent_interface_control_availability",
    [],
    ["consent_lawful_basis_user_choice"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.cmp_vendor_detected",
    "CMP vendor detected",
    "consent_framework_cmp_signals",
    [],
    ["consent_lawful_basis_user_choice"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.consent_interaction_model",
    "Consent interaction model",
    "consent_interface_control_availability",
    ["consent_framework_cmp_signals"],
    ["consent_lawful_basis_user_choice"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.reject_all_present",
    "Reject-all control present",
    "consent_interface_control_availability",
    [],
    ["consent_lawful_basis_user_choice", "opt_out_choice_design_dark_pattern_risk"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.dsar_request_mechanism_present",
    "DSAR request mechanism present",
    "rights_request_mechanisms",
    [],
    ["consumer_rights_request_handling", "transparency_notice_data_subject_rights", "notice_rights_baseline"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.privacy_request_form_present",
    "Privacy request form present",
    "rights_request_mechanisms",
    [],
    ["consumer_rights_request_handling", "transparency_notice_data_subject_rights"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.data_access_request_present",
    "Access request flow present",
    "rights_request_mechanisms",
    [],
    ["consumer_rights_request_handling", "transparency_notice_data_subject_rights", "notice_rights_baseline"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.data_deletion_request_present",
    "Deletion request flow present",
    "rights_request_mechanisms",
    [],
    ["consumer_rights_request_handling", "transparency_notice_data_subject_rights", "notice_rights_baseline"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.do_not_sell_link_present",
    "Do-not-sell link present",
    "rights_request_mechanisms",
    ["data_handling_disclosures"],
    ["sale_sharing_targeted_advertising_controls", "consumer_rights_request_handling"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.preconsent_tracking_detected",
    "Pre-consent tracking detected",
    "preconsent_tracking_incidents",
    [],
    ["consent_lawful_basis_user_choice", "tracking_profiling_sensitive_data_risk"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.dark_pattern_reject_button_missing",
    "Reject button missing on consent surface",
    "choice_symmetry_dark_pattern_indicators",
    [],
    ["choice_architecture_dark_patterns", "opt_out_choice_design_dark_pattern_risk"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.dark_pattern_accept_button_prominence",
    "Accept button more prominent than reject",
    "choice_symmetry_dark_pattern_indicators",
    [],
    ["choice_architecture_dark_patterns", "opt_out_choice_design_dark_pattern_risk"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.dark_pattern_forced_consent_wall",
    "Forced consent wall detected",
    "choice_symmetry_dark_pattern_indicators",
    [],
    ["choice_architecture_dark_patterns", "opt_out_choice_design_dark_pattern_risk", "consent_lawful_basis_user_choice"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.dark_pattern_accept_only_banner",
    "Accept-only banner detected",
    "choice_symmetry_dark_pattern_indicators",
    [],
    ["choice_architecture_dark_patterns", "opt_out_choice_design_dark_pattern_risk"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.dark_pattern_dismiss_without_reject",
    "Dismiss-without-reject pattern detected",
    "choice_symmetry_dark_pattern_indicators",
    [],
    ["choice_architecture_dark_patterns", "opt_out_choice_design_dark_pattern_risk"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.dark_pattern_countdown_timer_present",
    "Countdown timer language detected",
    "urgency_scarcity_pressure_tactics",
    [],
    ["choice_architecture_dark_patterns"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.dark_pattern_fake_scarcity_language",
    "Scarcity language detected",
    "urgency_scarcity_pressure_tactics",
    [],
    ["choice_architecture_dark_patterns"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.consent_withdrawal_mechanism_present",
    "Consent withdrawal mechanism present",
    "rights_request_mechanisms",
    ["consent_interface_control_availability"],
    ["consumer_rights_request_handling", "consent_lawful_basis_user_choice"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.subprocessor_list_present",
    "Subprocessor list present",
    "data_handling_disclosures",
    [],
    ["governance_accountability_transfers", "privacy_governance_contactability"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.tracker_count_total",
    "Tracker vendors detected",
    "vendor_tracker_inventory",
    [],
    ["tracking_profiling_sensitive_data_risk"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.user_rights_friction_score",
    "User-rights friction score",
    "rights_request_mechanisms",
    [],
    ["consumer_rights_request_handling"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.cookie_count_total",
    "Cookies observed",
    "third_party_network_cookie_surface"
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.third_party_cookie_count",
    "Third-party cookies",
    "third_party_network_cookie_surface",
    [],
    ["tracking_profiling_sensitive_data_risk"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.tracker_vendors",
    "Tracker vendors",
    "vendor_tracker_inventory",
    [],
    ["tracking_profiling_sensitive_data_risk"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "disclosure.terms_of_service_present",
    "Terms page fetched",
    "terms_coverage_enforceability_signals",
    ["legal_commercial_disclosure_coverage"],
    ["disclosures_claim_substantiation"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "disclosure.terms_of_service_surface_missing",
    "Terms page surface not detected",
    "terms_coverage_enforceability_signals",
    ["legal_commercial_disclosure_coverage"],
    ["disclosures_claim_substantiation"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "disclosure.terms_of_service_fetch_failed",
    "Terms page unavailable",
    "terms_coverage_enforceability_signals",
    ["legal_commercial_disclosure_coverage"],
    ["disclosures_claim_substantiation"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "disclosure.cookie_policy_present",
    "Cookie policy fetched",
    "data_handling_disclosures",
    [],
    ["transparency_notice_data_subject_rights", "notice_rights_baseline"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "disclosure.cookie_policy_surface_missing",
    "Cookie policy surface not detected",
    "data_handling_disclosures",
    [],
    ["transparency_notice_data_subject_rights", "notice_rights_baseline"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "disclosure.cookie_policy_fetch_failed",
    "Cookie policy unavailable",
    "data_handling_disclosures",
    [],
    ["transparency_notice_data_subject_rights", "notice_rights_baseline"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "disclosure.accessibility_statement_present",
    "Accessibility statement fetched",
    "public_accessibility_commitments",
    [],
    ["accessibility_commitments_support_paths"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "disclosure.accessibility_statement_surface_missing",
    "Accessibility statement surface not detected",
    "public_accessibility_commitments",
    [],
    ["accessibility_commitments_support_paths"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "disclosure.accessibility_statement_fetch_failed",
    "Accessibility statement unavailable",
    "public_accessibility_commitments",
    [],
    ["accessibility_commitments_support_paths"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "disclosure.contact_page_present",
    "Contact page fetched",
    "privacy_contacts_accountability",
    ["support_accommodation_contact_paths"],
    ["privacy_governance_contactability"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "disclosure.contact_page_surface_missing",
    "Contact page surface not detected",
    "privacy_contacts_accountability",
    ["support_accommodation_contact_paths"],
    ["privacy_governance_contactability"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "disclosure.contact_page_fetch_failed",
    "Contact page unavailable",
    "privacy_contacts_accountability",
    ["support_accommodation_contact_paths"],
    ["privacy_governance_contactability"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "disclosure.key_page_discovery_unresolved_after_bounded_search",
    "Bounded key-page discovery unresolved",
    "manual_review_triggers",
    ["legal_commercial_disclosure_coverage", "notice_scope_entity_identity", "privacy_contacts_accountability"],
    ["transparency_notice_data_subject_rights", "notice_rights_baseline"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "disclosure.refund_policy_present",
    "Refund policy detected",
    "legal_commercial_disclosure_coverage",
    ["refunds_credits_post_purchase_remedies"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "disclosure.supervisory_authority_reference_present",
    "Supervisory authority reference present",
    "privacy_contacts_accountability",
    [],
    ["transparency_notice_data_subject_rights", "notice_rights_baseline"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "disclosure.privacy_policy_word_count",
    "Privacy policy word count",
    "clarity_completeness_risk"
  ),
  defineReportSignal(
    "snapshot_signal",
    "accessibility.wcag_error_count_total",
    "WCAG errors",
    "representative_rule_level_evidence",
    [],
    ["conformance_posture_litigation_indicators"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "accessibility.wcag_contrast_failures_count",
    "Contrast failures",
    "perceivability_barriers",
    [],
    ["perceivable_content_barriers"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "accessibility.wcag_missing_alt_count",
    "Missing alt text",
    "perceivability_barriers",
    [],
    ["perceivable_content_barriers"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "accessibility.wcag_form_label_error_count",
    "Form label issues",
    "form_task_completion_barriers",
    [],
    ["navigation_interaction_form_barriers"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "accessibility.wcag_aria_error_count",
    "ARIA issues",
    "representative_rule_level_evidence",
    [],
    ["navigation_interaction_form_barriers"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "accessibility.wcag_link_name_error_count",
    "Link name issues",
    "navigation_interaction_barriers",
    [],
    ["navigation_interaction_form_barriers"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "accessibility.wcag_keyboard_navigation_issue_count",
    "Keyboard navigation issues",
    "navigation_interaction_barriers",
    [],
    ["navigation_interaction_form_barriers"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "accessibility.wcag_focus_indicator_issue_count",
    "Focus indicator issues",
    "navigation_interaction_barriers",
    [],
    ["navigation_interaction_form_barriers"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "accessibility.wcag_landmark_issue_count",
    "Landmark issues",
    "navigation_interaction_barriers",
    [],
    ["navigation_interaction_form_barriers"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "accessibility.accessibility_widget_present",
    "Accessibility widget detected",
    "support_accommodation_contact_paths",
    ["public_accessibility_commitments"],
    ["accessibility_commitments_support_paths"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "accessibility.vpat_or_accessibility_conformance_doc_present",
    "VPAT or accessibility conformance document detected",
    "conformance_vpat_references",
    [],
    ["accessibility_commitments_support_paths"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "accessibility.accessibility_contact_method_present",
    "Accessibility contact method detected",
    "support_accommodation_contact_paths",
    [],
    ["accessibility_commitments_support_paths"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "accessibility.wcag_level_claimed",
    "WCAG conformance level claimed",
    "conformance_vpat_references",
    ["claim_consistency_accessibility_posture"],
    ["accessibility_commitments_support_paths", "conformance_posture_litigation_indicators"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "accessibility.accessibility_claim_mismatch_detected",
    "Accessibility claim mismatch detected",
    "claim_consistency_accessibility_posture",
    [],
    ["conformance_posture_litigation_indicators"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "accessibility.accessibility_litigation_risk_score",
    "Accessibility risk score",
    "representative_rule_level_evidence",
    [],
    ["conformance_posture_litigation_indicators"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.form_count_total",
    "Forms detected",
    "collection_surface_entry_points"
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.checkout_or_payment_form_present",
    "Checkout flow detected",
    "collection_surface_entry_points",
    ["checkout_payment_disclosures"],
    ["subscription_billing_cancellation_fairness"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.free_trial_detected",
    "Free trial detected",
    "offer_framing_promotional_mechanics",
    ["billing_recurring_charge_mechanics"],
    ["subscription_billing_cancellation_fairness"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.discount_claim_present",
    "Discount claim detected",
    "offer_framing_promotional_mechanics",
    ["price_fee_transparency"],
    ["disclosures_claim_substantiation"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.original_price_comparison_present",
    "Original price comparison detected",
    "price_fee_transparency",
    ["offer_framing_promotional_mechanics"],
    ["disclosures_claim_substantiation"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.limited_time_offer_language_present",
    "Limited-time offer language detected",
    "urgency_scarcity_pressure_tactics",
    ["offer_framing_promotional_mechanics"],
    ["choice_architecture_dark_patterns"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.high_sensitivity_data_collection_detected",
    "High-sensitivity data collection detected",
    "health_location_other_sensitive_data_collection",
    [],
    ["tracking_profiling_sensitive_data_risk", "sensitive_data_vulnerable_user_protections"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.form_collects_ssn",
    "SSN collection detected",
    "identity_financial_data_collection",
    [],
    ["profiling_high_risk_data_use_signals", "sensitive_data_vulnerable_user_protections"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.form_collects_government_id",
    "Government ID collection detected",
    "identity_financial_data_collection",
    [],
    ["profiling_high_risk_data_use_signals", "sensitive_data_vulnerable_user_protections"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.form_collects_health_information",
    "Health information collection detected",
    "health_location_other_sensitive_data_collection",
    [],
    ["tracking_profiling_sensitive_data_risk", "profiling_high_risk_data_use_signals", "sensitive_data_vulnerable_user_protections"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.form_collects_financial_information",
    "Financial information collection detected",
    "identity_financial_data_collection",
    [],
    ["profiling_high_risk_data_use_signals"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.form_collects_birthdate",
    "Birthdate collection detected",
    "minor_related_age_gated_collection_context",
    [],
    ["children_youth_directed_data_practices", "sensitive_data_vulnerable_user_protections"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.form_collects_geolocation",
    "Geolocation collection detected",
    "health_location_other_sensitive_data_collection",
    [],
    ["tracking_profiling_sensitive_data_risk", "profiling_high_risk_data_use_signals"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.auto_renew_disclosure_present",
    "Auto-renew disclosure detected",
    "billing_recurring_charge_mechanics",
    ["billing_renewal_refund_terms"],
    ["subscription_billing_cancellation_fairness"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.subscription_cancellation_policy_present",
    "Subscription cancellation policy detected",
    "cancellation_termination_rights",
    ["cancellation_termination_disclosures"],
    ["subscription_billing_cancellation_fairness"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.refund_policy_window_days",
    "Refund policy window days",
    "refunds_credits_post_purchase_remedies",
    ["billing_renewal_refund_terms"],
    ["subscription_billing_cancellation_fairness"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.refund_policy_conditions_present",
    "Refund policy conditions detected",
    "refunds_credits_post_purchase_remedies",
    ["billing_renewal_refund_terms"],
    ["subscription_billing_cancellation_fairness"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.refund_request_method_present",
    "Refund request method detected",
    "refunds_credits_post_purchase_remedies",
    [],
    ["subscription_billing_cancellation_fairness"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.store_credit_only_policy_present",
    "Store-credit-only policy detected",
    "refunds_credits_post_purchase_remedies",
    [],
    ["subscription_billing_cancellation_fairness"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.exchange_policy_present",
    "Exchange policy detected",
    "refunds_credits_post_purchase_remedies",
    [],
    ["subscription_billing_cancellation_fairness"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.renewal_notice_period_present",
    "Renewal notice period detected",
    "billing_recurring_charge_mechanics",
    ["billing_renewal_refund_terms"],
    ["subscription_billing_cancellation_fairness"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.termination_for_cause_clause_present",
    "Termination-for-cause clause detected",
    "cancellation_termination_rights",
    ["cancellation_termination_disclosures"],
    ["subscription_billing_cancellation_fairness"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.account_deletion_terms_present",
    "Account deletion terms detected",
    "cancellation_termination_rights",
    ["cancellation_termination_disclosures"],
    ["subscription_billing_cancellation_fairness"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.service_suspension_or_termination_terms_present",
    "Service suspension or termination terms detected",
    "cancellation_termination_rights",
    ["cancellation_termination_disclosures"],
    ["subscription_billing_cancellation_fairness"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.ad_network_google_ads",
    "Google Ads detected",
    "adtech_analytics_replay_footprint",
    [],
    ["sale_sharing_targeted_advertising_controls", "tracking_profiling_sensitive_data_risk"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.ad_network_meta_ads",
    "Meta Ads detected",
    "adtech_analytics_replay_footprint",
    [],
    ["sale_sharing_targeted_advertising_controls", "tracking_profiling_sensitive_data_risk"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.retargeting_pixel_detected",
    "Retargeting pixel detected",
    "adtech_analytics_replay_footprint",
    [],
    ["sale_sharing_targeted_advertising_controls", "tracking_profiling_sensitive_data_risk"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "commerce.session_replay_tool_detected",
    "Session replay tool detected",
    "adtech_analytics_replay_footprint",
    [],
    ["tracking_profiling_sensitive_data_risk"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.session_replay_runtime_detected",
    "Session replay runtime detected",
    "adtech_analytics_replay_footprint",
    [],
    ["tracking_profiling_sensitive_data_risk"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "privacy.session_replay_runtime_vendors",
    "Session replay runtime vendors",
    "adtech_analytics_replay_footprint",
    [],
    ["tracking_profiling_sensitive_data_risk"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "disclosure.session_replay_disclosure_present",
    "Session replay disclosure present",
    "data_handling_disclosures",
    ["adtech_analytics_replay_footprint"],
    ["transparency_notice_data_subject_rights", "tracking_profiling_sensitive_data_risk"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "disclosure.session_replay_disclosure_pages",
    "Session replay disclosure pages",
    "data_handling_disclosures",
    ["adtech_analytics_replay_footprint"],
    ["transparency_notice_data_subject_rights", "tracking_profiling_sensitive_data_risk"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "context.children_audience_likely",
    "Children audience likely",
    "minor_related_age_gated_collection_context",
    [],
    ["children_youth_directed_data_practices", "sensitive_data_vulnerable_user_protections"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "context.kid_directed_content_detected",
    "Kid-directed content detected",
    "minor_related_age_gated_collection_context",
    [],
    ["children_youth_directed_data_practices", "sensitive_data_vulnerable_user_protections"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "context.policy_behavior_conflict_detected",
    "Policy/behavior conflict detected",
    "policy_to_behavior_contradictions",
    [],
    ["disclosures_claim_substantiation", "transparency_notice_data_subject_rights", "conformance_posture_litigation_indicators"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "context.policy_terms_conflict_detected",
    "Policy/terms conflict detected",
    "cross_document_consistency",
    [],
    ["disclosures_claim_substantiation", "transparency_notice_data_subject_rights"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "context.privacy_cookie_policy_conflict_detected",
    "Privacy/cookie policy conflict detected",
    "cross_document_consistency",
    [],
    ["disclosures_claim_substantiation", "transparency_notice_data_subject_rights"]
  ),
  defineReportSignal(
    "snapshot_signal",
    "context.session_replay_without_disclosure_detected",
    "Session replay without disclosure detected",
    "policy_to_behavior_contradictions",
    ["adtech_analytics_replay_footprint"],
    ["tracking_profiling_sensitive_data_risk", "sale_sharing_targeted_advertising_controls"]
  ),
  defineReportSignal(
    "runtime_artifact_signal",
    "consent_audit_completed",
    "Consent audit completed",
    "enforcement_outcomes_after_user_choice",
    [],
    ["consent_lawful_basis_user_choice"]
  ),
  defineReportSignal(
    "runtime_artifact_signal",
    "consent_reject_interaction_succeeded",
    "Reject interaction succeeded",
    "enforcement_outcomes_after_user_choice",
    [],
    ["consent_lawful_basis_user_choice"]
  ),
  defineReportSignal(
    "runtime_artifact_signal",
    "consent_reject_reduced_tracking",
    "Reject reduced tracking",
    "enforcement_outcomes_after_user_choice",
    [],
    ["consent_lawful_basis_user_choice", "opt_out_choice_design_dark_pattern_risk"]
  ),
  defineReportSignal(
    "runtime_artifact_signal",
    "consent_reject_reduced_third_party_cookies",
    "Reject reduced third-party cookies",
    "enforcement_outcomes_after_user_choice",
    ["third_party_network_cookie_surface"],
    ["consent_lawful_basis_user_choice"]
  ),
  defineReportSignal(
    "runtime_artifact_signal",
    "consent_reject_persisted_tracker_vendor_names",
    "Persisted tracker vendors after reject",
    "enforcement_outcomes_after_user_choice",
    ["vendor_tracker_inventory"],
    ["consent_lawful_basis_user_choice", "tracking_profiling_sensitive_data_risk"]
  ),
  defineReportSignal(
    "runtime_artifact_signal",
    "consent_reject_new_tracker_vendor_names",
    "New tracker vendors after reject",
    "enforcement_outcomes_after_user_choice",
    ["vendor_tracker_inventory"],
    ["consent_lawful_basis_user_choice", "tracking_profiling_sensitive_data_risk"]
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "policyDsarMechanism",
    "Policy DSAR mechanism",
    "rights_request_mechanisms",
    [],
    ["consumer_rights_request_handling", "transparency_notice_data_subject_rights", "notice_rights_baseline"]
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "privacyContactChannelType",
    "Privacy contact channel type",
    "privacy_contacts_accountability",
    [],
    ["privacy_governance_contactability", "notice_rights_baseline"]
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "policyRetentionPeriods",
    "Policy retention periods",
    "data_handling_disclosures",
    [],
    ["governance_accountability_transfers", "notice_rights_baseline"]
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "policyTransferMechanisms",
    "Policy transfer mechanisms",
    "data_handling_disclosures",
    [],
    ["governance_accountability_transfers", "cross_border_data_handling_transparency"]
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "policyDoNotSell",
    "Policy do-not-sell disclosure",
    "data_handling_disclosures",
    ["rights_request_mechanisms"],
    ["sale_sharing_targeted_advertising_controls", "consumer_rights_request_handling"]
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "policySubprocessorsListed",
    "Policy subprocessors listed",
    "data_handling_disclosures",
    [],
    ["governance_accountability_transfers", "privacy_governance_contactability"]
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "policyChildrenReference",
    "Policy children reference",
    "minor_related_age_gated_collection_context",
    ["data_handling_disclosures"],
    ["children_youth_directed_data_practices", "sensitive_data_vulnerable_user_protections"]
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "policyAmbiguityScore",
    "Policy ambiguity score",
    "clarity_completeness_risk"
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "policySemanticConfidence",
    "Policy semantic confidence",
    "manual_review_triggers"
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "policyBehaviorConflictCandidate",
    "Policy behavior conflict candidate",
    "policy_to_behavior_contradictions",
    [],
    ["disclosures_claim_substantiation", "transparency_notice_data_subject_rights"]
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "policyActionableFlags",
    "Policy actionable flags",
    "manual_review_triggers"
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "privacy.policy_runtime_functional_misalignment_detected",
    "Policy/runtime functional misalignment detected",
    "policy_to_behavior_contradictions",
    ["rights_request_mechanisms"],
    ["consumer_rights_request_handling", "opt_out_choice_design_dark_pattern_risk"]
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "disclosure.policy_runtime_missing_technical_disclosure_detected",
    "Missing technical disclosure detected",
    "policy_to_behavior_contradictions",
    ["data_handling_disclosures"],
    ["tracking_profiling_sensitive_data_risk", "disclosures_claim_substantiation"]
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "disclosure.policy_runtime_disclosure_likely_obstructed",
    "Policy disclosure likely obstructed",
    "clarity_completeness_risk",
    ["manual_review_triggers"],
    ["transparency_notice_data_subject_rights"]
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "privacy.cookie_runtime_disclosure_gap_detected",
    "Cookie disclosure gap detected",
    "third_party_network_cookie_surface",
    ["data_handling_disclosures"],
    ["tracking_profiling_sensitive_data_risk", "consent_lawful_basis_user_choice"]
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "disclosure.cookie_policy_structurally_obstructed",
    "Cookie policy structurally obstructed",
    "manual_review_triggers",
    ["clarity_completeness_risk"],
    ["third_party_network_cookie_surface", "notice_rights_baseline"]
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "policyEffectiveDate",
    "Policy effective date",
    "terms_coverage_enforceability_signals"
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "policyGoverningLaw",
    "Policy governing law",
    "terms_coverage_enforceability_signals"
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "policyArbitrationPresent",
    "Policy arbitration present",
    "terms_coverage_enforceability_signals"
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "policyClaimNoSale",
    "Policy claim no sale",
    "data_handling_disclosures",
    [],
    ["sale_sharing_targeted_advertising_controls"]
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "policyClaimNoTracking",
    "Policy claim no tracking",
    "data_handling_disclosures",
    [],
    ["tracking_profiling_sensitive_data_risk"]
  ),
  defineReportSignal(
    "policy_enrichment_signal",
    "policyClaimPrivacyProtective",
    "Policy claim privacy protective",
    "data_handling_disclosures",
    ["commercial_claims_disclosure_adequacy"],
    ["disclosures_claim_substantiation"]
  )
];

export const REPORT_UNIFIED_FINDINGS = [
  defineReportUnifiedFinding({
    id: "privacy_policy_missing_surface",
    label: "Privacy policy surface missing",
    owner: "notice_scope_entity_identity",
    overlays: ["transparency_notice_data_subject_rights", "notice_rights_baseline"],
    signalMappings: [{ source: "snapshot_signal", key: "disclosure.privacy_policy_surface_missing" }]
  }),
  defineReportUnifiedFinding({
    id: "privacy_policy_unavailable",
    label: "Privacy policy unavailable",
    owner: "notice_scope_entity_identity",
    overlays: ["transparency_notice_data_subject_rights", "notice_rights_baseline"],
    signalMappings: [{ source: "snapshot_signal", key: "disclosure.privacy_policy_fetch_failed" }]
  }),
  defineReportUnifiedFinding({
    id: "terms_missing_surface",
    label: "Terms surface missing",
    owner: "terms_coverage_enforceability_signals",
    mirrors: ["legal_commercial_disclosure_coverage"],
    overlays: ["disclosures_claim_substantiation"],
    signalMappings: [{ source: "snapshot_signal", key: "disclosure.terms_of_service_surface_missing" }]
  }),
  defineReportUnifiedFinding({
    id: "terms_unavailable",
    label: "Terms unavailable",
    owner: "terms_coverage_enforceability_signals",
    mirrors: ["legal_commercial_disclosure_coverage"],
    overlays: ["disclosures_claim_substantiation"],
    signalMappings: [{ source: "snapshot_signal", key: "disclosure.terms_of_service_fetch_failed" }]
  }),
  defineReportUnifiedFinding({
    id: "cookie_policy_missing_surface",
    label: "Cookie policy surface missing",
    owner: "data_handling_disclosures",
    overlays: ["transparency_notice_data_subject_rights", "notice_rights_baseline"],
    signalMappings: [{ source: "snapshot_signal", key: "disclosure.cookie_policy_surface_missing" }]
  }),
  defineReportUnifiedFinding({
    id: "cookie_policy_unavailable",
    label: "Cookie policy unavailable",
    owner: "data_handling_disclosures",
    overlays: ["transparency_notice_data_subject_rights", "notice_rights_baseline"],
    signalMappings: [{ source: "snapshot_signal", key: "disclosure.cookie_policy_fetch_failed" }]
  }),
  defineReportUnifiedFinding({
    id: "accessibility_statement_missing_surface",
    label: "Accessibility statement surface missing",
    owner: "public_accessibility_commitments",
    overlays: ["accessibility_commitments_support_paths"],
    signalMappings: [{ source: "snapshot_signal", key: "disclosure.accessibility_statement_surface_missing" }]
  }),
  defineReportUnifiedFinding({
    id: "accessibility_statement_unavailable",
    label: "Accessibility statement unavailable",
    owner: "public_accessibility_commitments",
    overlays: ["accessibility_commitments_support_paths"],
    signalMappings: [{ source: "snapshot_signal", key: "disclosure.accessibility_statement_fetch_failed" }]
  }),
  defineReportUnifiedFinding({
    id: "contact_page_missing_surface",
    label: "Contact page surface missing",
    owner: "privacy_contacts_accountability",
    mirrors: ["support_accommodation_contact_paths"],
    overlays: ["privacy_governance_contactability"],
    signalMappings: [{ source: "snapshot_signal", key: "disclosure.contact_page_surface_missing" }]
  }),
  defineReportUnifiedFinding({
    id: "contact_page_unavailable",
    label: "Contact page unavailable",
    owner: "privacy_contacts_accountability",
    mirrors: ["support_accommodation_contact_paths"],
    overlays: ["privacy_governance_contactability"],
    signalMappings: [{ source: "snapshot_signal", key: "disclosure.contact_page_fetch_failed" }]
  }),
  defineReportUnifiedFinding({
    id: "bounded_key_page_discovery_unresolved",
    label: "Bounded key-page discovery unresolved",
    owner: "manual_review_triggers",
    mirrors: ["legal_commercial_disclosure_coverage", "notice_scope_entity_identity", "privacy_contacts_accountability"],
    overlays: ["transparency_notice_data_subject_rights", "notice_rights_baseline"],
    signalMappings: [{ source: "snapshot_signal", key: "disclosure.key_page_discovery_unresolved_after_bounded_search" }]
  }),

  defineReportUnifiedFinding({
    id: "low_confidence_policy_extraction",
    label: "Low-confidence policy extraction",
    owner: "manual_review_triggers",
    signalMappings: [{ source: "policy_enrichment_signal", key: "policySemanticConfidence" }],
    validationRuleKeys: [
      "section_review.low_confidence_critical_fields",
      "section_review.low_extraction_confidence",
      "scan_report_review.low_confidence_critical_fields",
      "policy_review.low_confidence_critical_fields.cookie_policy",
      "policy_review.low_confidence_critical_fields.privacy_policy",
      "policy_review.low_confidence_critical_fields.terms_of_service"
    ],
    aliases: [
      "Low-confidence policy extraction",
      "Low-confidence extraction",
      "Low-confidence extraction cookie policy",
      "Low-confidence extraction privacy policy",
      "Low-confidence extraction terms of service",
      "Low-confidence extraction tos"
    ]
  }),
  defineReportUnifiedFinding({
    id: "policy_extraction_provider_error",
    label: "Policy extraction provider error",
    owner: "manual_review_triggers",
    validationRuleKeys: ["section_review.policy_extraction_provider_error"]
  }),
  defineReportUnifiedFinding({
    id: "disclosure_likely_obstructed",
    label: "Disclosure likely obstructed",
    owner: "clarity_completeness_risk",
    mirrors: ["manual_review_triggers"],
    overlays: ["transparency_notice_data_subject_rights"],
    signalMappings: [{ source: "policy_enrichment_signal", key: "disclosure.policy_runtime_disclosure_likely_obstructed" }],
    validationRuleKeys: ["policy_runtime.disclosure_likely_obstructed"],
    aliases: ["Disclosure likely obstructed"]
  }),
  defineReportUnifiedFinding({
    id: "cookie_policy_structurally_obstructed",
    label: "Cookie policy structurally obstructed",
    owner: "manual_review_triggers",
    mirrors: ["clarity_completeness_risk"],
    overlays: ["third_party_network_cookie_surface", "notice_rights_baseline"],
    signalMappings: [{ source: "policy_enrichment_signal", key: "disclosure.cookie_policy_structurally_obstructed" }],
    validationRuleKeys: ["cookie_runtime.cookie_policy_obstructed"]
  }),
  defineReportUnifiedFinding({
    id: "policy_clarity_risk",
    label: "Policy clarity risk",
    owner: "clarity_completeness_risk",
    signalMappings: [
      { source: "snapshot_signal", key: "disclosure.privacy_policy_word_count" },
      { source: "policy_enrichment_signal", key: "policyAmbiguityScore" }
    ]
  }),
  defineReportUnifiedFinding({
    id: "rule_only_policy_row_present",
    label: "Rule-only policy row present",
    owner: "manual_review_triggers",
    validationRuleKeys: ["section_review.rule_only_row_present"]
  }),

  defineReportUnifiedFinding({
    id: "missing_dsar_mechanism",
    label: "Missing DSAR mechanism",
    owner: "rights_request_mechanisms",
    overlays: ["consumer_rights_request_handling", "transparency_notice_data_subject_rights", "notice_rights_baseline"],
    validationRuleKeys: ["section_review.no_dsar_mechanism"]
  }),
  defineReportUnifiedFinding({
    id: "missing_dsar_high_exposure",
    label: "Missing DSAR mechanism on high-exposure site",
    owner: "rights_request_mechanisms",
    overlays: ["consumer_rights_request_handling", "transparency_notice_data_subject_rights", "notice_rights_baseline"],
    validationRuleKeys: [
      "section_review.missing_dsar_high_exposure",
      "scan_report_review.missing_dsar_high_exposure"
    ],
    aliases: ["Possible missing DSAR path"]
  }),
  defineReportUnifiedFinding({
    id: "rights_fulfillment_friction",
    label: "Rights fulfillment friction",
    owner: "rights_request_mechanisms",
    overlays: ["consumer_rights_request_handling"],
    signalMappings: [{ source: "snapshot_signal", key: "privacy.user_rights_friction_score" }],
    aliases: ["Critical user-rights fulfillment friction"]
  }),
  defineReportUnifiedFinding({
    id: "cookie_disclosure_gap",
    label: "Cookie disclosure gap",
    owner: "third_party_network_cookie_surface",
    mirrors: ["data_handling_disclosures"],
    overlays: ["tracking_profiling_sensitive_data_risk", "consent_lawful_basis_user_choice"],
    signalMappings: [{ source: "policy_enrichment_signal", key: "privacy.cookie_runtime_disclosure_gap_detected" }],
    validationRuleKeys: ["cookie_runtime.disclosure_gap"]
  }),
  defineReportUnifiedFinding({
    id: "missing_retention_disclosure",
    label: "Missing retention disclosure",
    owner: "data_handling_disclosures",
    overlays: ["governance_accountability_transfers", "notice_rights_baseline"],
    validationRuleKeys: ["section_review.no_retention_periods_noted"]
  }),
  defineReportUnifiedFinding({
    id: "missing_transfer_disclosure",
    label: "Missing transfer disclosure",
    owner: "data_handling_disclosures",
    overlays: ["governance_accountability_transfers", "cross_border_data_handling_transparency"],
    validationRuleKeys: ["section_review.no_transfer_mechanism_noted"]
  }),

  defineReportUnifiedFinding({
    id: "policy_behavior_conflict",
    label: "Policy/behavior conflict",
    owner: "policy_to_behavior_contradictions",
    overlays: ["disclosures_claim_substantiation", "transparency_notice_data_subject_rights"],
    signalMappings: [
      { source: "snapshot_signal", key: "context.policy_behavior_conflict_detected" },
      { source: "policy_enrichment_signal", key: "policyBehaviorConflictCandidate" },
      { source: "policy_enrichment_signal", key: "disclosure.policy_runtime_missing_technical_disclosure_detected" }
    ],
    validationRuleKeys: [
      "scan_report_review.policy_behavior_conflict_candidate",
      "policy_runtime.missing_technical_disclosure"
    ],
    aliases: ["Policy/behavior conflict detected", "Possible policy-to-behavior conflict", "Missing technical disclosure"]
  }),
  defineReportUnifiedFinding({
    id: "consent_gated_tracking_claim_conflict",
    label: "Consent-gated tracking claim conflict",
    owner: "policy_to_behavior_contradictions",
    mirrors: ["preconsent_tracking_incidents"],
    overlays: ["consent_lawful_basis_user_choice", "tracking_profiling_sensitive_data_risk"],
    aliases: ["Consent-gated tracking claim conflicts with runtime behavior"]
  }),
  defineReportUnifiedFinding({
    id: "do_not_sell_sharing_disclosure_conflict",
    label: "Do-not-sell / sharing disclosure conflict",
    owner: "policy_to_behavior_contradictions",
    mirrors: ["data_handling_disclosures", "adtech_analytics_replay_footprint"],
    overlays: ["sale_sharing_targeted_advertising_controls"],
    aliases: ["Do-not-sell / sharing disclosure conflicts with observed adtech stack"]
  }),
  defineReportUnifiedFinding({
    id: "privacy_terms_conflict",
    label: "Privacy/terms conflict",
    owner: "cross_document_consistency",
    overlays: ["disclosures_claim_substantiation", "transparency_notice_data_subject_rights"],
    signalMappings: [{ source: "snapshot_signal", key: "context.policy_terms_conflict_detected" }]
  }),
  defineReportUnifiedFinding({
    id: "privacy_cookie_policy_conflict",
    label: "Privacy/cookie policy conflict",
    owner: "cross_document_consistency",
    overlays: ["disclosures_claim_substantiation", "transparency_notice_data_subject_rights"],
    signalMappings: [{ source: "snapshot_signal", key: "context.privacy_cookie_policy_conflict_detected" }]
  }),
  defineReportUnifiedFinding({
    id: "functional_misalignment",
    label: "Functional misalignment",
    owner: "policy_to_behavior_contradictions",
    mirrors: ["rights_request_mechanisms"],
    overlays: ["consumer_rights_request_handling", "opt_out_choice_design_dark_pattern_risk"],
    signalMappings: [{ source: "policy_enrichment_signal", key: "privacy.policy_runtime_functional_misalignment_detected" }],
    validationRuleKeys: ["policy_runtime.functional_misalignment"],
    aliases: ["High-confidence functional misalignment", "Functional misalignment"]
  }),

  defineReportUnifiedFinding({
    id: "preconsent_tracking",
    label: "Pre-consent tracking",
    owner: "preconsent_tracking_incidents",
    overlays: ["consent_lawful_basis_user_choice", "tracking_profiling_sensitive_data_risk"],
    signalMappings: [{ source: "snapshot_signal", key: "privacy.preconsent_tracking_detected" }],
    aliases: [
      "Trackers fired before consent interaction",
      "Pre-consent tracking incidents detected",
      "Trackers observed before consent",
      "Pre-consent tracking detected"
    ]
  }),
  defineReportUnifiedFinding({
    id: "reject_did_not_reduce_tracking",
    label: "Reject did not reduce tracking",
    owner: "enforcement_outcomes_after_user_choice",
    mirrors: ["vendor_tracker_inventory"],
    overlays: ["consent_lawful_basis_user_choice", "tracking_profiling_sensitive_data_risk"],
    signalMappings: [{ source: "runtime_artifact_signal", key: "consent_reject_reduced_tracking" }],
    aliases: ["Reject interaction did not reduce tracking", "Trackers persisted after reject"]
  }),
  defineReportUnifiedFinding({
    id: "reject_did_not_reduce_third_party_cookies",
    label: "Reject did not reduce third-party cookies",
    owner: "enforcement_outcomes_after_user_choice",
    mirrors: ["third_party_network_cookie_surface"],
    overlays: ["consent_lawful_basis_user_choice"],
    signalMappings: [{ source: "runtime_artifact_signal", key: "consent_reject_reduced_third_party_cookies" }],
    aliases: ["Reject interaction did not reduce third-party cookies"]
  }),
  defineReportUnifiedFinding({
    id: "consent_surface_required_deeper_sweep",
    label: "Consent surface required deeper sweep",
    owner: "consent_interface_control_availability",
    overlays: ["consent_lawful_basis_user_choice"],
    aliases: ["Consent surface required deeper interaction sweep"]
  }),
  defineReportUnifiedFinding({
    id: "accept_flow_unavailable_after_reject",
    label: "Accept flow unavailable after reject",
    owner: "enforcement_outcomes_after_user_choice",
    overlays: ["consent_lawful_basis_user_choice"],
    aliases: ["Accept flow was unavailable after reject in-session"]
  }),
  defineReportUnifiedFinding({
    id: "reject_button_missing",
    label: "Reject button missing",
    owner: "choice_symmetry_dark_pattern_indicators",
    overlays: ["choice_architecture_dark_patterns", "opt_out_choice_design_dark_pattern_risk"],
    signalMappings: [{ source: "snapshot_signal", key: "privacy.dark_pattern_reject_button_missing" }],
    aliases: ["Reject-all control missing"]
  }),
  defineReportUnifiedFinding({
    id: "accept_more_prominent_than_reject",
    label: "Accept more prominent than reject",
    owner: "choice_symmetry_dark_pattern_indicators",
    overlays: ["choice_architecture_dark_patterns", "opt_out_choice_design_dark_pattern_risk"],
    signalMappings: [{ source: "snapshot_signal", key: "privacy.dark_pattern_accept_button_prominence" }]
  }),
  defineReportUnifiedFinding({
    id: "forced_consent_wall",
    label: "Forced consent wall",
    owner: "choice_symmetry_dark_pattern_indicators",
    overlays: ["choice_architecture_dark_patterns", "opt_out_choice_design_dark_pattern_risk", "consent_lawful_basis_user_choice"],
    signalMappings: [{ source: "snapshot_signal", key: "privacy.dark_pattern_forced_consent_wall" }]
  }),
  defineReportUnifiedFinding({
    id: "accept_only_banner",
    label: "Accept-only banner",
    owner: "choice_symmetry_dark_pattern_indicators",
    overlays: ["choice_architecture_dark_patterns", "opt_out_choice_design_dark_pattern_risk"],
    signalMappings: [{ source: "snapshot_signal", key: "privacy.dark_pattern_accept_only_banner" }]
  }),
  defineReportUnifiedFinding({
    id: "dismiss_without_reject",
    label: "Dismiss without reject",
    owner: "choice_symmetry_dark_pattern_indicators",
    overlays: ["choice_architecture_dark_patterns", "opt_out_choice_design_dark_pattern_risk"],
    signalMappings: [{ source: "snapshot_signal", key: "privacy.dark_pattern_dismiss_without_reject" }]
  }),
  defineReportUnifiedFinding({
    id: "session_replay_observed",
    label: "Session replay observed",
    owner: "adtech_analytics_replay_footprint",
    overlays: ["tracking_profiling_sensitive_data_risk"],
    signalMappings: [
      { source: "snapshot_signal", key: "commerce.session_replay_tool_detected" },
      { source: "snapshot_signal", key: "privacy.session_replay_runtime_detected" },
      { source: "snapshot_signal", key: "privacy.session_replay_runtime_vendors" }
    ]
  }),
  defineReportUnifiedFinding({
    id: "session_replay_undisclosed",
    label: "Session replay undisclosed",
    owner: "policy_to_behavior_contradictions",
    mirrors: ["adtech_analytics_replay_footprint", "data_handling_disclosures"],
    overlays: ["tracking_profiling_sensitive_data_risk", "sale_sharing_targeted_advertising_controls"],
    signalMappings: [{ source: "snapshot_signal", key: "context.session_replay_without_disclosure_detected" }],
    validationRuleKeys: [
      "section_review.session_replay_detected_without_disclosure",
      "section_review.session_replay_may_be_undisclosed",
      "scan_report_review.session_replay_without_disclosure_detected",
      "privacy.session_replay_without_disclosure_detected"
    ],
    aliases: ["Possible undisclosed session replay", "Session replay without disclosure"]
  }),
  defineReportUnifiedFinding({
    id: "retargeting_pixel_observed",
    label: "Retargeting pixel observed",
    owner: "adtech_analytics_replay_footprint",
    overlays: ["sale_sharing_targeted_advertising_controls", "tracking_profiling_sensitive_data_risk"],
    signalMappings: [{ source: "snapshot_signal", key: "commerce.retargeting_pixel_detected" }]
  }),

  defineReportUnifiedFinding({
    id: "high_sensitivity_data_collection",
    label: "High-sensitivity data collection",
    owner: "health_location_other_sensitive_data_collection",
    overlays: ["tracking_profiling_sensitive_data_risk", "sensitive_data_vulnerable_user_protections"],
    signalMappings: [{ source: "snapshot_signal", key: "commerce.high_sensitivity_data_collection_detected" }]
  }),
  defineReportUnifiedFinding({
    id: "health_information_collection",
    label: "Health information collection",
    owner: "health_location_other_sensitive_data_collection",
    overlays: ["tracking_profiling_sensitive_data_risk", "profiling_high_risk_data_use_signals", "sensitive_data_vulnerable_user_protections"],
    signalMappings: [{ source: "snapshot_signal", key: "commerce.form_collects_health_information" }]
  }),
  defineReportUnifiedFinding({
    id: "geolocation_collection",
    label: "Geolocation collection",
    owner: "health_location_other_sensitive_data_collection",
    overlays: ["tracking_profiling_sensitive_data_risk", "profiling_high_risk_data_use_signals"],
    signalMappings: [{ source: "snapshot_signal", key: "commerce.form_collects_geolocation" }]
  }),
  defineReportUnifiedFinding({
    id: "ssn_collection",
    label: "SSN collection",
    owner: "identity_financial_data_collection",
    overlays: ["profiling_high_risk_data_use_signals", "sensitive_data_vulnerable_user_protections"],
    signalMappings: [{ source: "snapshot_signal", key: "commerce.form_collects_ssn" }]
  }),
  defineReportUnifiedFinding({
    id: "government_id_collection",
    label: "Government ID collection",
    owner: "identity_financial_data_collection",
    overlays: ["profiling_high_risk_data_use_signals", "sensitive_data_vulnerable_user_protections"],
    signalMappings: [{ source: "snapshot_signal", key: "commerce.form_collects_government_id" }]
  }),
  defineReportUnifiedFinding({
    id: "financial_information_collection",
    label: "Financial information collection",
    owner: "identity_financial_data_collection",
    overlays: ["profiling_high_risk_data_use_signals"],
    signalMappings: [{ source: "snapshot_signal", key: "commerce.form_collects_financial_information" }]
  }),
  defineReportUnifiedFinding({
    id: "minors_or_age_gated_collection_context",
    label: "Minors or age-gated collection context",
    owner: "minor_related_age_gated_collection_context",
    overlays: ["children_youth_directed_data_practices", "sensitive_data_vulnerable_user_protections"],
    signalMappings: [
      { source: "snapshot_signal", key: "commerce.form_collects_birthdate" },
      { source: "snapshot_signal", key: "context.children_audience_likely" },
      { source: "snapshot_signal", key: "context.kid_directed_content_detected" },
      { source: "policy_enrichment_signal", key: "policyChildrenReference" }
    ]
  }),

  defineReportUnifiedFinding({
    id: "discount_claim_present",
    label: "Discount claim present",
    owner: "offer_framing_promotional_mechanics",
    mirrors: ["price_fee_transparency"],
    overlays: ["disclosures_claim_substantiation"],
    signalMappings: [{ source: "snapshot_signal", key: "commerce.discount_claim_present" }]
  }),
  defineReportUnifiedFinding({
    id: "original_price_comparison_present",
    label: "Original price comparison present",
    owner: "price_fee_transparency",
    mirrors: ["offer_framing_promotional_mechanics"],
    overlays: ["disclosures_claim_substantiation"],
    signalMappings: [{ source: "snapshot_signal", key: "commerce.original_price_comparison_present" }]
  }),
  defineReportUnifiedFinding({
    id: "limited_time_pressure",
    label: "Limited-time pressure",
    owner: "urgency_scarcity_pressure_tactics",
    mirrors: ["offer_framing_promotional_mechanics"],
    overlays: ["choice_architecture_dark_patterns"],
    signalMappings: [
      { source: "snapshot_signal", key: "privacy.dark_pattern_countdown_timer_present" },
      { source: "snapshot_signal", key: "privacy.dark_pattern_fake_scarcity_language" },
      { source: "snapshot_signal", key: "commerce.limited_time_offer_language_present" }
    ]
  }),
  defineReportUnifiedFinding({
    id: "store_credit_only_remedy",
    label: "Store-credit-only remedy",
    owner: "refunds_credits_post_purchase_remedies",
    overlays: ["subscription_billing_cancellation_fairness"],
    signalMappings: [{ source: "snapshot_signal", key: "commerce.store_credit_only_policy_present" }],
    aliases: ["Store-credit-only remedy detected"]
  }),
  defineReportUnifiedFinding({
    id: "restrictive_termination_or_suspension_terms",
    label: "Restrictive termination or suspension terms",
    owner: "cancellation_termination_rights",
    mirrors: ["cancellation_termination_disclosures"],
    overlays: ["subscription_billing_cancellation_fairness"],
    signalMappings: [
      { source: "snapshot_signal", key: "commerce.termination_for_cause_clause_present" },
      { source: "snapshot_signal", key: "commerce.service_suspension_or_termination_terms_present" }
    ]
  }),

  defineReportUnifiedFinding({
    id: "wcag_issue_summary",
    label: "WCAG issue summary",
    owner: "representative_rule_level_evidence",
    mirrors: ["perceivability_barriers"],
    overlays: ["conformance_posture_litigation_indicators"],
    signalMappings: [
      { source: "snapshot_signal", key: "accessibility.wcag_error_count_total" },
      { source: "snapshot_signal", key: "accessibility.wcag_missing_alt_count" }
    ],
    validationRuleKeys: ["accessibility.wcag_errors_detected", "accessibility_review.missing_alt_text"],
    aliases: ["Automated accessibility issues detected", "Missing alt text"]
  }),
  defineReportUnifiedFinding({
    id: "accessibility_risk_score",
    label: "Accessibility risk score",
    owner: "representative_rule_level_evidence",
    overlays: ["conformance_posture_litigation_indicators"],
    signalMappings: [{ source: "snapshot_signal", key: "accessibility.accessibility_litigation_risk_score" }],
    validationRuleKeys: ["scan_snapshot.accessibility.accessibility_risk_score"]
  }),
  defineReportUnifiedFinding({
    id: "contrast_failures",
    label: "Contrast failures",
    owner: "perceivability_barriers",
    overlays: ["perceivable_content_barriers"],
    signalMappings: [{ source: "snapshot_signal", key: "accessibility.wcag_contrast_failures_count" }],
    validationRuleKeys: ["accessibility_review.contrast_failures"]
  }),
  defineReportUnifiedFinding({
    id: "form_label_issues",
    label: "Form label issues",
    owner: "form_task_completion_barriers",
    overlays: ["navigation_interaction_form_barriers"],
    signalMappings: [{ source: "snapshot_signal", key: "accessibility.wcag_form_label_error_count" }],
    validationRuleKeys: ["accessibility_review.form_label_issues"]
  }),
  defineReportUnifiedFinding({
    id: "link_name_issues",
    label: "Link name issues",
    owner: "navigation_interaction_barriers",
    overlays: ["navigation_interaction_form_barriers"],
    signalMappings: [{ source: "snapshot_signal", key: "accessibility.wcag_link_name_error_count" }],
    aliases: ["Navigation issues"]
  }),
  defineReportUnifiedFinding({
    id: "keyboard_navigation_issues",
    label: "Keyboard navigation issues",
    owner: "navigation_interaction_barriers",
    overlays: ["navigation_interaction_form_barriers"],
    signalMappings: [{ source: "snapshot_signal", key: "accessibility.wcag_keyboard_navigation_issue_count" }],
    validationRuleKeys: ["accessibility_review.navigation_issues"]
  }),
  defineReportUnifiedFinding({
    id: "focus_indicator_issues",
    label: "Focus indicator issues",
    owner: "navigation_interaction_barriers",
    overlays: ["navigation_interaction_form_barriers"],
    signalMappings: [{ source: "snapshot_signal", key: "accessibility.wcag_focus_indicator_issue_count" }]
  }),
  defineReportUnifiedFinding({
    id: "landmark_issues",
    label: "Landmark issues",
    owner: "navigation_interaction_barriers",
    overlays: ["navigation_interaction_form_barriers"],
    signalMappings: [{ source: "snapshot_signal", key: "accessibility.wcag_landmark_issue_count" }]
  }),
  defineReportUnifiedFinding({
    id: "aria_issues",
    label: "ARIA issues",
    owner: "representative_rule_level_evidence",
    overlays: ["navigation_interaction_form_barriers"],
    signalMappings: [{ source: "snapshot_signal", key: "accessibility.wcag_aria_error_count" }],
    validationRuleKeys: ["accessibility_review.aria_problems"],
    aliases: ["ARIA problems"]
  }),
  defineReportUnifiedFinding({
    id: "accessibility_claim_mismatch",
    label: "Accessibility claim mismatch",
    owner: "claim_consistency_accessibility_posture",
    overlays: ["conformance_posture_litigation_indicators"],
    signalMappings: [{ source: "snapshot_signal", key: "accessibility.accessibility_claim_mismatch_detected" }],
    aliases: ["Accessibility claim mismatch detected"]
  })
] satisfies ReportUnifiedFindingDefinition[];

export type ReportUnifiedFindingId = (typeof REPORT_UNIFIED_FINDINGS)[number]["id"];

export const REPORT_PRIMARY_PILLAR_DEFINITIONS = toRecord(REPORT_PRIMARY_PILLARS);
export const REPORT_SECTION_DEFINITIONS = toRecord(REPORT_SECTIONS);
export const REPORT_EVIDENCE_CATEGORY_DEFINITIONS = toRecord(REPORT_EVIDENCE_CATEGORIES);
export const REPORT_SIGNAL_DEFINITIONS = toRecord(REPORT_SIGNALS);
export const REPORT_UNIFIED_FINDING_DEFINITIONS = toRecord(REPORT_UNIFIED_FINDINGS);
const REPORT_UNIFIED_FINDING_ALIASES = Object.fromEntries(
  REPORT_UNIFIED_FINDINGS.flatMap((finding) =>
    (finding.aliases ?? []).map((alias) => [alias.trim().toLowerCase(), finding])
  )
) as Record<string, ReportUnifiedFindingDefinition>;
const REPORT_UNIFIED_FINDING_SIGNAL_LOOKUP = Object.fromEntries(
  REPORT_UNIFIED_FINDINGS.flatMap((finding) =>
    finding.signalMappings.map((mapping) => [`${mapping.source}:${mapping.key}`, finding])
  )
) as Record<string, ReportUnifiedFindingDefinition>;
const REPORT_UNIFIED_FINDING_VALIDATION_LOOKUP = Object.fromEntries(
  REPORT_UNIFIED_FINDINGS.flatMap((finding) => finding.validationRuleKeys.map((ruleKey) => [ruleKey, finding]))
) as Record<string, ReportUnifiedFindingDefinition>;

export function getReportPrimaryPillar(id: string) {
  return REPORT_PRIMARY_PILLAR_DEFINITIONS[id as ReportPrimaryPillarId] ?? null;
}

export function getReportSection(id: string) {
  return REPORT_SECTION_DEFINITIONS[id as ReportSectionId] ?? null;
}

export function getReportEvidenceCategory(id: string) {
  return REPORT_EVIDENCE_CATEGORY_DEFINITIONS[id as ReportEvidenceCategoryId] ?? null;
}

export function getReportSignal(id: string) {
  return REPORT_SIGNAL_DEFINITIONS[id] ?? null;
}

export function getReportSignalBySourceAndKey(source: ReportSignalSource, key: string) {
  return getReportSignal(`${source}:${key}`);
}

export function getReportUnifiedFinding(id: string) {
  return REPORT_UNIFIED_FINDING_DEFINITIONS[id as ReportUnifiedFindingId] ?? null;
}

export function getReportUnifiedFindingByAlias(alias: string) {
  return REPORT_UNIFIED_FINDING_ALIASES[alias.trim().toLowerCase()] ?? null;
}

export function getReportUnifiedFindingForSignal(source: ReportSignalSource, key: string) {
  return REPORT_UNIFIED_FINDING_SIGNAL_LOOKUP[`${source}:${key}`] ?? null;
}

export function getReportUnifiedFindingForValidationRule(ruleKey: string) {
  const exactMatch = REPORT_UNIFIED_FINDING_VALIDATION_LOOKUP[ruleKey];
  if (exactMatch) {
    return exactMatch;
  }

  if (ruleKey.startsWith("scan_signal.")) {
    const signalKey = ruleKey.slice("scan_signal.".length);
    const mappedSignal = REPORT_UNIFIED_FINDINGS.find((finding) => finding.signalMappings.some((mapping) => mapping.key === signalKey));
    if (mappedSignal) {
      return mappedSignal;
    }
  }

  if (ruleKey.startsWith("section_review.clarity_risk_")) {
    return getReportUnifiedFinding("policy_clarity_risk");
  }

  if (ruleKey.startsWith("section_review.confidence_")) {
    return getReportUnifiedFinding("low_confidence_policy_extraction");
  }

  return null;
}

export function getReportSectionsForPillar(id: string) {
  const pillar = getReportPrimaryPillar(id);
  if (!pillar) {
    return [];
  }

  return pillar.sectionIds
    .map((sectionId) => getReportSection(sectionId))
    .filter((section): section is ReportSectionDefinition => section !== null);
}

export function getReportEvidenceCategoriesForSection(id: string) {
  const section = getReportSection(id);
  if (!section) {
    return [];
  }

  return section.evidenceCategoryIds
    .map((categoryId) => getReportEvidenceCategory(categoryId))
    .filter((category): category is ReportEvidenceCategoryDefinition => category !== null);
}

export function getReportUnifiedFindingsForEvidenceCategory(
  evidenceCategoryId: string,
  relation?: ReportUnifiedFindingCategoryAlignment["relation"]
) {
  const validRelation = relation ?? null;

  return REPORT_UNIFIED_FINDINGS.flatMap((finding) =>
    finding.categoryAlignments
      .filter((alignment) => alignment.evidenceCategoryId === evidenceCategoryId)
      .filter((alignment) => validRelation === null || alignment.relation === validRelation)
      .map((alignment) => ({ finding, relation: alignment.relation }))
  );
}

export function getReportUnifiedFindingsForSection(id: string) {
  const categories = getReportEvidenceCategoriesForSection(id);
  const seen = new Set<string>();

  return categories.flatMap((category) =>
    getReportUnifiedFindingsForEvidenceCategory(category.id).filter(({ finding }) => {
      if (seen.has(finding.id)) {
        return false;
      }
      seen.add(finding.id);
      return true;
    })
  );
}

export function getReportUnifiedFindingsForPillar(id: string) {
  const sections = getReportSectionsForPillar(id);
  const seen = new Set<string>();

  return sections.flatMap((section) =>
    getReportUnifiedFindingsForSection(section.id).filter(({ finding }) => {
      if (seen.has(finding.id)) {
        return false;
      }
      seen.add(finding.id);
      return true;
    })
  );
}

export function getReportSignalEvidenceCategoryLinks(id: string): ReportSignalEvidenceCategoryLink[] {
  const signal = getReportSignal(id);
  if (!signal) {
    return [];
  }

  return [
    { evidenceCategoryId: signal.primaryEvidenceCategoryId, relation: "primary" as const },
    ...signal.secondaryEvidenceCategoryIds.map((evidenceCategoryId) => ({
      evidenceCategoryId,
      relation: "secondary" as const
    })),
    ...signal.overlayEvidenceCategoryIds.map((evidenceCategoryId) => ({
      evidenceCategoryId,
      relation: "overlay" as const
    }))
  ];
}

export function getReportSignalsForEvidenceCategory(
  evidenceCategoryId: string,
  relation?: ReportSignalEvidenceCategoryLink["relation"]
) {
  const validRelation = relation ?? null;

  return REPORT_SIGNALS.flatMap((signal) =>
    getReportSignalEvidenceCategoryLinks(signal.id)
      .filter((link) => link.evidenceCategoryId === evidenceCategoryId)
      .filter((link) => validRelation === null || link.relation === validRelation)
      .map((link) => ({ signal, relation: link.relation }))
  );
}
