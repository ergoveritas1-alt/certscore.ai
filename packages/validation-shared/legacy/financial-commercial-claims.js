"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.financialCommercialClaimClassificationSchema = exports.financialCommercialClaimCandidateInputSchema = void 0;
exports.buildFinancialCommercialClaimPrompt = buildFinancialCommercialClaimPrompt;
const SOURCE_TYPES = ["document_source", "page_evidence", "signal_hit"];
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
];
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
];
const DISCLOSURE_TYPES = [
    "risk_disclosure",
    "earnings_disclaimer",
    "simulation_disclaimer",
    "pricing_terms",
    "fee_schedule",
    "eligibility_or_conditions",
    "other",
    "none"
];
function isStringArray(value) {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
function isNullableString(value) {
    return value === null || typeof value === "string";
}
function isBoolean(value) {
    return typeof value === "boolean";
}
function isConfidence(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
function createSchema(validator) {
    return {
        parse(value) {
            return validator(value);
        },
        safeParse(value) {
            try {
                return { success: true, data: validator(value) };
            }
            catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error : new Error("Schema validation failed.")
                };
            }
        }
    };
}
function validateCandidateInput(value) {
    if (!value || typeof value !== "object") {
        throw new Error("Financial commercial claim candidate input must be an object.");
    }
    const record = value;
    if (typeof record.blockText !== "string" || record.blockText.trim().length < 20) {
        throw new Error("Candidate blockText must be a non-empty string.");
    }
    if (!SOURCE_TYPES.includes(record.sourceType)) {
        throw new Error("Unsupported candidate sourceType.");
    }
    if (!isStringArray(record.candidateSignals)) {
        throw new Error("candidateSignals must be a string array.");
    }
    if (!isNullableString(record.blockHeading) || !isNullableString(record.adjacentBefore) || !isNullableString(record.adjacentAfter)) {
        throw new Error("Candidate heading and adjacent context fields must be string|null.");
    }
    if (!isNullableString(record.pageType) || !isNullableString(record.pageUrl)) {
        throw new Error("Candidate pageType/pageUrl must be string|null.");
    }
    return {
        adjacentAfter: typeof record.adjacentAfter === "string" ? record.adjacentAfter : null,
        adjacentBefore: typeof record.adjacentBefore === "string" ? record.adjacentBefore : null,
        blockHeading: typeof record.blockHeading === "string" ? record.blockHeading : null,
        blockText: record.blockText.trim(),
        candidateSignals: record.candidateSignals,
        pageType: typeof record.pageType === "string" ? record.pageType : null,
        pageUrl: typeof record.pageUrl === "string" ? record.pageUrl : null,
        sourceType: record.sourceType
    };
}
function validateClassificationOutput(value) {
    if (!value || typeof value !== "object") {
        throw new Error("Financial commercial claim classification must be an object.");
    }
    const record = value;
    if (!isBoolean(record.claimPresent)) {
        throw new Error("claimPresent must be boolean.");
    }
    if (!CLAIM_TYPES.includes(record.claimType)) {
        throw new Error("Unsupported claimType.");
    }
    if (!isNullableString(record.claimText)) {
        throw new Error("claimText must be string|null.");
    }
    if (!isBoolean(record.commercialContext)) {
        throw new Error("commercialContext must be boolean.");
    }
    if (!CONTEXT_TYPES.includes(record.contextType)) {
        throw new Error("Unsupported contextType.");
    }
    if (!isBoolean(record.adjacentDisclosurePresent)) {
        throw new Error("adjacentDisclosurePresent must be boolean.");
    }
    if (record.adjacentDisclosureType !== null &&
        !DISCLOSURE_TYPES.includes(record.adjacentDisclosureType)) {
        throw new Error("Unsupported adjacentDisclosureType.");
    }
    if (!isNullableString(record.adjacentDisclosureText)) {
        throw new Error("adjacentDisclosureText must be string|null.");
    }
    if (!isBoolean(record.guaranteeLanguage) ||
        !isBoolean(record.superlativeLanguage) ||
        !isBoolean(record.simulatedPerformanceLanguage) ||
        !isBoolean(record.urgencyPresent) ||
        !isBoolean(record.urgencyTiedToConversion) ||
        !isBoolean(record.pricingPresent) ||
        !isBoolean(record.feeDisclosurePresent)) {
        throw new Error("Classification booleans are missing.");
    }
    if (!isConfidence(record.confidence)) {
        throw new Error("confidence must be between 0 and 1.");
    }
    if (typeof record.rationaleShort !== "string" || record.rationaleShort.trim().length === 0) {
        throw new Error("rationaleShort must be a non-empty string.");
    }
    return {
        adjacentDisclosurePresent: record.adjacentDisclosurePresent,
        adjacentDisclosureText: typeof record.adjacentDisclosureText === "string" ? record.adjacentDisclosureText : null,
        adjacentDisclosureType: record.adjacentDisclosureType === null
            ? null
            : record.adjacentDisclosureType,
        claimPresent: record.claimPresent,
        claimText: typeof record.claimText === "string" ? record.claimText : null,
        claimType: record.claimType,
        commercialContext: record.commercialContext,
        confidence: record.confidence,
        contextType: record.contextType,
        feeDisclosurePresent: record.feeDisclosurePresent,
        guaranteeLanguage: record.guaranteeLanguage,
        pricingPresent: record.pricingPresent,
        rationaleShort: record.rationaleShort.trim(),
        simulatedPerformanceLanguage: record.simulatedPerformanceLanguage,
        superlativeLanguage: record.superlativeLanguage,
        urgencyPresent: record.urgencyPresent,
        urgencyTiedToConversion: record.urgencyTiedToConversion
    };
}
exports.financialCommercialClaimCandidateInputSchema = createSchema(validateCandidateInput);
exports.financialCommercialClaimClassificationSchema = createSchema(validateClassificationOutput);
function buildFinancialCommercialClaimPrompt(input) {
    const payload = exports.financialCommercialClaimCandidateInputSchema.parse(input);
    return [
        "You classify narrow website text blocks for CertScore's Financial & Commercial Claims Risk detector.",
        "This is not a legal conclusion task.",
        "Do not describe content as fraudulent, deceptive, unlawful, or non-compliant.",
        "Only classify observable text and nearby disclosure patterns.",
        "Work conservatively.",
        "If the block is not clearly financial or commercial in context, return commercialContext=false and claimPresent=false unless a concrete pricing or conversion-risk pattern is directly visible.",
        "Only treat adjacent disclosure as present when balancing language is actually visible in the block or immediately adjacent context.",
        "Only tie urgency to conversion when the urgency language appears connected to a signup, purchase, subscribe, apply, enroll, or similar CTA.",
        "Return strict JSON only.",
        "Use these enums exactly:",
        `claimType: ${CLAIM_TYPES.join(", ")}`,
        `contextType: ${CONTEXT_TYPES.join(", ")}`,
        `adjacentDisclosureType: ${DISCLOSURE_TYPES.join(", ")}`,
        "",
        "Return JSON in exactly this shape:",
        JSON.stringify({
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
            urgencyPresent: true,
            urgencyTiedToConversion: true,
            pricingPresent: false,
            feeDisclosurePresent: false,
            confidence: 0.88,
            rationaleShort: "Earnings-style claim near signup CTA without nearby balancing language."
        }, null, 2),
        "",
        "Classification guidance:",
        "- claimText should be the shortest exact quoted snippet that best captures the claim or pressure language.",
        "- Use claimType=none when no qualifying claim or pressure pattern is present.",
        "- In trading, investing, forex, crypto, or signal-provider context, profitability or performance marketing can still be a qualifying claim even without a dollar amount or percentage.",
        '- Treat phrases such as "learn & profit", "consistently profitable", "real results", "success stories", or similar profitability/performance language near a trading offer as claims when they are presented as promotional outcomes or results.',
        "- Testimonials, student-result copy, and community-result copy count only when they visibly communicate profitability, returns, or performance in a commercial offer context.",
        "- superlativeLanguage covers unqualified superiority claims such as best, #1, highest returns, safest, or lowest fees.",
        "- pricingPresent means pricing, plan, fee, cost, billing, rate, or charge language is visible in the focus block.",
        "- feeDisclosurePresent means the focus block or immediately adjacent context clearly explains fees, pricing terms, rates, or material conditions.",
        "",
        "Input JSON:",
        JSON.stringify(payload, null, 2)
    ].join("\n");
}
