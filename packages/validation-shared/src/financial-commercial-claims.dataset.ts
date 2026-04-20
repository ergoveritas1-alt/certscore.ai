import {
  type FinancialCommercialClaimCandidateInput,
  type FinancialCommercialClaimClassification,
  financialCommercialClaimCandidateInputSchema,
  financialCommercialClaimClassificationSchema
} from "./financial-commercial-claims";

export type FinancialCommercialClaimsDatasetExample = {
  expected: FinancialCommercialClaimClassification;
  id: string;
  input: FinancialCommercialClaimCandidateInput;
  notes: string;
  split: "train" | "eval";
};

function example(
  entry: FinancialCommercialClaimsDatasetExample
): FinancialCommercialClaimsDatasetExample {
  return {
    ...entry,
    expected: financialCommercialClaimClassificationSchema.parse(entry.expected),
    input: financialCommercialClaimCandidateInputSchema.parse(entry.input)
  };
}

export const FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED: FinancialCommercialClaimsDatasetExample[] = [
  example({
    id: "earnings-claim-no-disclosure",
    split: "train",
    notes: "Direct earnings claim near a signup CTA without balancing language.",
    input: {
      adjacentAfter: "Join now and start today.",
      adjacentBefore: "Creator Accelerator",
      blockHeading: "Monetize faster",
      blockText: "Earn up to $5,000 per month with our creator system.",
      candidateSignals: ["earnings", "currency", "cta"],
      pageType: "marketing_page",
      pageUrl: "https://example.com/creator",
      sourceType: "document_source"
    },
    expected: {
      claimPresent: true,
      claimType: "earnings_claim",
      claimText: "Earn up to $5,000 per month",
      commercialContext: true,
      contextType: "subscription_offer",
      adjacentDisclosurePresent: false,
      adjacentDisclosureType: null,
      adjacentDisclosureText: null,
      guaranteeLanguage: false,
      superlativeLanguage: false,
      simulatedPerformanceLanguage: false,
      urgencyPresent: false,
      urgencyTiedToConversion: false,
      pricingPresent: false,
      feeDisclosurePresent: false,
      confidence: 0.93,
      rationaleShort: "Direct earnings claim near a commercial offer without nearby balancing disclosure."
    }
  }),
  example({
    id: "guaranteed-outcome-claim",
    split: "train",
    notes: "Guarantee language tied to a financial service offer.",
    input: {
      adjacentAfter: "Open your account now.",
      adjacentBefore: null,
      blockHeading: "Forex Signals",
      blockText: "Guaranteed weekly payouts with our elite trading signals.",
      candidateSignals: ["guarantee", "earnings", "cta"],
      pageType: "lead_generation_offer",
      pageUrl: "https://example.com/signals",
      sourceType: "signal_hit"
    },
    expected: {
      claimPresent: true,
      claimType: "guaranteed_outcome_claim",
      claimText: "Guaranteed weekly payouts",
      commercialContext: true,
      contextType: "financial_offer",
      adjacentDisclosurePresent: false,
      adjacentDisclosureType: null,
      adjacentDisclosureText: null,
      guaranteeLanguage: true,
      superlativeLanguage: false,
      simulatedPerformanceLanguage: false,
      urgencyPresent: false,
      urgencyTiedToConversion: false,
      pricingPresent: false,
      feeDisclosurePresent: false,
      confidence: 0.95,
      rationaleShort: "Guarantee-style payout language appears in a financial offer context."
    }
  }),
  example({
    id: "simulated-performance-no-disclaimer",
    split: "train",
    notes: "Backtested return claim with no simulation disclosure nearby.",
    input: {
      adjacentAfter: "Get access now.",
      adjacentBefore: "Quant strategy results",
      blockHeading: "Backtested performance",
      blockText: "Our strategy delivered 32% annual returns over the last five years.",
      candidateSignals: ["returns", "percentage", "simulated"],
      pageType: "marketing_page",
      pageUrl: "https://example.com/quant",
      sourceType: "page_evidence"
    },
    expected: {
      claimPresent: true,
      claimType: "simulated_performance_claim",
      claimText: "delivered 32% annual returns over the last five years",
      commercialContext: true,
      contextType: "financial_offer",
      adjacentDisclosurePresent: false,
      adjacentDisclosureType: null,
      adjacentDisclosureText: null,
      guaranteeLanguage: false,
      superlativeLanguage: false,
      simulatedPerformanceLanguage: true,
      urgencyPresent: false,
      urgencyTiedToConversion: false,
      pricingPresent: false,
      feeDisclosurePresent: false,
      confidence: 0.88,
      rationaleShort: "Performance language appears simulated or backtested without nearby disclaimer text."
    }
  }),
  example({
    id: "superlative-and-urgency",
    split: "train",
    notes: "Superlative claim paired with urgency and conversion CTA.",
    input: {
      adjacentAfter: "Only 3 spots left. Subscribe now.",
      adjacentBefore: "Premium alerts",
      blockHeading: "Top ranked system",
      blockText: "The best-performing trading bot in the market.",
      candidateSignals: ["superlative", "urgency", "cta"],
      pageType: "pricing_page",
      pageUrl: "https://example.com/bot",
      sourceType: "document_source"
    },
    expected: {
      claimPresent: true,
      claimType: "superlative_claim",
      claimText: "The best-performing trading bot in the market",
      commercialContext: true,
      contextType: "pricing_page",
      adjacentDisclosurePresent: false,
      adjacentDisclosureType: null,
      adjacentDisclosureText: null,
      guaranteeLanguage: false,
      superlativeLanguage: true,
      simulatedPerformanceLanguage: false,
      urgencyPresent: true,
      urgencyTiedToConversion: true,
      pricingPresent: false,
      feeDisclosurePresent: false,
      confidence: 0.86,
      rationaleShort: "Unqualified superlative language appears with conversion-oriented urgency."
    }
  }),
  example({
    id: "pricing-cta-no-fee-detail",
    split: "train",
    notes: "Commercial CTA with weak price/fee visibility.",
    input: {
      adjacentAfter: "Start now",
      adjacentBefore: "Premium access",
      blockHeading: "Go Pro",
      blockText: "Unlock our premium investor dashboard today.",
      candidateSignals: ["pricing_cta", "cta"],
      pageType: "pricing_page",
      pageUrl: "https://example.com/pro",
      sourceType: "page_evidence"
    },
    expected: {
      claimPresent: true,
      claimType: "pricing_fee_claim",
      claimText: "Unlock our premium investor dashboard today.",
      commercialContext: true,
      contextType: "pricing_page",
      adjacentDisclosurePresent: false,
      adjacentDisclosureType: null,
      adjacentDisclosureText: null,
      guaranteeLanguage: false,
      superlativeLanguage: false,
      simulatedPerformanceLanguage: false,
      urgencyPresent: false,
      urgencyTiedToConversion: false,
      pricingPresent: false,
      feeDisclosurePresent: false,
      confidence: 0.78,
      rationaleShort: "Commercial upgrade CTA appears without clear nearby pricing or fee detail."
    }
  }),
  example({
    id: "staking-apy-with-disclosure",
    split: "eval",
    notes: "Positive control: APY language with nearby variability and non-guarantee disclosure should not become a negative hit.",
    input: {
      adjacentAfter: "Rates may vary and are not guaranteed.",
      adjacentBefore: "Crypto staking",
      blockHeading: "Earn rewards",
      blockText: "Earn up to 14% APY with staking.",
      candidateSignals: ["returns", "percentage", "earnings"],
      pageType: "marketing_page",
      pageUrl: "https://example.com/staking",
      sourceType: "document_source"
    },
    expected: {
      claimPresent: true,
      claimType: "return_performance_claim",
      claimText: "Earn up to 14% APY with staking.",
      commercialContext: true,
      contextType: "financial_offer",
      adjacentDisclosurePresent: true,
      adjacentDisclosureType: "risk_disclosure",
      adjacentDisclosureText: "Rates may vary and are not guaranteed.",
      guaranteeLanguage: false,
      superlativeLanguage: false,
      simulatedPerformanceLanguage: false,
      urgencyPresent: false,
      urgencyTiedToConversion: false,
      pricingPresent: false,
      feeDisclosurePresent: false,
      confidence: 0.87,
      rationaleShort: "Return claim is present, but nearby variability disclosure is also visible."
    }
  }),
  example({
    id: "educational-article-negative",
    split: "eval",
    notes: "Negative control: finance-adjacent educational content without a commercial claim should be rejected.",
    input: {
      adjacentAfter: "Read the full guide below.",
      adjacentBefore: "What is APR?",
      blockHeading: "Educational article",
      blockText: "APR is the annual percentage rate used to describe the yearly cost of borrowing.",
      candidateSignals: ["percentage"],
      pageType: "marketing_page",
      pageUrl: "https://example.com/learn/apr",
      sourceType: "document_source"
    },
    expected: {
      claimPresent: false,
      claimType: "none",
      claimText: null,
      commercialContext: false,
      contextType: "unknown",
      adjacentDisclosurePresent: false,
      adjacentDisclosureType: null,
      adjacentDisclosureText: null,
      guaranteeLanguage: false,
      superlativeLanguage: false,
      simulatedPerformanceLanguage: false,
      urgencyPresent: false,
      urgencyTiedToConversion: false,
      pricingPresent: false,
      feeDisclosurePresent: false,
      confidence: 0.93,
      rationaleShort: "Educational descriptive text does not make a commercial or financial outcome claim."
    }
  })
];

export function toFinancialCommercialClaimsJsonl() {
  return FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.map((entry) =>
    JSON.stringify({
      messages: [
        {
          role: "system",
          content:
            "Classify website claim blocks conservatively. Return structured financial/commercial claim observations only. Do not make legal conclusions."
        },
        {
          role: "user",
          content: JSON.stringify(entry.input)
        },
        {
          role: "assistant",
          content: JSON.stringify(entry.expected)
        }
      ],
      metadata: {
        id: entry.id,
        notes: entry.notes,
        split: entry.split
      }
    })
  ).join("\n");
}
