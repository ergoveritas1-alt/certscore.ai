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
  sourceUrl?: string;
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
    id: "trading-profitability-community-claim",
    split: "eval",
    notes: "Trading-community profitability language without balancing disclosure should still count as a qualifying commercial claim.",
    input: {
      adjacentAfter: "Join for free today.",
      adjacentBefore: "Trading community",
      blockHeading: "Learn and profit",
      blockText: "Join my free trading community and learn & profit from my trading ideas daily.",
      candidateSignals: ["earnings", "cta", "investment_context"],
      pageType: "marketing_page",
      pageUrl: "https://example.com/trading-community",
      sourceType: "document_source"
    },
    expected: {
      claimPresent: true,
      claimType: "return_performance_claim",
      claimText: "learn & profit from my trading ideas daily",
      commercialContext: true,
      contextType: "financial_offer",
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
      confidence: 0.84,
      rationaleShort: "Trading profitability language is presented as a promotional outcome near a join CTA."
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
  }),
  example({
    id: "regulator-derived-dfpi-cryptovault-returns",
    split: "eval",
    sourceUrl: "https://dfpi.ca.gov/consumers/crypto/crypto-scam-tracker/cryptovaultnc-com-homepage-fraudulent-platform/",
    notes: "Derived from a March 10, 2026 DFPI tracker entry describing a platform promoted with explicit 30-40% returns and fee demands.",
    input: {
      adjacentAfter: "Withdrawals require taxes and commission payment first.",
      adjacentBefore: "Senior analyst recommendation",
      blockHeading: "Crypto trading platform",
      blockText: "Paul promised 30-40% returns using the crypto asset trading platform.",
      candidateSignals: ["returns", "percentage", "pricing_fee"],
      pageType: "financial_offer",
      pageUrl: "https://cryptovaultnc.com",
      sourceType: "page_evidence"
    },
    expected: {
      claimPresent: true,
      claimType: "return_performance_claim",
      claimText: "promised 30-40% returns",
      commercialContext: true,
      contextType: "financial_offer",
      adjacentDisclosurePresent: false,
      adjacentDisclosureType: null,
      adjacentDisclosureText: null,
      guaranteeLanguage: false,
      superlativeLanguage: false,
      simulatedPerformanceLanguage: false,
      urgencyPresent: false,
      urgencyTiedToConversion: false,
      pricingPresent: true,
      feeDisclosurePresent: false,
      confidence: 0.91,
      rationaleShort: "Explicit returns language appears in a financial trading context without balancing disclosure."
    }
  }),
  example({
    id: "regulator-derived-dfpi-lgdbite-return-plus-fee",
    split: "eval",
    sourceUrl: "https://dfpi.ca.gov/consumers/crypto/crypto-scam-tracker/lgdbite-com-account-page-fraudulent-platform/",
    notes: "Derived from an April 16, 2026 DFPI tracker entry describing 10% return claims and later certification-fee demands.",
    input: {
      adjacentAfter: "The platform demanded a 25% certification fee before release of funds.",
      adjacentBefore: "Crypto investment invite",
      blockHeading: "Account growth",
      blockText: "The online date said they made a 10% return and convinced the victim to invest.",
      candidateSignals: ["returns", "percentage", "pricing_fee"],
      pageType: "financial_offer",
      pageUrl: "https://lgdbite.com",
      sourceType: "page_evidence"
    },
    expected: {
      claimPresent: true,
      claimType: "return_performance_claim",
      claimText: "made a 10% return",
      commercialContext: true,
      contextType: "financial_offer",
      adjacentDisclosurePresent: false,
      adjacentDisclosureType: null,
      adjacentDisclosureText: null,
      guaranteeLanguage: false,
      superlativeLanguage: false,
      simulatedPerformanceLanguage: false,
      urgencyPresent: false,
      urgencyTiedToConversion: false,
      pricingPresent: true,
      feeDisclosurePresent: false,
      confidence: 0.89,
      rationaleShort: "Return claim is paired with later fee demand language but no balancing disclosure."
    }
  }),
  example({
    id: "regulator-derived-dfpi-credit-score-gains",
    split: "eval",
    sourceUrl: "https://dfpi.ca.gov/consumers/crypto/crypto-scam-tracker/creatordbwxq-cc-homepage-fraudulent-platform/",
    notes: "Derived from a March 10, 2026 DFPI tracker entry describing a platform promising gains after a score threshold.",
    input: {
      adjacentAfter: "Deposit funds to increase the score.",
      adjacentBefore: "Credit score system",
      blockHeading: "User page",
      blockText: "The platform promised gains once an investor score reached 100%.",
      candidateSignals: ["earnings", "guarantee"],
      pageType: "financial_offer",
      pageUrl: "https://creatordbwxq.cc",
      sourceType: "page_evidence"
    },
    expected: {
      claimPresent: true,
      claimType: "guaranteed_outcome_claim",
      claimText: "promised gains once an investor score reached 100%",
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
      confidence: 0.88,
      rationaleShort: "Outcome-dependent gains language implies a guaranteed or certain result."
    }
  }),
  example({
    id: "regulator-derived-dfpi-digital-finance-academy",
    split: "eval",
    sourceUrl: "https://dfpi.ca.gov/consumers/crypto/crypto-scam-tracker/digital-finance-academy-investment-agreement-fraudulent-platform/",
    notes: "Derived from a DFPI entry describing a 'Stable Trading System 6.0' program pitched as netting 300% with commissions withheld.",
    input: {
      adjacentAfter: "Participants would owe 30% for subscription and service-related fees.",
      adjacentBefore: "Trader Incubation Program",
      blockHeading: "Stable Trading System 6.0",
      blockText: "The resident believed they could net 300% through the investment system.",
      candidateSignals: ["returns", "percentage", "pricing_fee"],
      pageType: "financial_offer",
      pageUrl: "https://h5.peabdexapp.vip",
      sourceType: "document_source"
    },
    expected: {
      claimPresent: true,
      claimType: "return_performance_claim",
      claimText: "could net 300%",
      commercialContext: true,
      contextType: "financial_offer",
      adjacentDisclosurePresent: false,
      adjacentDisclosureType: null,
      adjacentDisclosureText: null,
      guaranteeLanguage: false,
      superlativeLanguage: false,
      simulatedPerformanceLanguage: false,
      urgencyPresent: false,
      urgencyTiedToConversion: false,
      pricingPresent: true,
      feeDisclosurePresent: false,
      confidence: 0.94,
      rationaleShort: "Extreme return claim appears alongside fee language without balancing disclosure."
    }
  }),
  example({
    id: "regulator-derived-fca-devbankuk-authorised-claim",
    split: "eval",
    sourceUrl: "https://www.fca.org.uk/news/warnings/development-bank-uk-0",
    notes: "Derived from an FCA warning published April 20, 2026 noting a site claiming to be FCA-authorised.",
    input: {
      adjacentAfter: "Apply now.",
      adjacentBefore: "Development Bank UK",
      blockHeading: "Authorised lender",
      blockText: "Claiming to be authorised by the FCA.",
      candidateSignals: ["superlative", "cta"],
      pageType: "lead_generation_offer",
      pageUrl: "https://www.devbankuk.com",
      sourceType: "signal_hit"
    },
    expected: {
      claimPresent: false,
      claimType: "none",
      claimText: null,
      commercialContext: true,
      contextType: "financial_offer",
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
      confidence: 0.79,
      rationaleShort: "Authorization-language alone is not one of the v1 financial claims patterns."
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
        sourceUrl: entry.sourceUrl ?? null,
        split: entry.split
      }
    })
  ).join("\n");
}
