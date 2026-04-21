import assert from "node:assert/strict";
import test from "node:test";
import {
  FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED,
  summarizeFinancialCommercialClaimsDataset,
  toFinancialCommercialClaimsJsonl
} from "./financial-commercial-claims.dataset";

test("financial commercial claims dataset seed includes train and eval examples", () => {
  assert.ok(FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.length >= 6);
  assert.ok(FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.some((entry) => entry.split === "train"));
  assert.ok(FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.some((entry) => entry.split === "eval"));
  assert.ok(FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.some((entry) => typeof entry.sourceUrl === "string"));
  assert.ok(FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.some((entry) => entry.bucket === "adversarial_negative"));
  assert.ok(FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.some((entry) => entry.bucket === "negative_financial"));
  assert.ok(FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.some((entry) => entry.pageExpectation.expectedCardMode === "omit"));
});

test("financial commercial claims dataset jsonl exporter emits parseable rows", () => {
  const lines = toFinancialCommercialClaimsJsonl().trim().split("\n");

  assert.equal(lines.length, FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.length);

  for (const line of lines) {
    const row = JSON.parse(line) as {
      messages: Array<{ role: string }>;
      metadata: {
        expectedCardMode: string;
        expectedFindingIds: unknown[];
        id: string;
        shouldShowFinancialCard: boolean;
        sourceUrl?: string | null;
      };
    };

    assert.equal(row.messages.length, 3);
    assert.equal(row.messages[0]?.role, "system");
    assert.equal(row.messages[1]?.role, "user");
    assert.equal(row.messages[2]?.role, "assistant");
    assert.ok(typeof row.metadata.id === "string" && row.metadata.id.length > 0);
    assert.ok(Array.isArray(row.metadata.expectedFindingIds));
    assert.equal(typeof row.metadata.expectedCardMode, "string");
    assert.equal(typeof row.metadata.shouldShowFinancialCard, "boolean");
  }

  assert.ok(lines.some((line) => Boolean((JSON.parse(line) as { metadata: { sourceUrl?: string | null } }).metadata.sourceUrl)));
});

test("financial commercial claims dataset summary exposes bucket and finding coverage", () => {
  const summary = summarizeFinancialCommercialClaimsDataset();

  assert.equal(summary.trainCount + summary.evalCount, FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.length);
  assert.ok(summary.positiveHighConfidenceCount >= 1);
  assert.ok(summary.negativeFinancialCount >= 1);
  assert.ok(summary.negativeNonfinancialCount >= 1);
  assert.ok(summary.adversarialNegativeCount >= 1);
  assert.ok(summary.cardModeCounts.findings >= 1);
  assert.ok(summary.cardModeCounts.not_applicable >= 1);
  assert.ok(summary.cardModeCounts.omit >= 1);
  assert.ok(summary.emittableFindingCounts.earnings_claim_without_adjacent_disclosure >= 1);
});
