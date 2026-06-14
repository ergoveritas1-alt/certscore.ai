import {
  containsBlockedRawFields,
  containsForbiddenGapObservedToken,
} from "./wc01-shadow-output";
import {
  type Wc01V2ConcernPolicySimulationDryRun,
  type Wc01V2SimulatedConcernOutcome,
  WC01_V2_CONCERN_POLICY_SIMULATION_DRY_RUN_VERSION,
} from "./wc01-v2-concern-policy-simulation";

export const WC01_V2_NORMALIZED_CONCERN_ADAPTER_DRAFT_VERSION =
  "wc01.v2_normalized_concern_candidate_draft.1";

export type V2NormalizedConcernCandidateDraft = {
  adapterVersion: typeof WC01_V2_NORMALIZED_CONCERN_ADAPTER_DRAFT_VERSION;
  source: {
    scanId?: string;
    reviewId?: string;
    sourceUrl?: string;
    simulationVersion: string;
    simulationOutcomeId: string;
    concernInputId: string;
    sourceRowId?: string;
    sourceFindingKey: string;
    sourceFamily: V2NormalizedConcernCandidateFamily;
  };
  proposed: {
    normalizedConcernKey:
      | "v2.pre_consent_tracking.candidate"
      | "v2.pre_consent_cookie_storage.candidate"
      | "v2.session_replay_behavioral_analytics.candidate";
    concernFamily: V2NormalizedConcernCandidateFamily;
    regulatoryLensCandidates: Array<{
      lens: string;
      reasonKey: string;
      reviewOnly: true;
    }>;
  };
  evidence: {
    evidenceFamily:
      | "runtime_pre_consent_collection"
      | "runtime_pre_consent_cookie_or_storage"
      | "runtime_session_replay_collection";
    sourceRefIds: string[];
    displaySafeExcerptIds: string[];
    displaySafeEvidenceCount: number;
    confidence: "high" | "medium";
    directness: "direct" | "strong_runtime_equivalent";
    consentStateContext?: {
      phase: "pre_consent" | "before_choice";
      actionObserved?: "none" | "banner_observed" | "choice_not_made";
      sourceRefIds: string[];
    };
    cookieStorageContext?: {
      party: "third_party";
      storageType: "cookie" | "local_storage" | "session_storage" | "other_storage";
      necessaryOrSecurityExcluded: true;
      sourceRefIds: string[];
    };
    sessionReplayContext?: {
      collectionEvidence:
        | "collection_endpoint"
        | "event_payload_endpoint"
        | "equivalent_strong_runtime_signal";
      libraryOnly: false;
      sourceRefIds: string[];
    };
    vendorPurposeBasis: Array<{
      purpose: V2NormalizedConcernSupportingPurpose;
      vendorNames: string[];
      sourceRefIds: string[];
    }>;
    diagnosticPurposes: string[];
  };
  sensitiveContext?: {
    present: boolean;
    categories: string[];
    requiresExtraReview: true;
    requiredReviewReasons: string[];
  };
  limitations: {
    coverageLimitations: string[];
    policyCaveats: string[];
    missingCorroborators: string[];
    demotionReasons: string[];
  };
  guardrails: {
    productionEligible: false;
    topFindingEligible: false;
    gapEligible: false;
    reviewOnly: true;
    customerFacingCopyApproved: false;
    persistedConcernApproved: false;
  };
};

export type V2NormalizedConcernAdapterDryRun = {
  adapterRunVersion: typeof WC01_V2_NORMALIZED_CONCERN_ADAPTER_DRAFT_VERSION;
  source: Wc01V2ConcernPolicySimulationDryRun["source"] & {
    simulationVersion: string;
  };
  productionEligible: false;
  status: "adapter_draft_review_only";
  candidates: V2NormalizedConcernCandidateDraft[];
  blockedCandidates: V2NormalizedConcernAdapterBlockedCandidate[];
  guardrails: {
    noGapObserved: true;
    noTopFindingEligibility: true;
    noGapEligibility: true;
    noProductionEligibility: true;
    noRawBlockedFields: true;
    noLegalConclusionLanguage: true;
    noProductionConcernPolicyCall: true;
    noPersistence: true;
    noUnifiedFindings: true;
    noCustomerFacingCopy: true;
  };
};

export type V2NormalizedConcernAdapterBlockedCandidate = {
  simulationOutcomeId?: string;
  sourceInputId?: string;
  sourceFindingKey?: string;
  concernFamily?: string;
  blockReasons: string[];
};

type V2NormalizedConcernCandidateFamily =
  | "pre_consent_tracking"
  | "pre_consent_cookie_storage"
  | "session_replay_behavioral_analytics";

type V2NormalizedConcernSupportingPurpose =
  | "advertising"
  | "analytics"
  | "session_replay"
  | "marketing_automation"
  | "advertising_measurement"
  | "identity_resolution"
  | "social_pixel"
  | "retargeting";

type AdapterEvaluation =
  | { converted: true; candidate: V2NormalizedConcernCandidateDraft }
  | { converted: false; blocked: V2NormalizedConcernAdapterBlockedCandidate };

const LEGAL_CONCLUSION_PATTERN =
  /\b(gap_observed|violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i;

const ALLOWED_FAMILIES = new Set<V2NormalizedConcernCandidateFamily>([
  "pre_consent_tracking",
  "pre_consent_cookie_storage",
  "session_replay_behavioral_analytics",
]);

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

const TIER_C_PURPOSES = new Set<string>([
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

export function parseWc01V2ConcernPolicySimulationDryRunJson(
  raw: string,
): Wc01V2ConcernPolicySimulationDryRun {
  if (containsForbiddenGapObservedToken(raw)) {
    throw new Error("Wc01V2ConcernPolicySimulationDryRun contains forbidden gap status token.");
  }
  if (containsBlockedRawFields(raw)) {
    throw new Error("Wc01V2ConcernPolicySimulationDryRun contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(raw)) {
    throw new Error("Wc01V2ConcernPolicySimulationDryRun contains legal-conclusion language.");
  }

  const parsed = JSON.parse(raw) as unknown;
  validateSimulation(parsed);
  return parsed;
}

export function projectSimulationToNormalizedConcernCandidateDraft(
  simulation: Wc01V2ConcernPolicySimulationDryRun,
): V2NormalizedConcernAdapterDryRun {
  validateSimulation(simulation);

  const candidates: V2NormalizedConcernCandidateDraft[] = [];
  const blockedCandidates: V2NormalizedConcernAdapterBlockedCandidate[] = [];

  for (const outcome of simulation.simulatedConcernOutcomes) {
    const evaluated = evaluateOutcome(simulation, outcome);
    if (evaluated.converted) {
      candidates.push(evaluated.candidate);
    } else {
      blockedCandidates.push(evaluated.blocked);
    }
  }

  const adapterRun: V2NormalizedConcernAdapterDryRun = {
    adapterRunVersion: WC01_V2_NORMALIZED_CONCERN_ADAPTER_DRAFT_VERSION,
    source: {
      ...simulation.source,
      simulationVersion: simulation.simulationVersion,
    },
    productionEligible: false,
    status: "adapter_draft_review_only",
    candidates,
    blockedCandidates,
    guardrails: {
      noGapObserved: true,
      noTopFindingEligibility: true,
      noGapEligibility: true,
      noProductionEligibility: true,
      noRawBlockedFields: true,
      noLegalConclusionLanguage: true,
      noProductionConcernPolicyCall: true,
      noPersistence: true,
      noUnifiedFindings: true,
      noCustomerFacingCopy: true,
    },
  };

  assertAdapterGuardrails(adapterRun);
  return adapterRun;
}

export function projectSimulationJsonToNormalizedConcernCandidateDraft(raw: string) {
  return projectSimulationToNormalizedConcernCandidateDraft(
    parseWc01V2ConcernPolicySimulationDryRunJson(raw),
  );
}

function evaluateOutcome(
  simulation: Wc01V2ConcernPolicySimulationDryRun,
  outcome: Wc01V2SimulatedConcernOutcome,
): AdapterEvaluation {
  const blockReasons = blockReasonsForOutcome(outcome);
  if (blockReasons.length > 0) {
    return {
      converted: false,
      blocked: {
        simulationOutcomeId: outcome.outcomeId,
        sourceInputId: outcome.sourceInputId,
        sourceFindingKey: outcome.sourceFindingKey,
        concernFamily: outcome.concernFamily,
        blockReasons,
      },
    };
  }

  const family = outcome.concernFamily;
  const candidate: V2NormalizedConcernCandidateDraft = {
    adapterVersion: WC01_V2_NORMALIZED_CONCERN_ADAPTER_DRAFT_VERSION,
    source: {
      scanId: outcome.adapterEvidence.scanId ?? simulation.source.scanId,
      reviewId: outcome.adapterEvidence.reviewId ?? simulation.source.reviewId,
      sourceUrl: outcome.adapterEvidence.sourceUrl ?? simulation.source.url,
      simulationVersion: simulation.simulationVersion,
      simulationOutcomeId: outcome.outcomeId,
      concernInputId: outcome.sourceInputId,
      sourceRowId: outcome.adapterEvidence.sourceRowId,
      sourceFindingKey: outcome.sourceFindingKey,
      sourceFamily: family,
    },
    proposed: {
      normalizedConcernKey: normalizedConcernKeyForFamily(family),
      concernFamily: family,
      regulatoryLensCandidates: regulatoryLensCandidatesForFamily(family, outcome),
    },
    evidence: {
      evidenceFamily: evidenceFamilyForFamily(family),
      sourceRefIds: uniqueStrings(outcome.adapterEvidence.sourceRefIds),
      displaySafeExcerptIds: uniqueStrings(outcome.adapterEvidence.displaySafeExcerptIds),
      displaySafeEvidenceCount: outcome.evidenceSummary.displaySafeExcerptCount,
      confidence: confidenceForOutcome(outcome),
      directness: directnessForOutcome(outcome),
      consentStateContext: consentStateContextForOutcome(outcome),
      cookieStorageContext: family === "pre_consent_cookie_storage"
        ? {
          party: "third_party",
          storageType: "cookie",
          necessaryOrSecurityExcluded: true,
          sourceRefIds: uniqueStrings(outcome.adapterEvidence.sourceRefIds),
        }
        : undefined,
      sessionReplayContext: family === "session_replay_behavioral_analytics"
        ? {
          collectionEvidence: sessionReplayCollectionEvidence(outcome),
          libraryOnly: false,
          sourceRefIds: uniqueStrings(outcome.adapterEvidence.sourceRefIds),
        }
        : undefined,
      vendorPurposeBasis: vendorPurposeBasisForOutcome(outcome),
      diagnosticPurposes: uniqueStrings(outcome.evidenceSummary.diagnosticPurposes),
    },
    sensitiveContext: outcome.policyRequirements.requiresSensitiveContextReview
      ? {
        present: true,
        categories: uniqueStrings(outcome.adapterEvidence.sensitiveContextCategories),
        requiresExtraReview: true,
        requiredReviewReasons: ["sensitive_context_requires_extra_policy_review"],
      }
      : undefined,
    limitations: {
      coverageLimitations: uniqueStrings(outcome.adapterEvidence.coverageLimitations),
      policyCaveats: uniqueStrings(outcome.caveats),
      missingCorroborators: uniqueStrings(outcome.adapterEvidence.missingCorroborators),
      demotionReasons: uniqueStrings(outcome.adapterEvidence.demotionReasons),
    },
    guardrails: {
      productionEligible: false,
      topFindingEligible: false,
      gapEligible: false,
      reviewOnly: true,
      customerFacingCopyApproved: false,
      persistedConcernApproved: false,
    },
  };

  return { converted: true, candidate };
}

function blockReasonsForOutcome(outcome: Wc01V2SimulatedConcernOutcome) {
  const reasons: string[] = [];
  if (!ALLOWED_FAMILIES.has(outcome.concernFamily)) {
    reasons.push("unsupported_concern_family");
  }
  if (!["policy_review_candidate", "policy_review_candidate_sensitive_context"].includes(outcome.simulatedPolicyStatus)) {
    reasons.push("simulation_status_not_candidate");
  }
  if (outcome.productionEligible !== false) {
    reasons.push("outcome_production_eligible");
  }
  if (outcome.topFindingEligible !== false) {
    reasons.push("outcome_top_finding_eligible");
  }
  if (outcome.gapEligible !== false) {
    reasons.push("outcome_gap_eligible");
  }
  if (!outcome.adapterEvidence || !Array.isArray(outcome.adapterEvidence.sourceRefIds)) {
    reasons.push("missing_adapter_traceability");
    return uniqueStrings(reasons);
  }
  if (outcome.adapterEvidence.sourceRefIds.length === 0) {
    reasons.push("missing_source_refs");
  }
  if (
    outcome.adapterEvidence.displaySafeExcerptIds.length === 0 &&
    outcome.evidenceSummary.displaySafeExcerptCount === 0
  ) {
    reasons.push("missing_display_safe_excerpt_refs");
  }
  if (outcome.adapterEvidence.coverageLimitations.length > 0) {
    reasons.push("required_source_module_incomplete");
  }
  if (!["high", "medium"].includes(String(outcome.evidenceSummary.confidenceBand))) {
    reasons.push("missing_or_weak_confidence");
  }
  if (!isDirectEnough(outcome)) {
    reasons.push("missing_or_weak_directness");
  }

  const supportingPurposes = uniqueStrings(outcome.evidenceSummary.supportingPurposes);
  const diagnosticPurposes = uniqueStrings(outcome.evidenceSummary.diagnosticPurposes);
  const allowedSupportingPurposes = supportingPurposes.filter((purpose) => SUPPORTING_PURPOSES.has(purpose));
  if (allowedSupportingPurposes.length === 0) {
    if (diagnosticPurposes.some((purpose) => TAG_OR_CMP_PURPOSES.has(purpose))) {
      reasons.push("tag_or_consent_management_only_non_supporting");
    } else {
      reasons.push("missing_allowed_supporting_vendor_purpose");
    }
  }
  if (supportingPurposes.some((purpose) => TIER_C_PURPOSES.has(purpose))) {
    reasons.push("tier_c_supporting_purpose");
  }
  if (supportingPurposes.every((purpose) => TAG_OR_CMP_PURPOSES.has(purpose)) && supportingPurposes.length > 0) {
    reasons.push("tag_or_consent_management_only_non_supporting");
  }
  if (supportingPurposes.some((purpose) => TAG_OR_CMP_PURPOSES.has(purpose)) && allowedSupportingPurposes.length === 0) {
    reasons.push("tag_or_consent_management_only_non_supporting");
  }

  if (outcome.concernFamily === "pre_consent_tracking") {
    if (!hasConsentStateContext(outcome)) {
      reasons.push("missing_consent_state_context");
    }
    if (!hasPreConsentTrackingEvidence(outcome)) {
      reasons.push("missing_direct_runtime_evidence");
    }
  }
  if (outcome.concernFamily === "pre_consent_cookie_storage") {
    if (!hasConsentStateContext(outcome)) {
      reasons.push("missing_consent_state_context");
    }
    if (/first_party/i.test(outcome.sourceFindingKey)) {
      reasons.push("first_party_only_storage");
    }
    if (outcome.sourceFindingKey !== "third_party_cookie_pre_consent") {
      reasons.push("missing_direct_cookie_or_storage_evidence");
    }
    if (!outcome.adapterEvidence.familySpecificCaveats.includes("first_party_cmp_security_necessary_functional_unknown_only_storage_excluded")) {
      reasons.push("necessary_security_or_cmp_storage_excluded");
    }
  }
  if (outcome.concernFamily === "session_replay_behavioral_analytics") {
    if (!hasSessionReplayCollectionEvidence(outcome)) {
      reasons.push("library_only_without_collection");
    }
    if (supportingPurposes.every((purpose) => ["rum", "live_chat", "customer_support", "performance_monitoring"].includes(purpose))) {
      reasons.push("rum_or_live_chat_only_non_supporting");
    }
  }
  if (
    outcome.policyRequirements.requiresSensitiveContextReview &&
    outcome.adapterEvidence.sensitiveContextCategories.length === 0
  ) {
    reasons.push("missing_sensitive_context_review_metadata");
  }

  return uniqueStrings(reasons);
}

function validateSimulation(value: unknown): asserts value is Wc01V2ConcernPolicySimulationDryRun {
  if (!isRecord(value)) {
    throw new Error("Wc01V2ConcernPolicySimulationDryRun must be a JSON object.");
  }
  if (value.simulationVersion !== WC01_V2_CONCERN_POLICY_SIMULATION_DRY_RUN_VERSION) {
    throw new Error("Unsupported Wc01V2ConcernPolicySimulationDryRun version.");
  }
  if (value.productionEligible !== false) {
    throw new Error("Wc01V2ConcernPolicySimulationDryRun must not be production eligible.");
  }
  if (!Array.isArray(value.simulatedConcernOutcomes)) {
    throw new Error("Wc01V2ConcernPolicySimulationDryRun.simulatedConcernOutcomes must be an array.");
  }
  if (!Array.isArray(value.blockedInputs)) {
    throw new Error("Wc01V2ConcernPolicySimulationDryRun.blockedInputs must be an array.");
  }
}

function normalizedConcernKeyForFamily(family: V2NormalizedConcernCandidateFamily) {
  switch (family) {
    case "pre_consent_tracking":
      return "v2.pre_consent_tracking.candidate";
    case "pre_consent_cookie_storage":
      return "v2.pre_consent_cookie_storage.candidate";
    case "session_replay_behavioral_analytics":
      return "v2.session_replay_behavioral_analytics.candidate";
  }
}

function evidenceFamilyForFamily(family: V2NormalizedConcernCandidateFamily) {
  switch (family) {
    case "pre_consent_tracking":
      return "runtime_pre_consent_collection";
    case "pre_consent_cookie_storage":
      return "runtime_pre_consent_cookie_or_storage";
    case "session_replay_behavioral_analytics":
      return "runtime_session_replay_collection";
  }
}

function regulatoryLensCandidatesForFamily(
  family: V2NormalizedConcernCandidateFamily,
  outcome: Wc01V2SimulatedConcernOutcome,
) {
  const base = [
    { lens: "privacy_runtime_review", reasonKey: `${family}_runtime_signal`, reviewOnly: true as const },
  ];
  if (family !== "session_replay_behavioral_analytics") {
    base.push({ lens: "consent_timing_review", reasonKey: `${family}_consent_state_context`, reviewOnly: true });
  }
  if (outcome.policyRequirements.requiresSensitiveContextReview) {
    base.push({ lens: "sensitive_context_review", reasonKey: "sensitive_context_extra_review_required", reviewOnly: true });
  }
  return base;
}

function vendorPurposeBasisForOutcome(outcome: Wc01V2SimulatedConcernOutcome) {
  const refs = uniqueStrings(outcome.adapterEvidence.sourceRefIds);
  const basis: Array<{
    purpose: V2NormalizedConcernSupportingPurpose;
    vendorNames: string[];
    sourceRefIds: string[];
  }> = [];
  for (const purpose of outcome.evidenceSummary.supportingPurposes) {
    if (!SUPPORTING_PURPOSES.has(purpose)) {
      continue;
    }
    basis.push({
      purpose: purpose as V2NormalizedConcernSupportingPurpose,
      vendorNames: uniqueStrings(outcome.adapterEvidence.vendors
        .filter((vendor) => vendor.supportingPurposes.includes(purpose))
        .map((vendor) => vendor.name)),
      sourceRefIds: refs,
    });
  }
  return basis;
}

function confidenceForOutcome(outcome: Wc01V2SimulatedConcernOutcome) {
  return outcome.evidenceSummary.confidenceBand === "medium" ? "medium" : "high";
}

function directnessForOutcome(outcome: Wc01V2SimulatedConcernOutcome) {
  return outcome.evidenceSummary.directness === "direct" ? "direct" : "strong_runtime_equivalent";
}

function consentStateContextForOutcome(outcome: Wc01V2SimulatedConcernOutcome) {
  if (!hasConsentStateContext(outcome)) {
    return undefined;
  }
  return {
    phase: hasPreConsentContext(outcome) ? "pre_consent" as const : "before_choice" as const,
    actionObserved: "choice_not_made" as const,
    sourceRefIds: uniqueStrings(outcome.adapterEvidence.sourceRefIds),
  };
}

function sessionReplayCollectionEvidence(outcome: Wc01V2SimulatedConcernOutcome) {
  const criteria = outcome.adapterEvidence.sourceMatchedCriteria.join(" ");
  if (/event_payload_endpoint/i.test(criteria)) {
    return "event_payload_endpoint";
  }
  if (/collection_endpoint_observed|session_replay_collection_observed/i.test(criteria)) {
    return "collection_endpoint";
  }
  return "equivalent_strong_runtime_signal";
}

function hasConsentStateContext(outcome: Wc01V2SimulatedConcernOutcome) {
  return outcome.adapterEvidence.preConsentOrConsentStateContext.some((context) =>
    /pre_consent|preconsent|consent_state|before_choice|consent/i.test(context)
  ) || outcome.sourceFindingKey.includes("pre_consent");
}

function hasPreConsentContext(outcome: Wc01V2SimulatedConcernOutcome) {
  return outcome.adapterEvidence.preConsentOrConsentStateContext.some((context) =>
    /pre_consent|preconsent/i.test(context)
  ) || outcome.sourceFindingKey.includes("pre_consent");
}

function isDirectEnough(outcome: Wc01V2SimulatedConcernOutcome) {
  return outcome.evidenceSummary.directness === "direct" ||
    outcome.evidenceSummary.directness === "strong_runtime_equivalent";
}

function hasPreConsentTrackingEvidence(outcome: Wc01V2SimulatedConcernOutcome) {
  const criteria = outcome.adapterEvidence.sourceMatchedCriteria.join(" ");
  return /collection_endpoint_observed|pre_consent_tracking_signal_true|observed_vendor_journey_present/i.test(criteria);
}

function hasSessionReplayCollectionEvidence(outcome: Wc01V2SimulatedConcernOutcome) {
  const criteria = outcome.adapterEvidence.sourceMatchedCriteria.join(" ");
  return /session_replay_collection_observed|collection_endpoint_observed|behavioral_analytics_collection_observed|session_replay_vendor_observation/i.test(criteria) &&
    !/library_only|library_loaded_only|session_replay_library_observed/i.test(criteria);
}

function assertAdapterGuardrails(adapterRun: V2NormalizedConcernAdapterDryRun) {
  const serialized = JSON.stringify(adapterRun);
  if (containsForbiddenGapObservedToken(serialized)) {
    throw new Error("Normalized concern candidate adapter contains forbidden gap status token.");
  }
  if (containsBlockedRawFields(serialized)) {
    throw new Error("Normalized concern candidate adapter contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(serialized)) {
    throw new Error("Normalized concern candidate adapter contains legal-conclusion language.");
  }
  if (adapterRun.productionEligible !== false) {
    throw new Error("Normalized concern candidate adapter must not be production eligible.");
  }
  if (adapterRun.candidates.some((candidate) =>
    candidate.guardrails.productionEligible ||
    candidate.guardrails.topFindingEligible ||
    candidate.guardrails.gapEligible ||
    !candidate.guardrails.reviewOnly
  )) {
    throw new Error("Normalized concern candidate adapter contains eligible candidates.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))].sort();
}
