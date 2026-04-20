import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFinancialCommercialClaimPrompt,
  financialCommercialClaimCandidateInputSchema,
  financialCommercialClaimClassificationSchema
} from "./financial-commercial-claims";

test("financial commercial claim schemas accept the v1 detector contract", () => {
  const input = financialCommercialClaimCandidateInputSchema.parse({
    adjacentAfter: "Limited spots available. Join now.",
    adjacentBefore: null,
    blockHeading: "Trading Academy",
    blockText: "Earn up to $5,000 per month with our premium signals service.",
    candidateSignals: ["earnings", "currency", "cta"],
    pageType: "marketing_page",
    pageUrl: "https://example.com/academy",
    sourceType: "document_source"
  });

  assert.equal(input.sourceType, "document_source");

  const output = financialCommercialClaimClassificationSchema.parse({
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
    confidence: 0.9,
    rationaleShort: "Earnings-style claim near signup CTA without nearby balancing language."
  });

  assert.equal(output.claimType, "earnings_claim");
  assert.equal(output.urgencyTiedToConversion, true);
});

test("financial commercial claim prompt stays narrow and non-legal", () => {
  const prompt = buildFinancialCommercialClaimPrompt({
    adjacentAfter: "Join now before the price goes up.",
    adjacentBefore: "Premium plan",
    blockHeading: "Growth plan",
    blockText: "Best returns in the market. Act now and subscribe today.",
    candidateSignals: ["superlative", "urgency", "cta"],
    pageType: "pricing_page",
    pageUrl: "https://example.com/pricing",
    sourceType: "page_evidence"
  });

  assert.match(prompt, /not a legal conclusion task/i);
  assert.match(prompt, /Return strict JSON only/i);
  assert.match(prompt, /claimType: earnings_claim, return_performance_claim, guaranteed_outcome_claim/i);
});
