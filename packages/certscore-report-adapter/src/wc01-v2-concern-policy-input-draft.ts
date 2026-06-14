import {
  containsBlockedRawFields,
  containsForbiddenGapObservedToken,
} from "./wc01-shadow-output";
import {
  type Wc01V2AllowlistDryRun,
  type Wc01V2NormalizedConcernCandidateDraft,
} from "./wc01-v2-allowlist-bridge";

export const WC01_V2_CONCERN_POLICY_INPUT_DRAFT_VERSION =
  "wc01.v2_concern_policy_input_draft.1";

export type SensitiveContextCategory =
  | "health"
  | "reproductive_health"
  | "children_education"
  | "public_benefits"
  | "employment_hr"
  | "finance"
  | "behavioral_analytics_reference"
  | "unknown_sensitive_context";

export type SensitiveContextReview = {
  sensitiveContextFlag: boolean;
  sensitiveContextCategories: SensitiveContextCategory[];
  requiresExtraPolicyReview: boolean;
  reason?: string;
};

export type ReviewLanguage = {
  allowedPhrases: string[];
  prohibitedPhraseKeys: string[];
  suggestedInternalSummary: string;
};

type Wc01V2ConcernInputFamily =
  | "pre_consent_tracking"
  | "pre_consent_cookie_storage"
  | "session_replay_behavioral_analytics";

export type Wc01V2ConcernPolicyInputDraft = {
  draftVersion: typeof WC01_V2_CONCERN_POLICY_INPUT_DRAFT_VERSION;
  source: {
    url?: string;
    scanId?: string;
    reviewId?: string;
    allowlistDryRunVersion: string;
  };
  productionEligible: false;
  status: "draft_review_only";
  concernInputs: Wc01V2ConcernInputDraft[];
  blockedCandidates: Wc01V2ConcernInputBlockedCandidate[];
  guardrails: {
    noGapObserved: true;
    noTopFindingEligibility: true;
    noGapEligibility: true;
    noProductionEligibility: true;
    noRawBlockedFields: true;
    noLegalConclusionLanguage: true;
  };
};

export type Wc01V2ConcernInputDraft = {
  inputId: string;
  sourceRowId: string;
  sourceFindingKey: string;
  proposedConcernKey: string;
  proposedConcernFamily: Wc01V2ConcernInputFamily;
  reviewStatus: "review_only_candidate";
  productionEligible: false;
  topFindingEligible: false;
  gapEligible: false;
  sourceContext: {
    sourceUrl?: string;
    scanId?: string;
    reviewId?: string;
    shadowStatus: string;
    shadowWc01AssessmentStatus: string;
    sourceModules: string[];
    moduleStatusContextAvailable: boolean;
    coverageLimitations: string[];
  };
  suggestedNormalizedConcern: {
    concernKey: string;
    concernFamily: string;
    regulatoryLensCandidates: string[];
    evidenceFamily: string;
    narrativeTier: "internal_review_only";
  };
  evidenceRefs: {
    excerptIds: string[];
    sourceRefIds: string[];
    displaySafeExcerptCount: number;
    capped: boolean;
    omittedCount: number;
  };
  evidenceAssessment: {
    confidenceBand?: string;
    directnessClassification?: string;
    preConsentOrConsentStateContext: string[];
    vendorPurposeBasis: string[];
    sourceMatchedCriteria: string[];
    sourceCaveats: string[];
    blockedOrDemotionReasons: string[];
    requiredEvidence: string[];
    familySpecificCaveats: string[];
    familyGateId: string;
    familyGateSatisfied: true;
  };
  sensitiveContextReview: SensitiveContextReview;
  vendors: Array<{
    name: string;
    product?: string;
    supportingPurposes: string[];
    diagnosticPurposes: string[];
  }>;
  policyGates: {
    requiresConcernPolicyReview: true;
    requiresEvidenceContractReview: true;
    requiresCopyReview: true;
    requiresTopFindingPolicyReview: true;
    blockers: string[];
    caveats: string[];
  };
  reviewLanguage: ReviewLanguage;
};

export type Wc01V2ConcernInputBlockedCandidate = {
  sourceRowId: string;
  sourceFindingKey: string;
  proposedConcernFamily?: string;
  proposedConcernKey?: string;
  blockReasons: string[];
};

type ConcernPolicyInputEvaluation =
  | { converted: true; input: Wc01V2ConcernInputDraft }
  | { converted: false; blocked: Wc01V2ConcernInputBlockedCandidate };

const ALLOWED_ALLOWLIST_DRY_RUN_VERSION = "wc01.v2_allowlist_dry_run.1";

const ALLOWED_CONCERN_FAMILIES = new Set([
  "pre_consent_tracking",
  "pre_consent_cookie_storage",
  "session_replay_behavioral_analytics",
]);

const BLOCKED_SOURCE_FINDING_KEYS = new Set([
  "third_party_vendors_observed",
  "consent_banner_observed_or_not_observed",
]);

const TIER_C_DIAGNOSTIC_PURPOSES = new Set([
  "security",
  "performance_monitoring",
  "customer_support",
  "cdn",
  "static",
  "site_owned_infrastructure",
  "infrastructure",
  "fraud_prevention",
  "bot_defense",
  "rum",
  "live_chat",
  "unknown",
]);

const FAMILY_CAVEATS: Record<Wc01V2ConcernInputFamily, string[]> = {
  pre_consent_tracking: [
    "analytics_and_advertising_not_automatically_equivalent_policy_review_required",
  ],
  pre_consent_cookie_storage: [
    "cookie_storage_separate_from_pre_consent_tracking_unless_policy_owners_approve_merge",
    "first_party_cmp_security_necessary_functional_unknown_only_storage_excluded",
  ],
  session_replay_behavioral_analytics: [
    "collection_endpoint_or_equivalent_strong_runtime_evidence_required",
    "library_only_evidence_blocked",
    "no_claim_recording_occurred_sensitive_fields_captured_or_person_identified",
  ],
};

const REQUIRED_EVIDENCE_BY_FAMILY: Record<Wc01V2ConcernInputFamily, string[]> = {
  pre_consent_tracking: [
    "direct_runtime_evidence",
    "pre_consent_or_consent_state_context",
    "source_refs",
    "display_safe_excerpts",
    "confidence_and_directness",
    "vendor_purpose_basis",
    "no_tier_c_diagnostic_purposes",
    "no_tag_management_or_consent_management_only_support",
  ],
  pre_consent_cookie_storage: [
    "direct_cookie_or_storage_evidence",
    "pre_consent_or_consent_state_context",
    "source_refs",
    "display_safe_excerpts",
    "cookie_or_storage_party_context_if_available",
    "vendor_purpose_basis",
    "exclude_first_party_cmp_security_necessary_functional_unknown_only_storage",
  ],
  session_replay_behavioral_analytics: [
    "collection_endpoint_or_equivalent_strong_runtime_evidence",
    "library_only_evidence_blocked",
    "source_refs",
    "display_safe_excerpts",
    "confidence_and_directness",
    "vendor_purpose_basis",
    "no_tag_only_support",
    "no_support_live_chat_or_rum_only_support",
  ],
};

const SENSITIVE_CONTEXT_BY_DOMAIN: Record<string, SensitiveContextCategory[]> = {
  "healthline.com": ["health"],
  "plannedparenthood.org": ["reproductive_health"],
  "bedsider.org": ["reproductive_health"],
  "bankofamerica.com": ["finance"],
  "benefits.gov": ["public_benefits"],
  "ssa.gov": ["public_benefits"],
  "pbskids.org": ["children_education"],
  "greenhouse.com": ["employment_hr"],
  "workday.com": ["employment_hr"],
  "hotjar.com": ["behavioral_analytics_reference"],
  "fullstory.com": ["behavioral_analytics_reference"],
};

const REVIEW_LANGUAGE_ALLOWED_PHRASES = [
  "Runtime signal observed before consent action.",
  "Review recommended based on retained runtime evidence.",
  "Observed vendor purpose requires policy review.",
  "Coverage limitation: consent action could not be confidently completed.",
  "Insufficient evidence for customer-facing conclusion.",
];

const REVIEW_LANGUAGE_PROHIBITED_PHRASE_KEYS = [
  "prohibited_legal_determination_term_v",
  "prohibited_legal_determination_term_i",
  "prohibited_legal_determination_term_nc",
  "prohibited_legal_determination_term_b",
  "prohibited_consent_failure_claim",
  "prohibited_tracking_lawfulness_claim",
  "prohibited_privacy_gap_confirmation_claim",
  "prohibited_gap_status_token",
];

const LEGAL_CONCLUSION_PATTERN =
  /\b(gap_observed|violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i;

export function parseWc01V2AllowlistDryRunJson(raw: string): Wc01V2AllowlistDryRun {
  if (containsForbiddenGapObservedToken(raw)) {
    throw new Error("Wc01V2AllowlistDryRun contains forbidden gap status token.");
  }
  if (containsBlockedRawFields(raw)) {
    throw new Error("Wc01V2AllowlistDryRun contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(raw)) {
    throw new Error("Wc01V2AllowlistDryRun contains legal-conclusion language.");
  }

  const parsed = JSON.parse(raw) as unknown;
  validateAllowlistDryRun(parsed);
  return parsed;
}

export function projectAllowlistDryRunToConcernPolicyInputDraft(
  allowlist: Wc01V2AllowlistDryRun,
): Wc01V2ConcernPolicyInputDraft {
  validateAllowlistDryRun(allowlist);

  const concernInputs: Wc01V2ConcernInputDraft[] = [];
  const blockedCandidates: Wc01V2ConcernInputBlockedCandidate[] = [];

  for (const candidate of allowlist.candidates) {
    const evaluated = evaluateCandidate(candidate);
    if (evaluated.converted) {
      concernInputs.push(evaluated.input);
    } else {
      blockedCandidates.push(evaluated.blocked);
    }
  }

  const draft: Wc01V2ConcernPolicyInputDraft = {
    draftVersion: WC01_V2_CONCERN_POLICY_INPUT_DRAFT_VERSION,
    source: {
      url: allowlist.source.url,
      scanId: allowlist.source.scanId,
      reviewId: allowlist.source.reviewId,
      allowlistDryRunVersion: allowlist.dryRunVersion,
    },
    productionEligible: false,
    status: "draft_review_only",
    concernInputs,
    blockedCandidates,
    guardrails: {
      noGapObserved: true,
      noTopFindingEligibility: true,
      noGapEligibility: true,
      noProductionEligibility: true,
      noRawBlockedFields: true,
      noLegalConclusionLanguage: true,
    },
  };

  assertConcernInputGuardrails(draft);
  return draft;
}

export function projectAllowlistDryRunJsonToConcernPolicyInputDraft(raw: string) {
  return projectAllowlistDryRunToConcernPolicyInputDraft(parseWc01V2AllowlistDryRunJson(raw));
}

function evaluateCandidate(candidate: Wc01V2NormalizedConcernCandidateDraft): ConcernPolicyInputEvaluation {
  const blockReasons = candidateBlockReasons(candidate);
  if (blockReasons.length > 0) {
    return {
      converted: false,
      blocked: {
        sourceRowId: candidate.source.rowId,
        sourceFindingKey: candidate.source.sourceFindingKey,
        proposedConcernFamily: candidate.proposedConcernFamily,
        proposedConcernKey: candidate.proposedConcernKey,
        blockReasons,
      },
    };
  }

  return {
    converted: true,
    input: {
      inputId: inputIdForCandidate(candidate),
      sourceRowId: candidate.source.rowId,
      sourceFindingKey: candidate.source.sourceFindingKey,
      proposedConcernKey: candidate.proposedConcernKey,
      proposedConcernFamily: candidate.proposedConcernFamily as Wc01V2ConcernInputDraft["proposedConcernFamily"],
      reviewStatus: "review_only_candidate",
      productionEligible: false,
      topFindingEligible: false,
      gapEligible: false,
      sourceContext: {
        sourceUrl: candidate.source.url,
        scanId: candidate.source.scanId,
        reviewId: candidate.source.reviewId,
        shadowStatus: candidate.source.shadowStatus,
        shadowWc01AssessmentStatus: candidate.source.shadowWc01AssessmentStatus,
        sourceModules: [],
        moduleStatusContextAvailable: false,
        coverageLimitations: inferredCoverageLimitations(candidate),
      },
      suggestedNormalizedConcern: suggestedConcernForFamily(candidate.proposedConcernFamily),
      evidenceRefs: {
        excerptIds: uniqueStrings(candidate.evidence.excerptIds),
        sourceRefIds: uniqueStrings(candidate.evidence.sourceRefIds),
        displaySafeExcerptCount: Math.max(0, candidate.evidence.displaySafeExcerptCount),
        capped: Boolean(candidate.evidence.capped),
        omittedCount: Math.max(0, candidate.evidence.omittedCount),
      },
      evidenceAssessment: {
        confidenceBand: candidate.confidence.band,
        directnessClassification: candidate.confidence.directVsInferred,
        preConsentOrConsentStateContext: preConsentOrConsentStateContext(candidate),
        vendorPurposeBasis: uniqueStrings(candidate.purposeClassification.supportingPurposes),
        sourceMatchedCriteria: uniqueStrings(candidate.gate.matchedCriteria),
        sourceCaveats: uniqueStrings(candidate.gate.caveats),
        blockedOrDemotionReasons: uniqueStrings(candidate.gate.caveats),
        requiredEvidence: REQUIRED_EVIDENCE_BY_FAMILY[candidate.proposedConcernFamily as Wc01V2ConcernInputFamily],
        familySpecificCaveats: FAMILY_CAVEATS[candidate.proposedConcernFamily as Wc01V2ConcernInputFamily],
        familyGateId: candidate.gate.gateId,
        familyGateSatisfied: true,
      },
      sensitiveContextReview: sensitiveContextForUrl(candidate.source.url),
      vendors: candidate.vendors.map((vendor) => ({
        name: vendor.name,
        product: vendor.product,
        supportingPurposes: uniqueStrings(vendor.purposes.filter((purpose) =>
          candidate.purposeClassification.supportingPurposes.includes(purpose)
        )),
        diagnosticPurposes: uniqueStrings(vendor.purposes.filter((purpose) =>
          candidate.purposeClassification.diagnosticPurposes.includes(purpose)
        )),
      })),
      policyGates: {
        requiresConcernPolicyReview: true,
        requiresEvidenceContractReview: true,
        requiresCopyReview: true,
        requiresTopFindingPolicyReview: true,
        blockers: [],
        caveats: uniqueStrings([
          "dry_run_only",
          "draft_review_only",
          "not_production_concern_policy_input",
          "sensitive_context_flags_review_requirements_only",
          ...FAMILY_CAVEATS[candidate.proposedConcernFamily as Wc01V2ConcernInputFamily],
          ...candidate.gate.caveats,
        ]),
      },
      reviewLanguage: reviewLanguageForCandidate(candidate),
    },
  };
}

function candidateBlockReasons(candidate: Wc01V2NormalizedConcernCandidateDraft) {
  const reasons: string[] = [];
  if (candidate.status !== "candidate_review_only") {
    reasons.push("candidate_status_not_review_only");
  }
  if (candidate.productionEligible !== false) {
    reasons.push("candidate_production_eligible");
  }
  if (candidate.topFindingEligible !== false) {
    reasons.push("candidate_top_finding_eligible");
  }
  if (candidate.gapEligible !== false) {
    reasons.push("candidate_gap_eligible");
  }
  if (BLOCKED_SOURCE_FINDING_KEYS.has(candidate.source.sourceFindingKey)) {
    reasons.push("source_finding_key_not_allowed_for_concern_input_draft");
  }
  if (!ALLOWED_CONCERN_FAMILIES.has(candidate.proposedConcernFamily)) {
    reasons.push("proposed_concern_family_not_allowed");
  }
  if (candidate.purposeClassification.diagnosticPurposes.some((purpose) => TIER_C_DIAGNOSTIC_PURPOSES.has(purpose))) {
    reasons.push("tier_c_diagnostic_purpose_present");
  }
  if (candidate.evidence.sourceRefIds.length === 0) {
    reasons.push("missing_source_refs");
  }
  if (candidate.evidence.excerptIds.length === 0 && candidate.evidence.displaySafeExcerptCount === 0) {
    reasons.push("missing_excerpt_or_display_safe_evidence");
  }
  if (!candidate.confidence.band || candidate.confidence.band === "low") {
    reasons.push("weak_or_missing_confidence_band");
  }
  if (!candidate.confidence.directVsInferred || candidate.confidence.directVsInferred === "unknown" || candidate.confidence.directVsInferred === "inferred") {
    reasons.push("weak_or_missing_directness");
  }
  if (supportingTrackerPurposes(candidate).length === 0) {
    reasons.push("missing_supporting_vendor_purpose_basis");
  }
  if (candidate.proposedConcernFamily === "pre_consent_tracking") {
    if (!hasPreConsentOrConsentStateContext(candidate)) {
      reasons.push("missing_pre_consent_or_consent_state_context");
    }
    if (!hasDirectRuntimeEvidence(candidate)) {
      reasons.push("missing_direct_runtime_evidence");
    }
  }
  if (candidate.proposedConcernFamily === "pre_consent_cookie_storage") {
    if (candidate.source.sourceFindingKey !== "third_party_cookie_pre_consent") {
      reasons.push("missing_direct_cookie_or_storage_evidence");
    }
    if (!hasPreConsentOrConsentStateContext(candidate)) {
      reasons.push("missing_pre_consent_or_consent_state_context");
    }
    if (candidate.purposeClassification.supportingPurposes.some((purpose) =>
      ["strictly_necessary", "consent_management", "security", "customer_support", "unknown"].includes(purpose)
    )) {
      reasons.push("excluded_storage_purpose_present");
    }
  }
  if (candidate.proposedConcernFamily === "session_replay_behavioral_analytics") {
    if (!hasSessionReplayCollectionEvidence(candidate)) {
      reasons.push("missing_session_replay_collection_evidence");
    }
    if (supportingTrackerPurposes(candidate).every((purpose) => purpose === "analytics")) {
      reasons.push("session_replay_requires_stronger_than_generic_analytics_only");
    }
  }
  return uniqueStrings(reasons);
}

function suggestedConcernForFamily(family: string): Wc01V2ConcernInputDraft["suggestedNormalizedConcern"] {
  switch (family) {
    case "pre_consent_tracking":
      return {
        concernKey: "v2_draft.pre_consent_tracking.review_only",
        concernFamily: "pre_consent_tracking",
        regulatoryLensCandidates: ["gdpr_eprivacy", "california_privacy"],
        evidenceFamily: "runtime_pre_consent_collection",
        narrativeTier: "internal_review_only",
      };
    case "pre_consent_cookie_storage":
      return {
        concernKey: "v2_draft.pre_consent_cookie_storage.review_only",
        concernFamily: "pre_consent_cookie_storage",
        regulatoryLensCandidates: ["gdpr_eprivacy", "california_privacy"],
        evidenceFamily: "runtime_pre_consent_cookie_storage",
        narrativeTier: "internal_review_only",
      };
    case "session_replay_behavioral_analytics":
      return {
        concernKey: "v2_draft.session_replay_behavioral_analytics.review_only",
        concernFamily: "session_replay_behavioral_analytics",
        regulatoryLensCandidates: ["gdpr_eprivacy", "california_privacy", "session_replay_review"],
        evidenceFamily: "runtime_session_replay_collection",
        narrativeTier: "internal_review_only",
      };
    default:
      throw new Error(`Unsupported concern family for draft input: ${family}`);
  }
}

function validateAllowlistDryRun(value: unknown): asserts value is Wc01V2AllowlistDryRun {
  if (!isRecord(value)) {
    throw new Error("Wc01V2AllowlistDryRun must be a JSON object.");
  }
  if (value.dryRunVersion !== ALLOWED_ALLOWLIST_DRY_RUN_VERSION) {
    throw new Error("Unsupported Wc01V2AllowlistDryRun version.");
  }
  if (value.productionEligible !== false) {
    throw new Error("Wc01V2AllowlistDryRun must not be production eligible.");
  }
  if (!Array.isArray(value.candidates)) {
    throw new Error("Wc01V2AllowlistDryRun.candidates must be an array.");
  }
  if (!Array.isArray(value.blockedRows)) {
    throw new Error("Wc01V2AllowlistDryRun.blockedRows must be an array.");
  }
  if (value.candidates.some((candidate) => !isRecord(candidate))) {
    throw new Error("Wc01V2AllowlistDryRun candidates must be objects.");
  }
}

function assertConcernInputGuardrails(draft: Wc01V2ConcernPolicyInputDraft) {
  const serialized = JSON.stringify(draft);
  if (containsForbiddenGapObservedToken(serialized)) {
    throw new Error("Concern input draft contains forbidden gap status token.");
  }
  if (containsBlockedRawFields(serialized)) {
    throw new Error("Concern input draft contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(serialized)) {
    throw new Error("Concern input draft contains legal-conclusion language.");
  }
  if (draft.productionEligible !== false) {
    throw new Error("Concern input draft must not be production eligible.");
  }
  if (draft.concernInputs.some((input) => input.productionEligible || input.topFindingEligible || input.gapEligible)) {
    throw new Error("Concern input draft contains eligible rows.");
  }
}

function sensitiveContextForUrl(url: string | undefined): SensitiveContextReview {
  const hostname = hostnameForUrl(url);
  const categories = hostname ? SENSITIVE_CONTEXT_BY_DOMAIN[hostname] ?? [] : [];
  return {
    sensitiveContextFlag: categories.length > 0,
    sensitiveContextCategories: categories,
    requiresExtraPolicyReview: categories.length > 0,
    reason: categories.length > 0
      ? "explicit_policy_stress_context_map"
      : undefined,
  };
}

function hostnameForUrl(url: string | undefined) {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]?.toLowerCase();
  }
}

function preConsentOrConsentStateContext(candidate: Wc01V2NormalizedConcernCandidateDraft) {
  return uniqueStrings([
    ...(candidate.source.sourceFindingKey.includes("pre_consent") ? ["source_finding_key_pre_consent"] : []),
    ...candidate.gate.matchedCriteria.filter((criterion) => /pre_consent|preconsent|consent_state|collection_endpoint/i.test(criterion)),
    ...candidate.gate.caveats.filter((caveat) => /pre_consent|preconsent|consent_state|consent/i.test(caveat)),
  ]);
}

function hasPreConsentOrConsentStateContext(candidate: Wc01V2NormalizedConcernCandidateDraft) {
  return preConsentOrConsentStateContext(candidate).length > 0 ||
    candidate.source.sourceFindingKey === "session_replay_or_behavioral_analytics_observed";
}

function hasDirectRuntimeEvidence(candidate: Wc01V2NormalizedConcernCandidateDraft) {
  const criteria = candidate.gate.matchedCriteria.join(" ");
  return /collection_endpoint_observed|pre_consent_tracking_signal_true|observed_vendor_journey_present|runtime/i.test(criteria) ||
    candidate.source.shadowStatus === "observed";
}

function hasSessionReplayCollectionEvidence(candidate: Wc01V2NormalizedConcernCandidateDraft) {
  const criteria = candidate.gate.matchedCriteria.join(" ");
  return /session_replay_collection_observed|collection_endpoint_observed|behavioral_analytics_collection_observed|session_replay_vendor_observation/i.test(criteria) &&
    !/library_only|library_loaded_only|session_replay_library_observed/i.test(criteria);
}

function supportingTrackerPurposes(candidate: Wc01V2NormalizedConcernCandidateDraft) {
  return uniqueStrings(candidate.purposeClassification.supportingPurposes.filter((purpose) =>
    !["tag_management", "consent_management", ...TIER_C_DIAGNOSTIC_PURPOSES].includes(purpose)
  ));
}

function inferredCoverageLimitations(candidate: Wc01V2NormalizedConcernCandidateDraft) {
  return uniqueStrings(candidate.gate.caveats.filter((caveat) =>
    /coverage|source_module|not_confidently|limitation/i.test(caveat)
  ));
}

function reviewLanguageForCandidate(candidate: Wc01V2NormalizedConcernCandidateDraft): ReviewLanguage {
  return {
    allowedPhrases: REVIEW_LANGUAGE_ALLOWED_PHRASES,
    prohibitedPhraseKeys: REVIEW_LANGUAGE_PROHIBITED_PHRASE_KEYS,
    suggestedInternalSummary: suggestedInternalSummaryForFamily(candidate.proposedConcernFamily),
  };
}

function suggestedInternalSummaryForFamily(family: string) {
  switch (family) {
    case "pre_consent_tracking":
      return "Runtime signal observed before consent action. Review recommended based on retained runtime evidence.";
    case "pre_consent_cookie_storage":
      return "Runtime storage signal observed before consent action. Observed vendor purpose requires policy review.";
    case "session_replay_behavioral_analytics":
      return "Behavioral analytics collection signal observed. Insufficient evidence for customer-facing conclusion.";
    default:
      return "Review recommended based on retained runtime evidence.";
  }
}

function inputIdForCandidate(candidate: Wc01V2NormalizedConcernCandidateDraft) {
  return `v2_concern_input.${sanitizeKey(candidate.source.rowId)}.${sanitizeKey(candidate.proposedConcernFamily)}`;
}

function sanitizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))].sort();
}
