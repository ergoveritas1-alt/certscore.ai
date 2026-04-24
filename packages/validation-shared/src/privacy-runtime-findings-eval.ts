import type {
  PrivacyRuntimeConfidenceBand,
  PrivacyRuntimeExternalSurfacingEligibility,
  PrivacyRuntimeFindingDatasetExample,
  PrivacyRuntimeFindingExpectation,
  PrivacyRuntimePresentationState,
  PrivacyRuntimePromotionEligibility
} from "./privacy-runtime-findings.dataset";
import { PRIVACY_RUNTIME_FINDINGS_DATASET_SEED } from "./privacy-runtime-findings.dataset";

export type PrivacyRuntimeFindingsDatasetEvaluationResult = {
  derived: PrivacyRuntimeFindingExpectation;
  exampleId: string;
  expected: PrivacyRuntimeFindingExpectation;
  isMatch: boolean;
  mismatches: string[];
};

export type PrivacyRuntimeFindingsDatasetEvaluationSummary = {
  evaluatedCount: number;
  mismatchCount: number;
  mismatches: PrivacyRuntimeFindingsDatasetEvaluationResult[];
  overallMatchCount: number;
};

function hasValues(values: unknown[] | undefined) {
  return Array.isArray(values) && values.some((value) => typeof value === "string" && value.trim().length > 0);
}

function hasConcretePreconsentEvidence(example: PrivacyRuntimeFindingDatasetExample) {
  return Boolean(
    example.evidence.sequenceEvidence === true &&
      hasValues(example.evidence.vendors) &&
      hasValues(example.evidence.requestUrls) &&
      example.evidence.consentBannerDetectedMs !== undefined
  );
}

function hasStrongFingerprintingEvidence(example: PrivacyRuntimeFindingDatasetExample) {
  const tier = example.evidence.fingerprintTier ?? 0;
  const attributeCount = example.evidence.attributeCategories?.length ?? 0;
  const corroborated = hasValues(example.evidence.requestUrls) || hasValues(example.evidence.scriptHosts) || hasValues(example.evidence.vendors);
  return tier >= 3 || (tier >= 2 && attributeCount >= 1 && corroborated);
}

function hasVerifiedDarkPatternEvidence(example: PrivacyRuntimeFindingDatasetExample) {
  return Boolean(
    example.evidence.consentSurfaceObserved === true &&
      example.evidence.consentActionableChoiceObserved === true &&
      hasValues(example.evidence.uiFacts) &&
      (hasValues(example.evidence.visualFacts) || hasValues(example.evidence.artifactRefs))
  );
}

function hasCompleteDisclosureConflictEvidence(example: PrivacyRuntimeFindingDatasetExample) {
  const policy = example.evidence.policyAnchor;
  const runtime = example.evidence.runtimeAnchor;
  return Boolean(
    policy &&
      runtime &&
      policy.extractionStatus === "fetched" &&
      policy.confidence >= 0.75 &&
      runtime.confidence >= 0.75 &&
      runtime.phase !== "unknown" &&
      (runtime.vendors?.length || runtime.requestUrls?.length)
  );
}

function makeExpectation(input: {
  confidenceBand: PrivacyRuntimeConfidenceBand;
  externalSurfacingEligibility: PrivacyRuntimeExternalSurfacingEligibility;
  presentationState: PrivacyRuntimePresentationState;
  promotionEligibility: PrivacyRuntimePromotionEligibility;
}): PrivacyRuntimeFindingExpectation {
  return input;
}

export function derivePrivacyRuntimeFindingExpectation(
  example: PrivacyRuntimeFindingDatasetExample
): PrivacyRuntimeFindingExpectation {
  if (example.scenarioType === "negative_control") {
    return makeExpectation({
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    });
  }

  if (example.scenarioType === "borderline_review" || example.scenarioType === "borderline_audit_only") {
    return makeExpectation({
      confidenceBand: "moderate",
      externalSurfacingEligibility: "audit_only",
      presentationState: example.scenarioType === "borderline_audit_only" ? "support_only" : "review",
      promotionEligibility: "internal_only"
    });
  }

  if (example.findingGroup === "preconsent_tracking" && hasConcretePreconsentEvidence(example)) {
    return makeExpectation({
      confidenceBand: "high",
      externalSurfacingEligibility: "eligible",
      presentationState: "confirmed",
      promotionEligibility: "eligible"
    });
  }

  if (example.findingGroup === "fingerprinting" && hasStrongFingerprintingEvidence(example)) {
    return makeExpectation({
      confidenceBand: "high",
      externalSurfacingEligibility: "eligible",
      presentationState: "confirmed",
      promotionEligibility: "eligible"
    });
  }

  if (example.findingGroup === "dark_pattern_consent" && hasVerifiedDarkPatternEvidence(example)) {
    return makeExpectation({
      confidenceBand: "moderate",
      externalSurfacingEligibility: "eligible",
      presentationState: "review",
      promotionEligibility: "eligible"
    });
  }

  if (example.findingGroup === "disclosure_runtime_mismatch" && hasCompleteDisclosureConflictEvidence(example)) {
    return makeExpectation({
      confidenceBand: "high",
      externalSurfacingEligibility: "eligible",
      presentationState: "confirmed",
      promotionEligibility: "eligible"
    });
  }

  return makeExpectation({
    confidenceBand: "moderate",
    externalSurfacingEligibility: "audit_only",
    presentationState: "review",
    promotionEligibility: "internal_only"
  });
}

function compareExpectation(
  derived: PrivacyRuntimeFindingExpectation,
  expected: PrivacyRuntimeFindingExpectation
) {
  const mismatches: string[] = [];

  for (const key of [
    "confidenceBand",
    "externalSurfacingEligibility",
    "presentationState",
    "promotionEligibility"
  ] as const) {
    if (derived[key] !== expected[key]) {
      mismatches.push(`${key}: expected ${expected[key]}, got ${derived[key]}`);
    }
  }

  return mismatches;
}

export function evaluatePrivacyRuntimeFindingsDatasetExample(
  example: PrivacyRuntimeFindingDatasetExample
): PrivacyRuntimeFindingsDatasetEvaluationResult {
  const derived = derivePrivacyRuntimeFindingExpectation(example);
  const mismatches = compareExpectation(derived, example.expected);
  return {
    derived,
    exampleId: example.id,
    expected: example.expected,
    isMatch: mismatches.length === 0,
    mismatches
  };
}

export function evaluatePrivacyRuntimeFindingsDataset(
  examples: PrivacyRuntimeFindingDatasetExample[] = PRIVACY_RUNTIME_FINDINGS_DATASET_SEED
): PrivacyRuntimeFindingsDatasetEvaluationSummary {
  const results = examples.map(evaluatePrivacyRuntimeFindingsDatasetExample);
  const mismatches = results.filter((result) => !result.isMatch);

  return {
    evaluatedCount: results.length,
    mismatchCount: mismatches.length,
    mismatches,
    overallMatchCount: results.length - mismatches.length
  };
}
