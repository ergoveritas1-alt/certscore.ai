import {
  containsBlockedRawFields,
  containsForbiddenGapObservedToken,
} from "./wc01-shadow-output";
import {
  type Wc01V2NormalizedConcernDraft,
  type Wc01V2NormalizedConcernDraftBlockedMapping,
  type Wc01V2NormalizedConcernDraftMapping,
  type Wc01V2NormalizedConcernDraftMappingFamily,
  WC01_V2_NORMALIZED_CONCERN_DRAFT_MAPPING_VERSION,
} from "./wc01-v2-normalized-concern-draft-mapping";

export const WC01_V2_PRODUCTION_INTEGRATION_CANDIDATE_VERSION =
  "wc01.v2_production_integration_candidate.1";

export type Wc01V2ProductionIntegrationCandidateArtifact = {
  packetVersion: typeof WC01_V2_PRODUCTION_INTEGRATION_CANDIDATE_VERSION;
  sourceMappingArtifactPath: string;
  sourceMappingVersion: typeof WC01_V2_NORMALIZED_CONCERN_DRAFT_MAPPING_VERSION;
  implementationStatus: "not_approved";
  productionEligible: false;
  persistEligible: false;
  concernPolicyCallEligible: false;
  unifiedFindingEligible: false;
  checklistProjectionEligible: false;
  customerFacingEligible: false;
  explicitApprovalRequired: true;
  candidates: Wc01V2ProductionIntegrationCandidate[];
  blockedCandidates: Wc01V2ProductionIntegrationBlockedCandidate[];
  closedDefaultFlags: Wc01V2ProductionIntegrationClosedDefaultFlags;
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

export type Wc01V2ProductionIntegrationCandidate = {
  family: Wc01V2NormalizedConcernDraftMappingFamily;
  sourceEvidenceArtifact: string;
  normalizedConcernDraft: {
    proposedNormalizedConcernType: Wc01V2NormalizedConcernDraft["proposedNormalizedConcernType"];
    evidenceRefs: string[];
    displaySafeExcerptRefs: string[];
    consentStateContext: Wc01V2NormalizedConcernDraft["consentStateContext"];
    cookieStorageContext?: Wc01V2NormalizedConcernDraft["cookieStorageContext"];
    confidence: Wc01V2NormalizedConcernDraft["confidence"];
    directness: Wc01V2NormalizedConcernDraft["directness"];
    vendorOrEndpointAttribution: Wc01V2NormalizedConcernDraft["vendorOrEndpointAttribution"];
    purposeBasis: Wc01V2NormalizedConcernDraft["purposeBasis"];
    exclusionsApplied: string[];
    sensitiveContextCategories: string[];
    unresolvedRefDisposition: Wc01V2NormalizedConcernDraft["unresolvedRefDisposition"];
  };
  proposedConcernPolicyKey: Wc01V2NormalizedConcernDraft["proposedConcernPolicyKey"];
  proposedUnifiedFindingKey?: string;
  proposedChecklistRowKey?: string;
  evidenceRequirements: string[];
  copyPosture: "no_user_visible_wording";
  blockedSurfaces: string[];
  approvalMetadata: {
    explicitApprovalRequired: true;
    requiredOwners: Array<"product_owner" | "policy_owner" | "copy_owner" | "engineering_owner">;
    approvalStatus: "missing";
    notes: string[];
  };
  rollbackPlan: {
    suppressionState: "hold_internal_only";
    rollbackSuppressionHints: string[];
    emergencyDisablePlan: string;
  };
  implementationStatus: "not_approved";
  failClosedReasons: string[];
  closedDefaultFlags: Wc01V2ProductionIntegrationClosedDefaultFlags;
};

export type Wc01V2ProductionIntegrationBlockedCandidate = {
  family?: string;
  sourceEvidenceArtifact?: string;
  failClosedReasons: string[];
};

export type Wc01V2ProductionIntegrationClosedDefaultFlags = {
  implementationStatus: "not_approved";
  productionEligible: false;
  persistEligible: false;
  concernPolicyCallEligible: false;
  unifiedFindingEligible: false;
  checklistProjectionEligible: false;
  customerFacingEligible: false;
  explicitApprovalRequired: true;
};

const LEGAL_CONCLUSION_PATTERN =
  /\b(gap_observed|violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i;

const SUPPORTED_FAMILIES = new Set<Wc01V2NormalizedConcernDraftMappingFamily>([
  "pre_consent_tracking",
  "pre_consent_cookie_storage",
]);

export function parseWc01V2NormalizedConcernDraftMappingArtifactJson(
  raw: string,
): Wc01V2NormalizedConcernDraftMapping {
  if (containsForbiddenGapObservedToken(raw)) {
    throw new Error("Wc01V2NormalizedConcernDraftMapping contains forbidden status token.");
  }
  if (containsBlockedRawFields(raw)) {
    throw new Error("Wc01V2NormalizedConcernDraftMapping contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(raw)) {
    throw new Error("Wc01V2NormalizedConcernDraftMapping contains legal-conclusion language.");
  }

  const parsed = JSON.parse(raw) as unknown;
  validateMappingArtifact(parsed);
  return parsed;
}

export function buildWc01V2ProductionIntegrationCandidateArtifact(
  mapping: Wc01V2NormalizedConcernDraftMapping,
  sourceMappingArtifactPath = mapping.sourceArtifactPath,
): Wc01V2ProductionIntegrationCandidateArtifact {
  validateMappingArtifact(mapping);

  const candidates: Wc01V2ProductionIntegrationCandidate[] = [];
  const blockedCandidates: Wc01V2ProductionIntegrationBlockedCandidate[] = [];

  for (const draft of mapping.draftMappings) {
    const failClosedReasons = failClosedReasonsForDraft(draft);
    if (failClosedReasons.length > 0) {
      blockedCandidates.push({
        family: draft.sourceFamily,
        sourceEvidenceArtifact: draft.sourceArtifactPath,
        failClosedReasons,
      });
      continue;
    }
    candidates.push(buildCandidateFromDraft(draft));
  }

  for (const blocked of mapping.blockedMappings) {
    blockedCandidates.push(blockedCandidateFromMapping(blocked));
  }

  const artifact: Wc01V2ProductionIntegrationCandidateArtifact = {
    packetVersion: WC01_V2_PRODUCTION_INTEGRATION_CANDIDATE_VERSION,
    sourceMappingArtifactPath,
    sourceMappingVersion: mapping.packetVersion,
    implementationStatus: "not_approved",
    productionEligible: false,
    persistEligible: false,
    concernPolicyCallEligible: false,
    unifiedFindingEligible: false,
    checklistProjectionEligible: false,
    customerFacingEligible: false,
    explicitApprovalRequired: true,
    candidates,
    blockedCandidates,
    closedDefaultFlags: closedDefaultFlags(),
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

  assertCandidateArtifactGuardrails(artifact);
  return artifact;
}

export function buildWc01V2ProductionIntegrationCandidateArtifactJson(
  raw: string,
  sourceMappingArtifactPath?: string,
) {
  const mapping = parseWc01V2NormalizedConcernDraftMappingArtifactJson(raw);
  return buildWc01V2ProductionIntegrationCandidateArtifact(mapping, sourceMappingArtifactPath);
}

export function failClosedReasonsForDraft(draft: Wc01V2NormalizedConcernDraft) {
  const reasons: string[] = [];
  if (!SUPPORTED_FAMILIES.has(draft.sourceFamily)) {
    reasons.push("unsupported_family");
  }
  if (draft.failClosedReasons.length > 0) {
    reasons.push(...draft.failClosedReasons.map((reason) => `source_mapping_failed:${reason}`));
  }
  if (draft.evidenceRefs.length === 0) {
    reasons.push("evidence_refs_missing");
  }
  if (draft.displaySafeExcerptRefs.length === 0) {
    reasons.push("display_safe_excerpt_refs_missing");
  }
  if (!draft.consentStateContext?.observedBeforeConsentAction) {
    reasons.push("consent_state_context_missing");
  }
  if (draft.sensitiveContextCategories.length > 0) {
    reasons.push("sensitive_context_requires_separate_policy_product_approval");
  }
  if (draft.unresolvedRefDisposition.affectsEvidenceSufficiency) {
    reasons.push("unresolved_refs_affect_evidence_sufficiency");
  }
  if (draft.closedDefaultFlags.productionEligible !== false) {
    reasons.push("source_mapping_attempts_production_eligibility");
  }
  if (draft.closedDefaultFlags.persistEligible !== false) {
    reasons.push("source_mapping_attempts_persistence");
  }
  if (draft.closedDefaultFlags.concernPolicyCallEligible !== false) {
    reasons.push("source_mapping_attempts_concern_policy_call");
  }
  if (draft.closedDefaultFlags.unifiedFindingEligible !== false) {
    reasons.push("source_mapping_attempts_unified_finding");
  }
  if (draft.closedDefaultFlags.checklistProjectionEligible !== false) {
    reasons.push("source_mapping_attempts_checklist_projection");
  }
  if (draft.closedDefaultFlags.customerFacingEligible !== false) {
    reasons.push("source_mapping_attempts_customer_facing_eligibility");
  }
  if (draft.closedDefaultFlags.explicitApprovalRequired !== true) {
    reasons.push("source_mapping_attempts_to_skip_explicit_approval");
  }
  if (
    draft.sourceFamily === "pre_consent_cookie_storage" &&
    (!draft.cookieStorageContext || draft.cookieStorageContext.party !== "third_party")
  ) {
    reasons.push("third_party_cookie_storage_context_missing");
  }
  return uniqueStrings(reasons);
}

function buildCandidateFromDraft(
  draft: Wc01V2NormalizedConcernDraft,
): Wc01V2ProductionIntegrationCandidate {
  return {
    family: draft.sourceFamily,
    sourceEvidenceArtifact: draft.sourceArtifactPath,
    normalizedConcernDraft: {
      proposedNormalizedConcernType: draft.proposedNormalizedConcernType,
      evidenceRefs: [...draft.evidenceRefs],
      displaySafeExcerptRefs: [...draft.displaySafeExcerptRefs],
      consentStateContext: {
        ...draft.consentStateContext,
        sourceRefIds: [...draft.consentStateContext.sourceRefIds],
      },
      cookieStorageContext: draft.cookieStorageContext
        ? {
          ...draft.cookieStorageContext,
          sourceRefIds: [...draft.cookieStorageContext.sourceRefIds],
        }
        : undefined,
      confidence: draft.confidence,
      directness: draft.directness,
      vendorOrEndpointAttribution: {
        ...draft.vendorOrEndpointAttribution,
        sourceRefIds: [...draft.vendorOrEndpointAttribution.sourceRefIds],
      },
      purposeBasis: {
        supportingPurposes: [...draft.purposeBasis.supportingPurposes],
        diagnosticPurposes: [...draft.purposeBasis.diagnosticPurposes],
      },
      exclusionsApplied: [...draft.exclusionsApplied],
      sensitiveContextCategories: [...draft.sensitiveContextCategories],
      unresolvedRefDisposition: {
        unresolvedRefCount: draft.unresolvedRefDisposition.unresolvedRefCount,
        affectsEvidenceSufficiency: draft.unresolvedRefDisposition.affectsEvidenceSufficiency,
        notes: [...draft.unresolvedRefDisposition.notes],
      },
    },
    proposedConcernPolicyKey: draft.proposedConcernPolicyKey,
    proposedUnifiedFindingKey: draft.proposedUnifiedFindingKey,
    proposedChecklistRowKey: draft.proposedChecklistRowKey,
    evidenceRequirements: evidenceRequirementsForFamily(draft.sourceFamily),
    copyPosture: "no_user_visible_wording",
    blockedSurfaces: [...draft.blockedSurfaces],
    approvalMetadata: {
      explicitApprovalRequired: true,
      requiredOwners: ["product_owner", "policy_owner", "copy_owner", "engineering_owner"],
      approvalStatus: "missing",
      notes: [
        "Candidate artifact is internal-only.",
        "Separate implementation proposal and owner approvals are required before any production path.",
      ],
    },
    rollbackPlan: {
      suppressionState: "hold_internal_only",
      rollbackSuppressionHints: [...draft.rollbackSuppressionHints],
      emergencyDisablePlan: "Exclude this artifact from next-stage review inputs.",
    },
    implementationStatus: "not_approved",
    failClosedReasons: [],
    closedDefaultFlags: closedDefaultFlags(),
  };
}

function blockedCandidateFromMapping(
  blocked: Wc01V2NormalizedConcernDraftBlockedMapping,
): Wc01V2ProductionIntegrationBlockedCandidate {
  return {
    family: blocked.sourceFamily,
    sourceEvidenceArtifact: blocked.sourceArtifactPath,
    failClosedReasons: blocked.failClosedReasons.map((reason) => `source_mapping_blocked:${reason}`),
  };
}

function evidenceRequirementsForFamily(family: Wc01V2NormalizedConcernDraftMappingFamily) {
  if (family === "pre_consent_cookie_storage") {
    return [
      "observed_cookie_or_storage_write_before_consent_action",
      "third_party_storage_context",
      "consent_state_context",
      "source_refs",
      "display_safe_excerpt_refs",
      "confidence_directness",
      "purpose_exclusions",
      "unsafe_storage_content_excluded",
    ];
  }
  return [
    "observed_runtime_request_or_equivalent_before_consent_action",
    "consent_state_context",
    "vendor_or_high_confidence_endpoint_attribution",
    "source_refs",
    "display_safe_excerpt_refs",
    "confidence_directness",
    "purpose_exclusions",
  ];
}

function validateMappingArtifact(value: unknown): asserts value is Wc01V2NormalizedConcernDraftMapping {
  if (!isRecord(value)) {
    throw new Error("Wc01V2NormalizedConcernDraftMapping must be an object.");
  }
  if (value.packetVersion !== WC01_V2_NORMALIZED_CONCERN_DRAFT_MAPPING_VERSION) {
    throw new Error("Unsupported Wc01V2NormalizedConcernDraftMapping version.");
  }
  assertNonEmptyString(value.sourceArtifactPath, "sourceArtifactPath");
  if (value.implementationStatus !== "not_approved") {
    throw new Error("Wc01V2NormalizedConcernDraftMapping implementationStatus must be not_approved.");
  }
  for (const flag of [
    "productionEligible",
    "persistEligible",
    "concernPolicyCallEligible",
    "unifiedFindingEligible",
    "checklistProjectionEligible",
    "customerFacingEligible",
  ]) {
    if (value[flag] !== false) {
      throw new Error(`Wc01V2NormalizedConcernDraftMapping ${flag} must be false.`);
    }
  }
  if (value.explicitApprovalRequired !== true) {
    throw new Error("Wc01V2NormalizedConcernDraftMapping explicitApprovalRequired must be true.");
  }
  if (!Array.isArray(value.draftMappings)) {
    throw new Error("draftMappings must be an array.");
  }
  if (!Array.isArray(value.blockedMappings)) {
    throw new Error("blockedMappings must be an array.");
  }
}

function assertCandidateArtifactGuardrails(
  artifact: Wc01V2ProductionIntegrationCandidateArtifact,
) {
  if (
    artifact.implementationStatus !== "not_approved" ||
    artifact.productionEligible !== false ||
    artifact.persistEligible !== false ||
    artifact.concernPolicyCallEligible !== false ||
    artifact.unifiedFindingEligible !== false ||
    artifact.checklistProjectionEligible !== false ||
    artifact.customerFacingEligible !== false ||
    artifact.explicitApprovalRequired !== true
  ) {
    throw new Error("Production integration candidate artifact must remain closed by default.");
  }
  const serialized = JSON.stringify(artifact);
  if (containsForbiddenGapObservedToken(serialized)) {
    throw new Error("Production integration candidate artifact contains forbidden status token.");
  }
  if (containsBlockedRawFields(serialized)) {
    throw new Error("Production integration candidate artifact contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(serialized)) {
    throw new Error("Production integration candidate artifact contains legal-conclusion language.");
  }
}

function closedDefaultFlags(): Wc01V2ProductionIntegrationClosedDefaultFlags {
  return {
    implementationStatus: "not_approved",
    productionEligible: false,
    persistEligible: false,
    concernPolicyCallEligible: false,
    unifiedFindingEligible: false,
    checklistProjectionEligible: false,
    customerFacingEligible: false,
    explicitApprovalRequired: true,
  };
}

function assertNonEmptyString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)].sort();
}
