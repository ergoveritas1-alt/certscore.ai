import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveFinancialCommercialExpectedCardMode,
  deriveFinancialCommercialExpectedFindingIds,
  evaluateFinancialCommercialClaimsDataset,
  evaluateFinancialCommercialClaimsDatasetExample
} from "./financial-commercial-claims-eval";
import { FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED } from "./financial-commercial-claims.dataset";

test("deriveFinancialCommercialExpectedFindingIds mirrors the current deterministic emission intent", () => {
  const guaranteeExample = FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.find((entry) => entry.id === "tradestem-guaranteed-profit-positive");
  assert.ok(guaranteeExample);

  const findingIds = deriveFinancialCommercialExpectedFindingIds({
    candidate: guaranteeExample.input,
    classification: guaranteeExample.expected
  });

  assert.deepEqual(findingIds, []);
});

test("deriveFinancialCommercialExpectedCardMode omits non-commercial negatives", () => {
  const nonCommercial = FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.find((entry) => entry.id === "educational-article-negative");
  assert.ok(nonCommercial);

  const mode = deriveFinancialCommercialExpectedCardMode({
    classification: nonCommercial.expected,
    findingIds: []
  });

  assert.equal(mode, "omit");
});

test("evaluateFinancialCommercialClaimsDatasetExample matches declared expectations for seeded examples", () => {
  const example = FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.find((entry) => entry.id === "grailwealth-backtest-million-positive");
  assert.ok(example);

  const result = evaluateFinancialCommercialClaimsDatasetExample(example);
  assert.equal(result.isMatch, true);
  assert.deepEqual(result.derivedFindingIds, ["simulated_performance_without_disclosure"]);
  assert.equal(result.derivedCardMode, "findings");
});

test("evaluateFinancialCommercialClaimsDataset keeps the seeded corpus aligned with current deterministic logic", () => {
  const summary = evaluateFinancialCommercialClaimsDataset();

  assert.equal(summary.evaluatedCount, FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.length);
  assert.equal(summary.overallMatchCount, FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.length);
  assert.equal(summary.findingIdsMatchCount, FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.length);
  assert.equal(summary.cardModeMatchCount, FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.length);
  assert.equal(summary.shouldShowCardMatchCount, FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.length);
  assert.deepEqual(summary.mismatches, []);
});
