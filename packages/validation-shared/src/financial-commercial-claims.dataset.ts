import type {
  FinancialCommercialClaimCandidateInput,
  FinancialCommercialClaimClassification
} from "./financial-commercial-claims";

const DATASET_BUCKETS = [
  "positive_high_confidence",
  "positive_borderline",
  "negative_financial",
  "negative_nonfinancial",
  "adversarial_negative"
] as const;

const EMITTABLE_FINDING_IDS = [
  "guaranteed_outcome_claim_detected",
  "earnings_claim_without_adjacent_disclosure",
  "simulated_performance_without_disclosure",
  "unqualified_superlative_claim_detected",
  "financial_urgency_pressure_tactic_detected",
  "pricing_or_fee_transparency_unclear"
] as const;

const CARD_EXPECTATION_MODES = ["findings", "not_applicable", "omit"] as const;

export type FinancialCommercialClaimsDatasetBucket = (typeof DATASET_BUCKETS)[number];
export type FinancialCommercialClaimsEmittableFindingId = (typeof EMITTABLE_FINDING_IDS)[number];
export type FinancialCommercialClaimsCardExpectationMode = (typeof CARD_EXPECTATION_MODES)[number];

export type FinancialCommercialClaimsPageExpectation = {
  expectedFindingIds: FinancialCommercialClaimsEmittableFindingId[];
  expectedCardMode: FinancialCommercialClaimsCardExpectationMode;
  shouldShowFinancialCard: boolean;
};

export type FinancialCommercialClaimsDatasetExample = {
  bucket: FinancialCommercialClaimsDatasetBucket;
  expected: FinancialCommercialClaimClassification;
  id: string;
  input: FinancialCommercialClaimCandidateInput;
  notes: string;
  pageExpectation: FinancialCommercialClaimsPageExpectation;
  sourceUrl?: string;
  split: "train" | "eval";
};

export type FinancialCommercialClaimsDatasetSummary = {
  adversarialNegativeCount: number;
  bucketCounts: Record<FinancialCommercialClaimsDatasetBucket, number>;
  cardModeCounts: Record<FinancialCommercialClaimsCardExpectationMode, number>;
  emittableFindingCounts: Record<FinancialCommercialClaimsEmittableFindingId, number>;
  evalCount: number;
  examplesWithSourceUrlCount: number;
  negativeFinancialCount: number;
  negativeNonfinancialCount: number;
  positiveBorderlineCount: number;
  positiveHighConfidenceCount: number;
  trainCount: number;
};

type LegacyDatasetModule = {
  FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED: FinancialCommercialClaimsDatasetExample[];
  summarizeFinancialCommercialClaimsDataset: (
    examples?: FinancialCommercialClaimsDatasetExample[]
  ) => FinancialCommercialClaimsDatasetSummary;
  toFinancialCommercialClaimsJsonl: () => string;
};

const legacy = require("../legacy/financial-commercial-claims.dataset.js") as LegacyDatasetModule;

export const FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED = legacy.FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED;
export const summarizeFinancialCommercialClaimsDataset = legacy.summarizeFinancialCommercialClaimsDataset;
export const toFinancialCommercialClaimsJsonl = legacy.toFinancialCommercialClaimsJsonl;

