import {
  evaluateFinancialCommercialClaimsDataset,
  FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED,
  summarizeFinancialCommercialClaimsDataset,
  toFinancialCommercialClaimsJsonl
} from "../packages/validation-shared/src";

function percent(part: number, whole: number) {
  if (whole <= 0) {
    return "0.0%";
  }

  return `${((part / whole) * 100).toFixed(1)}%`;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function renderMarkdownSummary(input: {
  aligned: boolean;
  corpus: ReturnType<typeof summarizeFinancialCommercialClaimsDataset>;
  corpusHealthIssues: string[];
  evaluation: ReturnType<typeof evaluateFinancialCommercialClaimsDataset>;
  healthy: boolean;
}) {
  const { aligned, corpus, corpusHealthIssues, evaluation, healthy } = input;
  const lines = [
    "## Financial Claims Corpus",
    "",
    `- Alignment: ${aligned ? "pass" : "fail"} (${evaluation.overallMatchCount}/${evaluation.evaluatedCount})`,
    `- Corpus health: ${healthy ? "pass" : "fail"}`,
    `- Train / eval: ${corpus.trainCount} / ${corpus.evalCount}`,
    `- Source-backed examples: ${corpus.examplesWithSourceUrlCount}`,
    "",
    "### Buckets",
    "",
    `- positive_high_confidence: ${corpus.positiveHighConfidenceCount}`,
    `- positive_borderline: ${corpus.positiveBorderlineCount}`,
    `- negative_financial: ${corpus.negativeFinancialCount}`,
    `- negative_nonfinancial: ${corpus.negativeNonfinancialCount}`,
    `- adversarial_negative: ${corpus.adversarialNegativeCount}`,
    "",
    "### Card Modes",
    "",
    `- findings: ${corpus.cardModeCounts.findings}`,
    `- not_applicable: ${corpus.cardModeCounts.not_applicable}`,
    `- omit: ${corpus.cardModeCounts.omit}`,
    "",
    "### Deterministic Eval",
    "",
    `- overall: ${evaluation.overallMatchCount}/${evaluation.evaluatedCount} (${percent(evaluation.overallMatchCount, evaluation.evaluatedCount)})`,
    `- finding ids: ${evaluation.findingIdsMatchCount}/${evaluation.evaluatedCount} (${percent(evaluation.findingIdsMatchCount, evaluation.evaluatedCount)})`,
    `- card mode: ${evaluation.cardModeMatchCount}/${evaluation.evaluatedCount} (${percent(evaluation.cardModeMatchCount, evaluation.evaluatedCount)})`,
    `- card visibility: ${evaluation.shouldShowCardMatchCount}/${evaluation.evaluatedCount} (${percent(evaluation.shouldShowCardMatchCount, evaluation.evaluatedCount)})`
  ];

  if (corpusHealthIssues.length > 0) {
    lines.push("", "### Corpus Health Issues", "");
    for (const issue of corpusHealthIssues) {
      lines.push(`- ${issue}`);
    }
  }

  if (evaluation.mismatches.length > 0) {
    lines.push("", "### Mismatches", "");
    for (const mismatch of evaluation.mismatches) {
      lines.push(`- ${mismatch.exampleId}: findings=${mismatch.derivedFindingIds.join(", ") || "(none)"} card=${mismatch.derivedCardMode}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function getCorpusHealthIssues(input: {
  corpus: ReturnType<typeof summarizeFinancialCommercialClaimsDataset>;
}) {
  const issues: string[] = [];
  const { corpus } = input;

  for (const [bucket, count] of Object.entries(corpus.bucketCounts)) {
    if (count < 1) {
      issues.push(`missing bucket coverage: ${bucket}`);
    }
  }

  for (const [mode, count] of Object.entries(corpus.cardModeCounts)) {
    if (count < 1) {
      issues.push(`missing card-mode coverage: ${mode}`);
    }
  }

  for (const [findingId, count] of Object.entries(corpus.emittableFindingCounts)) {
    if (count < 1) {
      issues.push(`missing finding coverage: ${findingId}`);
    }
  }

  if (corpus.examplesWithSourceUrlCount < 1) {
    issues.push("missing source-backed examples");
  }

  if (corpus.trainCount < 1 || corpus.evalCount < 1) {
    issues.push("corpus must include both train and eval examples");
  }

  return issues;
}

function main() {
  const strict = hasFlag("--strict");
  const json = hasFlag("--json");
  const jsonl = hasFlag("--jsonl");
  const markdown = hasFlag("--markdown");
  const corpus = summarizeFinancialCommercialClaimsDataset(FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED);
  const evaluation = evaluateFinancialCommercialClaimsDataset(FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED);
  const corpusHealthIssues = getCorpusHealthIssues({ corpus });
  const aligned = evaluation.overallMatchCount === evaluation.evaluatedCount;
  const healthy = corpusHealthIssues.length === 0;

  if (jsonl) {
    const jsonlOutput = toFinancialCommercialClaimsJsonl();
    process.stdout.write(jsonlOutput);
    if (!jsonlOutput.endsWith("\n")) {
      process.stdout.write("\n");
    }
    if (strict && (!aligned || !healthy)) {
      process.exitCode = 1;
    }
    return;
  }

  if (markdown) {
    process.stdout.write(
      renderMarkdownSummary({
        aligned,
        corpus,
        corpusHealthIssues,
        evaluation,
        healthy
      })
    );
    if (strict && (!aligned || !healthy)) {
      process.exitCode = 1;
    }
    return;
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          aligned,
          corpus,
          corpusHealthIssues,
          evaluation,
          healthy,
          strict
        },
        null,
        2
      )
    );

    if (strict && (!aligned || !healthy)) {
      process.exitCode = 1;
    }
    return;
  }

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
  console.log("Corpus health");
  console.log(healthy ? "ok" : "issues detected");
  if (!healthy) {
    for (const issue of corpusHealthIssues) {
      console.log(`- ${issue}`);
    }
    console.log("");
  }
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

  if (strict && (!aligned || !healthy)) {
    console.error("");
    if (!healthy) {
      console.error("financial claims corpus health regression:");
      for (const issue of corpusHealthIssues) {
        console.error(`- ${issue}`);
      }
    }
    if (!aligned) {
      console.error(
        `financial claims corpus alignment regression: ${evaluation.overallMatchCount}/${evaluation.evaluatedCount} examples aligned`
      );
    }
    process.exitCode = 1;
  }
}

main();
