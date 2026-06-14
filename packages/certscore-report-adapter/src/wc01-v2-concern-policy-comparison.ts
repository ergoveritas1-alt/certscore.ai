import {
  containsBlockedRawFields,
  containsForbiddenGapObservedToken,
} from "./wc01-shadow-output";
import {
  type V2NormalizedConcernAdapterDryRun,
  type V2NormalizedConcernCandidateDraft,
  WC01_V2_NORMALIZED_CONCERN_ADAPTER_DRAFT_VERSION,
} from "./wc01-v2-normalized-concern-adapter";

export const WC01_V2_CONCERN_POLICY_COMPARISON_DRY_RUN_VERSION =
  "wc01.v2_concern_policy_comparison_dry_run.1";

export type Wc01V2ConcernPolicyComparisonDryRun = {
  comparisonVersion: typeof WC01_V2_CONCERN_POLICY_COMPARISON_DRY_RUN_VERSION;
  source: {
    adapterVersion: string;
    sourceUrl?: string;
    scanId?: string;
    reviewId?: string;
  };
  productionEligible: false;
  topFindingEligible: false;
  gapEligible: false;
  status: "comparison_review_only";
  candidateCount: number;
  comparisonResults: Wc01V2ConcernPolicyComparisonResult[];
  blockedCandidates: Wc01V2ConcernPolicyComparisonBlockedCandidate[];
  guardrails: {
    noProductionConcernPolicyCall: true;
    noPersistence: true;
    noUnifiedFindings: true;
    noReportMutation: true;
    noChecklistExecutiveScoringImports: true;
    noCustomerFacingCopy: true;
    noGapObserved: true;
    noLegalConclusionLanguage: true;
    noRawBlockedFields: true;
  };
};

export type Wc01V2ConcernPolicyComparisonResult = {
  candidateId: string;
  sourceFindingKey?: string;
  sourceRowId?: string;
  sourceFamily: string;
  proposedNormalizedConcernKey: string;
  simulatedPolicyOutcome:
    | "would_accept_for_internal_review"
    | "would_require_more_evidence"
    | "would_remain_internal_only"
    | "would_be_suppressed";
  wouldPolicyAcceptCandidate: boolean;
  wouldPolicyRequireMoreEvidence: boolean;
  wouldRemainInternalOnly: boolean;
  wouldBeSuppressed: boolean;
  productionEligible: false;
  topFindingEligible: false;
  gapEligible: false;
  reasons: string[];
  missingRequirements: string[];
  reviewerEvidence: Wc01V2ConcernPolicyComparisonReviewerEvidence;
  guardrails: {
    noGapObserved: true;
    noLegalConclusionLanguage: true;
    noRawBlockedFields: true;
    noProductionEligibility: true;
    noTopFindingEligibility: true;
    noGapEligibility: true;
  };
};

export type Wc01V2ConcernPolicyComparisonReviewerEvidence = {
  sourceRefIds: string[];
  displaySafeExcerptIds: string[];
  displaySafeExcerptCount: number;
  vendorNames: string[];
  supportingPurposes: string[];
  diagnosticPurposes: string[];
  confidence: string;
  directness: string;
  sensitiveContext: {
    present: boolean;
    requiresExtraReview: boolean;
    categories: string[];
    requiredReviewReasons: string[];
  };
  familyEvidenceContext: {
    consentStateContext?: {
      phase: string;
      actionObserved?: string;
      sourceRefIds: string[];
    };
    cookieStorageContext?: {
      party: string;
      storageType: string;
      necessaryOrSecurityExcluded: boolean;
      sourceRefIds: string[];
    };
    sessionReplayContext?: {
      collectionEvidence: string;
      libraryOnly: false;
      sourceRefIds: string[];
    };
  };
  caveats: string[];
  coverageLimitations: string[];
  missingCorroborators: string[];
  demotionReasons: string[];
};

export type Wc01V2ConcernPolicyComparisonBlockedCandidate = {
  candidateId?: string;
  proposedNormalizedConcernKey?: string;
  blockReasons: string[];
};

type CandidateEvaluation =
  | { converted: true; result: Wc01V2ConcernPolicyComparisonResult }
  | { converted: false; blocked: Wc01V2ConcernPolicyComparisonBlockedCandidate };

const LEGAL_CONCLUSION_PATTERN =
  /\b(gap_observed|violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i;

const ALLOWED_ADAPTER_VERSION = WC01_V2_NORMALIZED_CONCERN_ADAPTER_DRAFT_VERSION;

const ALLOWED_KEYS = new Set([
  "v2.pre_consent_tracking.candidate",
  "v2.pre_consent_cookie_storage.candidate",
  "v2.session_replay_behavioral_analytics.candidate",
]);

const TIER_C_PURPOSES = new Set([
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

const TAG_OR_CMP_PURPOSES = new Set(["tag_management", "consent_management"]);

const SUPPORTING_PURPOSES = new Set<string>([
  "advertising",
  "analytics",
  "session_replay",
  "marketing_automation",
  "advertising_measurement",
  "identity_resolution",
  "social_pixel",
  "retargeting",
]);

export function parseV2NormalizedConcernCandidateDraftJson(raw: string): V2NormalizedConcernAdapterDryRun {
  if (containsForbiddenGapObservedToken(raw)) {
    throw new Error("V2NormalizedConcernCandidateDraft contains forbidden gap status token.");
  }
  if (containsBlockedRawFields(raw)) {
    throw new Error("V2NormalizedConcernCandidateDraft contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(raw)) {
    throw new Error("V2NormalizedConcernCandidateDraft contains legal-conclusion language.");
  }

  const parsed = JSON.parse(raw) as unknown;
  validateAdapterRun(parsed);
  return parsed;
}

export function compareV2NormalizedConcernCandidates(
  adapterRun: V2NormalizedConcernAdapterDryRun,
): Wc01V2ConcernPolicyComparisonDryRun {
  validateAdapterRun(adapterRun);

  const comparisonResults: Wc01V2ConcernPolicyComparisonResult[] = [];
  const blockedCandidates: Wc01V2ConcernPolicyComparisonBlockedCandidate[] = [];

  for (const candidate of adapterRun.candidates) {
    const evaluated = evaluateCandidate(candidate);
    if (evaluated.converted) {
      comparisonResults.push(evaluated.result);
    } else {
      blockedCandidates.push(evaluated.blocked);
    }
  }

  const comparison: Wc01V2ConcernPolicyComparisonDryRun = {
    comparisonVersion: WC01_V2_CONCERN_POLICY_COMPARISON_DRY_RUN_VERSION,
    source: {
      adapterVersion: adapterRun.adapterRunVersion,
      sourceUrl: adapterRun.source.url,
      scanId: adapterRun.source.scanId,
      reviewId: adapterRun.source.reviewId,
    },
    productionEligible: false,
    topFindingEligible: false,
    gapEligible: false,
    status: "comparison_review_only",
    candidateCount: adapterRun.candidates.length,
    comparisonResults,
    blockedCandidates,
    guardrails: {
      noProductionConcernPolicyCall: true,
      noPersistence: true,
      noUnifiedFindings: true,
      noReportMutation: true,
      noChecklistExecutiveScoringImports: true,
      noCustomerFacingCopy: true,
      noGapObserved: true,
      noLegalConclusionLanguage: true,
      noRawBlockedFields: true,
    },
  };

  assertComparisonGuardrails(comparison);
  return comparison;
}

export function compareV2NormalizedConcernCandidatesJson(raw: string) {
  return compareV2NormalizedConcernCandidates(parseV2NormalizedConcernCandidateDraftJson(raw));
}

function evaluateCandidate(candidate: V2NormalizedConcernCandidateDraft): CandidateEvaluation {
  const malformedReasons = malformedCandidateReasons(candidate);
  if (malformedReasons.length > 0) {
    return {
      converted: false,
      blocked: {
        candidateId: candidateId(candidate),
        proposedNormalizedConcernKey: candidate.proposed?.normalizedConcernKey,
        blockReasons: malformedReasons,
      },
    };
  }

  const suppressionReasons = suppressionReasonsForCandidate(candidate);
  const missingRequirements = missingRequirementsForCandidate(candidate);
  const sensitive = Boolean(candidate.sensitiveContext?.requiresExtraReview);

  let simulatedPolicyOutcome: Wc01V2ConcernPolicyComparisonResult["simulatedPolicyOutcome"];
  if (suppressionReasons.length > 0) {
    simulatedPolicyOutcome = "would_be_suppressed";
  } else if (missingRequirements.length > 0) {
    simulatedPolicyOutcome = "would_require_more_evidence";
  } else if (sensitive) {
    simulatedPolicyOutcome = "would_remain_internal_only";
  } else {
    simulatedPolicyOutcome = "would_accept_for_internal_review";
  }

  return {
    converted: true,
    result: {
      candidateId: candidateId(candidate),
      sourceFindingKey: candidate.source.sourceFindingKey,
      sourceRowId: candidate.source.sourceRowId,
      sourceFamily: candidate.proposed.concernFamily,
      proposedNormalizedConcernKey: candidate.proposed.normalizedConcernKey,
      simulatedPolicyOutcome,
      wouldPolicyAcceptCandidate: simulatedPolicyOutcome === "would_accept_for_internal_review" ||
        simulatedPolicyOutcome === "would_remain_internal_only",
      wouldPolicyRequireMoreEvidence: simulatedPolicyOutcome === "would_require_more_evidence",
      wouldRemainInternalOnly: simulatedPolicyOutcome === "would_remain_internal_only",
      wouldBeSuppressed: simulatedPolicyOutcome === "would_be_suppressed",
      productionEligible: false,
      topFindingEligible: false,
      gapEligible: false,
      reasons: uniqueStrings([
        ...reasonsForOutcome(simulatedPolicyOutcome),
        ...suppressionReasons,
        ...(sensitive ? ["sensitive_context_extra_review_required"] : []),
      ]),
      missingRequirements,
      reviewerEvidence: reviewerEvidenceForCandidate(candidate),
      guardrails: {
        noGapObserved: true,
        noLegalConclusionLanguage: true,
        noRawBlockedFields: true,
        noProductionEligibility: true,
        noTopFindingEligibility: true,
        noGapEligibility: true,
      },
    },
  };
}

function reviewerEvidenceForCandidate(
  candidate: V2NormalizedConcernCandidateDraft,
): Wc01V2ConcernPolicyComparisonReviewerEvidence {
  const supportingPurposeBasis = candidate.evidence.vendorPurposeBasis
    .filter((basis) => SUPPORTING_PURPOSES.has(basis.purpose));
  const nonSupportingPurposeBasis = candidate.evidence.vendorPurposeBasis
    .filter((basis) => !SUPPORTING_PURPOSES.has(basis.purpose))
    .map((basis) => basis.purpose);

  return {
    sourceRefIds: uniqueStrings(candidate.evidence.sourceRefIds),
    displaySafeExcerptIds: uniqueStrings(candidate.evidence.displaySafeExcerptIds),
    displaySafeExcerptCount: candidate.evidence.displaySafeEvidenceCount,
    vendorNames: uniqueStrings(supportingPurposeBasis.flatMap((basis) => basis.vendorNames)),
    supportingPurposes: uniqueStrings(supportingPurposeBasis.map((basis) => basis.purpose)),
    diagnosticPurposes: uniqueStrings([
      ...candidate.evidence.diagnosticPurposes,
      ...nonSupportingPurposeBasis,
    ]),
    confidence: candidate.evidence.confidence,
    directness: candidate.evidence.directness,
    sensitiveContext: {
      present: candidate.sensitiveContext?.present === true,
      requiresExtraReview: candidate.sensitiveContext?.requiresExtraReview === true,
      categories: uniqueStrings(candidate.sensitiveContext?.categories ?? []),
      requiredReviewReasons: uniqueStrings(candidate.sensitiveContext?.requiredReviewReasons ?? []),
    },
    familyEvidenceContext: {
      consentStateContext: candidate.evidence.consentStateContext
        ? {
          phase: candidate.evidence.consentStateContext.phase,
          actionObserved: candidate.evidence.consentStateContext.actionObserved,
          sourceRefIds: uniqueStrings(candidate.evidence.consentStateContext.sourceRefIds),
        }
        : undefined,
      cookieStorageContext: candidate.evidence.cookieStorageContext
        ? {
          party: candidate.evidence.cookieStorageContext.party,
          storageType: candidate.evidence.cookieStorageContext.storageType,
          necessaryOrSecurityExcluded: candidate.evidence.cookieStorageContext.necessaryOrSecurityExcluded,
          sourceRefIds: uniqueStrings(candidate.evidence.cookieStorageContext.sourceRefIds),
        }
        : undefined,
      sessionReplayContext: candidate.evidence.sessionReplayContext
        ? {
          collectionEvidence: candidate.evidence.sessionReplayContext.collectionEvidence,
          libraryOnly: false,
          sourceRefIds: uniqueStrings(candidate.evidence.sessionReplayContext.sourceRefIds),
        }
        : undefined,
    },
    caveats: uniqueStrings(candidate.limitations.policyCaveats),
    coverageLimitations: uniqueStrings(candidate.limitations.coverageLimitations),
    missingCorroborators: uniqueStrings(candidate.limitations.missingCorroborators),
    demotionReasons: uniqueStrings(candidate.limitations.demotionReasons),
  };
}

function malformedCandidateReasons(candidate: V2NormalizedConcernCandidateDraft) {
  const reasons: string[] = [];
  if (!isRecord(candidate)) {
    return ["malformed_candidate"];
  }
  if (candidate.adapterVersion !== ALLOWED_ADAPTER_VERSION) {
    reasons.push("unsupported_adapter_version");
  }
  if (!candidate.proposed || !ALLOWED_KEYS.has(candidate.proposed.normalizedConcernKey)) {
    reasons.push("unsupported_normalized_concern_key");
  }
  if (!candidate.guardrails?.reviewOnly) {
    reasons.push("candidate_not_review_only");
  }
  if (
    candidate.guardrails?.productionEligible !== false ||
    candidate.guardrails?.topFindingEligible !== false ||
    candidate.guardrails?.gapEligible !== false
  ) {
    reasons.push("candidate_has_forbidden_eligibility");
  }
  if (!candidate.evidence || !Array.isArray(candidate.evidence.sourceRefIds) || !Array.isArray(candidate.evidence.displaySafeExcerptIds)) {
    reasons.push("malformed_candidate_evidence");
  }
  if (candidate.sensitiveContext && candidate.sensitiveContext.requiresExtraReview !== true) {
    reasons.push("missing_sensitive_context_review_metadata");
  }
  if (candidate.sensitiveContext?.requiresExtraReview && candidate.sensitiveContext.requiredReviewReasons.length === 0) {
    reasons.push("missing_sensitive_context_review_metadata");
  }
  return uniqueStrings(reasons);
}

function missingRequirementsForCandidate(candidate: V2NormalizedConcernCandidateDraft) {
  const missing: string[] = [];
  if (candidate.evidence.sourceRefIds.length === 0) {
    missing.push("missing_source_refs");
  }
  if (candidate.evidence.displaySafeExcerptIds.length === 0 && candidate.evidence.displaySafeEvidenceCount === 0) {
    missing.push("missing_display_safe_excerpt_refs");
  }
  if (!["high", "medium"].includes(candidate.evidence.confidence)) {
    missing.push("missing_or_weak_confidence");
  }
  if (!["direct", "strong_runtime_equivalent"].includes(candidate.evidence.directness)) {
    missing.push("missing_or_weak_directness");
  }
  if (
    candidate.proposed.concernFamily === "pre_consent_tracking" ||
    candidate.proposed.concernFamily === "pre_consent_cookie_storage"
  ) {
    if (!candidate.evidence.consentStateContext) {
      missing.push("missing_consent_state_context");
    }
  }
  if (candidate.proposed.concernFamily === "pre_consent_cookie_storage") {
    if (!candidate.evidence.cookieStorageContext) {
      missing.push("missing_cookie_storage_party_context");
    }
  }
  if (candidate.proposed.concernFamily === "session_replay_behavioral_analytics") {
    if (!candidate.evidence.sessionReplayContext || candidate.evidence.sessionReplayContext.libraryOnly) {
      missing.push("library_only_without_collection");
    }
  }
  if (candidate.evidence.vendorPurposeBasis.length === 0) {
    missing.push("missing_allowed_supporting_vendor_purpose");
  }
  return uniqueStrings(missing);
}

function suppressionReasonsForCandidate(candidate: V2NormalizedConcernCandidateDraft) {
  const reasons: string[] = [];
  const purposes = candidate.evidence.vendorPurposeBasis.map((basis) => basis.purpose);
  const diagnosticPurposes = candidate.evidence.diagnosticPurposes;
  if (purposes.some((purpose) => TIER_C_PURPOSES.has(purpose))) {
    reasons.push("tier_c_supporting_purpose");
  }
  if (purposes.length === 0 && diagnosticPurposes.some((purpose) => TAG_OR_CMP_PURPOSES.has(purpose))) {
    reasons.push("tag_management_or_consent_management_only_non_supporting");
  }
  if (candidate.limitations.policyCaveats.includes("first_party_only_storage")) {
    reasons.push("first_party_only_storage");
  }
  if (candidate.proposed.concernFamily === "pre_consent_cookie_storage" && candidate.evidence.cookieStorageContext?.necessaryOrSecurityExcluded !== true) {
    reasons.push("necessary_security_or_cmp_storage_excluded");
  }
  return uniqueStrings(reasons);
}

function validateAdapterRun(value: unknown): asserts value is V2NormalizedConcernAdapterDryRun {
  if (!isRecord(value)) {
    throw new Error("V2NormalizedConcernCandidateDraft must be a JSON object.");
  }
  if (value.adapterRunVersion !== ALLOWED_ADAPTER_VERSION) {
    throw new Error("Unsupported V2NormalizedConcernCandidateDraft adapter version.");
  }
  if (value.productionEligible !== false) {
    throw new Error("V2NormalizedConcernCandidateDraft must not be production eligible.");
  }
  if (!Array.isArray(value.candidates)) {
    throw new Error("V2NormalizedConcernCandidateDraft.candidates must be an array.");
  }
  if (!Array.isArray(value.blockedCandidates)) {
    throw new Error("V2NormalizedConcernCandidateDraft.blockedCandidates must be an array.");
  }
}

function reasonsForOutcome(outcome: Wc01V2ConcernPolicyComparisonResult["simulatedPolicyOutcome"]) {
  switch (outcome) {
    case "would_accept_for_internal_review":
      return ["candidate_shape_matches_mock_policy_requirements"];
    case "would_require_more_evidence":
      return ["candidate_shape_requires_more_evidence"];
    case "would_remain_internal_only":
      return ["candidate_shape_matches_mock_policy_requirements", "candidate_remains_internal_only"];
    case "would_be_suppressed":
      return ["candidate_shape_suppressed_by_mock_policy"];
  }
}

function candidateId(candidate: Partial<V2NormalizedConcernCandidateDraft>) {
  return candidate.source?.simulationOutcomeId ?? candidate.source?.concernInputId ?? "unknown_candidate";
}

function assertComparisonGuardrails(comparison: Wc01V2ConcernPolicyComparisonDryRun) {
  const serialized = JSON.stringify(comparison);
  if (containsForbiddenGapObservedToken(serialized)) {
    throw new Error("Concern policy comparison contains forbidden gap status token.");
  }
  if (containsBlockedRawFields(serialized)) {
    throw new Error("Concern policy comparison contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(serialized)) {
    throw new Error("Concern policy comparison contains legal-conclusion language.");
  }
  if (comparison.productionEligible || comparison.topFindingEligible || comparison.gapEligible) {
    throw new Error("Concern policy comparison contains forbidden eligibility.");
  }
  if (comparison.comparisonResults.some((result) => result.productionEligible || result.topFindingEligible || result.gapEligible)) {
    throw new Error("Concern policy comparison contains eligible results.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))].sort();
}
