import {
  evaluateFinancialCommercialClaimsDataset,
  FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED,
  summarizeFinancialCommercialClaimsDataset
} from "../packages/validation-shared/src";

function percent(part: number, whole: number) {
  if (whole <= 0) {
    return "0.0%";
  }

  return `${((part / whole) * 100).toFixed(1)}%`;
}

function main() {
  const corpus = summarizeFinancialCommercialClaimsDataset(FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED);
  const evaluation = evaluateFinancialCommercialClaimsDataset(FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED);

  console.log("Financial claims corpus summary");
  console.log(`examples: ${corpus.trainCount + corpus.evalCount} (${corpus.trainCount} train / ${corpus.evalCount} eval)`);
  console.log(`source-backed examples: ${corpus.examplesWithSourceUrlCount}`);
  console.log("");
  console.log("Buckets");
  console.log(`positive_high_confidence: ${corpus.positiveHighConfidenceCount}`);
  console.log(`positive_borderline: ${corpus.positiveBorderlineCount}`);
  console.log(`negative_financial: ${corpus.negativeFinancialCount}`);
  console.log(`negative_nonfinancial: ${corpus.negativeNonfinancialCount}`);
  console.log(`adversarial_negative: ${corpus.adversarialNegativeCount}`);
  console.log("");
  console.log("Card modes");
  console.log(`findings: ${corpus.cardModeCounts.findings}`);
  console.log(`not_applicable: ${corpus.cardModeCounts.not_applicable}`);
  console.log(`omit: ${corpus.cardModeCounts.omit}`);
  console.log("");
  console.log("Deterministic eval alignment");
  console.log(`overall: ${evaluation.overallMatchCount}/${evaluation.evaluatedCount} (${percent(evaluation.overallMatchCount, evaluation.evaluatedCount)})`);
  console.log(`finding ids: ${evaluation.findingIdsMatchCount}/${evaluation.evaluatedCount} (${percent(evaluation.findingIdsMatchCount, evaluation.evaluatedCount)})`);
  console.log(`card mode: ${evaluation.cardModeMatchCount}/${evaluation.evaluatedCount} (${percent(evaluation.cardModeMatchCount, evaluation.evaluatedCount)})`);
  console.log(`card visibility: ${evaluation.shouldShowCardMatchCount}/${evaluation.evaluatedCount} (${percent(evaluation.shouldShowCardMatchCount, evaluation.evaluatedCount)})`);

  if (evaluation.mismatches.length > 0) {
    console.log("");
    console.log("Mismatches");
    for (const mismatch of evaluation.mismatches) {
      console.log(`- ${mismatch.exampleId}: findings=${mismatch.derivedFindingIds.join(", ") || "(none)"} card=${mismatch.derivedCardMode}`);
    }
  }
}

main();
