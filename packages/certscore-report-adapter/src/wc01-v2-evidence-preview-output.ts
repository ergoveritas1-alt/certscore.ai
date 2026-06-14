import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
  generateWc01V2EvidencePreviewPacketFromPacket,
  generateWc01V2EvidencePreviewPacket,
  type Wc01V2EvidencePreviewPacket,
} from "./wc01-v2-evidence-preview";
import type { Wc01V2ManualReviewerPacket } from "./wc01-v2-manual-reviewer-packet";

const MAX_MARKDOWN_GROUPS_PER_QUEUE_ITEM = 12;

export type Wc01V2EvidencePreviewInspectionSummary = {
  sourceUrl?: string;
  domain?: string;
  productionEligible: false;
  topFindingEligible: false;
  gapEligible: false;
  status: "evidence_preview_internal_only";
  queueItemCount: number;
  resolvedExcerptCount: number;
  resolvedSourceRefCount: number;
  representativeGroupCount: number;
  unresolvedEvidenceRefCount: number;
  unresolvedRefReasonCounts: Record<string, number>;
  redactionWarningCount: number;
  redactionWarningCategoryCounts: Record<string, number>;
  sensitiveContextItemCount: number;
  guardrails: Wc01V2EvidencePreviewPacket["guardrails"];
};

export type Wc01V2EvidencePreviewBatchSiteResult = {
  inputPath: string;
  siteKey: string;
  status: "succeeded" | "failed";
  outputPath?: string;
  summaryPath?: string;
  errorMessage?: string;
  summary?: Wc01V2EvidencePreviewInspectionSummary;
};

export type Wc01V2EvidencePreviewBatchSummary = {
  inputDir: string;
  outputDir: string;
  artifactRoots: string[];
  totalInputFilesFound: number;
  succeededCount: number;
  failedCount: number;
  failures: Array<{
    inputPath: string;
    errorMessage: string;
    siteKey: string;
  }>;
  totalQueueItems: number;
  resolvedExcerptCount: number;
  resolvedSourceRefCount: number;
  representativeGroupCount: number;
  unresolvedEvidenceRefCount: number;
  unresolvedRefReasonCounts: Record<string, number>;
  redactionWarningCount: number;
  redactionWarningCategoryCounts: Record<string, number>;
  sensitiveContextItemCount: number;
  guardrailFailures: Array<{
    siteKey: string;
    failures: string[];
  }>;
  malformedArtifacts: Array<{
    inputPath: string;
    errorMessage: string;
    siteKey: string;
  }>;
  siteResults: Wc01V2EvidencePreviewBatchSiteResult[];
};

type GenerateSingleInput = {
  artifactRoots: string[];
  outPath: string;
  reviewerPacketPath: string;
  summaryPath?: string | false;
};

type GenerateSingleFromPacketInput = {
  artifactRoots: string[];
  outPath: string;
  reviewerPacket: Wc01V2ManualReviewerPacket;
  reviewerPacketPath: string;
  summaryPath?: string | false;
};

type GenerateBatchInput = {
  aggregateJsonPath?: string;
  aggregateMarkdownPath?: string;
  artifactRoots: string[];
  inputDir: string;
  outDir: string;
};

export async function generateWc01V2EvidencePreviewSingleFromFile(input: GenerateSingleInput) {
  const preview = await generateWc01V2EvidencePreviewPacket({
    artifactRoots: input.artifactRoots,
    reviewerPacketPath: input.reviewerPacketPath,
  });
  return writeWc01V2EvidencePreviewSingle({
    outPath: input.outPath,
    preview,
    summaryPath: input.summaryPath,
  });
}

export async function generateWc01V2EvidencePreviewSingleFromPacket(input: GenerateSingleFromPacketInput) {
  const preview = await generateWc01V2EvidencePreviewPacketFromPacket({
    artifactRoots: input.artifactRoots,
    reviewerPacket: input.reviewerPacket,
    reviewerPacketPath: input.reviewerPacketPath,
  });
  return writeWc01V2EvidencePreviewSingle({
    outPath: input.outPath,
    preview,
    summaryPath: input.summaryPath,
  });
}

async function writeWc01V2EvidencePreviewSingle(input: {
  outPath: string;
  preview: Wc01V2EvidencePreviewPacket;
  summaryPath?: string | false;
}) {
  const preview = input.preview;
  const summary = buildWc01V2EvidencePreviewInspectionSummary(preview);
  const summaryPath = input.summaryPath === false
    ? null
    : input.summaryPath ?? join(dirname(input.outPath), "Wc01V2EvidencePreviewPacket.summary.md");

  await mkdir(dirname(input.outPath), { recursive: true });
  await writeFile(input.outPath, `${JSON.stringify(preview, null, 2)}\n`, "utf8");

  if (summaryPath) {
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, renderWc01V2EvidencePreviewMarkdown(summary, preview), "utf8");
  }

  return { preview, summary, summaryPath };
}

export async function generateWc01V2EvidencePreviewBatch(
  input: GenerateBatchInput,
): Promise<Wc01V2EvidencePreviewBatchSummary> {
  const inputPaths = await findWc01V2ManualReviewerPacketFiles(input.inputDir);
  const siteResults: Wc01V2EvidencePreviewBatchSiteResult[] = [];

  for (const inputPath of inputPaths) {
    const siteKey = siteKeyForInputPath(input.inputDir, inputPath);
    const relativeOutputDir = dirname(relative(input.inputDir, inputPath));
    const outDir = relativeOutputDir === "." ? input.outDir : join(input.outDir, relativeOutputDir);
    const outputPath = join(outDir, "Wc01V2EvidencePreviewPacket.json");
    const summaryPath = join(outDir, "Wc01V2EvidencePreviewPacket.summary.md");

    try {
      const generated = await generateWc01V2EvidencePreviewSingleFromFile({
        artifactRoots: input.artifactRoots,
        reviewerPacketPath: inputPath,
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

  const summary = buildWc01V2EvidencePreviewBatchSummary({
    artifactRoots: input.artifactRoots,
    inputDir: input.inputDir,
    outputDir: input.outDir,
    siteResults,
    totalInputFilesFound: inputPaths.length,
  });
  const aggregateJsonPath = input.aggregateJsonPath ?? join(input.outDir, "wc01-v2-evidence-preview-summary.json");
  const aggregateMarkdownPath = input.aggregateMarkdownPath ?? join(input.outDir, "wc01-v2-evidence-preview-summary.md");

  await mkdir(input.outDir, { recursive: true });
  await writeFile(aggregateJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(aggregateMarkdownPath, renderWc01V2EvidencePreviewBatchMarkdown(summary), "utf8");

  return summary;
}

export async function findWc01V2ManualReviewerPacketFiles(inputDir: string) {
  const results: string[] = [];
  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && entry.name === "Wc01V2ManualReviewerPacket.json") {
        results.push(entryPath);
      }
    }
  }
  await walk(inputDir);
  return results.sort();
}

export function buildWc01V2EvidencePreviewInspectionSummary(
  preview: Wc01V2EvidencePreviewPacket,
): Wc01V2EvidencePreviewInspectionSummary {
  return {
    sourceUrl: preview.sourceUrl,
    domain: preview.domain,
    productionEligible: preview.productionEligible,
    topFindingEligible: preview.topFindingEligible,
    gapEligible: preview.gapEligible,
    status: preview.status,
    queueItemCount: preview.queueItems.length,
    resolvedExcerptCount: preview.queueItems.reduce((sum, item) => sum + item.resolvedEvidenceExcerpts.length, 0),
    resolvedSourceRefCount: preview.queueItems.reduce((sum, item) => sum + item.resolvedSourceRefs.length, 0),
    representativeGroupCount: preview.queueItems.reduce(
      (sum, item) => sum + item.representativeEvidenceGroups.length,
      0,
    ),
    unresolvedEvidenceRefCount: preview.unresolvedEvidenceRefs.length,
    unresolvedRefReasonCounts: countBy(preview.unresolvedEvidenceRefs, (ref) => ref.reasonCode),
    redactionWarningCount: preview.redactionWarnings.length,
    redactionWarningCategoryCounts: countBy(preview.redactionWarnings, (warning) => warning.category),
    sensitiveContextItemCount: preview.queueItems.filter((item) => item.sensitiveContextCategories.length > 0).length,
    guardrails: preview.guardrails,
  };
}

export function renderWc01V2EvidencePreviewMarkdown(
  summary: Wc01V2EvidencePreviewInspectionSummary,
  preview: Wc01V2EvidencePreviewPacket,
) {
  return [
    "# WC01 v2 Evidence Preview Packet",
    "",
    "Internal evidence preview only. Not customer-facing report output.",
    "",
    `- Source URL: ${summary.sourceUrl ?? "unknown"}`,
    `- Domain: ${summary.domain ?? "unknown"}`,
    `- Queue items: ${summary.queueItemCount}`,
    `- Resolved excerpts: ${summary.resolvedExcerptCount}`,
    `- Resolved source refs: ${summary.resolvedSourceRefCount}`,
    `- Representative groups: ${summary.representativeGroupCount}`,
    `- Unresolved evidence refs: ${summary.unresolvedEvidenceRefCount}`,
    `- Redaction warnings: ${summary.redactionWarningCount}`,
    `- Sensitive-context items: ${summary.sensitiveContextItemCount}`,
    `- Production eligible: ${String(summary.productionEligible)}`,
    `- Top-finding eligible: ${String(summary.topFindingEligible)}`,
    `- Gap eligible: ${String(summary.gapEligible)}`,
    "",
    "## Evidence By Queue Item",
    "",
    renderEvidenceTable(preview),
    "",
    "## Representative Evidence Groups",
    "",
    renderRepresentativeGroups(preview),
    "",
    "## Unresolved Evidence Ref Counts",
    "",
    renderUnresolvedSummary(preview),
    "",
    "## Warning Category Counts",
    "",
    renderWarningSummary(preview),
    "",
    "## Guardrails",
    "",
    ...Object.entries(summary.guardrails).map(([key, value]) => `- ${key}: ${String(value)}`),
    "",
    "## Non-Goals",
    "",
    "- No persistence.",
    "- No app UI.",
    "- No production integration.",
    "- No customer-facing output.",
    "- No report/checklist/executive/top-finding/scoring/regulatory-lens output.",
    "",
  ].join("\n");
}

export function buildWc01V2EvidencePreviewBatchSummary(input: {
  artifactRoots: string[];
  inputDir: string;
  outputDir: string;
  siteResults: Wc01V2EvidencePreviewBatchSiteResult[];
  totalInputFilesFound: number;
}): Wc01V2EvidencePreviewBatchSummary {
  const succeeded = input.siteResults.filter((result) => result.status === "succeeded" && result.summary);
  const failed = input.siteResults.filter((result) => result.status === "failed");
  const guardrailFailures: Wc01V2EvidencePreviewBatchSummary["guardrailFailures"] = [];
  let totalQueueItems = 0;
  let resolvedExcerptCount = 0;
  let resolvedSourceRefCount = 0;
  let representativeGroupCount = 0;
  let unresolvedEvidenceRefCount = 0;
  const unresolvedRefReasonCounts: Record<string, number> = {};
  let redactionWarningCount = 0;
  const redactionWarningCategoryCounts: Record<string, number> = {};
  let sensitiveContextItemCount = 0;

  for (const result of succeeded) {
    const summary = result.summary!;
    totalQueueItems += summary.queueItemCount;
    resolvedExcerptCount += summary.resolvedExcerptCount;
    resolvedSourceRefCount += summary.resolvedSourceRefCount;
    representativeGroupCount += summary.representativeGroupCount;
    unresolvedEvidenceRefCount += summary.unresolvedEvidenceRefCount;
    addCounts(unresolvedRefReasonCounts, summary.unresolvedRefReasonCounts);
    redactionWarningCount += summary.redactionWarningCount;
    addCounts(redactionWarningCategoryCounts, summary.redactionWarningCategoryCounts);
    sensitiveContextItemCount += summary.sensitiveContextItemCount;
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
    artifactRoots: input.artifactRoots,
    totalInputFilesFound: input.totalInputFilesFound,
    succeededCount: succeeded.length,
    failedCount: failed.length,
    failures: failed.map((result) => ({
      inputPath: result.inputPath,
      errorMessage: result.errorMessage ?? "Unknown failure.",
      siteKey: result.siteKey,
    })),
    totalQueueItems,
    resolvedExcerptCount,
    resolvedSourceRefCount,
    representativeGroupCount,
    unresolvedEvidenceRefCount,
    unresolvedRefReasonCounts,
    redactionWarningCount,
    redactionWarningCategoryCounts,
    sensitiveContextItemCount,
    guardrailFailures,
    malformedArtifacts: failed.map((result) => ({
      inputPath: result.inputPath,
      errorMessage: result.errorMessage ?? "Unknown failure.",
      siteKey: result.siteKey,
    })),
    siteResults: input.siteResults,
  };
}

export function renderWc01V2EvidencePreviewBatchMarkdown(summary: Wc01V2EvidencePreviewBatchSummary) {
  return [
    "# WC01 v2 Evidence Preview Batch Summary",
    "",
    "Internal evidence preview only. Not customer-facing report output.",
    "",
    `- Input directory: ${summary.inputDir}`,
    `- Output directory: ${summary.outputDir}`,
    `- Input files found: ${summary.totalInputFilesFound}`,
    `- Succeeded: ${summary.succeededCount}`,
    `- Failed: ${summary.failedCount}`,
    `- Queue items: ${summary.totalQueueItems}`,
    `- Resolved excerpts: ${summary.resolvedExcerptCount}`,
    `- Resolved source refs: ${summary.resolvedSourceRefCount}`,
    `- Representative groups: ${summary.representativeGroupCount}`,
    `- Unresolved evidence refs: ${summary.unresolvedEvidenceRefCount}`,
    `- Redaction warnings: ${summary.redactionWarningCount}`,
    `- Sensitive-context items: ${summary.sensitiveContextItemCount}`,
    "",
    "## Failures",
    "",
    renderFailureRows(summary.malformedArtifacts).join("\n"),
    "",
    "## Guardrail Failures",
    "",
    renderGuardrailFailureRows(summary.guardrailFailures).join("\n"),
    "",
    "## Unresolved Refs By Reason",
    "",
    renderCountTable(summary.unresolvedRefReasonCounts, "Reason"),
    "",
    "## Warnings By Category",
    "",
    renderCountTable(summary.redactionWarningCategoryCounts, "Category"),
    "",
  ].join("\n");
}

function renderEvidenceTable(preview: Wc01V2EvidencePreviewPacket) {
  if (preview.queueItems.length === 0) {
    return "| Queue item | Family | Resolved excerpts | Resolved source refs | Unresolved | Preview |\n|---|---|---:|---:|---:|---|\n| none | none | 0 | 0 | 0 | none |";
  }
  return [
    "| Queue item | Family | Resolved excerpts | Resolved source refs | Unresolved | Preview |",
    "|---|---|---:|---:|---:|---|",
    ...preview.queueItems.map((item) =>
      `| ${escapeCell(item.queueItemId)} | ${escapeCell(item.candidateFamily)} | ${item.resolvedEvidenceExcerpts.length} | ${item.resolvedSourceRefs.length} | ${item.unresolvedEvidenceRefs.length} | ${escapeCell(item.resolvedEvidenceExcerpts[0]?.boundedText ?? "none")} |`
    ),
  ].join("\n");
}

function renderRepresentativeGroups(preview: Wc01V2EvidencePreviewPacket) {
  if (preview.queueItems.every((item) => item.representativeEvidenceGroups.length === 0)) {
    return "- none";
  }
  const rows: string[] = [];
  for (const item of preview.queueItems) {
    const sortedGroups = [...item.representativeEvidenceGroups].sort((a, b) =>
      groupWeight(b) - groupWeight(a) || a.groupLabel.localeCompare(b.groupLabel)
    );
    const displayedGroups = sortedGroups.slice(0, MAX_MARKDOWN_GROUPS_PER_QUEUE_ITEM);
    for (const group of displayedGroups) {
      rows.push(
        `| ${escapeCell(item.queueItemId)} | ${escapeCell(group.groupLabel)} | ${escapeCell(group.family)} | ${group.totalResolvedExcerpts} | ${group.totalResolvedSourceRefs} | ${group.totalUnresolvedRefs} | ${group.totalRedactionWarnings} | ${escapeCell(group.representativeExcerpts[0]?.boundedText ?? "none")} | ${escapeCell(group.representativeSourceRefs[0]?.url ?? group.representativeSourceRefs[0]?.label ?? "none")} |`,
      );
    }
    const omittedCount = sortedGroups.length - displayedGroups.length;
    if (omittedCount > 0) {
      rows.push(
        `| ${escapeCell(item.queueItemId)} | ${omittedCount} additional groups in JSON | ${escapeCell(item.candidateFamily)} | ${sumBy(sortedGroups.slice(displayedGroups.length), (group) => group.totalResolvedExcerpts)} | ${sumBy(sortedGroups.slice(displayedGroups.length), (group) => group.totalResolvedSourceRefs)} | ${sumBy(sortedGroups.slice(displayedGroups.length), (group) => group.totalUnresolvedRefs)} | ${sumBy(sortedGroups.slice(displayedGroups.length), (group) => group.totalRedactionWarnings)} | omitted from Markdown top-N | see JSON |`,
      );
    }
  }
  return [
    "| Queue item | Group | Family | Excerpts | Source refs | Unresolved | Warnings | Representative excerpt | Representative source ref |",
    "|---|---|---|---:|---:|---:|---:|---|---|",
    ...rows,
  ].join("\n");
}

function groupWeight(group: Wc01V2EvidencePreviewPacket["queueItems"][number]["representativeEvidenceGroups"][number]) {
  return group.totalResolvedExcerpts + group.totalResolvedSourceRefs + group.totalUnresolvedRefs;
}

function renderUnresolvedSummary(preview: Wc01V2EvidencePreviewPacket) {
  if (preview.unresolvedEvidenceRefs.length === 0) {
    return "- none";
  }
  const byItemAndReason = new Map<string, {
    count: number;
    itemId: string;
    reason: string;
    refType: string;
  }>();
  for (const ref of preview.unresolvedEvidenceRefs) {
    const key = `${ref.queueItemId}|${ref.reasonCode}|${ref.refType}`;
    const existing = byItemAndReason.get(key) ?? {
      count: 0,
      itemId: ref.queueItemId,
      reason: ref.reasonCode,
      refType: ref.refType,
    };
    existing.count += 1;
    byItemAndReason.set(key, existing);
  }
  return [
    "| Queue item | Reason | Ref type | Count |",
    "|---|---|---|---:|",
    ...[...byItemAndReason.values()]
      .sort((a, b) => b.count - a.count || a.itemId.localeCompare(b.itemId))
      .map((row) =>
        `| ${escapeCell(row.itemId)} | ${escapeCell(row.reason)} | ${escapeCell(row.refType)} | ${row.count} |`
      ),
  ].join("\n");
}

function renderWarningSummary(preview: Wc01V2EvidencePreviewPacket) {
  if (preview.redactionWarnings.length === 0) {
    return "- none";
  }
  return [
    "| Queue item | Category | Disposition | Count | Label |",
    "|---|---|---|---:|---|",
    ...preview.redactionWarnings
      .sort((a, b) =>
        (b.count - a.count) ||
        (a.queueItemId ?? "").localeCompare(b.queueItemId ?? "") ||
        a.category.localeCompare(b.category)
      )
      .map((warning) =>
        `| ${escapeCell(warning.queueItemId ?? "packet")} | ${escapeCell(warning.category)} | ${escapeCell(warning.displayDisposition)} | ${warning.count} | ${escapeCell(warning.label)} |`
      ),
  ].join("\n");
}

function renderCountTable(counts: Record<string, number>, label: string) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (entries.length === 0) {
    return "- none";
  }
  return [
    `| ${label} | Count |`,
    "|---|---:|",
    ...entries.map(([key, count]) => `| ${escapeCell(key)} | ${count} |`),
  ].join("\n");
}

function renderFailureRows(failures: Wc01V2EvidencePreviewBatchSummary["malformedArtifacts"]) {
  if (failures.length === 0) {
    return ["- none"];
  }
  return [
    "| Site | Input path | Error |",
    "|---|---|---|",
    ...failures.map((failure) =>
      `| ${escapeCell(failure.siteKey)} | ${escapeCell(failure.inputPath)} | ${escapeCell(failure.errorMessage)} |`
    ),
  ];
}

function renderGuardrailFailureRows(failures: Wc01V2EvidencePreviewBatchSummary["guardrailFailures"]) {
  if (failures.length === 0) {
    return ["- none"];
  }
  return [
    "| Site | Failures |",
    "|---|---|",
    ...failures.map((failure) => `| ${escapeCell(failure.siteKey)} | ${escapeCell(failure.failures.join(", "))} |`),
  ];
}

function siteKeyForInputPath(inputDir: string, inputPath: string) {
  const relativeDir = dirname(relative(inputDir, inputPath));
  return relativeDir === "." ? "root" : relativeDir.split(/[\\/]+/g).join("/");
}

function countBy<T>(values: T[], keyFor: (value: T) => string) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = keyFor(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function addCounts(target: Record<string, number>, source: Record<string, number>) {
  for (const [key, count] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + count;
  }
}

function sumBy<T>(values: T[], valueFor: (value: T) => number) {
  return values.reduce((sum, value) => sum + valueFor(value), 0);
}

function escapeCell(value: string) {
  return value.replace(/\|/g, "/").replace(/\n/g, " ");
}
