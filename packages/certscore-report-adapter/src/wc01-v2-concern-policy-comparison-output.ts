import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
  compareV2NormalizedConcernCandidatesJson,
  compareV2NormalizedConcernCandidates,
  type Wc01V2ConcernPolicyComparisonDryRun,
} from "./wc01-v2-concern-policy-comparison";
import type { V2NormalizedConcernAdapterDryRun } from "./wc01-v2-normalized-concern-adapter";

export type Wc01V2ConcernPolicyComparisonInspectionSummary = {
  source: Wc01V2ConcernPolicyComparisonDryRun["source"];
  productionEligible: false;
  topFindingEligible: false;
  gapEligible: false;
  status: "comparison_review_only";
  candidateCount: number;
  resultCount: number;
  blockedCandidateCount: number;
  outcomesByStatus: Record<string, number>;
  resultsByFamily: Record<string, number>;
  missingRequirementCounts: Record<string, number>;
  reasonCounts: Record<string, number>;
  guardrails: Wc01V2ConcernPolicyComparisonDryRun["guardrails"];
};

export type Wc01V2ConcernPolicyComparisonBatchSiteResult = {
  inputPath: string;
  siteKey: string;
  status: "succeeded" | "failed";
  outputPath?: string;
  summaryPath?: string;
  errorMessage?: string;
  summary?: Wc01V2ConcernPolicyComparisonInspectionSummary;
};

export type Wc01V2ConcernPolicyComparisonBatchSummary = {
  inputDir: string;
  outputDir: string;
  totalInputFilesFound: number;
  succeededCount: number;
  failedCount: number;
  failures: Array<{
    inputPath: string;
    errorMessage: string;
    siteKey: string;
  }>;
  totalCandidates: number;
  totalResults: number;
  totalBlockedCandidates: number;
  outcomesByStatus: Record<string, number>;
  resultsByFamily: Record<string, number>;
  missingRequirementCounts: Record<string, number>;
  reasonCounts: Record<string, number>;
  guardrailFailures: Array<{
    failures: string[];
    siteKey: string;
  }>;
  malformedArtifacts: Array<{
    inputPath: string;
    errorMessage: string;
    siteKey: string;
  }>;
  sitesWithResults: string[];
  sitesWithZeroResults: string[];
  siteResults: Wc01V2ConcernPolicyComparisonBatchSiteResult[];
};

type GenerateSingleInput = {
  inputPath: string;
  outPath: string;
  summaryPath?: string | false;
};

type GenerateSingleFromAdapterRunInput = {
  adapterRun: V2NormalizedConcernAdapterDryRun;
  outPath: string;
  summaryPath?: string | false;
};

type GenerateBatchInput = {
  aggregateJsonPath?: string;
  aggregateMarkdownPath?: string;
  inputDir: string;
  outDir: string;
};

export async function generateWc01V2ConcernPolicyComparisonSingleFromFile(input: GenerateSingleInput) {
  const comparison = compareV2NormalizedConcernCandidatesJson(await readFile(input.inputPath, "utf8"));
  return writeWc01V2ConcernPolicyComparisonSingle({
    comparison,
    outPath: input.outPath,
    summaryPath: input.summaryPath,
  });
}

export async function generateWc01V2ConcernPolicyComparisonSingleFromAdapterRun(
  input: GenerateSingleFromAdapterRunInput,
) {
  const comparison = compareV2NormalizedConcernCandidates(input.adapterRun);
  return writeWc01V2ConcernPolicyComparisonSingle({
    comparison,
    outPath: input.outPath,
    summaryPath: input.summaryPath,
  });
}

async function writeWc01V2ConcernPolicyComparisonSingle(input: {
  comparison: Wc01V2ConcernPolicyComparisonDryRun;
  outPath: string;
  summaryPath?: string | false;
}) {
  const comparison = input.comparison;
  const summary = buildWc01V2ConcernPolicyComparisonInspectionSummary(comparison);
  const summaryPath = input.summaryPath === false
    ? null
    : input.summaryPath ?? join(dirname(input.outPath), "Wc01V2ConcernPolicyComparisonDryRun.summary.md");

  await mkdir(dirname(input.outPath), { recursive: true });
  await writeFile(input.outPath, `${JSON.stringify(comparison, null, 2)}\n`, "utf8");

  if (summaryPath) {
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, renderWc01V2ConcernPolicyComparisonMarkdown(summary), "utf8");
  }

  return { comparison, summary, summaryPath };
}

export async function generateWc01V2ConcernPolicyComparisonBatch(
  input: GenerateBatchInput,
): Promise<Wc01V2ConcernPolicyComparisonBatchSummary> {
  const inputPaths = await findV2NormalizedConcernCandidateDraftFiles(input.inputDir);
  const siteResults: Wc01V2ConcernPolicyComparisonBatchSiteResult[] = [];

  for (const inputPath of inputPaths) {
    const siteKey = siteKeyForInputPath(input.inputDir, inputPath);
    const relativeOutputDir = dirname(relative(input.inputDir, inputPath));
    const outDir = relativeOutputDir === "." ? input.outDir : join(input.outDir, relativeOutputDir);
    const outputPath = join(outDir, "Wc01V2ConcernPolicyComparisonDryRun.json");
    const summaryPath = join(outDir, "Wc01V2ConcernPolicyComparisonDryRun.summary.md");

    try {
      const generated = await generateWc01V2ConcernPolicyComparisonSingleFromFile({
        inputPath,
        outPath: outputPath,
        summaryPath,
      });
      siteResults.push({
        inputPath,
        siteKey,
        status: "succeeded",
        outputPath,
        summaryPath,
        summary: generated.summary,
      });
    } catch (error) {
      siteResults.push({
        inputPath,
        siteKey,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = buildWc01V2ConcernPolicyComparisonBatchSummary({
    inputDir: input.inputDir,
    outputDir: input.outDir,
    siteResults,
    totalInputFilesFound: inputPaths.length,
  });
  const aggregateJsonPath = input.aggregateJsonPath ?? join(input.outDir, "wc01-v2-concern-policy-comparison-summary.json");
  const aggregateMarkdownPath = input.aggregateMarkdownPath ?? join(input.outDir, "wc01-v2-concern-policy-comparison-summary.md");

  await mkdir(input.outDir, { recursive: true });
  await writeFile(aggregateJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(aggregateMarkdownPath, renderWc01V2ConcernPolicyComparisonBatchMarkdown(summary), "utf8");

  return summary;
}

export async function findV2NormalizedConcernCandidateDraftFiles(inputDir: string) {
  const results: string[] = [];

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && entry.name === "V2NormalizedConcernCandidateDraft.json") {
        results.push(entryPath);
      }
    }
  }

  await walk(inputDir);
  return results.sort();
}

export function buildWc01V2ConcernPolicyComparisonInspectionSummary(
  comparison: Wc01V2ConcernPolicyComparisonDryRun,
): Wc01V2ConcernPolicyComparisonInspectionSummary {
  return {
    source: comparison.source,
    productionEligible: comparison.productionEligible,
    topFindingEligible: comparison.topFindingEligible,
    gapEligible: comparison.gapEligible,
    status: comparison.status,
    candidateCount: comparison.candidateCount,
    resultCount: comparison.comparisonResults.length,
    blockedCandidateCount: comparison.blockedCandidates.length,
    outcomesByStatus: countBy(comparison.comparisonResults.map((result) => result.simulatedPolicyOutcome)),
    resultsByFamily: countBy(comparison.comparisonResults.map((result) => result.sourceFamily)),
    missingRequirementCounts: countBy(comparison.comparisonResults.flatMap((result) => result.missingRequirements)),
    reasonCounts: countBy(comparison.comparisonResults.flatMap((result) => result.reasons)),
    guardrails: comparison.guardrails,
  };
}

export function renderWc01V2ConcernPolicyComparisonMarkdown(
  summary: Wc01V2ConcernPolicyComparisonInspectionSummary,
) {
  return [
    "# WC01 v2 Concern Policy Comparison Dry Run",
    "",
    "Dry run only. Mock policy-shape comparison. Not production concern policy. Not persisted normalized concerns. Not customer-facing report output.",
    "",
    `- Source URL: ${summary.source.sourceUrl}`,
    `- Scan ID: ${summary.source.scanId}`,
    `- Review ID: ${summary.source.reviewId ?? "unknown"}`,
    `- Adapter version: ${summary.source.adapterVersion}`,
    `- Production eligible: ${String(summary.productionEligible)}`,
    `- Top-finding eligible: ${String(summary.topFindingEligible)}`,
    `- Gap eligible: ${String(summary.gapEligible)}`,
    `- Status: ${summary.status}`,
    `- Candidates: ${summary.candidateCount}`,
    `- Results: ${summary.resultCount}`,
    `- Blocked candidates: ${summary.blockedCandidateCount}`,
    "",
    "## Outcomes By Status",
    "",
    renderCountTable(summary.outcomesByStatus, "Status"),
    "",
    "## Results By Family",
    "",
    renderCountTable(summary.resultsByFamily, "Family"),
    "",
    "## Missing Requirements",
    "",
    renderCountTable(summary.missingRequirementCounts, "Requirement"),
    "",
    "## Reasons",
    "",
    renderCountTable(summary.reasonCounts, "Reason"),
    "",
    "## Guardrails",
    "",
    `- no production concern policy call: ${String(summary.guardrails.noProductionConcernPolicyCall)}`,
    `- no persistence: ${String(summary.guardrails.noPersistence)}`,
    `- no unified findings: ${String(summary.guardrails.noUnifiedFindings)}`,
    `- no report mutation: ${String(summary.guardrails.noReportMutation)}`,
    `- no checklist/executive/scoring imports: ${String(summary.guardrails.noChecklistExecutiveScoringImports)}`,
    `- no customer-facing copy: ${String(summary.guardrails.noCustomerFacingCopy)}`,
    `- no forbidden gap status token: ${String(summary.guardrails.noGapObserved)}`,
    `- no legal-conclusion language: ${String(summary.guardrails.noLegalConclusionLanguage)}`,
    `- no raw blocked fields: ${String(summary.guardrails.noRawBlockedFields)}`,
    "",
  ].join("\n");
}

export function buildWc01V2ConcernPolicyComparisonBatchSummary(input: {
  inputDir: string;
  outputDir: string;
  siteResults: Wc01V2ConcernPolicyComparisonBatchSiteResult[];
  totalInputFilesFound: number;
}): Wc01V2ConcernPolicyComparisonBatchSummary {
  const succeeded = input.siteResults.filter((result) => result.status === "succeeded" && result.summary);
  const failed = input.siteResults.filter((result) => result.status === "failed");
  const outcomesByStatus: Record<string, number> = {};
  const resultsByFamily: Record<string, number> = {};
  const missingRequirementCounts: Record<string, number> = {};
  const reasonCounts: Record<string, number> = {};
  const guardrailFailures: Wc01V2ConcernPolicyComparisonBatchSummary["guardrailFailures"] = [];
  const sitesWithResults: string[] = [];
  const sitesWithZeroResults: string[] = [];
  let totalCandidates = 0;
  let totalResults = 0;
  let totalBlockedCandidates = 0;

  for (const result of succeeded) {
    const summary = result.summary!;
    totalCandidates += summary.candidateCount;
    totalResults += summary.resultCount;
    totalBlockedCandidates += summary.blockedCandidateCount;
    addCounts(outcomesByStatus, summary.outcomesByStatus);
    addCounts(resultsByFamily, summary.resultsByFamily);
    addCounts(missingRequirementCounts, summary.missingRequirementCounts);
    addCounts(reasonCounts, summary.reasonCounts);

    if (summary.resultCount > 0) {
      sitesWithResults.push(result.siteKey);
    } else {
      sitesWithZeroResults.push(result.siteKey);
    }

    const failures = Object.entries(summary.guardrails)
      .filter(([, passed]) => !passed)
      .map(([key]) => key);
    if (summary.productionEligible || summary.topFindingEligible || summary.gapEligible) {
      failures.push("forbidden_eligibility");
    }
    if (failures.length > 0) {
      guardrailFailures.push({ siteKey: result.siteKey, failures });
    }
  }

  return {
    inputDir: input.inputDir,
    outputDir: input.outputDir,
    totalInputFilesFound: input.totalInputFilesFound,
    succeededCount: succeeded.length,
    failedCount: failed.length,
    failures: failed.map((result) => ({
      inputPath: result.inputPath,
      errorMessage: result.errorMessage ?? "Unknown failure.",
      siteKey: result.siteKey,
    })),
    totalCandidates,
    totalResults,
    totalBlockedCandidates,
    outcomesByStatus,
    resultsByFamily,
    missingRequirementCounts,
    reasonCounts,
    guardrailFailures,
    malformedArtifacts: failed.map((result) => ({
      inputPath: result.inputPath,
      errorMessage: result.errorMessage ?? "Unknown failure.",
      siteKey: result.siteKey,
    })),
    sitesWithResults: uniqueStrings(sitesWithResults),
    sitesWithZeroResults: uniqueStrings(sitesWithZeroResults),
    siteResults: input.siteResults,
  };
}

export function renderWc01V2ConcernPolicyComparisonBatchMarkdown(
  summary: Wc01V2ConcernPolicyComparisonBatchSummary,
) {
  return [
    "# WC01 v2 Concern Policy Comparison Batch Summary",
    "",
    "Dry run only. Mock policy-shape comparison. Not production concern policy. Not persisted normalized concerns. Not customer-facing report output.",
    "",
    `- Input directory: ${summary.inputDir}`,
    `- Output directory: ${summary.outputDir}`,
    `- Input files found: ${summary.totalInputFilesFound}`,
    `- Succeeded: ${summary.succeededCount}`,
    `- Failed: ${summary.failedCount}`,
    `- Candidates: ${summary.totalCandidates}`,
    `- Results: ${summary.totalResults}`,
    `- Blocked candidates: ${summary.totalBlockedCandidates}`,
    "",
    "## Outcomes By Status",
    "",
    renderCountTable(summary.outcomesByStatus, "Status"),
    "",
    "## Results By Family",
    "",
    renderCountTable(summary.resultsByFamily, "Family"),
    "",
    "## Missing Requirements",
    "",
    renderCountTable(summary.missingRequirementCounts, "Requirement"),
    "",
    "## Reasons",
    "",
    renderCountTable(summary.reasonCounts, "Reason"),
    "",
    "## Sites With Results",
    "",
    ...renderStringRows(summary.sitesWithResults),
    "",
    "## Sites With Zero Results",
    "",
    ...renderStringRows(summary.sitesWithZeroResults),
    "",
    "## Guardrail Failures",
    "",
    ...renderGuardrailFailureRows(summary.guardrailFailures),
    "",
    "## Malformed Artifacts",
    "",
    ...renderFailureRows(summary.malformedArtifacts),
    "",
  ].join("\n");
}

function countBy(values: string[]) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function addCounts(target: Record<string, number>, source: Record<string, number>) {
  for (const [key, count] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + count;
  }
}

function renderCountTable(counts: Record<string, number>, label: string) {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return `| ${label} | Count |\n|---|---:|\n| none | 0 |`;
  }
  return [
    `| ${label} | Count |`,
    "|---|---:|",
    ...entries.map(([key, count]) => `| ${key} | ${count} |`),
  ].join("\n");
}

function renderStringRows(values: string[]) {
  return values.length > 0 ? values.map((value) => `- ${value}`) : ["- none"];
}

function renderFailureRows(
  failures: Wc01V2ConcernPolicyComparisonBatchSummary["malformedArtifacts"],
) {
  if (failures.length === 0) {
    return ["- none"];
  }
  return [
    "| Site | Input path | Error |",
    "|---|---|---|",
    ...failures.map((failure) =>
      `| ${failure.siteKey} | ${failure.inputPath} | ${failure.errorMessage.replace(/\|/g, "/")} |`
    ),
  ];
}

function renderGuardrailFailureRows(
  failures: Wc01V2ConcernPolicyComparisonBatchSummary["guardrailFailures"],
) {
  if (failures.length === 0) {
    return ["- none"];
  }
  return [
    "| Site | Failures |",
    "|---|---|",
    ...failures.map((failure) =>
      `| ${failure.siteKey} | ${failure.failures.join(", ")} |`
    ),
  ];
}

function siteKeyForInputPath(inputDir: string, inputPath: string) {
  const relativeDir = dirname(relative(inputDir, inputPath));
  return relativeDir === "." ? "root" : relativeDir.split(/[\\/]+/g).join("/");
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort();
}
