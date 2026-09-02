import assert from "node:assert/strict";
import test from "node:test";
import {
  getReportEvidenceCategoriesForSection,
  getReportEvidenceCategory,
  getReportPrimaryPillar,
  getReportSignal,
  getReportSignalBySourceAndKey,
  getReportSignalEvidenceCategoryLinks,
  getReportSignalsForEvidenceCategory,
  getReportUnifiedFinding,
  getReportUnifiedFindingByAlias,
  getReportUnifiedFindingForSignal,
  getReportUnifiedFindingForValidationRule,
  getReportUnifiedFindingsForEvidenceCategory,
  getReportUnifiedFindingsForPillar,
  getReportUnifiedFindingsForSection,
  getReportSection,
  getReportSectionsForPillar,
  REPORT_EVIDENCE_CATEGORIES,
  REPORT_PRIMARY_PILLARS,
  REPORT_SIGNALS,
  REPORT_UNIFIED_FINDINGS,
  REPORT_SECTIONS
} from "./report-pillars";

test("defines the v1 pillar order", () => {
  assert.deepEqual(
    REPORT_PRIMARY_PILLARS.map((pillar) => pillar.id),
    [
      "policies_rights_disclosures",
      "consent_tracking_data_collection",
      "consumer_protection_commercial_practices",
      "accessibility",
      "regulatory_enforcement_overlay"
    ]
  );
});

test("keeps each section attached to exactly one pillar", () => {
  assert.equal(REPORT_SECTIONS.length, 19);
  assert.ok(
    REPORT_SECTIONS.every((section) =>
      REPORT_PRIMARY_PILLARS.some((pillar) => pillar.id === section.pillarId && pillar.sectionIds.includes(section.id))
    )
  );
});

test("keeps each evidence category attached to exactly one section", () => {
  assert.equal(REPORT_EVIDENCE_CATEGORIES.length, 70);
  assert.ok(
    REPORT_EVIDENCE_CATEGORIES.every((category) =>
      REPORT_SECTIONS.some(
        (section) => section.id === category.sectionId && section.evidenceCategoryIds.includes(category.id)
      )
    )
  );
});

test("defines a source-aware signal registry", () => {
  assert.ok(REPORT_SIGNALS.length >= 70);
  assert.ok(
    REPORT_SIGNALS.every((signal) => signal.primaryEvidenceCategoryId.length > 0 && signal.id === `${signal.source}:${signal.key}`)
  );
});

test("defines the unified-finding registry with one owner alignment", () => {
  assert.equal(REPORT_UNIFIED_FINDINGS.length, 162);
  assert.ok(
    REPORT_UNIFIED_FINDINGS.every(
      (finding) => finding.categoryAlignments.filter((alignment) => alignment.relation === "owner").length === 1
    )
  );
});

test("maps score-neutral post-Accept signals through the unified finding registry", () => {
  assert.equal(
    getReportUnifiedFindingForSignal(
      "runtime_artifact_signal",
      "privacy.post_accept_consent_dependent_activity",
    )?.id,
    "post_accept_consent_dependent_activity",
  );
  assert.equal(
    getReportUnifiedFindingForSignal(
      "runtime_artifact_signal",
      "privacy.accept_reject_outcomes_indistinguishable",
    )?.id,
    "accept_reject_outcomes_indistinguishable",
  );
  assert.equal(
    getReportUnifiedFindingForSignal(
      "runtime_artifact_signal",
      "privacy.acceptance_signal_contradicts_action",
    )?.id,
    "acceptance_signal_contradicts_action",
  );
});

test("maps the paid decline path through the unified finding registry", () => {
  assert.equal(
    getReportUnifiedFindingForSignal(
      "runtime_artifact_signal",
      "privacy.consent_paid_decline_path",
    )?.id,
    "paid_alternative_required_to_decline_tracking",
  );
});

test("maps CMP load-order gap runtime signal through unified finding registry", () => {
  const signal = getReportSignalBySourceAndKey("runtime_artifact_signal", "privacy.cmp_load_order_gap");
  const finding = getReportUnifiedFindingForSignal("runtime_artifact_signal", "privacy.cmp_load_order_gap");

  assert.equal(signal?.label, "CMP load-order gap observed");
  assert.equal(finding?.id, "consent_infrastructure__cmp_load_order");
  assert.equal(finding?.categoryAlignments.find((alignment) => alignment.relation === "owner")?.evidenceCategoryId, "preconsent_tracking_incidents");
});

test("maps video content tracking exposure through signal and finding registries", () => {
  const signal = getReportSignalBySourceAndKey(
    "snapshot_signal",
    "privacy.video_content_tracking_exposure_detected"
  );
  const finding = getReportUnifiedFindingForSignal(
    "snapshot_signal",
    "privacy.video_content_tracking_exposure_detected"
  );

  assert.equal(signal?.primaryEvidenceCategoryId, "adtech_analytics_replay_footprint");
  assert.equal(finding?.id, "video_content_tracking_exposure");
  assert.equal(getReportUnifiedFindingByAlias("VPPA-style video privacy exposure")?.id, "video_content_tracking_exposure");
});

test("returns stable section metadata with parent linkage", () => {
  assert.deepEqual(getReportSection("tracking_third_party_ecosystem"), {
    id: "tracking_third_party_ecosystem",
    pillarId: "consent_tracking_data_collection",
    label: "Tracking & third-party ecosystem",
    evidenceCategoryIds: [
      "vendor_tracker_inventory",
      "third_party_network_cookie_surface",
      "adtech_analytics_replay_footprint",
      "preconsent_tracking_incidents"
    ]
  });
});

test("returns stable evidence-category metadata with parent linkage", () => {
  assert.deepEqual(getReportEvidenceCategory("price_fee_transparency"), {
    id: "price_fee_transparency",
    sectionId: "offers_pricing_claims",
    label: "price and fee transparency"
  });
});

test("returns ordered section metadata for a pillar", () => {
  assert.deepEqual(
    getReportSectionsForPillar("policies_rights_disclosures").map((section) => section.id),
    [
      "privacy_notices_rights_data_handling",
      "terms_legal_disclosures",
      "policy_clarity_consistency_review",
      "entity_identity_registration_transparency"
    ]
  );
});

test("returns ordered evidence-category metadata for a section", () => {
  assert.deepEqual(
    getReportEvidenceCategoriesForSection("us_consumer_protection_ftc_coppa").map((category) => category.id),
    [
      "disclosures_claim_substantiation",
      "choice_architecture_dark_patterns",
      "subscription_billing_cancellation_fairness",
      "children_youth_directed_data_practices"
    ]
  );
});

test("returns signal metadata with primary, secondary, and overlay links", () => {
  assert.deepEqual(getReportSignalBySourceAndKey("snapshot_signal", "privacy.do_not_sell_link_present"), {
    id: "snapshot_signal:privacy.do_not_sell_link_present",
    source: "snapshot_signal",
    key: "privacy.do_not_sell_link_present",
    label: "Do-not-sell link present",
    primaryEvidenceCategoryId: "rights_request_mechanisms",
    secondaryEvidenceCategoryIds: ["data_handling_disclosures"],
    overlayEvidenceCategoryIds: [
      "sale_sharing_targeted_advertising_controls",
      "consumer_rights_request_handling"
    ]
  });
});

test("returns ordered evidence-category links for a cross-cutting signal", () => {
  assert.deepEqual(
    getReportSignalEvidenceCategoryLinks("snapshot_signal:commerce.session_replay_tool_detected"),
    [
      { evidenceCategoryId: "adtech_analytics_replay_footprint", relation: "primary" },
      { evidenceCategoryId: "tracking_profiling_sensitive_data_risk", relation: "overlay" }
    ]
  );
});

test("maps new accessibility and consumer MVP signals into stable evidence categories", () => {
  assert.deepEqual(
    getReportSignalBySourceAndKey("snapshot_signal", "accessibility.vpat_or_accessibility_conformance_doc_present"),
    {
      id: "snapshot_signal:accessibility.vpat_or_accessibility_conformance_doc_present",
      source: "snapshot_signal",
      key: "accessibility.vpat_or_accessibility_conformance_doc_present",
      label: "VPAT or accessibility conformance document detected",
      primaryEvidenceCategoryId: "conformance_vpat_references",
      secondaryEvidenceCategoryIds: [],
      overlayEvidenceCategoryIds: ["accessibility_commitments_support_paths"]
    }
  );
  assert.deepEqual(
    getReportSignalBySourceAndKey("snapshot_signal", "commerce.refund_policy_window_days"),
    {
      id: "snapshot_signal:commerce.refund_policy_window_days",
      source: "snapshot_signal",
      key: "commerce.refund_policy_window_days",
      label: "Refund policy window days",
      primaryEvidenceCategoryId: "refunds_credits_post_purchase_remedies",
      secondaryEvidenceCategoryIds: ["billing_renewal_refund_terms"],
      overlayEvidenceCategoryIds: ["subscription_billing_cancellation_fairness"]
    }
  );
  assert.deepEqual(
    getReportSignalBySourceAndKey("snapshot_signal", "commerce.checkout_or_payment_form_present"),
    {
      id: "snapshot_signal:commerce.checkout_or_payment_form_present",
      source: "snapshot_signal",
      key: "commerce.checkout_or_payment_form_present",
      label: "Checkout flow detected",
      primaryEvidenceCategoryId: "collection_surface_entry_points_and_handling_context",
      secondaryEvidenceCategoryIds: ["checkout_payment_disclosures"],
      overlayEvidenceCategoryIds: ["subscription_billing_cancellation_fairness"]
    }
  );
  assert.deepEqual(
    getReportSignalBySourceAndKey("snapshot_signal", "commerce.free_trial_detected"),
    {
      id: "snapshot_signal:commerce.free_trial_detected",
      source: "snapshot_signal",
      key: "commerce.free_trial_detected",
      label: "Free trial detected",
      primaryEvidenceCategoryId: "offer_framing_promotional_mechanics",
      secondaryEvidenceCategoryIds: ["billing_recurring_charge_mechanics"],
      overlayEvidenceCategoryIds: ["subscription_billing_cancellation_fairness"]
    }
  );
  assert.deepEqual(
    getReportSignalBySourceAndKey("snapshot_signal", "context.policy_terms_conflict_detected"),
    {
      id: "snapshot_signal:context.policy_terms_conflict_detected",
      source: "snapshot_signal",
      key: "context.policy_terms_conflict_detected",
      label: "Policy/terms conflict detected",
      primaryEvidenceCategoryId: "cross_document_consistency",
      secondaryEvidenceCategoryIds: [],
      overlayEvidenceCategoryIds: ["disclosures_claim_substantiation", "transparency_notice_data_subject_rights"]
    }
  );
  assert.deepEqual(
    getReportSignalBySourceAndKey("snapshot_signal", "commerce.affiliate_disclosure_present"),
    {
      id: "snapshot_signal:commerce.affiliate_disclosure_present",
      source: "snapshot_signal",
      key: "commerce.affiliate_disclosure_present",
      label: "Affiliate disclosure present",
      primaryEvidenceCategoryId: "disclosures_claim_substantiation",
      secondaryEvidenceCategoryIds: ["legal_commercial_disclosure_coverage"],
      overlayEvidenceCategoryIds: []
    }
  );
  assert.deepEqual(
    getReportSignalBySourceAndKey("snapshot_signal", "financial.past_performance_disclaimer_text_present"),
    {
      id: "snapshot_signal:financial.past_performance_disclaimer_text_present",
      source: "snapshot_signal",
      key: "financial.past_performance_disclaimer_text_present",
      label: "Past-performance disclaimer text present",
      primaryEvidenceCategoryId: "performance_claim_context_and_risk_disclosure",
      secondaryEvidenceCategoryIds: ["consumer_financial_marketing_claims"],
      overlayEvidenceCategoryIds: ["disclosures_claim_substantiation"]
    }
  );
  assert.deepEqual(
    getReportSignalBySourceAndKey("snapshot_signal", "commercial.explicit_fee_disclosure_text_present"),
    {
      id: "snapshot_signal:commercial.explicit_fee_disclosure_text_present",
      source: "snapshot_signal",
      key: "commercial.explicit_fee_disclosure_text_present",
      label: "Explicit fee disclosure text present",
      primaryEvidenceCategoryId: "fee_disclosure_clarity",
      secondaryEvidenceCategoryIds: ["consumer_choice_and_cost_transparency"],
      overlayEvidenceCategoryIds: ["disclosures_claim_substantiation"]
    }
  );
  assert.deepEqual(
    getReportSignalBySourceAndKey("snapshot_signal", "financial.apr_or_interest_rate_disclosure_text_present"),
    {
      id: "snapshot_signal:financial.apr_or_interest_rate_disclosure_text_present",
      source: "snapshot_signal",
      key: "financial.apr_or_interest_rate_disclosure_text_present",
      label: "APR or interest-rate disclosure text present",
      primaryEvidenceCategoryId: "fee_disclosure_clarity",
      secondaryEvidenceCategoryIds: [
        "consumer_choice_and_cost_transparency",
        "performance_claim_context_and_risk_disclosure"
      ],
      overlayEvidenceCategoryIds: ["disclosures_claim_substantiation"]
    }
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "commercial.explicit_fee_disclosure_text_present")?.id,
    "fee_disclosure_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "financial.past_performance_disclaimer_text_present")?.id,
    "past_performance_disclaimer_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "financial.apr_or_interest_rate_disclosure_text_present")?.id,
    "apr_or_interest_rate_disclosure_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "disclosure.privacy_policy_present")?.id,
    "privacy_policy_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "disclosure.terms_of_service_present")?.id,
    "terms_of_service_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "disclosure.cookie_policy_present")?.id,
    "cookie_policy_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "disclosure.contact_page_present")?.id,
    "contact_support_path_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "privacy.do_not_sell_link_present")?.id,
    "targeted_advertising_choices_present"
  );
});

test("returns signals attached to an evidence category by relation", () => {
  assert.deepEqual(
    getReportSignalsForEvidenceCategory("consumer_rights_request_handling", "overlay").map(
      ({ signal }) => signal.id
    ),
    [
      "snapshot_signal:privacy.dsar_request_mechanism_present",
      "snapshot_signal:privacy.privacy_request_form_present",
      "snapshot_signal:privacy.data_access_request_present",
      "snapshot_signal:privacy.data_deletion_request_present",
      "snapshot_signal:privacy.do_not_sell_link_present",
      "snapshot_signal:privacy.sale_sharing_controls_missing",
      "runtime_artifact_signal:privacy.cpra_cba_opt_out_missing",
      "snapshot_signal:privacy.consent_withdrawal_mechanism_present",
      "snapshot_signal:privacy.user_rights_friction_score",
      "document_semantic_signal:policyDsarMechanism",
      "snapshot_signal:privacy.privacy_contact_channel_missing",
      "document_semantic_signal:policyDoNotSell",
      "document_semantic_signal:privacy.policy_runtime_functional_misalignment_detected",
      "document_semantic_signal:policyRightsSignals",
      "document_semantic_signal:privacy.gpc_disclosure_present"
    ]
  );
});

test("maps signals and validation rules into unified findings", () => {
  assert.deepEqual(getReportUnifiedFindingForSignal("snapshot_signal", "disclosure.cookie_policy_fetch_failed"), {
    id: "cookie_policy_unavailable",
    label: "Cookie policy unavailable",
    categoryAlignments: [
      { evidenceCategoryId: "data_handling_disclosures", relation: "owner" },
      { evidenceCategoryId: "transparency_notice_data_subject_rights", relation: "overlay" },
      { evidenceCategoryId: "sale_sharing_targeted_advertising_controls", relation: "overlay" },
      { evidenceCategoryId: "notice_rights_baseline", relation: "overlay" }
    ],
    signalMappings: [{ source: "snapshot_signal", key: "disclosure.cookie_policy_fetch_failed" }],
    validationRuleKeys: [],
    aliases: [],
    presentationKey: undefined
  });

  assert.equal(
    getReportUnifiedFindingForValidationRule("section_review.missing_dsar_high_exposure")?.id,
    "missing_dsar_high_exposure"
  );
  assert.equal(
    getReportUnifiedFindingForValidationRule("section_review.clarity_risk_68")?.id,
    "policy_clarity_risk"
  );
  assert.equal(
    getReportUnifiedFindingForValidationRule("scan_signal.disclosure.cookie_policy_fetch_failed")?.id,
    "cookie_policy_unavailable"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("runtime_artifact_signal", "privacy.gpc_response")?.id,
    "gpc_response"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("runtime_artifact_signal", "privacy.cpra_cba_opt_out_missing")?.id,
    "cpra_cba_opt_out_missing"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("runtime_artifact_signal", "privacy.weak_cookie_security_attributes_detected")?.id,
    "weak_cookie_security_attributes"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("runtime_artifact_signal", "privacy.dark_pattern_reject_button_missing")?.id,
    "reject_button_missing"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "privacy.consent_mechanism_absent")?.id,
    "consent_mechanism_absent"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "privacy.consent_surface_missing")?.id,
    "consent_surface_missing"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "privacy.privacy_contact_channel_missing")?.id,
    "privacy_contact_channel_missing"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "accessibility.accessibility_support_path_missing")?.id,
    "accessibility_support_path_missing"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "privacy.sale_sharing_controls_missing")?.id,
    "sale_sharing_controls_missing"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("document_semantic_signal", "policyRightsSignals")?.id,
    "privacy_rights_path_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("document_semantic_signal", "privacy.privacy_rights_path_present")?.id,
    "privacy_rights_path_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("document_semantic_signal", "privacy.privacy_contact_path_present")?.id,
    "privacy_contact_path_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("document_semantic_signal", "privacyContactChannelType"),
    null
  );
  assert.equal(
    getReportUnifiedFindingForSignal("document_semantic_signal", "privacy.privacy_contact_path_present")?.id,
    "privacy_contact_path_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("document_semantic_signal", "privacy.gpc_disclosure_present")?.id,
    "gpc_disclosure_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("document_semantic_signal", "privacy.tracking_technologies_disclosure_present")?.id,
    "tracking_technologies_disclosure_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("document_semantic_signal", "privacy.targeted_advertising_disclosure_present")?.id,
    "targeted_advertising_disclosure_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("document_semantic_signal", "privacy.third_party_advertising_disclosure_present")?.id,
    "third_party_advertising_disclosure_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("document_semantic_signal", "privacy.behavioral_analytics_disclosure_present")?.id,
    "behavioral_analytics_disclosure_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("document_semantic_signal", "privacy.children_privacy_disclosure_present")?.id,
    "children_privacy_disclosure_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("document_semantic_signal", "commerce.arbitration_clause_present")?.id,
    "arbitration_clause_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "commerce.affiliate_disclosure_present")?.id,
    "affiliate_disclosure_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "accessibility.accessibility_contact_method_present")?.id,
    "accessibility_support_path_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "entity.legal_entity_name_text_present")?.id,
    "legal_entity_name_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "entity.contact_email_present")?.id,
    "operator_contact_path_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "entity.contact_phone_present")?.id,
    "operator_contact_path_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "entity.contact_form_present")?.id,
    "operator_contact_path_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "financial.risk_disclosure_text_present")?.id,
    "investment_risk_disclosure_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "financial.loss_risk_disclosure_text_present")?.id,
    "investment_risk_disclosure_present"
  );
  assert.equal(
    getReportUnifiedFindingForValidationRule("financial_review.legal_entity_name_present")?.id,
    "legal_entity_name_present"
  );
  assert.equal(
    getReportUnifiedFindingForValidationRule("financial_review.operator_contact_path_present")?.id,
    "operator_contact_path_present"
  );
  assert.equal(
    getReportUnifiedFindingForValidationRule("financial_review.investment_risk_disclosure_present")?.id,
    "investment_risk_disclosure_present"
  );
  assert.equal(
    getReportUnifiedFindingForValidationRule("financial_review.fee_disclosure_present")?.id,
    "fee_disclosure_present"
  );
  assert.equal(
    getReportUnifiedFindingForValidationRule("financial_review.past_performance_disclaimer_present")?.id,
    "past_performance_disclaimer_present"
  );
  assert.equal(
    getReportUnifiedFindingForValidationRule("financial_review.apr_or_interest_rate_disclosure_present")?.id,
    "apr_or_interest_rate_disclosure_present"
  );
  assert.equal(getReportUnifiedFindingForValidationRule("financial_review.guaranteed_outcome_claim_detected"), null);
  assert.equal(getReportUnifiedFindingForValidationRule("financial_review.earnings_claim_without_adjacent_disclosure"), null);
  assert.equal(
    getReportUnifiedFindingForValidationRule("financial_review.simulated_performance_without_disclosure")?.id,
    "simulated_performance_without_disclosure"
  );
  assert.equal(
    getReportUnifiedFindingForValidationRule("financial_review.unqualified_superlative_claim_detected")?.id,
    "unqualified_superlative_claim_detected"
  );
  assert.equal(
    getReportUnifiedFindingForValidationRule("financial_review.financial_urgency_pressure_tactic_detected")?.id,
    "financial_urgency_pressure_tactic_detected"
  );
  assert.equal(getReportUnifiedFindingForValidationRule("financial_review.pricing_or_fee_transparency_unclear"), null);
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "privacy.children_privacy_context_without_supporting_disclosure")?.id,
    "children_privacy_context_without_supporting_disclosure"
  );
  assert.equal(
    getReportUnifiedFindingForValidationRule("section_review.high_risk_product_without_local_loss_risk_disclosure")?.id,
    "high_risk_product_risk_disclosure_missing"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "financial.testimonial_or_review_block_near_financial_claim_present")?.id,
    "testimonial_endorsement_financial_promotion_risk"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "financial.guaranteed_return_language_present")?.id,
    "guaranteed_or_high_return_claims_present"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("snapshot_signal", "commerce.payment_card_input_present")?.id,
    "investment_purchase_by_credit_card_present"
  );
  assert.equal(
    getReportUnifiedFindingByAlias("Investment urgency or countdown present")?.id,
    "investment_urgency_countdown_present"
  );
  assert.equal(
    getReportUnifiedFindingByAlias("Regulator-operated mock scam example")?.id,
    "regulator_operated_mock_investment_example"
  );
});

test("maps CCPA/CPRA/CIPA-relevant privacy findings into the California regulatory overview", () => {
  const californiaFindingIds = new Set(
    getReportUnifiedFindingsForSection("ca_privacy_rights_controls_ccpa_cpra_cppa").map(({ finding }) => finding.id)
  );
  const expectedFindingIds = [
    "privacy_policy_present",
    "privacy_policy_missing_surface",
    "privacy_policy_unavailable",
    "data_categories_disclosure_missing",
    "third_party_recipient_disclosure_missing",
    "purpose_of_use_disclosure_missing",
    "cookie_policy_present",
    "cookie_policy_missing_surface",
    "cookie_policy_unavailable",
    "bounded_key_page_discovery_unresolved",
    "policy_clarity_risk",
    "privacy_contact_path_present",
    "missing_dsar_mechanism",
    "privacy_rights_path_present",
    "missing_dsar_high_exposure",
    "privacy_terms_conflict",
    "privacy_cookie_policy_conflict",
    "preconsent_tracking",
    "tracking_technologies_disclosure_present",
    "targeted_advertising_disclosure_present",
    "third_party_advertising_disclosure_present",
    "behavioral_analytics_disclosure_present",
    "children_privacy_context_without_supporting_disclosure",
    "children_privacy_disclosure_present",
    "fingerprinting_observed",
    "blocking_overlay_observed",
    "cpra_cba_opt_out_missing"
  ];

  assert.deepEqual(
    expectedFindingIds.filter((findingId) => !californiaFindingIds.has(findingId)),
    []
  );
});

test("registers financial sections, categories, and signals additively", () => {
  assert.deepEqual(getReportSection("financial_promotions_claims_disclosures"), {
    id: "financial_promotions_claims_disclosures",
    pillarId: "consumer_protection_commercial_practices",
    label: "Financial promotions, claims & disclosures",
    evidenceCategoryIds: [
      "consumer_financial_marketing_claims",
      "performance_claim_context_and_risk_disclosure",
      "disclosures_claim_substantiation"
    ]
  });

  assert.deepEqual(getReportEvidenceCategory("fee_disclosure_clarity"), {
    id: "fee_disclosure_clarity",
    sectionId: "fees_terms_pricing_transparency",
    label: "fee disclosure clarity"
  });

  assert.deepEqual(
    getReportSignalBySourceAndKey("snapshot_signal", "financial.guaranteed_return_language_present"),
    {
      id: "snapshot_signal:financial.guaranteed_return_language_present",
      source: "snapshot_signal",
      key: "financial.guaranteed_return_language_present",
      label: "Guaranteed return language present",
      primaryEvidenceCategoryId: "consumer_financial_marketing_claims",
      secondaryEvidenceCategoryIds: ["performance_claim_context_and_risk_disclosure"],
      overlayEvidenceCategoryIds: ["disclosures_claim_substantiation"]
    }
  );
  assert.deepEqual(
    getReportSignalBySourceAndKey("snapshot_signal", "commerce.payment_card_input_present"),
    {
      id: "snapshot_signal:commerce.payment_card_input_present",
      source: "snapshot_signal",
      key: "commerce.payment_card_input_present",
      label: "Payment card input detected",
      primaryEvidenceCategoryId: "checkout_payment_disclosures",
      secondaryEvidenceCategoryIds: ["collection_surface_entry_points_and_handling_context", "identity_financial_data_collection"],
      overlayEvidenceCategoryIds: ["subscription_billing_cancellation_fairness"]
    }
  );
});

test("returns category-, section-, and pillar-scoped unified findings from derived indexes", () => {
  assert.deepEqual(
    getReportUnifiedFindingsForEvidenceCategory("choice_symmetry_dark_pattern_indicators", "owner").map(
      ({ finding }) => finding.id
    ),
    [
      "paid_alternative_required_to_decline_tracking",
      "reject_button_missing",
      "accept_more_prominent_than_reject",
      "forced_consent_wall",
      "accept_only_banner",
      "dismiss_without_reject",
      "consent_control_not_reopenable",
      "popup_behavior_observed",
      "blocking_overlay_observed",
      "autoplay_media_observed"
    ]
  );

  assert.ok(
    getReportUnifiedFindingsForSection("tracking_third_party_ecosystem").some(
      ({ finding }) => finding.id === "preconsent_tracking"
    )
  );
  assert.equal(getReportUnifiedFindingByAlias("Third-party cookies before consent")?.id, "preconsent_tracking");
  assert.ok(
    getReportUnifiedFindingsForPillar("accessibility").some(
      ({ finding }) => finding.id === "accessibility_claim_mismatch"
    )
  );
});

test("returns unified findings by id and alias", () => {
  assert.equal(getReportUnifiedFinding("policy_behavior_conflict")?.label, "Policy/behavior conflict");
  assert.equal(getReportUnifiedFindingByAlias("Possible undisclosed session replay")?.id, "session_replay_undisclosed");
});

test("validation-rule lookup tolerates missing rule keys", () => {
  assert.equal(getReportUnifiedFindingForValidationRule(null), null);
  assert.equal(getReportUnifiedFindingForValidationRule(undefined), null);
  assert.equal(getReportUnifiedFindingForValidationRule(""), null);
});

test("keeps unified-finding signal and validation mappings unique", () => {
  const signalKeys = new Set<string>();
  const validationKeys = new Set<string>();

  for (const finding of REPORT_UNIFIED_FINDINGS) {
    for (const mapping of finding.signalMappings) {
      const key = `${mapping.source}:${mapping.key}`;
      assert.equal(signalKeys.has(key), false, `duplicate unified-finding signal mapping for ${key}`);
      signalKeys.add(key);
    }

    for (const ruleKey of finding.validationRuleKeys) {
      assert.equal(validationKeys.has(ruleKey), false, `duplicate unified-finding validation mapping for ${ruleKey}`);
      validationKeys.add(ruleKey);
    }
  }
});

test("unknown ids return null or an empty list", () => {
  assert.equal(getReportPrimaryPillar("privacy_policy_disclosure"), null);
  assert.equal(getReportSection("privacy_policy"), null);
  assert.equal(getReportEvidenceCategory("privacy_policy_present"), null);
  assert.equal(getReportSignal("snapshot_signal:security.hsts_enabled"), null);
  assert.deepEqual(getReportSectionsForPillar("privacy_policy_disclosure"), []);
  assert.deepEqual(getReportEvidenceCategoriesForSection("privacy_policy"), []);
  assert.deepEqual(getReportSignalEvidenceCategoryLinks("snapshot_signal:security.hsts_enabled"), []);
  assert.deepEqual(getReportSignalsForEvidenceCategory("security_headers_score"), []);
});
