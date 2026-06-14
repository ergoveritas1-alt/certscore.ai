import {
  containsBlockedRawFields,
  containsForbiddenGapObservedToken,
} from "./wc01-shadow-output";
import {
  type Wc01V2ProjectionShapeComparison,
  WC01_V2_PROJECTION_SHAPE_COMPARISON_VERSION,
} from "./wc01-v2-projection-shape-comparison";

export const WC01_V2_LIMITED_ADMIN_PREVIEW_APPROVAL_METADATA_VERSION =
  "wc01.v2_limited_admin_preview_approval_metadata.1";

export type Wc01V2LimitedAdminPreviewApprovalMetadata = {
  metadataVersion: typeof WC01_V2_LIMITED_ADMIN_PREVIEW_APPROVAL_METADATA_VERSION;
  sourceProjectionShapePath: string;
  sourceProjectionShapeVersion: typeof WC01_V2_PROJECTION_SHAPE_COMPARISON_VERSION;
  targetSurfaceClass: "limited_admin_internal_preview";
  sourceFixtureChain: {
    productionIntegrationCandidate: string;
    normalizedConcernSchemaComparison: string;
    concernPolicyShapeComparison: string;
    projectionShapeComparison: string;
  };
  allowedFamilies: Array<"pre_consent_tracking" | "pre_consent_cookie_storage">;
  blockedFamilies: string[];
  ownerApprovals: Wc01V2LimitedAdminPreviewOwnerApproval[];
  accessControlPlan: {
    audience: "internal_admin_only";
    readOnly: true;
    defaultAccess: "disabled_until_implementation_proposal";
    requiredControls: string[];
  };
  dataHandlingPlan: {
    artifactOnly: true;
    nonPersistent: true;
    noCustomerVisibleOutput: true;
    noProductionReportBuilderIntegration: true;
    notes: string[];
  };
  evidenceRequirements: string[];
  copyPosture: "internal_diagnostic_only";
  sensitiveContextHandling: {
    defaultHandling: "excluded_until_separate_approval";
    categories: string[];
    routingMetadataOnly: true;
  };
  blockedSurfaceAssertions: string[];
  guardrailRequirements: string[];
  rollbackSuppressionPlan: {
    defaultState: "disabled";
    disablePath: string;
    familySuppression: true;
    siteDomainSuppression: true;
    vendorDomainSuppression: true;
    emergencyRollbackOwner: "engineering_owner_required";
    notes: string[];
  };
  implementationProposalRef: "not_created" | string;
  approvalStatus: "incomplete" | "ready_for_implementation_proposal" | "rejected";
  implementationStatus: "not_approved";
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

export type Wc01V2LimitedAdminPreviewOwnerApproval = {
  ownerRole: "product" | "policy" | "copy" | "evidence" | "engineering";
  ownerName: "TBD" | string;
  approvalDecision: "missing" | "approved_for_proposal" | "needs_revision" | "rejected";
  approvalDate: "not_recorded" | string;
  scopeNotes: string[];
  requiredFollowups: string[];
};

const LEGAL_CONCLUSION_PATTERN =
  /\b(gap_observed|violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i;

const ALLOWED_FAMILIES = ["pre_consent_tracking", "pre_consent_cookie_storage"] as const;

const BLOCKED_FAMILIES = [
  "session_replay_behavioral_analytics",
  "third_party_vendors_observed",
  "consent_banner_presence_absence",
  "unresolved_endpoint_review",
  "policy_runtime_alignment",
  "consent_flow_delta_rows",
  "consent_flow_persistence_rows",
  "tag_management_only",
  "consent_management_only",
  "security_only",
  "performance_only",
  "support_only",
  "infrastructure_only",
  "fraud_bot_only",
  "rum_only",
  "live_chat_only",
  "sensitive_context_items",
];

export function parseWc01V2ProjectionShapeComparisonForApprovalMetadataJson(
  raw: string,
): Wc01V2ProjectionShapeComparison {
  if (containsForbiddenGapObservedToken(raw)) {
    throw new Error("Wc01V2ProjectionShapeComparison contains forbidden status token.");
  }
  if (containsBlockedRawFields(raw)) {
    throw new Error("Wc01V2ProjectionShapeComparison contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(raw)) {
    throw new Error("Wc01V2ProjectionShapeComparison contains legal-conclusion language.");
  }

  const parsed = JSON.parse(raw) as unknown;
  validateProjectionShape(parsed);
  return parsed;
}

export function buildWc01V2LimitedAdminPreviewApprovalMetadata(
  projectionShape: Wc01V2ProjectionShapeComparison,
  sourceProjectionShapePath: string,
): Wc01V2LimitedAdminPreviewApprovalMetadata {
  validateProjectionShape(projectionShape);

  const metadata: Wc01V2LimitedAdminPreviewApprovalMetadata = {
    metadataVersion: WC01_V2_LIMITED_ADMIN_PREVIEW_APPROVAL_METADATA_VERSION,
    sourceProjectionShapePath,
    sourceProjectionShapeVersion: projectionShape.packetVersion,
    targetSurfaceClass: "limited_admin_internal_preview",
    sourceFixtureChain: {
      productionIntegrationCandidate: "artifacts/example/Wc01V2ProductionIntegrationCandidate.json",
      normalizedConcernSchemaComparison: "artifacts/example/Wc01V2NormalizedConcernSchemaComparison.json",
      concernPolicyShapeComparison: projectionShape.sourceConcernPolicyShapePath,
      projectionShapeComparison: sourceProjectionShapePath,
    },
    allowedFamilies: [...ALLOWED_FAMILIES],
    blockedFamilies: [...BLOCKED_FAMILIES],
    ownerApprovals: ownerApprovalPlaceholders(),
    accessControlPlan: {
      audience: "internal_admin_only",
      readOnly: true,
      defaultAccess: "disabled_until_implementation_proposal",
      requiredControls: [
        "explicit_internal_route_gate",
        "admin_role_check",
        "environment_or_feature_flag",
        "read_only_artifact_access",
      ],
    },
    dataHandlingPlan: {
      artifactOnly: true,
      nonPersistent: true,
      noCustomerVisibleOutput: true,
      noProductionReportBuilderIntegration: true,
      notes: [
        "Metadata supports implementation proposal review only.",
        "Future preview must read approved artifacts without writing production concern or report state.",
      ],
    },
    evidenceRequirements: evidenceRequirements(),
    copyPosture: "internal_diagnostic_only",
    sensitiveContextHandling: {
      defaultHandling: "excluded_until_separate_approval",
      categories: [
        "health",
        "reproductive_health",
        "finance",
        "public_benefits",
        "employment_hr",
        "behavioral_analytics_reference",
      ],
      routingMetadataOnly: true,
    },
    blockedSurfaceAssertions: blockedSurfaceAssertions(),
    guardrailRequirements: guardrailRequirements(),
    rollbackSuppressionPlan: {
      defaultState: "disabled",
      disablePath: "feature_flag_or_environment_gate_required_before_implementation",
      familySuppression: true,
      siteDomainSuppression: true,
      vendorDomainSuppression: true,
      emergencyRollbackOwner: "engineering_owner_required",
      notes: [
        "Disabling the preview must not affect production reports.",
        "Rollback path must be validated before implementation proposal approval.",
      ],
    },
    implementationProposalRef: "not_created",
    approvalStatus: "incomplete",
    implementationStatus: "not_approved",
    failClosedReasons: failClosedReasonsForProjectionShape(projectionShape),
    productionEligible: false,
    persistEligible: false,
    concernPolicyCallEligible: false,
    unifiedFindingEligible: false,
    checklistProjectionEligible: false,
    customerFacingEligible: false,
    explicitApprovalRequired: true,
    guardrails: guardrails(),
  };

  assertApprovalMetadataGuardrails(metadata);
  return metadata;
}

export function buildWc01V2LimitedAdminPreviewApprovalMetadataJson(
  raw: string,
  sourceProjectionShapePath: string,
) {
  return buildWc01V2LimitedAdminPreviewApprovalMetadata(
    parseWc01V2ProjectionShapeComparisonForApprovalMetadataJson(raw),
    sourceProjectionShapePath,
  );
}

export function failClosedReasonsForProjectionShape(
  projectionShape: Wc01V2ProjectionShapeComparison,
) {
  const reasons: string[] = [];

  if (projectionShape.recommendation !== "projection_shape_reviewable_fixture_only") {
    reasons.push("projection_shape_not_reviewable_fixture_only");
  }
  if (projectionShape.blockedReasons.length > 0) {
    reasons.push("projection_shape_has_blocked_reasons");
  }
  for (const family of projectionShape.comparedFamilies) {
    if (!ALLOWED_FAMILIES.includes(family as (typeof ALLOWED_FAMILIES)[number])) {
      reasons.push(`unsupported_family:${family}`);
    }
    if ((projectionShape.missingProjectionInputs[family] ?? []).length > 0) {
      reasons.push(`missing_projection_inputs:${family}`);
    }
  }
  for (const family of ALLOWED_FAMILIES) {
    if (!projectionShape.comparedFamilies.includes(family)) {
      reasons.push(`allowed_family_missing:${family}`);
    }
  }
  if (projectionShape.productionEligible !== false) {
    reasons.push("projection_shape_attempts_production_eligibility");
  }
  if (projectionShape.persistEligible !== false) {
    reasons.push("projection_shape_attempts_persistence");
  }
  if (projectionShape.concernPolicyCallEligible !== false) {
    reasons.push("projection_shape_attempts_concern_policy_call");
  }
  if (projectionShape.unifiedFindingEligible !== false) {
    reasons.push("projection_shape_attempts_unified_finding");
  }
  if (projectionShape.checklistProjectionEligible !== false) {
    reasons.push("projection_shape_attempts_checklist_projection");
  }
  if (projectionShape.customerFacingEligible !== false) {
    reasons.push("projection_shape_attempts_customer_facing_eligibility");
  }
  if (projectionShape.explicitApprovalRequired !== true) {
    reasons.push("projection_shape_attempts_to_skip_explicit_approval");
  }
  if (projectionShape.unifiedFindingShapeReadiness.status !== "fixture_reviewable") {
    reasons.push("unified_finding_shape_not_reviewable");
  }
  if (projectionShape.checklistProjectionShapeReadiness.status !== "fixture_reviewable") {
    reasons.push("checklist_projection_shape_not_reviewable");
  }
  if (projectionShape.evidencePacketReadiness.status !== "fixture_reviewable") {
    reasons.push("evidence_packet_not_reviewable");
  }
  reasons.push("owner_approvals_missing");
  reasons.push("implementation_proposal_missing");
  return uniqueStrings(reasons);
}

function ownerApprovalPlaceholders(): Wc01V2LimitedAdminPreviewOwnerApproval[] {
  return [
    "product",
    "policy",
    "copy",
    "evidence",
    "engineering",
  ].map((ownerRole) => ({
    ownerRole: ownerRole as Wc01V2LimitedAdminPreviewOwnerApproval["ownerRole"],
    ownerName: "TBD",
    approvalDecision: "missing",
    approvalDate: "not_recorded",
    scopeNotes: ["Approval placeholder required before implementation proposal."],
    requiredFollowups: ["Name owner and record explicit proposal decision."],
  }));
}

function evidenceRequirements() {
  return [
    "source_evidence_refs_present",
    "display_safe_excerpt_refs_present",
    "consent_state_context_present",
    "confidence_directness_present",
    "purpose_context_present",
    "diagnostic_exclusions_present",
    "unresolved_refs_do_not_affect_sufficiency",
    "blocked_surfaces_present",
    "rollback_suppression_hints_present",
    "vendor_or_endpoint_context_present_for_pre_consent_tracking",
    "party_storage_context_present_for_pre_consent_cookie_storage",
    "storage_type_present_for_pre_consent_cookie_storage",
  ];
}

function blockedSurfaceAssertions() {
  return [
    "no_customer_facing_report_rows",
    "no_checklist_rows",
    "no_executive_summaries",
    "no_top_findings",
    "no_scoring_output",
    "no_regulatory_lens_output",
    "no_api_mcp_export_output",
    "no_persistence",
    "no_production_concern_policy_calls",
    "no_unified_findings",
  ];
}

function guardrailRequirements() {
  return [
    "guardrail_wording_raw_field_scan",
    "import_boundary_scan",
    "closed_default_flag_tests",
    "unsupported_family_fail_closed_tests",
    "sensitive_context_non_eligibility_tests",
    "raw_blocked_field_rejection_tests",
    "no_customer_facing_copy_tests",
    "no_persistence_tests",
    "no_production_concern_policy_call_tests",
  ];
}

function validateProjectionShape(value: unknown): asserts value is Wc01V2ProjectionShapeComparison {
  if (!isRecord(value)) {
    throw new Error("Wc01V2ProjectionShapeComparison must be an object.");
  }
  if (value.packetVersion !== WC01_V2_PROJECTION_SHAPE_COMPARISON_VERSION) {
    throw new Error("Unsupported Wc01V2ProjectionShapeComparison version.");
  }
  if (!Array.isArray(value.comparedFamilies)) {
    throw new Error("comparedFamilies must be an array.");
  }
  if (!isRecord(value.missingProjectionInputs)) {
    throw new Error("missingProjectionInputs must be an object.");
  }
  if (!Array.isArray(value.blockedReasons)) {
    throw new Error("blockedReasons must be an array.");
  }
}

function assertApprovalMetadataGuardrails(metadata: Wc01V2LimitedAdminPreviewApprovalMetadata) {
  if (
    metadata.productionEligible !== false ||
    metadata.persistEligible !== false ||
    metadata.concernPolicyCallEligible !== false ||
    metadata.unifiedFindingEligible !== false ||
    metadata.checklistProjectionEligible !== false ||
    metadata.customerFacingEligible !== false ||
    metadata.explicitApprovalRequired !== true ||
    metadata.implementationStatus !== "not_approved"
  ) {
    throw new Error("Limited admin preview approval metadata must remain closed by default.");
  }
  const serialized = JSON.stringify(metadata);
  if (containsForbiddenGapObservedToken(serialized)) {
    throw new Error("Limited admin preview approval metadata contains forbidden status token.");
  }
  if (containsBlockedRawFields(serialized)) {
    throw new Error("Limited admin preview approval metadata contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(serialized)) {
    throw new Error("Limited admin preview approval metadata contains legal-conclusion language.");
  }
}

function guardrails(): Wc01V2LimitedAdminPreviewApprovalMetadata["guardrails"] {
  return {
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
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)].sort();
}
