import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
  buildWc01V2ManualReviewerPacket,
  buildWc01V2ManualReviewerPacketJson,
  type Wc01V2ManualReviewerPacket,
} from "./wc01-v2-manual-reviewer-packet";
import type { Wc01V2ConcernPolicyComparisonDryRun } from "./wc01-v2-concern-policy-comparison";

export type Wc01V2ManualReviewerPacketInspectionSummary = {
  sourceArtifact: Wc01V2ManualReviewerPacket["sourceArtifact"];
  productionEligible: false;
  topFindingEligible: false;
  gapEligible: false;
  status: "manual_reviewer_packet_internal_only";
  candidateCount: number;
  queueItemCount: number;
  blockedCandidateCount: number;
  laneCounts: Record<string, number>;
  outcomeCounts: Record<string, number>;
  familyCounts: Record<string, number>;
  reviewFlagCounts: Record<string, number>;
  sensitiveContextItemCount: number;
  sensitiveContextCategoryAvailableItemCount: number;
  copyPolicyReviewRequiredCount: number;
  sourceRefAvailableItemCount: number;
  displaySafeExcerptRefAvailableItemCount: number;
  vendorMetadataAvailableItemCount: number;
  evidenceQualityAvailableItemCount: number;
  familyEvidenceContextAvailableItemCount: number;
  guardrails: Wc01V2ManualReviewerPacket["guardrails"];
};

export type Wc01V2ManualReviewerPacketBatchSiteResult = {
  inputPath: string;
  siteKey: string;
  status: "succeeded" | "failed";
  outputPath?: string;
  summaryPath?: string;
  errorMessage?: string;
  summary?: Wc01V2ManualReviewerPacketInspectionSummary;
};

export type Wc01V2ManualReviewerPacketBatchSummary = {
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
  totalQueueItems: number;
  totalBlockedCandidates: number;
  laneCounts: Record<string, number>;
  outcomeCounts: Record<string, number>;
  familyCounts: Record<string, number>;
  reviewFlagCounts: Record<string, number>;
  sensitiveContextItemCount: number;
  sensitiveContextCategoryAvailableItemCount: number;
  copyPolicyReviewRequiredCount: number;
  sourceRefAvailableItemCount: number;
  displaySafeExcerptRefAvailableItemCount: number;
  vendorMetadataAvailableItemCount: number;
  evidenceQualityAvailableItemCount: number;
  familyEvidenceContextAvailableItemCount: number;
  guardrailFailures: Array<{
    failures: string[];
    siteKey: string;
  }>;
  malformedArtifacts: Array<{
    inputPath: string;
    errorMessage: string;
    siteKey: string;
  }>;
  sitesWithQueueItems: string[];
  sitesWithZeroQueueItems: string[];
  siteResults: Wc01V2ManualReviewerPacketBatchSiteResult[];
};

type GenerateSingleInput = {
  inputPath: string;
  outPath: string;
  summaryPath?: string | false;
};

type GenerateSingleFromComparisonInput = {
  comparison: Wc01V2ConcernPolicyComparisonDryRun;
  outPath: string;
  summaryPath?: string | false;
};

type GenerateBatchInput = {
  aggregateJsonPath?: string;
  aggregateMarkdownPath?: string;
  inputDir: string;
  outDir: string;
};

export async function generateWc01V2ManualReviewerPacketSingleFromFile(input: GenerateSingleInput) {
  const packet = buildWc01V2ManualReviewerPacketJson(await readFile(input.inputPath, "utf8"));
  return writeWc01V2ManualReviewerPacketSingle({
    outPath: input.outPath,
    packet,
    summaryPath: input.summaryPath,
  });
}

export async function generateWc01V2ManualReviewerPacketSingleFromComparison(
  input: GenerateSingleFromComparisonInput,
) {
  const packet = buildWc01V2ManualReviewerPacket(input.comparison);
  return writeWc01V2ManualReviewerPacketSingle({
    outPath: input.outPath,
    packet,
    summaryPath: input.summaryPath,
  });
}

async function writeWc01V2ManualReviewerPacketSingle(input: {
  outPath: string;
  packet: Wc01V2ManualReviewerPacket;
  summaryPath?: string | false;
}) {
  const packet = input.packet;
  const summary = buildWc01V2ManualReviewerPacketInspectionSummary(packet);
  const summaryPath = input.summaryPath === false
    ? null
    : input.summaryPath ?? join(dirname(input.outPath), "Wc01V2ManualReviewerPacket.summary.md");

  await mkdir(dirname(input.outPath), { recursive: true });
  await writeFile(input.outPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");

  if (summaryPath) {
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, renderWc01V2ManualReviewerPacketMarkdown(summary, packet), "utf8");
  }

  return { packet, summary, summaryPath };
}

export async function generateWc01V2ManualReviewerPacketBatch(
  input: GenerateBatchInput,
): Promise<Wc01V2ManualReviewerPacketBatchSummary> {
  const inputPaths = await findWc01V2ConcernPolicyComparisonDryRunFiles(input.inputDir);
  const siteResults: Wc01V2ManualReviewerPacketBatchSiteResult[] = [];

  for (const inputPath of inputPaths) {
    const siteKey = siteKeyForInputPath(input.inputDir, inputPath);
    const relativeOutputDir = dirname(relative(input.inputDir, inputPath));
    const outDir = relativeOutputDir === "." ? input.outDir : join(input.outDir, relativeOutputDir);
    const outputPath = join(outDir, "Wc01V2ManualReviewerPacket.json");
    const summaryPath = join(outDir, "Wc01V2ManualReviewerPacket.summary.md");

    try {
      const generated = await generateWc01V2ManualReviewerPacketSingleFromFile({
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

  const summary = buildWc01V2ManualReviewerPacketBatchSummary({
    inputDir: input.inputDir,
    outputDir: input.outDir,
    siteResults,
    totalInputFilesFound: inputPaths.length,
  });
  const aggregateJsonPath = input.aggregateJsonPath ?? join(input.outDir, "wc01-v2-reviewer-packet-summary.json");
  const aggregateMarkdownPath = input.aggregateMarkdownPath ?? join(input.outDir, "wc01-v2-reviewer-packet-summary.md");

  await mkdir(input.outDir, { recursive: true });
  await writeFile(aggregateJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(aggregateMarkdownPath, renderWc01V2ManualReviewerPacketBatchMarkdown(summary), "utf8");

  return summary;
}

export async function findWc01V2ConcernPolicyComparisonDryRunFiles(inputDir: string) {
  const results: string[] = [];

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && entry.name === "Wc01V2ConcernPolicyComparisonDryRun.json") {
        results.push(entryPath);
      }
    }
  }

  await walk(inputDir);
  return results.sort();
}

export function buildWc01V2ManualReviewerPacketInspectionSummary(
  packet: Wc01V2ManualReviewerPacket,
): Wc01V2ManualReviewerPacketInspectionSummary {
  return {
    sourceArtifact: packet.sourceArtifact,
    productionEligible: packet.productionEligible,
    topFindingEligible: packet.topFindingEligible,
    gapEligible: packet.gapEligible,
    status: packet.status,
    candidateCount: packet.candidateCount,
    queueItemCount: packet.queueItemCount,
    blockedCandidateCount: packet.blockedCandidates.length,
    laneCounts: countBy(packet.queueItems.map((item) => item.queueLane)),
    outcomeCounts: countBy(packet.queueItems.map((item) => item.simulatedPolicyOutcome)),
    familyCounts: countBy(packet.queueItems.map((item) => item.candidateFamily)),
    reviewFlagCounts: countBy(packet.queueItems.flatMap((item) => item.reviewFlags)),
    sensitiveContextItemCount: packet.queueItems.filter((item) => item.sensitiveContext.requiresExtraReview).length,
    sensitiveContextCategoryAvailableItemCount: packet.queueItems.filter((item) =>
      item.sensitiveContext.categories.length > 0
    ).length,
    copyPolicyReviewRequiredCount: packet.queueItems.filter((item) =>
      item.reviewFlags.includes("copy_policy_review_required")
    ).length,
    sourceRefAvailableItemCount: packet.queueItems.filter((item) => item.evidence.sourceRefsAvailable).length,
    displaySafeExcerptRefAvailableItemCount: packet.queueItems.filter((item) =>
      item.evidence.displaySafeExcerptRefsAvailable
    ).length,
    vendorMetadataAvailableItemCount: packet.queueItems.filter((item) =>
      item.vendorDiagnostics.metadataAvailable &&
      (item.vendorDiagnostics.vendorNames.length > 0 || item.vendorDiagnostics.supportingPurposes.length > 0)
    ).length,
    evidenceQualityAvailableItemCount: packet.queueItems.filter((item) => item.evidenceQuality.metadataAvailable).length,
    familyEvidenceContextAvailableItemCount: packet.queueItems.filter((item) =>
      Boolean(
        item.familyEvidenceContext.consentStateContext ||
        item.familyEvidenceContext.cookieStorageContext ||
        item.familyEvidenceContext.sessionReplayContext,
      )
    ).length,
    guardrails: packet.guardrails,
  };
}

export function renderWc01V2ManualReviewerPacketMarkdown(
  summary: Wc01V2ManualReviewerPacketInspectionSummary,
  packet?: Wc01V2ManualReviewerPacket,
) {
  return [
    "# WC01 v2 Manual Reviewer Packet",
    "",
    "Internal shadow diagnostic only. Not customer-facing report output.",
    "",
    `- Source URL: ${summary.sourceArtifact.sourceUrl ?? "unknown"}`,
    `- Scan ID: ${summary.sourceArtifact.scanId ?? "unknown"}`,
    `- Review ID: ${summary.sourceArtifact.reviewId ?? "unknown"}`,
    `- Comparison version: ${summary.sourceArtifact.comparisonVersion}`,
    `- Adapter version: ${summary.sourceArtifact.adapterVersion ?? "unknown"}`,
    `- Production eligible: ${String(summary.productionEligible)}`,
    `- Top-finding eligible: ${String(summary.topFindingEligible)}`,
    `- Gap eligible: ${String(summary.gapEligible)}`,
    `- Status: ${summary.status}`,
    `- Candidates: ${summary.candidateCount}`,
    `- Queue items: ${summary.queueItemCount}`,
    `- Blocked candidates: ${summary.blockedCandidateCount}`,
    `- Sensitive-context items: ${summary.sensitiveContextItemCount}`,
    `- Sensitive-context category labels available: ${summary.sensitiveContextCategoryAvailableItemCount}`,
    `- Copy-policy review flags: ${summary.copyPolicyReviewRequiredCount}`,
    `- Source ref pointers available: ${summary.sourceRefAvailableItemCount}`,
    `- Display-safe excerpt pointers available: ${summary.displaySafeExcerptRefAvailableItemCount}`,
    `- Vendor metadata available: ${summary.vendorMetadataAvailableItemCount}`,
    `- Evidence quality metadata available: ${summary.evidenceQualityAvailableItemCount}`,
    `- Family evidence context available: ${summary.familyEvidenceContextAvailableItemCount}`,
    "",
    "## Queue Lanes",
    "",
    renderCountTable(summary.laneCounts, "Lane"),
    "",
    "## Outcomes",
    "",
    renderCountTable(summary.outcomeCounts, "Outcome"),
    "",
    "## Families",
    "",
    renderCountTable(summary.familyCounts, "Family"),
    "",
    "## Review Flags",
    "",
    renderCountTable(summary.reviewFlagCounts, "Flag"),
    "",
    "## Queue Items",
    "",
    renderQueueItemsTable(packet?.queueItems ?? []),
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
    `- no production eligibility: ${String(summary.guardrails.noProductionEligibility)}`,
    `- no top-finding eligibility: ${String(summary.guardrails.noTopFindingEligibility)}`,
    `- no gap eligibility: ${String(summary.guardrails.noGapEligibility)}`,
    "",
  ].join("\n");
}

export function buildWc01V2ManualReviewerPacketBatchSummary(input: {
  inputDir: string;
  outputDir: string;
  siteResults: Wc01V2ManualReviewerPacketBatchSiteResult[];
  totalInputFilesFound: number;
}): Wc01V2ManualReviewerPacketBatchSummary {
  const succeeded = input.siteResults.filter((result) => result.status === "succeeded" && result.summary);
  const failed = input.siteResults.filter((result) => result.status === "failed");
  const laneCounts: Record<string, number> = {};
  const outcomeCounts: Record<string, number> = {};
  const familyCounts: Record<string, number> = {};
  const reviewFlagCounts: Record<string, number> = {};
  const guardrailFailures: Wc01V2ManualReviewerPacketBatchSummary["guardrailFailures"] = [];
  const sitesWithQueueItems: string[] = [];
  const sitesWithZeroQueueItems: string[] = [];
  let totalCandidates = 0;
  let totalQueueItems = 0;
  let totalBlockedCandidates = 0;
  let sensitiveContextItemCount = 0;
  let sensitiveContextCategoryAvailableItemCount = 0;
  let copyPolicyReviewRequiredCount = 0;
  let sourceRefAvailableItemCount = 0;
  let displaySafeExcerptRefAvailableItemCount = 0;
  let vendorMetadataAvailableItemCount = 0;
  let evidenceQualityAvailableItemCount = 0;
  let familyEvidenceContextAvailableItemCount = 0;

  for (const result of succeeded) {
    const summary = result.summary!;
    totalCandidates += summary.candidateCount;
    totalQueueItems += summary.queueItemCount;
    totalBlockedCandidates += summary.blockedCandidateCount;
    sensitiveContextItemCount += summary.sensitiveContextItemCount;
    sensitiveContextCategoryAvailableItemCount += summary.sensitiveContextCategoryAvailableItemCount;
    copyPolicyReviewRequiredCount += summary.copyPolicyReviewRequiredCount;
    sourceRefAvailableItemCount += summary.sourceRefAvailableItemCount;
    displaySafeExcerptRefAvailableItemCount += summary.displaySafeExcerptRefAvailableItemCount;
    vendorMetadataAvailableItemCount += summary.vendorMetadataAvailableItemCount;
    evidenceQualityAvailableItemCount += summary.evidenceQualityAvailableItemCount;
    familyEvidenceContextAvailableItemCount += summary.familyEvidenceContextAvailableItemCount;
    addCounts(laneCounts, summary.laneCounts);
    addCounts(outcomeCounts, summary.outcomeCounts);
    addCounts(familyCounts, summary.familyCounts);
    addCounts(reviewFlagCounts, summary.reviewFlagCounts);

    if (summary.queueItemCount > 0) {
      sitesWithQueueItems.push(result.siteKey);
    } else {
      sitesWithZeroQueueItems.push(result.siteKey);
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
    totalQueueItems,
    totalBlockedCandidates,
    laneCounts,
    outcomeCounts,
    familyCounts,
    reviewFlagCounts,
    sensitiveContextItemCount,
    sensitiveContextCategoryAvailableItemCount,
    copyPolicyReviewRequiredCount,
    sourceRefAvailableItemCount,
    displaySafeExcerptRefAvailableItemCount,
    vendorMetadataAvailableItemCount,
    evidenceQualityAvailableItemCount,
    familyEvidenceContextAvailableItemCount,
    guardrailFailures,
    malformedArtifacts: failed.map((result) => ({
      inputPath: result.inputPath,
      errorMessage: result.errorMessage ?? "Unknown failure.",
      siteKey: result.siteKey,
    })),
    sitesWithQueueItems: uniqueStrings(sitesWithQueueItems),
    sitesWithZeroQueueItems: uniqueStrings(sitesWithZeroQueueItems),
    siteResults: input.siteResults,
  };
}

export function renderWc01V2ManualReviewerPacketBatchMarkdown(
  summary: Wc01V2ManualReviewerPacketBatchSummary,
) {
  return [
    "# WC01 v2 Manual Reviewer Packet Batch Summary",
    "",
    "Internal shadow diagnostic only. Not customer-facing report output.",
    "",
    `- Input directory: ${summary.inputDir}`,
    `- Output directory: ${summary.outputDir}`,
    `- Input files found: ${summary.totalInputFilesFound}`,
    `- Succeeded: ${summary.succeededCount}`,
    `- Failed: ${summary.failedCount}`,
    `- Candidates: ${summary.totalCandidates}`,
    `- Queue items: ${summary.totalQueueItems}`,
    `- Blocked candidates: ${summary.totalBlockedCandidates}`,
    `- Sensitive-context items: ${summary.sensitiveContextItemCount}`,
    `- Sensitive-context category labels available: ${summary.sensitiveContextCategoryAvailableItemCount}`,
    `- Copy-policy review flags: ${summary.copyPolicyReviewRequiredCount}`,
    `- Source ref pointers available: ${summary.sourceRefAvailableItemCount}`,
    `- Display-safe excerpt pointers available: ${summary.displaySafeExcerptRefAvailableItemCount}`,
    `- Vendor metadata available: ${summary.vendorMetadataAvailableItemCount}`,
    `- Evidence quality metadata available: ${summary.evidenceQualityAvailableItemCount}`,
    `- Family evidence context available: ${summary.familyEvidenceContextAvailableItemCount}`,
    "",
    "## Queue Lanes",
    "",
    renderCountTable(summary.laneCounts, "Lane"),
    "",
    "## Outcomes",
    "",
    renderCountTable(summary.outcomeCounts, "Outcome"),
    "",
    "## Families",
    "",
    renderCountTable(summary.familyCounts, "Family"),
    "",
    "## Review Flags",
    "",
    renderCountTable(summary.reviewFlagCounts, "Flag"),
    "",
    "## Sites With Queue Items",
    "",
    ...renderStringRows(summary.sitesWithQueueItems),
    "",
    "## Sites With Zero Queue Items",
    "",
    ...renderStringRows(summary.sitesWithZeroQueueItems),
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
    ...entries.map(([key, count]) => `| ${escapeMarkdownTableCell(key)} | ${count} |`),
  ].join("\n");
}

function renderQueueItemsTable(queueItems: Wc01V2ManualReviewerPacket["queueItems"]) {
  if (queueItems.length === 0) {
    return "| Queue item | Family | Outcome | Lane | Evidence refs | Excerpts | Vendors | Purposes | Quality | Context | Flags |\n|---|---|---|---|---|---|---|---|---|---|---|\n| none | none | none | none | none | none | none | none | none | none | none |";
  }
  return [
    "| Queue item | Family | Outcome | Lane | Evidence refs | Excerpts | Vendors | Purposes | Quality | Context | Flags |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...queueItems.map((item) =>
      `| ${escapeMarkdownTableCell(item.queueItemId)} | ${escapeMarkdownTableCell(item.candidateFamily)} | ${escapeMarkdownTableCell(item.simulatedPolicyOutcome)} | ${escapeMarkdownTableCell(item.queueLane)} | ${escapeMarkdownTableCell(item.evidence.sourceRefIds.join(", ") || "none")} | ${escapeMarkdownTableCell(item.evidence.displaySafeExcerptIds.join(", ") || String(item.evidence.displaySafeExcerptCount ?? "none"))} | ${escapeMarkdownTableCell(item.vendorDiagnostics.vendorNames.join(", ") || "none")} | ${escapeMarkdownTableCell([...item.vendorDiagnostics.supportingPurposes, ...item.vendorDiagnostics.diagnosticPurposes.map((purpose) => `${purpose} (diagnostic)`) ].join(", ") || "none")} | ${escapeMarkdownTableCell(`${item.evidenceQuality.confidence ?? "unknown"} / ${item.evidenceQuality.directness ?? "unknown"}`)} | ${escapeMarkdownTableCell(familyContextLabel(item))} | ${escapeMarkdownTableCell(item.reviewFlags.join(", ") || "none")} |`
    ),
  ].join("\n");
}

function familyContextLabel(item: Wc01V2ManualReviewerPacket["queueItems"][number]) {
  if (item.familyEvidenceContext.cookieStorageContext) {
    const context = item.familyEvidenceContext.cookieStorageContext;
    return `${context.party} ${context.storageType}`;
  }
  if (item.familyEvidenceContext.sessionReplayContext) {
    return item.familyEvidenceContext.sessionReplayContext.collectionEvidence;
  }
  if (item.familyEvidenceContext.consentStateContext) {
    return item.familyEvidenceContext.consentStateContext.phase;
  }
  return "none";
}

function renderStringRows(values: string[]) {
  return values.length > 0 ? values.map((value) => `- ${value}`) : ["- none"];
}

function renderFailureRows(
  failures: Wc01V2ManualReviewerPacketBatchSummary["malformedArtifacts"],
) {
  if (failures.length === 0) {
    return ["- none"];
  }
  return [
    "| Site | Input path | Error |",
    "|---|---|---|",
    ...failures.map((failure) =>
      `| ${escapeMarkdownTableCell(failure.siteKey)} | ${escapeMarkdownTableCell(failure.inputPath)} | ${escapeMarkdownTableCell(failure.errorMessage)} |`
    ),
  ];
}

function renderGuardrailFailureRows(
  failures: Wc01V2ManualReviewerPacketBatchSummary["guardrailFailures"],
) {
  if (failures.length === 0) {
    return ["- none"];
  }
  return [
    "| Site | Failures |",
    "|---|---|",
    ...failures.map((failure) =>
      `| ${escapeMarkdownTableCell(failure.siteKey)} | ${escapeMarkdownTableCell(failure.failures.join(", "))} |`
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

function escapeMarkdownTableCell(value: string) {
  return value.replace(/\|/g, "/").replace(/\n/g, " ");
}
