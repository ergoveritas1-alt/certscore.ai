import {
  containsBlockedRawFields,
  containsForbiddenGapObservedToken,
} from "./wc01-shadow-output";
import {
  type Wc01V2NormalizedConcernSchemaComparison,
  WC01_V2_NORMALIZED_CONCERN_SCHEMA_COMPARISON_VERSION,
} from "./wc01-v2-normalized-concern-schema-comparison";

export const WC01_V2_CONCERN_POLICY_SHAPE_COMPARISON_VERSION =
  "wc01.v2_concern_policy_shape_comparison.1";

export type Wc01V2ConcernPolicyShapeComparison = {
  packetVersion: typeof WC01_V2_CONCERN_POLICY_SHAPE_COMPARISON_VERSION;
  sourceSchemaComparisonPath: string;
  sourceSchemaComparisonVersion: typeof WC01_V2_NORMALIZED_CONCERN_SCHEMA_COMPARISON_VERSION;
  comparedFamilies: string[];
  proposedConcernPolicyKeys: string[];
  policyInputRequirements: Record<string, Wc01V2ConcernPolicyInputRequirement[]>;
  missingPolicyInputs: Record<string, string[]>;
  policyGateTable: Wc01V2ConcernPolicyGateComparison[];
  evidenceGateCoverage: Record<string, Wc01V2ConcernPolicyEvidenceGateCoverage[]>;
  decisionReadiness: Wc01V2ConcernPolicyShapeReadiness;
  suppressionReadiness: Wc01V2ConcernPolicyShapeReadiness;
  copyReviewReadiness: Wc01V2ConcernPolicyShapeReadiness;
  blockedReasons: string[];
  warnings: string[];
  recommendation:
    | "concern_policy_shape_reviewable_fixture_only"
    | "blocked_needs_schema_or_policy_shape_revision"
    | "blocked_guardrail";
  closedDefaultFlags: Wc01V2ConcernPolicyShapeClosedDefaultFlags;
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

export type Wc01V2ConcernPolicyInputRequirement = {
  requirement: string;
  sourceSchemaFields: string[];
  status: "available" | "missing" | "blocked";
};

export type Wc01V2ConcernPolicyGateComparison = {
  family: string;
  proposedConcernPolicyKey: string;
  gate: string;
  status: "available" | "missing" | "blocked" | "draft_only";
  notes: string[];
};

export type Wc01V2ConcernPolicyEvidenceGateCoverage = {
  gate: string;
  status: "covered" | "missing" | "blocked";
  sourceRequirements: string[];
};

export type Wc01V2ConcernPolicyShapeReadiness = {
  status: "fixture_reviewable" | "blocked" | "not_ready";
  reasons: string[];
};

export type Wc01V2ConcernPolicyShapeClosedDefaultFlags = {
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

const COMMON_POLICY_REQUIREMENTS = [
  "policy_key",
  "normalized_concern_type",
  "source_evidence_refs",
  "display_safe_excerpt_refs",
  "consent_state_context",
  "confidence_directness",
  "supporting_purpose_basis",
  "diagnostic_exclusions",
  "unresolved_ref_disposition",
  "rollback_suppression_hints",
  "blocked_surfaces",
];

const TRACKING_POLICY_REQUIREMENTS = [
  ...COMMON_POLICY_REQUIREMENTS,
  "vendor_endpoint_attribution",
];

const COOKIE_STORAGE_POLICY_REQUIREMENTS = [
  ...COMMON_POLICY_REQUIREMENTS,
  "party_storage_context",
  "storage_type",
  "unsafe_storage_content_exclusion",
];

export function parseWc01V2NormalizedConcernSchemaComparisonForPolicyShapeJson(
  raw: string,
): Wc01V2NormalizedConcernSchemaComparison {
  if (containsForbiddenGapObservedToken(raw)) {
    throw new Error("Wc01V2NormalizedConcernSchemaComparison contains forbidden status token.");
  }
  if (containsBlockedRawFields(raw)) {
    throw new Error("Wc01V2NormalizedConcernSchemaComparison contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(raw)) {
    throw new Error("Wc01V2NormalizedConcernSchemaComparison contains legal-conclusion language.");
  }

  const parsed = JSON.parse(raw) as unknown;
  validateSchemaComparisonShape(parsed);
  return parsed;
}

export function buildWc01V2ConcernPolicyShapeComparison(
  schemaComparison: Wc01V2NormalizedConcernSchemaComparison,
  sourceSchemaComparisonPath: string,
): Wc01V2ConcernPolicyShapeComparison {
  validateSchemaComparisonShape(schemaComparison);

  const familyComparisons = schemaComparison.comparedFamilies.map((family) =>
    comparePolicyFamily(family, schemaComparison)
  );
  const blockedReasons = uniqueStrings([
    ...rootBlockedReasons(schemaComparison),
    ...familyComparisons.flatMap((comparison) =>
      comparison.blockedReasons.map((reason) => `${comparison.family}:${reason}`)
    ),
  ]);
  const comparison: Wc01V2ConcernPolicyShapeComparison = {
    packetVersion: WC01_V2_CONCERN_POLICY_SHAPE_COMPARISON_VERSION,
    sourceSchemaComparisonPath,
    sourceSchemaComparisonVersion: schemaComparison.packetVersion,
    comparedFamilies: schemaComparison.comparedFamilies,
    proposedConcernPolicyKeys: schemaComparison.proposedConcernPolicyKeys,
    policyInputRequirements: Object.fromEntries(
      familyComparisons.map((comparison) => [comparison.family, comparison.requirements]),
    ),
    missingPolicyInputs: Object.fromEntries(
      familyComparisons.map((comparison) => [comparison.family, comparison.missingRequirements]),
    ),
    policyGateTable: familyComparisons.flatMap((comparison) => comparison.policyGateTable),
    evidenceGateCoverage: Object.fromEntries(
      familyComparisons.map((comparison) => [comparison.family, comparison.evidenceGateCoverage]),
    ),
    decisionReadiness: readinessFor("decision", blockedReasons, familyComparisons),
    suppressionReadiness: readinessFor("suppression", blockedReasons, familyComparisons),
    copyReviewReadiness: readinessFor("copy_review", blockedReasons, familyComparisons),
    blockedReasons,
    warnings: warningsForComparison(familyComparisons),
    recommendation: blockedReasons.length > 0
      ? "blocked_needs_schema_or_policy_shape_revision"
      : "concern_policy_shape_reviewable_fixture_only",
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

  assertConcernPolicyShapeGuardrails(comparison);
  return comparison;
}

export function buildWc01V2ConcernPolicyShapeComparisonJson(
  raw: string,
  sourceSchemaComparisonPath: string,
) {
  return buildWc01V2ConcernPolicyShapeComparison(
    parseWc01V2NormalizedConcernSchemaComparisonForPolicyShapeJson(raw),
    sourceSchemaComparisonPath,
  );
}

type FamilyPolicyComparison = {
  family: string;
  proposedConcernPolicyKey: string;
  requirements: Wc01V2ConcernPolicyInputRequirement[];
  missingRequirements: string[];
  blockedReasons: string[];
  policyGateTable: Wc01V2ConcernPolicyGateComparison[];
  evidenceGateCoverage: Wc01V2ConcernPolicyEvidenceGateCoverage[];
};

function comparePolicyFamily(
  family: string,
  schemaComparison: Wc01V2NormalizedConcernSchemaComparison,
): FamilyPolicyComparison {
  const requirements = requirementsForFamily(family).map((requirement) => {
    const covered = requirementCovered(family, requirement, schemaComparison);
    return {
      requirement,
      sourceSchemaFields: sourceSchemaFieldsForRequirement(family, requirement),
      status: covered ? "available" as const : "missing" as const,
    };
  });
  const missingRequirements = requirements
    .filter((requirement) => requirement.status !== "available")
    .map((requirement) => requirement.requirement);
  const proposedConcernPolicyKey = proposedPolicyKeyForFamily(family, schemaComparison);
  const blockedReasons = failClosedReasonsForFamilyPolicyShape(family, schemaComparison);

  return {
    family,
    proposedConcernPolicyKey,
    requirements,
    missingRequirements,
    blockedReasons,
    policyGateTable: policyGateTableForFamily(family, proposedConcernPolicyKey, requirements, blockedReasons),
    evidenceGateCoverage: evidenceGateCoverageForFamily(family, requirements, blockedReasons),
  };
}

export function failClosedReasonsForFamilyPolicyShape(
  family: string,
  schemaComparison: Wc01V2NormalizedConcernSchemaComparison,
) {
  const reasons: string[] = [];
  const policyKey = proposedPolicyKeyForFamily(family, schemaComparison);
  if (!policyKey) {
    reasons.push("proposed_concern_policy_key_missing");
  }
  if (!schemaComparison.proposedNormalizedConcernTypes.some((type) => type.includes(family))) {
    reasons.push("proposed_normalized_concern_type_missing");
  }
  if ((schemaComparison.missingFields[family] ?? []).length > 0) {
    reasons.push("schema_missing_required_fields");
  }
  if (schemaComparison.blockedReasons.length > 0) {
    reasons.push("source_schema_has_blocked_reasons");
  }
  for (const requirement of requirementsForFamily(family)) {
    if (!requirementCovered(family, requirement, schemaComparison)) {
      reasons.push(`policy_input_missing:${requirement}`);
    }
  }
  return uniqueStrings(reasons);
}

function rootBlockedReasons(schemaComparison: Wc01V2NormalizedConcernSchemaComparison) {
  const reasons: string[] = [];
  if (schemaComparison.productionEligible !== false) {
    reasons.push("schema_attempts_production_eligibility");
  }
  if (schemaComparison.persistEligible !== false) {
    reasons.push("schema_attempts_persistence");
  }
  if (schemaComparison.concernPolicyCallEligible !== false) {
    reasons.push("schema_attempts_concern_policy_call");
  }
  if (schemaComparison.unifiedFindingEligible !== false) {
    reasons.push("schema_attempts_unified_finding");
  }
  if (schemaComparison.checklistProjectionEligible !== false) {
    reasons.push("schema_attempts_checklist_projection");
  }
  if (schemaComparison.customerFacingEligible !== false) {
    reasons.push("schema_attempts_customer_facing_eligibility");
  }
  if (schemaComparison.explicitApprovalRequired !== true) {
    reasons.push("schema_attempts_to_skip_explicit_approval");
  }
  if (schemaComparison.recommendation !== "schema_shape_reviewable_fixture_only") {
    reasons.push("schema_not_reviewable_fixture_only");
  }
  return uniqueStrings(reasons);
}

function requirementsForFamily(family: string) {
  if (family === "pre_consent_cookie_storage") {
    return COOKIE_STORAGE_POLICY_REQUIREMENTS;
  }
  return TRACKING_POLICY_REQUIREMENTS;
}

function requirementCovered(
  family: string,
  requirement: string,
  schemaComparison: Wc01V2NormalizedConcernSchemaComparison,
) {
  switch (requirement) {
    case "policy_key":
      return Boolean(proposedPolicyKeyForFamily(family, schemaComparison));
    case "normalized_concern_type":
      return schemaComparison.proposedNormalizedConcernTypes.some((type) => type.includes(family));
    case "source_evidence_refs":
      return fieldPresent(family, schemaComparison, "source_evidence_refs");
    case "display_safe_excerpt_refs":
      return fieldPresent(family, schemaComparison, "display_safe_excerpt_refs");
    case "consent_state_context":
      return fieldPresent(family, schemaComparison, "consent_state_context");
    case "confidence_directness":
      return fieldPresent(family, schemaComparison, "confidence_directness");
    case "supporting_purpose_basis":
      return fieldPresent(family, schemaComparison, "purpose_basis") ||
        fieldPresent(family, schemaComparison, "purpose_exclusions");
    case "diagnostic_exclusions":
      return fieldPresent(family, schemaComparison, "exclusions_applied") ||
        fieldPresent(family, schemaComparison, "purpose_exclusions");
    case "unresolved_ref_disposition":
      return fieldPresent(family, schemaComparison, "unresolved_ref_disposition");
    case "rollback_suppression_hints":
      return fieldPresent(family, schemaComparison, "rollback_suppression_hints");
    case "blocked_surfaces":
      return fieldPresent(family, schemaComparison, "blocked_surfaces");
    case "vendor_endpoint_attribution":
      return fieldPresent(family, schemaComparison, "vendor_endpoint_attribution");
    case "party_storage_context":
      return fieldPresent(family, schemaComparison, "party_storage_context");
    case "storage_type":
      return fieldPresent(family, schemaComparison, "storage_type");
    case "unsafe_storage_content_exclusion":
      return fieldPresent(family, schemaComparison, "purpose_exclusions");
    default:
      return false;
  }
}

function fieldPresent(
  family: string,
  schemaComparison: Wc01V2NormalizedConcernSchemaComparison,
  field: string,
) {
  return (schemaComparison.requiredFieldsPresent[family] ?? []).includes(field);
}

function proposedPolicyKeyForFamily(
  family: string,
  schemaComparison: Wc01V2NormalizedConcernSchemaComparison,
) {
  return schemaComparison.proposedConcernPolicyKeys.find((key) => key.includes(family)) ?? "";
}

function sourceSchemaFieldsForRequirement(family: string, requirement: string) {
  const common: Record<string, string[]> = {
    policy_key: ["proposedConcernPolicyKeys"],
    normalized_concern_type: ["proposedNormalizedConcernTypes"],
    source_evidence_refs: [`requiredFieldsPresent.${family}.source_evidence_refs`],
    display_safe_excerpt_refs: [`requiredFieldsPresent.${family}.display_safe_excerpt_refs`],
    consent_state_context: [`requiredFieldsPresent.${family}.consent_state_context`],
    confidence_directness: [`requiredFieldsPresent.${family}.confidence_directness`],
    supporting_purpose_basis: [`requiredFieldsPresent.${family}.purpose_basis`],
    diagnostic_exclusions: [`requiredFieldsPresent.${family}.exclusions_applied`],
    unresolved_ref_disposition: [`requiredFieldsPresent.${family}.unresolved_ref_disposition`],
    rollback_suppression_hints: [`requiredFieldsPresent.${family}.rollback_suppression_hints`],
    blocked_surfaces: [`requiredFieldsPresent.${family}.blocked_surfaces`],
  };
  const tracking: Record<string, string[]> = {
    vendor_endpoint_attribution: [`requiredFieldsPresent.${family}.vendor_endpoint_attribution`],
  };
  const storage: Record<string, string[]> = {
    party_storage_context: [`requiredFieldsPresent.${family}.party_storage_context`],
    storage_type: [`requiredFieldsPresent.${family}.storage_type`],
    unsafe_storage_content_exclusion: [`requiredFieldsPresent.${family}.purpose_exclusions`],
    supporting_purpose_basis: [`requiredFieldsPresent.${family}.purpose_exclusions`],
    diagnostic_exclusions: [`requiredFieldsPresent.${family}.purpose_exclusions`],
  };
  return common[requirement] ??
    (family === "pre_consent_cookie_storage" ? storage[requirement] : tracking[requirement]) ??
    [];
}

function policyGateTableForFamily(
  family: string,
  proposedConcernPolicyKey: string,
  requirements: Wc01V2ConcernPolicyInputRequirement[],
  blockedReasons: string[],
): Wc01V2ConcernPolicyGateComparison[] {
  const baseGates = [
    "policy_key_routing",
    "evidence_refs_present",
    "display_safe_excerpts_present",
    "consent_state_gate",
    "confidence_directness_gate",
    "purpose_exclusion_gate",
    "unresolved_ref_gate",
    "suppression_gate",
  ];
  const gates = family === "pre_consent_cookie_storage"
    ? [...baseGates, "storage_context_gate"]
    : [...baseGates, "vendor_attribution_gate"];

  return gates.map((gate) => ({
    family,
    proposedConcernPolicyKey,
    gate,
    status: blockedReasons.length > 0
      ? "blocked"
      : requirementsForGate(gate).every((requirement) =>
          requirements.some((entry) => entry.requirement === requirement && entry.status === "available")
        )
        ? "available"
        : "missing",
    notes: ["Fixture-only gate comparison. Production concern policy is not called."],
  }));
}

function requirementsForGate(gate: string) {
  const byGate: Record<string, string[]> = {
    policy_key_routing: ["policy_key", "normalized_concern_type"],
    evidence_refs_present: ["source_evidence_refs"],
    display_safe_excerpts_present: ["display_safe_excerpt_refs"],
    consent_state_gate: ["consent_state_context"],
    confidence_directness_gate: ["confidence_directness"],
    purpose_exclusion_gate: ["supporting_purpose_basis", "diagnostic_exclusions"],
    unresolved_ref_gate: ["unresolved_ref_disposition"],
    suppression_gate: ["rollback_suppression_hints", "blocked_surfaces"],
    storage_context_gate: ["party_storage_context", "storage_type", "unsafe_storage_content_exclusion"],
    vendor_attribution_gate: ["vendor_endpoint_attribution"],
  };
  return byGate[gate] ?? [];
}

function evidenceGateCoverageForFamily(
  family: string,
  requirements: Wc01V2ConcernPolicyInputRequirement[],
  blockedReasons: string[],
): Wc01V2ConcernPolicyEvidenceGateCoverage[] {
  return [
    "runtime_evidence",
    "display_safe_evidence",
    "consent_state",
    "purpose_basis",
    "confidence_directness",
    "suppression",
  ].map((gate) => {
    const sourceRequirements = requirementsForEvidenceGate(family, gate);
    const covered = sourceRequirements.every((requirement) =>
      requirements.some((entry) => entry.requirement === requirement && entry.status === "available")
    );
    return {
      gate,
      status: blockedReasons.length > 0 ? "blocked" : covered ? "covered" : "missing",
      sourceRequirements,
    };
  });
}

function requirementsForEvidenceGate(family: string, gate: string) {
  const byGate: Record<string, string[]> = {
    runtime_evidence: family === "pre_consent_cookie_storage"
      ? ["source_evidence_refs", "party_storage_context", "storage_type"]
      : ["source_evidence_refs", "vendor_endpoint_attribution"],
    display_safe_evidence: ["display_safe_excerpt_refs"],
    consent_state: ["consent_state_context"],
    purpose_basis: ["supporting_purpose_basis", "diagnostic_exclusions"],
    confidence_directness: ["confidence_directness"],
    suppression: ["rollback_suppression_hints", "blocked_surfaces"],
  };
  return byGate[gate] ?? [];
}

function readinessFor(
  stage: "decision" | "suppression" | "copy_review",
  blockedReasons: string[],
  comparisons: FamilyPolicyComparison[],
): Wc01V2ConcernPolicyShapeReadiness {
  if (blockedReasons.length > 0) {
    return { status: "blocked", reasons: blockedReasons };
  }
  if (comparisons.length === 0) {
    return { status: "not_ready", reasons: ["No families were available for fixture comparison."] };
  }
  if (stage === "suppression") {
    return {
      status: "fixture_reviewable",
      reasons: ["Rollback/suppression hints and blocked surfaces are available for fixture-only policy shape review."],
    };
  }
  if (stage === "copy_review") {
    return {
      status: "fixture_reviewable",
      reasons: ["Policy keys are reviewable as internal draft routing metadata; no customer-facing copy is emitted."],
    };
  }
  return {
    status: "fixture_reviewable",
    reasons: ["Policy input shape has the required fixture evidence gates for internal review."],
  };
}

function warningsForComparison(comparisons: FamilyPolicyComparison[]) {
  const warnings = [
    "Concern-policy shape comparison is fixture-only and does not call production concern policy.",
    "Policy keys are draft routing strings only.",
  ];
  if (comparisons.some((comparison) => comparison.proposedConcernPolicyKey.includes("reviewed_non_sensitive"))) {
    warnings.push("Comparison is limited to non-sensitive draft keys; sensitive-context handling remains separate.");
  }
  return warnings;
}

function validateSchemaComparisonShape(value: unknown): asserts value is Wc01V2NormalizedConcernSchemaComparison {
  if (!isRecord(value)) {
    throw new Error("Wc01V2NormalizedConcernSchemaComparison must be an object.");
  }
  if (value.packetVersion !== WC01_V2_NORMALIZED_CONCERN_SCHEMA_COMPARISON_VERSION) {
    throw new Error("Unsupported Wc01V2NormalizedConcernSchemaComparison version.");
  }
  if (!Array.isArray(value.comparedFamilies)) {
    throw new Error("comparedFamilies must be an array.");
  }
  if (!Array.isArray(value.proposedConcernPolicyKeys)) {
    throw new Error("proposedConcernPolicyKeys must be an array.");
  }
  if (!isRecord(value.requiredFieldsPresent)) {
    throw new Error("requiredFieldsPresent must be an object.");
  }
  if (!isRecord(value.missingFields)) {
    throw new Error("missingFields must be an object.");
  }
  if (!Array.isArray(value.blockedReasons)) {
    throw new Error("blockedReasons must be an array.");
  }
}

function assertConcernPolicyShapeGuardrails(comparison: Wc01V2ConcernPolicyShapeComparison) {
  if (
    comparison.productionEligible !== false ||
    comparison.persistEligible !== false ||
    comparison.concernPolicyCallEligible !== false ||
    comparison.unifiedFindingEligible !== false ||
    comparison.checklistProjectionEligible !== false ||
    comparison.customerFacingEligible !== false ||
    comparison.explicitApprovalRequired !== true
  ) {
    throw new Error("Concern-policy shape comparison must remain closed by default.");
  }
  const serialized = JSON.stringify(comparison);
  if (containsForbiddenGapObservedToken(serialized)) {
    throw new Error("Concern-policy shape comparison contains forbidden status token.");
  }
  if (containsBlockedRawFields(serialized)) {
    throw new Error("Concern-policy shape comparison contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(serialized)) {
    throw new Error("Concern-policy shape comparison contains legal-conclusion language.");
  }
}

function closedDefaultFlags(): Wc01V2ConcernPolicyShapeClosedDefaultFlags {
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

function guardrails(): Wc01V2ConcernPolicyShapeComparison["guardrails"] {
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
