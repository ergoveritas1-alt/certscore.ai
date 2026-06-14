import {
  containsBlockedRawFields,
  containsForbiddenGapObservedToken,
} from "./wc01-shadow-output";
import {
  type Wc01V2ConcernPolicyShapeComparison,
  WC01_V2_CONCERN_POLICY_SHAPE_COMPARISON_VERSION,
} from "./wc01-v2-concern-policy-shape-comparison";

export const WC01_V2_PROJECTION_SHAPE_COMPARISON_VERSION =
  "wc01.v2_projection_shape_comparison.1";

export type Wc01V2ProjectionShapeComparison = {
  packetVersion: typeof WC01_V2_PROJECTION_SHAPE_COMPARISON_VERSION;
  sourceConcernPolicyShapePath: string;
  sourceConcernPolicyShapeVersion: typeof WC01_V2_CONCERN_POLICY_SHAPE_COMPARISON_VERSION;
  comparedFamilies: string[];
  proposedConcernPolicyKeys: string[];
  proposedUnifiedFindingKeys: string[];
  proposedChecklistRowKeys: string[];
  projectionInputRequirements: Record<string, Wc01V2ProjectionInputRequirement[]>;
  missingProjectionInputs: Record<string, string[]>;
  projectionGateTable: Wc01V2ProjectionGateComparison[];
  evidencePacketCoverage: Record<string, Wc01V2ProjectionEvidencePacketCoverage[]>;
  unifiedFindingShapeReadiness: Wc01V2ProjectionShapeReadiness;
  checklistProjectionShapeReadiness: Wc01V2ProjectionShapeReadiness;
  evidencePacketReadiness: Wc01V2ProjectionShapeReadiness;
  blockedReasons: string[];
  warnings: string[];
  recommendation:
    | "projection_shape_reviewable_fixture_only"
    | "blocked_needs_policy_or_projection_shape_revision"
    | "blocked_guardrail";
  closedDefaultFlags: Wc01V2ProjectionShapeClosedDefaultFlags;
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

export type Wc01V2ProjectionInputRequirement = {
  requirement: string;
  sourcePolicyShapeFields: string[];
  status: "available" | "missing" | "blocked";
};

export type Wc01V2ProjectionGateComparison = {
  family: string;
  proposedUnifiedFindingKey: string;
  proposedChecklistRowKey: string;
  gate: string;
  status: "available" | "missing" | "blocked" | "draft_only";
  notes: string[];
};

export type Wc01V2ProjectionEvidencePacketCoverage = {
  packetField: string;
  status: "covered" | "missing" | "blocked";
  sourcePolicyRequirements: string[];
};

export type Wc01V2ProjectionShapeReadiness = {
  status: "fixture_reviewable" | "blocked" | "not_ready";
  reasons: string[];
};

export type Wc01V2ProjectionShapeClosedDefaultFlags = {
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

const COMMON_PROJECTION_REQUIREMENTS = [
  "concern_policy_key",
  "policy_decision_readiness",
  "suppression_readiness",
  "copy_review_readiness",
  "source_evidence_refs",
  "display_safe_excerpt_refs",
  "consent_state_context",
  "confidence_directness",
  "purpose_basis",
  "evidence_gate_coverage",
  "blocked_surfaces",
  "draft_unified_finding_key",
  "draft_checklist_row_key",
];

const TRACKING_PROJECTION_REQUIREMENTS = [
  ...COMMON_PROJECTION_REQUIREMENTS,
  "vendor_or_endpoint_context",
];

const COOKIE_STORAGE_PROJECTION_REQUIREMENTS = [
  ...COMMON_PROJECTION_REQUIREMENTS,
  "party_storage_context",
  "storage_type",
];

export function parseWc01V2ConcernPolicyShapeComparisonForProjectionShapeJson(
  raw: string,
): Wc01V2ConcernPolicyShapeComparison {
  if (containsForbiddenGapObservedToken(raw)) {
    throw new Error("Wc01V2ConcernPolicyShapeComparison contains forbidden status token.");
  }
  if (containsBlockedRawFields(raw)) {
    throw new Error("Wc01V2ConcernPolicyShapeComparison contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(raw)) {
    throw new Error("Wc01V2ConcernPolicyShapeComparison contains legal-conclusion language.");
  }

  const parsed = JSON.parse(raw) as unknown;
  validateConcernPolicyShape(parsed);
  return parsed;
}

export function buildWc01V2ProjectionShapeComparison(
  policyShape: Wc01V2ConcernPolicyShapeComparison,
  sourceConcernPolicyShapePath: string,
): Wc01V2ProjectionShapeComparison {
  validateConcernPolicyShape(policyShape);

  const familyComparisons = policyShape.comparedFamilies.map((family) =>
    compareProjectionFamily(family, policyShape)
  );
  const blockedReasons = uniqueStrings([
    ...rootBlockedReasons(policyShape),
    ...familyComparisons.flatMap((comparison) =>
      comparison.blockedReasons.map((reason) => `${comparison.family}:${reason}`)
    ),
  ]);
  const comparison: Wc01V2ProjectionShapeComparison = {
    packetVersion: WC01_V2_PROJECTION_SHAPE_COMPARISON_VERSION,
    sourceConcernPolicyShapePath,
    sourceConcernPolicyShapeVersion: policyShape.packetVersion,
    comparedFamilies: policyShape.comparedFamilies,
    proposedConcernPolicyKeys: policyShape.proposedConcernPolicyKeys,
    proposedUnifiedFindingKeys: familyComparisons.map((comparison) => comparison.proposedUnifiedFindingKey),
    proposedChecklistRowKeys: familyComparisons.map((comparison) => comparison.proposedChecklistRowKey),
    projectionInputRequirements: Object.fromEntries(
      familyComparisons.map((comparison) => [comparison.family, comparison.requirements]),
    ),
    missingProjectionInputs: Object.fromEntries(
      familyComparisons.map((comparison) => [comparison.family, comparison.missingRequirements]),
    ),
    projectionGateTable: familyComparisons.flatMap((comparison) => comparison.projectionGateTable),
    evidencePacketCoverage: Object.fromEntries(
      familyComparisons.map((comparison) => [comparison.family, comparison.evidencePacketCoverage]),
    ),
    unifiedFindingShapeReadiness: readinessFor("unified_finding", blockedReasons, familyComparisons),
    checklistProjectionShapeReadiness: readinessFor("checklist_projection", blockedReasons, familyComparisons),
    evidencePacketReadiness: readinessFor("evidence_packet", blockedReasons, familyComparisons),
    blockedReasons,
    warnings: warningsForComparison(familyComparisons),
    recommendation: blockedReasons.length > 0
      ? "blocked_needs_policy_or_projection_shape_revision"
      : "projection_shape_reviewable_fixture_only",
    closedDefaultFlags: closedDefaultFlags(),
    productionEligible: false,
    persistEligible: false,
    concernPolicyCallEligible: false,
    unifiedFindingEligible: false,
    checklistProjectionEligible: false,
    customerFacingEligible: false,
    explicitApprovalRequired: true,
    guardrails: guardrails(),
  };

  assertProjectionShapeGuardrails(comparison);
  return comparison;
}

export function buildWc01V2ProjectionShapeComparisonJson(
  raw: string,
  sourceConcernPolicyShapePath: string,
) {
  return buildWc01V2ProjectionShapeComparison(
    parseWc01V2ConcernPolicyShapeComparisonForProjectionShapeJson(raw),
    sourceConcernPolicyShapePath,
  );
}

type FamilyProjectionComparison = {
  family: string;
  proposedUnifiedFindingKey: string;
  proposedChecklistRowKey: string;
  requirements: Wc01V2ProjectionInputRequirement[];
  missingRequirements: string[];
  blockedReasons: string[];
  projectionGateTable: Wc01V2ProjectionGateComparison[];
  evidencePacketCoverage: Wc01V2ProjectionEvidencePacketCoverage[];
};

function compareProjectionFamily(
  family: string,
  policyShape: Wc01V2ConcernPolicyShapeComparison,
): FamilyProjectionComparison {
  const requirements = requirementsForFamily(family).map((requirement) => {
    const covered = requirementCovered(family, requirement, policyShape);
    return {
      requirement,
      sourcePolicyShapeFields: sourcePolicyFieldsForRequirement(family, requirement),
      status: covered ? "available" as const : "missing" as const,
    };
  });
  const missingRequirements = requirements
    .filter((requirement) => requirement.status !== "available")
    .map((requirement) => requirement.requirement);
  const proposedUnifiedFindingKey = draftUnifiedFindingKeyForFamily(family);
  const proposedChecklistRowKey = draftChecklistRowKeyForFamily(family);
  const blockedReasons = failClosedReasonsForProjectionFamily(family, policyShape);

  return {
    family,
    proposedUnifiedFindingKey,
    proposedChecklistRowKey,
    requirements,
    missingRequirements,
    blockedReasons,
    projectionGateTable: projectionGateTableForFamily(
      family,
      proposedUnifiedFindingKey,
      proposedChecklistRowKey,
      requirements,
      blockedReasons,
    ),
    evidencePacketCoverage: evidencePacketCoverageForFamily(family, requirements, blockedReasons),
  };
}

export function failClosedReasonsForProjectionFamily(
  family: string,
  policyShape: Wc01V2ConcernPolicyShapeComparison,
) {
  const reasons: string[] = [];
  if (!policyShape.proposedConcernPolicyKeys.some((key) => key.includes(family))) {
    reasons.push("concern_policy_key_missing");
  }
  if ((policyShape.missingPolicyInputs[family] ?? []).length > 0) {
    reasons.push("policy_shape_missing_required_inputs");
  }
  if (policyShape.blockedReasons.length > 0) {
    reasons.push("source_policy_shape_has_blocked_reasons");
  }
  for (const readiness of [
    policyShape.decisionReadiness,
    policyShape.suppressionReadiness,
    policyShape.copyReviewReadiness,
  ]) {
    if (readiness.status !== "fixture_reviewable") {
      reasons.push("policy_shape_readiness_not_reviewable");
    }
  }
  for (const requirement of requirementsForFamily(family)) {
    if (!requirementCovered(family, requirement, policyShape)) {
      reasons.push(`projection_input_missing:${requirement}`);
    }
  }
  return uniqueStrings(reasons);
}

function rootBlockedReasons(policyShape: Wc01V2ConcernPolicyShapeComparison) {
  const reasons: string[] = [];
  if (policyShape.productionEligible !== false) {
    reasons.push("policy_shape_attempts_production_eligibility");
  }
  if (policyShape.persistEligible !== false) {
    reasons.push("policy_shape_attempts_persistence");
  }
  if (policyShape.concernPolicyCallEligible !== false) {
    reasons.push("policy_shape_attempts_concern_policy_call");
  }
  if (policyShape.unifiedFindingEligible !== false) {
    reasons.push("policy_shape_attempts_unified_finding");
  }
  if (policyShape.checklistProjectionEligible !== false) {
    reasons.push("policy_shape_attempts_checklist_projection");
  }
  if (policyShape.customerFacingEligible !== false) {
    reasons.push("policy_shape_attempts_customer_facing_eligibility");
  }
  if (policyShape.explicitApprovalRequired !== true) {
    reasons.push("policy_shape_attempts_to_skip_explicit_approval");
  }
  if (policyShape.recommendation !== "concern_policy_shape_reviewable_fixture_only") {
    reasons.push("policy_shape_not_reviewable_fixture_only");
  }
  return uniqueStrings(reasons);
}

function requirementsForFamily(family: string) {
  if (family === "pre_consent_cookie_storage") {
    return COOKIE_STORAGE_PROJECTION_REQUIREMENTS;
  }
  return TRACKING_PROJECTION_REQUIREMENTS;
}

function requirementCovered(
  family: string,
  requirement: string,
  policyShape: Wc01V2ConcernPolicyShapeComparison,
) {
  switch (requirement) {
    case "concern_policy_key":
      return policyShape.proposedConcernPolicyKeys.some((key) => key.includes(family));
    case "policy_decision_readiness":
      return policyShape.decisionReadiness.status === "fixture_reviewable";
    case "suppression_readiness":
      return policyShape.suppressionReadiness.status === "fixture_reviewable";
    case "copy_review_readiness":
      return policyShape.copyReviewReadiness.status === "fixture_reviewable";
    case "source_evidence_refs":
      return policyRequirementAvailable(family, policyShape, "source_evidence_refs");
    case "display_safe_excerpt_refs":
      return policyRequirementAvailable(family, policyShape, "display_safe_excerpt_refs");
    case "consent_state_context":
      return policyRequirementAvailable(family, policyShape, "consent_state_context");
    case "confidence_directness":
      return policyRequirementAvailable(family, policyShape, "confidence_directness");
    case "purpose_basis":
      return policyRequirementAvailable(family, policyShape, "supporting_purpose_basis") &&
        policyRequirementAvailable(family, policyShape, "diagnostic_exclusions");
    case "evidence_gate_coverage":
      return (policyShape.evidenceGateCoverage[family] ?? []).every((gate) => gate.status === "covered");
    case "blocked_surfaces":
      return policyRequirementAvailable(family, policyShape, "blocked_surfaces");
    case "draft_unified_finding_key":
      return Boolean(draftUnifiedFindingKeyForFamily(family));
    case "draft_checklist_row_key":
      return Boolean(draftChecklistRowKeyForFamily(family));
    case "vendor_or_endpoint_context":
      return policyRequirementAvailable(family, policyShape, "vendor_endpoint_attribution");
    case "party_storage_context":
      return policyRequirementAvailable(family, policyShape, "party_storage_context");
    case "storage_type":
      return policyRequirementAvailable(family, policyShape, "storage_type");
    default:
      return false;
  }
}

function policyRequirementAvailable(
  family: string,
  policyShape: Wc01V2ConcernPolicyShapeComparison,
  requirement: string,
) {
  return (policyShape.policyInputRequirements[family] ?? []).some(
    (entry) => entry.requirement === requirement && entry.status === "available",
  );
}

function sourcePolicyFieldsForRequirement(family: string, requirement: string) {
  const common: Record<string, string[]> = {
    concern_policy_key: ["proposedConcernPolicyKeys"],
    policy_decision_readiness: ["decisionReadiness"],
    suppression_readiness: ["suppressionReadiness"],
    copy_review_readiness: ["copyReviewReadiness"],
    source_evidence_refs: [`policyInputRequirements.${family}.source_evidence_refs`],
    display_safe_excerpt_refs: [`policyInputRequirements.${family}.display_safe_excerpt_refs`],
    consent_state_context: [`policyInputRequirements.${family}.consent_state_context`],
    confidence_directness: [`policyInputRequirements.${family}.confidence_directness`],
    purpose_basis: [
      `policyInputRequirements.${family}.supporting_purpose_basis`,
      `policyInputRequirements.${family}.diagnostic_exclusions`,
    ],
    evidence_gate_coverage: [`evidenceGateCoverage.${family}`],
    blocked_surfaces: [`policyInputRequirements.${family}.blocked_surfaces`],
    draft_unified_finding_key: ["derivedFixtureUnifiedFindingKey"],
    draft_checklist_row_key: ["derivedFixtureChecklistRowKey"],
  };
  const tracking: Record<string, string[]> = {
    vendor_or_endpoint_context: [`policyInputRequirements.${family}.vendor_endpoint_attribution`],
  };
  const storage: Record<string, string[]> = {
    party_storage_context: [`policyInputRequirements.${family}.party_storage_context`],
    storage_type: [`policyInputRequirements.${family}.storage_type`],
  };
  return common[requirement] ??
    (family === "pre_consent_cookie_storage" ? storage[requirement] : tracking[requirement]) ??
    [];
}

function projectionGateTableForFamily(
  family: string,
  proposedUnifiedFindingKey: string,
  proposedChecklistRowKey: string,
  requirements: Wc01V2ProjectionInputRequirement[],
  blockedReasons: string[],
): Wc01V2ProjectionGateComparison[] {
  const gates = [
    "unified_finding_key_shape",
    "checklist_row_key_shape",
    "evidence_packet_shape",
    "copy_review_gate",
    "suppression_gate",
    "blocked_surface_gate",
  ];

  return gates.map((gate) => ({
    family,
    proposedUnifiedFindingKey,
    proposedChecklistRowKey,
    gate,
    status: blockedReasons.length > 0
      ? "blocked"
      : requirementsForProjectionGate(gate).every((requirement) =>
          requirements.some((entry) => entry.requirement === requirement && entry.status === "available")
        )
        ? "available"
        : "missing",
    notes: ["Fixture-only projection shape comparison. No unified finding or checklist row is created."],
  }));
}

function requirementsForProjectionGate(gate: string) {
  const byGate: Record<string, string[]> = {
    unified_finding_key_shape: ["draft_unified_finding_key", "concern_policy_key"],
    checklist_row_key_shape: ["draft_checklist_row_key", "concern_policy_key"],
    evidence_packet_shape: ["source_evidence_refs", "display_safe_excerpt_refs", "evidence_gate_coverage"],
    copy_review_gate: ["copy_review_readiness"],
    suppression_gate: ["suppression_readiness"],
    blocked_surface_gate: ["blocked_surfaces"],
  };
  return byGate[gate] ?? [];
}

function evidencePacketCoverageForFamily(
  family: string,
  requirements: Wc01V2ProjectionInputRequirement[],
  blockedReasons: string[],
): Wc01V2ProjectionEvidencePacketCoverage[] {
  const packetFields = [
    "sourceEvidenceRefs",
    "displaySafeExcerptRefs",
    "consentStateContext",
    "confidenceDirectness",
    "purposeContext",
    family === "pre_consent_cookie_storage" ? "storageContext" : "vendorEndpointContext",
  ];

  return packetFields.map((packetField) => {
    const sourceRequirements = requirementsForPacketField(family, packetField);
    const covered = sourceRequirements.every((requirement) =>
      requirements.some((entry) => entry.requirement === requirement && entry.status === "available")
    );
    return {
      packetField,
      status: blockedReasons.length > 0 ? "blocked" : covered ? "covered" : "missing",
      sourcePolicyRequirements: sourceRequirements,
    };
  });
}

function requirementsForPacketField(family: string, packetField: string) {
  const byField: Record<string, string[]> = {
    sourceEvidenceRefs: ["source_evidence_refs"],
    displaySafeExcerptRefs: ["display_safe_excerpt_refs"],
    consentStateContext: ["consent_state_context"],
    confidenceDirectness: ["confidence_directness"],
    purposeContext: ["purpose_basis"],
    storageContext: ["party_storage_context", "storage_type"],
    vendorEndpointContext: ["vendor_or_endpoint_context"],
  };
  return byField[packetField] ?? [];
}

function readinessFor(
  stage: "unified_finding" | "checklist_projection" | "evidence_packet",
  blockedReasons: string[],
  comparisons: FamilyProjectionComparison[],
): Wc01V2ProjectionShapeReadiness {
  if (blockedReasons.length > 0) {
    return { status: "blocked", reasons: blockedReasons };
  }
  if (comparisons.length === 0) {
    return { status: "not_ready", reasons: ["No families were available for fixture comparison."] };
  }
  if (stage === "evidence_packet") {
    return {
      status: "fixture_reviewable",
      reasons: ["Evidence packet shape has refs, excerpts, consent context, confidence/directness, and family context."],
    };
  }
  return {
    status: "fixture_reviewable",
    reasons: [`${stage} draft key shape is available for comparison only; no production projection is approved.`],
  };
}

function warningsForComparison(comparisons: FamilyProjectionComparison[]) {
  const warnings = [
    "Projection shape comparison is fixture-only and does not create unified findings.",
    "Checklist row keys are draft strings only.",
  ];
  if (comparisons.some((comparison) => comparison.proposedChecklistRowKey.includes("reviewed_non_sensitive"))) {
    warnings.push("Comparison is limited to non-sensitive draft projection keys; sensitive-context handling remains separate.");
  }
  return warnings;
}

function validateConcernPolicyShape(value: unknown): asserts value is Wc01V2ConcernPolicyShapeComparison {
  if (!isRecord(value)) {
    throw new Error("Wc01V2ConcernPolicyShapeComparison must be an object.");
  }
  if (value.packetVersion !== WC01_V2_CONCERN_POLICY_SHAPE_COMPARISON_VERSION) {
    throw new Error("Unsupported Wc01V2ConcernPolicyShapeComparison version.");
  }
  if (!Array.isArray(value.comparedFamilies)) {
    throw new Error("comparedFamilies must be an array.");
  }
  if (!Array.isArray(value.proposedConcernPolicyKeys)) {
    throw new Error("proposedConcernPolicyKeys must be an array.");
  }
  if (!isRecord(value.policyInputRequirements)) {
    throw new Error("policyInputRequirements must be an object.");
  }
  if (!isRecord(value.missingPolicyInputs)) {
    throw new Error("missingPolicyInputs must be an object.");
  }
  if (!Array.isArray(value.blockedReasons)) {
    throw new Error("blockedReasons must be an array.");
  }
}

function assertProjectionShapeGuardrails(comparison: Wc01V2ProjectionShapeComparison) {
  if (
    comparison.productionEligible !== false ||
    comparison.persistEligible !== false ||
    comparison.concernPolicyCallEligible !== false ||
    comparison.unifiedFindingEligible !== false ||
    comparison.checklistProjectionEligible !== false ||
    comparison.customerFacingEligible !== false ||
    comparison.explicitApprovalRequired !== true
  ) {
    throw new Error("Projection shape comparison must remain closed by default.");
  }
  const serialized = JSON.stringify(comparison);
  if (containsForbiddenGapObservedToken(serialized)) {
    throw new Error("Projection shape comparison contains forbidden status token.");
  }
  if (containsBlockedRawFields(serialized)) {
    throw new Error("Projection shape comparison contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(serialized)) {
    throw new Error("Projection shape comparison contains legal-conclusion language.");
  }
}

function draftUnifiedFindingKeyForFamily(family: string) {
  return `v2.${family}.unified_finding_candidate_draft`;
}

function draftChecklistRowKeyForFamily(family: string) {
  return `v2.${family}.checklist_row_candidate_draft`;
}

function closedDefaultFlags(): Wc01V2ProjectionShapeClosedDefaultFlags {
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

function guardrails(): Wc01V2ProjectionShapeComparison["guardrails"] {
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
