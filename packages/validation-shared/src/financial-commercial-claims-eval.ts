import type {
  FinancialCommercialClaimCandidateInput,
  FinancialCommercialClaimClassification
} from "./financial-commercial-claims";
import type {
  FinancialCommercialClaimsCardExpectationMode,
  FinancialCommercialClaimsDatasetExample,
  FinancialCommercialClaimsEmittableFindingId
} from "./financial-commercial-claims.dataset";

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

type LegacyEvalModule = {
  deriveFinancialCommercialExpectedCardMode: (input: {
    classification: FinancialCommercialClaimClassification;
    findingIds: FinancialCommercialClaimsEmittableFindingId[];
  }) => FinancialCommercialClaimsCardExpectationMode;
  deriveFinancialCommercialExpectedFindingIds: (input: {
    candidate: FinancialCommercialClaimCandidateInput;
    classification: FinancialCommercialClaimClassification;
  }) => FinancialCommercialClaimsEmittableFindingId[];
  evaluateFinancialCommercialClaimsDataset: (
    examples?: FinancialCommercialClaimsDatasetExample[]
  ) => FinancialCommercialClaimsDatasetEvaluationSummary;
  evaluateFinancialCommercialClaimsDatasetExample: (
    example: FinancialCommercialClaimsDatasetExample
  ) => FinancialCommercialClaimsDatasetEvaluationResult;
};

const legacy = require("../legacy/financial-commercial-claims-eval.js") as LegacyEvalModule;

export const deriveFinancialCommercialExpectedFindingIds = legacy.deriveFinancialCommercialExpectedFindingIds;
export const deriveFinancialCommercialExpectedCardMode = legacy.deriveFinancialCommercialExpectedCardMode;
export const evaluateFinancialCommercialClaimsDatasetExample = legacy.evaluateFinancialCommercialClaimsDatasetExample;
export const evaluateFinancialCommercialClaimsDataset = legacy.evaluateFinancialCommercialClaimsDataset;

