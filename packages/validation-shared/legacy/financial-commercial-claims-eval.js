"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveFinancialCommercialExpectedFindingIds = deriveFinancialCommercialExpectedFindingIds;
exports.deriveFinancialCommercialExpectedCardMode = deriveFinancialCommercialExpectedCardMode;
exports.evaluateFinancialCommercialClaimsDatasetExample = evaluateFinancialCommercialClaimsDatasetExample;
exports.evaluateFinancialCommercialClaimsDataset = evaluateFinancialCommercialClaimsDataset;
const financial_commercial_claims_dataset_1 = require("./financial-commercial-claims.dataset");
const FINANCIAL_COMMERCIAL_CLAIM_MIN_CONFIDENCE = 0.78;
const FINANCIAL_COMMERCIAL_STRONG_SIGNAL_MIN_CONFIDENCE = 0.72;
function isReturnOrEarningsLikeFinancialClaim(input) {
    return input.claimType === "earnings_claim" || input.claimType === "return_performance_claim";
}
function hasDirectEarningsStyleLanguage(text) {
    if (!text) {
        return false;
    }
    return /\b(earn|earned|earning|earnings|income|profit|profitable|profits|make money|passive income|cash flow|cashflow)\b/i.test(text);
}
function hasDirectSuperlativeLanguage(text) {
    if (!text) {
        return false;
    }
    return /\b(best|top|leading|highest|number\s*1|#1|most|fastest|ultimate|premier)\b/i.test(text);
}
function hasStrongFinancialCommercialSignalMix(input) {
    if (!input.claimPresent) {
        return false;
    }
    const signalSet = new Set(input.candidateSignals);
    if (!signalSet.has("investment_context")) {
        return false;
    }
    const earningsLikeClaim = isReturnOrEarningsLikeFinancialClaim({
        blockText: input.blockText,
        claimText: input.claimText,
        claimType: input.claimType
    });
    return (earningsLikeClaim ||
        signalSet.has("returns") ||
        signalSet.has("earnings") ||
        signalSet.has("results_social_proof"));
}
function meetsFinancialCommercialBaseConfidenceThreshold(input) {
    if (input.confidence >= FINANCIAL_COMMERCIAL_CLAIM_MIN_CONFIDENCE) {
        return true;
    }
    return (input.confidence >= FINANCIAL_COMMERCIAL_STRONG_SIGNAL_MIN_CONFIDENCE &&
        hasStrongFinancialCommercialSignalMix(input));
}
function shouldEmitReturnOrEarningsDisclosureFinding(input) {
    if (!input.classification.claimPresent || input.classification.adjacentDisclosurePresent) {
        return false;
    }
    if (input.classification.claimType === "earnings_claim") {
        return true;
    }
    if (input.classification.claimType !== "return_performance_claim") {
        return false;
    }
    const signalSet = new Set(input.candidateSignals);
    const directEarningsLanguage = hasDirectEarningsStyleLanguage(input.classification.claimText);
    const directSuperlativeLanguage = hasDirectSuperlativeLanguage(input.classification.claimText);
    return (directEarningsLanguage ||
        input.classification.guaranteeLanguage ||
        (input.classification.superlativeLanguage &&
            (directSuperlativeLanguage || signalSet.has("superlative"))) ||
        input.classification.simulatedPerformanceLanguage ||
        signalSet.has("results_social_proof"));
}
function shouldEmitFinancialUrgencyFinding(input) {
    const signalSet = new Set(input.candidateSignals);
    return (signalSet.has("urgency") &&
        input.classification.urgencyPresent &&
        input.classification.urgencyTiedToConversion &&
        !input.classification.adjacentDisclosurePresent);
}
function shouldEmitPricingTransparencyFinding(input) {
    if (!input.classification.pricingPresent ||
        input.classification.feeDisclosurePresent ||
        input.classification.adjacentDisclosurePresent ||
        input.classification.confidence < FINANCIAL_COMMERCIAL_STRONG_SIGNAL_MIN_CONFIDENCE) {
        return false;
    }
    const signalSet = new Set(input.candidateSignals);
    return signalSet.has("pricing") && signalSet.has("cta");
}
function shouldEmitSuperlativeFinding(input) {
    if (!input.classification.superlativeLanguage ||
        !input.classification.claimPresent ||
        input.classification.confidence < FINANCIAL_COMMERCIAL_STRONG_SIGNAL_MIN_CONFIDENCE) {
        return false;
    }
    const signalSet = new Set(input.candidateSignals);
    if (!signalSet.has("investment_context")) {
        return false;
    }
    return signalSet.has("superlative") || hasDirectSuperlativeLanguage(input.classification.claimText);
}
function deriveFinancialCommercialExpectedFindingIds(input) {
    const { candidate, classification } = input;
    if (!classification.commercialContext ||
        !classification.claimPresent ||
        !meetsFinancialCommercialBaseConfidenceThreshold({
            blockText: candidate.blockText,
            candidateSignals: candidate.candidateSignals,
            claimPresent: classification.claimPresent,
            claimText: classification.claimText,
            claimType: classification.claimType,
            confidence: classification.confidence
        })) {
        return [];
    }
    const findingIds = new Set();
    if (classification.guaranteeLanguage || classification.claimType === "guaranteed_outcome_claim") {
        findingIds.add("guaranteed_outcome_claim_detected");
    }
    if (shouldEmitReturnOrEarningsDisclosureFinding({
        candidateSignals: candidate.candidateSignals,
        classification
    })) {
        findingIds.add("earnings_claim_without_adjacent_disclosure");
    }
    if ((classification.simulatedPerformanceLanguage || classification.claimType === "simulated_performance_claim") &&
        !classification.adjacentDisclosurePresent) {
        findingIds.add("simulated_performance_without_disclosure");
    }
    if (shouldEmitSuperlativeFinding({
        candidateSignals: candidate.candidateSignals,
        classification
    })) {
        findingIds.add("unqualified_superlative_claim_detected");
    }
    if (shouldEmitFinancialUrgencyFinding({
        candidateSignals: candidate.candidateSignals,
        classification
    })) {
        findingIds.add("financial_urgency_pressure_tactic_detected");
    }
    if (shouldEmitPricingTransparencyFinding({
        candidateSignals: candidate.candidateSignals,
        classification
    })) {
        findingIds.add("pricing_or_fee_transparency_unclear");
    }
    return [...findingIds];
}
function deriveFinancialCommercialExpectedCardMode(input) {
    if (input.findingIds.length > 0) {
        return "findings";
    }
    return input.classification.commercialContext ? "not_applicable" : "omit";
}
function evaluateFinancialCommercialClaimsDatasetExample(example) {
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
function evaluateFinancialCommercialClaimsDataset(examples = financial_commercial_claims_dataset_1.FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED) {
    const results = examples.map(evaluateFinancialCommercialClaimsDatasetExample);
    const mismatches = results.filter((result) => !result.isMatch);
    const cardModeMatchCount = results.filter((result, index) => result.derivedCardMode === examples[index]?.pageExpectation.expectedCardMode).length;
    return {
        cardModeMatchCount,
        evaluatedCount: results.length,
        findingIdsMatchCount: results.filter((result) => result.findingIdsMatch).length,
        mismatches,
        overallMatchCount: results.filter((result) => result.isMatch).length,
        shouldShowCardMatchCount: results.filter((result) => result.shouldShowCardMatch).length
    };
}
