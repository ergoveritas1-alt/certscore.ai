"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED = void 0;
exports.summarizeFinancialCommercialClaimsDataset = summarizeFinancialCommercialClaimsDataset;
exports.toFinancialCommercialClaimsJsonl = toFinancialCommercialClaimsJsonl;
const financial_commercial_claims_1 = require("./financial-commercial-claims");
const DATASET_BUCKETS = [
    "positive_high_confidence",
    "positive_borderline",
    "negative_financial",
    "negative_nonfinancial",
    "adversarial_negative"
];
const EMITTABLE_FINDING_IDS = [
    "guaranteed_outcome_claim_detected",
    "earnings_claim_without_adjacent_disclosure",
    "simulated_performance_without_disclosure",
    "unqualified_superlative_claim_detected",
    "financial_urgency_pressure_tactic_detected",
    "pricing_or_fee_transparency_unclear"
];
const CARD_EXPECTATION_MODES = ["findings", "not_applicable", "omit"];
function isBucket(value) {
    return DATASET_BUCKETS.includes(value);
}
function isCardExpectationMode(value) {
    return CARD_EXPECTATION_MODES.includes(value);
}
function isEmittableFindingId(value) {
    return EMITTABLE_FINDING_IDS.includes(value);
}
function normalizePageExpectation(value, expected) {
    if (!value || typeof value !== "object") {
        throw new Error("Dataset example pageExpectation must be an object.");
    }
    const record = value;
    const expectedFindingIds = Array.isArray(record.expectedFindingIds)
        ? record.expectedFindingIds.filter(isEmittableFindingId)
        : null;
    const expectedCardMode = record.expectedCardMode;
    const shouldShowFinancialCard = record.shouldShowFinancialCard;
    if (!expectedFindingIds) {
        throw new Error("Dataset example pageExpectation.expectedFindingIds must be a finding-id array.");
    }
    if (!isCardExpectationMode(expectedCardMode)) {
        throw new Error("Dataset example pageExpectation.expectedCardMode is invalid.");
    }
    if (typeof shouldShowFinancialCard !== "boolean") {
        throw new Error("Dataset example pageExpectation.shouldShowFinancialCard must be boolean.");
    }
    if (expectedCardMode === "findings" && expectedFindingIds.length === 0) {
        throw new Error("Dataset examples with findings card mode must declare expected finding ids.");
    }
    if (expected.claimPresent === false && expectedFindingIds.length > 0) {
        throw new Error("Dataset example cannot emit findings when expected claimPresent=false.");
    }
    return {
        expectedFindingIds,
        expectedCardMode,
        shouldShowFinancialCard
    };
}
function example(entry) {
    if (!isBucket(entry.bucket)) {
        throw new Error("Unsupported dataset bucket.");
    }
    const expected = financial_commercial_claims_1.financialCommercialClaimClassificationSchema.parse(entry.expected);
    const input = financial_commercial_claims_1.financialCommercialClaimCandidateInputSchema.parse(entry.input);
    return {
        ...entry,
        expected,
        input,
        pageExpectation: normalizePageExpectation(entry.pageExpectation, expected)
    };
}
exports.FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED = [
    example({
        bucket: "positive_high_confidence",
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
        },
        pageExpectation: {
            expectedFindingIds: ["earnings_claim_without_adjacent_disclosure"],
            expectedCardMode: "findings",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "positive_high_confidence",
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
        },
        pageExpectation: {
            expectedFindingIds: ["guaranteed_outcome_claim_detected"],
            expectedCardMode: "findings",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "positive_high_confidence",
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
        },
        pageExpectation: {
            expectedFindingIds: ["simulated_performance_without_disclosure"],
            expectedCardMode: "findings",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "positive_high_confidence",
        id: "superlative-and-urgency",
        split: "train",
        notes: "Superlative claim paired with urgency and conversion CTA.",
        input: {
            adjacentAfter: "Only 3 spots left. Subscribe now.",
            adjacentBefore: "Premium alerts",
            blockHeading: "Top ranked system",
            blockText: "The best-performing trading bot in the market.",
            candidateSignals: ["superlative", "urgency", "cta", "investment_context"],
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
        },
        pageExpectation: {
            expectedFindingIds: [
                "unqualified_superlative_claim_detected",
                "financial_urgency_pressure_tactic_detected"
            ],
            expectedCardMode: "findings",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "positive_borderline",
        id: "pricing-cta-no-fee-detail",
        split: "train",
        notes: "Commercial CTA with weak price/fee visibility.",
        input: {
            adjacentAfter: "Start now",
            adjacentBefore: "Premium access",
            blockHeading: "Go Pro",
            blockText: "Unlock our premium investor dashboard today.",
            candidateSignals: ["pricing", "cta"],
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
            pricingPresent: true,
            feeDisclosurePresent: false,
            confidence: 0.78,
            rationaleShort: "Commercial upgrade CTA appears without clear nearby pricing or fee detail."
        },
        pageExpectation: {
            expectedFindingIds: ["pricing_or_fee_transparency_unclear"],
            expectedCardMode: "findings",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "negative_financial",
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
        },
        pageExpectation: {
            expectedFindingIds: [],
            expectedCardMode: "not_applicable",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "negative_financial",
        id: "performance-stat-with-learn-more",
        split: "eval",
        notes: "Legitimate performance-stat copy with a follow-on CTA should not surface unless the claim carries stronger earnings-style or promotional-risk cues.",
        input: {
            adjacentAfter: "Learn more",
            adjacentBefore: "Results for the long term",
            blockHeading: "Core portfolio performance",
            blockText: "Since launch, our Core portfolio has delivered over 9% composite annual time-weighted returns after fees.",
            candidateSignals: ["returns", "pricing", "investment_context"],
            pageType: "marketing_page",
            pageUrl: "https://example.com/performance",
            sourceType: "document_source"
        },
        expected: {
            claimPresent: true,
            claimType: "return_performance_claim",
            claimText: "delivered over 9% composite annual time-weighted returns after fees",
            commercialContext: true,
            contextType: "financial_offer",
            adjacentDisclosurePresent: false,
            adjacentDisclosureType: null,
            adjacentDisclosureText: null,
            guaranteeLanguage: false,
            superlativeLanguage: false,
            simulatedPerformanceLanguage: false,
            urgencyPresent: true,
            urgencyTiedToConversion: true,
            pricingPresent: false,
            feeDisclosurePresent: false,
            confidence: 0.85,
            rationaleShort: "Performance-stat language alone should stay below the v1 surfacing bar even when paired with a generic learn-more CTA."
        },
        pageExpectation: {
            expectedFindingIds: [],
            expectedCardMode: "not_applicable",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "negative_financial",
        id: "bonus-offer-with-terms",
        split: "eval",
        notes: "Time-bound account transfer incentives with visible terms should not surface as urgency or pricing findings.",
        input: {
            adjacentAfter: "when you transfer an account by April 30. Terms apply.",
            adjacentBefore: "Retirement bonus",
            blockHeading: "IRA transfer bonus",
            blockText: "Earn a 2% match when you transfer an account by April 30.",
            candidateSignals: ["earnings", "currency", "urgency", "cta", "pricing"],
            pageType: "pricing_page",
            pageUrl: "https://example.com/ira-match",
            sourceType: "document_source"
        },
        expected: {
            claimPresent: true,
            claimType: "earnings_claim",
            claimText: "Earn a 2% match",
            commercialContext: true,
            contextType: "financial_offer",
            adjacentDisclosurePresent: true,
            adjacentDisclosureType: "pricing_terms",
            adjacentDisclosureText: "when you transfer an account by April 30. Terms apply.",
            guaranteeLanguage: false,
            superlativeLanguage: false,
            simulatedPerformanceLanguage: false,
            urgencyPresent: true,
            urgencyTiedToConversion: true,
            pricingPresent: true,
            feeDisclosurePresent: true,
            confidence: 0.86,
            rationaleShort: "Bonus-offer copy is paired with visible timing and terms language, so the block should stay out of the surfaced lane."
        },
        pageExpectation: {
            expectedFindingIds: [],
            expectedCardMode: "not_applicable",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "negative_financial",
        id: "source-backed-betterment-core-returns-with-risk-caveat",
        split: "eval",
        sourceUrl: "https://www.betterment.com/resources/comparing-portfolio-returns",
        notes: "Derived from Betterment portfolio-returns marketing content observed April 21, 2026, where after-fee performance statistics are paired with a direct 'performance not guaranteed, investing involves risk' disclosure.",
        input: {
            adjacentAfter: "As of 12/31/2025, and inception date 9/7/2011. Composite annual time-weighted returns: 20.1% over 1 year, 9.3% over 5 years, and 10.1% over 10 years. Performance not guaranteed, investing involves risk.",
            adjacentBefore: "The ABCs of apples-to-apples comparisons",
            blockHeading: "Core portfolio returns",
            blockText: "Since its launch, our Core portfolio’s average annual return has been ~10% after fees.",
            candidateSignals: ["returns", "percentage", "investment_context", "results_social_proof"],
            pageType: "marketing_page",
            pageUrl: "https://www.betterment.com/resources/comparing-portfolio-returns",
            sourceType: "document_source"
        },
        expected: {
            claimPresent: true,
            claimType: "return_performance_claim",
            claimText: "average annual return has been ~10% after fees",
            commercialContext: true,
            contextType: "financial_offer",
            adjacentDisclosurePresent: true,
            adjacentDisclosureType: "risk_disclosure",
            adjacentDisclosureText: "Performance not guaranteed, investing involves risk.",
            guaranteeLanguage: false,
            superlativeLanguage: false,
            simulatedPerformanceLanguage: false,
            urgencyPresent: false,
            urgencyTiedToConversion: false,
            pricingPresent: false,
            feeDisclosurePresent: false,
            confidence: 0.89,
            rationaleShort: "After-fee performance language is present, but the page also provides a direct no-guarantee risk caveat."
        },
        pageExpectation: {
            expectedFindingIds: [],
            expectedCardMode: "not_applicable",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "negative_financial",
        id: "source-backed-betterment-pricing-clear-fees",
        split: "eval",
        sourceUrl: "https://www.betterment.com/pricing",
        notes: "Derived from Betterment pricing content observed April 21, 2026, showing clear management-fee amounts, embedded fund-fee context, and a statement that there are no additional trading or deposit fees.",
        input: {
            adjacentAfter: "Betterment does not receive any portion of these fund fees and these fees are in addition to our management fees. There is no fee to withdraw funds to your linked checking account. You are not charged any additional trading or deposit fees.",
            adjacentBefore: "How inexpensive is automated investing?",
            blockHeading: "A low fee that works for you",
            blockText: "The base price for investing accounts is $5 per month. You automatically switch to an annual price of 0.25% on your investing account balance by setting up recurring monthly deposits or reaching a balance threshold.",
            candidateSignals: ["pricing", "currency", "percentage", "cta"],
            pageType: "pricing_page",
            pageUrl: "https://www.betterment.com/pricing",
            sourceType: "document_source"
        },
        expected: {
            claimPresent: true,
            claimType: "pricing_fee_claim",
            claimText: "$5 per month ... 0.25%",
            commercialContext: true,
            contextType: "pricing_page",
            adjacentDisclosurePresent: true,
            adjacentDisclosureType: "pricing_terms",
            adjacentDisclosureText: "These fees are in addition to our management fees. There is no fee to withdraw funds to your linked checking account. You are not charged any additional trading or deposit fees.",
            guaranteeLanguage: false,
            superlativeLanguage: false,
            simulatedPerformanceLanguage: false,
            urgencyPresent: false,
            urgencyTiedToConversion: false,
            pricingPresent: true,
            feeDisclosurePresent: true,
            confidence: 0.93,
            rationaleShort: "The pricing page states specific management fees and clearly discloses additional-fee treatment, so it should not surface as unclear pricing."
        },
        pageExpectation: {
            expectedFindingIds: [],
            expectedCardMode: "not_applicable",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "positive_high_confidence",
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
        },
        pageExpectation: {
            expectedFindingIds: ["earnings_claim_without_adjacent_disclosure"],
            expectedCardMode: "findings",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "negative_nonfinancial",
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
        },
        pageExpectation: {
            expectedFindingIds: [],
            expectedCardMode: "omit",
            shouldShowFinancialCard: false
        }
    }),
    example({
        bucket: "negative_nonfinancial",
        id: "generic-commerce-superlative-negative",
        split: "eval",
        notes: "Generic ecommerce superiority copy should not surface in the financial claims lane without investment context.",
        input: {
            adjacentAfter: "Start free trial.",
            adjacentBefore: "Commerce platform",
            blockHeading: "Checkout",
            blockText: "World's best checkout for growing brands.",
            candidateSignals: ["superlative", "cta"],
            pageType: "marketing_page",
            pageUrl: "https://example.com/checkout",
            sourceType: "document_source"
        },
        expected: {
            claimPresent: true,
            claimType: "superlative_claim",
            claimText: "World's best checkout",
            commercialContext: true,
            contextType: "marketing_page",
            adjacentDisclosurePresent: false,
            adjacentDisclosureType: null,
            adjacentDisclosureText: null,
            guaranteeLanguage: false,
            superlativeLanguage: true,
            simulatedPerformanceLanguage: false,
            urgencyPresent: false,
            urgencyTiedToConversion: false,
            pricingPresent: false,
            feeDisclosurePresent: false,
            confidence: 0.85,
            rationaleShort: "Generic commerce superlative language lacks the finance or investment context required for this lane."
        },
        pageExpectation: {
            expectedFindingIds: [],
            expectedCardMode: "not_applicable",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "positive_high_confidence",
        id: "regulator-derived-dfpi-cryptovault-returns",
        split: "eval",
        sourceUrl: "https://dfpi.ca.gov/consumers/crypto/crypto-scam-tracker/cryptovaultnc-com-homepage-fraudulent-platform/",
        notes: "Derived from a March 10, 2026 DFPI tracker entry describing a platform promoted with explicit 30-40% returns and fee demands.",
        input: {
            adjacentAfter: "Withdrawals require taxes and commission payment first.",
            adjacentBefore: "Senior analyst recommendation",
            blockHeading: "Crypto trading platform",
            blockText: "Paul promised 30-40% returns using the crypto asset trading platform.",
            candidateSignals: ["returns", "percentage", "pricing_fee", "results_social_proof"],
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
        },
        pageExpectation: {
            expectedFindingIds: ["earnings_claim_without_adjacent_disclosure"],
            expectedCardMode: "findings",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "positive_high_confidence",
        id: "regulator-derived-dfpi-capitalcrypto-guaranteed-signals",
        split: "eval",
        sourceUrl: "https://dfpi.ca.gov/consumers/crypto/crypto-scam-tracker/capitalcrypto-net-homepage-fraudulent-platform/",
        notes: "Derived from a DFPI page updated March 9, 2026 describing capitalcrypto.net as promoted with guaranteed trading signals and later fee demands on withdrawal.",
        input: {
            adjacentAfter: "The victim later believed they had earned approximately $300,000 before withdrawal was blocked.",
            adjacentBefore: "Professional analyst",
            blockHeading: "Guaranteed trading signals",
            blockText: "The romantic partner mentioned they knew a professional analyst who provided guaranteed trading signals and asked the victim to join the crypto options trading platform.",
            candidateSignals: ["guarantee", "investment_context", "results_social_proof"],
            pageType: "financial_offer",
            pageUrl: "https://capitalcrypto.net",
            sourceType: "document_source"
        },
        expected: {
            claimPresent: true,
            claimType: "guaranteed_outcome_claim",
            claimText: "provided guaranteed trading signals",
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
            confidence: 0.93,
            rationaleShort: "Guarantee-style trading-signal language appears in a financial trading solicitation without balancing disclosure."
        },
        pageExpectation: {
            expectedFindingIds: ["guaranteed_outcome_claim_detected"],
            expectedCardMode: "findings",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "positive_high_confidence",
        id: "regulator-derived-dfpi-lgdbite-return-plus-fee",
        split: "eval",
        sourceUrl: "https://dfpi.ca.gov/consumers/crypto/crypto-scam-tracker/lgdbite-com-account-page-fraudulent-platform/",
        notes: "Derived from an April 16, 2026 DFPI tracker entry describing 10% return claims and later certification-fee demands.",
        input: {
            adjacentAfter: "The platform demanded a 25% certification fee before release of funds.",
            adjacentBefore: "Crypto investment invite",
            blockHeading: "Account growth",
            blockText: "The online date said they made a 10% return and convinced the victim to invest.",
            candidateSignals: ["returns", "percentage", "pricing_fee", "results_social_proof"],
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
        },
        pageExpectation: {
            expectedFindingIds: ["earnings_claim_without_adjacent_disclosure"],
            expectedCardMode: "findings",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "positive_high_confidence",
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
        },
        pageExpectation: {
            expectedFindingIds: ["guaranteed_outcome_claim_detected"],
            expectedCardMode: "findings",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "positive_high_confidence",
        id: "regulator-derived-dfpi-digital-finance-academy",
        split: "eval",
        sourceUrl: "https://dfpi.ca.gov/consumers/crypto/crypto-scam-tracker/digital-finance-academy-investment-agreement-fraudulent-platform/",
        notes: "Derived from a DFPI entry describing a 'Stable Trading System 6.0' program pitched as netting 300% with commissions withheld.",
        input: {
            adjacentAfter: "Participants would owe 30% for subscription and service-related fees.",
            adjacentBefore: "Trader Incubation Program",
            blockHeading: "Stable Trading System 6.0",
            blockText: "The resident believed they could net 300% through the investment system.",
            candidateSignals: ["returns", "percentage", "pricing_fee", "earnings", "results_social_proof"],
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
        },
        pageExpectation: {
            expectedFindingIds: ["earnings_claim_without_adjacent_disclosure"],
            expectedCardMode: "findings",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "positive_high_confidence",
        id: "regulator-derived-dfpi-cryptomms-extreme-daily-returns",
        split: "eval",
        sourceUrl: "https://dfpi.ca.gov/consumers/crypto/crypto-scam-tracker/cryptomms-exchange-ltd-fraudulent-platform/",
        notes: "Derived from a Nov. 4, 2025 DFPI tracker entry describing a platform that promised returns of up to 60% per day through guru-led trading signals.",
        input: {
            adjacentAfter: "Trade through the site based on signals from a trading guru.",
            adjacentBefore: "CryptoMMS trading group",
            blockHeading: "Daily trading returns",
            blockText: "The victim was promised returns of up to 60% per day if they traded through the site.",
            candidateSignals: ["returns", "percentage", "investment_context", "results_social_proof"],
            pageType: "financial_offer",
            pageUrl: "https://cryptomms.co",
            sourceType: "document_source"
        },
        expected: {
            claimPresent: true,
            claimType: "return_performance_claim",
            claimText: "returns of up to 60% per day",
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
            confidence: 0.96,
            rationaleShort: "Extreme daily return language appears in a financial trading offer without balancing disclosure."
        },
        pageExpectation: {
            expectedFindingIds: ["earnings_claim_without_adjacent_disclosure"],
            expectedCardMode: "findings",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "positive_high_confidence",
        id: "regulator-derived-dfpi-glidz-ai-daily-returns",
        split: "eval",
        sourceUrl: "https://dfpi.ca.gov/consumers/crypto/crypto-scam-tracker/",
        notes: "Derived from the DFPI Crypto Scam Tracker row for glidz.com, updated March 10, 2026, describing AI-based trading pitched with daily returns of 2.2% to 2.7% and later freeze threats.",
        input: {
            adjacentAfter: "The platform later threatened to freeze the account unless an additional deposit equal to the current balance was made.",
            adjacentBefore: "AI-based trading platform",
            blockHeading: "Daily AI returns",
            blockText: "The platform promised daily returns of 2.2%–2.7% through AI-based trading.",
            candidateSignals: ["returns", "percentage", "investment_context", "results_social_proof"],
            pageType: "financial_offer",
            pageUrl: "https://glidz.com",
            sourceType: "document_source"
        },
        expected: {
            claimPresent: true,
            claimType: "return_performance_claim",
            claimText: "daily returns of 2.2%–2.7%",
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
            confidence: 0.94,
            rationaleShort: "Specific daily return language appears in a trading-platform context without balancing disclosure."
        },
        pageExpectation: {
            expectedFindingIds: ["earnings_claim_without_adjacent_disclosure"],
            expectedCardMode: "findings",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "negative_financial",
        id: "regulator-derived-dfpi-pzmqgow-explicit-withdrawal-fee",
        split: "eval",
        sourceUrl: "https://dfpi.ca.gov/consumers/crypto/crypto-scam-tracker/pzmqgow-top-homepage-fraudulent-platform/",
        notes: "Derived from DFPI screenshot alt text for a withdrawal page that explicitly displays a transaction fee, which should not be treated as unclear fee disclosure.",
        input: {
            adjacentAfter: "Address and network options are visible.",
            adjacentBefore: "Cryptocurrency withdrawal page",
            blockHeading: "Withdrawal",
            blockText: "Balance is $376,837.5671 with 205.156 ETH available. The transaction fee is $7,536.75.",
            candidateSignals: ["pricing", "currency", "investment_context"],
            pageType: "financial_offer",
            pageUrl: "https://pzmqgow.top",
            sourceType: "page_evidence"
        },
        expected: {
            claimPresent: true,
            claimType: "pricing_fee_claim",
            claimText: "The transaction fee is $7,536.75.",
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
            feeDisclosurePresent: true,
            confidence: 0.92,
            rationaleShort: "The fee is explicitly displayed in the interface, so this should not surface as unclear pricing."
        },
        pageExpectation: {
            expectedFindingIds: [],
            expectedCardMode: "not_applicable",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "adversarial_negative",
        id: "regulator-derived-dfpi-crypto-rd-multi-fee-release-demand",
        split: "eval",
        sourceUrl: "https://dfpi.ca.gov/consumers/crypto/crypto-scam-tracker/crypto-rd-top-deposit-page-fraudulent-platform/",
        notes: "Derived from a DFPI page updated Nov. 3, 2025 describing crypto-rd.top demanding multiple platform, KYC, maintenance, and release fees before allowing access to funds, without a qualifying earnings or return claim in the captured text.",
        input: {
            adjacentAfter: "The platform also demanded another fee to release assets before funds would be released.",
            adjacentBefore: "Crypto-rd.top deposit page",
            blockHeading: "Withdrawal fee stack",
            blockText: "The platform demanded multiple fees including a platform fee, a Know Your Customer fee, and a maintenance fee before the victim could access their funds.",
            candidateSignals: ["pricing", "investment_context", "currency"],
            pageType: "financial_offer",
            pageUrl: "https://www.crypto-rd.top",
            sourceType: "document_source"
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
            pricingPresent: true,
            feeDisclosurePresent: false,
            confidence: 0.85,
            rationaleShort: "A stack of post-deposit release fees alone should not become a v1 financial claims finding without a qualifying claim or clearer conversion-style pricing pattern."
        },
        pageExpectation: {
            expectedFindingIds: [],
            expectedCardMode: "not_applicable",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "adversarial_negative",
        id: "regulator-derived-dfpi-crypto-networks-upgrade-fee-no-claim",
        split: "eval",
        sourceUrl: "https://dfpi.ca.gov/consumers/crypto/crypto-scam-tracker/crypto-networks-homepage-fraudulent-platform/",
        notes: "Derived from a DFPI page updated Oct. 28, 2025 describing Crypto-Networks.net demanding a $10,000 'Titan Status' upgrade before withdrawal, without an explicit earnings or return claim in the captured text.",
        input: {
            adjacentAfter: "The upgrade cost $10,000 before the user could withdraw funds.",
            adjacentBefore: "Frozen account",
            blockHeading: "Titan Status upgrade",
            blockText: "The platform demanded they upgrade to Titan Status before they could withdraw funds.",
            candidateSignals: ["pricing", "currency", "investment_context", "cta"],
            pageType: "financial_offer",
            pageUrl: "https://crypto-networks.net",
            sourceType: "document_source"
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
            pricingPresent: true,
            feeDisclosurePresent: false,
            confidence: 0.84,
            rationaleShort: "Withdrawal-unlock fee pressure alone is not enough for a v1 finding without a qualifying claim or stronger pricing-transparency context."
        },
        pageExpectation: {
            expectedFindingIds: [],
            expectedCardMode: "not_applicable",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "adversarial_negative",
        id: "regulator-derived-dfpi-web3app-savings-plan-ui",
        split: "eval",
        sourceUrl: "https://dfpi.ca.gov/consumers/crypto/crypto-scam-tracker/web3app-rest-homepage-fraudulent-platform/",
        notes: "Derived from DFPI screenshot alt text showing a fixed-term savings-plan UI with interest-rate references but no concrete promotional outcome claim.",
        input: {
            adjacentAfter: "Transaction details are shown below.",
            adjacentBefore: "Mobile app screen",
            blockHeading: "Fixed-term savings plan",
            blockText: "Web3 fixed-term savings plan with various interest rates.",
            candidateSignals: ["returns", "investment_context"],
            pageType: "financial_offer",
            pageUrl: "https://web3app.rest",
            sourceType: "page_evidence"
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
            confidence: 0.83,
            rationaleShort: "A generic savings-plan UI with rate references is not enough by itself to count as a qualifying v1 claim."
        },
        pageExpectation: {
            expectedFindingIds: [],
            expectedCardMode: "not_applicable",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "positive_high_confidence",
        id: "regulator-derived-dfpi-rwanexus-profit-plus-audit-fee",
        split: "eval",
        sourceUrl: "https://dfpi.ca.gov/consumers/crypto/crypto-scam-tracker/rwanexus-io-homepage-fraudulent-platform/",
        notes: "Derived from a Jan. 12, 2026 DFPI tracker entry describing homepage-led crypto trading pitched as a way to earn profits, followed by repeated audit-fee demands on withdrawal.",
        input: {
            adjacentAfter: "The platform demanded a 5% audit fee before assets could be recovered.",
            adjacentBefore: "RWA Nexus",
            blockHeading: "Crypto trading profits",
            blockText: "The platform was presented as a way to earn profits through crypto asset trading.",
            candidateSignals: ["earnings", "investment_context", "pricing_fee", "results_social_proof"],
            pageType: "financial_offer",
            pageUrl: "https://rwanexus.io",
            sourceType: "document_source"
        },
        expected: {
            claimPresent: true,
            claimType: "earnings_claim",
            claimText: "earn profits through crypto asset trading",
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
            confidence: 0.9,
            rationaleShort: "Profit-seeking trading language appears in a financial offer without balancing disclosure."
        },
        pageExpectation: {
            expectedFindingIds: ["earnings_claim_without_adjacent_disclosure"],
            expectedCardMode: "findings",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "positive_high_confidence",
        id: "regulator-derived-dfpi-strike-chain-profit-promise",
        split: "eval",
        sourceUrl: "https://dfpi.ca.gov/consumers/crypto/crypto-scam-tracker/strike-chain-inc-donation-receipt-fraudulent-trading-platform/",
        notes: "Derived from a DFPI page updated Nov. 4, 2025 describing an investment group promising a victim they could earn profits trading in crypto assets through Strike Chain Inc.",
        input: {
            adjacentAfter: "The resident opened an account on the platform and signed an investment agreement.",
            adjacentBefore: "Summit Wealth Investment Education Foundation",
            blockHeading: "Crypto trading profits",
            blockText: "They promised the victim could earn profits trading in crypto assets if they opened an account on the platform.",
            candidateSignals: ["earnings", "investment_context", "results_social_proof", "cta"],
            pageType: "financial_offer",
            pageUrl: "https://www.chainbitcoins.com/#/home",
            sourceType: "document_source"
        },
        expected: {
            claimPresent: true,
            claimType: "earnings_claim",
            claimText: "could earn profits trading in crypto assets",
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
            confidence: 0.91,
            rationaleShort: "Profit-promise language is presented as a reason to open an account, without balancing disclosure."
        },
        pageExpectation: {
            expectedFindingIds: ["earnings_claim_without_adjacent_disclosure"],
            expectedCardMode: "findings",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "positive_high_confidence",
        id: "regulator-derived-dfpi-web3bats-48-hour-loss-threat",
        split: "eval",
        sourceUrl: "https://dfpi.ca.gov/consumers/crypto/crypto-scam-tracker/",
        notes: "Derived from the DFPI Crypto Scam Tracker narrative for web3bats.top describing repeated withdrawal-payment demands culminating in a 48-hour deadline or loss of the account.",
        input: {
            adjacentAfter: "Pay $10,000 within 48 hours, or the account would be lost.",
            adjacentBefore: "Withdrawal release demand",
            blockHeading: "Asset release",
            blockText: "The site demanded a $100,000 payment to release the balance, then offered a smaller withdrawal for $30,000.",
            candidateSignals: ["pricing", "currency", "urgency", "cta", "investment_context"],
            pageType: "financial_offer",
            pageUrl: "http://web3bats.top",
            sourceType: "document_source"
        },
        expected: {
            claimPresent: true,
            claimType: "urgency_conversion_claim",
            claimText: "Pay $10,000 within 48 hours, or the account would be lost.",
            commercialContext: true,
            contextType: "financial_offer",
            adjacentDisclosurePresent: false,
            adjacentDisclosureType: null,
            adjacentDisclosureText: null,
            guaranteeLanguage: false,
            superlativeLanguage: false,
            simulatedPerformanceLanguage: false,
            urgencyPresent: true,
            urgencyTiedToConversion: true,
            pricingPresent: true,
            feeDisclosurePresent: false,
            confidence: 0.95,
            rationaleShort: "Time-boxed payment pressure is directly tied to releasing assets and avoiding loss of the account."
        },
        pageExpectation: {
            expectedFindingIds: ["financial_urgency_pressure_tactic_detected", "pricing_or_fee_transparency_unclear"],
            expectedCardMode: "findings",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "positive_high_confidence",
        id: "regulator-derived-dfpi-fpmotc-daily-penalty-pressure",
        split: "eval",
        sourceUrl: "https://dfpi.ca.gov/consumers/crypto/crypto-scam-tracker/",
        notes: "Derived from the DFPI Crypto Scam Tracker narrative for FPMOTC describing an account freeze followed by deposit demands and a daily 10% penalty threat.",
        input: {
            adjacentAfter: "Otherwise a fee of 10% would be taken from the account each day.",
            adjacentBefore: "Frozen account notice",
            blockHeading: "Account verification",
            blockText: "The app told the victim to deposit more money to confirm it was their account.",
            candidateSignals: ["pricing", "percentage", "urgency", "cta", "investment_context"],
            pageType: "financial_offer",
            pageUrl: "https://fpmotc.vip",
            sourceType: "document_source"
        },
        expected: {
            claimPresent: true,
            claimType: "urgency_conversion_claim",
            claimText: "deposit more money to confirm it was their account",
            commercialContext: true,
            contextType: "financial_offer",
            adjacentDisclosurePresent: false,
            adjacentDisclosureType: null,
            adjacentDisclosureText: null,
            guaranteeLanguage: false,
            superlativeLanguage: false,
            simulatedPerformanceLanguage: false,
            urgencyPresent: true,
            urgencyTiedToConversion: true,
            pricingPresent: true,
            feeDisclosurePresent: false,
            confidence: 0.91,
            rationaleShort: "Deposit pressure is paired with a daily penalty threat to force additional payment before funds can be accessed."
        },
        pageExpectation: {
            expectedFindingIds: ["financial_urgency_pressure_tactic_detected", "pricing_or_fee_transparency_unclear"],
            expectedCardMode: "findings",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "negative_financial",
        id: "source-backed-quanntick-backtest-with-live-caveat",
        split: "eval",
        sourceUrl: "https://quanntick.ai/blog/backtested-futures-strategy-20-years",
        notes: "Derived from a commercial strategy blog that presents strong backtest results but also includes an explicit live-trading caveat about slippage, fills, latency, and lower live returns.",
        input: {
            adjacentAfter: "Backtests are not live results. A strategy that returns 50% annually in backtesting might return 35-40% live after accounting for real-world execution costs.",
            adjacentBefore: "Backtesting vs. Live Trading",
            blockHeading: "TrendFollower",
            blockText: "The strategy uses a 20-year backtest and presents annual return expectations from historical performance.",
            candidateSignals: ["simulated", "returns", "investment_context", "results_social_proof"],
            pageType: "marketing_page",
            pageUrl: "https://quanntick.ai/blog/backtested-futures-strategy-20-years",
            sourceType: "document_source"
        },
        expected: {
            claimPresent: true,
            claimType: "simulated_performance_claim",
            claimText: "20-year backtest",
            commercialContext: true,
            contextType: "financial_offer",
            adjacentDisclosurePresent: true,
            adjacentDisclosureType: "simulation_disclaimer",
            adjacentDisclosureText: "Backtests are not live results. A strategy that returns 50% annually in backtesting might return 35-40% live after accounting for real-world execution costs.",
            guaranteeLanguage: false,
            superlativeLanguage: false,
            simulatedPerformanceLanguage: true,
            urgencyPresent: false,
            urgencyTiedToConversion: false,
            pricingPresent: false,
            feeDisclosurePresent: false,
            confidence: 0.89,
            rationaleShort: "Backtested performance language is present, but the page also provides a direct simulation-versus-live trading caveat."
        },
        pageExpectation: {
            expectedFindingIds: [],
            expectedCardMode: "not_applicable",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "positive_high_confidence",
        id: "source-backed-backtestr-backtest-results-signup",
        split: "eval",
        sourceUrl: "https://backtestr.xyz/",
        notes: "Derived from a commercial landing page that promotes backtested strategy results and invites users to sign up free, without a nearby simulation-performance caveat.",
        input: {
            adjacentAfter: "Sign up free to start testing strategies with AI.",
            adjacentBefore: "Find Your Market Edge",
            blockHeading: "Strategies That Actually Work",
            blockText: "Turn any trading idea into a backtested strategy in 30 seconds. Real backtest results include examples like SOL Volume Momentum +51.7% and Fast MACD Scalp 15m +36.9%.",
            candidateSignals: ["simulated", "returns", "percentage", "cta", "investment_context"],
            pageType: "marketing_page",
            pageUrl: "https://backtestr.xyz/",
            sourceType: "document_source"
        },
        expected: {
            claimPresent: true,
            claimType: "simulated_performance_claim",
            claimText: "backtested strategy in 30 seconds",
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
            confidence: 0.92,
            rationaleShort: "Backtested performance examples are promoted in a commercial signup context without a nearby simulation disclaimer."
        },
        pageExpectation: {
            expectedFindingIds: ["simulated_performance_without_disclosure"],
            expectedCardMode: "findings",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "adversarial_negative",
        id: "regulator-derived-dfpi-sannlt-recovery-wallet-ui",
        split: "eval",
        sourceUrl: "https://dfpi.ca.gov/consumers/crypto/crypto-scam-tracker/sannlt-homepage-fraudulent-platform/",
        notes: "Derived from a Dec. 5, 2025 DFPI tracker entry and screenshot alt text showing a wallet-style UI in a recovery scam context, without a qualifying earnings or return claim on the captured homepage text itself.",
        input: {
            adjacentAfter: "Options include Recharge, Withdraw, Wallet, Notice, My Funds Flow, and Modify Pass.",
            adjacentBefore: "Mobile app screenshot",
            blockHeading: "Wallet interface",
            blockText: "Balance of 6229.00 shown at the top of the app.",
            candidateSignals: ["currency", "investment_context"],
            pageType: "financial_offer",
            pageUrl: "https://sannlt.com",
            sourceType: "page_evidence"
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
            confidence: 0.82,
            rationaleShort: "A wallet-style balance screen alone is not enough to count as a v1 financial claims finding."
        },
        pageExpectation: {
            expectedFindingIds: [],
            expectedCardMode: "not_applicable",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "adversarial_negative",
        id: "regulator-derived-fca-atlas-finance-generic-trading-platform",
        split: "eval",
        sourceUrl: "https://www.fca.org.uk/news/warnings/atlas-finance",
        notes: "Derived from Atlas Finance homepage SEO/meta copy observed April 20, 2026: generic trading-platform marketing language without an explicit earnings, return, guarantee, or pricing-disclosure trigger.",
        input: {
            adjacentAfter: "Start your trading journey today!",
            adjacentBefore: "Atlas Finance",
            blockHeading: "Premier trading platform",
            blockText: "Trade with Confidence on Atlas Finance - Your Premier Trading Platform. Discover a seamless trading experience across stocks, commodities, forex, indices, and cryptocurrencies.",
            candidateSignals: ["investment_context", "superlative", "cta"],
            pageType: "marketing_page",
            pageUrl: "https://atlas-finance.org",
            sourceType: "document_source"
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
            superlativeLanguage: true,
            simulatedPerformanceLanguage: false,
            urgencyPresent: true,
            urgencyTiedToConversion: true,
            pricingPresent: false,
            feeDisclosurePresent: false,
            confidence: 0.79,
            rationaleShort: "Generic platform-puffery and a start-today CTA are finance-adjacent, but do not by themselves constitute a qualifying v1 claim."
        },
        pageExpectation: {
            expectedFindingIds: [],
            expectedCardMode: "not_applicable",
            shouldShowFinancialCard: true
        }
    }),
    example({
        bucket: "adversarial_negative",
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
        },
        pageExpectation: {
            expectedFindingIds: [],
            expectedCardMode: "not_applicable",
            shouldShowFinancialCard: true
        }
    })
];
function summarizeFinancialCommercialClaimsDataset(examples = exports.FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED) {
    const bucketCounts = Object.fromEntries(DATASET_BUCKETS.map((bucket) => [bucket, 0]));
    const cardModeCounts = Object.fromEntries(CARD_EXPECTATION_MODES.map((mode) => [mode, 0]));
    const emittableFindingCounts = Object.fromEntries(EMITTABLE_FINDING_IDS.map((findingId) => [findingId, 0]));
    let trainCount = 0;
    let evalCount = 0;
    let examplesWithSourceUrlCount = 0;
    for (const example of examples) {
        bucketCounts[example.bucket] += 1;
        cardModeCounts[example.pageExpectation.expectedCardMode] += 1;
        trainCount += example.split === "train" ? 1 : 0;
        evalCount += example.split === "eval" ? 1 : 0;
        examplesWithSourceUrlCount += typeof example.sourceUrl === "string" ? 1 : 0;
        for (const findingId of example.pageExpectation.expectedFindingIds) {
            emittableFindingCounts[findingId] += 1;
        }
    }
    return {
        adversarialNegativeCount: bucketCounts.adversarial_negative,
        bucketCounts,
        cardModeCounts,
        emittableFindingCounts,
        evalCount,
        examplesWithSourceUrlCount,
        negativeFinancialCount: bucketCounts.negative_financial,
        negativeNonfinancialCount: bucketCounts.negative_nonfinancial,
        positiveBorderlineCount: bucketCounts.positive_borderline,
        positiveHighConfidenceCount: bucketCounts.positive_high_confidence,
        trainCount
    };
}
function toFinancialCommercialClaimsJsonl() {
    return exports.FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.map((entry) => JSON.stringify({
        messages: [
            {
                role: "system",
                content: "Classify website claim blocks conservatively. Return structured financial/commercial claim observations only. Do not make legal conclusions."
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
            bucket: entry.bucket,
            expectedCardMode: entry.pageExpectation.expectedCardMode,
            expectedFindingIds: entry.pageExpectation.expectedFindingIds,
            id: entry.id,
            notes: entry.notes,
            sourceUrl: entry.sourceUrl ?? null,
            shouldShowFinancialCard: entry.pageExpectation.shouldShowFinancialCard,
            split: entry.split
        }
    })).join("\n");
}
