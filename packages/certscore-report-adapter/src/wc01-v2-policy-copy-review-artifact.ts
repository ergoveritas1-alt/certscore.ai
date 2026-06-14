import {
  containsBlockedRawFields,
  containsForbiddenGapObservedToken,
} from "./wc01-shadow-output";
import type { Wc01V2ManualReviewerActionKey } from "./wc01-v2-manual-reviewer-packet";

export const WC01_V2_POLICY_COPY_REVIEW_ARTIFACT_VERSION =
  "wc01.v2_policy_copy_review_artifact.1";

export const WC01_V2_POLICY_COPY_REVIEW_INPUT_VERSION =
  "wc01.v2_policy_copy_review_input.1";

export type Wc01V2SensitiveContextCategory =
  | "health"
  | "reproductive_health"
  | "finance"
  | "public_benefits"
  | "employment_hr"
  | "behavioral_analytics_reference";

export type Wc01V2PolicyCopyOwner =
  | "policy_owner"
  | "copy_owner"
  | "product_owner"
  | "evidence_owner"
  | "reviewer";

export type Wc01V2PolicyCopyDecision =
  | "approved_for_internal_review"
  | "pending"
  | "missing"
  | "blocked";

export type Wc01V2PolicyCopyOutcome =
  | "ready_for_production_readiness_gate"
  | "hold_internal_only"
  | "blocked_needs_more_evidence"
  | "blocked_overbroad"
  | "blocked_policy_copy";

export type Wc01V2PolicyCopyAllowedNextStep =
  | "production_readiness_gate_draft"
  | "internal_hold"
  | "evidence_followup"
  | "none";

export type Wc01V2PolicyCopyReviewInput = {
  inputVersion: typeof WC01_V2_POLICY_COPY_REVIEW_INPUT_VERSION;
  sourcePreviewPacketPath: string;
  sourceReviewerLogPath: string;
  siteDomain: string;
  queueItemId: string;
  candidateFamily: string;
  reviewerAction: Wc01V2ManualReviewerActionKey;
  sensitiveContextCategories: Wc01V2SensitiveContextCategory[];
  evidenceRefs: string[];
  excerptRefs: string[];
  confidenceBand: "high" | "medium" | "low";
  directness: "direct" | "inferred" | "mixed";
  familyEvidenceContext: string[];
  allowedInternalPhrasing: string[];
  blockedPhrasingPatterns: string[];
  policyCopyDecisions: Array<{
    owner: Wc01V2PolicyCopyOwner;
    decision: Wc01V2PolicyCopyDecision;
    scope: string;
    notes?: string;
  }>;
  unresolvedRefsDisposition: {
    unresolvedRefCount: number;
    blocksReview: boolean;
    notes: string[];
  };
  redactionSanitization: {
    passed: boolean;
    warningCount: number;
    notes: string[];
  };
  caveats: string[];
  coverageLimitations: string[];
};

export type Wc01V2PolicyCopyReviewArtifact = {
  packetVersion: typeof WC01_V2_POLICY_COPY_REVIEW_ARTIFACT_VERSION;
  sourcePreviewPacketPath: string;
  sourceReviewerLogPath: string;
  siteDomain: string;
  queueItemId: string;
  candidateFamily: string;
  reviewerAction: Wc01V2ManualReviewerActionKey;
  sensitiveContextCategories: Wc01V2SensitiveContextCategory[];
  evidenceRefs: string[];
  excerptRefs: string[];
  confidenceBand: "high" | "medium" | "low";
  directness: "direct" | "inferred" | "mixed";
  familyEvidenceContext: string[];
  allowedInternalPhrasing: string[];
  blockedPhrasingPatterns: string[];
  policyCopyDecisions: Wc01V2PolicyCopyReviewInput["policyCopyDecisions"];
  unresolvedRefsDisposition: Wc01V2PolicyCopyReviewInput["unresolvedRefsDisposition"];
  redactionSanitization: Wc01V2PolicyCopyReviewInput["redactionSanitization"];
  caveats: string[];
  coverageLimitations: string[];
  policyCopyOutcome: Wc01V2PolicyCopyOutcome;
  allowedNextStep: Wc01V2PolicyCopyAllowedNextStep;
  blockedReason: string[];
  sensitiveContextIsRoutingMetadataOnly: true;
  productionEligible: false;
  customerFacingEligible: false;
  explicitApprovalRequired: true;
  guardrails: {
    noAppUi: true;
    noPersistence: true;
    noProductionIntegration: true;
    noProductionConcernPolicyCall: true;
    noPersistedNormalizedConcerns: true;
    noUnifiedFindings: true;
    noReportChecklistExecutiveScoringRegulatoryOutput: true;
    noApiMcpExportOutput: true;
    noCustomerFacingCopy: true;
    noLegalConclusionLanguage: true;
    noForbiddenStatusMapping: true;
    noRawBlockedFields: true;
  };
};

const LEGAL_CONCLUSION_PATTERN =
  /\b(gap_observed|violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i;

const REVIEWER_ACTIONS = new Set<Wc01V2ManualReviewerActionKey>([
  "evidence_shape_confirmed",
  "needs_more_evidence",
  "internal_only",
  "policy_copy_review_required",
  "sensitive_context_escalated",
  "rejected_overbroad",
]);

const SENSITIVE_CONTEXT_CATEGORIES = new Set<Wc01V2SensitiveContextCategory>([
  "health",
  "reproductive_health",
  "finance",
  "public_benefits",
  "employment_hr",
  "behavioral_analytics_reference",
]);

const CONFIDENCE_BANDS = new Set(["high", "medium", "low"]);
const DIRECTNESS_VALUES = new Set(["direct", "inferred", "mixed"]);
const POLICY_COPY_OWNERS = new Set<Wc01V2PolicyCopyOwner>([
  "policy_owner",
  "copy_owner",
  "product_owner",
  "evidence_owner",
  "reviewer",
]);
const POLICY_COPY_DECISIONS = new Set<Wc01V2PolicyCopyDecision>([
  "approved_for_internal_review",
  "pending",
  "missing",
  "blocked",
]);

export function parseWc01V2PolicyCopyReviewInputJson(
  raw: string,
): Wc01V2PolicyCopyReviewInput {
  if (containsForbiddenGapObservedToken(raw)) {
    throw new Error("Wc01V2PolicyCopyReviewInput contains forbidden status token.");
  }
  if (containsBlockedRawFields(raw)) {
    throw new Error("Wc01V2PolicyCopyReviewInput contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(raw)) {
    throw new Error("Wc01V2PolicyCopyReviewInput contains legal-conclusion language.");
  }

  const parsed = JSON.parse(raw) as unknown;
  validatePolicyCopyInput(parsed);
  return parsed;
}

export function buildWc01V2PolicyCopyReviewArtifact(
  input: Wc01V2PolicyCopyReviewInput,
): Wc01V2PolicyCopyReviewArtifact {
  validatePolicyCopyInput(input);

  const blockedReason = failClosedReasonsForPolicyCopyReviewInput(input);
  const policyCopyOutcome = determinePolicyCopyOutcome(input, blockedReason);
  const allowedNextStep = determineAllowedNextStep(policyCopyOutcome);

  const artifact: Wc01V2PolicyCopyReviewArtifact = {
    packetVersion: WC01_V2_POLICY_COPY_REVIEW_ARTIFACT_VERSION,
    sourcePreviewPacketPath: input.sourcePreviewPacketPath,
    sourceReviewerLogPath: input.sourceReviewerLogPath,
    siteDomain: input.siteDomain,
    queueItemId: input.queueItemId,
    candidateFamily: input.candidateFamily,
    reviewerAction: input.reviewerAction,
    sensitiveContextCategories: [...input.sensitiveContextCategories],
    evidenceRefs: [...input.evidenceRefs],
    excerptRefs: [...input.excerptRefs],
    confidenceBand: input.confidenceBand,
    directness: input.directness,
    familyEvidenceContext: [...input.familyEvidenceContext],
    allowedInternalPhrasing: [...input.allowedInternalPhrasing],
    blockedPhrasingPatterns: [...input.blockedPhrasingPatterns],
    policyCopyDecisions: input.policyCopyDecisions.map((decision) => ({ ...decision })),
    unresolvedRefsDisposition: {
      unresolvedRefCount: input.unresolvedRefsDisposition.unresolvedRefCount,
      blocksReview: input.unresolvedRefsDisposition.blocksReview,
      notes: [...input.unresolvedRefsDisposition.notes],
    },
    redactionSanitization: {
      passed: input.redactionSanitization.passed,
      warningCount: input.redactionSanitization.warningCount,
      notes: [...input.redactionSanitization.notes],
    },
    caveats: [...input.caveats],
    coverageLimitations: [...input.coverageLimitations],
    policyCopyOutcome,
    allowedNextStep,
    blockedReason,
    sensitiveContextIsRoutingMetadataOnly: true,
    productionEligible: false,
    customerFacingEligible: false,
    explicitApprovalRequired: true,
    guardrails: {
      noAppUi: true,
      noPersistence: true,
      noProductionIntegration: true,
      noProductionConcernPolicyCall: true,
      noPersistedNormalizedConcerns: true,
      noUnifiedFindings: true,
      noReportChecklistExecutiveScoringRegulatoryOutput: true,
      noApiMcpExportOutput: true,
      noCustomerFacingCopy: true,
      noLegalConclusionLanguage: true,
      noForbiddenStatusMapping: true,
      noRawBlockedFields: true,
    },
  };

  assertPolicyCopyArtifactGuardrails(artifact);
  return artifact;
}

export function buildWc01V2PolicyCopyReviewArtifactJson(raw: string) {
  return buildWc01V2PolicyCopyReviewArtifact(parseWc01V2PolicyCopyReviewInputJson(raw));
}

export function failClosedReasonsForPolicyCopyReviewInput(
  input: Wc01V2PolicyCopyReviewInput,
) {
  const reasons: string[] = [];

  if (input.sensitiveContextCategories.length === 0) {
    reasons.push("sensitive_context_categories_missing");
  }
  if (input.evidenceRefs.length === 0) {
    reasons.push("evidence_refs_missing");
  }
  if (input.excerptRefs.length === 0) {
    reasons.push("excerpt_refs_missing");
  }
  if (input.familyEvidenceContext.length === 0) {
    reasons.push("family_evidence_context_missing");
  }
  if (input.allowedInternalPhrasing.length === 0) {
    reasons.push("allowed_internal_phrasing_missing");
  }
  if (input.blockedPhrasingPatterns.length === 0) {
    reasons.push("blocked_phrasing_patterns_missing");
  }
  if (!hasApprovedOwner(input, "policy_owner")) {
    reasons.push("policy_owner_internal_review_approval_missing");
  }
  if (!hasApprovedOwner(input, "copy_owner")) {
    reasons.push("copy_owner_internal_review_approval_missing");
  }
  if (input.unresolvedRefsDisposition.blocksReview) {
    reasons.push("unresolved_refs_block_review");
  }
  if (!input.redactionSanitization.passed) {
    reasons.push("redaction_sanitization_failed");
  }
  if (input.reviewerAction === "needs_more_evidence") {
    reasons.push("reviewer_action_needs_more_evidence");
  }
  if (input.reviewerAction === "rejected_overbroad") {
    reasons.push("reviewer_action_rejected_overbroad");
  }
  if (input.reviewerAction === "internal_only") {
    reasons.push("reviewer_action_internal_only");
  }

  return uniqueStrings(reasons);
}

function determinePolicyCopyOutcome(
  input: Wc01V2PolicyCopyReviewInput,
  blockedReason: string[],
): Wc01V2PolicyCopyOutcome {
  if (
    blockedReason.includes("redaction_sanitization_failed") ||
    blockedReason.includes("policy_owner_internal_review_approval_missing") ||
    blockedReason.includes("copy_owner_internal_review_approval_missing")
  ) {
    return "blocked_policy_copy";
  }
  if (input.reviewerAction === "rejected_overbroad") {
    return "blocked_overbroad";
  }
  if (
    input.reviewerAction === "needs_more_evidence" ||
    blockedReason.includes("evidence_refs_missing") ||
    blockedReason.includes("excerpt_refs_missing") ||
    blockedReason.includes("family_evidence_context_missing") ||
    blockedReason.includes("unresolved_refs_block_review")
  ) {
    return "blocked_needs_more_evidence";
  }
  if (blockedReason.length > 0) {
    return "hold_internal_only";
  }
  return "ready_for_production_readiness_gate";
}

function determineAllowedNextStep(
  outcome: Wc01V2PolicyCopyOutcome,
): Wc01V2PolicyCopyAllowedNextStep {
  if (outcome === "ready_for_production_readiness_gate") {
    return "production_readiness_gate_draft";
  }
  if (outcome === "blocked_needs_more_evidence") {
    return "evidence_followup";
  }
  if (outcome === "hold_internal_only") {
    return "internal_hold";
  }
  return "none";
}

function validatePolicyCopyInput(value: unknown): asserts value is Wc01V2PolicyCopyReviewInput {
  if (!isRecord(value)) {
    throw new Error("Wc01V2PolicyCopyReviewInput must be an object.");
  }
  if (value.inputVersion !== WC01_V2_POLICY_COPY_REVIEW_INPUT_VERSION) {
    throw new Error("Unsupported Wc01V2PolicyCopyReviewInput version.");
  }
  assertNonEmptyString(value.sourcePreviewPacketPath, "sourcePreviewPacketPath");
  assertNonEmptyString(value.sourceReviewerLogPath, "sourceReviewerLogPath");
  assertNonEmptyString(value.siteDomain, "siteDomain");
  assertNonEmptyString(value.queueItemId, "queueItemId");
  assertNonEmptyString(value.candidateFamily, "candidateFamily");
  if (!REVIEWER_ACTIONS.has(value.reviewerAction as Wc01V2ManualReviewerActionKey)) {
    throw new Error("Unsupported reviewerAction.");
  }
  validateSensitiveContextCategories(value.sensitiveContextCategories);
  assertStringArray(value.evidenceRefs, "evidenceRefs");
  assertStringArray(value.excerptRefs, "excerptRefs");
  if (!CONFIDENCE_BANDS.has(value.confidenceBand as string)) {
    throw new Error("Unsupported confidenceBand.");
  }
  if (!DIRECTNESS_VALUES.has(value.directness as string)) {
    throw new Error("Unsupported directness.");
  }
  assertStringArray(value.familyEvidenceContext, "familyEvidenceContext");
  assertStringArray(value.allowedInternalPhrasing, "allowedInternalPhrasing");
  assertStringArray(value.blockedPhrasingPatterns, "blockedPhrasingPatterns");
  validatePolicyCopyDecisions(value.policyCopyDecisions);
  validateUnresolvedRefsDisposition(value.unresolvedRefsDisposition);
  validateRedactionSanitization(value.redactionSanitization);
  assertStringArray(value.caveats, "caveats");
  assertStringArray(value.coverageLimitations, "coverageLimitations");
}

function validateSensitiveContextCategories(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("sensitiveContextCategories must be an array.");
  }
  for (const category of value) {
    if (!SENSITIVE_CONTEXT_CATEGORIES.has(category as Wc01V2SensitiveContextCategory)) {
      throw new Error("Unsupported sensitive-context category.");
    }
  }
}

function validatePolicyCopyDecisions(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("policyCopyDecisions must be an array.");
  }
  for (const decision of value) {
    if (!isRecord(decision)) {
      throw new Error("policyCopyDecisions entries must be objects.");
    }
    if (!POLICY_COPY_OWNERS.has(decision.owner as Wc01V2PolicyCopyOwner)) {
      throw new Error("Unsupported policyCopyDecisions.owner.");
    }
    if (!POLICY_COPY_DECISIONS.has(decision.decision as Wc01V2PolicyCopyDecision)) {
      throw new Error("Unsupported policyCopyDecisions.decision.");
    }
    assertNonEmptyString(decision.scope, "policyCopyDecisions.scope");
    if (decision.notes !== undefined && typeof decision.notes !== "string") {
      throw new Error("policyCopyDecisions.notes must be a string when provided.");
    }
  }
}

function validateUnresolvedRefsDisposition(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("unresolvedRefsDisposition must be an object.");
  }
  assertNonNegativeInteger(value.unresolvedRefCount, "unresolvedRefsDisposition.unresolvedRefCount");
  if (typeof value.blocksReview !== "boolean") {
    throw new Error("unresolvedRefsDisposition.blocksReview must be boolean.");
  }
  assertStringArray(value.notes, "unresolvedRefsDisposition.notes");
}

function validateRedactionSanitization(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("redactionSanitization must be an object.");
  }
  if (typeof value.passed !== "boolean") {
    throw new Error("redactionSanitization.passed must be boolean.");
  }
  assertNonNegativeInteger(value.warningCount, "redactionSanitization.warningCount");
  assertStringArray(value.notes, "redactionSanitization.notes");
}

function hasApprovedOwner(input: Wc01V2PolicyCopyReviewInput, owner: Wc01V2PolicyCopyOwner) {
  return input.policyCopyDecisions.some((decision) =>
    decision.owner === owner && decision.decision === "approved_for_internal_review"
  );
}

function assertPolicyCopyArtifactGuardrails(artifact: Wc01V2PolicyCopyReviewArtifact) {
  if (artifact.productionEligible !== false) {
    throw new Error("Policy/copy review artifact must not be production eligible.");
  }
  if (artifact.customerFacingEligible !== false) {
    throw new Error("Policy/copy review artifact must not be customer-facing eligible.");
  }
  if (artifact.explicitApprovalRequired !== true) {
    throw new Error("Policy/copy review artifact must require explicit approval.");
  }
  if (artifact.sensitiveContextIsRoutingMetadataOnly !== true) {
    throw new Error("Policy/copy review artifact must keep sensitive context as routing metadata.");
  }
  const serialized = JSON.stringify(artifact);
  if (containsForbiddenGapObservedToken(serialized)) {
    throw new Error("Policy/copy review artifact contains forbidden status token.");
  }
  if (containsBlockedRawFields(serialized)) {
    throw new Error("Policy/copy review artifact contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(serialized)) {
    throw new Error("Policy/copy review artifact contains legal-conclusion language.");
  }
}

function assertNonEmptyString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

function assertStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${fieldName} must be an array of strings.`);
  }
}

function assertNonNegativeInteger(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)].sort();
}
