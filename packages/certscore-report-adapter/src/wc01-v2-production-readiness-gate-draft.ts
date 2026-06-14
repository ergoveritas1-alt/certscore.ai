import {
  containsBlockedRawFields,
  containsForbiddenGapObservedToken,
} from "./wc01-shadow-output";
import type { Wc01V2ManualReviewerActionKey } from "./wc01-v2-manual-reviewer-packet";

export const WC01_V2_PRODUCTION_READINESS_GATE_DRAFT_VERSION =
  "wc01.v2_production_readiness_gate_draft.1";

export const WC01_V2_PRODUCTION_READINESS_GATE_INPUT_VERSION =
  "wc01.v2_production_readiness_gate_input.1";

export type Wc01V2ProductionReadinessGateName =
  | "evidence_sufficiency"
  | "reviewer_confirmation"
  | "unresolved_ref"
  | "sensitive_context"
  | "policy_copy"
  | "guardrail_sanitization"
  | "consistency_regression"
  | "product_surface_mapping"
  | "approval_record"
  | "rollback_suppression";

export type Wc01V2ProductionReadinessGateDecision =
  | "passed"
  | "failed"
  | "not_evaluated";

export type Wc01V2ProductionReadinessGateOutcome =
  | "hold_internal_only"
  | "ready_for_policy_copy_review"
  | "ready_for_production_proposal_review"
  | "blocked_needs_more_evidence"
  | "blocked_overbroad"
  | "blocked_guardrail";

export type Wc01V2ProductionReadinessAllowedNextStep =
  | "none"
  | "policy_copy_review"
  | "product_surface_proposal_draft"
  | "evidence_followup"
  | "internal_hold";

export type Wc01V2ProductionReadinessGateResult = {
  gate: Wc01V2ProductionReadinessGateName;
  decision: Wc01V2ProductionReadinessGateDecision;
  owner:
    | "evidence_owner"
    | "reviewer"
    | "policy_owner"
    | "copy_owner"
    | "product_owner"
    | "engineering_owner"
    | "security_privacy_reviewer";
  notes: string[];
  requiredInputs: string[];
};

export type Wc01V2ProductionReadinessGateInput = {
  inputVersion: typeof WC01_V2_PRODUCTION_READINESS_GATE_INPUT_VERSION;
  sourcePreviewPacketPath: string;
  sourceReviewerLogPath: string;
  sourcePolicyCopyReviewArtifact?: string;
  siteDomain: string;
  queueItemId: string;
  candidateFamily: string;
  reviewerAction: Wc01V2ManualReviewerActionKey;
  sensitiveContextCategories: string[];
  evidenceRefs: string[];
  excerptRefs: string[];
  unresolvedRefCount: number;
  redactionWarningCount: number;
  guardrailScanResult: {
    passed: boolean;
    notes: string[];
  };
  gateResults: Wc01V2ProductionReadinessGateResult[];
  approvalRecord: Array<{
    owner:
      | "evidence_owner"
      | "reviewer"
      | "policy_owner"
      | "copy_owner"
      | "product_owner"
      | "engineering_owner"
      | "security_privacy_reviewer";
    decision: "approved_for_internal_gate" | "pending" | "missing";
    scope: string;
    timestamp?: string;
    notes?: string;
  }>;
  rollbackSuppressionPlan: {
    suppressionReason: string;
    holdState: string;
    rollbackOwner: string;
    regressionGuardrailCheck: string;
    emergencyDisablePlan: string;
  };
};

export type Wc01V2ProductionReadinessGateDraft = {
  packetVersion: typeof WC01_V2_PRODUCTION_READINESS_GATE_DRAFT_VERSION;
  sourcePreviewPacketPath: string;
  sourceReviewerLogPath: string;
  sourcePolicyCopyReviewArtifact?: string;
  siteDomain: string;
  queueItemId: string;
  candidateFamily: string;
  reviewerAction: Wc01V2ManualReviewerActionKey;
  sensitiveContextCategories: string[];
  evidenceRefs: string[];
  excerptRefs: string[];
  unresolvedRefCount: number;
  redactionWarningCount: number;
  gateResults: Wc01V2ProductionReadinessGateResult[];
  overallGateOutcome: Wc01V2ProductionReadinessGateOutcome;
  allowedNextStep: Wc01V2ProductionReadinessAllowedNextStep;
  blockedReason: string[];
  approvalRecord: Wc01V2ProductionReadinessGateInput["approvalRecord"];
  rollbackSuppressionPlan: Wc01V2ProductionReadinessGateInput["rollbackSuppressionPlan"];
  auditTrail: {
    sourcePreviewPacketPath: string;
    sourceReviewerLogPath: string;
    sourcePolicyCopyReviewArtifact?: string;
    guardrailScanPassed: boolean;
    guardrailScanNotes: string[];
  };
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

const SUPPORTED_GATES = new Set<Wc01V2ProductionReadinessGateName>([
  "evidence_sufficiency",
  "reviewer_confirmation",
  "unresolved_ref",
  "sensitive_context",
  "policy_copy",
  "guardrail_sanitization",
  "consistency_regression",
  "product_surface_mapping",
  "approval_record",
  "rollback_suppression",
]);

const REQUIRED_GATES: Wc01V2ProductionReadinessGateName[] = [
  "evidence_sufficiency",
  "reviewer_confirmation",
  "unresolved_ref",
  "sensitive_context",
  "policy_copy",
  "guardrail_sanitization",
  "consistency_regression",
  "product_surface_mapping",
  "approval_record",
  "rollback_suppression",
];

const REVIEWER_ACTIONS = new Set<Wc01V2ManualReviewerActionKey>([
  "evidence_shape_confirmed",
  "needs_more_evidence",
  "internal_only",
  "policy_copy_review_required",
  "sensitive_context_escalated",
  "rejected_overbroad",
]);

const GATE_DECISIONS = new Set<Wc01V2ProductionReadinessGateDecision>([
  "passed",
  "failed",
  "not_evaluated",
]);

export function parseWc01V2ProductionReadinessGateInputJson(
  raw: string,
): Wc01V2ProductionReadinessGateInput {
  if (containsForbiddenGapObservedToken(raw)) {
    throw new Error("Wc01V2ProductionReadinessGateInput contains forbidden status token.");
  }
  if (containsBlockedRawFields(raw)) {
    throw new Error("Wc01V2ProductionReadinessGateInput contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(raw)) {
    throw new Error("Wc01V2ProductionReadinessGateInput contains legal-conclusion language.");
  }

  const parsed = JSON.parse(raw) as unknown;
  validateGateInput(parsed);
  return parsed;
}

export function buildWc01V2ProductionReadinessGateDraft(
  input: Wc01V2ProductionReadinessGateInput,
): Wc01V2ProductionReadinessGateDraft {
  validateGateInput(input);

  const blockedReason = failClosedReasonsForProductionReadinessGateInput(input);
  const overallGateOutcome = determineOverallGateOutcome(input, blockedReason);
  const allowedNextStep = determineAllowedNextStep(overallGateOutcome);

  const draft: Wc01V2ProductionReadinessGateDraft = {
    packetVersion: WC01_V2_PRODUCTION_READINESS_GATE_DRAFT_VERSION,
    sourcePreviewPacketPath: input.sourcePreviewPacketPath,
    sourceReviewerLogPath: input.sourceReviewerLogPath,
    sourcePolicyCopyReviewArtifact: input.sourcePolicyCopyReviewArtifact,
    siteDomain: input.siteDomain,
    queueItemId: input.queueItemId,
    candidateFamily: input.candidateFamily,
    reviewerAction: input.reviewerAction,
    sensitiveContextCategories: [...input.sensitiveContextCategories],
    evidenceRefs: [...input.evidenceRefs],
    excerptRefs: [...input.excerptRefs],
    unresolvedRefCount: input.unresolvedRefCount,
    redactionWarningCount: input.redactionWarningCount,
    gateResults: input.gateResults.map((result) => ({
      ...result,
      notes: [...result.notes],
      requiredInputs: [...result.requiredInputs],
    })),
    overallGateOutcome,
    allowedNextStep,
    blockedReason,
    approvalRecord: input.approvalRecord.map((approval) => ({ ...approval })),
    rollbackSuppressionPlan: { ...input.rollbackSuppressionPlan },
    auditTrail: {
      sourcePreviewPacketPath: input.sourcePreviewPacketPath,
      sourceReviewerLogPath: input.sourceReviewerLogPath,
      sourcePolicyCopyReviewArtifact: input.sourcePolicyCopyReviewArtifact,
      guardrailScanPassed: input.guardrailScanResult.passed,
      guardrailScanNotes: [...input.guardrailScanResult.notes],
    },
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

  assertProductionReadinessGateDraftGuardrails(draft);
  return draft;
}

export function buildWc01V2ProductionReadinessGateDraftJson(raw: string) {
  return buildWc01V2ProductionReadinessGateDraft(
    parseWc01V2ProductionReadinessGateInputJson(raw),
  );
}

export function failClosedReasonsForProductionReadinessGateInput(
  input: Wc01V2ProductionReadinessGateInput,
) {
  const reasons: string[] = [];
  const gateNames = new Set(input.gateResults.map((result) => result.gate));

  for (const requiredGate of REQUIRED_GATES) {
    if (!gateNames.has(requiredGate)) {
      reasons.push(`required_gate_missing:${requiredGate}`);
    }
  }

  if (input.evidenceRefs.length === 0) {
    reasons.push("evidence_refs_missing");
  }
  if (input.excerptRefs.length === 0) {
    reasons.push("excerpt_refs_missing");
  }
  if (!input.guardrailScanResult.passed) {
    reasons.push("guardrail_scan_failed");
  }
  if (!hasCompleteRollbackSuppressionPlan(input.rollbackSuppressionPlan)) {
    reasons.push("rollback_suppression_plan_incomplete");
  }
  if (input.approvalRecord.length === 0) {
    reasons.push("approval_record_missing");
  }
  if (
    input.sensitiveContextCategories.length > 0 &&
    !input.sourcePolicyCopyReviewArtifact
  ) {
    reasons.push("policy_copy_review_artifact_missing_for_sensitive_context");
  }

  for (const result of input.gateResults) {
    if (result.decision === "failed") {
      reasons.push(`gate_failed:${result.gate}`);
    }
    if (result.decision === "not_evaluated") {
      reasons.push(`gate_not_evaluated:${result.gate}`);
    }
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

function determineOverallGateOutcome(
  input: Wc01V2ProductionReadinessGateInput,
  blockedReason: string[],
): Wc01V2ProductionReadinessGateOutcome {
  if (
    blockedReason.some((reason) =>
      reason === "guardrail_scan_failed" ||
        reason === "gate_failed:guardrail_sanitization"
    )
  ) {
    return "blocked_guardrail";
  }
  if (input.reviewerAction === "rejected_overbroad") {
    return "blocked_overbroad";
  }
  if (
    input.reviewerAction === "needs_more_evidence" ||
    blockedReason.includes("evidence_refs_missing") ||
    blockedReason.includes("excerpt_refs_missing") ||
    blockedReason.includes("gate_failed:evidence_sufficiency") ||
    blockedReason.includes("gate_failed:unresolved_ref")
  ) {
    return "blocked_needs_more_evidence";
  }
  if (blockedReason.length > 0) {
    return "hold_internal_only";
  }
  if (
    input.reviewerAction === "policy_copy_review_required" ||
    input.reviewerAction === "sensitive_context_escalated"
  ) {
    return "ready_for_policy_copy_review";
  }
  return "ready_for_production_proposal_review";
}

function determineAllowedNextStep(
  outcome: Wc01V2ProductionReadinessGateOutcome,
): Wc01V2ProductionReadinessAllowedNextStep {
  if (outcome === "ready_for_policy_copy_review") {
    return "policy_copy_review";
  }
  if (outcome === "ready_for_production_proposal_review") {
    return "product_surface_proposal_draft";
  }
  if (outcome === "blocked_needs_more_evidence") {
    return "evidence_followup";
  }
  if (outcome === "hold_internal_only") {
    return "internal_hold";
  }
  return "none";
}

function validateGateInput(value: unknown): asserts value is Wc01V2ProductionReadinessGateInput {
  if (!isRecord(value)) {
    throw new Error("Wc01V2ProductionReadinessGateInput must be an object.");
  }
  if (value.inputVersion !== WC01_V2_PRODUCTION_READINESS_GATE_INPUT_VERSION) {
    throw new Error("Unsupported Wc01V2ProductionReadinessGateInput version.");
  }
  assertNonEmptyString(value.sourcePreviewPacketPath, "sourcePreviewPacketPath");
  assertNonEmptyString(value.sourceReviewerLogPath, "sourceReviewerLogPath");
  if (
    value.sourcePolicyCopyReviewArtifact !== undefined &&
    typeof value.sourcePolicyCopyReviewArtifact !== "string"
  ) {
    throw new Error("sourcePolicyCopyReviewArtifact must be a string when provided.");
  }
  assertNonEmptyString(value.siteDomain, "siteDomain");
  assertNonEmptyString(value.queueItemId, "queueItemId");
  assertNonEmptyString(value.candidateFamily, "candidateFamily");
  if (!REVIEWER_ACTIONS.has(value.reviewerAction as Wc01V2ManualReviewerActionKey)) {
    throw new Error("Unsupported reviewerAction.");
  }
  assertStringArray(value.sensitiveContextCategories, "sensitiveContextCategories");
  assertStringArray(value.evidenceRefs, "evidenceRefs");
  assertStringArray(value.excerptRefs, "excerptRefs");
  assertNonNegativeInteger(value.unresolvedRefCount, "unresolvedRefCount");
  assertNonNegativeInteger(value.redactionWarningCount, "redactionWarningCount");
  validateGuardrailScanResult(value.guardrailScanResult);
  validateGateResults(value.gateResults);
  validateApprovalRecord(value.approvalRecord);
  validateRollbackSuppressionPlan(value.rollbackSuppressionPlan);
}

function validateGuardrailScanResult(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("guardrailScanResult must be an object.");
  }
  if (typeof value.passed !== "boolean") {
    throw new Error("guardrailScanResult.passed must be boolean.");
  }
  assertStringArray(value.notes, "guardrailScanResult.notes");
}

function validateGateResults(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("gateResults must be an array.");
  }
  for (const result of value) {
    if (!isRecord(result)) {
      throw new Error("gateResults entries must be objects.");
    }
    if (!SUPPORTED_GATES.has(result.gate as Wc01V2ProductionReadinessGateName)) {
      throw new Error("Unsupported gate.");
    }
    if (!GATE_DECISIONS.has(result.decision as Wc01V2ProductionReadinessGateDecision)) {
      throw new Error("Unsupported gate decision.");
    }
    assertNonEmptyString(result.owner, "gateResults.owner");
    assertStringArray(result.notes, "gateResults.notes");
    assertStringArray(result.requiredInputs, "gateResults.requiredInputs");
  }
}

function validateApprovalRecord(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("approvalRecord must be an array.");
  }
  for (const approval of value) {
    if (!isRecord(approval)) {
      throw new Error("approvalRecord entries must be objects.");
    }
    assertNonEmptyString(approval.owner, "approvalRecord.owner");
    if (
      approval.decision !== "approved_for_internal_gate" &&
      approval.decision !== "pending" &&
      approval.decision !== "missing"
    ) {
      throw new Error("Unsupported approvalRecord decision.");
    }
    assertNonEmptyString(approval.scope, "approvalRecord.scope");
    if (approval.timestamp !== undefined && typeof approval.timestamp !== "string") {
      throw new Error("approvalRecord.timestamp must be a string when provided.");
    }
    if (approval.notes !== undefined && typeof approval.notes !== "string") {
      throw new Error("approvalRecord.notes must be a string when provided.");
    }
  }
}

function validateRollbackSuppressionPlan(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("rollbackSuppressionPlan must be an object.");
  }
  assertNonEmptyString(value.suppressionReason, "rollbackSuppressionPlan.suppressionReason");
  assertNonEmptyString(value.holdState, "rollbackSuppressionPlan.holdState");
  assertNonEmptyString(value.rollbackOwner, "rollbackSuppressionPlan.rollbackOwner");
  assertNonEmptyString(value.regressionGuardrailCheck, "rollbackSuppressionPlan.regressionGuardrailCheck");
  assertNonEmptyString(value.emergencyDisablePlan, "rollbackSuppressionPlan.emergencyDisablePlan");
}

function hasCompleteRollbackSuppressionPlan(
  plan: Wc01V2ProductionReadinessGateInput["rollbackSuppressionPlan"],
) {
  return Boolean(
    plan.suppressionReason &&
      plan.holdState &&
      plan.rollbackOwner &&
      plan.regressionGuardrailCheck &&
      plan.emergencyDisablePlan,
  );
}

function assertProductionReadinessGateDraftGuardrails(
  draft: Wc01V2ProductionReadinessGateDraft,
) {
  if (draft.productionEligible !== false) {
    throw new Error("Production readiness gate draft must not be production eligible.");
  }
  if (draft.customerFacingEligible !== false) {
    throw new Error("Production readiness gate draft must not be customer-facing eligible.");
  }
  if (draft.explicitApprovalRequired !== true) {
    throw new Error("Production readiness gate draft must require explicit approval.");
  }
  const serialized = JSON.stringify(draft);
  if (containsForbiddenGapObservedToken(serialized)) {
    throw new Error("Production readiness gate draft contains forbidden status token.");
  }
  if (containsBlockedRawFields(serialized)) {
    throw new Error("Production readiness gate draft contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(serialized)) {
    throw new Error("Production readiness gate draft contains legal-conclusion language.");
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
