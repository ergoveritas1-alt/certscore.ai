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
  assert.equal(REPORT_SECTIONS.length, 15);
  assert.ok(
    REPORT_SECTIONS.every((section) =>
      REPORT_PRIMARY_PILLARS.some((pillar) => pillar.id === section.pillarId && pillar.sectionIds.includes(section.id))
    )
  );
});

test("keeps each evidence category attached to exactly one section", () => {
  assert.equal(REPORT_EVIDENCE_CATEGORIES.length, 60);
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
  assert.equal(REPORT_UNIFIED_FINDINGS.length, 72);
  assert.ok(
    REPORT_UNIFIED_FINDINGS.every(
      (finding) => finding.categoryAlignments.filter((alignment) => alignment.relation === "owner").length === 1
    )
  );
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
      "policy_clarity_consistency_review"
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
      primaryEvidenceCategoryId: "collection_surface_entry_points",
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
      "snapshot_signal:privacy.consent_withdrawal_mechanism_present",
      "snapshot_signal:privacy.user_rights_friction_score",
      "policy_enrichment_signal:policyDsarMechanism",
      "snapshot_signal:privacy.privacy_contact_channel_missing",
      "policy_enrichment_signal:policyDoNotSell",
      "policy_enrichment_signal:privacy.policy_runtime_functional_misalignment_detected"
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
    getReportUnifiedFindingForSignal("runtime_artifact_signal", "privacy.gpc_signal_not_honored")?.id,
    "gpc_signal_not_honored"
  );
  assert.equal(
    getReportUnifiedFindingForSignal("runtime_artifact_signal", "privacy.weak_cookie_security_attributes_detected")?.id,
    "weak_cookie_security_attributes"
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
    getReportUnifiedFindingForSignal("snapshot_signal", "privacy.children_privacy_context_without_supporting_disclosure")?.id,
    "children_privacy_context_without_supporting_disclosure"
  );
});

test("returns category-, section-, and pillar-scoped unified findings from derived indexes", () => {
  assert.deepEqual(
    getReportUnifiedFindingsForEvidenceCategory("choice_symmetry_dark_pattern_indicators", "owner").map(
      ({ finding }) => finding.id
    ),
    [
      "reject_button_missing",
      "accept_more_prominent_than_reject",
      "forced_consent_wall",
      "accept_only_banner",
      "dismiss_without_reject"
    ]
  );

  assert.ok(
    getReportUnifiedFindingsForSection("tracking_third_party_ecosystem").some(
      ({ finding }) => finding.id === "preconsent_tracking"
    )
  );
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
