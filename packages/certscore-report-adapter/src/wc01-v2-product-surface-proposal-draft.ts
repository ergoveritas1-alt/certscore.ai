import {
  containsBlockedRawFields,
  containsForbiddenGapObservedToken,
} from "./wc01-shadow-output";

export const WC01_V2_PRODUCT_SURFACE_PROPOSAL_DRAFT_VERSION =
  "wc01.v2_product_surface_proposal_draft.1";

export const WC01_V2_PRODUCT_SURFACE_PROPOSAL_INPUT_VERSION =
  "wc01.v2_product_surface_proposal_input.1";

export type Wc01V2ProductSurfaceClass =
  | "internal_evidence_preview"
  | "internal_reviewer_log"
  | "internal_policy_copy_review_artifact"
  | "internal_production_readiness_draft"
  | "internal_product_proposal_artifact"
  | "limited_admin_internal_preview"
  | "customer_facing_report_row"
  | "customer_facing_checklist_row"
  | "executive_summary_item"
  | "top_finding"
  | "score_impact"
  | "regulatory_lens_output"
  | "export_api_mcp_output";

export type Wc01V2ProductSurfaceCopyPosture =
  | "no_user_visible_wording"
  | "draft_internal_only"
  | "policy_copy_review_required"
  | "separately_approved_for_named_surface"
  | "blocked";

export type Wc01V2ProductSurfaceProposalInput = {
  inputVersion: typeof WC01_V2_PRODUCT_SURFACE_PROPOSAL_INPUT_VERSION;
  proposedSurfaceClass: Wc01V2ProductSurfaceClass;
  proposedSurfaceAudience: string;
  proposedSurfacePurpose: string;
  sourceProductionReadinessGateDraft?: string;
  sourcePolicyCopyReviewArtifact?: string;
  sourceReviewerWorkflowDocs: string[];
  allowedFamilies: string[];
  blockedFamilies: string[];
  sensitiveContextHandling: {
    required: boolean;
    categories: string[];
    defaultCustomerFacingBlocked: true;
    notes: string[];
  };
  copyPosture: Wc01V2ProductSurfaceCopyPosture;
  evidenceRequirements: string[];
  userVisibleWordingStatus: Wc01V2ProductSurfaceCopyPosture;
  guardrailRequirements: string[];
  approvalRequirements: Array<{
    owner:
      | "evidence_owner"
      | "policy_owner"
      | "copy_owner"
      | "product_owner"
      | "engineering_owner"
      | "security_privacy_reviewer";
    required: true;
    status: "missing" | "pending" | "approved_for_proposal";
    notes?: string;
  }>;
  rollbackSuppressionPlan: {
    suppressionReason: string;
    holdState: string;
    rollbackOwner: string;
    regressionGuardrailCheck: string;
    emergencyDisablePlan: string;
  };
  explicitApprovalMetadata?: Array<{
    owner: string;
    scope: string;
    decision: "approved_for_proposal";
    timestamp?: string;
  }>;
};

export type Wc01V2ProductSurfaceProposalDraft = {
  packetVersion: typeof WC01_V2_PRODUCT_SURFACE_PROPOSAL_DRAFT_VERSION;
  proposedSurfaceClass: Wc01V2ProductSurfaceClass;
  proposedSurfaceAudience: string;
  proposedSurfacePurpose: string;
  sourceProductionReadinessGateDraft?: string;
  sourcePolicyCopyReviewArtifact?: string;
  sourceReviewerWorkflowDocs: string[];
  allowedFamilies: string[];
  blockedFamilies: string[];
  sensitiveContextHandling: Wc01V2ProductSurfaceProposalInput["sensitiveContextHandling"];
  copyPosture: Wc01V2ProductSurfaceCopyPosture;
  evidenceRequirements: string[];
  userVisibleWordingStatus: Wc01V2ProductSurfaceCopyPosture;
  guardrailRequirements: string[];
  approvalRequirements: Wc01V2ProductSurfaceProposalInput["approvalRequirements"];
  rollbackSuppressionPlan: Wc01V2ProductSurfaceProposalInput["rollbackSuppressionPlan"];
  implementationStatus: "not_approved";
  productionEligible: false;
  customerFacingEligible: false;
  explicitApprovalRequired: true;
  failClosedReasons: string[];
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

const SUPPORTED_SURFACE_CLASSES = new Set<Wc01V2ProductSurfaceClass>([
  "internal_evidence_preview",
  "internal_reviewer_log",
  "internal_policy_copy_review_artifact",
  "internal_production_readiness_draft",
  "internal_product_proposal_artifact",
  "limited_admin_internal_preview",
  "customer_facing_report_row",
  "customer_facing_checklist_row",
  "executive_summary_item",
  "top_finding",
  "score_impact",
  "regulatory_lens_output",
  "export_api_mcp_output",
]);

const HIGH_RISK_SURFACES = new Set<Wc01V2ProductSurfaceClass>([
  "limited_admin_internal_preview",
  "customer_facing_report_row",
  "customer_facing_checklist_row",
  "executive_summary_item",
  "top_finding",
  "score_impact",
  "regulatory_lens_output",
  "export_api_mcp_output",
]);

const CUSTOMER_FACING_SURFACES = new Set<Wc01V2ProductSurfaceClass>([
  "customer_facing_report_row",
  "customer_facing_checklist_row",
  "executive_summary_item",
  "top_finding",
  "score_impact",
  "regulatory_lens_output",
  "export_api_mcp_output",
]);

const COPY_POSTURES = new Set<Wc01V2ProductSurfaceCopyPosture>([
  "no_user_visible_wording",
  "draft_internal_only",
  "policy_copy_review_required",
  "separately_approved_for_named_surface",
  "blocked",
]);

export function parseWc01V2ProductSurfaceProposalInputJson(
  raw: string,
): Wc01V2ProductSurfaceProposalInput {
  if (containsForbiddenGapObservedToken(raw)) {
    throw new Error("Wc01V2ProductSurfaceProposalInput contains forbidden status token.");
  }
  if (containsBlockedRawFields(raw)) {
    throw new Error("Wc01V2ProductSurfaceProposalInput contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(raw)) {
    throw new Error("Wc01V2ProductSurfaceProposalInput contains legal-conclusion language.");
  }

  const parsed = JSON.parse(raw) as unknown;
  validateProposalInput(parsed);
  return parsed;
}

export function buildWc01V2ProductSurfaceProposalDraft(
  input: Wc01V2ProductSurfaceProposalInput,
): Wc01V2ProductSurfaceProposalDraft {
  validateProposalInput(input);

  const draft: Wc01V2ProductSurfaceProposalDraft = {
    packetVersion: WC01_V2_PRODUCT_SURFACE_PROPOSAL_DRAFT_VERSION,
    proposedSurfaceClass: input.proposedSurfaceClass,
    proposedSurfaceAudience: input.proposedSurfaceAudience,
    proposedSurfacePurpose: input.proposedSurfacePurpose,
    sourceProductionReadinessGateDraft: input.sourceProductionReadinessGateDraft,
    sourcePolicyCopyReviewArtifact: input.sourcePolicyCopyReviewArtifact,
    sourceReviewerWorkflowDocs: [...input.sourceReviewerWorkflowDocs],
    allowedFamilies: [...input.allowedFamilies],
    blockedFamilies: [...input.blockedFamilies],
    sensitiveContextHandling: {
      required: input.sensitiveContextHandling.required,
      categories: [...input.sensitiveContextHandling.categories],
      defaultCustomerFacingBlocked: true,
      notes: [...input.sensitiveContextHandling.notes],
    },
    copyPosture: input.copyPosture,
    evidenceRequirements: [...input.evidenceRequirements],
    userVisibleWordingStatus: input.userVisibleWordingStatus,
    guardrailRequirements: [...input.guardrailRequirements],
    approvalRequirements: input.approvalRequirements.map((requirement) => ({ ...requirement })),
    rollbackSuppressionPlan: { ...input.rollbackSuppressionPlan },
    implementationStatus: "not_approved",
    productionEligible: false,
    customerFacingEligible: false,
    explicitApprovalRequired: true,
    failClosedReasons: failClosedReasonsForInput(input),
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

  assertProposalDraftGuardrails(draft);
  return draft;
}

export function buildWc01V2ProductSurfaceProposalDraftJson(raw: string) {
  return buildWc01V2ProductSurfaceProposalDraft(
    parseWc01V2ProductSurfaceProposalInputJson(raw),
  );
}

export function failClosedReasonsForInput(input: Wc01V2ProductSurfaceProposalInput) {
  const reasons: string[] = [];

  if (!input.sourceProductionReadinessGateDraft) {
    reasons.push("source_production_readiness_gate_draft_missing");
  }
  if (input.sensitiveContextHandling.required && !input.sourcePolicyCopyReviewArtifact) {
    reasons.push("policy_copy_review_artifact_missing_for_sensitive_context");
  }
  if (input.sensitiveContextHandling.required && input.sensitiveContextHandling.categories.length === 0) {
    reasons.push("sensitive_context_categories_missing");
  }
  if (input.evidenceRequirements.length === 0) {
    reasons.push("evidence_requirements_missing");
  }
  if (input.guardrailRequirements.length === 0) {
    reasons.push("guardrail_requirements_missing");
  }
  if (input.approvalRequirements.length === 0) {
    reasons.push("approval_requirements_missing");
  }
  if (input.allowedFamilies.length === 0 && input.blockedFamilies.length === 0) {
    reasons.push("allowed_or_blocked_families_missing");
  }
  if (!hasCompleteRollbackSuppressionPlan(input.rollbackSuppressionPlan)) {
    reasons.push("rollback_suppression_plan_incomplete");
  }
  if (
    (CUSTOMER_FACING_SURFACES.has(input.proposedSurfaceClass) ||
      HIGH_RISK_SURFACES.has(input.proposedSurfaceClass)) &&
    !hasExplicitApprovalMetadata(input)
  ) {
    reasons.push("explicit_approval_metadata_missing_for_blocked_surface");
  }
  if (
    input.userVisibleWordingStatus === "separately_approved_for_named_surface" &&
    !hasApprovedCopyOwner(input)
  ) {
    reasons.push("copy_owner_approval_missing_for_named_surface_wording");
  }

  return uniqueStrings(reasons);
}

function validateProposalInput(value: unknown): asserts value is Wc01V2ProductSurfaceProposalInput {
  if (!isRecord(value)) {
    throw new Error("Wc01V2ProductSurfaceProposalInput must be an object.");
  }
  if (value.inputVersion !== WC01_V2_PRODUCT_SURFACE_PROPOSAL_INPUT_VERSION) {
    throw new Error("Unsupported Wc01V2ProductSurfaceProposalInput version.");
  }
  if (!SUPPORTED_SURFACE_CLASSES.has(value.proposedSurfaceClass as Wc01V2ProductSurfaceClass)) {
    throw new Error("Unsupported proposedSurfaceClass.");
  }
  assertNonEmptyString(value.proposedSurfaceAudience, "proposedSurfaceAudience");
  assertNonEmptyString(value.proposedSurfacePurpose, "proposedSurfacePurpose");
  assertStringArray(value.sourceReviewerWorkflowDocs, "sourceReviewerWorkflowDocs");
  assertStringArray(value.allowedFamilies, "allowedFamilies");
  assertStringArray(value.blockedFamilies, "blockedFamilies");
  if (!COPY_POSTURES.has(value.copyPosture as Wc01V2ProductSurfaceCopyPosture)) {
    throw new Error("Unsupported copyPosture.");
  }
  if (!COPY_POSTURES.has(value.userVisibleWordingStatus as Wc01V2ProductSurfaceCopyPosture)) {
    throw new Error("Unsupported userVisibleWordingStatus.");
  }
  assertStringArray(value.evidenceRequirements, "evidenceRequirements");
  assertStringArray(value.guardrailRequirements, "guardrailRequirements");
  validateSensitiveContextHandling(value.sensitiveContextHandling);
  validateApprovalRequirements(value.approvalRequirements);
  validateRollbackSuppressionPlan(value.rollbackSuppressionPlan);
  if (
    value.sourceProductionReadinessGateDraft !== undefined &&
    typeof value.sourceProductionReadinessGateDraft !== "string"
  ) {
    throw new Error("sourceProductionReadinessGateDraft must be a string when provided.");
  }
  if (
    value.sourcePolicyCopyReviewArtifact !== undefined &&
    typeof value.sourcePolicyCopyReviewArtifact !== "string"
  ) {
    throw new Error("sourcePolicyCopyReviewArtifact must be a string when provided.");
  }
}

function validateSensitiveContextHandling(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("sensitiveContextHandling must be an object.");
  }
  if (typeof value.required !== "boolean") {
    throw new Error("sensitiveContextHandling.required must be boolean.");
  }
  if (value.defaultCustomerFacingBlocked !== true) {
    throw new Error("sensitiveContextHandling.defaultCustomerFacingBlocked must be true.");
  }
  assertStringArray(value.categories, "sensitiveContextHandling.categories");
  assertStringArray(value.notes, "sensitiveContextHandling.notes");
}

function validateApprovalRequirements(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("approvalRequirements must be an array.");
  }
  for (const requirement of value) {
    if (!isRecord(requirement)) {
      throw new Error("approvalRequirements entries must be objects.");
    }
    assertNonEmptyString(requirement.owner, "approvalRequirements.owner");
    if (requirement.required !== true) {
      throw new Error("approvalRequirements.required must be true.");
    }
    if (
      requirement.status !== "missing" &&
      requirement.status !== "pending" &&
      requirement.status !== "approved_for_proposal"
    ) {
      throw new Error("approvalRequirements.status is unsupported.");
    }
    if (requirement.notes !== undefined && typeof requirement.notes !== "string") {
      throw new Error("approvalRequirements.notes must be a string when provided.");
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
  plan: Wc01V2ProductSurfaceProposalInput["rollbackSuppressionPlan"],
) {
  return Boolean(
    plan.suppressionReason &&
      plan.holdState &&
      plan.rollbackOwner &&
      plan.regressionGuardrailCheck &&
      plan.emergencyDisablePlan,
  );
}

function hasExplicitApprovalMetadata(input: Wc01V2ProductSurfaceProposalInput) {
  return Boolean(input.explicitApprovalMetadata?.some((approval) => approval.decision === "approved_for_proposal"));
}

function hasApprovedCopyOwner(input: Wc01V2ProductSurfaceProposalInput) {
  return input.approvalRequirements.some((requirement) =>
    requirement.owner === "copy_owner" && requirement.status === "approved_for_proposal"
  );
}

function assertProposalDraftGuardrails(draft: Wc01V2ProductSurfaceProposalDraft) {
  if (draft.productionEligible !== false) {
    throw new Error("Product surface proposal draft must not be production eligible.");
  }
  if (draft.customerFacingEligible !== false) {
    throw new Error("Product surface proposal draft must not be customer-facing eligible.");
  }
  if (draft.implementationStatus !== "not_approved") {
    throw new Error("Product surface proposal draft implementation status must be not approved.");
  }
  if (draft.explicitApprovalRequired !== true) {
    throw new Error("Product surface proposal draft must require explicit approval.");
  }
  const serialized = JSON.stringify(draft);
  if (containsForbiddenGapObservedToken(serialized)) {
    throw new Error("Product surface proposal draft contains forbidden status token.");
  }
  if (containsBlockedRawFields(serialized)) {
    throw new Error("Product surface proposal draft contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(serialized)) {
    throw new Error("Product surface proposal draft contains legal-conclusion language.");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)].sort();
}
