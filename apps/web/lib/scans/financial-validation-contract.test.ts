import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateFinancialJudgeInput,
  classifyFinancialPage,
  getFinancialValidationEvidenceBundle,
  getFinancialValidationSpec,
  isFinancialValidationFindingId
} from "./financial-validation-contract";

test("financial validation specs cover the current conservative finding set", () => {
  assert.equal(isFinancialValidationFindingId("fee_disclosure_present"), true);
  assert.equal(isFinancialValidationFindingId("past_performance_disclaimer_present"), true);
  assert.equal(isFinancialValidationFindingId("apr_or_interest_rate_disclosure_present"), true);
  assert.equal(isFinancialValidationFindingId("not_a_real_financial_finding"), false);

  assert.deepEqual(getFinancialValidationSpec("fee_disclosure_present"), {
    evidenceCategory: "fee_disclosure",
    findingId: "fee_disclosure_present",
    requiredSignalKeys: ["commercial.explicit_fee_disclosure_text_present"]
  });
});

test("classifyFinancialPage keeps financial contexts structured and conservative", () => {
  assert.equal(classifyFinancialPage({ pageType: "pricing" }), "pricing_or_fees");
  assert.equal(classifyFinancialPage({ pageClassification: "privacy_policy" }), "disclosure_or_legal");
  assert.equal(classifyFinancialPage({ pageType: "contact" }), "identity_or_contact");
  assert.equal(classifyFinancialPage({ pageType: "product" }), "financial_offer");
  assert.equal(classifyFinancialPage({ pageType: "unknown" }), "unknown");
});

test("getFinancialValidationEvidenceBundle normalizes retained financial evidence", () => {
  assert.deepEqual(
    getFinancialValidationEvidenceBundle({
      matchedSnippet: "Variable APR 24.99% applies after the introductory period.",
      matchedTerm: "APR",
      pageType: "product",
      pageUrl: "https://example.com/cards/gold",
      signalKey: "financial.apr_or_interest_rate_disclosure_text_present",
      sourceUrls: ["https://example.com/cards/gold"],
      surroundingHeading: "Rates and fees"
    }),
    {
      exactMatchTerm: "APR",
      matchedPhrases: ["APR"],
      pageClassification: "financial_offer",
      pageUrl: "https://example.com/cards/gold",
      signalKeys: ["financial.apr_or_interest_rate_disclosure_text_present"],
      snippets: ["Variable APR 24.99% applies after the introductory period."],
      sourceUrls: ["https://example.com/cards/gold"],
      supportingHeadings: ["Rates and fees"]
    }
  );
});

test("getFinancialValidationEvidenceBundle returns null when no retained content exists", () => {
  assert.equal(getFinancialValidationEvidenceBundle({}), null);
});

test("evaluateFinancialJudgeInput keeps thin financial evidence audit-only and suppresses non-financial contexts", () => {
  assert.deepEqual(
    evaluateFinancialJudgeInput({
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
        pageType: "pricing"
      }
    }).verdict,
    "confirm"
  );

  assert.deepEqual(
    evaluateFinancialJudgeInput({
      candidateFindingId: "fee_disclosure_present",
      evidence: {
        exactMatchTerm: "monthly fee",
        matchedPhrases: ["monthly fee"],
        pageClassification: "unknown",
        pageUrl: "https://example.com/product",
        signalKeys: ["commercial.explicit_fee_disclosure_text_present"],
        snippets: ["A monthly fee of $25 applies."],
        sourceUrls: ["https://example.com/product"],
        supportingHeadings: []
      },
      negativeEvidenceFlags: [],
      scanContext: {
        domain: "example.com",
        pageType: "product"
      }
    }).verdict,
    "suppress"
  );

  assert.deepEqual(
    evaluateFinancialJudgeInput({
      candidateFindingId: "apr_or_interest_rate_disclosure_present",
      evidence: {
        exactMatchTerm: "APR",
        matchedPhrases: ["APR"],
        pageClassification: "financial_offer",
        pageUrl: null,
        signalKeys: ["financial.apr_or_interest_rate_disclosure_text_present"],
        snippets: ["Variable APR 24.99% applies after the introductory period."],
        sourceUrls: [],
        supportingHeadings: ["Rates and fees"]
      },
      negativeEvidenceFlags: [],
      scanContext: {
        domain: "example.com",
        pageType: "product"
      }
    }).verdict,
    "keep_audit_only"
  );
});
