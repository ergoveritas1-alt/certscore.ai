import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFinancialJudgePrompt,
  financialJudgeInputSchema,
  financialJudgeOutputSchema
} from "./financial-judge";

test("financial judge schemas accept the pilot contract", () => {
  const input = financialJudgeInputSchema.parse({
    candidateFindingId: "fee_disclosure_present",
    evidence: {
      exactMatchTerm: "monthly fee",
      matchedPhrases: ["monthly fee"],
      pageClassification: "pricing_or_fees",
      pageUrl: "https://example.com/pricing",
      signalKeys: ["commercial.explicit_fee_disclosure_text_present"],
      snippets: ["A monthly fee of $25 applies."],
      sourceUrls: ["https://example.com/pricing"],
      supportingHeadings: ["Pricing"]
    },
    negativeEvidenceFlags: [],
    scanContext: {
      domain: "example.com",
      pageType: "pricing_page"
    }
  });

  assert.equal(input.candidateFindingId, "fee_disclosure_present");

  const output = financialJudgeOutputSchema.parse({
    buyerFacingEligible: false,
    confidence: 0.55,
    evidenceStrength: "moderate",
    rationaleCode: "thin_single_source_evidence",
    retained: true,
    verdict: "keep_audit_only"
  });

  assert.equal(output.verdict, "keep_audit_only");
});

test("financial judge prompt is adversarial and pilot scoped", () => {
  const prompt = buildFinancialJudgePrompt({
    candidateFindingId: "apr_or_interest_rate_disclosure_present",
    evidence: {
      exactMatchTerm: "APR",
      matchedPhrases: ["APR", "24.99%"],
      pageClassification: "financial_offer",
      pageUrl: "https://example.com/cards/gold",
      signalKeys: ["financial.apr_or_interest_rate_disclosure_text_present"],
      snippets: ["Variable APR 24.99% applies after the introductory period."],
      sourceUrls: ["https://example.com/cards/gold"],
      supportingHeadings: ["Rates and fees"]
    },
    negativeEvidenceFlags: [],
    scanContext: {
      domain: "example.com",
      pageType: "credit_card_offer"
    }
  });

  assert.match(prompt, /find reasons to discard or downgrade/i);
  assert.match(prompt, /Do not make legal conclusions/i);
  assert.match(prompt, /fee_disclosure_present, apr_or_interest_rate_disclosure_present, past_performance_disclaimer_present/);
});

test("financial judge output derives redundant booleans from verdict when omitted", () => {
  const output = financialJudgeOutputSchema.parse({
    confidence: 0.61,
    evidenceStrength: "moderate",
    rationaleCode: "explicit_financial_evidence",
    verdict: "confirm"
  });

  assert.equal(output.buyerFacingEligible, true);
  assert.equal(output.retained, true);

  const suppressed = financialJudgeOutputSchema.parse({
    confidence: 0.24,
    evidenceStrength: "thin",
    rationaleCode: "non_financial_context",
    verdict: "suppress"
  });

  assert.equal(suppressed.buyerFacingEligible, false);
  assert.equal(suppressed.retained, false);
});

test("financial judge output normalizes common enum aliases", () => {
  const output = financialJudgeOutputSchema.parse({
    confidence: 0.7,
    evidenceStrength: "medium",
    rationaleCode: "nonfinancial_context",
    verdict: "inconclusive"
  });

  assert.equal(output.verdict, "keep_audit_only");
  assert.equal(output.evidenceStrength, "moderate");
  assert.equal(output.rationaleCode, "non_financial_context");
});
