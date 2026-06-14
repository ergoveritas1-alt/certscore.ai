import {
  containsBlockedRawFields,
  containsForbiddenGapObservedToken,
} from "./wc01-shadow-output";

export const WC01_V2_NORMALIZED_CONCERN_DRAFT_MAPPING_VERSION =
  "wc01.v2_normalized_concern_draft_mapping.1";

export const WC01_V2_NORMALIZED_CONCERN_DRAFT_MAPPING_INPUT_VERSION =
  "wc01.v2_normalized_concern_draft_mapping_input.1";

export type Wc01V2NormalizedConcernDraftMappingFamily =
  | "pre_consent_tracking"
  | "pre_consent_cookie_storage";

export type Wc01V2NormalizedConcernDraftSourceArtifactKind =
  | "evidence_preview_packet"
  | "production_readiness_gate_draft"
  | "product_surface_proposal_draft";

export type Wc01V2NormalizedConcernDraftMappingInput = {
  inputVersion: typeof WC01_V2_NORMALIZED_CONCERN_DRAFT_MAPPING_INPUT_VERSION;
  sourceArtifactPath: string;
  sourceArtifactKind: Wc01V2NormalizedConcernDraftSourceArtifactKind;
  candidates: Wc01V2NormalizedConcernDraftMappingCandidateInput[];
  targetOutputFlags?: Partial<{
    productionEligible: boolean;
    persistEligible: boolean;
    concernPolicyCallEligible: boolean;
    unifiedFindingEligible: boolean;
    checklistProjectionEligible: boolean;
    customerFacingEligible: boolean;
    explicitApprovalRequired: boolean;
  }>;
};

export type Wc01V2NormalizedConcernDraftMappingCandidateInput = {
  sourceFamily: string;
  evidenceRefs: string[];
  displaySafeExcerptRefs: string[];
  consentStateContext?: {
    phase: "pre_consent" | "before_choice";
    observedBeforeConsentAction: boolean;
    sourceRefIds: string[];
  };
  cookieStorageContext?: {
    party: "third_party" | "first_party" | "unknown";
    storageType: "cookie" | "local_storage" | "session_storage" | "other_storage";
    observedWriteBeforeConsentAction: boolean;
    unsafeStorageContentPresent: boolean;
    sourceRefIds: string[];
  };
  confidence?: "high" | "medium" | "low";
  directness?: "direct" | "strong_runtime_equivalent" | "inferred";
  vendorOrEndpointAttribution?: {
    kind: "vendor" | "endpoint";
    name: string;
    confidence: "high" | "medium" | "low";
    sourceRefIds: string[];
  };
  purposeBasis: {
    supportingPurposes: string[];
    diagnosticPurposes: string[];
  };
  exclusionsApplied: string[];
  sensitiveContextCategories: string[];
  unresolvedRefDisposition: {
    unresolvedRefCount: number;
    affectsEvidenceSufficiency: boolean;
    notes: string[];
  };
  rollbackSuppressionHints: string[];
  blockedSurfaces: string[];
};

export type Wc01V2NormalizedConcernDraftMapping = {
  packetVersion: typeof WC01_V2_NORMALIZED_CONCERN_DRAFT_MAPPING_VERSION;
  sourceArtifactPath: string;
  sourceArtifactKind: Wc01V2NormalizedConcernDraftSourceArtifactKind;
  implementationStatus: "not_approved";
  productionEligible: false;
  persistEligible: false;
  concernPolicyCallEligible: false;
  unifiedFindingEligible: false;
  checklistProjectionEligible: false;
  customerFacingEligible: false;
  explicitApprovalRequired: true;
  draftMappings: Wc01V2NormalizedConcernDraft[];
  blockedMappings: Wc01V2NormalizedConcernDraftBlockedMapping[];
  closedDefaultFlags: Wc01V2NormalizedConcernClosedDefaultFlags;
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

export type Wc01V2NormalizedConcernDraft = {
  sourceArtifactPath: string;
  sourceFamily: Wc01V2NormalizedConcernDraftMappingFamily;
  proposedNormalizedConcernType:
    | "v2_pre_consent_tracking_normalized_concern_draft"
    | "v2_pre_consent_cookie_storage_normalized_concern_draft";
  proposedConcernPolicyKey:
    | "v2.pre_consent_tracking.reviewed_non_sensitive"
    | "v2.pre_consent_cookie_storage.reviewed_non_sensitive";
  proposedUnifiedFindingKey?: string;
  proposedChecklistRowKey?: string;
  evidenceRefs: string[];
  displaySafeExcerptRefs: string[];
  consentStateContext: NonNullable<Wc01V2NormalizedConcernDraftMappingCandidateInput["consentStateContext"]>;
  confidence: "high" | "medium";
  directness: "direct" | "strong_runtime_equivalent";
  vendorOrEndpointAttribution: NonNullable<Wc01V2NormalizedConcernDraftMappingCandidateInput["vendorOrEndpointAttribution"]>;
  purposeBasis: Wc01V2NormalizedConcernDraftMappingCandidateInput["purposeBasis"];
  exclusionsApplied: string[];
  sensitiveContextCategories: string[];
  unresolvedRefDisposition: Wc01V2NormalizedConcernDraftMappingCandidateInput["unresolvedRefDisposition"];
  rollbackSuppressionHints: string[];
  blockedSurfaces: string[];
  failClosedReasons: string[];
  closedDefaultFlags: Wc01V2NormalizedConcernClosedDefaultFlags;
  cookieStorageContext?: NonNullable<Wc01V2NormalizedConcernDraftMappingCandidateInput["cookieStorageContext"]>;
};

export type Wc01V2NormalizedConcernDraftBlockedMapping = {
  sourceArtifactPath: string;
  sourceFamily?: string;
  failClosedReasons: string[];
};

export type Wc01V2NormalizedConcernClosedDefaultFlags = {
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

const SUPPORTED_SOURCE_ARTIFACT_KINDS = new Set<Wc01V2NormalizedConcernDraftSourceArtifactKind>([
  "evidence_preview_packet",
  "production_readiness_gate_draft",
  "product_surface_proposal_draft",
]);

const SUPPORTED_FAMILIES = new Set<Wc01V2NormalizedConcernDraftMappingFamily>([
  "pre_consent_tracking",
  "pre_consent_cookie_storage",
]);

const SUPPORTING_PURPOSES = new Set([
  "advertising",
  "analytics",
  "marketing_automation",
  "advertising_measurement",
  "identity_resolution",
  "social_pixel",
  "retargeting",
]);

const DIAGNOSTIC_ONLY_PURPOSES = new Set([
  "security",
  "fraud_prevention",
  "bot_defense",
  "infrastructure",
  "cdn",
  "site_owned_infrastructure",
  "performance_monitoring",
  "support",
  "customer_support",
  "rum",
  "live_chat",
  "unknown",
]);

const TAG_OR_CMP_PURPOSES = new Set(["tag_management", "consent_management"]);

const PRE_CONSENT_TRACKING_REQUIRED_EXCLUSIONS = [
  "tag_management_only_excluded",
  "consent_management_only_excluded",
  "diagnostic_only_purposes_excluded",
  "inventory_only_excluded",
  "policy_runtime_alignment_only_excluded",
  "consent_flow_delta_only_excluded",
  "library_only_evidence_excluded",
];

const PRE_CONSENT_COOKIE_STORAGE_REQUIRED_EXCLUSIONS = [
  "tag_management_only_excluded",
  "consent_management_only_excluded",
  "diagnostic_only_purposes_excluded",
  "inventory_only_excluded",
  "policy_runtime_alignment_only_excluded",
  "consent_flow_delta_only_excluded",
  "raw_cookie_values_excluded",
  "unsafe_storage_content_excluded",
];

export function parseWc01V2NormalizedConcernDraftMappingInputJson(
  raw: string,
): Wc01V2NormalizedConcernDraftMappingInput {
  if (containsForbiddenGapObservedToken(raw)) {
    throw new Error("Wc01V2NormalizedConcernDraftMappingInput contains forbidden status token.");
  }
  if (containsBlockedRawFields(raw)) {
    throw new Error("Wc01V2NormalizedConcernDraftMappingInput contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(raw)) {
    throw new Error("Wc01V2NormalizedConcernDraftMappingInput contains legal-conclusion language.");
  }

  const parsed = JSON.parse(raw) as unknown;
  validateMappingInput(parsed);
  return parsed;
}

export function buildWc01V2NormalizedConcernDraftMapping(
  input: Wc01V2NormalizedConcernDraftMappingInput,
): Wc01V2NormalizedConcernDraftMapping {
  validateMappingInput(input);

  const draftMappings: Wc01V2NormalizedConcernDraft[] = [];
  const blockedMappings: Wc01V2NormalizedConcernDraftBlockedMapping[] = [];
  const targetOutputReasons = failClosedReasonsForTargetOutputFlags(input.targetOutputFlags);

  for (const candidate of input.candidates) {
    const failClosedReasons = uniqueStrings([
      ...targetOutputReasons,
      ...failClosedReasonsForCandidate(candidate),
    ]);

    if (failClosedReasons.length > 0) {
      blockedMappings.push({
        sourceArtifactPath: input.sourceArtifactPath,
        sourceFamily: candidate.sourceFamily,
        failClosedReasons,
      });
      continue;
    }

    draftMappings.push(buildDraftForCandidate(input, candidate as DraftableCandidateInput));
  }

  const mapping: Wc01V2NormalizedConcernDraftMapping = {
    packetVersion: WC01_V2_NORMALIZED_CONCERN_DRAFT_MAPPING_VERSION,
    sourceArtifactPath: input.sourceArtifactPath,
    sourceArtifactKind: input.sourceArtifactKind,
    implementationStatus: "not_approved",
    productionEligible: false,
    persistEligible: false,
    concernPolicyCallEligible: false,
    unifiedFindingEligible: false,
    checklistProjectionEligible: false,
    customerFacingEligible: false,
    explicitApprovalRequired: true,
    draftMappings,
    blockedMappings,
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

  assertMappingGuardrails(mapping);
  return mapping;
}

export function buildWc01V2NormalizedConcernDraftMappingJson(raw: string) {
  return buildWc01V2NormalizedConcernDraftMapping(
    parseWc01V2NormalizedConcernDraftMappingInputJson(raw),
  );
}

export function failClosedReasonsForCandidate(
  candidate: Wc01V2NormalizedConcernDraftMappingCandidateInput,
) {
  const reasons: string[] = [];

  if (!SUPPORTED_FAMILIES.has(candidate.sourceFamily as Wc01V2NormalizedConcernDraftMappingFamily)) {
    reasons.push("unsupported_family");
  }
  if (candidate.evidenceRefs.length === 0) {
    reasons.push("evidence_refs_missing");
  }
  if (candidate.displaySafeExcerptRefs.length === 0) {
    reasons.push("display_safe_excerpt_refs_missing");
  }
  if (!candidate.consentStateContext || !candidate.consentStateContext.observedBeforeConsentAction) {
    reasons.push("consent_state_context_missing");
  }
  if (candidate.confidence !== "high" && candidate.confidence !== "medium") {
    reasons.push("confidence_missing_or_weak");
  }
  if (candidate.directness !== "direct" && candidate.directness !== "strong_runtime_equivalent") {
    reasons.push("directness_missing_or_weak");
  }
  if (!candidate.vendorOrEndpointAttribution || candidate.vendorOrEndpointAttribution.confidence === "low") {
    reasons.push("vendor_or_endpoint_attribution_missing_or_weak");
  }
  if (candidate.unresolvedRefDisposition.affectsEvidenceSufficiency) {
    reasons.push("unresolved_refs_affect_evidence_sufficiency");
  }
  if (candidate.sensitiveContextCategories.length > 0) {
    reasons.push("sensitive_context_requires_separate_policy_product_approval");
  }
  if (hasForbiddenPurposeSupport(candidate)) {
    reasons.push("diagnostic_only_purpose_is_sole_or_mixed_support");
  }
  if (isTagManagementOnly(candidate)) {
    reasons.push("tag_management_only_support");
  }
  if (isConsentManagementOnly(candidate)) {
    reasons.push("consent_management_only_support");
  }
  if (!hasAllowedSupportingPurpose(candidate)) {
    reasons.push("supporting_purpose_missing");
  }

  if (candidate.sourceFamily === "pre_consent_tracking") {
    for (const exclusion of PRE_CONSENT_TRACKING_REQUIRED_EXCLUSIONS) {
      if (!candidate.exclusionsApplied.includes(exclusion)) {
        reasons.push(`required_exclusion_missing:${exclusion}`);
      }
    }
  }

  if (candidate.sourceFamily === "pre_consent_cookie_storage") {
    if (!candidate.cookieStorageContext || !candidate.cookieStorageContext.observedWriteBeforeConsentAction) {
      reasons.push("cookie_storage_context_missing");
    } else {
      if (candidate.cookieStorageContext.party !== "third_party") {
        reasons.push("non_third_party_storage_context");
      }
      if (candidate.cookieStorageContext.unsafeStorageContentPresent) {
        reasons.push("unsafe_storage_content_present");
      }
    }
    for (const exclusion of PRE_CONSENT_COOKIE_STORAGE_REQUIRED_EXCLUSIONS) {
      if (!candidate.exclusionsApplied.includes(exclusion)) {
        reasons.push(`required_exclusion_missing:${exclusion}`);
      }
    }
  }

  return uniqueStrings(reasons);
}

function buildDraftForCandidate(
  input: Wc01V2NormalizedConcernDraftMappingInput,
  candidate: DraftableCandidateInput,
): Wc01V2NormalizedConcernDraft {
  const sourceFamily = candidate.sourceFamily;
  const base = {
    sourceArtifactPath: input.sourceArtifactPath,
    sourceFamily,
    evidenceRefs: [...candidate.evidenceRefs],
    displaySafeExcerptRefs: [...candidate.displaySafeExcerptRefs],
    consentStateContext: {
      ...candidate.consentStateContext,
      sourceRefIds: [...candidate.consentStateContext.sourceRefIds],
    },
    confidence: candidate.confidence,
    directness: candidate.directness,
    vendorOrEndpointAttribution: {
      ...candidate.vendorOrEndpointAttribution,
      sourceRefIds: [...candidate.vendorOrEndpointAttribution.sourceRefIds],
    },
    purposeBasis: {
      supportingPurposes: [...candidate.purposeBasis.supportingPurposes],
      diagnosticPurposes: [...candidate.purposeBasis.diagnosticPurposes],
    },
    exclusionsApplied: [...candidate.exclusionsApplied],
    sensitiveContextCategories: [...candidate.sensitiveContextCategories],
    unresolvedRefDisposition: {
      unresolvedRefCount: candidate.unresolvedRefDisposition.unresolvedRefCount,
      affectsEvidenceSufficiency: candidate.unresolvedRefDisposition.affectsEvidenceSufficiency,
      notes: [...candidate.unresolvedRefDisposition.notes],
    },
    rollbackSuppressionHints: [...candidate.rollbackSuppressionHints],
    blockedSurfaces: [...candidate.blockedSurfaces],
    failClosedReasons: [],
    closedDefaultFlags: closedDefaultFlags(),
  };

  if (sourceFamily === "pre_consent_tracking") {
    return {
      ...base,
      proposedNormalizedConcernType: "v2_pre_consent_tracking_normalized_concern_draft",
      proposedConcernPolicyKey: "v2.pre_consent_tracking.reviewed_non_sensitive",
      proposedUnifiedFindingKey: "v2.pre_consent_tracking.unified_finding_draft",
      proposedChecklistRowKey: "v2.pre_consent_tracking.checklist_row_draft",
    };
  }

  return {
    ...base,
    proposedNormalizedConcernType: "v2_pre_consent_cookie_storage_normalized_concern_draft",
    proposedConcernPolicyKey: "v2.pre_consent_cookie_storage.reviewed_non_sensitive",
    proposedUnifiedFindingKey: "v2.pre_consent_cookie_storage.unified_finding_draft",
    proposedChecklistRowKey: "v2.pre_consent_cookie_storage.checklist_row_draft",
    cookieStorageContext: {
      ...candidate.cookieStorageContext,
      sourceRefIds: [...candidate.cookieStorageContext.sourceRefIds],
    },
  };
}

type DraftableCandidateInput = Wc01V2NormalizedConcernDraftMappingCandidateInput & {
  sourceFamily: Wc01V2NormalizedConcernDraftMappingFamily;
  consentStateContext: NonNullable<Wc01V2NormalizedConcernDraftMappingCandidateInput["consentStateContext"]>;
  confidence: "high" | "medium";
  directness: "direct" | "strong_runtime_equivalent";
  vendorOrEndpointAttribution: NonNullable<Wc01V2NormalizedConcernDraftMappingCandidateInput["vendorOrEndpointAttribution"]>;
  cookieStorageContext: NonNullable<Wc01V2NormalizedConcernDraftMappingCandidateInput["cookieStorageContext"]>;
};

function failClosedReasonsForTargetOutputFlags(
  flags: Wc01V2NormalizedConcernDraftMappingInput["targetOutputFlags"],
) {
  if (!flags) {
    return [];
  }
  const reasons: string[] = [];
  if (flags.productionEligible === true) {
    reasons.push("target_output_attempts_production_eligibility");
  }
  if (flags.persistEligible === true) {
    reasons.push("target_output_attempts_persistence");
  }
  if (flags.concernPolicyCallEligible === true) {
    reasons.push("target_output_attempts_concern_policy_call");
  }
  if (flags.unifiedFindingEligible === true) {
    reasons.push("target_output_attempts_unified_finding");
  }
  if (flags.checklistProjectionEligible === true) {
    reasons.push("target_output_attempts_checklist_projection");
  }
  if (flags.customerFacingEligible === true) {
    reasons.push("target_output_attempts_customer_facing_eligibility");
  }
  if (flags.explicitApprovalRequired === false) {
    reasons.push("target_output_attempts_to_skip_explicit_approval");
  }
  return uniqueStrings(reasons);
}

function hasAllowedSupportingPurpose(candidate: Wc01V2NormalizedConcernDraftMappingCandidateInput) {
  return candidate.purposeBasis.supportingPurposes.some((purpose) => SUPPORTING_PURPOSES.has(purpose));
}

function hasForbiddenPurposeSupport(candidate: Wc01V2NormalizedConcernDraftMappingCandidateInput) {
  return candidate.purposeBasis.supportingPurposes.some((purpose) => DIAGNOSTIC_ONLY_PURPOSES.has(purpose));
}

function isTagManagementOnly(candidate: Wc01V2NormalizedConcernDraftMappingCandidateInput) {
  return candidate.purposeBasis.supportingPurposes.length > 0 &&
    candidate.purposeBasis.supportingPurposes.every((purpose) => purpose === "tag_management");
}

function isConsentManagementOnly(candidate: Wc01V2NormalizedConcernDraftMappingCandidateInput) {
  return candidate.purposeBasis.supportingPurposes.length > 0 &&
    candidate.purposeBasis.supportingPurposes.every((purpose) => purpose === "consent_management");
}

function validateMappingInput(value: unknown): asserts value is Wc01V2NormalizedConcernDraftMappingInput {
  if (!isRecord(value)) {
    throw new Error("Wc01V2NormalizedConcernDraftMappingInput must be an object.");
  }
  if (value.inputVersion !== WC01_V2_NORMALIZED_CONCERN_DRAFT_MAPPING_INPUT_VERSION) {
    throw new Error("Unsupported Wc01V2NormalizedConcernDraftMappingInput version.");
  }
  assertNonEmptyString(value.sourceArtifactPath, "sourceArtifactPath");
  if (!SUPPORTED_SOURCE_ARTIFACT_KINDS.has(value.sourceArtifactKind as Wc01V2NormalizedConcernDraftSourceArtifactKind)) {
    throw new Error("Unsupported sourceArtifactKind.");
  }
  if (!Array.isArray(value.candidates)) {
    throw new Error("candidates must be an array.");
  }
  for (const candidate of value.candidates) {
    validateCandidate(candidate);
  }
  if (value.targetOutputFlags !== undefined) {
    validateTargetOutputFlags(value.targetOutputFlags);
  }
}

function validateCandidate(value: unknown): asserts value is Wc01V2NormalizedConcernDraftMappingCandidateInput {
  if (!isRecord(value)) {
    throw new Error("candidates entries must be objects.");
  }
  assertNonEmptyString(value.sourceFamily, "sourceFamily");
  assertStringArray(value.evidenceRefs, "evidenceRefs");
  assertStringArray(value.displaySafeExcerptRefs, "displaySafeExcerptRefs");
  if (value.consentStateContext !== undefined) {
    validateConsentStateContext(value.consentStateContext);
  }
  if (value.cookieStorageContext !== undefined) {
    validateCookieStorageContext(value.cookieStorageContext);
  }
  if (
    value.confidence !== undefined &&
    value.confidence !== "high" &&
    value.confidence !== "medium" &&
    value.confidence !== "low"
  ) {
    throw new Error("confidence is unsupported.");
  }
  if (
    value.directness !== undefined &&
    value.directness !== "direct" &&
    value.directness !== "strong_runtime_equivalent" &&
    value.directness !== "inferred"
  ) {
    throw new Error("directness is unsupported.");
  }
  if (value.vendorOrEndpointAttribution !== undefined) {
    validateVendorOrEndpointAttribution(value.vendorOrEndpointAttribution);
  }
  validatePurposeBasis(value.purposeBasis);
  assertStringArray(value.exclusionsApplied, "exclusionsApplied");
  assertStringArray(value.sensitiveContextCategories, "sensitiveContextCategories");
  validateUnresolvedRefDisposition(value.unresolvedRefDisposition);
  assertStringArray(value.rollbackSuppressionHints, "rollbackSuppressionHints");
  assertStringArray(value.blockedSurfaces, "blockedSurfaces");
}

function validateConsentStateContext(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("consentStateContext must be an object.");
  }
  if (value.phase !== "pre_consent" && value.phase !== "before_choice") {
    throw new Error("consentStateContext.phase is unsupported.");
  }
  if (typeof value.observedBeforeConsentAction !== "boolean") {
    throw new Error("consentStateContext.observedBeforeConsentAction must be boolean.");
  }
  assertStringArray(value.sourceRefIds, "consentStateContext.sourceRefIds");
}

function validateCookieStorageContext(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("cookieStorageContext must be an object.");
  }
  if (value.party !== "third_party" && value.party !== "first_party" && value.party !== "unknown") {
    throw new Error("cookieStorageContext.party is unsupported.");
  }
  if (
    value.storageType !== "cookie" &&
    value.storageType !== "local_storage" &&
    value.storageType !== "session_storage" &&
    value.storageType !== "other_storage"
  ) {
    throw new Error("cookieStorageContext.storageType is unsupported.");
  }
  if (typeof value.observedWriteBeforeConsentAction !== "boolean") {
    throw new Error("cookieStorageContext.observedWriteBeforeConsentAction must be boolean.");
  }
  if (typeof value.unsafeStorageContentPresent !== "boolean") {
    throw new Error("cookieStorageContext.unsafeStorageContentPresent must be boolean.");
  }
  assertStringArray(value.sourceRefIds, "cookieStorageContext.sourceRefIds");
}

function validateVendorOrEndpointAttribution(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("vendorOrEndpointAttribution must be an object.");
  }
  if (value.kind !== "vendor" && value.kind !== "endpoint") {
    throw new Error("vendorOrEndpointAttribution.kind is unsupported.");
  }
  assertNonEmptyString(value.name, "vendorOrEndpointAttribution.name");
  if (value.confidence !== "high" && value.confidence !== "medium" && value.confidence !== "low") {
    throw new Error("vendorOrEndpointAttribution.confidence is unsupported.");
  }
  assertStringArray(value.sourceRefIds, "vendorOrEndpointAttribution.sourceRefIds");
}

function validatePurposeBasis(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("purposeBasis must be an object.");
  }
  assertStringArray(value.supportingPurposes, "purposeBasis.supportingPurposes");
  assertStringArray(value.diagnosticPurposes, "purposeBasis.diagnosticPurposes");
  const supportingPurposes = value.supportingPurposes as string[];
  const diagnosticPurposes = value.diagnosticPurposes as string[];
  for (const purpose of [...supportingPurposes, ...diagnosticPurposes]) {
    if (!SUPPORTING_PURPOSES.has(purpose) && !DIAGNOSTIC_ONLY_PURPOSES.has(purpose) && !TAG_OR_CMP_PURPOSES.has(purpose)) {
      throw new Error(`Unsupported purpose: ${purpose}.`);
    }
  }
}

function validateUnresolvedRefDisposition(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("unresolvedRefDisposition must be an object.");
  }
  assertNonNegativeInteger(value.unresolvedRefCount, "unresolvedRefDisposition.unresolvedRefCount");
  if (typeof value.affectsEvidenceSufficiency !== "boolean") {
    throw new Error("unresolvedRefDisposition.affectsEvidenceSufficiency must be boolean.");
  }
  assertStringArray(value.notes, "unresolvedRefDisposition.notes");
}

function validateTargetOutputFlags(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("targetOutputFlags must be an object.");
  }
  for (const flag of [
    "productionEligible",
    "persistEligible",
    "concernPolicyCallEligible",
    "unifiedFindingEligible",
    "checklistProjectionEligible",
    "customerFacingEligible",
    "explicitApprovalRequired",
  ]) {
    if (value[flag] !== undefined && typeof value[flag] !== "boolean") {
      throw new Error(`targetOutputFlags.${flag} must be boolean when provided.`);
    }
  }
}

function assertMappingGuardrails(mapping: Wc01V2NormalizedConcernDraftMapping) {
  if (
    mapping.implementationStatus !== "not_approved" ||
    mapping.productionEligible !== false ||
    mapping.persistEligible !== false ||
    mapping.concernPolicyCallEligible !== false ||
    mapping.unifiedFindingEligible !== false ||
    mapping.checklistProjectionEligible !== false ||
    mapping.customerFacingEligible !== false ||
    mapping.explicitApprovalRequired !== true
  ) {
    throw new Error("Normalized concern draft mapping must remain closed by default.");
  }
  const serialized = JSON.stringify(mapping);
  if (containsForbiddenGapObservedToken(serialized)) {
    throw new Error("Normalized concern draft mapping contains forbidden status token.");
  }
  if (containsBlockedRawFields(serialized)) {
    throw new Error("Normalized concern draft mapping contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(serialized)) {
    throw new Error("Normalized concern draft mapping contains legal-conclusion language.");
  }
}

function closedDefaultFlags(): Wc01V2NormalizedConcernClosedDefaultFlags {
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

function assertStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${fieldName} must be an array of strings.`);
  }
}

function assertNonNegativeInteger(value: unknown, fieldName: string) {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)].sort();
}
