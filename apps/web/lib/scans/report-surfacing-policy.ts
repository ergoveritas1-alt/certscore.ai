import {
  REPORT_UNIFIED_FINDINGS,
  type ReportUnifiedFindingId
} from "../../../../packages/shared/src/taxonomy/report-pillars";
import type { UnifiedFindingPacket } from "./unified-findings";
import {
  REJECT_TRACKING_CONFIRMATION_MIN_MS_LABEL
} from "./reject-tracking-policy";
import {
  evaluateFindingEvidenceContractForPacket
} from "./finding-evidence-contracts";
import {
  deriveFingerprintEvidenceTier,
  hasStrongFingerprintingEvidence
} from "./promotion-evidence-contracts";
import {
  evaluateRuntimeVendorDisclosureEvidence,
  runtimeVendorDisclosureHasPromotionCategory
} from "./runtime-vendor-disclosure";

export const REPORT_SURFACING_POLICY_VERSION = "v1";

export type SurfacingDecisionState = "confirmed" | "review" | "support_only" | "material_incomplete" | "suppressed";
export type SurfacingReportLane = "main" | "confidence_and_coverage" | "suppressed";
export type SurfacingTier = "headline" | "section" | "secondary" | "support";

export type SurfacingPolicyFamily =
  | "positive_surface"
  | "coverage_gap"
  | "policy_extraction"
  | "rights_gap"
  | "contradiction"
  | "consent_tracking"
  | "sensitive_data"
  | "commercial"
  | "context"
  | "financial_promotion"
  | "accessibility";

export type SurfacingPolicyRuleId =
  | "family.positive_surface.default"
  | "family.coverage_gap.default"
  | "family.policy_extraction.default"
  | "family.rights_gap.default"
  | "family.contradiction.default"
  | "family.consent_tracking.default"
  | "family.sensitive_data.default"
  | "family.commercial.default"
  | "family.context.default"
  | "family.financial_promotion.default"
  | "family.accessibility.default"
  | "evidence.positive_surface.support_only"
  | "evidence.positive_surface.review_high_value_policy_path"
  | "evidence.positive_surface.review_high_value_privacy_disclosure"
  | "evidence.coverage_gap.keep_review"
  | "evidence.coverage_gap.confirmed_key_page_surface_missing"
  | "evidence.coverage_gap.review_key_page_fetch_failed"
  | "evidence.coverage_gap.degrade_with_unresolved_discovery"
  | "evidence.policy_extraction.keep_review"
  | "evidence.policy_extraction.review_surface_integrity"
  | "evidence.policy_extraction.review_disclosure_placement"
  | "evidence.policy_extraction.review_policy_fitness"
  | "evidence.rights_gap.confirmed_high_exposure_or_runtime"
  | "evidence.rights_gap.confirmed_structured_policy_absence"
  | "evidence.rights_gap.review_structured_policy_gap"
  | "evidence.contradiction.confirmed_when_explicit_basis_and_runtime"
  | "evidence.contradiction.review_without_complete_anchor"
  | "evidence.policy_runtime_alignment.review_bridge"
  | "evidence.preconsent.confirmed_when_validation_and_runtime_artifacts"
  | "evidence.preconsent.review_without_runtime_artifacts"
  | "evidence.preconsent.material_incomplete"
  | "evidence.consent_behavior.confirmed_specific_runtime_failure"
  | "evidence.consent_behavior.review_runtime_without_effect_evidence"
  | "evidence.consent_behavior.review_interface_or_design"
  | "evidence.consent_behavior.suppress_low_confidence_interface_context"
  | "evidence.consent_behavior.support_only_tracking_context"
  | "evidence.sensitive.confirmed_when_payload_or_runtime_backed"
  | "evidence.sensitive.review_when_context_only"
  | "evidence.normalized_concern.audit_only"
  | "evidence.accessibility.summary_review"
  | "evidence.accessibility.task_blocking_review"
  | "evidence.accessibility.suppress_score_only_context"
  | "evidence.financial.support_only_positive_context"
  | "evidence.financial.confirmed_negative_risk_with_backing"
  | "evidence.financial.review_claim_context"
  | "evidence.financial.review_when_context_limited"
  | "evidence.finding_contract.audit_only"
  | "evidence.finding_contract.suppressed"
  | "evidence.commercial.confirmed_when_runtime_or_structured"
  | "evidence.context.keep_review"
  | "precedence.specific_contradiction_supports_generic"
  | "precedence.contradiction_beats_generic_absence"
  | "precedence.specific_contradiction_supports_preconsent"
  | "precedence.present_surface_beats_weak_absence"
  | "precedence.sensitive_replay_beats_generic_replay"
  | "precedence.scan_level_sensitive_replay_beats_generic_replay"
  | "precedence.sensitive_replay_cooccurrence_beats_scan_level_copresence"
  | "precedence.task_blocking_beats_wcag_summary"
  | "precedence.blocking_overlay_supports_consent_risk"
  | "precedence.sensitive_tracking_combo_beats_generic_sensitivity"
  | "precedence.weak_cookie_attributes_supports_runtime_finding"
  | "precedence.regulator_mock_context_suppresses_generic_coverage"
  | "support.orphan_positive_surface_retained"
  | "support.orphan_support_promoted_to_review"
  | "support.orphan_support_suppressed"
  | "unknown.conservative_fallback";

export type UnifiedFindingSurfacingDecision = {
  appliedRules: SurfacingPolicyRuleId[];
  decisionReasons: string[];
  decisionState: SurfacingDecisionState;
  family: SurfacingPolicyFamily | "unknown";
  policyVersion: string;
  reportLane: SurfacingReportLane;
  reportable: boolean;
  surfaceTier: SurfacingTier;
  supportTargetId?: string;
  supportedBy?: string;
  suppressedBy?: string;
  supports: string[];
  unifiedFindingId: string;
  usedFamilyDefault: boolean;
  usedFindingOverride: boolean;
};

export type UnifiedFindingSupportLink = {
  appliedRule: SurfacingPolicyRuleId;
  primaryFindingId: string;
  reason: string;
  supportingFindingId: string;
};

export type UnifiedFindingSurfacingEvaluation = {
  debugDecisions: UnifiedFindingSurfacingDecision[];
  policyVersion: string;
  supportLinks: UnifiedFindingSupportLink[];
  surfacedFindings: UnifiedFindingSurfacingDecision[];
  suppressedFindings: UnifiedFindingSurfacingDecision[];
};

export type UnifiedFindingSurfacingPolicyEntry = {
  family: SurfacingPolicyFamily;
  findingId: ReportUnifiedFindingId;
  initialLane?: SurfacingReportLane;
  initialState?: Exclude<SurfacingDecisionState, "suppressed">;
  initialTier?: SurfacingTier;
  orphanedSupportFallback?: "review" | "suppressed";
};

type MutableDecision = Omit<UnifiedFindingSurfacingDecision, "reportable" | "supports" | "policyVersion"> & {
  supports: Set<string>;
};

type PolicyEvaluationContext = {
  allPacketsById: Map<string, UnifiedFindingPacket>;
  decision: MutableDecision;
  packet: UnifiedFindingPacket;
  policy: UnifiedFindingSurfacingPolicyEntry;
  siblingDecisionsById: Map<string, MutableDecision>;
};

type PrecedenceRule = {
  appliedRule: SurfacingPolicyRuleId;
  primaryFindingId: ReportUnifiedFindingId;
  reason: string;
  supportingFindingId: ReportUnifiedFindingId;
};

type ValidationIssue = {
  findingId?: string;
  issue: string;
};

type FamilyDefault = {
  lane: SurfacingReportLane;
  reason: string;
  ruleId: SurfacingPolicyRuleId;
  state: Exclude<SurfacingDecisionState, "suppressed">;
  tier: SurfacingTier;
};

const POSITIVE_SURFACE_IDS = [
  "privacy_policy_present",
  "terms_of_service_present",
  "cookie_policy_present",
  "contact_support_path_present",
  "privacy_rights_path_present",
  "privacy_contact_path_present",
  "targeted_advertising_choices_present",
  "gpc_disclosure_present",
  "tracking_technologies_disclosure_present",
  "affiliate_disclosure_present",
  "targeted_advertising_disclosure_present",
  "third_party_advertising_disclosure_present",
  "behavioral_analytics_disclosure_present",
  "children_privacy_disclosure_present",
  "arbitration_clause_present",
  "accessibility_support_path_present"
] as const satisfies ReportUnifiedFindingId[];

const COVERAGE_GAP_IDS = [
  "privacy_policy_missing_surface",
  "privacy_policy_unavailable",
  "terms_missing_surface",
  "terms_unavailable",
  "cookie_policy_missing_surface",
  "cookie_policy_unavailable",
  "accessibility_statement_missing_surface",
  "accessibility_statement_unavailable",
  "contact_page_missing_surface",
  "contact_page_unavailable",
  "bounded_key_page_discovery_unresolved"
] as const satisfies ReportUnifiedFindingId[];

const POLICY_EXTRACTION_IDS = [
  "low_confidence_policy_extraction",
  "policy_extraction_provider_error",
  "disclosure_likely_obstructed",
  "cookie_policy_structurally_obstructed",
  "surface_title_mismatch",
  "affiliate_disclosure_scope_limited",
  "policy_clarity_risk",
  "rule_only_policy_row_present"
] as const satisfies ReportUnifiedFindingId[];

const RIGHTS_GAP_IDS = [
  "data_categories_disclosure_missing",
  "third_party_recipient_disclosure_missing",
  "purpose_of_use_disclosure_missing",
  "missing_dsar_mechanism",
  "privacy_contact_channel_missing",
  "missing_dsar_high_exposure",
  "rights_fulfillment_friction",
  "cookie_disclosure_gap",
  "cross_border_vendor_disclosure_gap",
  "missing_transfer_disclosure",
  "cpra_cba_opt_out_missing",
  "sale_sharing_controls_missing"
] as const satisfies ReportUnifiedFindingId[];

const CONTRADICTION_IDS = [
  "policy_behavior_conflict",
  "consent_gated_tracking_claim_conflict",
  "do_not_sell_sharing_disclosure_conflict",
  "privacy_terms_conflict",
  "privacy_cookie_policy_conflict",
  "functional_misalignment",
  "session_replay_undisclosed"
] as const satisfies ReportUnifiedFindingId[];

const CONSENT_TRACKING_IDS = [
  "preconsent_tracking",
  "consent_mechanism_absent",
  "consent_surface_missing",
  "reject_did_not_reduce_tracking",
  "reject_did_not_reduce_third_party_cookies",
  "gpc_signal_not_honored",
  "weak_cookie_security_attributes",
  "cookie_retention_lifetime_review_signal",
  "consent_surface_required_deeper_sweep",
  "accept_flow_unavailable_after_reject",
  "reject_button_missing",
  "accept_more_prominent_than_reject",
  "forced_consent_wall",
  "accept_only_banner",
  "dismiss_without_reject",
  "consent_control_not_reopenable",
  "consent_governance_disclosure_gap",
  "session_replay_observed",
  "retargeting_pixel_observed",
  "video_content_tracking_exposure",
  "cross_domain_identifier_sharing_observed",
  "cross_border_endpoint_transfer_review_signal",
  "rtb_cookie_sync_observed",
  "pre_submit_text_capture_detected",
  "fingerprinting_observed"
] as const satisfies ReportUnifiedFindingId[];

const CONFIRMED_CONSENT_RUNTIME_FAILURE_IDS = [
  "reject_did_not_reduce_tracking",
  "reject_did_not_reduce_third_party_cookies",
  "gpc_signal_not_honored"
] as const satisfies ReportUnifiedFindingId[];

const REVIEW_ONLY_CONSENT_INTERFACE_IDS = [
  "consent_mechanism_absent",
  "consent_surface_missing",
  "consent_surface_required_deeper_sweep",
  "accept_flow_unavailable_after_reject",
  "reject_button_missing",
  "accept_more_prominent_than_reject",
  "forced_consent_wall",
  "accept_only_banner",
  "dismiss_without_reject",
  "consent_control_not_reopenable",
  "consent_governance_disclosure_gap"
] as const satisfies ReportUnifiedFindingId[];

const SUPPORT_ONLY_CONSENT_TRACKING_CONTEXT_IDS = [
  "session_replay_observed",
  "retargeting_pixel_observed"
] as const satisfies ReportUnifiedFindingId[];

const SENSITIVE_DATA_IDS = [
  "possible_session_replay_on_sensitive_input_surface",
  "session_replay_present_with_sensitive_surfaces_observed",
  "sensitive_data_collection_with_third_party_tracking_present",
  "sensitive_collection_surface_observed",
  "minors_or_age_gated_collection_context",
  "children_privacy_context_without_supporting_disclosure"
] as const satisfies ReportUnifiedFindingId[];

const COMMERCIAL_IDS = [
  "discount_claim_present",
  "original_price_comparison_present",
  "limited_time_pressure",
  "store_credit_only_remedy",
  "restrictive_termination_or_suspension_terms",
  "account_exit_terms_missing",
  "cancellation_method_disclosure_missing"
] as const satisfies ReportUnifiedFindingId[];

const ACCESSIBILITY_IDS = [
  "wcag_issue_summary",
  "contrast_failures",
  "focus_management_issue",
  "form_label_issues",
  "critical_form_completion_barrier",
  "keyboard_navigation_accessibility_issue",
  "link_name_issues",
  "keyboard_navigation_issues",
  "keyboard_only_task_completion_blocked",
  "focus_indicator_issues",
  "semantic_labeling_accessibility_issue",
  "text_alternative_accessibility_issue",
  "visual_contrast_accessibility_issue",
  "landmark_issues",
  "aria_issues",
  "accessibility_claim_mismatch",
  "accessibility_support_path_missing"
] as const satisfies ReportUnifiedFindingId[];

const CONTEXT_IDS = [
  "regulator_operated_mock_investment_example",
  "scan_quality_visual_artifact_missing",
  "scan_quality_visual_no_go",
  "scan_quality_visual_degraded",
  "popup_behavior_observed",
  "blocking_overlay_observed",
  "autoplay_media_observed"
] as const satisfies ReportUnifiedFindingId[];

const FINANCIAL_PROMOTION_IDS = [
  "legal_entity_name_present",
  "operator_contact_path_present",
  "investment_risk_disclosure_present",
  "fee_disclosure_present",
  "past_performance_disclaimer_present",
  "apr_or_interest_rate_disclosure_present",
  "performance_claims_without_context",
  "guaranteed_or_high_return_claims_present",
  "investment_risk_disclosure_missing",
  "hypothetical_performance_disclosure_missing",
  "testimonial_endorsement_financial_promotion_risk",
  "investment_purchase_by_credit_card_present",
  "investment_urgency_countdown_present",
  "pump_and_dump_language_present",
  "vague_whitepaper_or_technical_obfuscation_present",
  "registration_identifier_missing",
  "registration_claim_support_missing",
  "entity_naming_consistency_conflict",
  "fee_disclosure_missing_or_opaque",
  "material_terms_hard_to_locate",
  "promo_to_terms_conflict",
  "yield_or_return_claims_high_risk",
  "high_risk_product_risk_disclosure_missing",
  "ai_financial_advice_or_trading_claims_without_disclosure"
] as const satisfies ReportUnifiedFindingId[];

const CONFIRMED_RIGHTS_GAP_IDS = [
  "cpra_cba_opt_out_missing",
  "missing_dsar_high_exposure",
  "sale_sharing_controls_missing"
] as const satisfies ReportUnifiedFindingId[];

const WEAK_REVIEW_RIGHTS_GAP_IDS = [
  "cookie_disclosure_gap",
  "cross_border_vendor_disclosure_gap",
  "missing_dsar_mechanism",
  "missing_transfer_disclosure",
  "privacy_contact_channel_missing"
] as const satisfies ReportUnifiedFindingId[];

const SUPPORT_ONLY_FINANCIAL_CONTEXT_IDS = [
  "legal_entity_name_present",
  "operator_contact_path_present",
  "investment_risk_disclosure_present",
  "fee_disclosure_present",
  "past_performance_disclaimer_present",
  "apr_or_interest_rate_disclosure_present"
] as const satisfies ReportUnifiedFindingId[];

const NEGATIVE_FINANCIAL_RISK_IDS = [
  "financial_urgency_pressure_tactic_detected",
  "performance_claims_without_context",
  "guaranteed_or_high_return_claims_present",
  "investment_risk_disclosure_missing",
  "hypothetical_performance_disclosure_missing",
  "testimonial_endorsement_financial_promotion_risk",
  "investment_purchase_by_credit_card_present",
  "investment_urgency_countdown_present",
  "pump_and_dump_language_present",
  "vague_whitepaper_or_technical_obfuscation_present",
  "registration_identifier_missing",
  "registration_claim_support_missing",
  "entity_naming_consistency_conflict",
  "fee_disclosure_missing_or_opaque",
  "material_terms_hard_to_locate",
  "promo_to_terms_conflict",
  "yield_or_return_claims_high_risk",
  "high_risk_product_risk_disclosure_missing",
  "ai_financial_advice_or_trading_claims_without_disclosure",
  "simulated_performance_without_disclosure",
  "unqualified_superlative_claim_detected"
] as const satisfies ReportUnifiedFindingId[];

const FAMILY_DEFAULTS: Record<SurfacingPolicyFamily, FamilyDefault> = {
  positive_surface: {
    lane: "confidence_and_coverage",
    reason: "Positive-presence findings are not part of the current ranked findings model and should remain hidden unless they support a stronger narrative.",
    ruleId: "family.positive_surface.default",
    state: "support_only",
    tier: "support"
  },
  coverage_gap: {
    lane: "confidence_and_coverage",
    reason: "Coverage-gap findings surface by default as uncertainty or reachability issues rather than confirmed substantive failures.",
    ruleId: "family.coverage_gap.default",
    state: "review",
    tier: "section"
  },
  policy_extraction: {
    lane: "confidence_and_coverage",
    reason: "Extraction and obstruction findings belong in confidence-and-coverage unless stronger evidence proves a substantive failure.",
    ruleId: "family.policy_extraction.default",
    state: "review",
    tier: "section"
  },
  rights_gap: {
    lane: "main",
    reason: "Disclosure and rights-gap findings belong in the main narrative, but stay conservative until evidence is stronger.",
    ruleId: "family.rights_gap.default",
    state: "review",
    tier: "section"
  },
  contradiction: {
    lane: "main",
    reason: "Contradiction findings are main-narrative candidates, but must earn confirmation through explicit supporting evidence.",
    ruleId: "family.contradiction.default",
    state: "review",
    tier: "headline"
  },
  consent_tracking: {
    lane: "main",
    reason: "Consent and tracking findings are main-narrative candidates, with stronger runtime evidence needed for confirmation.",
    ruleId: "family.consent_tracking.default",
    state: "review",
    tier: "section"
  },
  sensitive_data: {
    lane: "main",
    reason: "Sensitive-data findings are important enough to surface in the main report, but remain conservative unless payload or runtime evidence is strong.",
    ruleId: "family.sensitive_data.default",
    state: "review",
    tier: "section"
  },
  commercial: {
    lane: "main",
    reason: "Commercial-practice findings belong in the main report, with confirmation depending on concrete supporting evidence.",
    ruleId: "family.commercial.default",
    state: "review",
    tier: "secondary"
  },
  context: {
    lane: "confidence_and_coverage",
    reason: "Context findings should remain visible, but usually as scan context rather than lead risk findings.",
    ruleId: "family.context.default",
    state: "review",
    tier: "secondary"
  },
  financial_promotion: {
    lane: "main",
    reason: "Financial-promotion findings belong in the main report, but should stay conservative until financial context and retained evidence are clear.",
    ruleId: "family.financial_promotion.default",
    state: "review",
    tier: "section"
  },
  accessibility: {
    lane: "main",
    reason: "Accessibility findings belong in the main report, with task-blocking patterns receiving stronger prominence than general summaries.",
    ruleId: "family.accessibility.default",
    state: "review",
    tier: "secondary"
  }
};

function createPolicyEntries<const TIds extends readonly ReportUnifiedFindingId[]>(
  ids: TIds,
  template: Omit<UnifiedFindingSurfacingPolicyEntry, "findingId">
) {
  return Object.fromEntries(ids.map((id) => [id, { findingId: id, ...template }])) as Record<TIds[number], UnifiedFindingSurfacingPolicyEntry>;
}

export const UNIFIED_FINDING_SURFACING_POLICY_REGISTRY: Record<ReportUnifiedFindingId, UnifiedFindingSurfacingPolicyEntry> = {
  ...createPolicyEntries(POSITIVE_SURFACE_IDS, {
    family: "positive_surface",
    initialState: "support_only",
    initialTier: "support",
    initialLane: "confidence_and_coverage",
    orphanedSupportFallback: "suppressed"
  }),
  ...createPolicyEntries(COVERAGE_GAP_IDS, {
    family: "coverage_gap",
    initialState: "review",
    initialTier: "section",
    initialLane: "confidence_and_coverage"
  }),
  ...createPolicyEntries(POLICY_EXTRACTION_IDS, {
    family: "policy_extraction",
    initialState: "review",
    initialTier: "section",
    initialLane: "confidence_and_coverage"
  }),
  ...createPolicyEntries(RIGHTS_GAP_IDS, {
    family: "rights_gap",
    initialState: "review",
    initialTier: "section",
    initialLane: "main"
  }),
  ...createPolicyEntries(CONTRADICTION_IDS, {
    family: "contradiction",
    initialState: "review",
    initialTier: "headline",
    initialLane: "main"
  }),
  ...createPolicyEntries(CONSENT_TRACKING_IDS, {
    family: "consent_tracking",
    initialState: "review",
    initialTier: "section",
    initialLane: "main"
  }),
  ...createPolicyEntries(SENSITIVE_DATA_IDS, {
    family: "sensitive_data",
    initialState: "review",
    initialTier: "section",
    initialLane: "main"
  }),
  ...createPolicyEntries(COMMERCIAL_IDS, {
    family: "commercial",
    initialState: "review",
    initialTier: "secondary",
    initialLane: "main"
  }),
  ...createPolicyEntries(ACCESSIBILITY_IDS, {
    family: "accessibility",
    initialState: "review",
    initialTier: "secondary",
    initialLane: "main"
  }),
  ...createPolicyEntries(CONTEXT_IDS, {
    family: "context",
    initialState: "review",
    initialTier: "secondary",
    initialLane: "confidence_and_coverage"
  }),
  ...createPolicyEntries(FINANCIAL_PROMOTION_IDS, {
    family: "financial_promotion",
    initialState: "review",
    initialTier: "section",
    initialLane: "main"
  }),

  policy_behavior_conflict: {
    findingId: "policy_behavior_conflict",
    family: "contradiction",
    initialState: "review",
    initialTier: "headline",
    initialLane: "main"
  },
  preconsent_tracking: {
    findingId: "preconsent_tracking",
    family: "consent_tracking",
    initialState: "review",
    initialTier: "headline",
    initialLane: "main",
    orphanedSupportFallback: "suppressed"
  },
  weak_cookie_security_attributes: {
    findingId: "weak_cookie_security_attributes",
    family: "consent_tracking",
    initialState: "support_only",
    initialTier: "support",
    initialLane: "confidence_and_coverage"
  },
  reject_did_not_reduce_tracking: {
    findingId: "reject_did_not_reduce_tracking",
    family: "consent_tracking",
    initialState: "review",
    initialTier: "headline",
    initialLane: "main"
  },
  consent_gated_tracking_claim_conflict: {
    findingId: "consent_gated_tracking_claim_conflict",
    family: "contradiction",
    initialState: "review",
    initialTier: "headline",
    initialLane: "main",
    orphanedSupportFallback: "suppressed"
  },
  session_replay_observed: {
    findingId: "session_replay_observed",
    family: "consent_tracking",
    initialState: "support_only",
    initialTier: "support",
    initialLane: "main",
    orphanedSupportFallback: "suppressed"
  },
  retargeting_pixel_observed: {
    findingId: "retargeting_pixel_observed",
    family: "consent_tracking",
    initialState: "support_only",
    initialTier: "support",
    initialLane: "main",
    orphanedSupportFallback: "suppressed"
  },
  video_content_tracking_exposure: {
    findingId: "video_content_tracking_exposure",
    family: "consent_tracking",
    initialState: "review",
    initialTier: "headline",
    initialLane: "main"
  },
  cross_domain_identifier_sharing_observed: {
    findingId: "cross_domain_identifier_sharing_observed",
    family: "consent_tracking",
    initialState: "confirmed",
    initialTier: "headline",
    initialLane: "main"
  },
  cross_border_endpoint_transfer_review_signal: {
    findingId: "cross_border_endpoint_transfer_review_signal",
    family: "consent_tracking",
    initialState: "review",
    initialTier: "section",
    initialLane: "main"
  },
  cross_border_vendor_disclosure_gap: {
    findingId: "cross_border_vendor_disclosure_gap",
    family: "rights_gap",
    initialState: "review",
    initialTier: "section",
    initialLane: "main"
  },
  session_replay_undisclosed: {
    findingId: "session_replay_undisclosed",
    family: "contradiction",
    initialState: "review",
    initialTier: "section",
    initialLane: "main"
  },
  possible_session_replay_on_sensitive_input_surface: {
    findingId: "possible_session_replay_on_sensitive_input_surface",
    family: "sensitive_data",
    initialState: "review",
    initialTier: "headline",
    initialLane: "main"
  },
  session_replay_present_with_sensitive_surfaces_observed: {
    findingId: "session_replay_present_with_sensitive_surfaces_observed",
    family: "sensitive_data",
    initialState: "review",
    initialTier: "headline",
    initialLane: "main"
  },
  privacy_policy_missing_surface: {
    findingId: "privacy_policy_missing_surface",
    family: "coverage_gap",
    initialState: "review",
    initialTier: "section",
    initialLane: "confidence_and_coverage"
  },
  terms_missing_surface: {
    findingId: "terms_missing_surface",
    family: "coverage_gap",
    initialState: "review",
    initialTier: "section",
    initialLane: "confidence_and_coverage"
  },
  bounded_key_page_discovery_unresolved: {
    findingId: "bounded_key_page_discovery_unresolved",
    family: "coverage_gap",
    initialState: "review",
    initialTier: "headline",
    initialLane: "confidence_and_coverage"
  },
  disclosure_likely_obstructed: {
    findingId: "disclosure_likely_obstructed",
    family: "policy_extraction",
    initialState: "review",
    initialTier: "headline",
    initialLane: "confidence_and_coverage"
  },
  surface_title_mismatch: {
    findingId: "surface_title_mismatch",
    family: "policy_extraction",
    initialState: "review",
    initialTier: "section",
    initialLane: "confidence_and_coverage"
  },
  affiliate_disclosure_scope_limited: {
    findingId: "affiliate_disclosure_scope_limited",
    family: "policy_extraction",
    initialState: "review",
    initialTier: "section",
    initialLane: "confidence_and_coverage"
  },
  missing_dsar_high_exposure: {
    findingId: "missing_dsar_high_exposure",
    family: "rights_gap",
    initialState: "review",
    initialTier: "section",
    initialLane: "main"
  },
  sale_sharing_controls_missing: {
    findingId: "sale_sharing_controls_missing",
    family: "rights_gap",
    initialState: "review",
    initialTier: "section",
    initialLane: "main"
  },
  cpra_cba_opt_out_missing: {
    findingId: "cpra_cba_opt_out_missing",
    family: "rights_gap",
    initialState: "review",
    initialTier: "section",
    initialLane: "main"
  },
  sensitive_data_collection_with_third_party_tracking_present: {
    findingId: "sensitive_data_collection_with_third_party_tracking_present",
    family: "sensitive_data",
    initialState: "review",
    initialTier: "headline",
    initialLane: "main"
  },
  sensitive_collection_surface_observed: {
    findingId: "sensitive_collection_surface_observed",
    family: "sensitive_data",
    initialState: "support_only",
    initialTier: "support",
    initialLane: "confidence_and_coverage"
  },
  keyboard_only_task_completion_blocked: {
    findingId: "keyboard_only_task_completion_blocked",
    family: "accessibility",
    initialState: "review",
    initialTier: "section",
    initialLane: "main"
  },
  critical_form_completion_barrier: {
    findingId: "critical_form_completion_barrier",
    family: "accessibility",
    initialState: "review",
    initialTier: "section",
    initialLane: "main"
  },
  wcag_issue_summary: {
    findingId: "wcag_issue_summary",
    family: "accessibility",
    initialState: "review",
    initialTier: "secondary",
    initialLane: "main"
  },
  accessibility_risk_score: {
    findingId: "accessibility_risk_score",
    family: "accessibility",
    initialState: "support_only",
    initialTier: "support",
    initialLane: "confidence_and_coverage"
  },
  guaranteed_or_high_return_claims_present: {
    findingId: "guaranteed_or_high_return_claims_present",
    family: "financial_promotion",
    initialState: "review",
    initialTier: "headline",
    initialLane: "main"
  },
  simulated_performance_without_disclosure: {
    findingId: "simulated_performance_without_disclosure",
    family: "financial_promotion",
    initialState: "review",
    initialTier: "section",
    initialLane: "main"
  },
  unqualified_superlative_claim_detected: {
    findingId: "unqualified_superlative_claim_detected",
    family: "financial_promotion",
    initialState: "review",
    initialTier: "section",
    initialLane: "main"
  },
  financial_urgency_pressure_tactic_detected: {
    findingId: "financial_urgency_pressure_tactic_detected",
    family: "financial_promotion",
    initialState: "review",
    initialTier: "section",
    initialLane: "main"
  },
  investment_risk_disclosure_missing: {
    findingId: "investment_risk_disclosure_missing",
    family: "financial_promotion",
    initialState: "review",
    initialTier: "section",
    initialLane: "main"
  },
  legal_entity_name_present: {
    findingId: "legal_entity_name_present",
    family: "financial_promotion",
    initialState: "support_only",
    initialTier: "support",
    initialLane: "main",
    orphanedSupportFallback: "suppressed"
  },
  operator_contact_path_present: {
    findingId: "operator_contact_path_present",
    family: "financial_promotion",
    initialState: "support_only",
    initialTier: "support",
    initialLane: "main",
    orphanedSupportFallback: "suppressed"
  },
  investment_risk_disclosure_present: {
    findingId: "investment_risk_disclosure_present",
    family: "financial_promotion",
    initialState: "support_only",
    initialTier: "support",
    initialLane: "main",
    orphanedSupportFallback: "suppressed"
  },
  fee_disclosure_present: {
    findingId: "fee_disclosure_present",
    family: "financial_promotion",
    initialState: "support_only",
    initialTier: "support",
    initialLane: "main",
    orphanedSupportFallback: "suppressed"
  },
  past_performance_disclaimer_present: {
    findingId: "past_performance_disclaimer_present",
    family: "financial_promotion",
    initialState: "support_only",
    initialTier: "support",
    initialLane: "main",
    orphanedSupportFallback: "suppressed"
  },
  apr_or_interest_rate_disclosure_present: {
    findingId: "apr_or_interest_rate_disclosure_present",
    family: "financial_promotion",
    initialState: "support_only",
    initialTier: "support",
    initialLane: "main",
    orphanedSupportFallback: "suppressed"
  }
};

const EXPLICIT_PRECEDENCE_RULES: PrecedenceRule[] = [
  {
    appliedRule: "precedence.specific_contradiction_supports_generic",
    primaryFindingId: "consent_gated_tracking_claim_conflict",
    reason: "A more specific contradiction should carry the lead narrative while the generic contradiction remains supporting context.",
    supportingFindingId: "policy_behavior_conflict"
  },
  {
    appliedRule: "precedence.specific_contradiction_supports_generic",
    primaryFindingId: "do_not_sell_sharing_disclosure_conflict",
    reason: "A more specific contradiction should carry the lead narrative while the generic contradiction remains supporting context.",
    supportingFindingId: "policy_behavior_conflict"
  },
  {
    appliedRule: "precedence.specific_contradiction_supports_generic",
    primaryFindingId: "privacy_terms_conflict",
    reason: "A more specific contradiction should carry the lead narrative while the generic contradiction remains supporting context.",
    supportingFindingId: "policy_behavior_conflict"
  },
  {
    appliedRule: "precedence.specific_contradiction_supports_generic",
    primaryFindingId: "privacy_cookie_policy_conflict",
    reason: "A more specific contradiction should carry the lead narrative while the generic contradiction remains supporting context.",
    supportingFindingId: "policy_behavior_conflict"
  },
  {
    appliedRule: "precedence.specific_contradiction_supports_generic",
    primaryFindingId: "functional_misalignment",
    reason: "A more specific contradiction should carry the lead narrative while the generic contradiction remains supporting context.",
    supportingFindingId: "policy_behavior_conflict"
  },
  {
    appliedRule: "precedence.specific_contradiction_supports_generic",
    primaryFindingId: "session_replay_undisclosed",
    reason: "A more specific contradiction should carry the lead narrative while the generic contradiction remains supporting context.",
    supportingFindingId: "policy_behavior_conflict"
  },
  {
    appliedRule: "precedence.specific_contradiction_supports_preconsent",
    primaryFindingId: "consent_gated_tracking_claim_conflict",
    reason: "A consent-gating contradiction is the clearer lead story, so generic pre-consent tracking should become supporting context.",
    supportingFindingId: "preconsent_tracking"
  },
  {
    appliedRule: "precedence.weak_cookie_attributes_supports_runtime_finding",
    primaryFindingId: "preconsent_tracking",
    reason: "Weak cookie attributes should support stronger cookie-before-consent findings rather than lead the narrative by default.",
    supportingFindingId: "weak_cookie_security_attributes"
  },
  {
    appliedRule: "precedence.weak_cookie_attributes_supports_runtime_finding",
    primaryFindingId: "sensitive_data_collection_with_third_party_tracking_present",
    reason: "Weak cookie attributes should support sensitive-data tracking findings when both are present.",
    supportingFindingId: "weak_cookie_security_attributes"
  },
  {
    appliedRule: "precedence.weak_cookie_attributes_supports_runtime_finding",
    primaryFindingId: "cookie_disclosure_gap",
    reason: "Weak cookie attributes should support cookie-disclosure gaps when both are present.",
    supportingFindingId: "weak_cookie_security_attributes"
  },
  {
    appliedRule: "precedence.sensitive_replay_beats_generic_replay",
    primaryFindingId: "possible_session_replay_on_sensitive_input_surface",
    reason: "The possible sensitive-input replay finding is more specific and should lead, while generic replay disclosure mismatch remains supporting context.",
    supportingFindingId: "session_replay_undisclosed"
  },
  {
    appliedRule: "precedence.scan_level_sensitive_replay_beats_generic_replay",
    primaryFindingId: "session_replay_present_with_sensitive_surfaces_observed",
    reason: "Scan-level replay plus sensitive-surface evidence is more specific than generic replay context.",
    supportingFindingId: "session_replay_undisclosed"
  },
  {
    appliedRule: "precedence.sensitive_replay_cooccurrence_beats_scan_level_copresence",
    primaryFindingId: "possible_session_replay_on_sensitive_input_surface",
    reason: "Same-surface replay co-occurrence evidence is stronger than scan-level replay and sensitive-surface co-presence.",
    supportingFindingId: "session_replay_present_with_sensitive_surfaces_observed"
  },
  {
    appliedRule: "precedence.task_blocking_beats_wcag_summary",
    primaryFindingId: "keyboard_only_task_completion_blocked",
    reason: "A task-completion accessibility finding should lead over a generic WCAG summary.",
    supportingFindingId: "wcag_issue_summary"
  },
  {
    appliedRule: "precedence.task_blocking_beats_wcag_summary",
    primaryFindingId: "critical_form_completion_barrier",
    reason: "A task-completion accessibility finding should lead over a generic WCAG summary.",
    supportingFindingId: "wcag_issue_summary"
  },
  {
    appliedRule: "precedence.blocking_overlay_supports_consent_risk",
    primaryFindingId: "forced_consent_wall",
    reason: "A blocking overlay is supporting consent-context evidence when a forced consent or cookie-wall finding carries the main narrative.",
    supportingFindingId: "blocking_overlay_observed"
  },
  {
    appliedRule: "precedence.blocking_overlay_supports_consent_risk",
    primaryFindingId: "accept_only_banner",
    reason: "A blocking overlay is supporting consent-context evidence when the choice surface lacks a reject or manage path.",
    supportingFindingId: "blocking_overlay_observed"
  },
  {
    appliedRule: "precedence.blocking_overlay_supports_consent_risk",
    primaryFindingId: "reject_button_missing",
    reason: "A blocking overlay is supporting consent-context evidence when the reject path is missing or hidden.",
    supportingFindingId: "blocking_overlay_observed"
  },
  {
    appliedRule: "precedence.blocking_overlay_supports_consent_risk",
    primaryFindingId: "accept_more_prominent_than_reject",
    reason: "A blocking overlay is supporting consent-context evidence when accept and reject paths appear imbalanced.",
    supportingFindingId: "blocking_overlay_observed"
  },
  {
    appliedRule: "precedence.blocking_overlay_supports_consent_risk",
    primaryFindingId: "preconsent_tracking",
    reason: "A blocking overlay is supporting runtime context when tracking began while the choice surface was unresolved.",
    supportingFindingId: "blocking_overlay_observed"
  },
  {
    appliedRule: "precedence.contradiction_beats_generic_absence",
    primaryFindingId: "policy_behavior_conflict",
    reason: "A contradiction should lead over a generic missing-surface absence finding in the same scan.",
    supportingFindingId: "privacy_policy_missing_surface"
  },
  {
    appliedRule: "precedence.contradiction_beats_generic_absence",
    primaryFindingId: "policy_behavior_conflict",
    reason: "A contradiction should lead over a generic missing-surface absence finding in the same scan.",
    supportingFindingId: "terms_missing_surface"
  }
];

function hasConcreteHumanFacingUrl(urls: string[] | undefined) {
  return (urls ?? []).some((url) => /^https?:\/\//i.test(url));
}

function getEvidenceCount(packet: UnifiedFindingPacket, keys: string[]) {
  for (const key of keys) {
    const value = packet.evidence?.counts?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function getEvidenceEntityValuesForKeys(packet: UnifiedFindingPacket, keys: string[]) {
  return keys.flatMap((key) => getEvidenceEntityValues(packet, key));
}

function normalizeComparableUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.hostname.toLowerCase()}${pathname}`;
  } catch {
    return value.trim().toLowerCase();
  }
}

function hasReadableSnippet(packet: UnifiedFindingPacket) {
  return (
    packet.confidenceInputs.hasReadableSurfaceSnippetEvidence ||
    (packet.evidence?.snippets?.some((snippet) => typeof snippet === "string" && snippet.trim().length > 0) ?? false)
  );
}

function hasSubstantiveReadableSnippet(packet: UnifiedFindingPacket) {
  return packet.evidence?.snippets?.some((snippet) => {
    if (typeof snippet !== "string") {
      return false;
    }
    const normalized = snippet.trim();
    return normalized.length >= 40 && normalized.toLowerCase() !== "nano";
  }) ?? false;
}

function hasNonPlaceholderSnippet(packet: UnifiedFindingPacket) {
  return packet.evidence?.snippets?.some((snippet) => {
    if (typeof snippet !== "string") {
      return false;
    }
    const normalized = snippet.trim();
    return normalized.length > 0 && normalized.toLowerCase() !== "nano";
  }) ?? false;
}

function getEvidenceSnippetText(packet: UnifiedFindingPacket) {
  return (packet.evidence?.snippets ?? []).filter((snippet): snippet is string => typeof snippet === "string").join(" ");
}

function hasConcretePrivacyContactCue(value: string) {
  return /(?:privacy|dpo|data[-_\s]?protection)[\w.+-]*@[a-z0-9.-]+\.[a-z]{2,}|data protection officer|\bdpo\b|privacy (?:team|office|department)|(?:privacy|personal information|personal data|data protection).{0,80}(?:request form|webform|portal|request portal|contact form)|(?:request form|webform|portal|request portal|contact form).{0,80}(?:privacy|personal information|personal data|data protection)|contact us.{0,160}(?:privacy practices?|privacy questions?|personal information|rights? request)|(?:privacy practices?|privacy questions?|personal information|rights? request).{0,160}contact us/i.test(
    value
  );
}

function hasSubstantivePrivacyPolicyContent(value: string) {
  return (
    /personal information|personal data|covered personal information|data subjects?|privacy rights?|right to (?:know|access|delete|correct)|data protection/i.test(value) &&
    /collect|use|share|disclos|retain|protect|process|access|delete|correct|opt[-\s]?out|sell|transfer|request/i.test(value)
  );
}

function getEvidenceEntityValues(packet: UnifiedFindingPacket, key: string) {
  return (packet.evidence?.entities?.[key] ?? []).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function hasMeaningfulEntityValue(packet: UnifiedFindingPacket, key: string) {
  return getEvidenceEntityValues(packet, key).some((value) => !/^(?:none|unknown|absent|null|generic)$/i.test(value.trim()));
}

function hasFindingSpecificHighValuePrivacyDisclosureText(packet: UnifiedFindingPacket) {
  const text = getEvidenceSnippetText(packet);

  switch (packet.unifiedFindingId) {
    case "behavioral_analytics_disclosure_present":
      return /behavioral analytics|behavioural analytics|session replay|session recording|heat ?map|product analytics|hotjar|fullstory|mouseflow|contentsquare|microsoft clarity|google analytics.{0,160}(?:behavioral data|track (?:your )?use|understand how (?:visitors?|users?) use)|analytics tools?.{0,120}(?:understand|measure|analy[sz]e).{0,120}(?:visitors?|users?|use of (?:our )?(?:services?|site|website))/i.test(
        text
      );
    case "gpc_disclosure_present":
      return /global privacy control|\bGPC\b|privacy preference signal/i.test(text);
    case "tracking_technologies_disclosure_present":
      return /tracking technolog(?:y|ies)|cookies? and similar technolog(?:y|ies)|pixels?|web beacons?|tags?|tracking scripts?/i.test(text);
    case "targeted_advertising_disclosure_present":
      return /targeted advertis(?:e|ing)|interest-based advertis(?:e|ing)|personalized ads?|cross-context behavioral advertis(?:e|ing)/i.test(text);
    case "third_party_advertising_disclosure_present":
      return /third-party advertis(?:e|ing)|advertising partners?|ad networks?|outside advertising partners?/i.test(text);
    default:
      return false;
  }
}

function isLikelySubstantiveCookiePolicyUrl(value: string | null | undefined) {
  if (!value || !/^https?:\/\//i.test(value)) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase().replace(/\/+$/, "") || "/";
    const pathAndQuery = `${path}${parsed.search.toLowerCase()}`;

    if (path === "/" || host === "www.cookieyes.com" && path.startsWith("/product/")) {
      return false;
    }

    return /cookie|privacy-choices|privacychoices|cookie-settings|cookie-preferences/.test(pathAndQuery);
  } catch {
    return /\/.+(?:cookie|privacy-choices|privacychoices|cookie-settings|cookie-preferences)/i.test(value);
  }
}

function hasSubstantiveCookiePolicySurfaceEvidence(packet: UnifiedFindingPacket) {
  if (packet.unifiedFindingId !== "cookie_policy_present") {
    return false;
  }

  const evidenceText = getEvidenceSnippetText(packet);
  const urls = [...(packet.evidence?.pageUrls ?? []), ...(packet.evidence?.sourceUrls ?? [])];

  return (
    packet.confidenceInputs.hasPolicyTextEvidence &&
    hasReadableSnippet(packet) &&
    /cookie policy|cookie notice|cookie statement|cookie settings|cookie consent center|manage cookies|cookie preferences|cookies? and similar technolog(?:y|ies)|tracking technolog(?:y|ies)/i.test(
      evidenceText
    ) &&
    urls.some(isLikelySubstantiveCookiePolicyUrl)
  );
}

function hasFindingSpecificPrivacyPathText(packet: UnifiedFindingPacket) {
  const text = getEvidenceSnippetText(packet);

  switch (packet.unifiedFindingId) {
    case "privacy_rights_path_present":
      return (
        /(?:privacy rights|rights (?:portal|center)|privacy (?:portal|center|request)|(?:access|delete|deletion|correction|opt-out|data) request|request (?:access|deletion|correction|a copy)|submit (?:a )?request|exercise (?:your )?rights|privacy@|data protection officer|\bdpo\b|webform|request form)/i.test(
          text
        ) ||
        hasMeaningfulEntityValue(packet, "policyDsarMechanism") ||
        getEvidenceEntityValues(packet, "policyRightsSignals").some((value) =>
          /access|delete|deletion|correct|correction|export|portable|opt[-_\s]?out|privacy_controls|privacy_contact|authorized_agent|appeal/i.test(
            value
          )
        )
      );
    case "privacy_contact_path_present":
      return (
        /privacy@|privacy (?:team|office|department|request|contact|form|portal|preferences?)|(?:about|regarding|concerning) privacy|data protection officer|\bdpo\b|privacy rights|personal information (?:request|questions?|contact|preferences?)|data (?:request|protection|privacy)|contact us.{0,120}(?:privacy|personal information)|(?:privacy|personal information).{0,120}contact us/i.test(
          text
        ) ||
        (
          hasMeaningfulEntityValue(packet, "privacyContactChannelType") &&
          /privacy|personal information|personal data|data protection|contact|request/i.test(text)
        )
      );
    default:
      return false;
  }
}

function hasConcreteRuntimeEvidence(packet: UnifiedFindingPacket) {
  return (
    packet.confidenceInputs.hasDirectRuntimeEvidence ||
    packet.confidenceInputs.hasConcretePayloadEvidence ||
    packet.confidenceInputs.hasStructuredValidationEvidence
  );
}

function buildFingerprintingRawEvidence(packet: UnifiedFindingPacket): Record<string, unknown> {
  const fingerprintRuntimeEvidence = getEvidenceEntityValuesForKeys(packet, [
    "fingerprintRuntimeEvidence",
    "fingerprintingRuntimeEvidence"
  ]).flatMap((value) => {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? [parsed as Record<string, unknown>] : [];
    } catch {
      return [{ value }];
    }
  });
  const fingerprintAttributeCategories = [
    ...getEvidenceEntityValuesForKeys(packet, [
      "fingerprintAttributeCategories",
      "fingerprintingSignals",
      "highEntropySignals"
    ])
  ];
  const fingerprintTier = getEvidenceCount(packet, ["fingerprintTier", "fingerprint_tier"]);

  return {
    fingerprintAttributeCategories,
    fingerprintRuntimeEvidence,
    fingerprintSummary: {
      ...(typeof fingerprintTier === "number" ? { tier: fingerprintTier } : {}),
      ...(fingerprintAttributeCategories.length > 0 ? { fingerprintingSignals: fingerprintAttributeCategories } : {})
    },
    fingerprintTier,
    requestUrls: [
      ...(packet.evidence?.sourceUrls ?? []),
      ...fingerprintRuntimeEvidence.flatMap((row) =>
        ["requestUrl", "request_url", "url", "redactedUrl", "redacted_url"]
          .map((key) => row[key])
          .filter((value): value is string => typeof value === "string")
      )
    ],
    runtimeVendors: [
      ...getEvidenceEntityValuesForKeys(packet, ["runtimeVendors", "vendors", "vendorNames"]),
      ...fingerprintRuntimeEvidence.flatMap((row) =>
        ["vendor", "vendorName", "vendor_name", "hostname", "host"]
          .map((key) => row[key])
          .filter((value): value is string => typeof value === "string")
      )
    ]
  };
}

function isSecuritySensitiveCookieName(value: string) {
  return /auth|session|sess|sid|token|jwt|csrf|xsrf|login|account|user|customer|checkout|cart|payment|pay|billing/i.test(value);
}

function getWeakCookieAttributeNames(packet: UnifiedFindingPacket) {
  return [
    ...getEvidenceEntityValues(packet, "missingSecureCookieNames"),
    ...getEvidenceEntityValues(packet, "missingHttpOnlyCookieNames"),
    ...getEvidenceEntityValues(packet, "weakSameSiteCookieNames"),
    ...getEvidenceEntityValues(packet, "thirdPartyWeakAttributeCookieNames")
  ];
}

function hasPromotableWeakCookieSecurityEvidence(packet: UnifiedFindingPacket) {
  const weakCookieNames = [...new Set(getWeakCookieAttributeNames(packet))];
  if (weakCookieNames.length === 0) {
    return false;
  }

  const missingSecureCount = getEvidenceCount(packet, ["missingSecureCount"]) ?? 0;
  const missingHttpOnlyCount = getEvidenceCount(packet, ["missingHttpOnlyCount"]) ?? 0;
  const weakSameSiteCount = getEvidenceCount(packet, ["weakSameSiteCount"]) ?? 0;
  const thirdPartyWeakAttributeCount = getEvidenceCount(packet, ["thirdPartyWeakAttributeCount"]) ?? 0;
  const hasConcreteAttribute =
    missingSecureCount + missingHttpOnlyCount + weakSameSiteCount + thirdPartyWeakAttributeCount > 0;
  if (!hasConcreteAttribute) {
    return false;
  }

  if (weakCookieNames.some(isSecuritySensitiveCookieName)) {
    return true;
  }

  return weakCookieNames.length >= 3 && missingSecureCount + weakSameSiteCount + thirdPartyWeakAttributeCount >= 3;
}

function hasConcreteRuntimeOrPayloadEvidence(packet: UnifiedFindingPacket) {
  return packet.confidenceInputs.hasDirectRuntimeEvidence || packet.confidenceInputs.hasConcretePayloadEvidence;
}

function hasStrongStandaloneEvidence(packet: UnifiedFindingPacket) {
  return (
    packet.confidenceBand === "high" ||
    hasConcreteRuntimeEvidence(packet) ||
    (packet.confidenceInputs.hasPolicyTextEvidence && hasReadableSnippet(packet) && hasConcreteHumanFacingUrl(packet.evidence?.pageUrls)) ||
    packet.confidenceInputs.hasCorroboratedPositiveSurfaceEvidence
  );
}

function hasStrongCoverageEvidence(packet: UnifiedFindingPacket) {
  if (packet.details?.family !== "coverage_gap") {
    return false;
  }

  return (
    (packet.details.gapKind === "bounded_discovery_unresolved" && (packet.details.attemptCount ?? 0) >= 2) ||
    (packet.details.guessedOnly === false && (packet.details.attemptCount ?? 0) >= 1)
  );
}

function hasWeakCoverageEvidence(packet: UnifiedFindingPacket) {
  return !hasStrongCoverageEvidence(packet);
}

function hasStrongKeyPageGapEvidence(packet: UnifiedFindingPacket) {
  if (packet.details?.family !== "coverage_gap") {
    return false;
  }

  const stableDiscoverySource = [
    "footer_link",
    "header_link",
    "body_link",
    "legal_hub",
    "second_hop_legal_hub"
  ].includes(packet.details.bestDiscoverySource ?? "");

  if (packet.details.gapKind === "surface_missing") {
    return packet.details.guessedOnly === false && (stableDiscoverySource || (packet.details.attemptCount ?? 0) >= 2);
  }

  if (packet.details.gapKind === "fetch_failed") {
    return packet.details.guessedOnly === false && ((packet.details.attemptCount ?? 0) >= 2 || stableDiscoverySource);
  }

  return false;
}

function isMainNarrativeKeyPageGap(packet: UnifiedFindingPacket) {
  if (packet.details?.family !== "coverage_gap") {
    return false;
  }

  return ["privacy_policy", "terms_of_service", "cookie_policy", "contact"].includes(packet.details.pageType);
}

function isConcreteHttpEvidenceUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.hostname.includes(".") &&
      !parsed.hostname.includes("_")
    );
  } catch {
    return false;
  }
}

function hasExplicitContradictionBasis(packet: UnifiedFindingPacket) {
  return (
    packet.details?.family === "contradiction" &&
    typeof packet.details.contradictionBasis === "string" &&
    packet.details.contradictionBasis.trim().length > 0 &&
    typeof packet.details.policyClaimType === "string" &&
    typeof packet.details.runtimeObservationType === "string" &&
    typeof packet.details.conflictType === "string" &&
    packet.confidenceInputs.hasPolicyTextEvidence &&
    (packet.confidenceInputs.hasDirectRuntimeEvidence || packet.confidenceInputs.hasConcretePayloadEvidence)
  );
}

function hasPolicyRuntimeAlignmentReviewBridge(packet: UnifiedFindingPacket) {
  return (
    packet.details?.family === "contradiction" &&
    packet.details.bridgeMappingType === "deterministic_policy_runtime_review_mapping" &&
    packet.details.conflictSupportsPromotion === true &&
    packet.confidenceInputs.hasPolicyTextEvidence &&
    packet.confidenceInputs.hasDirectRuntimeEvidence
  );
}

function policyRuntimeAlignmentReviewOverride(packet: UnifiedFindingPacket): {
  reason: string;
  ruleId: SurfacingPolicyRuleId;
  state: SurfacingDecisionState;
} | null {
  if (!hasPolicyRuntimeAlignmentReviewBridge(packet)) {
    return null;
  }
  return {
    reason:
      "A scanner policy/runtime alignment review bridge was retained across policy disclosure text and concrete runtime evidence, so this can surface as a review signal without being treated as a contradiction.",
    ruleId: "evidence.policy_runtime_alignment.review_bridge",
    state: "review"
  };
}

function hasSpecificPreconsentEvidence(packet: UnifiedFindingPacket) {
  if (packet.unifiedFindingId !== "preconsent_tracking" || packet.details?.family !== "consent_tracking") {
    return false;
  }

  const hasBeforeConsentCookieWriteEvidence =
    (packet.evidence?.entities?.preconsent_cookie_timing_evidence ?? []).some((value) =>
      value === "before_consent_cookie_write"
    ) ||
    (packet.evidence?.entities?.preconsentCookieTimingEvidence ?? []).some((value) =>
      value === "before_consent_cookie_write"
    );
  const hasPreconsentCookieEvidence =
    hasBeforeConsentCookieWriteEvidence &&
    (
      (packet.evidence?.entities?.preconsent_nonessential_cookie_names?.length ?? 0) > 0 ||
      (packet.evidence?.entities?.preconsentNonessentialCookieNames?.length ?? 0) > 0 ||
      (
        ((packet.evidence?.entities?.preconsent_cookie_names?.length ?? 0) > 0 ||
          (packet.evidence?.entities?.preconsentCookieNames?.length ?? 0) > 0) &&
        ((packet.evidence?.entities?.preconsent_cookie_categories ?? []).some((value) =>
          /analytics|advertising|marketing|retargeting|session_replay/i.test(value)
        ) ||
          (packet.evidence?.entities?.preconsentCookieCategories ?? []).some((value) =>
            /analytics|advertising|marketing|retargeting|session_replay/i.test(value)
          ))
      )
    );
  const retainedRuntimeVendors = getEvidenceEntityValuesForKeys(packet, [
    "runtimeVendors",
    "runtime_vendors",
    "preconsent_tracker_vendors",
    "preconsentTrackerVendors"
  ]);
  const retainedRuntimeUrls = getEvidenceEntityValuesForKeys(packet, [
    "runtimeRequestUrls",
    "runtime_request_urls",
    "preconsent_tracker_evidence_urls",
    "preconsentTrackerEvidenceUrls"
  ]);
  const hasVendors = (packet.details.vendors ?? []).some((value) => typeof value === "string" && value.trim().length > 0) ||
    retainedRuntimeVendors.length > 0;
  const hasUrls = (packet.details.requestUrls ?? []).some(isConcreteHttpEvidenceUrl) ||
    retainedRuntimeUrls.some(isConcreteHttpEvidenceUrl);
  const hasRuntimeOrValidationBacking =
    packet.confidenceInputs.hasDirectRuntimeEvidence || packet.confidenceInputs.hasStructuredValidationEvidence;
  const hasRetainedPreconsentSequence =
    packet.concernContext?.negativeEvidenceFlags?.includes("missing_preconsent_sequence_evidence") !== true ||
    (packet.evidence?.entities?.consentTimeline?.length ?? 0) > 0 ||
    (packet.evidence?.entities?.requestPurposeClassificationConfidence?.length ?? 0) > 0;

  return hasRuntimeOrValidationBacking && ((hasVendors && hasUrls && hasRetainedPreconsentSequence) || hasPreconsentCookieEvidence);
}

function hasSpecificConsentGatedRuntimeEvidence(packet: UnifiedFindingPacket) {
  if (packet.unifiedFindingId !== "consent_gated_tracking_claim_conflict" || packet.details?.family !== "contradiction") {
    return false;
  }

  const hasVendors =
    (packet.details.vendors ?? []).some((value) => typeof value === "string" && value.trim().length > 0) ||
    (packet.evidence?.entities?.runtimeVendors?.length ?? 0) > 0;
  const hasRuntimeRequestUrls = (packet.evidence?.entities?.runtimeRequestUrls ?? []).some((value) =>
    /^https?:\/\//i.test(value)
  );

  return hasVendors && hasRuntimeRequestUrls && (packet.confidenceInputs.hasDirectRuntimeEvidence || hasConcreteRuntimeEvidence(packet));
}

function hasMaterialIncompletePreconsentEvidence(packet: UnifiedFindingPacket) {
  if (packet.unifiedFindingId !== "preconsent_tracking" || packet.details?.family !== "consent_tracking") {
    return false;
  }

  const negativeFlags = getNegativeEvidenceFlags(packet);
  const runtimeRequestUrls = packet.evidence?.entities?.runtimeRequestUrls ?? [];
  const requestPurposeRows = packet.evidence?.entities?.requestPurposeClassificationConfidence ?? [];
  const hasState0RequestAnchor = requestPurposeRows.some((value) =>
    /state0_request_capture|\"runtimePhase\":\"pre_consent\"|\"runtime_phase\":\"pre_consent\"/i.test(value)
  );
  const hasIncompleteState0Classification = requestPurposeRows.some((value) =>
    /state0_request_capture|\"runtimePhase\":\"pre_consent\"|\"runtime_phase\":\"pre_consent\"/i.test(value) &&
    !/\"essentiality\":\"non_essential\"/i.test(value)
  );

  return (
    hasState0RequestAnchor &&
    runtimeRequestUrls.some(isConcreteHttpEvidenceUrl) &&
    (negativeFlags.has("missing_concrete_preconsent_artifact") || hasIncompleteState0Classification) &&
    negativeFlags.has("missing_preconsent_sequence_evidence")
  );
}

function hasStandalonePreconsentRuntimeEvidence(packet: UnifiedFindingPacket) {
  if (packet.unifiedFindingId !== "preconsent_tracking" || packet.details?.family !== "consent_tracking") {
    return false;
  }

  if (hasSpecificPreconsentEvidence(packet)) {
    return true;
  }

  const hasVendors = (packet.details.vendors ?? []).some((value) => typeof value === "string" && value.trim().length > 0);
  const hasUrls = (packet.details.requestUrls ?? []).some((value) => /^https?:\/\//i.test(value));

  return hasConcreteRuntimeEvidence(packet) && (hasVendors || hasUrls);
}

function hasFinancialContextAndBacking(packet: UnifiedFindingPacket) {
  return (
    packet.confidenceInputs.hasStructuredValidationEvidence ||
    (packet.confidenceInputs.hasPolicyTextEvidence && hasReadableSnippet(packet) && hasConcreteHumanFacingUrl([
      ...(packet.evidence?.pageUrls ?? []),
      ...(packet.evidence?.sourceUrls ?? [])
    ]))
  );
}

function hasStructuredPolicyAbsenceBacking(packet: UnifiedFindingPacket) {
  if (
    packet.unifiedFindingId !== "missing_dsar_mechanism" &&
    packet.unifiedFindingId !== "missing_transfer_disclosure"
  ) {
    return false;
  }

  if (hasContradictoryMissingDisclosureCue(packet)) {
    return false;
  }

  if (packet.unifiedFindingId === "missing_dsar_mechanism" && !hasSpecificDsarAbsenceBacking(packet)) {
    return false;
  }

  const evidenceFlags = new Set(packet.evidence?.flags ?? []);
  if (
    evidenceFlags.has("policy_structurally_weak") ||
    evidenceFlags.has("policyStructurallyWeak") ||
    evidenceFlags.has("policy_extraction_status:structurally_weak")
  ) {
    return false;
  }

  const policyCoverageRatio = getEvidenceCount(packet, ["policyCoverageRatio", "policy_coverage_ratio"]);
  if (typeof policyCoverageRatio === "number" && policyCoverageRatio < 0.5) {
    return false;
  }

  const policySemanticConfidence = getEvidenceCount(packet, ["policySemanticConfidence", "policy_semantic_confidence"]);
  if (typeof policySemanticConfidence === "number" && policySemanticConfidence < 0.75) {
    return false;
  }

  return (
    packet.confidenceInputs.hasStructuredValidationEvidence &&
    packet.confidenceInputs.hasPolicyTextEvidence &&
    hasReadableSnippet(packet) &&
    hasConcreteHumanFacingUrl([
      ...(packet.evidence?.pageUrls ?? []),
      ...(packet.evidence?.sourceUrls ?? [])
    ])
  );
}

function hasPrivacyContactMissingBacking(packet: UnifiedFindingPacket) {
  if (packet.unifiedFindingId !== "privacy_contact_channel_missing") {
    return false;
  }

  const channelTypes = getEvidenceEntityValues(packet, "privacyContactChannelType");
  const hasExplicitMissingChannel = channelTypes.some((value) => /^none$/i.test(value.trim()));
  if (!hasExplicitMissingChannel) {
    return false;
  }

  const policySemanticConfidence = getEvidenceCount(packet, ["policySemanticConfidence", "policy_semantic_confidence"]);
  if (typeof policySemanticConfidence !== "number" || policySemanticConfidence < 0.7) {
    return false;
  }

  const evidenceText = getEvidenceSnippetText(packet);
  if (!hasSubstantivePrivacyPolicyContent(evidenceText)) {
    return false;
  }
  if (hasConcretePrivacyContactCue(evidenceText)) {
    return false;
  }

  return (
    packet.confidenceInputs.hasPolicyTextEvidence &&
    hasSubstantiveReadableSnippet(packet) &&
    hasConcreteHumanFacingUrl([
      ...(packet.evidence?.pageUrls ?? []),
      ...(packet.evidence?.sourceUrls ?? [])
    ])
  );
}

function hasSpecificDsarAbsenceBacking(packet: UnifiedFindingPacket) {
  const evidenceText = getEvidenceSnippetText(packet);
  const evidenceFlags = new Set(packet.evidence?.flags ?? []);
  const dsarMechanisms = [
    ...getEvidenceEntityValues(packet, "policyDsarMechanism"),
    ...getEvidenceEntityValues(packet, "policy_dsar_mechanism")
  ];
  const rightsSignals = [
    ...getEvidenceEntityValues(packet, "policyRightsSignals"),
    ...getEvidenceEntityValues(packet, "policy_rights_signals")
  ];

  if (rightsSignals.length > 0) {
    return false;
  }

  if (dsarMechanisms.some((value) => !/^(?:none|unknown|absent|null|missing|not_found)$/i.test(value.trim()))) {
    return false;
  }

  return (
    evidenceFlags.has("policy_field:dsar_path:absent") ||
    dsarMechanisms.some((value) => /^(?:absent|none|missing|not_found)$/i.test(value.trim())) ||
    /\b(?:no|lacks?|without|absent|missing) (?:concrete |specific |details? (?:on|about) )?(?:dsar|rights?|request|portal|form|mechanism|path|data rights?|access|deletion|correction|portability)\b/i.test(
      evidenceText
    )
  );
}

function hasContradictoryMissingDisclosureCue(packet: UnifiedFindingPacket) {
  const evidenceText = (packet.evidence?.snippets ?? []).join(" ").toLowerCase();
  const evidenceFlags = new Set(packet.evidence?.flags ?? []);

  if (packet.unifiedFindingId === "missing_dsar_mechanism" && evidenceFlags.has("policy_field:dsar_path:found")) {
    return true;
  }

  if (
    packet.unifiedFindingId === "missing_dsar_mechanism" &&
    (
      getEvidenceEntityValues(packet, "policyDsarMechanism").some((value) => !/^(?:none|unknown|absent|null|missing|not_found)$/i.test(value.trim())) ||
      getEvidenceEntityValues(packet, "policyRightsSignals").length > 0
    )
  ) {
    return true;
  }

  if (
    packet.unifiedFindingId === "missing_transfer_disclosure" &&
    (
      evidenceFlags.has("policy_field:third_party_sharing:found") ||
      evidenceFlags.has("policy_field:transfer:found") ||
      evidenceFlags.has("policy_field:transfers:found")
    )
  ) {
    return true;
  }

  if (!evidenceText) {
    return false;
  }

  if (packet.unifiedFindingId === "missing_dsar_mechanism") {
    return (
      /\b(?:privacy|data|consumer) (?:request|portal|center|form)|submit (?:a )?(?:privacy|data|consumer)? ?request|exercise (?:your )?(?:privacy|data|consumer)? ?rights|request (?:access|deletion|correction|a copy)|(?:access|delete|deletion|correct|correction|portability|opt-out) request\b/i.test(
        evidenceText
      ) &&
      !/\b(?:no|lacks?|without|absent|missing) (?:concrete |specific |details? (?:on|about) )?(?:dsar|rights?|request|portal|form|mechanism|path|data rights?)\b/i.test(evidenceText)
    );
  }

  if (packet.unifiedFindingId === "missing_transfer_disclosure") {
    return (
      /\b(?:share|shares|shared|sharing|disclose|discloses|disclosed|transfer|transfers|transferred) (?:your |personal |user |customer |account |usage |non-personal |data|information)|(?:service providers?|affiliates?|partners?|vendors?|processors?|subprocessors?|third parties|third-party) (?:may )?(?:receive|access|process|use|handle|support)\b/i.test(
        evidenceText
      ) &&
      !/\b(?:no|not|never|does not|do not) (?:sell|share|transfer|disclose)|(?:lacks?|without|absent|missing) (?:concrete |specific )?(?:transfer|sharing|third-party|service provider)\b/i.test(
        evidenceText
      )
    );
  }

  return false;
}

function isLikelyFirstPartyCookieDisclosureUrl(value: string | null | undefined) {
  if (!value || !/^https?:\/\//i.test(value)) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase().replace(/\/+$/, "") || "/";
    const pathAndQuery = `${path}${parsed.search.toLowerCase()}`;

    if (path === "/" || host === "www.cookieyes.com" && path.startsWith("/product/")) {
      return false;
    }

    return /cookie|privacy|legal|policy|notice/.test(pathAndQuery);
  } catch {
    return /\/.+(cookie|privacy|legal|policy|notice)/i.test(value);
  }
}

function hasCookieDisclosureGapBacking(packet: UnifiedFindingPacket) {
  if (packet.unifiedFindingId !== "cookie_disclosure_gap") {
    return false;
  }
  const contractDecision = evaluateFindingEvidenceContractForPacket(packet);
  if (contractDecision?.status !== "pass_strong") {
    return false;
  }

  if (
    packet.evidence?.fetchQuality === "blocked_interstitial" ||
    packet.concernContext?.negativeEvidenceFlags.includes("blocked_or_interstitial_evidence_observed")
  ) {
    return false;
  }

  const vendorDisclosureReview = evaluateRuntimeVendorDisclosureEvidence({
    runtimeVendorDisclosureEvidence: getEvidenceEntityValuesForKeys(packet, ["runtimeVendorDisclosureEvidence"])
  });
  if (
    vendorDisclosureReview.disposition === "eligible" &&
    runtimeVendorDisclosureHasPromotionCategory(vendorDisclosureReview.evidence)
  ) {
    return true;
  }

  const urls = [...(packet.evidence?.pageUrls ?? []), ...(packet.evidence?.sourceUrls ?? [])];
  const unmatchedThirdPartyCookieCount = getEvidenceCount(packet, [
    "unmatched_third_party_cookie_count",
    "unmatchedThirdPartyCookieCount",
    "unmatchedCookieCount"
  ]);
  const runtimeCookieNames = [
    ...getEvidenceEntityValuesForKeys(packet, [
      "runtime_cookie_names",
      "runtimeCookieNames",
      "unmatched_cookie_names",
      "unmatchedCookieNames"
    ])
  ];
  const unmatchedCookieNames = getEvidenceEntityValuesForKeys(packet, ["unmatched_cookie_names", "unmatchedCookieNames"]);
  const unmatchedCookieCategories = getEvidenceEntityValuesForKeys(packet, [
    "unmatched_cookie_categories",
    "unmatchedCookieCategories"
  ]);
  const hasPromotionGradeUnmatchedCookie =
    unmatchedCookieCategories.some((value) => /analytics|advertising|marketing|retargeting|session_replay/i.test(value)) ||
    unmatchedCookieNames.some((value) =>
      /(^_ga|^_gid|^_gat|ga_|goog|gtm|doubleclick|^_fbp|^_fbc|gcl_|ttclid|ttp|li_sugr|bcookie|lidc|uuid2|xandr|adnxs|muid|demdex|adobeorg|kndctr_.*adobeorg|mbox|qsi_replaysession|qualtrics|hotjar|fullstory|clarity|contentsquare|mouseflow|_hj)/i.test(value)
    );

  return (
    packet.confidenceInputs.hasStructuredValidationEvidence &&
    runtimeCookieNames.length > 0 &&
    (
      typeof unmatchedThirdPartyCookieCount === "number" && unmatchedThirdPartyCookieCount > 0 ||
      hasPromotionGradeUnmatchedCookie
    ) &&
    urls.some(isLikelyFirstPartyCookieDisclosureUrl)
  );
}

function getNegativeEvidenceFlags(packet: UnifiedFindingPacket) {
  return new Set(packet.concernContext?.negativeEvidenceFlags ?? []);
}

function createInitialDecision(
  packet: UnifiedFindingPacket,
  policy: UnifiedFindingSurfacingPolicyEntry | null
): MutableDecision {
  if (!policy) {
    return {
      appliedRules: ["unknown.conservative_fallback"],
      decisionReasons: ["No explicit surfacing policy entry was found for this finding id, so it was conservatively suppressed."],
      decisionState: "suppressed",
      family: "unknown",
      reportLane: "suppressed",
      surfaceTier: "support",
      supports: new Set<string>(),
      unifiedFindingId: packet.unifiedFindingId,
      usedFamilyDefault: false,
      usedFindingOverride: false
    };
  }

  const familyDefault = FAMILY_DEFAULTS[policy.family];
  return {
    appliedRules: [familyDefault.ruleId],
    decisionReasons: [familyDefault.reason],
    decisionState: policy.initialState ?? familyDefault.state,
    family: policy.family,
    reportLane: policy.initialLane ?? familyDefault.lane,
    surfaceTier: policy.initialTier ?? familyDefault.tier,
    supports: new Set<string>(),
    unifiedFindingId: packet.unifiedFindingId,
    usedFamilyDefault: true,
    usedFindingOverride: Boolean(policy.initialState || policy.initialLane || policy.initialTier)
  };
}

function overrideDecision(
  decision: MutableDecision,
  input: {
    lane?: SurfacingReportLane;
    reason: string;
    ruleId: SurfacingPolicyRuleId;
    state?: SurfacingDecisionState;
    tier?: SurfacingTier;
  }
) {
  if (input.state) {
    decision.decisionState = input.state;
  }
  if (input.lane) {
    decision.reportLane = input.lane;
  }
  if (input.tier) {
    decision.surfaceTier = input.tier;
  }
  decision.appliedRules.push(input.ruleId);
  decision.decisionReasons.push(input.reason);
}

function applyFindingSpecificRules(context: PolicyEvaluationContext) {
  const { packet, decision } = context;
  const evidenceFlags = new Set(packet.evidence?.flags ?? []);
  const negativeFlags = getNegativeEvidenceFlags(packet);
  const policyExtractionDetails = packet.details?.family === "policy_extraction" ? packet.details : null;
  const contradictoryPositiveFindingIdByNegative = new Map<string, string>([
    ["privacy_contact_channel_missing", "privacy_contact_path_present"],
    ["accessibility_support_path_missing", "accessibility_support_path_present"],
    ["privacy_policy_missing_surface", "privacy_policy_present"],
    ["terms_missing_surface", "terms_of_service_present"],
    ["cookie_policy_missing_surface", "cookie_policy_present"]
  ]);
  const contractDecision = evaluateFindingEvidenceContractForPacket(packet);
  const hasSpecificPreconsentRuntimeEvidence =
    packet.unifiedFindingId === "preconsent_tracking" && hasSpecificPreconsentEvidence(packet);
  const hasMaterialIncompletePreconsentRuntimeEvidence = hasMaterialIncompletePreconsentEvidence(packet);

  if (packet.concernContext?.externalSurfacingEligibilities?.every((value) => value === "suppress")) {
    overrideDecision(decision, {
      state: "suppressed",
      lane: "suppressed",
      tier: "support",
      reason: "Normalized concern gating marked this finding ineligible for external surfacing.",
      ruleId: "unknown.conservative_fallback"
    });
    return;
  }

  if (contractDecision?.externalSurfacingEligibility === "suppress" && !hasSpecificPreconsentRuntimeEvidence) {
    overrideDecision(decision, {
      state: "suppressed",
      lane: "suppressed",
      tier: "support",
      reason: "The finding evidence contract suppressed this high-risk finding because required evidence was missing.",
      ruleId: "evidence.finding_contract.suppressed"
    });
    return;
  }

  if (packet.unifiedFindingId === "reject_did_not_reduce_tracking" || packet.unifiedFindingId === "reject_did_not_reduce_third_party_cookies") {
    if (evidenceFlags.has("reject_evidence_suppress")) {
      overrideDecision(decision, {
        state: "suppressed",
        lane: "suppressed",
        tier: "support",
        reason:
          "Reject-path tracking evidence was suppressed because the reject click, post-reject timing window, or attribution context was not defensible.",
        ruleId: "evidence.consent_behavior.suppress_low_confidence_interface_context"
      });
      return;
    }
  }

  if (
    contractDecision?.externalSurfacingEligibility === "audit_only" &&
    !hasSpecificPreconsentRuntimeEvidence
  ) {
    const policyRuntimeAlignmentOverride = policyRuntimeAlignmentReviewOverride(packet);
    if (policyRuntimeAlignmentOverride) {
      overrideDecision(decision, {
        state: policyRuntimeAlignmentOverride.state,
        lane: "main",
        tier: decision.surfaceTier,
        reason: policyRuntimeAlignmentOverride.reason,
        ruleId: policyRuntimeAlignmentOverride.ruleId
      });
      return;
    }

    if (hasMaterialIncompletePreconsentRuntimeEvidence) {
      overrideDecision(decision, {
        state: "material_incomplete",
        lane: "confidence_and_coverage",
        tier: "support",
        reason:
          "State-0 pre-consent request evidence was retained, but timing sequence, non-essential classification, or vendor attribution is incomplete, so the finding remains audit-only instead of being suppressed or executive-promoted.",
        ruleId: "evidence.preconsent.material_incomplete"
      });
      return;
    }

    overrideDecision(decision, {
      state: "support_only",
      lane: "confidence_and_coverage",
      tier: "support",
      reason: "The finding evidence contract retained this high-risk finding for audit review because required evidence was missing.",
      ruleId: "evidence.finding_contract.audit_only"
    });
    return;
  }

  if (
    packet.unifiedFindingId === "accessibility_risk_score" &&
    negativeFlags.has("missing_representative_accessibility_examples")
  ) {
    overrideDecision(decision, {
      state: "suppressed",
      lane: "suppressed",
      tier: "support",
      reason:
        "The accessibility risk score was suppressed because no representative axe examples were retained to support reviewer-facing surfacing.",
      ruleId: "evidence.accessibility.suppress_score_only_context"
    });
    return;
  }

  if (packet.unifiedFindingId === "reject_did_not_reduce_tracking" || packet.unifiedFindingId === "reject_did_not_reduce_third_party_cookies") {
    if (
      evidenceFlags.has("reject_evidence_review") ||
      packet.concernContext?.negativeEvidenceFlags.includes("missing_post_reject_timing_evidence")
    ) {
      const hasEligibleRejectConcern =
        packet.concernContext?.promotionEligibilities.includes("eligible") === true &&
        packet.concernContext.externalSurfacingEligibilities.includes("eligible") === true;
      const missingPostRejectTimingEvidence =
        packet.concernContext?.negativeEvidenceFlags.includes("missing_post_reject_timing_evidence") === true &&
        !evidenceFlags.has("reject_evidence_confirmed");

      if (contractDecision?.promotionEligibility === "eligible" && hasEligibleRejectConcern && !missingPostRejectTimingEvidence) {
        overrideDecision(decision, {
          state: evidenceFlags.has("reject_evidence_confirmed") ? "confirmed" : "review",
          lane: "main",
          tier: "headline",
          reason:
            evidenceFlags.has("reject_evidence_confirmed")
              ? `The reject interaction succeeded and classified non-essential tracking requests were retained at least ${REJECT_TRACKING_CONFIRMATION_MIN_MS_LABEL} after reject, so the finding can stand as a confirmed consent-control failure.`
              : "The reject interaction succeeded and retained named post-reject tracker vendors with multiple runtime evidence URLs, so this can surface as a main consent-control review finding while attribution caveats remain visible.",
          ruleId: evidenceFlags.has("reject_evidence_confirmed")
            ? "evidence.consent_behavior.confirmed_specific_runtime_failure"
            : "evidence.consent_behavior.review_runtime_without_effect_evidence"
        });
        return;
      }

      overrideDecision(decision, {
        state: "support_only",
        lane: "confidence_and_coverage",
        tier: "support",
        reason:
          "Reject-path tracking evidence is retained for analyst review because post-reject timing or vendor classification did not satisfy promotion requirements.",
        ruleId: "evidence.normalized_concern.audit_only"
      });
      return;
    }
  }

  if (
    (
      context.policy.family === "accessibility" ||
      context.policy.family === "financial_promotion" ||
      context.policy.family === "consent_tracking" ||
      context.policy.family === "contradiction"
    ) &&
    packet.concernContext?.externalSurfacingEligibilities?.every((value) => value === "audit_only") &&
    contractDecision?.promotionEligibility !== "eligible" &&
    !hasSpecificPreconsentRuntimeEvidence &&
    !hasMaterialIncompletePreconsentRuntimeEvidence
  ) {
    overrideDecision(decision, {
      state: "support_only",
      lane: "confidence_and_coverage",
      tier: "support",
      reason: "Normalized concern gating retained this finding for audit review but did not make it eligible for external surfacing.",
      ruleId: "evidence.normalized_concern.audit_only"
    });
    return;
  }

  const contradictoryPositiveFindingId = contradictoryPositiveFindingIdByNegative.get(packet.unifiedFindingId);
  if (contradictoryPositiveFindingId && context.allPacketsById.has(contradictoryPositiveFindingId)) {
    overrideDecision(decision, {
      state: "suppressed",
      lane: "suppressed",
      tier: "support",
      reason: "A stronger positive surface finding for the same disclosure or support path is present, so the contradictory missing-surface finding was suppressed.",
      ruleId: "support.orphan_support_suppressed"
    });
    return;
  }

  if (context.policy.family === "positive_surface") {
    if (hasSubstantiveCookiePolicySurfaceEvidence(packet)) {
      overrideDecision(decision, {
        state: "review",
        lane: "main",
        tier: "section",
        reason:
          "A retained, page-attributed cookie policy surface has substantive cookie-policy text and a cookie-specific first-party URL, so it can surface as review-level positive evidence.",
        ruleId: "evidence.positive_surface.review_high_value_privacy_disclosure"
      });
      return;
    }

    if (
      [
        "gpc_disclosure_present",
        "tracking_technologies_disclosure_present",
        "targeted_advertising_disclosure_present",
        "third_party_advertising_disclosure_present",
        "behavioral_analytics_disclosure_present"
      ].includes(packet.unifiedFindingId) &&
      packet.confidenceInputs.hasPolicyTextEvidence &&
      hasReadableSnippet(packet) &&
      hasFindingSpecificHighValuePrivacyDisclosureText(packet) &&
      hasConcreteHumanFacingUrl(packet.evidence?.pageUrls)
    ) {
      overrideDecision(decision, {
        state: "review",
        lane: "main",
        tier: "section",
        reason:
          "A retained, page-attributed high-value privacy disclosure is strong enough to surface in the main findings as review-level positive evidence instead of remaining hidden as support-only context.",
        ruleId: "evidence.positive_surface.review_high_value_privacy_disclosure"
      });
      return;
    }

    if (
      (packet.unifiedFindingId === "privacy_rights_path_present" || packet.unifiedFindingId === "privacy_contact_path_present") &&
      packet.confidenceInputs.hasPolicyTextEvidence &&
      hasReadableSnippet(packet) &&
      hasFindingSpecificPrivacyPathText(packet) &&
      hasConcreteHumanFacingUrl(packet.evidence?.pageUrls)
    ) {
      overrideDecision(decision, {
        state: "review",
        lane: "main",
        tier: "section",
        reason:
          "A retained, page-attributed privacy rights or contact path is strong enough to surface in the main findings as review-level positive evidence instead of remaining hidden as support-only context.",
        ruleId: "evidence.positive_surface.review_high_value_policy_path"
      });
      return;
    }

    overrideDecision(decision, {
      state: "support_only",
      lane: "confidence_and_coverage",
      tier: "support",
      reason: "Positive-presence findings are retained only as supporting context for now and should not surface independently in the ranked findings model.",
      ruleId: "evidence.positive_surface.support_only"
    });
    return;
  }

  if (context.policy.family === "coverage_gap") {
    const coverageDetails = packet.details?.family === "coverage_gap" ? packet.details : null;

    if (
      coverageDetails &&
      isMainNarrativeKeyPageGap(packet) &&
      hasStrongKeyPageGapEvidence(packet) &&
      coverageDetails.gapKind === "surface_missing"
    ) {
      overrideDecision(decision, {
        state: "confirmed",
        lane: "main",
        tier: decision.surfaceTier,
        reason: "A key page was strongly expected through stable discovery evidence and still not found, so this gap is strong enough to stand on its own.",
        ruleId: "evidence.coverage_gap.confirmed_key_page_surface_missing"
      });
      return;
    }

    if (
      coverageDetails &&
      isMainNarrativeKeyPageGap(packet) &&
      hasStrongKeyPageGapEvidence(packet) &&
      coverageDetails.gapKind === "fetch_failed"
    ) {
      overrideDecision(decision, {
        state: "review",
        lane: "main",
        tier: decision.surfaceTier,
        reason: "A key page was strongly discovered but could not be fetched reliably, so this availability gap should remain in the main findings as a review-level issue.",
        ruleId: "evidence.coverage_gap.review_key_page_fetch_failed"
      });
      return;
    }

    overrideDecision(decision, {
      state: "review",
      lane: "confidence_and_coverage",
      tier: packet.unifiedFindingId === "bounded_key_page_discovery_unresolved" ? "headline" : decision.surfaceTier,
      reason: hasStrongCoverageEvidence(packet)
        ? "Coverage limitations were strongly evidenced, so the finding remains surfaced for review in the confidence-and-coverage lane."
        : "Coverage limitations were retained, but the finding remains a review-level confidence or discovery issue rather than a confirmed substantive failure.",
      ruleId: "evidence.coverage_gap.keep_review"
    });
    return;
  }

  if (context.policy.family === "policy_extraction") {
    if (
      packet.unifiedFindingId === "surface_title_mismatch" &&
      packet.confidenceInputs.hasPageAttribution &&
      hasReadableSnippet(packet)
    ) {
      overrideDecision(decision, {
        state: "review",
        lane: "main",
        tier: "section",
        reason: "A retained, page-attributed title mismatch on a disclosure surface is substantive enough to surface in the main review lane.",
        ruleId: "evidence.policy_extraction.review_surface_integrity"
      });
      return;
    }

    if (
      packet.unifiedFindingId === "affiliate_disclosure_scope_limited" &&
      packet.confidenceInputs.hasPageAttribution &&
      (hasReadableSnippet(packet) || hasConcreteHumanFacingUrl(packet.evidence?.pageUrls))
    ) {
      overrideDecision(decision, {
        state: "review",
        lane: "main",
        tier: "section",
        reason: "A retained disclosure-placement gap is substantive enough to surface in the main review lane when it is page-attributed.",
        ruleId: "evidence.policy_extraction.review_disclosure_placement"
      });
      return;
    }

    if (
      packet.unifiedFindingId === "policy_clarity_risk" &&
      packet.confidenceInputs.hasPageAttribution &&
      (
        (
          hasNonPlaceholderSnippet(packet) &&
          (
            packet.evidence?.flags?.includes("policy_boilerplate_signals_retained") ||
            ((packet.evidence?.entities?.policyBoilerplateSignals?.length ?? 0) >= 2)
          )
        ) ||
        (
          hasSubstantiveReadableSnippet(packet) &&
          packet.confidenceInputs.hasPolicyTextEvidence &&
          hasConcreteHumanFacingUrl(packet.evidence?.pageUrls) &&
          typeof policyExtractionDetails?.ambiguityScore === "number" &&
          policyExtractionDetails.ambiguityScore >= 70 &&
          typeof policyExtractionDetails.confidence === "number" &&
          policyExtractionDetails.confidence >= 0.5
        )
      )
    ) {
      overrideDecision(decision, {
        state: "review",
        lane: "main",
        tier: "section",
        reason:
          "A page-attributed policy-fitness issue with strong retained clarity evidence is substantive enough to surface in the main review lane.",
        ruleId: "evidence.policy_extraction.review_policy_fitness"
      });
      return;
    }

    overrideDecision(decision, {
      state: "review",
      lane: "confidence_and_coverage",
      tier: packet.unifiedFindingId === "disclosure_likely_obstructed" ? "headline" : decision.surfaceTier,
      reason: "Extraction and obstruction evidence was retained, so this remains a review-level confidence or parsing issue rather than a confirmed substantive failure.",
      ruleId: "evidence.policy_extraction.keep_review"
    });
    return;
  }

  if (context.policy.family === "rights_gap") {
    if (packet.unifiedFindingId === "privacy_contact_channel_missing" && hasPrivacyContactMissingBacking(packet)) {
      overrideDecision(decision, {
        state: "confirmed",
        lane: "main",
        tier: decision.surfaceTier,
        reason:
          "A fetched privacy-policy surface, substantive policy text, and retained no-contact-channel metadata all support the missing privacy-contact interpretation.",
        ruleId: "evidence.rights_gap.confirmed_structured_policy_absence"
      });
      return;
    }

    if (packet.unifiedFindingId === "cookie_disclosure_gap") {
      if (hasCookieDisclosureGapBacking(packet)) {
        overrideDecision(decision, {
          state: "confirmed",
          lane: "main",
          tier: decision.surfaceTier,
          reason:
            "Runtime cookie evidence, promotion-grade unmatched cookie inventory, and a retained first-party cookie disclosure surface all support the disclosure-gap interpretation.",
          ruleId: "evidence.rights_gap.confirmed_structured_policy_absence"
        });
      } else {
        overrideDecision(decision, {
          state: "review",
          lane: "confidence_and_coverage",
          tier: "support",
          reason:
            "The cookie disclosure gap is retained for review, but it lacks enough policy-surface and third-party runtime evidence to confirm as a standalone failure.",
          ruleId: "evidence.rights_gap.review_structured_policy_gap"
        });
      }
      return;
    }

    if (
      hasConcreteRuntimeOrPayloadEvidence(packet) ||
      (CONFIRMED_RIGHTS_GAP_IDS as readonly string[]).includes(packet.unifiedFindingId) &&
        packet.confidenceInputs.hasStructuredValidationEvidence
    ) {
      overrideDecision(decision, {
        state: "confirmed",
        lane: "main",
        tier: decision.surfaceTier,
        reason: "Concrete runtime evidence, or a high-exposure rights gap backed by structured validation, was retained strongly enough for this finding to stand on its own.",
        ruleId: "evidence.rights_gap.confirmed_high_exposure_or_runtime"
      });
    } else if (hasStructuredPolicyAbsenceBacking(packet)) {
      overrideDecision(decision, {
        state: "confirmed",
        lane: "main",
        tier: decision.surfaceTier,
        reason:
          "A fetched policy surface, readable policy evidence, and structured validation all support the same missing-disclosure interpretation, so this absence finding can stand on its own.",
        ruleId: "evidence.rights_gap.confirmed_structured_policy_absence"
      });
    } else if ((WEAK_REVIEW_RIGHTS_GAP_IDS as readonly string[]).includes(packet.unifiedFindingId)) {
      overrideDecision(decision, {
        state: "review",
        lane: "confidence_and_coverage",
        tier: "support",
        reason: "This disclosure or rights gap is important to review, but structured policy absence alone is not yet strong enough to confirm it as a standalone failure.",
        ruleId: "evidence.rights_gap.review_structured_policy_gap"
      });
    } else {
      overrideDecision(decision, {
        state: "review",
        lane: "main",
        tier: decision.surfaceTier,
        reason: "This disclosure or rights gap is important to review, but structured policy absence alone is not yet strong enough to confirm it as a standalone failure.",
        ruleId: "evidence.rights_gap.review_structured_policy_gap"
      });
    }
    return;
  }

  if (context.policy.family === "contradiction") {
    if (packet.unifiedFindingId === "policy_behavior_conflict" || packet.unifiedFindingId === "consent_gated_tracking_claim_conflict") {
      if (packet.unifiedFindingId === "consent_gated_tracking_claim_conflict" && !hasSpecificConsentGatedRuntimeEvidence(packet)) {
        overrideDecision(decision, {
          state: "support_only",
          lane: "confidence_and_coverage",
          tier: "support",
          reason:
            "Consent-gated tracking conflicts need concrete retained runtime vendor and request URL artifacts before they can surface externally.",
          ruleId: "evidence.normalized_concern.audit_only"
        });
        return;
      }

      if (hasExplicitContradictionBasis(packet)) {
        overrideDecision(decision, {
          state: "confirmed",
          lane: "main",
          tier: "headline",
          reason: "A complete contradiction anchor was retained across policy and runtime evidence, so this contradiction can stand on its own.",
          ruleId: "evidence.contradiction.confirmed_when_explicit_basis_and_runtime"
        });
      } else {
        const policyRuntimeAlignmentOverride = policyRuntimeAlignmentReviewOverride(packet);
        if (policyRuntimeAlignmentOverride) {
          overrideDecision(decision, {
            state: policyRuntimeAlignmentOverride.state,
            lane: "main",
            tier: decision.surfaceTier,
            reason: policyRuntimeAlignmentOverride.reason,
            ruleId: policyRuntimeAlignmentOverride.ruleId
          });
          return;
        }

        overrideDecision(decision, {
          state: "review",
          lane: "main",
          tier: decision.surfaceTier,
          reason: "The contradiction matters, but it does not yet retain a complete explicit contradiction anchor across policy and runtime evidence.",
          ruleId: "evidence.contradiction.review_without_complete_anchor"
        });
      }
      return;
    }

    if (hasExplicitContradictionBasis(packet) || hasStrongStandaloneEvidence(packet)) {
      overrideDecision(decision, {
        state: "confirmed",
        lane: "main",
        tier: decision.surfaceTier,
        reason: "Concrete contradiction evidence was retained, so this more specific contradiction is strong enough to stand on its own.",
        ruleId: "evidence.contradiction.confirmed_when_explicit_basis_and_runtime"
      });
    }
    return;
  }

  if (packet.unifiedFindingId === "preconsent_tracking") {
    if (hasSpecificPreconsentEvidence(packet)) {
      overrideDecision(decision, {
        state: "confirmed",
        lane: "main",
        tier: "headline",
        reason: "Validation-backed runtime evidence retained concrete tracker request evidence or non-essential cookie timing evidence, so pre-consent tracking is strong enough to stand on its own.",
        ruleId: "evidence.preconsent.confirmed_when_validation_and_runtime_artifacts"
      });
    } else {
      overrideDecision(decision, {
        state: "review",
        lane: "main",
        tier: "headline",
        reason: "Pre-consent tracking remains important enough to show, but the retained runtime evidence is not yet strong enough for confirmation.",
        ruleId: "evidence.preconsent.review_without_runtime_artifacts"
      });
    }
    return;
  }

  if (context.policy.family === "consent_tracking") {
    if (packet.unifiedFindingId === "reject_did_not_reduce_tracking" || packet.unifiedFindingId === "reject_did_not_reduce_third_party_cookies") {
      if (evidenceFlags.has("reject_evidence_suppress")) {
        overrideDecision(decision, {
          state: "suppressed",
          lane: "suppressed",
          tier: "support",
          reason:
            "Reject-path tracking evidence was retained only as support because the interaction, timing window, vendor classification, or baseline comparison was not defensible enough for a main finding.",
          ruleId: "evidence.consent_behavior.suppress_low_confidence_interface_context"
        });
      } else if (evidenceFlags.has("reject_evidence_confirmed")) {
        overrideDecision(decision, {
          state: "confirmed",
          lane: "main",
          tier: "headline",
          reason:
            `The reject interaction succeeded and classified non-essential tracking requests were retained at least ${REJECT_TRACKING_CONFIRMATION_MIN_MS_LABEL} after reject, so the finding can stand as a confirmed consent-control failure.`,
          ruleId: "evidence.consent_behavior.confirmed_specific_runtime_failure"
        });
      } else {
        overrideDecision(decision, {
          state: "support_only",
          lane: "confidence_and_coverage",
          tier: "support",
          reason:
            "Tracking appeared after the reject interaction, but timing or vendor classification needs analyst review before calling it a confirmed suppression failure.",
          ruleId: "evidence.consent_behavior.review_runtime_without_effect_evidence"
        });
      }
      return;
    }

    if (packet.unifiedFindingId === "fingerprinting_observed") {
      const rawEvidence = buildFingerprintingRawEvidence(packet);
      const fingerprintTier = deriveFingerprintEvidenceTier(rawEvidence).tier;
      if (hasStrongFingerprintingEvidence(rawEvidence) && packet.confidenceBand === "high" && hasConcreteRuntimeEvidence(packet)) {
        overrideDecision(decision, {
          state: "confirmed",
          lane: "main",
          tier: "section",
          reason: "Identity-oriented fingerprinting evidence was retained with high confidence and concrete runtime backing, so this finding can stand on its own.",
          ruleId: "evidence.consent_behavior.confirmed_specific_runtime_failure"
        });
      } else {
        overrideDecision(decision, {
          state: fingerprintTier >= 2 ? "review" : "support_only",
          lane: fingerprintTier >= 2 ? "main" : "confidence_and_coverage",
          tier: fingerprintTier >= 2 ? decision.surfaceTier : "support",
          reason: fingerprintTier >= 2
            ? "Multi-signal browser/device telemetry was retained for fingerprinting review, but identity-oriented fingerprinting would require identity linkage, vendor attribution, outbound entropy transmission, repeat sequencing, or cross-context linkage."
            : "Browser/device entropy collection was retained only as support because identity-oriented fingerprinting evidence was not present.",
          ruleId: "evidence.consent_behavior.review_runtime_without_effect_evidence"
        });
      }
      return;
    }

    if (packet.unifiedFindingId === "cross_domain_identifier_sharing_observed") {
      if (hasConcreteRuntimeEvidence(packet)) {
        overrideDecision(decision, {
          state: "confirmed",
          lane: "main",
          tier: "headline",
          reason: "Runtime evidence retained redacted request samples showing the same identifier-like fingerprint across multiple external destinations.",
          ruleId: "evidence.consent_behavior.confirmed_specific_runtime_failure"
        });
      } else {
        overrideDecision(decision, {
          state: "review",
          lane: "main",
          tier: decision.surfaceTier,
          reason: "Identifier-sharing evidence was present, but concrete retained runtime request evidence is required before confirmation.",
          ruleId: "evidence.consent_behavior.review_runtime_without_effect_evidence"
        });
      }
      return;
    }

    if (packet.unifiedFindingId === "weak_cookie_security_attributes") {
      if (hasPromotableWeakCookieSecurityEvidence(packet)) {
        overrideDecision(decision, {
          state: "review",
          lane: "main",
          tier: "section",
          reason:
            "Weak cookie attributes are promoted only when concrete cookie names show security-sensitive cookies or repeated high-risk cookie weaknesses.",
          ruleId: "evidence.consent_behavior.review_runtime_without_effect_evidence"
        });
      } else {
        overrideDecision(decision, {
          state: "support_only",
          lane: "confidence_and_coverage",
          tier: "support",
          reason:
            "Weak cookie attributes are retained as supporting security posture evidence unless tied to security-sensitive or repeated high-risk cookies.",
          ruleId: "evidence.consent_behavior.support_only_tracking_context"
        });
      }
      return;
    }

    if (packet.unifiedFindingId === "session_replay_observed" && hasConcreteRuntimeEvidence(packet)) {
      overrideDecision(decision, {
        state: "review",
        lane: "main",
        tier: "section",
        reason: "Direct runtime evidence retained a session-recording vendor, so this finding can stand on its own for review.",
        ruleId: "evidence.consent_behavior.review_runtime_without_effect_evidence"
      });
      return;
    }

    if ((SUPPORT_ONLY_CONSENT_TRACKING_CONTEXT_IDS as readonly string[]).includes(packet.unifiedFindingId)) {
      overrideDecision(decision, {
        state: "support_only",
        lane: "main",
        tier: "support",
        reason: "Observed tracking-context findings are useful corroboration, but should only surface as support for stronger consent or disclosure findings.",
        ruleId: "evidence.consent_behavior.support_only_tracking_context"
      });
      return;
    }

    if ((REVIEW_ONLY_CONSENT_INTERFACE_IDS as readonly string[]).includes(packet.unifiedFindingId)) {
      if (packet.confidenceBand === "low") {
        overrideDecision(decision, {
          state: "suppressed",
          lane: "suppressed",
          tier: "support",
          reason:
            "Low-confidence consent-interface context should not surface as an executive or main regulatory finding without stronger corroborating evidence.",
          ruleId: "evidence.consent_behavior.suppress_low_confidence_interface_context"
        });
        return;
      }

      overrideDecision(decision, {
        state: "review",
        lane: "main",
        tier: decision.surfaceTier,
        reason: "Consent interface and choice-architecture findings are important to review, but they should not auto-confirm just because related runtime or snapshot evidence exists.",
        ruleId: "evidence.consent_behavior.review_interface_or_design"
      });
      return;
    }

    if (
      (CONFIRMED_CONSENT_RUNTIME_FAILURE_IDS as readonly string[]).includes(packet.unifiedFindingId) &&
      hasConcreteRuntimeEvidence(packet) &&
      !negativeFlags.has("missing_concrete_preconsent_artifact")
    ) {
      overrideDecision(decision, {
        state: "confirmed",
        lane: "main",
        tier: decision.surfaceTier,
        reason: "A concrete runtime consent-control failure was retained strongly enough for this finding to stand on its own.",
        ruleId: "evidence.consent_behavior.confirmed_specific_runtime_failure"
      });
    } else if (hasConcreteRuntimeEvidence(packet) && !negativeFlags.has("missing_concrete_preconsent_artifact")) {
      overrideDecision(decision, {
        state: "review",
        lane: "main",
        tier: decision.surfaceTier,
        reason: "Consent or tracking evidence was retained, but this finding still reads better as a review-level issue than a confirmed control failure.",
        ruleId: "evidence.consent_behavior.review_runtime_without_effect_evidence"
      });
    }
    return;
  }

  if (context.policy.family === "sensitive_data") {
    if (packet.unifiedFindingId === "sensitive_collection_surface_observed") {
      overrideDecision(decision, {
        state: "support_only",
        lane: "confidence_and_coverage",
        tier: "support",
        reason: "Sensitive collection field evidence is useful context, but should not surface as a standalone risk without replay, tracking, or transmission evidence.",
        ruleId: "evidence.sensitive.review_when_context_only"
      });
      return;
    }

    if (packet.confidenceInputs.hasConcretePayloadEvidence || hasConcreteRuntimeEvidence(packet)) {
      overrideDecision(decision, {
        state: "confirmed",
        lane: "main",
        tier: decision.surfaceTier,
        reason: "Concrete payload or runtime evidence was retained, so this sensitive-data finding is strong enough to stand on its own.",
        ruleId: "evidence.sensitive.confirmed_when_payload_or_runtime_backed"
      });
    } else {
      overrideDecision(decision, {
        state: "review",
        lane: "main",
        tier: decision.surfaceTier,
        reason: "Sensitive-data context was retained, but the current evidence is still better suited to review than confirmation.",
        ruleId: "evidence.sensitive.review_when_context_only"
      });
    }
    return;
  }

  if (context.policy.family === "accessibility") {
    if (packet.unifiedFindingId === "wcag_issue_summary") {
      overrideDecision(decision, {
        state: "review",
        lane: "main",
        tier: "secondary",
        reason: "A generic WCAG summary is useful review context, but should not lead over more specific accessibility findings.",
        ruleId: "evidence.accessibility.summary_review"
      });
    } else if (
      packet.unifiedFindingId === "keyboard_only_task_completion_blocked" ||
      packet.unifiedFindingId === "critical_form_completion_barrier"
    ) {
      overrideDecision(decision, {
        state: "review",
        lane: "main",
        tier: "section",
        reason: "This finding suggests task-completion risk and should be more prominent than generic accessibility summaries, even though it still reflects inferred rather than fully confirmed blockage.",
        ruleId: "evidence.accessibility.task_blocking_review"
      });
    }
    return;
  }

  if (context.policy.family === "commercial") {
    if (hasConcreteRuntimeEvidence(packet) || packet.confidenceInputs.hasStructuredValidationEvidence) {
      overrideDecision(decision, {
        state: "confirmed",
        lane: "main",
        tier: decision.surfaceTier,
        reason: "Runtime or structured evidence was retained, so this commercial-practice finding is strong enough to stand on its own.",
        ruleId: "evidence.commercial.confirmed_when_runtime_or_structured"
      });
    }
    return;
  }

  if (context.policy.family === "financial_promotion") {
    if ((SUPPORT_ONLY_FINANCIAL_CONTEXT_IDS as readonly string[]).includes(packet.unifiedFindingId)) {
      overrideDecision(decision, {
        state: "support_only",
        lane: "main",
        tier: "support",
        reason: "Positive financial disclosure or accountability context should be retained only as supporting context for stronger financial-risk findings.",
        ruleId: "evidence.financial.support_only_positive_context"
      });
      return;
    }

    if ((NEGATIVE_FINANCIAL_RISK_IDS as readonly string[]).includes(packet.unifiedFindingId) && hasFinancialContextAndBacking(packet) && !negativeFlags.has("possible_policy_runtime_mismatch")) {
      overrideDecision(decision, {
        state: "confirmed",
        lane: "main",
        tier: packet.unifiedFindingId === "guaranteed_or_high_return_claims_present" ? "headline" : decision.surfaceTier,
        reason: "Financial-risk evidence and retained supporting context were strong enough for this finding to stand on its own.",
        ruleId: "evidence.financial.confirmed_negative_risk_with_backing"
      });
    } else {
      overrideDecision(decision, {
        state: "review",
        lane: "main",
        tier: decision.surfaceTier,
        reason: "This financial-promotion finding remains important to review, but current context and evidence are not yet strong enough for confirmation.",
        ruleId: "evidence.financial.review_when_context_limited"
      });
    }
    return;
  }

  if (context.policy.family === "context") {
    if (packet.unifiedFindingId === "blocking_overlay_observed") {
      overrideDecision(decision, {
        state: "support_only",
        lane: "confidence_and_coverage",
        tier: "support",
        reason:
          "A blocking overlay is common consent or UX context and should support stronger choice, forced-consent, or pre-consent tracking findings rather than surface as a standalone violation.",
        ruleId: "evidence.context.keep_review"
      });
      return;
    }

    overrideDecision(decision, {
      state: "review",
      lane: "confidence_and_coverage",
      tier: "secondary",
      reason: "This finding is best treated as scan context unless stronger narrative evidence says otherwise.",
      ruleId: "evidence.context.keep_review"
    });
  }
}

function applyCrossFindingRules(decisionsById: Map<string, MutableDecision>, packetsById: Map<string, UnifiedFindingPacket>) {
  const supportLinks: UnifiedFindingSupportLink[] = [];

  for (const rule of EXPLICIT_PRECEDENCE_RULES) {
    const primaryDecision = decisionsById.get(rule.primaryFindingId);
    const supportingDecision = decisionsById.get(rule.supportingFindingId);
    const supportingPacket = packetsById.get(rule.supportingFindingId);
    if (!primaryDecision || !supportingDecision) {
      continue;
    }
    if (primaryDecision.decisionState === "suppressed" || supportingDecision.decisionState === "suppressed") {
      continue;
    }
    if (
      rule.appliedRule === "precedence.specific_contradiction_supports_preconsent" &&
      supportingPacket &&
      hasStandalonePreconsentRuntimeEvidence(supportingPacket)
    ) {
      continue;
    }

    supportingDecision.decisionState = "support_only";
    supportingDecision.reportLane = primaryDecision.reportLane === "suppressed" ? "main" : primaryDecision.reportLane;
    supportingDecision.surfaceTier = "support";
    supportingDecision.supportedBy = rule.primaryFindingId;
    supportingDecision.appliedRules.push(rule.appliedRule);
    supportingDecision.decisionReasons.push(rule.reason);
    primaryDecision.supports.add(rule.supportingFindingId);

    supportLinks.push({
      appliedRule: rule.appliedRule,
      primaryFindingId: rule.primaryFindingId,
      reason: rule.reason,
      supportingFindingId: rule.supportingFindingId
    });
  }

  const presenceBeatsAbsencePairs = [
    {
      absenceIds: ["privacy_policy_missing_surface", "privacy_policy_unavailable"],
      presentId: "privacy_policy_present"
    },
    {
      absenceIds: ["terms_missing_surface", "terms_unavailable"],
      presentId: "terms_of_service_present"
    },
    {
      absenceIds: ["cookie_policy_missing_surface", "cookie_policy_unavailable"],
      presentId: "cookie_policy_present"
    },
    {
      absenceIds: ["contact_page_missing_surface", "contact_page_unavailable"],
      presentId: "contact_support_path_present"
    }
  ] as const;

  for (const pair of presenceBeatsAbsencePairs) {
    const presentDecision = decisionsById.get(pair.presentId);
    const presentPacket = packetsById.get(pair.presentId);
    if (!presentDecision || !presentPacket || presentDecision.decisionState === "suppressed") {
      continue;
    }

    const presentEvidenceStrongEnough =
      presentPacket.confidenceInputs.hasCorroboratedPositiveSurfaceEvidence ||
      presentPacket.confidenceInputs.hasReadableSurfaceSnippetEvidence;
    if (!presentEvidenceStrongEnough) {
      continue;
    }

    for (const absenceId of pair.absenceIds) {
      const absenceDecision = decisionsById.get(absenceId);
      const absencePacket = packetsById.get(absenceId);
      if (!absenceDecision || !absencePacket || absenceDecision.decisionState === "suppressed") {
        continue;
      }

      if (absencePacket.details?.family !== "coverage_gap" || !hasWeakCoverageEvidence(absencePacket)) {
        continue;
      }

      absenceDecision.decisionState = "suppressed";
      absenceDecision.reportLane = "suppressed";
      absenceDecision.surfaceTier = "support";
      absenceDecision.suppressedBy = pair.presentId;
      absenceDecision.appliedRules.push("precedence.present_surface_beats_weak_absence");
      absenceDecision.decisionReasons.push(
        "A retained positive surface with stronger page evidence outranked this weaker contradictory absence finding."
      );
    }
  }

  const strongFetchedTargets = new Map<string, string>();
  for (const [findingId, packet] of packetsById) {
    if (packet.details?.family === "coverage_gap") {
      continue;
    }
    if (packet.evidence?.fetchQuality !== "verified_content" && packet.evidence?.fetchQuality !== "thin_content") {
      continue;
    }

    for (const url of [...(packet.evidence?.pageUrls ?? []), ...(packet.evidence?.sourceUrls ?? [])]) {
      const normalized = normalizeComparableUrl(url);
      if (normalized) {
        strongFetchedTargets.set(normalized, findingId);
      }
    }
  }

  for (const [findingId, packet] of packetsById) {
    if (packet.details?.family !== "coverage_gap" || packet.details.gapKind !== "fetch_failed") {
      continue;
    }

    const decision = decisionsById.get(findingId);
    if (!decision || decision.decisionState === "suppressed") {
      continue;
    }

    const attemptedTargets = [
      ...(packet.details.attemptedUrls ?? []),
      ...(packet.evidence?.pageUrls ?? []),
      ...(packet.evidence?.sourceUrls ?? [])
    ]
      .map((url) => normalizeComparableUrl(url))
      .filter((value): value is string => Boolean(value));
    const overlappingTarget = attemptedTargets.find((target) => strongFetchedTargets.has(target));
    if (!overlappingTarget) {
      continue;
    }

    decision.decisionState = "suppressed";
    decision.reportLane = "suppressed";
    decision.surfaceTier = "support";
    decision.suppressedBy = strongFetchedTargets.get(overlappingTarget);
    decision.appliedRules.push("precedence.present_surface_beats_weak_absence");
    decision.decisionReasons.push(
      "Another retained finding already verified the same target URL, so this contradictory fetch-failed gap was suppressed."
    );
  }

  const boundedDiscoveryDecision = decisionsById.get("bounded_key_page_discovery_unresolved");
  if (boundedDiscoveryDecision && boundedDiscoveryDecision.decisionState !== "suppressed") {
    for (const findingId of ["privacy_policy_missing_surface", "terms_missing_surface"] as const) {
      const decision = decisionsById.get(findingId);
      const packet = packetsById.get(findingId);
      if (!decision || !packet || decision.decisionState === "suppressed") {
        continue;
      }

      if (decision.decisionState === "confirmed" && !hasStrongCoverageEvidence(packet)) {
        decision.decisionState = "review";
        decision.reportLane = "confidence_and_coverage";
        decision.appliedRules.push("evidence.coverage_gap.degrade_with_unresolved_discovery");
        decision.decisionReasons.push(
          "A bounded-discovery unresolved sibling means this absence finding should stay review-level rather than confirmed."
        );
      }
    }
  }

  const regulatorMockDecision = decisionsById.get("regulator_operated_mock_investment_example");
  if (regulatorMockDecision && regulatorMockDecision.decisionState !== "suppressed") {
    for (const findingId of ["accessibility_risk_score"] as const) {
      const decision = decisionsById.get(findingId);
      if (!decision || decision.decisionState === "suppressed") {
        continue;
      }

      decision.decisionState = "suppressed";
      decision.reportLane = "suppressed";
      decision.surfaceTier = "support";
      decision.suppressedBy = "regulator_operated_mock_investment_example";
      decision.appliedRules.push("precedence.regulator_mock_context_suppresses_generic_coverage");
      decision.decisionReasons.push(
        "Regulator-operated mock context already frames the scan, so generic coverage/risk-score context was suppressed rather than surfaced separately."
      );
    }
  }

  for (const [findingId, decision] of decisionsById) {
    if (decision.decisionState !== "support_only") {
      continue;
    }

    const policy = UNIFIED_FINDING_SURFACING_POLICY_REGISTRY[findingId as ReportUnifiedFindingId];
    const fallback = policy?.orphanedSupportFallback ?? (decision.family === "positive_surface" ? "suppressed" : "review");

    if (decision.supportedBy) {
      continue;
    }

    if (decision.family === "positive_surface") {
      decision.reportLane = "confidence_and_coverage";
      decision.appliedRules.push("support.orphan_positive_surface_retained");
      decision.decisionReasons.push(
        "No stronger lead finding required this positive surface as support, so it was retained in confidence-and-coverage instead of the ranked findings model."
      );
      continue;
    }

    if (
      findingId === "blocking_overlay_observed" ||
      findingId === "sensitive_collection_surface_observed" ||
      findingId === "weak_cookie_security_attributes"
    ) {
      decision.reportLane = "confidence_and_coverage";
      decision.surfaceTier = "support";
      decision.appliedRules.push("evidence.context.keep_review");
      decision.decisionReasons.push(
        findingId === "blocking_overlay_observed"
          ? "No stronger consent or tracking finding required the blocking overlay as support, so it remains supporting context rather than a standalone finding."
          : findingId === "sensitive_collection_surface_observed"
            ? "No stronger tracking, replay, or transmission finding required the sensitive collection surface as support, so it remains supporting context rather than a standalone finding."
            : "No stronger cookie or tracking finding required weak cookie attributes as support, so they remain security posture context rather than a standalone finding."
      );
      continue;
    }

    if (fallback === "review") {
      decision.decisionState = "review";
      decision.appliedRules.push("support.orphan_support_promoted_to_review");
      decision.decisionReasons.push(
        "No stronger surfaced finding remained to attach this support-only finding to, so it was promoted to a standalone review finding."
      );
    } else {
      decision.decisionState = "suppressed";
      decision.reportLane = "suppressed";
      decision.surfaceTier = "support";
      decision.appliedRules.push("support.orphan_support_suppressed");
      decision.decisionReasons.push(
        "No stronger surfaced finding remained to attach this support-only finding to, so it was suppressed."
      );
    }
  }

  return supportLinks;
}

function finalizeDecision(decision: MutableDecision): UnifiedFindingSurfacingDecision {
  const reportable = decision.decisionState !== "suppressed";
  return {
    appliedRules: decision.appliedRules,
    decisionReasons: decision.decisionReasons,
    decisionState: decision.decisionState,
    family: decision.family,
    policyVersion: REPORT_SURFACING_POLICY_VERSION,
    reportLane: decision.decisionState === "suppressed" ? "suppressed" : decision.reportLane,
    reportable,
    surfaceTier: decision.decisionState === "suppressed" ? "support" : decision.surfaceTier,
    supportTargetId: decision.supportedBy,
    supportedBy: decision.supportedBy,
    suppressedBy: decision.suppressedBy,
    supports: [...decision.supports],
    unifiedFindingId: decision.unifiedFindingId,
    usedFamilyDefault: decision.usedFamilyDefault,
    usedFindingOverride: decision.usedFindingOverride
  };
}

export function mapSurfacingDecisionToLegacyStatus(decision: UnifiedFindingSurfacingDecision) {
  if (decision.decisionState === "suppressed" || decision.reportLane === "suppressed") {
    return "suppress" as const;
  }

  if (decision.reportLane === "confidence_and_coverage") {
    return "audit_only" as const;
  }

  if (
    (decision.decisionState === "support_only" || decision.decisionState === "material_incomplete") &&
    decision.reportLane !== "main"
  ) {
    return "audit_only" as const;
  }

  return "surface" as const;
}

export function getSurfacingDecisionSortPriority(decision: UnifiedFindingSurfacingDecision) {
  const laneWeight = decision.reportLane === "main" ? 100 : decision.reportLane === "confidence_and_coverage" ? 40 : 0;
  const stateWeight =
    decision.decisionState === "confirmed"
      ? 40
      : decision.decisionState === "review"
        ? 20
        : decision.decisionState === "material_incomplete"
          ? 12
          : decision.decisionState === "support_only"
            ? 10
            : 0;
  const tierWeight =
    decision.surfaceTier === "headline" ? 30 : decision.surfaceTier === "section" ? 20 : decision.surfaceTier === "secondary" ? 10 : 0;

  return laneWeight + stateWeight + tierWeight;
}

export function validateUnifiedFindingSurfacingPolicyRegistry(
  registry: Partial<Record<ReportUnifiedFindingId, UnifiedFindingSurfacingPolicyEntry>>
) {
  const issues: ValidationIssue[] = [];
  const expectedIds = new Set(REPORT_UNIFIED_FINDINGS.map((finding) => finding.id));
  const actualIds = new Set(Object.keys(registry));

  for (const findingId of expectedIds) {
    const entry = registry[findingId];
    if (!entry) {
      issues.push({ findingId, issue: "missing_policy_entry" });
      continue;
    }

    if (!entry.family) {
      issues.push({ findingId, issue: "missing_family" });
    }
    if (!entry.findingId) {
      issues.push({ findingId, issue: "missing_finding_id" });
    }
  }

  for (const findingId of actualIds) {
    if (!expectedIds.has(findingId)) {
      issues.push({ findingId, issue: "unexpected_policy_entry" });
    }
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

export function validateUnifiedFindingSurfacingPolicyEntries() {
  return validateUnifiedFindingSurfacingPolicyRegistry(UNIFIED_FINDING_SURFACING_POLICY_REGISTRY);
}

export function evaluateUnifiedFindingSurfacing(input: {
  packets: UnifiedFindingPacket[];
}): UnifiedFindingSurfacingEvaluation {
  const packetsById = new Map(input.packets.map((packet) => [packet.unifiedFindingId, packet]));
  const decisionsById = new Map<string, MutableDecision>();

  for (const packet of input.packets) {
    const policy = UNIFIED_FINDING_SURFACING_POLICY_REGISTRY[packet.unifiedFindingId as ReportUnifiedFindingId] ?? null;
    const decision = createInitialDecision(packet, policy);
    decisionsById.set(packet.unifiedFindingId, decision);
  }

  for (const packet of input.packets) {
    const policy = UNIFIED_FINDING_SURFACING_POLICY_REGISTRY[packet.unifiedFindingId as ReportUnifiedFindingId] ?? null;
    const decision = decisionsById.get(packet.unifiedFindingId);
    if (!policy || !decision) {
      continue;
    }

    applyFindingSpecificRules({
      allPacketsById: packetsById,
      decision,
      packet,
      policy,
      siblingDecisionsById: decisionsById
    });
  }

  const supportLinks = applyCrossFindingRules(decisionsById, packetsById);

  const finalized = [...decisionsById.values()].map((decision) => finalizeDecision(decision));
  const surfacedFindings = finalized.filter((decision) => decision.reportable);
  const suppressedFindings = finalized.filter((decision) => !decision.reportable);

  return {
    debugDecisions: finalized,
    policyVersion: REPORT_SURFACING_POLICY_VERSION,
    supportLinks,
    surfacedFindings,
    suppressedFindings
  };
}
