import {
  containsBlockedRawFields,
  containsForbiddenGapObservedToken,
} from "./wc01-shadow-output";
import {
  type Wc01V2ProductionIntegrationCandidate,
  type Wc01V2ProductionIntegrationCandidateArtifact,
  WC01_V2_PRODUCTION_INTEGRATION_CANDIDATE_VERSION,
} from "./wc01-v2-production-integration-candidate";

export const WC01_V2_NORMALIZED_CONCERN_SCHEMA_COMPARISON_VERSION =
  "wc01.v2_normalized_concern_schema_comparison.1";

export type Wc01V2NormalizedConcernSchemaComparison = {
  packetVersion: typeof WC01_V2_NORMALIZED_CONCERN_SCHEMA_COMPARISON_VERSION;
  sourceCandidatePath: string;
  sourceCandidateVersion: typeof WC01_V2_PRODUCTION_INTEGRATION_CANDIDATE_VERSION;
  comparedFamilies: string[];
  proposedNormalizedConcernTypes: string[];
  proposedConcernPolicyKeys: string[];
  requiredFieldsPresent: Record<string, string[]>;
  missingFields: Record<string, string[]>;
  extraFields: Record<string, string[]>;
  fieldMappingTable: Wc01V2NormalizedConcernSchemaFieldMapping[];
  evidenceRequirementCoverage: Record<string, Wc01V2NormalizedConcernSchemaRequirementCoverage[]>;
  concernPolicyReadiness: Wc01V2SchemaReadiness;
  unifiedFindingReadiness: Wc01V2SchemaReadiness;
  checklistProjectionReadiness: Wc01V2SchemaReadiness;
  blockedReasons: string[];
  warnings: string[];
  recommendation:
    | "schema_shape_reviewable_fixture_only"
    | "blocked_needs_candidate_shape_revision"
    | "blocked_guardrail";
  closedDefaultFlags: Wc01V2NormalizedConcernSchemaClosedDefaultFlags;
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

export type Wc01V2NormalizedConcernSchemaFieldMapping = {
  family: string;
  wc01NormalizedConcernField: string;
  candidateField: string;
  status: "present" | "missing" | "draft_only" | "blocked";
  notes: string[];
};

export type Wc01V2NormalizedConcernSchemaRequirementCoverage = {
  requirement: string;
  status: "covered" | "missing" | "blocked";
  sourceFields: string[];
};

export type Wc01V2SchemaReadiness = {
  status: "fixture_reviewable" | "blocked" | "not_ready";
  reasons: string[];
};

export type Wc01V2NormalizedConcernSchemaClosedDefaultFlags = {
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

const NORMALIZED_CONCERN_BASE_REQUIREMENTS = [
  "canonicalConcernKey",
  "originType",
  "originKey",
  "sourceType",
  "title",
  "description",
  "evidenceBundle",
  "evidenceStrengthFlags",
  "promotionEligibility",
  "externalSurfacingEligibility",
  "negativeEvidenceFlags",
  "pageScope",
  "severity",
  "policyPageType",
  "suggestedUnifiedFindingId",
];

const TRACKING_REQUIREMENTS = [
  "family",
  "source_evidence_refs",
  "display_safe_excerpt_refs",
  "consent_state_context",
  "vendor_endpoint_attribution",
  "purpose_basis",
  "confidence_directness",
  "exclusions_applied",
  "unresolved_ref_disposition",
  "rollback_suppression_hints",
  "blocked_surfaces",
];

const COOKIE_STORAGE_REQUIREMENTS = [
  "family",
  "source_evidence_refs",
  "display_safe_excerpt_refs",
  "consent_state_context",
  "party_storage_context",
  "storage_type",
  "purpose_exclusions",
  "confidence_directness",
  "unresolved_ref_disposition",
  "rollback_suppression_hints",
  "blocked_surfaces",
];

export function parseWc01V2ProductionIntegrationCandidateForSchemaComparisonJson(
  raw: string,
): Wc01V2ProductionIntegrationCandidateArtifact {
  if (containsForbiddenGapObservedToken(raw)) {
    throw new Error("Wc01V2ProductionIntegrationCandidate contains forbidden status token.");
  }
  if (containsBlockedRawFields(raw)) {
    throw new Error("Wc01V2ProductionIntegrationCandidate contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(raw)) {
    throw new Error("Wc01V2ProductionIntegrationCandidate contains legal-conclusion language.");
  }

  const parsed = JSON.parse(raw) as unknown;
  validateCandidateArtifactShape(parsed);
  return parsed;
}

export function buildWc01V2NormalizedConcernSchemaComparison(
  artifact: Wc01V2ProductionIntegrationCandidateArtifact,
  sourceCandidatePath: string,
): Wc01V2NormalizedConcernSchemaComparison {
  validateCandidateArtifactShape(artifact);

  const blockedReasons = rootBlockedReasons(artifact);
  const candidateComparisons = artifact.candidates.map((candidate) => compareCandidate(candidate));
  const comparedFamilies = uniqueStrings(candidateComparisons.map((comparison) => comparison.family));
  const familyBlockedReasons = candidateComparisons.flatMap((comparison) =>
    comparison.blockedReasons.map((reason) => `${comparison.family}:${reason}`)
  );
  const allBlockedReasons = uniqueStrings([...blockedReasons, ...familyBlockedReasons]);

  const comparison: Wc01V2NormalizedConcernSchemaComparison = {
    packetVersion: WC01_V2_NORMALIZED_CONCERN_SCHEMA_COMPARISON_VERSION,
    sourceCandidatePath,
    sourceCandidateVersion: artifact.packetVersion,
    comparedFamilies,
    proposedNormalizedConcernTypes: uniqueStrings(
      artifact.candidates.map((candidate) => candidate.normalizedConcernDraft.proposedNormalizedConcernType),
    ),
    proposedConcernPolicyKeys: uniqueStrings(
      artifact.candidates.map((candidate) => candidate.proposedConcernPolicyKey),
    ),
    requiredFieldsPresent: Object.fromEntries(
      candidateComparisons.map((comparison) => [comparison.family, comparison.presentFields]),
    ),
    missingFields: Object.fromEntries(
      candidateComparisons.map((comparison) => [comparison.family, comparison.missingFields]),
    ),
    extraFields: Object.fromEntries(
      candidateComparisons.map((comparison) => [comparison.family, comparison.extraFields]),
    ),
    fieldMappingTable: candidateComparisons.flatMap((comparison) => comparison.fieldMappingTable),
    evidenceRequirementCoverage: Object.fromEntries(
      candidateComparisons.map((comparison) => [comparison.family, comparison.evidenceRequirementCoverage]),
    ),
    concernPolicyReadiness: readinessFor("concern_policy", allBlockedReasons, candidateComparisons),
    unifiedFindingReadiness: readinessFor("unified_finding", allBlockedReasons, candidateComparisons),
    checklistProjectionReadiness: readinessFor("checklist_projection", allBlockedReasons, candidateComparisons),
    blockedReasons: allBlockedReasons,
    warnings: warningsForComparison(candidateComparisons),
    recommendation: allBlockedReasons.length > 0
      ? "blocked_needs_candidate_shape_revision"
      : "schema_shape_reviewable_fixture_only",
    closedDefaultFlags: closedDefaultFlags(),
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

  assertComparisonGuardrails(comparison);
  return comparison;
}

export function buildWc01V2NormalizedConcernSchemaComparisonJson(
  raw: string,
  sourceCandidatePath: string,
) {
  return buildWc01V2NormalizedConcernSchemaComparison(
    parseWc01V2ProductionIntegrationCandidateForSchemaComparisonJson(raw),
    sourceCandidatePath,
  );
}

type CandidateComparison = {
  family: string;
  presentFields: string[];
  missingFields: string[];
  extraFields: string[];
  blockedReasons: string[];
  fieldMappingTable: Wc01V2NormalizedConcernSchemaFieldMapping[];
  evidenceRequirementCoverage: Wc01V2NormalizedConcernSchemaRequirementCoverage[];
};

function compareCandidate(candidate: Wc01V2ProductionIntegrationCandidate): CandidateComparison {
  const required = requirementsForFamily(candidate.family);
  const presentFields = required.filter((requirement) => requirementCovered(candidate, requirement));
  const missingFields = required.filter((requirement) => !requirementCovered(candidate, requirement));
  const blockedReasons = failClosedReasonsForCandidate(candidate);
  const extraFields = extraFieldsForCandidate(candidate);

  return {
    family: candidate.family,
    presentFields,
    missingFields,
    extraFields,
    blockedReasons,
    fieldMappingTable: fieldMappingTableForCandidate(candidate, required, missingFields),
    evidenceRequirementCoverage: required.map((requirement) => ({
      requirement,
      status: missingFields.includes(requirement) || blockedReasons.length > 0 ? "missing" : "covered",
      sourceFields: sourceFieldsForRequirement(candidate.family, requirement),
    })),
  };
}

export function failClosedReasonsForCandidate(candidate: Wc01V2ProductionIntegrationCandidate) {
  const reasons: string[] = [];
  if (candidate.failClosedReasons.length > 0) {
    reasons.push(...candidate.failClosedReasons.map((reason) => `candidate_failed:${reason}`));
  }
  if (candidate.normalizedConcernDraft.evidenceRefs.length === 0) {
    reasons.push("evidence_refs_missing");
  }
  if (candidate.normalizedConcernDraft.displaySafeExcerptRefs.length === 0) {
    reasons.push("display_safe_excerpt_refs_missing");
  }
  if (!candidate.normalizedConcernDraft.consentStateContext?.observedBeforeConsentAction) {
    reasons.push("consent_state_context_missing");
  }
  if (!candidate.normalizedConcernDraft.confidence) {
    reasons.push("confidence_missing");
  }
  if (!candidate.normalizedConcernDraft.directness) {
    reasons.push("directness_missing");
  }
  if (candidate.normalizedConcernDraft.sensitiveContextCategories.length > 0) {
    reasons.push("sensitive_context_requires_separate_policy_product_approval");
  }
  if (candidate.normalizedConcernDraft.unresolvedRefDisposition.affectsEvidenceSufficiency) {
    reasons.push("unresolved_refs_affect_evidence_sufficiency");
  }
  if (
    candidate.family === "pre_consent_cookie_storage" &&
    !candidate.normalizedConcernDraft.cookieStorageContext
  ) {
    reasons.push("cookie_storage_context_missing");
  }
  if (
    candidate.family === "pre_consent_cookie_storage" &&
    !candidate.normalizedConcernDraft.cookieStorageContext?.storageType
  ) {
    reasons.push("storage_type_missing");
  }
  if (candidate.closedDefaultFlags.productionEligible !== false) {
    reasons.push("candidate_attempts_production_eligibility");
  }
  if (candidate.closedDefaultFlags.persistEligible !== false) {
    reasons.push("candidate_attempts_persistence");
  }
  if (candidate.closedDefaultFlags.concernPolicyCallEligible !== false) {
    reasons.push("candidate_attempts_concern_policy_call");
  }
  if (candidate.closedDefaultFlags.unifiedFindingEligible !== false) {
    reasons.push("candidate_attempts_unified_finding");
  }
  if (candidate.closedDefaultFlags.checklistProjectionEligible !== false) {
    reasons.push("candidate_attempts_checklist_projection");
  }
  if (candidate.closedDefaultFlags.customerFacingEligible !== false) {
    reasons.push("candidate_attempts_customer_facing_eligibility");
  }
  return uniqueStrings(reasons);
}

function rootBlockedReasons(artifact: Wc01V2ProductionIntegrationCandidateArtifact) {
  const reasons: string[] = [];
  if (artifact.productionEligible !== false) {
    reasons.push("artifact_attempts_production_eligibility");
  }
  if (artifact.persistEligible !== false) {
    reasons.push("artifact_attempts_persistence");
  }
  if (artifact.concernPolicyCallEligible !== false) {
    reasons.push("artifact_attempts_concern_policy_call");
  }
  if (artifact.unifiedFindingEligible !== false) {
    reasons.push("artifact_attempts_unified_finding");
  }
  if (artifact.checklistProjectionEligible !== false) {
    reasons.push("artifact_attempts_checklist_projection");
  }
  if (artifact.customerFacingEligible !== false) {
    reasons.push("artifact_attempts_customer_facing_eligibility");
  }
  if (artifact.blockedCandidates.length > 0) {
    reasons.push("source_candidate_has_blocked_entries");
  }
  return uniqueStrings(reasons);
}

function requirementsForFamily(family: string) {
  if (family === "pre_consent_cookie_storage") {
    return COOKIE_STORAGE_REQUIREMENTS;
  }
  return TRACKING_REQUIREMENTS;
}

function requirementCovered(candidate: Wc01V2ProductionIntegrationCandidate, requirement: string) {
  switch (requirement) {
    case "family":
      return Boolean(candidate.family);
    case "source_evidence_refs":
      return candidate.normalizedConcernDraft.evidenceRefs.length > 0;
    case "display_safe_excerpt_refs":
      return candidate.normalizedConcernDraft.displaySafeExcerptRefs.length > 0;
    case "consent_state_context":
      return Boolean(candidate.normalizedConcernDraft.consentStateContext?.observedBeforeConsentAction);
    case "vendor_endpoint_attribution":
      return Boolean(candidate.normalizedConcernDraft.vendorOrEndpointAttribution?.name);
    case "purpose_basis":
      return candidate.normalizedConcernDraft.purposeBasis.supportingPurposes.length > 0;
    case "confidence_directness":
      return Boolean(candidate.normalizedConcernDraft.confidence && candidate.normalizedConcernDraft.directness);
    case "exclusions_applied":
    case "purpose_exclusions":
      return candidate.normalizedConcernDraft.exclusionsApplied.length > 0;
    case "unresolved_ref_disposition":
      return candidate.normalizedConcernDraft.unresolvedRefDisposition.affectsEvidenceSufficiency === false;
    case "rollback_suppression_hints":
      return candidate.rollbackPlan.rollbackSuppressionHints.length > 0;
    case "blocked_surfaces":
      return candidate.blockedSurfaces.length > 0;
    case "party_storage_context":
      return Boolean(candidate.normalizedConcernDraft.cookieStorageContext?.party);
    case "storage_type":
      return Boolean(candidate.normalizedConcernDraft.cookieStorageContext?.storageType);
    default:
      return false;
  }
}

function fieldMappingTableForCandidate(
  candidate: Wc01V2ProductionIntegrationCandidate,
  requirements: string[],
  missingFields: string[],
): Wc01V2NormalizedConcernSchemaFieldMapping[] {
  const baseMappings: Wc01V2NormalizedConcernSchemaFieldMapping[] = [
    mapping(candidate.family, "canonicalConcernKey", "proposedConcernPolicyKey", "draft_only"),
    mapping(candidate.family, "originType", "sourceEvidenceArtifact", "present"),
    mapping(candidate.family, "originKey", "family + proposedConcernPolicyKey", "present"),
    mapping(candidate.family, "sourceType", "fixture_only_v2_candidate", "draft_only"),
    mapping(candidate.family, "evidenceBundle.runtimeArtifacts", "normalizedConcernDraft.evidenceRefs", "present"),
    mapping(candidate.family, "evidenceBundle.sourceUrls", "normalizedConcernDraft.displaySafeExcerptRefs", "present"),
    mapping(candidate.family, "evidenceStrengthFlags", "normalizedConcernDraft.directness", "present"),
    mapping(candidate.family, "promotionEligibility", "closedDefaultFlags", "blocked"),
    mapping(candidate.family, "externalSurfacingEligibility", "closedDefaultFlags", "blocked"),
    mapping(candidate.family, "negativeEvidenceFlags", "normalizedConcernDraft.exclusionsApplied", "present"),
    mapping(candidate.family, "suggestedUnifiedFindingId", "proposedUnifiedFindingKey", "draft_only"),
  ];

  return [
    ...baseMappings,
    ...requirements.map((requirement) =>
      mapping(
        candidate.family,
        `fixture_requirement.${requirement}`,
        sourceFieldsForRequirement(candidate.family, requirement).join(", "),
        missingFields.includes(requirement) ? "missing" : "present",
      )
    ),
  ];
}

function mapping(
  family: string,
  wc01NormalizedConcernField: string,
  candidateField: string,
  status: Wc01V2NormalizedConcernSchemaFieldMapping["status"],
): Wc01V2NormalizedConcernSchemaFieldMapping {
  return {
    family,
    wc01NormalizedConcernField,
    candidateField,
    status,
    notes: status === "draft_only"
      ? ["Draft-only mapping for schema comparison. Not production policy output."]
      : [],
  };
}

function sourceFieldsForRequirement(family: string, requirement: string) {
  const common: Record<string, string[]> = {
    family: ["family"],
    source_evidence_refs: ["normalizedConcernDraft.evidenceRefs"],
    display_safe_excerpt_refs: ["normalizedConcernDraft.displaySafeExcerptRefs"],
    consent_state_context: ["normalizedConcernDraft.consentStateContext"],
    confidence_directness: ["normalizedConcernDraft.confidence", "normalizedConcernDraft.directness"],
    unresolved_ref_disposition: ["normalizedConcernDraft.unresolvedRefDisposition"],
    rollback_suppression_hints: ["rollbackPlan.rollbackSuppressionHints"],
    blocked_surfaces: ["blockedSurfaces"],
  };
  const tracking: Record<string, string[]> = {
    vendor_endpoint_attribution: ["normalizedConcernDraft.vendorOrEndpointAttribution"],
    purpose_basis: ["normalizedConcernDraft.purposeBasis"],
    exclusions_applied: ["normalizedConcernDraft.exclusionsApplied"],
  };
  const storage: Record<string, string[]> = {
    party_storage_context: ["normalizedConcernDraft.cookieStorageContext"],
    storage_type: ["normalizedConcernDraft.cookieStorageContext.storageType"],
    purpose_exclusions: ["normalizedConcernDraft.exclusionsApplied", "normalizedConcernDraft.purposeBasis"],
  };
  return common[requirement] ?? (family === "pre_consent_cookie_storage" ? storage[requirement] : tracking[requirement]) ?? [];
}

function extraFieldsForCandidate(candidate: Wc01V2ProductionIntegrationCandidate) {
  const extras = [
    "approvalMetadata",
    "copyPosture",
    "proposedUnifiedFindingKey",
    "proposedChecklistRowKey",
  ];
  if (candidate.family === "pre_consent_tracking" && candidate.normalizedConcernDraft.cookieStorageContext) {
    extras.push("cookieStorageContext");
  }
  return extras.sort();
}

function readinessFor(
  stage: "concern_policy" | "unified_finding" | "checklist_projection",
  blockedReasons: string[],
  comparisons: CandidateComparison[],
): Wc01V2SchemaReadiness {
  if (blockedReasons.length > 0) {
    return { status: "blocked", reasons: blockedReasons };
  }
  if (stage === "concern_policy") {
    return {
      status: "fixture_reviewable",
      reasons: ["Candidate shape includes draft policy keys and required normalized-concern comparison fields."],
    };
  }
  const hasDraftKeys = comparisons.length > 0;
  return {
    status: hasDraftKeys ? "fixture_reviewable" : "not_ready",
    reasons: hasDraftKeys
      ? [`${stage} draft keys are present for comparison only; no production projection is approved.`]
      : [`${stage} draft keys are missing.`],
  };
}

function warningsForComparison(comparisons: CandidateComparison[]) {
  const warnings = [
    "Schema comparison is fixture-only and does not call production concern policy.",
    "Unified finding and checklist keys are draft-only strings.",
  ];
  if (comparisons.some((comparison) => comparison.extraFields.length > 0)) {
    warnings.push("Candidate contains review metadata that is not part of the core WC01 normalized concern shape.");
  }
  return warnings;
}

function validateCandidateArtifactShape(value: unknown): asserts value is Wc01V2ProductionIntegrationCandidateArtifact {
  if (!isRecord(value)) {
    throw new Error("Wc01V2ProductionIntegrationCandidate must be an object.");
  }
  if (value.packetVersion !== WC01_V2_PRODUCTION_INTEGRATION_CANDIDATE_VERSION) {
    throw new Error("Unsupported Wc01V2ProductionIntegrationCandidate version.");
  }
  if (!Array.isArray(value.candidates)) {
    throw new Error("candidates must be an array.");
  }
  if (!Array.isArray(value.blockedCandidates)) {
    throw new Error("blockedCandidates must be an array.");
  }
}

function assertComparisonGuardrails(comparison: Wc01V2NormalizedConcernSchemaComparison) {
  if (
    comparison.productionEligible !== false ||
    comparison.persistEligible !== false ||
    comparison.concernPolicyCallEligible !== false ||
    comparison.unifiedFindingEligible !== false ||
    comparison.checklistProjectionEligible !== false ||
    comparison.customerFacingEligible !== false ||
    comparison.explicitApprovalRequired !== true
  ) {
    throw new Error("Normalized concern schema comparison must remain closed by default.");
  }
  const serialized = JSON.stringify(comparison);
  if (containsForbiddenGapObservedToken(serialized)) {
    throw new Error("Normalized concern schema comparison contains forbidden status token.");
  }
  if (containsBlockedRawFields(serialized)) {
    throw new Error("Normalized concern schema comparison contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(serialized)) {
    throw new Error("Normalized concern schema comparison contains legal-conclusion language.");
  }
}

function closedDefaultFlags(): Wc01V2NormalizedConcernSchemaClosedDefaultFlags {
  return {
    productionEligible: false,
    persistEligible: false,
    concernPolicyCallEligible: false,
    unifiedFindingEligible: false,
    checklistProjectionEligible: false,
    customerFacingEligible: false,
    explicitApprovalRequired: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)].sort();
}

export const WC01_NORMALIZED_CONCERN_SCHEMA_REFERENCE_FIELDS = [
  ...NORMALIZED_CONCERN_BASE_REQUIREMENTS,
];
