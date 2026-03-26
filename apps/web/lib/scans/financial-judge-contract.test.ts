import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFinancialJudgePrompt,
  financialJudgeInputSchema,
  financialJudgeOutputSchema,
  getStoredFinancialJudgeOutput
} from "./financial-judge-contract";

test("financial judge schemas accept the typed pilot contract", () => {
  const input = financialJudgeInputSchema.parse({
    candidateFindingId: "fee_disclosure_present",
    evidence: {
      exactMatchTerm: "monthly fee",
      matchedPhrases: ["monthly fee"],
      pageClassification: "pricing_or_fees",
      pageUrl: "https://example.com/pricing",
      signalKeys: ["commercial.explicit_fee_disclosure_text_present"],
      snippets: ["A monthly fee of $25 applies to premium managed accounts."],
      sourceUrls: ["https://example.com/pricing"],
      supportingHeadings: ["Pricing"]
    },
    negativeEvidenceFlags: [],
    scanContext: {
      domain: "example.com",
      pageType: "pricing"
    }
  });

  const output = financialJudgeOutputSchema.parse({
    buyerFacingEligible: false,
    confidence: 0.42,
    evidenceStrength: "moderate",
    rationaleCode: "missing_user_facing_url",
    retained: true,
    verdict: "keep_audit_only"
  });

  assert.equal(input.candidateFindingId, "fee_disclosure_present");
  assert.equal(output.verdict, "keep_audit_only");
});

test("financial judge prompt is adversarial, structured, and pilot-scoped", () => {
  const prompt = buildFinancialJudgePrompt({
    candidateFindingId: "apr_or_interest_rate_disclosure_present",
    evidence: {
      exactMatchTerm: "APR",
      matchedPhrases: ["APR"],
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
      pageType: "product"
    }
  });

  assert.match(prompt, /find reasons to discard or downgrade/i);
  assert.match(prompt, /return strict JSON/i);
  assert.match(prompt, /Do not make legal conclusions/i);
  assert.match(prompt, /fee_disclosure_present, apr_or_interest_rate_disclosure_present, past_performance_disclaimer_present/i);
  assert.match(prompt, /"candidateFindingId": "apr_or_interest_rate_disclosure_present"/i);
});

test("stored financial judge verdicts parse from retained evidence", () => {
  assert.deepEqual(
    getStoredFinancialJudgeOutput({
      financialJudgeVerdict: {
        buyerFacingEligible: false,
        confidence: 0.41,
        evidenceStrength: "moderate",
        rationaleCode: "missing_user_facing_url",
        retained: true,
        verdict: "keep_audit_only"
      }
    }),
    {
      buyerFacingEligible: false,
      confidence: 0.41,
      evidenceStrength: "moderate",
      rationaleCode: "missing_user_facing_url",
      retained: true,
      verdict: "keep_audit_only"
    }
  );
});
