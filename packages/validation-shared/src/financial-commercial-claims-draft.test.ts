import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFinancialCommercialClaimsDraft,
  formatFinancialCommercialClaimsDraftExample
} from "./financial-commercial-claims-draft";

test("buildFinancialCommercialClaimsDraft infers homepage earnings and pricing findings from a live-style trading snippet", () => {
  const draft = buildFinancialCommercialClaimsDraft({
    adjacentAfter: "Get funded and start now with commission-free access.",
    adjacentBefore: "FX Culture Trading",
    blockHeading: "Profit from forex moves",
    blockText: "Profit from forex moves with high leverage strategies, free signals, and copy trading insights.",
    pageType: "homepage",
    pageUrl: "https://fxculturetrading.com/"
  });

  assert.equal(draft.expected.claimPresent, true);
  assert.equal(draft.id, "fxculturetrading-home-profit-forex-moves");
  assert.equal(draft.expected.claimType, "earnings_claim");
  assert.equal(draft.expected.contextType, "financial_offer");
  assert.equal(draft.expected.pricingPresent, true);
  assert.deepEqual(draft.pageExpectation.expectedFindingIds.sort(), [
    "earnings_claim_without_adjacent_disclosure",
    "financial_urgency_pressure_tactic_detected",
    "pricing_or_fee_transparency_unclear"
  ]);
  assert.equal(draft.pageExpectation.expectedCardMode, "findings");
});

test("buildFinancialCommercialClaimsDraft omits non-financial SaaS profitability copy", () => {
  const draft = buildFinancialCommercialClaimsDraft({
    adjacentAfter: "Book a demo today.",
    adjacentBefore: "Operations platform",
    blockHeading: "Profitable stores",
    blockText: "Help your ecommerce team build more profitable stores with faster merchandising workflows.",
    pageType: "homepage",
    pageUrl: "https://example.com/merchandising"
  });

  assert.equal(draft.expected.claimPresent, true);
  assert.equal(draft.id, "example-home-profit-help-ecommerce");
  assert.equal(draft.expected.claimType, "earnings_claim");
  assert.equal(draft.expected.contextType, "marketing_page");
  assert.deepEqual(draft.pageExpectation.expectedFindingIds, []);
  assert.equal(draft.pageExpectation.expectedCardMode, "omit");
});

test("formatFinancialCommercialClaimsDraftExample emits a paste-ready example block", () => {
  const formatted = formatFinancialCommercialClaimsDraftExample({
    blockHeading: "Guaranteed signals",
    blockText: "Get guaranteed forex signals from our elite analysts every week.",
    pageType: "homepage",
    pageUrl: "https://example.com/guaranteed-signals-home"
  });

  assert.match(formatted, /^example\(\{/);
  assert.match(formatted, /id: "example-home-guaranteed-forex-signals"/);
  assert.match(formatted, /expectedFindingIds/);
  assert.match(formatted, /guaranteed_outcome_claim_detected/);
});
