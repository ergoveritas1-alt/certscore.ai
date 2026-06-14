import {
  containsBlockedRawFields,
  containsForbiddenGapObservedToken,
} from "./wc01-shadow-output";
import {
  type Wc01V2LimitedAdminPreviewApprovalMetadata,
  WC01_V2_LIMITED_ADMIN_PREVIEW_APPROVAL_METADATA_VERSION,
} from "./wc01-v2-limited-admin-preview-approval-metadata";
import {
  type Wc01V2ProductSurfaceProposalDraft,
  WC01_V2_PRODUCT_SURFACE_PROPOSAL_DRAFT_VERSION,
} from "./wc01-v2-product-surface-proposal-draft";

export const WC01_V2_LIMITED_ADMIN_PREVIEW_IMPLEMENTATION_PROPOSAL_VERSION =
  "wc01.v2_limited_admin_preview_implementation_proposal.1";

export type Wc01V2LimitedAdminPreviewImplementationProposalDraft = {
  proposalVersion: typeof WC01_V2_LIMITED_ADMIN_PREVIEW_IMPLEMENTATION_PROPOSAL_VERSION;
  sourceApprovalMetadataPath: string;
  sourceProductSurfaceProposalPaths: string[];
  targetSurfaceClass: "limited_admin_internal_preview";
  targetRoute: "not_configured";
  proposalOwner: "TBD";
  implementationStatus: "not_approved";
  approvalStatus: "incomplete" | "ready_for_implementation_review" | "rejected";
  surfaceStatus: "blocked_until_explicit_approval";
  allowedFamilies: Array<"pre_consent_tracking" | "pre_consent_cookie_storage">;
  blockedFamiliesAndContexts: string[];
  ownerApprovals: Wc01V2LimitedAdminPreviewApprovalMetadata["ownerApprovals"];
  accessControlPlan: {
    featureFlagName: "TBD";
    defaultEnabled: false;
    requiredRole: "TBD";
    internalOnly: true;
    readOnly: true;
    artifactPathAllowlist: string[];
    disabledStateBehavior: "render_no_artifact_rows";
    auditLogPlan: "TBD";
  };
  dataHandlingPlan: {
    artifactOnly: true;
    nonPersistent: true;
    readOnly: true;
    displaySafeOnly: true;
    rawEvidenceRehydration: false;
    writesProductionState: false;
    storesReviewerDecisions: false;
    storesPreviewState: false;
  };
  sensitiveContextHandling: {
    sensitiveContextDefault: "excluded";
    routingMetadataOnly: true;
    customerFacingUse: false;
    requiresSeparatePolicyCopyApproval: true;
    allowedSensitiveCategories: [];
  };
  copyPosture: "internal_diagnostic_only";
  guardrailRequirements: string[];
  testPlan: string[];
  rollbackSuppressionPlan: {
    globalDisableFlag: "TBD";
    familySuppression: true;
    siteDomainSuppression: true;
    vendorDomainSuppression: true;
    artifactPathAllowlist: string[];
    emergencyOwner: "TBD";
    rollbackVerificationCommand: "TBD";
    postRollbackExpectedState: "no_artifact_rows_rendered";
  };
  failClosedReasons: string[];
  productionEligible: false;
  persistEligible: false;
  concernPolicyCallEligible: false;
  unifiedFindingEligible: false;
  checklistProjectionEligible: false;
  customerFacingEligible: false;
  explicitApprovalRequired: true;
  guardrails: {
    noAppUi: true;
    noPersistence: true;
    noProductionIntegration: true;
    noProductionConcernPolicyCall: true;
    noPersistedNormalizedConcerns: true;
    noUnifiedFindings: true;
    noChecklistRows: true;
    noReportRows: true;
    noExecutiveSummaries: true;
    noTopFindings: true;
    noScoringOutput: true;
    noRegulatoryLensOutput: true;
    noApiMcpExportOutput: true;
    noCustomerFacingCopy: true;
    noLegalConclusionLanguage: true;
    noForbiddenStatusMapping: true;
    noRawBlockedFields: true;
  };
};

const LEGAL_CONCLUSION_PATTERN =
  /\b(gap_observed|violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i;

const ALLOWED_FAMILIES = ["pre_consent_tracking", "pre_consent_cookie_storage"] as const;

export function parseWc01V2LimitedAdminPreviewApprovalMetadataForImplementationProposalJson(
  raw: string,
): Wc01V2LimitedAdminPreviewApprovalMetadata {
  assertSafeRawJson(raw, "Wc01V2LimitedAdminPreviewApprovalMetadata");
  const parsed = JSON.parse(raw) as unknown;
  validateApprovalMetadata(parsed);
  return parsed;
}

export function parseWc01V2ProductSurfaceProposalDraftForLimitedAdminPreviewJson(
  raw: string,
): Wc01V2ProductSurfaceProposalDraft {
  assertSafeRawJson(raw, "Wc01V2ProductSurfaceProposalDraft");
  const parsed = JSON.parse(raw) as unknown;
  validateProductSurfaceProposalDraft(parsed);
  return parsed;
}

export function buildWc01V2LimitedAdminPreviewImplementationProposalDraft(
  input: {
    approvalMetadata: Wc01V2LimitedAdminPreviewApprovalMetadata;
    sourceApprovalMetadataPath: string;
    productSurfaceProposals: Wc01V2ProductSurfaceProposalDraft[];
    sourceProductSurfaceProposalPaths: string[];
  },
): Wc01V2LimitedAdminPreviewImplementationProposalDraft {
  validateApprovalMetadata(input.approvalMetadata);
  for (const proposal of input.productSurfaceProposals) {
    validateProductSurfaceProposalDraft(proposal);
  }

  const draft: Wc01V2LimitedAdminPreviewImplementationProposalDraft = {
    proposalVersion: WC01_V2_LIMITED_ADMIN_PREVIEW_IMPLEMENTATION_PROPOSAL_VERSION,
    sourceApprovalMetadataPath: input.sourceApprovalMetadataPath,
    sourceProductSurfaceProposalPaths: [...input.sourceProductSurfaceProposalPaths],
    targetSurfaceClass: "limited_admin_internal_preview",
    targetRoute: "not_configured",
    proposalOwner: "TBD",
    implementationStatus: "not_approved",
    approvalStatus: "incomplete",
    surfaceStatus: "blocked_until_explicit_approval",
    allowedFamilies: [...ALLOWED_FAMILIES],
    blockedFamiliesAndContexts: uniqueStrings([
      ...input.approvalMetadata.blockedFamilies,
      ...input.productSurfaceProposals.flatMap((proposal) => proposal.blockedFamilies),
    ]),
    ownerApprovals: input.approvalMetadata.ownerApprovals.map((approval) => ({
      ownerRole: approval.ownerRole,
      ownerName: approval.ownerName,
      approvalDecision: approval.approvalDecision,
      approvalDate: approval.approvalDate,
      scopeNotes: [...approval.scopeNotes],
      requiredFollowups: [...approval.requiredFollowups],
    })),
    accessControlPlan: {
      featureFlagName: "TBD",
      defaultEnabled: false,
      requiredRole: "TBD",
      internalOnly: true,
      readOnly: true,
      artifactPathAllowlist: [
        input.sourceApprovalMetadataPath,
        ...input.sourceProductSurfaceProposalPaths,
      ],
      disabledStateBehavior: "render_no_artifact_rows",
      auditLogPlan: "TBD",
    },
    dataHandlingPlan: {
      artifactOnly: true,
      nonPersistent: true,
      readOnly: true,
      displaySafeOnly: true,
      rawEvidenceRehydration: false,
      writesProductionState: false,
      storesReviewerDecisions: false,
      storesPreviewState: false,
    },
    sensitiveContextHandling: {
      sensitiveContextDefault: "excluded",
      routingMetadataOnly: true,
      customerFacingUse: false,
      requiresSeparatePolicyCopyApproval: true,
      allowedSensitiveCategories: [],
    },
    copyPosture: "internal_diagnostic_only",
    guardrailRequirements: uniqueStrings([
      ...input.approvalMetadata.guardrailRequirements,
      ...input.productSurfaceProposals.flatMap((proposal) => proposal.guardrailRequirements),
      "feature_flag_disabled_render_test",
      "import_boundary_test",
      "no_write_preview_loader_test",
    ]),
    testPlan: [
      "feature_flag_disabled_blocks_rendering",
      "unauthorized_role_blocks_rendering",
      "missing_approval_metadata_fails_closed",
      "missing_owner_approvals_fails_closed",
      "unsupported_artifact_version_fails_closed",
      "malformed_artifact_fails_closed",
      "unsupported_family_fails_closed",
      "sensitive_context_item_without_approval_fails_closed",
      "raw_blocked_fields_fail_closed",
      "forbidden_status_mapping_fails_closed",
      "legal_conclusion_wording_fails_closed",
      "production_customer_persistence_flags_true_fail_closed",
      "no_writes_during_preview_loading",
      "production_import_boundary_guard",
    ],
    rollbackSuppressionPlan: {
      globalDisableFlag: "TBD",
      familySuppression: true,
      siteDomainSuppression: true,
      vendorDomainSuppression: true,
      artifactPathAllowlist: [
        input.sourceApprovalMetadataPath,
        ...input.sourceProductSurfaceProposalPaths,
      ],
      emergencyOwner: "TBD",
      rollbackVerificationCommand: "TBD",
      postRollbackExpectedState: "no_artifact_rows_rendered",
    },
    failClosedReasons: failClosedReasonsForLimitedAdminPreviewImplementationProposal(input),
    productionEligible: false,
    persistEligible: false,
    concernPolicyCallEligible: false,
    unifiedFindingEligible: false,
    checklistProjectionEligible: false,
    customerFacingEligible: false,
    explicitApprovalRequired: true,
    guardrails: {
      noAppUi: true,
      noPersistence: true,
      noProductionIntegration: true,
      noProductionConcernPolicyCall: true,
      noPersistedNormalizedConcerns: true,
      noUnifiedFindings: true,
      noChecklistRows: true,
      noReportRows: true,
      noExecutiveSummaries: true,
      noTopFindings: true,
      noScoringOutput: true,
      noRegulatoryLensOutput: true,
      noApiMcpExportOutput: true,
      noCustomerFacingCopy: true,
      noLegalConclusionLanguage: true,
      noForbiddenStatusMapping: true,
      noRawBlockedFields: true,
    },
  };

  assertImplementationProposalGuardrails(draft);
  return draft;
}

export function buildWc01V2LimitedAdminPreviewImplementationProposalDraftJson(
  input: {
    approvalMetadataRaw: string;
    sourceApprovalMetadataPath: string;
    productSurfaceProposalRaws: string[];
    sourceProductSurfaceProposalPaths: string[];
  },
) {
  return buildWc01V2LimitedAdminPreviewImplementationProposalDraft({
    approvalMetadata: parseWc01V2LimitedAdminPreviewApprovalMetadataForImplementationProposalJson(
      input.approvalMetadataRaw,
    ),
    sourceApprovalMetadataPath: input.sourceApprovalMetadataPath,
    productSurfaceProposals: input.productSurfaceProposalRaws.map((raw) =>
      parseWc01V2ProductSurfaceProposalDraftForLimitedAdminPreviewJson(raw)
    ),
    sourceProductSurfaceProposalPaths: input.sourceProductSurfaceProposalPaths,
  });
}

export function failClosedReasonsForLimitedAdminPreviewImplementationProposal(input: {
  approvalMetadata: Wc01V2LimitedAdminPreviewApprovalMetadata;
  productSurfaceProposals: Wc01V2ProductSurfaceProposalDraft[];
  sourceProductSurfaceProposalPaths: string[];
}) {
  const reasons: string[] = [];

  if (input.approvalMetadata.approvalStatus !== "ready_for_implementation_proposal") {
    reasons.push("approval_metadata_not_ready");
  }
  if (input.approvalMetadata.implementationProposalRef === "not_created") {
    reasons.push("implementation_proposal_reference_missing");
  }
  if (input.approvalMetadata.ownerApprovals.some((approval) => approval.approvalDecision !== "approved_for_proposal")) {
    reasons.push("owner_approvals_missing");
  }
  if (input.approvalMetadata.failClosedReasons.length > 0) {
    reasons.push("source_approval_metadata_fail_closed");
  }
  if (input.productSurfaceProposals.length === 0 || input.sourceProductSurfaceProposalPaths.length === 0) {
    reasons.push("product_surface_proposal_missing");
  }
  if (input.productSurfaceProposals.some((proposal) => proposal.proposedSurfaceClass !== "limited_admin_internal_preview")) {
    reasons.push("unsupported_product_surface_proposal_surface");
  }
  if (input.productSurfaceProposals.some((proposal) => proposal.failClosedReasons.length > 0)) {
    reasons.push("source_product_surface_proposal_fail_closed");
  }
  if (
    input.productSurfaceProposals.some((proposal) =>
      proposal.productionEligible ||
      proposal.customerFacingEligible ||
      proposal.implementationStatus !== "not_approved"
    )
  ) {
    reasons.push("source_product_surface_proposal_open_flags");
  }

  return uniqueStrings(reasons);
}

function validateApprovalMetadata(value: unknown): asserts value is Wc01V2LimitedAdminPreviewApprovalMetadata {
  if (!isRecord(value)) {
    throw new Error("Wc01V2LimitedAdminPreviewApprovalMetadata must be an object.");
  }
  if (value.metadataVersion !== WC01_V2_LIMITED_ADMIN_PREVIEW_APPROVAL_METADATA_VERSION) {
    throw new Error("Unsupported Wc01V2LimitedAdminPreviewApprovalMetadata version.");
  }
  if (value.targetSurfaceClass !== "limited_admin_internal_preview") {
    throw new Error("Unsupported approval metadata target surface.");
  }
  assertStringArray(value.allowedFamilies, "allowedFamilies");
  assertStringArray(value.blockedFamilies, "blockedFamilies");
  if (!Array.isArray(value.ownerApprovals)) {
    throw new Error("ownerApprovals must be an array.");
  }
  assertStringArray(value.failClosedReasons, "failClosedReasons");
  if (value.productionEligible !== false || value.customerFacingEligible !== false) {
    throw new Error("Approval metadata eligibility flags must be closed.");
  }
}

function validateProductSurfaceProposalDraft(value: unknown): asserts value is Wc01V2ProductSurfaceProposalDraft {
  if (!isRecord(value)) {
    throw new Error("Wc01V2ProductSurfaceProposalDraft must be an object.");
  }
  if (value.packetVersion !== WC01_V2_PRODUCT_SURFACE_PROPOSAL_DRAFT_VERSION) {
    throw new Error("Unsupported Wc01V2ProductSurfaceProposalDraft version.");
  }
  if (value.proposedSurfaceClass !== "limited_admin_internal_preview") {
    throw new Error("Unsupported product surface proposal surface.");
  }
  assertStringArray(value.allowedFamilies, "allowedFamilies");
  assertStringArray(value.blockedFamilies, "blockedFamilies");
  assertStringArray(value.failClosedReasons, "failClosedReasons");
  if (value.productionEligible !== false || value.customerFacingEligible !== false) {
    throw new Error("Product surface proposal eligibility flags must be closed.");
  }
}

function assertImplementationProposalGuardrails(
  draft: Wc01V2LimitedAdminPreviewImplementationProposalDraft,
) {
  if (draft.implementationStatus !== "not_approved") {
    throw new Error("Limited admin preview implementation proposal must not be approved.");
  }
  if (
    draft.productionEligible ||
    draft.persistEligible ||
    draft.concernPolicyCallEligible ||
    draft.unifiedFindingEligible ||
    draft.checklistProjectionEligible ||
    draft.customerFacingEligible
  ) {
    throw new Error("Limited admin preview implementation proposal eligibility flags must be closed.");
  }
  if (!draft.explicitApprovalRequired) {
    throw new Error("Limited admin preview implementation proposal must require explicit approval.");
  }
  const serialized = JSON.stringify(draft);
  if (containsForbiddenGapObservedToken(serialized)) {
    throw new Error("Limited admin preview implementation proposal contains forbidden status token.");
  }
  if (containsBlockedRawFields(serialized)) {
    throw new Error("Limited admin preview implementation proposal contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(serialized)) {
    throw new Error("Limited admin preview implementation proposal contains legal-conclusion language.");
  }
}

function assertSafeRawJson(raw: string, label: string) {
  if (containsForbiddenGapObservedToken(raw)) {
    throw new Error(`${label} contains forbidden status token.`);
  }
  if (containsBlockedRawFields(raw)) {
    throw new Error(`${label} contains raw blocked evidence fields.`);
  }
  if (LEGAL_CONCLUSION_PATTERN.test(raw)) {
    throw new Error(`${label} contains legal-conclusion language.`);
  }
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be a string array.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)].sort();
}
