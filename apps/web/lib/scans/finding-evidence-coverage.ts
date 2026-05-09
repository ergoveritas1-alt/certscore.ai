import {
  FINDING_EVIDENCE_CONTRACTS,
  getFindingEvidenceContractForFindingOrUnifiedId,
  getFindingEvidenceContractForUnifiedFinding
} from "./finding-evidence-contracts";

export type FindingEvidenceCoverageEntry = {
  ws01FindingIds: string[];
  unifiedFindingId: string;
  reportFindingId: string;
  contractFindingId: string | null;
  nonContractRationaleId: string | null;
};

export type FindingEvidenceNonContractRationale = {
  id: string;
  findingIds: string[];
  owner: "accessibility_validation" | "financial_validation" | "security_posture_support";
  rationale: string;
};

export const FINDING_EVIDENCE_NON_CONTRACT_RATIONALES: readonly FindingEvidenceNonContractRationale[] = [
  {
    id: "accessibility_rule_level_validation",
    findingIds: [
      "contrast_failures",
      "focus_management_issue",
      "critical_form_completion_barrier",
      "keyboard_navigation_accessibility_issue",
      "keyboard_only_task_completion_blocked",
      "semantic_labeling_accessibility_issue",
      "text_alternative_accessibility_issue",
      "visual_contrast_accessibility_issue"
    ],
    owner: "accessibility_validation",
    rationale:
      "Accessibility headline findings are governed by the accessibility validation pipeline and retained axe/rule-level examples. They are evidence observations, not WS01 privacy-runtime contract findings."
  },
  {
    id: "financial_claim_validation_contract",
    findingIds: [
      "financial_urgency_pressure_tactic_detected",
      "guaranteed_or_high_return_claims_present",
      "high_risk_product_risk_disclosure_missing",
      "hypothetical_performance_disclosure_missing",
      "investment_risk_disclosure_missing",
      "performance_claims_without_context",
      "regulatory_registration_disclosure_absent",
      "simulated_performance_without_disclosure",
      "unqualified_superlative_claim_detected",
      "yield_or_return_claims_high_risk"
    ],
    owner: "financial_validation",
    rationale:
      "High-risk financial promotion findings are governed by the financial validation and judge contracts, which require retained page evidence, claim snippets, and context without moving legal interpretation into WS01."
  },
  {
    id: "cookie_security_posture_support",
    findingIds: ["weak_cookie_security_attributes"],
    owner: "security_posture_support",
    rationale:
      "Weak cookie security attributes are retained as session/security posture evidence and supporting context for stronger cookie, tracking, sensitive-data, and disclosure findings. They promote only when concrete cookie names/attributes indicate security-sensitive or repeated high-risk cookie weakness."
  }
] as const;

export const FINDING_EVIDENCE_ID_COVERAGE: readonly FindingEvidenceCoverageEntry[] = [
  {
    ws01FindingIds: ["pre_consent_tracking_detected", "preconsent_tracking"],
    unifiedFindingId: "preconsent_tracking",
    reportFindingId: "pre_consent_tracking_detected",
    contractFindingId: "pre_consent_tracking_detected",
    nonContractRationaleId: null
  },
  {
    ws01FindingIds: ["third_party_tracking_before_consent"],
    unifiedFindingId: "preconsent_tracking",
    reportFindingId: "third_party_tracking_pre_consent",
    contractFindingId: "third_party_tracking_before_consent",
    nonContractRationaleId: null
  },
  {
    ws01FindingIds: ["tracking_cookies_set_before_consent", "third_party_cookie_pre_consent"],
    unifiedFindingId: "preconsent_tracking",
    reportFindingId: "third_party_cookie_pre_consent",
    contractFindingId: "tracking_cookies_set_before_consent",
    nonContractRationaleId: null
  },
  {
    ws01FindingIds: ["analytics_cookies_before_consent", "analytics_cookie_pre_consent"],
    unifiedFindingId: "preconsent_tracking",
    reportFindingId: "analytics_cookie_pre_consent",
    contractFindingId: "analytics_cookies_before_consent",
    nonContractRationaleId: null
  },
  {
    ws01FindingIds: ["non_essential_tracking_continued_after_reject"],
    unifiedFindingId: "reject_did_not_reduce_tracking",
    reportFindingId: "reject_tracking_persists_after_reject",
    contractFindingId: "non_essential_tracking_continued_after_reject",
    nonContractRationaleId: null
  },
  {
    ws01FindingIds: ["reject_option_missing_or_hidden", "reject_button_missing"],
    unifiedFindingId: "reject_button_missing",
    reportFindingId: "reject_option_missing_or_hidden",
    contractFindingId: "reject_option_missing_or_hidden",
    nonContractRationaleId: null
  },
  {
    ws01FindingIds: ["cookie_disclosure_gap"],
    unifiedFindingId: "cookie_disclosure_gap",
    reportFindingId: "cookie_disclosure_gap",
    contractFindingId: "cookie_disclosure_gap",
    nonContractRationaleId: null
  },
  {
    ws01FindingIds: ["cpra_cba_opt_out_missing"],
    unifiedFindingId: "cpra_cba_opt_out_missing",
    reportFindingId: "cpra_cba_opt_out_missing",
    contractFindingId: "cpra_cba_opt_out_missing",
    nonContractRationaleId: null
  },
  {
    ws01FindingIds: ["cross_domain_identifier_sharing_observed"],
    unifiedFindingId: "cross_domain_identifier_sharing_observed",
    reportFindingId: "cross_domain_identifier_sharing_observed",
    contractFindingId: "cross_domain_identifier_sharing_observed",
    nonContractRationaleId: null
  },
  {
    ws01FindingIds: ["session_replay_on_sensitive_input_surface"],
    unifiedFindingId: "session_replay_on_sensitive_input_surface",
    reportFindingId: "session_replay_on_sensitive_input_surface",
    contractFindingId: "session_replay_on_sensitive_input_surface",
    nonContractRationaleId: null
  },
  {
    ws01FindingIds: ["sensitive_data_collection_with_third_party_tracking_present"],
    unifiedFindingId: "sensitive_data_collection_with_third_party_tracking_present",
    reportFindingId: "sensitive_data_collection_with_third_party_tracking_present",
    contractFindingId: "sensitive_data_collection_with_third_party_tracking_present",
    nonContractRationaleId: null
  },
  {
    ws01FindingIds: ["video_content_tracking_exposure"],
    unifiedFindingId: "video_content_tracking_exposure",
    reportFindingId: "video_content_tracking_exposure",
    contractFindingId: "video_content_tracking_exposure",
    nonContractRationaleId: null
  },
  {
    ws01FindingIds: ["fingerprinting_observed", "probable_fingerprinting"],
    unifiedFindingId: "fingerprinting_observed",
    reportFindingId: "probable_fingerprinting",
    contractFindingId: "fingerprinting_observed",
    nonContractRationaleId: null
  },
  {
    ws01FindingIds: [
      "focus_management_issue",
      "keyboard_navigation_accessibility_issue",
      "semantic_labeling_accessibility_issue",
      "text_alternative_accessibility_issue",
      "visual_contrast_accessibility_issue"
    ],
    unifiedFindingId: "keyboard_navigation_accessibility_issue",
    reportFindingId: "keyboard_navigation_accessibility_issue",
    contractFindingId: null,
    nonContractRationaleId: "accessibility_rule_level_validation"
  },
  {
    ws01FindingIds: ["guaranteed_or_high_return_claims_present", "yield_or_return_claims_high_risk"],
    unifiedFindingId: "guaranteed_or_high_return_claims_present",
    reportFindingId: "guaranteed_or_high_return_claims_present",
    contractFindingId: null,
    nonContractRationaleId: "financial_claim_validation_contract"
  },
  {
    ws01FindingIds: ["weak_cookie_security_attributes"],
    unifiedFindingId: "weak_cookie_security_attributes",
    reportFindingId: "weak_cookie_security_attributes",
    contractFindingId: null,
    nonContractRationaleId: "cookie_security_posture_support"
  }
] as const;

const CONTRACT_IDS = new Set<string>(FINDING_EVIDENCE_CONTRACTS.map((contract) => contract.findingId));
const RATIONALE_IDS = new Set(FINDING_EVIDENCE_NON_CONTRACT_RATIONALES.map((rationale) => rationale.id));

export function validateFindingEvidenceCoverage() {
  const errors: string[] = [];

  for (const entry of FINDING_EVIDENCE_ID_COVERAGE) {
    if (!entry.contractFindingId && !entry.nonContractRationaleId) {
      errors.push(`${entry.unifiedFindingId} has neither a contract nor a non-contract rationale.`);
    }
    if (entry.contractFindingId && !CONTRACT_IDS.has(entry.contractFindingId)) {
      errors.push(`${entry.unifiedFindingId} references unknown contract ${entry.contractFindingId}.`);
    }
    if (entry.contractFindingId && getFindingEvidenceContractForFindingOrUnifiedId(entry.contractFindingId)?.findingId !== entry.contractFindingId) {
      errors.push(`${entry.unifiedFindingId} contract ${entry.contractFindingId} is not directly addressable by finding ID.`);
    }
    if (entry.contractFindingId && !getFindingEvidenceContractForUnifiedFinding(entry.unifiedFindingId)) {
      errors.push(`${entry.unifiedFindingId} is not routed through a contract.`);
    }
    if (entry.nonContractRationaleId && !RATIONALE_IDS.has(entry.nonContractRationaleId)) {
      errors.push(`${entry.unifiedFindingId} references unknown rationale ${entry.nonContractRationaleId}.`);
    }
  }

  return errors;
}
