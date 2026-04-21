import type {
  FinancialCommercialClaimCandidateInput,
  FinancialCommercialClaimClassification
} from "./financial-commercial-claims";
import type {
  FinancialCommercialClaimsCardExpectationMode,
  FinancialCommercialClaimsDatasetExample,
  FinancialCommercialClaimsEmittableFindingId
} from "./financial-commercial-claims.dataset";
import { FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED } from "./financial-commercial-claims.dataset";

const FINANCIAL_COMMERCIAL_CLAIM_MIN_CONFIDENCE = 0.78;
const FINANCIAL_COMMERCIAL_STRONG_SIGNAL_MIN_CONFIDENCE = 0.72;

function isEarningsLikeFinancialClaim(input: {
  blockText: string;
  claimText: string | null;
  claimType: string;
}) {
  if (input.claimType === "earnings_claim") {
    return true;
  }

  if (input.claimType !== "return_performance_claim") {
    return false;
  }

  const normalized = `${input.claimText ?? ""} ${input.blockText}`.toLowerCase();
  return /\b(earn|earnings|income|profit|profitable|payout|make money|learn\s*&?\s*profit)\b/.test(normalized);
}

function hasStrongFinancialCommercialSignalMix(input: {
  blockText: string;
  candidateSignals: string[];
  claimPresent: boolean;
  claimText: string | null;
  claimType: string;
}) {
  if (!input.claimPresent) {
    return false;
  }

  const signalSet = new Set(input.candidateSignals);
  if (!signalSet.has("investment_context")) {
    return false;
  }

  const earningsLikeClaim = isEarningsLikeFinancialClaim({
    blockText: input.blockText,
    claimText: input.claimText,
    claimType: input.claimType
  });

  return (
    earningsLikeClaim ||
    signalSet.has("returns") ||
    signalSet.has("earnings") ||
    signalSet.has("results_social_proof")
  );
}

function meetsFinancialCommercialBaseConfidenceThreshold(input: {
  blockText: string;
  candidateSignals: string[];
  claimPresent: boolean;
  claimText: string | null;
  claimType: string;
  confidence: number;
}) {
  if (input.confidence >= FINANCIAL_COMMERCIAL_CLAIM_MIN_CONFIDENCE) {
    return true;
  }

  return (
    input.confidence >= FINANCIAL_COMMERCIAL_STRONG_SIGNAL_MIN_CONFIDENCE &&
    hasStrongFinancialCommercialSignalMix(input)
  );
}

export function deriveFinancialCommercialExpectedFindingIds(input: {
  candidate: FinancialCommercialClaimCandidateInput;
  classification: FinancialCommercialClaimClassification;
}): FinancialCommercialClaimsEmittableFindingId[] {
  const { candidate, classification } = input;
  if (
    !classification.commercialContext ||
    !classification.claimPresent ||
    !meetsFinancialCommercialBaseConfidenceThreshold({
      blockText: candidate.blockText,
      candidateSignals: candidate.candidateSignals,
      claimPresent: classification.claimPresent,
      claimText: classification.claimText,
      claimType: classification.claimType,
      confidence: classification.confidence
    })
  ) {
    return [];
  }

  const findingIds = new Set<FinancialCommercialClaimsEmittableFindingId>();

  if (classification.guaranteeLanguage || classification.claimType === "guaranteed_outcome_claim") {
    findingIds.add("guaranteed_outcome_claim_detected");
  }

  if (
    isEarningsLikeFinancialClaim({
      blockText: candidate.blockText,
      claimText: classification.claimText,
      claimType: classification.claimType
    }) &&
    !classification.adjacentDisclosurePresent
  ) {
    findingIds.add("earnings_claim_without_adjacent_disclosure");
  }

  if (
    (classification.simulatedPerformanceLanguage || classification.claimType === "simulated_performance_claim") &&
    !classification.adjacentDisclosurePresent
  ) {
    findingIds.add("simulated_performance_without_disclosure");
  }

  if (
    classification.superlativeLanguage &&
    classification.confidence >= FINANCIAL_COMMERCIAL_STRONG_SIGNAL_MIN_CONFIDENCE
  ) {
    findingIds.add("unqualified_superlative_claim_detected");
  }

  if (classification.urgencyPresent && classification.urgencyTiedToConversion) {
    findingIds.add("financial_urgency_pressure_tactic_detected");
  }

  if (
    classification.pricingPresent &&
    !classification.feeDisclosurePresent &&
    classification.confidence >= FINANCIAL_COMMERCIAL_STRONG_SIGNAL_MIN_CONFIDENCE
  ) {
    findingIds.add("pricing_or_fee_transparency_unclear");
  }

  return [...findingIds];
}

export function deriveFinancialCommercialExpectedCardMode(input: {
  classification: FinancialCommercialClaimClassification;
  findingIds: FinancialCommercialClaimsEmittableFindingId[];
}): FinancialCommercialClaimsCardExpectationMode {
  if (input.findingIds.length > 0) {
    return "findings";
  }

  return input.classification.commercialContext ? "not_applicable" : "omit";
}

export type FinancialCommercialClaimsDatasetEvaluationResult = {
  derivedCardMode: FinancialCommercialClaimsCardExpectationMode;
  derivedFindingIds: FinancialCommercialClaimsEmittableFindingId[];
  exampleId: string;
  findingIdsMatch: boolean;
  isMatch: boolean;
  shouldShowCardMatch: boolean;
};

export type FinancialCommercialClaimsDatasetEvaluationSummary = {
  cardModeMatchCount: number;
  evaluatedCount: number;
  findingIdsMatchCount: number;
  mismatches: FinancialCommercialClaimsDatasetEvaluationResult[];
  overallMatchCount: number;
  shouldShowCardMatchCount: number;
};

export function evaluateFinancialCommercialClaimsDatasetExample(
  example: FinancialCommercialClaimsDatasetExample
): FinancialCommercialClaimsDatasetEvaluationResult {
  const derivedFindingIds = deriveFinancialCommercialExpectedFindingIds({
    candidate: example.input,
    classification: example.expected
  }).sort();
  const expectedFindingIds = [...example.pageExpectation.expectedFindingIds].sort();
  const derivedCardMode = deriveFinancialCommercialExpectedCardMode({
    classification: example.expected,
    findingIds: derivedFindingIds
  });
  const expectedShouldShowCard = example.pageExpectation.shouldShowFinancialCard;
  const derivedShouldShowCard = derivedCardMode !== "omit";

  const findingIdsMatch = JSON.stringify(derivedFindingIds) === JSON.stringify(expectedFindingIds);
  const cardModeMatch = derivedCardMode === example.pageExpectation.expectedCardMode;
  const shouldShowCardMatch = derivedShouldShowCard === expectedShouldShowCard;

  return {
    derivedCardMode,
    derivedFindingIds,
    exampleId: example.id,
    findingIdsMatch,
    isMatch: findingIdsMatch && cardModeMatch && shouldShowCardMatch,
    shouldShowCardMatch
  };
}

export function evaluateFinancialCommercialClaimsDataset(
  examples: FinancialCommercialClaimsDatasetExample[] = FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED
): FinancialCommercialClaimsDatasetEvaluationSummary {
  const results = examples.map(evaluateFinancialCommercialClaimsDatasetExample);
  const mismatches = results.filter((result) => !result.isMatch);
  const cardModeMatchCount = results.filter(
    (result, index) => result.derivedCardMode === examples[index]?.pageExpectation.expectedCardMode
  ).length;

  return {
    cardModeMatchCount,
    evaluatedCount: results.length,
    findingIdsMatchCount: results.filter((result) => result.findingIdsMatch).length,
    mismatches,
    overallMatchCount: results.filter((result) => result.isMatch).length,
    shouldShowCardMatchCount: results.filter((result) => result.shouldShowCardMatch).length
  };
}
