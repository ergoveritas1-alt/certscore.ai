const SOURCE_TYPES = ["document_source", "page_evidence", "signal_hit"] as const;
const CLAIM_TYPES = [
  "earnings_claim",
  "return_performance_claim",
  "guaranteed_outcome_claim",
  "simulated_performance_claim",
  "superlative_claim",
  "pricing_fee_claim",
  "urgency_conversion_claim",
  "other",
  "none"
] as const;
const CONTEXT_TYPES = [
  "financial_offer",
  "subscription_offer",
  "pricing_page",
  "checkout_offer",
  "lead_generation_offer",
  "marketing_page",
  "legal_disclosure",
  "other",
  "unknown"
] as const;
const DISCLOSURE_TYPES = [
  "risk_disclosure",
  "earnings_disclaimer",
  "simulation_disclaimer",
  "pricing_terms",
  "fee_schedule",
  "eligibility_or_conditions",
  "other",
  "none"
] as const;

export type FinancialCommercialClaimCandidateInput = {
  adjacentAfter: string | null;
  adjacentBefore: string | null;
  blockHeading: string | null;
  blockText: string;
  candidateSignals: string[];
  pageType: string | null;
  pageUrl: string | null;
  sourceType: (typeof SOURCE_TYPES)[number];
};

export type FinancialCommercialClaimClassification = {
  adjacentDisclosurePresent: boolean;
  adjacentDisclosureText: string | null;
  adjacentDisclosureType: (typeof DISCLOSURE_TYPES)[number] | null;
  claimPresent: boolean;
  claimText: string | null;
  claimType: (typeof CLAIM_TYPES)[number];
  commercialContext: boolean;
  confidence: number;
  contextType: (typeof CONTEXT_TYPES)[number];
  feeDisclosurePresent: boolean;
  guaranteeLanguage: boolean;
  pricingPresent: boolean;
  rationaleShort: string;
  simulatedPerformanceLanguage: boolean;
  superlativeLanguage: boolean;
  urgencyPresent: boolean;
  urgencyTiedToConversion: boolean;
};

type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: Error };

type LegacyClaimsModule = {
  buildFinancialCommercialClaimPrompt: (input: FinancialCommercialClaimCandidateInput) => string;
  financialCommercialClaimCandidateInputSchema: {
    parse: (value: unknown) => FinancialCommercialClaimCandidateInput;
    safeParse: (value: unknown) => SafeParseResult<FinancialCommercialClaimCandidateInput>;
  };
  financialCommercialClaimClassificationSchema: {
    parse: (value: unknown) => FinancialCommercialClaimClassification;
    safeParse: (value: unknown) => SafeParseResult<FinancialCommercialClaimClassification>;
  };
};

const legacy = require("../legacy/financial-commercial-claims.js") as LegacyClaimsModule;

export const financialCommercialClaimCandidateInputSchema = legacy.financialCommercialClaimCandidateInputSchema;
export const financialCommercialClaimClassificationSchema = legacy.financialCommercialClaimClassificationSchema;
export const buildFinancialCommercialClaimPrompt = legacy.buildFinancialCommercialClaimPrompt;

