import assert from "node:assert/strict";
import test from "node:test";
import {
  renderFinancialCommercialClaimsCoverageMarkdown,
  summarizeFinancialCommercialClaimsCoverage
} from "./financial-commercial-claims-coverage";
import { FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED } from "./financial-commercial-claims.dataset";

test("summarizeFinancialCommercialClaimsCoverage reflects the current corpus size and major sections", () => {
  const summary = summarizeFinancialCommercialClaimsCoverage();

  assert.equal(summary.currentExampleCount, FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.length);
  assert.ok(summary.bucketCounts.some((entry) => entry.key === "positive_high_confidence" && entry.count >= 1));
  assert.equal(
    summary.positivePageTypeByFindingId.map((entry) => String(entry.findingId)).includes("guaranteed_outcome_claim_detected"),
    false
  );
  assert.ok(summary.pageTypeCounts.some((entry) => entry.key === "homepage"));
  assert.ok(summary.positivePageTypeByFindingId.some((entry) => entry.findingId === "simulated_performance_without_disclosure"));
  assert.ok(summary.gapSummary.length >= 0);
});

test("renderFinancialCommercialClaimsCoverageMarkdown prints a human-readable report", () => {
  const markdown = renderFinancialCommercialClaimsCoverageMarkdown();

  assert.match(markdown, /^# Financial Claims Corpus Coverage/m);
  assert.match(markdown, /^## Dataset Buckets/m);
  assert.match(markdown, /^## Positive Finding Page-Type Matrix/m);
  assert.doesNotMatch(markdown, /guaranteed_outcome_claim_detected/);
});
