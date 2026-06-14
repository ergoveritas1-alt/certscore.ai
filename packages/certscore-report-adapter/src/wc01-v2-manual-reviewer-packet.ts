import {
  containsBlockedRawFields,
  containsForbiddenGapObservedToken,
} from "./wc01-shadow-output";
import {
  type Wc01V2ConcernPolicyComparisonDryRun,
  type Wc01V2ConcernPolicyComparisonResult,
  WC01_V2_CONCERN_POLICY_COMPARISON_DRY_RUN_VERSION,
} from "./wc01-v2-concern-policy-comparison";

export const WC01_V2_MANUAL_REVIEWER_PACKET_VERSION =
  "wc01.v2_manual_reviewer_packet.1";

export type Wc01V2ManualReviewerQueueLane =
  | "standard_internal_review_candidate"
  | "sensitive_context_review_required"
  | "evidence_quality_review"
  | "copy_policy_review_required"
  | "blocked_suppressed_diagnostic_only";

export type Wc01V2ManualReviewerActionKey =
  | "evidence_shape_confirmed"
  | "needs_more_evidence"
  | "internal_only"
  | "policy_copy_review_required"
  | "sensitive_context_escalated"
  | "rejected_overbroad";

export type Wc01V2ManualReviewerActionOption = {
  action: Wc01V2ManualReviewerActionKey;
  productionEligible: false;
  topFindingEligible: false;
  gapEligible: false;
};

export type Wc01V2ManualReviewerQueueItem = {
  queueItemId: string;
  candidateId: string;
  sourceFindingKey?: string;
  candidateFamily: string;
  proposedNormalizedConcernKey: string;
  simulatedPolicyOutcome: Wc01V2ConcernPolicyComparisonResult["simulatedPolicyOutcome"];
  queueLane: Wc01V2ManualReviewerQueueLane;
  reviewFlags: string[];
  sensitiveContext: {
    present: boolean;
    requiresExtraReview: boolean;
    categories: string[];
    metadataAvailable: boolean;
  };
  evidence: {
    sourceRefIds: string[];
    displaySafeExcerptIds: string[];
    displaySafeExcerptCount: number | null;
    sourceRefsAvailable: boolean;
    displaySafeExcerptRefsAvailable: boolean;
    comparisonArtifactOnly: true;
  };
  vendorDiagnostics: {
    vendorNames: string[];
    supportingPurposes: string[];
    diagnosticPurposes: string[];
    metadataAvailable: boolean;
  };
  evidenceQuality: {
    confidence: string | null;
    directness: string | null;
    metadataAvailable: boolean;
  };
  caveats: string[];
  missingRequirements: string[];
  coverageLimitations: string[];
  familyEvidenceContext: Wc01V2ConcernPolicyComparisonResult["reviewerEvidence"]["familyEvidenceContext"];
  guardrailStatus: {
    productionEligible: false;
    topFindingEligible: false;
    gapEligible: false;
    noGapObserved: true;
    noLegalConclusionLanguage: true;
    noRawBlockedFields: true;
  };
};

export type Wc01V2ManualReviewerPacket = {
  packetVersion: typeof WC01_V2_MANUAL_REVIEWER_PACKET_VERSION;
  sourceArtifact: {
    comparisonVersion: string;
    sourceUrl?: string;
    scanId?: string;
    reviewId?: string;
    adapterVersion?: string;
  };
  productionEligible: false;
  topFindingEligible: false;
  gapEligible: false;
  status: "manual_reviewer_packet_internal_only";
  internalOnlyBanner: "Internal shadow diagnostic only. Not customer-facing report output.";
  candidateCount: number;
  queueItemCount: number;
  queueItems: Wc01V2ManualReviewerQueueItem[];
  reviewerActionOptions: Wc01V2ManualReviewerActionOption[];
  blockedCandidates: Wc01V2ConcernPolicyComparisonDryRun["blockedCandidates"];
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
    noProductionEligibility: true;
    noTopFindingEligibility: true;
    noGapEligibility: true;
  };
};

const LEGAL_CONCLUSION_PATTERN =
  /\b(gap_observed|violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i;

export function parseWc01V2ConcernPolicyComparisonDryRunJson(
  raw: string,
): Wc01V2ConcernPolicyComparisonDryRun {
  if (containsForbiddenGapObservedToken(raw)) {
    throw new Error("Wc01V2ConcernPolicyComparisonDryRun contains forbidden gap status token.");
  }
  if (containsBlockedRawFields(raw)) {
    throw new Error("Wc01V2ConcernPolicyComparisonDryRun contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(raw)) {
    throw new Error("Wc01V2ConcernPolicyComparisonDryRun contains legal-conclusion language.");
  }

  const parsed = JSON.parse(raw) as unknown;
  validateComparison(parsed);
  return parsed;
}

export function buildWc01V2ManualReviewerPacket(
  comparison: Wc01V2ConcernPolicyComparisonDryRun,
): Wc01V2ManualReviewerPacket {
  validateComparison(comparison);

  const packet: Wc01V2ManualReviewerPacket = {
    packetVersion: WC01_V2_MANUAL_REVIEWER_PACKET_VERSION,
    sourceArtifact: {
      comparisonVersion: comparison.comparisonVersion,
      sourceUrl: comparison.source.sourceUrl,
      scanId: comparison.source.scanId,
      reviewId: comparison.source.reviewId,
      adapterVersion: comparison.source.adapterVersion,
    },
    productionEligible: false,
    topFindingEligible: false,
    gapEligible: false,
    status: "manual_reviewer_packet_internal_only",
    internalOnlyBanner: "Internal shadow diagnostic only. Not customer-facing report output.",
    candidateCount: comparison.candidateCount,
    queueItemCount: comparison.comparisonResults.length,
    queueItems: comparison.comparisonResults.map((result) => queueItemForResult(result)),
    reviewerActionOptions: reviewerActionOptions(),
    blockedCandidates: comparison.blockedCandidates,
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
      noProductionEligibility: true,
      noTopFindingEligibility: true,
      noGapEligibility: true,
    },
  };

  assertPacketGuardrails(packet);
  return packet;
}

export function buildWc01V2ManualReviewerPacketJson(raw: string) {
  return buildWc01V2ManualReviewerPacket(parseWc01V2ConcernPolicyComparisonDryRunJson(raw));
}

function queueItemForResult(
  result: Wc01V2ConcernPolicyComparisonResult,
): Wc01V2ManualReviewerQueueItem {
  const reviewerEvidence = result.reviewerEvidence;
  const sensitive = result.wouldRemainInternalOnly ||
    result.reasons.includes("sensitive_context_extra_review_required") ||
    reviewerEvidence.sensitiveContext.requiresExtraReview;
  const reviewFlags = uniqueStrings([
    "copy_policy_review_required",
    sensitive ? "sensitive_context_extra_review_required" : null,
    result.missingRequirements.length > 0 ? "evidence_quality_review_required" : null,
    result.wouldBeSuppressed ? "suppressed_diagnostic_only" : null,
  ]);

  return {
    queueItemId: `review_packet.${result.candidateId}`,
    candidateId: result.candidateId,
    sourceFindingKey: result.sourceFindingKey ?? sourceFindingKeyFromCandidateId(result.candidateId),
    candidateFamily: result.sourceFamily,
    proposedNormalizedConcernKey: result.proposedNormalizedConcernKey,
    simulatedPolicyOutcome: result.simulatedPolicyOutcome,
    queueLane: queueLaneForResult(result),
    reviewFlags,
    sensitiveContext: {
      present: reviewerEvidence.sensitiveContext.present || sensitive,
      requiresExtraReview: reviewerEvidence.sensitiveContext.requiresExtraReview || sensitive,
      categories: reviewerEvidence.sensitiveContext.categories,
      metadataAvailable: true,
    },
    evidence: {
      sourceRefIds: reviewerEvidence.sourceRefIds,
      displaySafeExcerptIds: reviewerEvidence.displaySafeExcerptIds,
      displaySafeExcerptCount: reviewerEvidence.displaySafeExcerptCount,
      sourceRefsAvailable: reviewerEvidence.sourceRefIds.length > 0,
      displaySafeExcerptRefsAvailable: reviewerEvidence.displaySafeExcerptIds.length > 0 ||
        reviewerEvidence.displaySafeExcerptCount > 0,
      comparisonArtifactOnly: true,
    },
    vendorDiagnostics: {
      vendorNames: reviewerEvidence.vendorNames,
      supportingPurposes: reviewerEvidence.supportingPurposes,
      diagnosticPurposes: reviewerEvidence.diagnosticPurposes,
      metadataAvailable: true,
    },
    evidenceQuality: {
      confidence: reviewerEvidence.confidence,
      directness: reviewerEvidence.directness,
      metadataAvailable: true,
    },
    caveats: uniqueStrings([...result.reasons, ...reviewerEvidence.caveats]),
    missingRequirements: uniqueStrings(result.missingRequirements),
    coverageLimitations: reviewerEvidence.coverageLimitations,
    familyEvidenceContext: reviewerEvidence.familyEvidenceContext,
    guardrailStatus: {
      productionEligible: false,
      topFindingEligible: false,
      gapEligible: false,
      noGapObserved: result.guardrails.noGapObserved,
      noLegalConclusionLanguage: result.guardrails.noLegalConclusionLanguage,
      noRawBlockedFields: result.guardrails.noRawBlockedFields,
    },
  };
}

function queueLaneForResult(
  result: Wc01V2ConcernPolicyComparisonResult,
): Wc01V2ManualReviewerQueueLane {
  if (result.simulatedPolicyOutcome === "would_require_more_evidence") {
    return "evidence_quality_review";
  }
  if (result.simulatedPolicyOutcome === "would_be_suppressed") {
    return "blocked_suppressed_diagnostic_only";
  }
  if (
    result.simulatedPolicyOutcome === "would_remain_internal_only" &&
    result.reasons.includes("sensitive_context_extra_review_required")
  ) {
    return "sensitive_context_review_required";
  }
  if (result.reasons.length === 0) {
    return "copy_policy_review_required";
  }
  return "standard_internal_review_candidate";
}

function reviewerActionOptions(): Wc01V2ManualReviewerActionOption[] {
  return [
    "evidence_shape_confirmed",
    "needs_more_evidence",
    "internal_only",
    "policy_copy_review_required",
    "sensitive_context_escalated",
    "rejected_overbroad",
  ].map((action) => ({
    action: action as Wc01V2ManualReviewerActionKey,
    productionEligible: false,
    topFindingEligible: false,
    gapEligible: false,
  }));
}

function validateComparison(value: unknown): asserts value is Wc01V2ConcernPolicyComparisonDryRun {
  if (!isRecord(value)) {
    throw new Error("Wc01V2ConcernPolicyComparisonDryRun must be a JSON object.");
  }
  if (value.comparisonVersion !== WC01_V2_CONCERN_POLICY_COMPARISON_DRY_RUN_VERSION) {
    throw new Error("Unsupported Wc01V2ConcernPolicyComparisonDryRun version.");
  }
  if (value.productionEligible !== false || value.topFindingEligible !== false || value.gapEligible !== false) {
    throw new Error("Wc01V2ConcernPolicyComparisonDryRun contains forbidden eligibility.");
  }
  if (!Array.isArray(value.comparisonResults)) {
    throw new Error("Wc01V2ConcernPolicyComparisonDryRun.comparisonResults must be an array.");
  }
  if (!Array.isArray(value.blockedCandidates)) {
    throw new Error("Wc01V2ConcernPolicyComparisonDryRun.blockedCandidates must be an array.");
  }
  if (!isRecord(value.guardrails)) {
    throw new Error("Wc01V2ConcernPolicyComparisonDryRun.guardrails must be an object.");
  }

  const guardrailFailures = Object.entries(value.guardrails)
    .filter(([, passed]) => passed !== true)
    .map(([key]) => key);
  if (guardrailFailures.length > 0) {
    throw new Error(`Wc01V2ConcernPolicyComparisonDryRun guardrails failed: ${guardrailFailures.join(", ")}.`);
  }

  for (const result of value.comparisonResults) {
    validateComparisonResult(result);
  }
}

function validateComparisonResult(value: unknown): asserts value is Wc01V2ConcernPolicyComparisonResult {
  if (!isRecord(value)) {
    throw new Error("Wc01V2ConcernPolicyComparisonDryRun comparison result must be an object.");
  }
  if (value.productionEligible !== false || value.topFindingEligible !== false || value.gapEligible !== false) {
    throw new Error("Wc01V2ConcernPolicyComparisonDryRun result contains forbidden eligibility.");
  }
  if (typeof value.candidateId !== "string" || value.candidateId.trim().length === 0) {
    throw new Error("Wc01V2ConcernPolicyComparisonDryRun result missing candidateId.");
  }
  if (typeof value.sourceFamily !== "string" || value.sourceFamily.trim().length === 0) {
    throw new Error("Wc01V2ConcernPolicyComparisonDryRun result missing sourceFamily.");
  }
  if (typeof value.proposedNormalizedConcernKey !== "string" || value.proposedNormalizedConcernKey.trim().length === 0) {
    throw new Error("Wc01V2ConcernPolicyComparisonDryRun result missing proposedNormalizedConcernKey.");
  }
  if (
    value.simulatedPolicyOutcome !== "would_accept_for_internal_review" &&
    value.simulatedPolicyOutcome !== "would_require_more_evidence" &&
    value.simulatedPolicyOutcome !== "would_remain_internal_only" &&
    value.simulatedPolicyOutcome !== "would_be_suppressed"
  ) {
    throw new Error("Wc01V2ConcernPolicyComparisonDryRun result has unsupported simulatedPolicyOutcome.");
  }
  if (!Array.isArray(value.reasons) || !Array.isArray(value.missingRequirements)) {
    throw new Error("Wc01V2ConcernPolicyComparisonDryRun result missing review metadata arrays.");
  }
  if (!isRecord(value.reviewerEvidence)) {
    throw new Error("Wc01V2ConcernPolicyComparisonDryRun result missing reviewerEvidence.");
  }
  if (!isRecord(value.guardrails)) {
    throw new Error("Wc01V2ConcernPolicyComparisonDryRun result guardrails must be an object.");
  }
  const guardrailFailures = Object.entries(value.guardrails)
    .filter(([, passed]) => passed !== true)
    .map(([key]) => key);
  if (guardrailFailures.length > 0) {
    throw new Error(`Wc01V2ConcernPolicyComparisonDryRun result guardrails failed: ${guardrailFailures.join(", ")}.`);
  }
}

function assertPacketGuardrails(packet: Wc01V2ManualReviewerPacket) {
  const serialized = JSON.stringify(packet);
  if (containsForbiddenGapObservedToken(serialized)) {
    throw new Error("Manual reviewer packet contains forbidden gap status token.");
  }
  if (containsBlockedRawFields(serialized)) {
    throw new Error("Manual reviewer packet contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(serialized)) {
    throw new Error("Manual reviewer packet contains legal-conclusion language.");
  }
  if (packet.productionEligible || packet.topFindingEligible || packet.gapEligible) {
    throw new Error("Manual reviewer packet contains forbidden eligibility.");
  }
  if (packet.queueItems.some((item) =>
    item.guardrailStatus.productionEligible ||
    item.guardrailStatus.topFindingEligible ||
    item.guardrailStatus.gapEligible
  )) {
    throw new Error("Manual reviewer packet contains eligible queue items.");
  }
}

function sourceFindingKeyFromCandidateId(candidateId: string) {
  const parts = candidateId.split(".");
  const markerIndex = parts.indexOf("v2_concern_input");
  const key = markerIndex >= 0 ? parts[markerIndex + 1] : undefined;
  return key && key.trim().length > 0 ? key : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string =>
    typeof value === "string" && value.trim().length > 0
  ))].sort();
}
