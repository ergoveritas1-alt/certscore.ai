import {
  containsBlockedRawFields,
  containsForbiddenGapObservedToken,
} from "./wc01-shadow-output";
import {
  type Wc01V2ConcernInputDraft,
  type Wc01V2ConcernPolicyInputDraft,
  WC01_V2_CONCERN_POLICY_INPUT_DRAFT_VERSION,
} from "./wc01-v2-concern-policy-input-draft";

export const WC01_V2_CONCERN_POLICY_SIMULATION_DRY_RUN_VERSION =
  "wc01.v2_concern_policy_simulation_dry_run.1";

export type Wc01V2ConcernPolicySimulationDryRun = {
  simulationVersion: typeof WC01_V2_CONCERN_POLICY_SIMULATION_DRY_RUN_VERSION;
  source: {
    url?: string;
    scanId?: string;
    reviewId?: string;
    inputDraftVersion: string;
  };
  productionEligible: false;
  status: "simulation_review_only";
  simulatedConcernOutcomes: Wc01V2SimulatedConcernOutcome[];
  blockedInputs: Wc01V2SimulationBlockedInput[];
  guardrails: {
    noGapObserved: true;
    noTopFindingEligibility: true;
    noGapEligibility: true;
    noProductionEligibility: true;
    noRawBlockedFields: true;
    noLegalConclusionLanguage: true;
  };
};

export type Wc01V2SimulatedConcernOutcome = {
  outcomeId: string;
  sourceInputId: string;
  sourceFindingKey: string;
  concernFamily:
    | "pre_consent_tracking"
    | "pre_consent_cookie_storage"
    | "session_replay_behavioral_analytics";
  simulatedPolicyStatus:
    | "policy_review_candidate"
    | "policy_review_candidate_sensitive_context"
    | "policy_needs_more_evidence"
    | "policy_internal_only";
  productionEligible: false;
  topFindingEligible: false;
  gapEligible: false;
  suggestedConcernKey: string;
  evidenceSummary: {
    sourceRefCount: number;
    displaySafeExcerptCount: number;
    confidenceBand?: string;
    directness?: string;
    hasPreConsentContext: boolean;
    hasConsentStateContext: boolean;
    supportingPurposes: string[];
    diagnosticPurposes: string[];
  };
  adapterEvidence: {
    sourceUrl?: string;
    scanId?: string;
    reviewId?: string;
    sourceRowId: string;
    sourceModules: string[];
    coverageLimitations: string[];
    sourceRefIds: string[];
    displaySafeExcerptIds: string[];
    capped: boolean;
    omittedCount: number;
    preConsentOrConsentStateContext: string[];
    vendorPurposeBasis: string[];
    sourceMatchedCriteria: string[];
    missingCorroborators: string[];
    demotionReasons: string[];
    requiredEvidence: string[];
    familySpecificCaveats: string[];
    sensitiveContextCategories: string[];
    vendors: Array<{
      name: string;
      product?: string;
      supportingPurposes: string[];
      diagnosticPurposes: string[];
    }>;
  };
  policyRequirements: {
    requiresPolicyOwnerReview: true;
    requiresEvidenceContractReview: true;
    requiresCopyReview: true;
    requiresSensitiveContextReview: boolean;
    requiresVendorPurposeApproval: boolean;
    requiresProductionIntegrationProposal: true;
  };
  reasons: string[];
  caveats: string[];
};

export type Wc01V2SimulationBlockedInput = {
  sourceInputId?: string;
  sourceFindingKey?: string;
  concernFamily?: string;
  blockReasons: string[];
};

type SimulatedInputEvaluation =
  | { converted: true; outcome: Wc01V2SimulatedConcernOutcome }
  | { converted: false; blocked: Wc01V2SimulationBlockedInput };

const LEGAL_CONCLUSION_PATTERN =
  /\b(gap_observed|violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i;

const ALLOWED_CONCERN_FAMILIES = new Set([
  "pre_consent_tracking",
  "pre_consent_cookie_storage",
  "session_replay_behavioral_analytics",
]);

export function parseWc01V2ConcernPolicyInputDraftJson(raw: string): Wc01V2ConcernPolicyInputDraft {
  if (containsForbiddenGapObservedToken(raw)) {
    throw new Error("Wc01V2ConcernPolicyInputDraft contains forbidden gap status token.");
  }
  if (containsBlockedRawFields(raw)) {
    throw new Error("Wc01V2ConcernPolicyInputDraft contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(raw)) {
    throw new Error("Wc01V2ConcernPolicyInputDraft contains legal-conclusion language.");
  }

  const parsed = JSON.parse(raw) as unknown;
  validateInputDraft(parsed);
  return parsed;
}

export function simulateConcernPolicyForInputDraft(
  draft: Wc01V2ConcernPolicyInputDraft,
): Wc01V2ConcernPolicySimulationDryRun {
  validateInputDraft(draft);

  const simulatedConcernOutcomes: Wc01V2SimulatedConcernOutcome[] = [];
  const blockedInputs: Wc01V2SimulationBlockedInput[] = [];

  for (const input of draft.concernInputs) {
    const evaluated = evaluateInput(input);
    if (evaluated.converted) {
      simulatedConcernOutcomes.push(evaluated.outcome);
    } else {
      blockedInputs.push(evaluated.blocked);
    }
  }

  const simulation: Wc01V2ConcernPolicySimulationDryRun = {
    simulationVersion: WC01_V2_CONCERN_POLICY_SIMULATION_DRY_RUN_VERSION,
    source: {
      url: draft.source.url,
      scanId: draft.source.scanId,
      reviewId: draft.source.reviewId,
      inputDraftVersion: draft.draftVersion,
    },
    productionEligible: false,
    status: "simulation_review_only",
    simulatedConcernOutcomes,
    blockedInputs,
    guardrails: {
      noGapObserved: true,
      noTopFindingEligibility: true,
      noGapEligibility: true,
      noProductionEligibility: true,
      noRawBlockedFields: true,
      noLegalConclusionLanguage: true,
    },
  };

  assertSimulationGuardrails(simulation);
  return simulation;
}

export function simulateConcernPolicyForInputDraftJson(raw: string) {
  return simulateConcernPolicyForInputDraft(parseWc01V2ConcernPolicyInputDraftJson(raw));
}

function evaluateInput(input: Wc01V2ConcernInputDraft): SimulatedInputEvaluation {
  const blockReasons = inputBlockReasons(input);
  if (blockReasons.length > 0) {
    return {
      converted: false,
      blocked: {
        sourceInputId: input.inputId,
        sourceFindingKey: input.sourceFindingKey,
        concernFamily: input.proposedConcernFamily,
        blockReasons,
      },
    };
  }

  const missingEvidenceReasons = missingEvidenceReasonsForInput(input);
  const sensitive = input.sensitiveContextReview.requiresExtraPolicyReview;
  const simulatedPolicyStatus = missingEvidenceReasons.length > 0
    ? "policy_needs_more_evidence"
    : sensitive
      ? "policy_review_candidate_sensitive_context"
      : "policy_review_candidate";

  return {
    converted: true,
    outcome: {
      outcomeId: outcomeIdForInput(input),
      sourceInputId: input.inputId,
      sourceFindingKey: input.sourceFindingKey,
      concernFamily: input.proposedConcernFamily,
      simulatedPolicyStatus,
      productionEligible: false,
      topFindingEligible: false,
      gapEligible: false,
      suggestedConcernKey: input.suggestedNormalizedConcern.concernKey,
      evidenceSummary: {
        sourceRefCount: input.evidenceRefs.sourceRefIds.length,
        displaySafeExcerptCount: input.evidenceRefs.displaySafeExcerptCount,
        confidenceBand: input.evidenceAssessment.confidenceBand,
        directness: input.evidenceAssessment.directnessClassification,
        hasPreConsentContext: hasPreConsentContext(input),
        hasConsentStateContext: hasConsentStateContext(input),
        supportingPurposes: uniqueStrings(input.vendors.flatMap((vendor) => vendor.supportingPurposes)),
        diagnosticPurposes: uniqueStrings(input.vendors.flatMap((vendor) => vendor.diagnosticPurposes)),
      },
      adapterEvidence: {
        sourceUrl: input.sourceContext.sourceUrl,
        scanId: input.sourceContext.scanId,
        reviewId: input.sourceContext.reviewId,
        sourceRowId: input.sourceRowId,
        sourceModules: input.sourceContext.sourceModules,
        coverageLimitations: input.sourceContext.coverageLimitations,
        sourceRefIds: input.evidenceRefs.sourceRefIds,
        displaySafeExcerptIds: input.evidenceRefs.excerptIds,
        capped: input.evidenceRefs.capped,
        omittedCount: input.evidenceRefs.omittedCount,
        preConsentOrConsentStateContext: input.evidenceAssessment.preConsentOrConsentStateContext,
        vendorPurposeBasis: input.evidenceAssessment.vendorPurposeBasis,
        sourceMatchedCriteria: input.evidenceAssessment.sourceMatchedCriteria,
        missingCorroborators: input.evidenceAssessment.sourceCaveats,
        demotionReasons: input.evidenceAssessment.blockedOrDemotionReasons,
        requiredEvidence: input.evidenceAssessment.requiredEvidence,
        familySpecificCaveats: input.evidenceAssessment.familySpecificCaveats,
        sensitiveContextCategories: input.sensitiveContextReview.sensitiveContextCategories,
        vendors: input.vendors.map((vendor) => ({
          name: vendor.name,
          product: vendor.product,
          supportingPurposes: vendor.supportingPurposes,
          diagnosticPurposes: vendor.diagnosticPurposes,
        })),
      },
      policyRequirements: {
        requiresPolicyOwnerReview: true,
        requiresEvidenceContractReview: true,
        requiresCopyReview: true,
        requiresSensitiveContextReview: sensitive,
        requiresVendorPurposeApproval: true,
        requiresProductionIntegrationProposal: true,
      },
      reasons: uniqueStrings([
        ...statusReasons(simulatedPolicyStatus),
        ...missingEvidenceReasons,
        ...familyReasons(input),
      ]),
      caveats: uniqueStrings([
        "dry_run_only",
        "simulation_review_only",
        "not_production_concern_policy",
        "not_persisted_normalized_concern",
        "not_customer_facing_output",
        ...input.policyGates.caveats,
        ...input.evidenceAssessment.familySpecificCaveats,
        ...(sensitive ? ["sensitive_context_requires_extra_policy_review"] : []),
      ]),
    },
  };
}

function inputBlockReasons(input: Wc01V2ConcernInputDraft) {
  const reasons: string[] = [];
  if (input.productionEligible !== false) {
    reasons.push("input_production_eligible");
  }
  if (input.topFindingEligible !== false) {
    reasons.push("input_top_finding_eligible");
  }
  if (input.gapEligible !== false) {
    reasons.push("input_gap_eligible");
  }
  if (input.reviewStatus !== "review_only_candidate") {
    reasons.push("input_not_review_only_candidate");
  }
  if (!ALLOWED_CONCERN_FAMILIES.has(input.proposedConcernFamily)) {
    reasons.push("unsupported_concern_family");
  }
  if (!input.policyGates.requiresConcernPolicyReview || !input.policyGates.requiresEvidenceContractReview || !input.policyGates.requiresCopyReview) {
    reasons.push("missing_required_policy_review_gate");
  }
  if (input.policyGates.blockers.length > 0) {
    reasons.push("policy_gate_blockers_present");
  }
  return uniqueStrings(reasons);
}

function missingEvidenceReasonsForInput(input: Wc01V2ConcernInputDraft) {
  const reasons: string[] = [];
  if (input.evidenceRefs.sourceRefIds.length === 0) {
    reasons.push("missing_source_refs");
  }
  if (input.evidenceRefs.displaySafeExcerptCount === 0 && input.evidenceRefs.excerptIds.length === 0) {
    reasons.push("missing_display_safe_evidence");
  }
  if (!input.evidenceAssessment.confidenceBand || input.evidenceAssessment.confidenceBand === "low") {
    reasons.push("missing_or_weak_confidence_band");
  }
  if (!input.evidenceAssessment.directnessClassification || ["unknown", "inferred"].includes(input.evidenceAssessment.directnessClassification)) {
    reasons.push("missing_or_weak_directness");
  }
  if (input.vendors.flatMap((vendor) => vendor.supportingPurposes).length === 0) {
    reasons.push("missing_supporting_vendor_purpose");
  }

  if (input.proposedConcernFamily === "pre_consent_tracking") {
    if (!hasPreConsentContext(input) && !hasConsentStateContext(input)) {
      reasons.push("missing_pre_consent_or_consent_state_context");
    }
    if (!input.evidenceAssessment.sourceMatchedCriteria.some((criterion) =>
      /collection_endpoint_observed|pre_consent_tracking_signal_true|observed_vendor_journey_present/i.test(criterion)
    )) {
      reasons.push("missing_direct_runtime_evidence");
    }
  }

  if (input.proposedConcernFamily === "pre_consent_cookie_storage") {
    if (input.sourceFindingKey !== "third_party_cookie_pre_consent") {
      reasons.push("missing_direct_cookie_or_storage_evidence");
    }
    if (!hasPreConsentContext(input) && !hasConsentStateContext(input)) {
      reasons.push("missing_pre_consent_or_consent_state_context");
    }
    if (!input.evidenceAssessment.familySpecificCaveats.includes("first_party_cmp_security_necessary_functional_unknown_only_storage_excluded")) {
      reasons.push("missing_storage_exclusion_caveat");
    }
  }

  if (input.proposedConcernFamily === "session_replay_behavioral_analytics") {
    if (!hasSessionReplayCollectionEvidence(input)) {
      reasons.push("missing_session_replay_collection_or_equivalent_strong_runtime_evidence");
    }
  }

  return uniqueStrings(reasons);
}

function hasPreConsentContext(input: Wc01V2ConcernInputDraft) {
  return input.evidenceAssessment.preConsentOrConsentStateContext.some((context) =>
    /pre_consent|preconsent/i.test(context)
  ) || input.sourceFindingKey.includes("pre_consent");
}

function hasConsentStateContext(input: Wc01V2ConcernInputDraft) {
  return input.evidenceAssessment.preConsentOrConsentStateContext.some((context) =>
    /consent_state|consent/i.test(context)
  );
}

function hasSessionReplayCollectionEvidence(input: Wc01V2ConcernInputDraft) {
  const criteria = input.evidenceAssessment.sourceMatchedCriteria.join(" ");
  return /session_replay_collection_observed|collection_endpoint_observed|behavioral_analytics_collection_observed|session_replay_vendor_observation/i.test(criteria) &&
    !/library_only|library_loaded_only|session_replay_library_observed/i.test(criteria);
}

function statusReasons(status: Wc01V2SimulatedConcernOutcome["simulatedPolicyStatus"]) {
  switch (status) {
    case "policy_review_candidate":
      return ["policy_shape_candidate_with_required_evidence"];
    case "policy_review_candidate_sensitive_context":
      return ["policy_shape_candidate_with_required_evidence", "sensitive_context_extra_review_required"];
    case "policy_needs_more_evidence":
      return ["policy_shape_needs_more_evidence"];
    case "policy_internal_only":
      return ["policy_shape_internal_only"];
  }
}

function familyReasons(input: Wc01V2ConcernInputDraft) {
  switch (input.proposedConcernFamily) {
    case "pre_consent_tracking":
      return ["pre_consent_tracking_policy_simulation", "vendor_purpose_approval_required"];
    case "pre_consent_cookie_storage":
      return ["pre_consent_cookie_storage_policy_simulation", "kept_separate_from_pre_consent_tracking"];
    case "session_replay_behavioral_analytics":
      return ["session_replay_behavioral_analytics_policy_simulation", "collection_evidence_required"];
  }
}

function validateInputDraft(value: unknown): asserts value is Wc01V2ConcernPolicyInputDraft {
  if (!isRecord(value)) {
    throw new Error("Wc01V2ConcernPolicyInputDraft must be a JSON object.");
  }
  if (value.draftVersion !== WC01_V2_CONCERN_POLICY_INPUT_DRAFT_VERSION) {
    throw new Error("Unsupported Wc01V2ConcernPolicyInputDraft version.");
  }
  if (value.productionEligible !== false) {
    throw new Error("Wc01V2ConcernPolicyInputDraft must not be production eligible.");
  }
  if (!Array.isArray(value.concernInputs)) {
    throw new Error("Wc01V2ConcernPolicyInputDraft.concernInputs must be an array.");
  }
  if (!Array.isArray(value.blockedCandidates)) {
    throw new Error("Wc01V2ConcernPolicyInputDraft.blockedCandidates must be an array.");
  }
  if (value.concernInputs.some((input) => !isRecord(input))) {
    throw new Error("Wc01V2ConcernPolicyInputDraft inputs must be objects.");
  }
}

function assertSimulationGuardrails(simulation: Wc01V2ConcernPolicySimulationDryRun) {
  const serialized = JSON.stringify(simulation);
  if (containsForbiddenGapObservedToken(serialized)) {
    throw new Error("Concern policy simulation contains forbidden gap status token.");
  }
  if (containsBlockedRawFields(serialized)) {
    throw new Error("Concern policy simulation contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(serialized)) {
    throw new Error("Concern policy simulation contains legal-conclusion language.");
  }
  if (simulation.productionEligible !== false) {
    throw new Error("Concern policy simulation must not be production eligible.");
  }
  if (simulation.simulatedConcernOutcomes.some((outcome) => outcome.productionEligible || outcome.topFindingEligible || outcome.gapEligible)) {
    throw new Error("Concern policy simulation contains eligible outcomes.");
  }
}

function outcomeIdForInput(input: Wc01V2ConcernInputDraft) {
  return `v2_policy_simulation.${sanitizeKey(input.inputId)}.${sanitizeKey(input.proposedConcernFamily)}`;
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
