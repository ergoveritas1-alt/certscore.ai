import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
  projectSimulationJsonToNormalizedConcernCandidateDraft,
  projectSimulationToNormalizedConcernCandidateDraft,
  type V2NormalizedConcernAdapterDryRun,
  type V2NormalizedConcernCandidateDraft,
} from "./wc01-v2-normalized-concern-adapter";
import type { Wc01V2ConcernPolicySimulationDryRun } from "./wc01-v2-concern-policy-simulation";

export type V2NormalizedConcernAdapterInspectionSummary = {
  source: V2NormalizedConcernAdapterDryRun["source"];
  productionEligible: false;
  status: "adapter_draft_review_only";
  candidateCount: number;
  blockedCandidateCount: number;
  candidatesByFamily: Record<string, number>;
  candidatesByNormalizedConcernKey: Record<string, number>;
  candidatesByEvidenceFamily: Record<string, number>;
  sensitiveContextCandidateCount: number;
  vendorPurposeCounts: Record<string, number>;
  diagnosticPurposeCounts: Record<string, number>;
  blockedReasons: Record<string, number>;
  guardrails: V2NormalizedConcernAdapterDryRun["guardrails"];
};

export type V2NormalizedConcernAdapterBatchSiteResult = {
  inputPath: string;
  siteKey: string;
  status: "succeeded" | "failed";
  outputPath?: string;
  summaryPath?: string;
  errorMessage?: string;
  summary?: V2NormalizedConcernAdapterInspectionSummary;
};

export type V2NormalizedConcernAdapterBatchSummary = {
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
  totalBlockedCandidates: number;
  candidatesByFamily: Record<string, number>;
  candidatesByNormalizedConcernKey: Record<string, number>;
  candidatesByEvidenceFamily: Record<string, number>;
  sensitiveContextCandidateCount: number;
  vendorPurposeCounts: Record<string, number>;
  diagnosticPurposeCounts: Record<string, number>;
  blockedReasons: Record<string, number>;
  guardrailFailures: Array<{
    failures: string[];
    siteKey: string;
  }>;
  malformedArtifacts: Array<{
    inputPath: string;
    errorMessage: string;
    siteKey: string;
  }>;
  sitesWithCandidates: string[];
  sitesWithZeroCandidates: string[];
  siteResults: V2NormalizedConcernAdapterBatchSiteResult[];
};

type GenerateSingleInput = {
  inputPath: string;
  outPath: string;
  summaryPath?: string | false;
};

type GenerateSingleFromSimulationInput = {
  outPath: string;
  simulation: Wc01V2ConcernPolicySimulationDryRun;
  summaryPath?: string | false;
};

type GenerateBatchInput = {
  aggregateJsonPath?: string;
  aggregateMarkdownPath?: string;
  inputDir: string;
  outDir: string;
};

export async function generateV2NormalizedConcernAdapterSingleFromFile(input: GenerateSingleInput) {
  const adapterRun = projectSimulationJsonToNormalizedConcernCandidateDraft(await readFile(input.inputPath, "utf8"));
  return writeV2NormalizedConcernAdapterSingle({
    adapterRun,
    outPath: input.outPath,
    summaryPath: input.summaryPath,
  });
}

export async function generateV2NormalizedConcernAdapterSingleFromSimulation(
  input: GenerateSingleFromSimulationInput,
) {
  const adapterRun = projectSimulationToNormalizedConcernCandidateDraft(input.simulation);
  return writeV2NormalizedConcernAdapterSingle({
    adapterRun,
    outPath: input.outPath,
    summaryPath: input.summaryPath,
  });
}

async function writeV2NormalizedConcernAdapterSingle(input: {
  adapterRun: V2NormalizedConcernAdapterDryRun;
  outPath: string;
  summaryPath?: string | false;
}) {
  const adapterRun = input.adapterRun;
  const summary = buildV2NormalizedConcernAdapterInspectionSummary(adapterRun);
  const summaryPath = input.summaryPath === false
    ? null
    : input.summaryPath ?? join(dirname(input.outPath), "V2NormalizedConcernCandidateDraft.summary.md");

  await mkdir(dirname(input.outPath), { recursive: true });
  await writeFile(input.outPath, `${JSON.stringify(adapterRun, null, 2)}\n`, "utf8");

  if (summaryPath) {
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, renderV2NormalizedConcernAdapterMarkdown(summary), "utf8");
  }

  return { adapterRun, summary, summaryPath };
}

export async function generateV2NormalizedConcernAdapterBatch(
  input: GenerateBatchInput,
): Promise<V2NormalizedConcernAdapterBatchSummary> {
  const inputPaths = await findWc01V2ConcernPolicySimulationFiles(input.inputDir);
  const siteResults: V2NormalizedConcernAdapterBatchSiteResult[] = [];

  for (const inputPath of inputPaths) {
    const siteKey = siteKeyForInputPath(input.inputDir, inputPath);
    const relativeOutputDir = dirname(relative(input.inputDir, inputPath));
    const outDir = relativeOutputDir === "." ? input.outDir : join(input.outDir, relativeOutputDir);
    const outputPath = join(outDir, "V2NormalizedConcernCandidateDraft.json");
    const summaryPath = join(outDir, "V2NormalizedConcernCandidateDraft.summary.md");

    try {
      const generated = await generateV2NormalizedConcernAdapterSingleFromFile({
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

  const summary = buildV2NormalizedConcernAdapterBatchSummary({
    inputDir: input.inputDir,
    outputDir: input.outDir,
    siteResults,
    totalInputFilesFound: inputPaths.length,
  });
  const aggregateJsonPath = input.aggregateJsonPath ?? join(input.outDir, "wc01-v2-normalized-concern-adapter-summary.json");
  const aggregateMarkdownPath = input.aggregateMarkdownPath ?? join(input.outDir, "wc01-v2-normalized-concern-adapter-summary.md");

  await mkdir(input.outDir, { recursive: true });
  await writeFile(aggregateJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(aggregateMarkdownPath, renderV2NormalizedConcernAdapterBatchMarkdown(summary), "utf8");

  return summary;
}

export async function findWc01V2ConcernPolicySimulationFiles(inputDir: string) {
  const results: string[] = [];

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && entry.name === "Wc01V2ConcernPolicySimulationDryRun.json") {
        results.push(entryPath);
      }
    }
  }

  await walk(inputDir);
  return results.sort();
}

export function buildV2NormalizedConcernAdapterInspectionSummary(
  adapterRun: V2NormalizedConcernAdapterDryRun,
): V2NormalizedConcernAdapterInspectionSummary {
  return {
    source: adapterRun.source,
    productionEligible: adapterRun.productionEligible,
    status: adapterRun.status,
    candidateCount: adapterRun.candidates.length,
    blockedCandidateCount: adapterRun.blockedCandidates.length,
    candidatesByFamily: countBy(adapterRun.candidates.map((candidate) => candidate.proposed.concernFamily)),
    candidatesByNormalizedConcernKey: countBy(adapterRun.candidates.map((candidate) => candidate.proposed.normalizedConcernKey)),
    candidatesByEvidenceFamily: countBy(adapterRun.candidates.map((candidate) => candidate.evidence.evidenceFamily)),
    sensitiveContextCandidateCount: adapterRun.candidates.filter((candidate) => candidate.sensitiveContext?.requiresExtraReview).length,
    vendorPurposeCounts: countBy(adapterRun.candidates.flatMap(candidateVendorPurposes)),
    diagnosticPurposeCounts: countBy(adapterRun.candidates.flatMap((candidate) => candidate.evidence.diagnosticPurposes)),
    blockedReasons: countBy(adapterRun.blockedCandidates.flatMap((candidate) => candidate.blockReasons)),
    guardrails: adapterRun.guardrails,
  };
}

export function renderV2NormalizedConcernAdapterMarkdown(
  summary: V2NormalizedConcernAdapterInspectionSummary,
) {
  return [
    "# WC01 v2 Normalized Concern Candidate Adapter",
    "",
    "Dry run only. Not production concern policy. Not persisted normalized concerns. Not customer-facing report output.",
    "",
    `- Source URL: ${summary.source.url}`,
    `- Scan ID: ${summary.source.scanId}`,
    `- Review ID: ${summary.source.reviewId ?? "unknown"}`,
    `- Simulation version: ${summary.source.simulationVersion}`,
    `- Production eligible: ${String(summary.productionEligible)}`,
    `- Status: ${summary.status}`,
    `- Candidates: ${summary.candidateCount}`,
    `- Blocked candidates: ${summary.blockedCandidateCount}`,
    `- Sensitive-context candidates: ${summary.sensitiveContextCandidateCount}`,
    "",
    "## Candidates By Family",
    "",
    renderCountTable(summary.candidatesByFamily, "Family"),
    "",
    "## Candidates By Normalized Concern Key",
    "",
    renderCountTable(summary.candidatesByNormalizedConcernKey, "Key"),
    "",
    "## Candidates By Evidence Family",
    "",
    renderCountTable(summary.candidatesByEvidenceFamily, "Evidence family"),
    "",
    "## Vendor Purpose Counts",
    "",
    renderCountTable(summary.vendorPurposeCounts, "Purpose"),
    "",
    "## Diagnostic Purpose Counts",
    "",
    renderCountTable(summary.diagnosticPurposeCounts, "Purpose"),
    "",
    "## Blocked Reasons",
    "",
    renderCountTable(summary.blockedReasons, "Reason"),
    "",
    "## Guardrails",
    "",
    `- no forbidden gap status token: ${String(summary.guardrails.noGapObserved)}`,
    `- no top-finding eligibility: ${String(summary.guardrails.noTopFindingEligibility)}`,
    `- no gap eligibility: ${String(summary.guardrails.noGapEligibility)}`,
    `- no production eligibility: ${String(summary.guardrails.noProductionEligibility)}`,
    `- no raw blocked fields: ${String(summary.guardrails.noRawBlockedFields)}`,
    `- no legal-conclusion language: ${String(summary.guardrails.noLegalConclusionLanguage)}`,
    `- no production concern policy call: ${String(summary.guardrails.noProductionConcernPolicyCall)}`,
    `- no persistence: ${String(summary.guardrails.noPersistence)}`,
    `- no unified findings: ${String(summary.guardrails.noUnifiedFindings)}`,
    `- no customer-facing copy: ${String(summary.guardrails.noCustomerFacingCopy)}`,
    "",
  ].join("\n");
}

export function buildV2NormalizedConcernAdapterBatchSummary(input: {
  inputDir: string;
  outputDir: string;
  siteResults: V2NormalizedConcernAdapterBatchSiteResult[];
  totalInputFilesFound: number;
}): V2NormalizedConcernAdapterBatchSummary {
  const succeeded = input.siteResults.filter((result) => result.status === "succeeded" && result.summary);
  const failed = input.siteResults.filter((result) => result.status === "failed");
  const candidatesByFamily: Record<string, number> = {};
  const candidatesByNormalizedConcernKey: Record<string, number> = {};
  const candidatesByEvidenceFamily: Record<string, number> = {};
  const vendorPurposeCounts: Record<string, number> = {};
  const diagnosticPurposeCounts: Record<string, number> = {};
  const blockedReasons: Record<string, number> = {};
  const guardrailFailures: V2NormalizedConcernAdapterBatchSummary["guardrailFailures"] = [];
  const sitesWithCandidates: string[] = [];
  const sitesWithZeroCandidates: string[] = [];
  let totalCandidates = 0;
  let totalBlockedCandidates = 0;
  let sensitiveContextCandidateCount = 0;

  for (const result of succeeded) {
    const summary = result.summary!;
    totalCandidates += summary.candidateCount;
    totalBlockedCandidates += summary.blockedCandidateCount;
    sensitiveContextCandidateCount += summary.sensitiveContextCandidateCount;
    addCounts(candidatesByFamily, summary.candidatesByFamily);
    addCounts(candidatesByNormalizedConcernKey, summary.candidatesByNormalizedConcernKey);
    addCounts(candidatesByEvidenceFamily, summary.candidatesByEvidenceFamily);
    addCounts(vendorPurposeCounts, summary.vendorPurposeCounts);
    addCounts(diagnosticPurposeCounts, summary.diagnosticPurposeCounts);
    addCounts(blockedReasons, summary.blockedReasons);

    if (summary.candidateCount > 0) {
      sitesWithCandidates.push(result.siteKey);
    } else {
      sitesWithZeroCandidates.push(result.siteKey);
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
    totalCandidates,
    totalBlockedCandidates,
    candidatesByFamily,
    candidatesByNormalizedConcernKey,
    candidatesByEvidenceFamily,
    sensitiveContextCandidateCount,
    vendorPurposeCounts,
    diagnosticPurposeCounts,
    blockedReasons,
    guardrailFailures,
    malformedArtifacts: failed.map((result) => ({
      inputPath: result.inputPath,
      errorMessage: result.errorMessage ?? "Unknown failure.",
      siteKey: result.siteKey,
    })),
    sitesWithCandidates: uniqueStrings(sitesWithCandidates),
    sitesWithZeroCandidates: uniqueStrings(sitesWithZeroCandidates),
    siteResults: input.siteResults,
  };
}

export function renderV2NormalizedConcernAdapterBatchMarkdown(
  summary: V2NormalizedConcernAdapterBatchSummary,
) {
  return [
    "# WC01 v2 Normalized Concern Candidate Adapter Batch Summary",
    "",
    "Dry run only. Not production concern policy. Not persisted normalized concerns. Not customer-facing report output.",
    "",
    `- Input directory: ${summary.inputDir}`,
    `- Output directory: ${summary.outputDir}`,
    `- Input files found: ${summary.totalInputFilesFound}`,
    `- Succeeded: ${summary.succeededCount}`,
    `- Failed: ${summary.failedCount}`,
    `- Candidates: ${summary.totalCandidates}`,
    `- Blocked candidates: ${summary.totalBlockedCandidates}`,
    `- Sensitive-context candidates: ${summary.sensitiveContextCandidateCount}`,
    "",
    "## Candidates By Family",
    "",
    renderCountTable(summary.candidatesByFamily, "Family"),
    "",
    "## Candidates By Normalized Concern Key",
    "",
    renderCountTable(summary.candidatesByNormalizedConcernKey, "Key"),
    "",
    "## Candidates By Evidence Family",
    "",
    renderCountTable(summary.candidatesByEvidenceFamily, "Evidence family"),
    "",
    "## Vendor Purpose Counts",
    "",
    renderCountTable(summary.vendorPurposeCounts, "Purpose"),
    "",
    "## Diagnostic Purpose Counts",
    "",
    renderCountTable(summary.diagnosticPurposeCounts, "Purpose"),
    "",
    "## Blocked Reasons",
    "",
    renderCountTable(summary.blockedReasons, "Reason"),
    "",
    "## Sites With Candidates",
    "",
    ...renderStringRows(summary.sitesWithCandidates),
    "",
    "## Sites With Zero Candidates",
    "",
    ...renderStringRows(summary.sitesWithZeroCandidates),
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

function candidateVendorPurposes(candidate: V2NormalizedConcernCandidateDraft) {
  return candidate.evidence.vendorPurposeBasis.map((basis) => basis.purpose);
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
  failures: V2NormalizedConcernAdapterBatchSummary["malformedArtifacts"],
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
  failures: V2NormalizedConcernAdapterBatchSummary["guardrailFailures"],
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
