import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
  simulateConcernPolicyForInputDraftJson,
  simulateConcernPolicyForInputDraft,
  type Wc01V2ConcernPolicySimulationDryRun,
  type Wc01V2SimulatedConcernOutcome,
} from "./wc01-v2-concern-policy-simulation";
import type { Wc01V2ConcernPolicyInputDraft } from "./wc01-v2-concern-policy-input-draft";

export type Wc01V2ConcernPolicySimulationInspectionSummary = {
  source: Wc01V2ConcernPolicySimulationDryRun["source"];
  productionEligible: false;
  status: "simulation_review_only";
  totalInputs: number;
  simulatedOutcomeCount: number;
  blockedInputCount: number;
  outcomesByFamily: Record<string, number>;
  outcomesBySimulatedPolicyStatus: Record<string, number>;
  sensitiveContextOutcomeCount: number;
  vendorPurposeCounts: Record<string, number>;
  blockedInputReasons: Record<string, number>;
  guardrails: Wc01V2ConcernPolicySimulationDryRun["guardrails"];
};

export type Wc01V2ConcernPolicySimulationBatchSiteResult = {
  inputPath: string;
  siteKey: string;
  status: "succeeded" | "failed";
  outputPath?: string;
  summaryPath?: string;
  errorMessage?: string;
  summary?: Wc01V2ConcernPolicySimulationInspectionSummary;
};

export type Wc01V2ConcernPolicySimulationBatchSummary = {
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
  totalInputs: number;
  totalSimulatedOutcomes: number;
  totalBlockedInputs: number;
  outcomesByFamily: Record<string, number>;
  outcomesBySimulatedPolicyStatus: Record<string, number>;
  sensitiveContextOutcomeCount: number;
  vendorPurposeCounts: Record<string, number>;
  blockedInputReasons: Record<string, number>;
  guardrailFailures: Array<{
    failures: string[];
    siteKey: string;
  }>;
  malformedArtifacts: Array<{
    inputPath: string;
    errorMessage: string;
    siteKey: string;
  }>;
  sitesWithOutcomes: string[];
  sitesWithZeroOutcomes: string[];
  siteResults: Wc01V2ConcernPolicySimulationBatchSiteResult[];
};

type GenerateSingleInput = {
  inputPath: string;
  outPath: string;
  summaryPath?: string | false;
};

type GenerateSingleFromInputDraftInput = {
  inputDraft: Wc01V2ConcernPolicyInputDraft;
  outPath: string;
  summaryPath?: string | false;
};

type GenerateBatchInput = {
  aggregateJsonPath?: string;
  aggregateMarkdownPath?: string;
  inputDir: string;
  outDir: string;
};

export async function generateWc01V2ConcernPolicySimulationSingleFromFile(input: GenerateSingleInput) {
  const simulation = simulateConcernPolicyForInputDraftJson(await readFile(input.inputPath, "utf8"));
  return writeWc01V2ConcernPolicySimulationSingle({
    outPath: input.outPath,
    simulation,
    summaryPath: input.summaryPath,
  });
}

export async function generateWc01V2ConcernPolicySimulationSingleFromInputDraft(
  input: GenerateSingleFromInputDraftInput,
) {
  const simulation = simulateConcernPolicyForInputDraft(input.inputDraft);
  return writeWc01V2ConcernPolicySimulationSingle({
    outPath: input.outPath,
    simulation,
    summaryPath: input.summaryPath,
  });
}

async function writeWc01V2ConcernPolicySimulationSingle(input: {
  outPath: string;
  simulation: Wc01V2ConcernPolicySimulationDryRun;
  summaryPath?: string | false;
}) {
  const simulation = input.simulation;
  const summary = buildWc01V2ConcernPolicySimulationInspectionSummary(simulation);
  const summaryPath = input.summaryPath === false
    ? null
    : input.summaryPath ?? join(dirname(input.outPath), "Wc01V2ConcernPolicySimulationDryRun.summary.md");

  await mkdir(dirname(input.outPath), { recursive: true });
  await writeFile(input.outPath, `${JSON.stringify(simulation, null, 2)}\n`, "utf8");

  if (summaryPath) {
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, renderWc01V2ConcernPolicySimulationMarkdown(summary), "utf8");
  }

  return { simulation, summary, summaryPath };
}

export async function generateWc01V2ConcernPolicySimulationBatch(
  input: GenerateBatchInput,
): Promise<Wc01V2ConcernPolicySimulationBatchSummary> {
  const inputPaths = await findWc01V2ConcernPolicyInputDraftFiles(input.inputDir);
  const siteResults: Wc01V2ConcernPolicySimulationBatchSiteResult[] = [];

  for (const inputPath of inputPaths) {
    const siteKey = siteKeyForInputPath(input.inputDir, inputPath);
    const relativeOutputDir = dirname(relative(input.inputDir, inputPath));
    const outDir = relativeOutputDir === "." ? input.outDir : join(input.outDir, relativeOutputDir);
    const outputPath = join(outDir, "Wc01V2ConcernPolicySimulationDryRun.json");
    const summaryPath = join(outDir, "Wc01V2ConcernPolicySimulationDryRun.summary.md");

    try {
      const generated = await generateWc01V2ConcernPolicySimulationSingleFromFile({
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

  const summary = buildWc01V2ConcernPolicySimulationBatchSummary({
    inputDir: input.inputDir,
    outputDir: input.outDir,
    siteResults,
    totalInputFilesFound: inputPaths.length,
  });
  const aggregateJsonPath = input.aggregateJsonPath ?? join(input.outDir, "wc01-v2-concern-policy-simulation-summary.json");
  const aggregateMarkdownPath = input.aggregateMarkdownPath ?? join(input.outDir, "wc01-v2-concern-policy-simulation-summary.md");

  await mkdir(input.outDir, { recursive: true });
  await writeFile(aggregateJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(aggregateMarkdownPath, renderWc01V2ConcernPolicySimulationBatchMarkdown(summary), "utf8");

  return summary;
}

export async function findWc01V2ConcernPolicyInputDraftFiles(inputDir: string) {
  const results: string[] = [];

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && entry.name === "Wc01V2ConcernPolicyInputDraft.json") {
        results.push(entryPath);
      }
    }
  }

  await walk(inputDir);
  return results.sort();
}

export function buildWc01V2ConcernPolicySimulationInspectionSummary(
  simulation: Wc01V2ConcernPolicySimulationDryRun,
): Wc01V2ConcernPolicySimulationInspectionSummary {
  return {
    source: simulation.source,
    productionEligible: simulation.productionEligible,
    status: simulation.status,
    totalInputs: simulation.simulatedConcernOutcomes.length + simulation.blockedInputs.length,
    simulatedOutcomeCount: simulation.simulatedConcernOutcomes.length,
    blockedInputCount: simulation.blockedInputs.length,
    outcomesByFamily: countBy(simulation.simulatedConcernOutcomes.map((outcome) => outcome.concernFamily)),
    outcomesBySimulatedPolicyStatus: countBy(simulation.simulatedConcernOutcomes.map((outcome) => outcome.simulatedPolicyStatus)),
    sensitiveContextOutcomeCount: simulation.simulatedConcernOutcomes.filter((outcome) =>
      outcome.simulatedPolicyStatus === "policy_review_candidate_sensitive_context" ||
      outcome.policyRequirements.requiresSensitiveContextReview
    ).length,
    vendorPurposeCounts: countBy(simulation.simulatedConcernOutcomes.flatMap(outcomeVendorPurposes)),
    blockedInputReasons: countBy(simulation.blockedInputs.flatMap((input) => input.blockReasons)),
    guardrails: simulation.guardrails,
  };
}

export function renderWc01V2ConcernPolicySimulationMarkdown(
  summary: Wc01V2ConcernPolicySimulationInspectionSummary,
) {
  return [
    "# WC01 v2 Concern Policy Simulation Dry Run",
    "",
    "Dry run only. Not production concern policy. Not persisted normalized concerns. Not customer-facing report output.",
    "",
    `- Source URL: ${summary.source.url}`,
    `- Scan ID: ${summary.source.scanId}`,
    `- Review ID: ${summary.source.reviewId ?? "unknown"}`,
    `- Input draft version: ${summary.source.inputDraftVersion}`,
    `- Production eligible: ${String(summary.productionEligible)}`,
    `- Status: ${summary.status}`,
    `- Total inputs: ${summary.totalInputs}`,
    `- Simulated outcomes: ${summary.simulatedOutcomeCount}`,
    `- Blocked inputs: ${summary.blockedInputCount}`,
    `- Sensitive-context outcomes: ${summary.sensitiveContextOutcomeCount}`,
    "",
    "## Outcomes By Family",
    "",
    renderCountTable(summary.outcomesByFamily, "Family"),
    "",
    "## Outcomes By Simulated Policy Status",
    "",
    renderCountTable(summary.outcomesBySimulatedPolicyStatus, "Status"),
    "",
    "## Vendor Purpose Counts",
    "",
    renderCountTable(summary.vendorPurposeCounts, "Purpose"),
    "",
    "## Blocked Input Reasons",
    "",
    renderCountTable(summary.blockedInputReasons, "Reason"),
    "",
    "## Guardrails",
    "",
    `- no forbidden gap status token: ${String(summary.guardrails.noGapObserved)}`,
    `- no top-finding eligibility: ${String(summary.guardrails.noTopFindingEligibility)}`,
    `- no gap eligibility: ${String(summary.guardrails.noGapEligibility)}`,
    `- no production eligibility: ${String(summary.guardrails.noProductionEligibility)}`,
    `- no raw blocked fields: ${String(summary.guardrails.noRawBlockedFields)}`,
    `- no legal-conclusion language: ${String(summary.guardrails.noLegalConclusionLanguage)}`,
    "",
  ].join("\n");
}

export function buildWc01V2ConcernPolicySimulationBatchSummary(input: {
  inputDir: string;
  outputDir: string;
  siteResults: Wc01V2ConcernPolicySimulationBatchSiteResult[];
  totalInputFilesFound: number;
}): Wc01V2ConcernPolicySimulationBatchSummary {
  const succeeded = input.siteResults.filter((result) => result.status === "succeeded" && result.summary);
  const failed = input.siteResults.filter((result) => result.status === "failed");
  const outcomesByFamily: Record<string, number> = {};
  const outcomesBySimulatedPolicyStatus: Record<string, number> = {};
  const vendorPurposeCounts: Record<string, number> = {};
  const blockedInputReasons: Record<string, number> = {};
  const guardrailFailures: Wc01V2ConcernPolicySimulationBatchSummary["guardrailFailures"] = [];
  const sitesWithOutcomes: string[] = [];
  const sitesWithZeroOutcomes: string[] = [];
  let totalInputs = 0;
  let totalSimulatedOutcomes = 0;
  let totalBlockedInputs = 0;
  let sensitiveContextOutcomeCount = 0;

  for (const result of succeeded) {
    const summary = result.summary!;
    totalInputs += summary.totalInputs;
    totalSimulatedOutcomes += summary.simulatedOutcomeCount;
    totalBlockedInputs += summary.blockedInputCount;
    sensitiveContextOutcomeCount += summary.sensitiveContextOutcomeCount;
    addCounts(outcomesByFamily, summary.outcomesByFamily);
    addCounts(outcomesBySimulatedPolicyStatus, summary.outcomesBySimulatedPolicyStatus);
    addCounts(vendorPurposeCounts, summary.vendorPurposeCounts);
    addCounts(blockedInputReasons, summary.blockedInputReasons);

    if (summary.simulatedOutcomeCount > 0) {
      sitesWithOutcomes.push(result.siteKey);
    } else {
      sitesWithZeroOutcomes.push(result.siteKey);
    }

    const failures = Object.entries(summary.guardrails)
      .filter(([, passed]) => !passed)
      .map(([key]) => key);
    if (summary.productionEligible !== false) {
      failures.push("productionEligible_not_false");
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
    totalInputs,
    totalSimulatedOutcomes,
    totalBlockedInputs,
    outcomesByFamily,
    outcomesBySimulatedPolicyStatus,
    sensitiveContextOutcomeCount,
    vendorPurposeCounts,
    blockedInputReasons,
    guardrailFailures,
    malformedArtifacts: failed.map((result) => ({
      inputPath: result.inputPath,
      errorMessage: result.errorMessage ?? "Unknown failure.",
      siteKey: result.siteKey,
    })),
    sitesWithOutcomes: uniqueStrings(sitesWithOutcomes),
    sitesWithZeroOutcomes: uniqueStrings(sitesWithZeroOutcomes),
    siteResults: input.siteResults,
  };
}

export function renderWc01V2ConcernPolicySimulationBatchMarkdown(
  summary: Wc01V2ConcernPolicySimulationBatchSummary,
) {
  return [
    "# WC01 v2 Concern Policy Simulation Batch Summary",
    "",
    "Dry run only. Not production concern policy. Not persisted normalized concerns. Not customer-facing report output.",
    "",
    `- Input directory: ${summary.inputDir}`,
    `- Output directory: ${summary.outputDir}`,
    `- Input files found: ${summary.totalInputFilesFound}`,
    `- Succeeded: ${summary.succeededCount}`,
    `- Failed: ${summary.failedCount}`,
    `- Total inputs: ${summary.totalInputs}`,
    `- Simulated outcomes: ${summary.totalSimulatedOutcomes}`,
    `- Blocked inputs: ${summary.totalBlockedInputs}`,
    `- Sensitive-context outcomes: ${summary.sensitiveContextOutcomeCount}`,
    "",
    "## Outcomes By Family",
    "",
    renderCountTable(summary.outcomesByFamily, "Family"),
    "",
    "## Outcomes By Simulated Policy Status",
    "",
    renderCountTable(summary.outcomesBySimulatedPolicyStatus, "Status"),
    "",
    "## Vendor Purpose Counts",
    "",
    renderCountTable(summary.vendorPurposeCounts, "Purpose"),
    "",
    "## Blocked Input Reasons",
    "",
    renderCountTable(summary.blockedInputReasons, "Reason"),
    "",
    "## Sites With Outcomes",
    "",
    ...renderStringRows(summary.sitesWithOutcomes),
    "",
    "## Sites With Zero Outcomes",
    "",
    ...renderStringRows(summary.sitesWithZeroOutcomes),
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

function outcomeVendorPurposes(outcome: Wc01V2SimulatedConcernOutcome) {
  return [
    ...outcome.evidenceSummary.supportingPurposes,
    ...outcome.evidenceSummary.diagnosticPurposes,
  ];
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
  failures: Wc01V2ConcernPolicySimulationBatchSummary["malformedArtifacts"],
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
  failures: Wc01V2ConcernPolicySimulationBatchSummary["guardrailFailures"],
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
