import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
  projectAllowlistDryRunJsonToConcernPolicyInputDraft,
  projectAllowlistDryRunToConcernPolicyInputDraft,
  type Wc01V2ConcernInputDraft,
  type Wc01V2ConcernPolicyInputDraft,
} from "./wc01-v2-concern-policy-input-draft";
import type { Wc01V2AllowlistDryRun } from "./wc01-v2-allowlist-bridge";

export type Wc01V2ConcernInputDryRunInspectionSummary = {
  source: Wc01V2ConcernPolicyInputDraft["source"];
  productionEligible: false;
  status: "draft_review_only";
  totalAllowlistCandidates: number;
  concernInputDraftCount: number;
  blockedCandidateCount: number;
  countsByProposedConcernFamily: Record<string, number>;
  countsBySuggestedConcernKey: Record<string, number>;
  vendorPurposeCounts: Record<string, number>;
  blockedCandidateReasons: Record<string, number>;
  sensitiveContextFlaggedCount: number;
  sensitiveContextCategories: Record<string, number>;
  draftsRequiringExtraPolicyReview: number;
  familySpecificCaveatCounts: Record<string, number>;
  reviewOnlyLanguageStatus: {
    inputsWithReviewLanguage: number;
    inputsMissingReviewLanguage: number;
    prohibitedPhraseKeyCount: number;
  };
  bannedTokenGuardrailStatus: {
    containsForbiddenGapStatusToken: boolean;
    containsLegalConclusionClaimLanguage: boolean;
  };
  guardrails: Wc01V2ConcernPolicyInputDraft["guardrails"];
};

export type Wc01V2ConcernInputDryRunBatchSiteResult = {
  allowlistPath: string;
  siteKey: string;
  status: "succeeded" | "failed";
  outputPath?: string;
  summaryPath?: string;
  errorMessage?: string;
  summary?: Wc01V2ConcernInputDryRunInspectionSummary;
};

export type Wc01V2ConcernInputDryRunBatchSummary = {
  inputAllowlistDir: string;
  outputDir: string;
  totalAllowlistFilesFound: number;
  succeededCount: number;
  failedCount: number;
  failures: Array<{
    allowlistPath: string;
    errorMessage: string;
    siteKey: string;
  }>;
  totalAllowlistCandidates: number;
  totalConcernInputs: number;
  totalBlockedCandidates: number;
  countsByProposedConcernFamily: Record<string, number>;
  countsBySuggestedConcernKey: Record<string, number>;
  vendorPurposeCounts: Record<string, number>;
  blockedCandidateReasons: Record<string, number>;
  sensitiveContextFlaggedCount: number;
  sensitiveContextCategories: Record<string, number>;
  draftsRequiringExtraPolicyReview: number;
  familySpecificCaveatCounts: Record<string, number>;
  reviewOnlyLanguageStatus: {
    inputsWithReviewLanguage: number;
    inputsMissingReviewLanguage: number;
    prohibitedPhraseKeyCount: number;
  };
  bannedTokenGuardrailStatus: {
    containsForbiddenGapStatusToken: boolean;
    containsLegalConclusionClaimLanguage: boolean;
  };
  guardrailFailures: Array<{
    failures: string[];
    siteKey: string;
  }>;
  malformedArtifacts: Array<{
    allowlistPath: string;
    errorMessage: string;
    siteKey: string;
  }>;
  sitesWithConcernInputs: string[];
  sitesWithZeroConcernInputs: string[];
  siteResults: Wc01V2ConcernInputDryRunBatchSiteResult[];
};

type GenerateSingleInput = {
  allowlistPath: string;
  outPath: string;
  summaryPath?: string | false;
};

type GenerateSingleFromAllowlistInput = {
  allowlist: Wc01V2AllowlistDryRun;
  outPath: string;
  summaryPath?: string | false;
};

type GenerateBatchInput = {
  aggregateJsonPath?: string;
  aggregateMarkdownPath?: string;
  allowlistDir: string;
  outDir: string;
};

export async function generateWc01V2ConcernInputSingleFromFile(input: GenerateSingleInput) {
  const draft = projectAllowlistDryRunJsonToConcernPolicyInputDraft(await readFile(input.allowlistPath, "utf8"));
  return writeWc01V2ConcernInputSingle({
    draft,
    outPath: input.outPath,
    summaryPath: input.summaryPath,
  });
}

export async function generateWc01V2ConcernInputSingleFromAllowlist(input: GenerateSingleFromAllowlistInput) {
  const draft = projectAllowlistDryRunToConcernPolicyInputDraft(input.allowlist);
  return writeWc01V2ConcernInputSingle({
    draft,
    outPath: input.outPath,
    summaryPath: input.summaryPath,
  });
}

async function writeWc01V2ConcernInputSingle(input: {
  draft: Wc01V2ConcernPolicyInputDraft;
  outPath: string;
  summaryPath?: string | false;
}) {
  const draft = input.draft;
  const summary = buildWc01V2ConcernInputDryRunInspectionSummary(draft);
  const summaryPath = input.summaryPath === false
    ? null
    : input.summaryPath ?? join(dirname(input.outPath), "Wc01V2ConcernPolicyInputDraft.summary.md");

  await mkdir(dirname(input.outPath), { recursive: true });
  await writeFile(input.outPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");

  if (summaryPath) {
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, renderWc01V2ConcernInputDryRunMarkdown(summary), "utf8");
  }

  return { draft, summary, summaryPath };
}

export async function generateWc01V2ConcernInputBatch(
  input: GenerateBatchInput,
): Promise<Wc01V2ConcernInputDryRunBatchSummary> {
  const allowlistPaths = await findWc01V2AllowlistDryRunFiles(input.allowlistDir);
  const siteResults: Wc01V2ConcernInputDryRunBatchSiteResult[] = [];

  for (const allowlistPath of allowlistPaths) {
    const siteKey = siteKeyForAllowlistPath(input.allowlistDir, allowlistPath);
    const relativeOutputDir = dirname(relative(input.allowlistDir, allowlistPath));
    const outDir = relativeOutputDir === "." ? input.outDir : join(input.outDir, relativeOutputDir);
    const outputPath = join(outDir, "Wc01V2ConcernPolicyInputDraft.json");
    const summaryPath = join(outDir, "Wc01V2ConcernPolicyInputDraft.summary.md");

    try {
      const generated = await generateWc01V2ConcernInputSingleFromFile({
        allowlistPath,
        outPath: outputPath,
        summaryPath,
      });
      siteResults.push({
        allowlistPath,
        siteKey,
        status: "succeeded",
        outputPath,
        summaryPath,
        summary: generated.summary,
      });
    } catch (error) {
      siteResults.push({
        allowlistPath,
        siteKey,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = buildWc01V2ConcernInputDryRunBatchSummary({
    inputAllowlistDir: input.allowlistDir,
    outputDir: input.outDir,
    siteResults,
    totalAllowlistFilesFound: allowlistPaths.length,
  });
  const aggregateJsonPath = input.aggregateJsonPath ?? join(input.outDir, "wc01-v2-concern-input-dry-run-summary.json");
  const aggregateMarkdownPath = input.aggregateMarkdownPath ?? join(input.outDir, "wc01-v2-concern-input-dry-run-summary.md");

  await mkdir(input.outDir, { recursive: true });
  await writeFile(aggregateJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(aggregateMarkdownPath, renderWc01V2ConcernInputDryRunBatchMarkdown(summary), "utf8");

  return summary;
}

export async function findWc01V2AllowlistDryRunFiles(allowlistDir: string) {
  const results: string[] = [];

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && entry.name === "Wc01V2AllowlistDryRun.json") {
        results.push(entryPath);
      }
    }
  }

  await walk(allowlistDir);
  return results.sort();
}

export function buildWc01V2ConcernInputDryRunInspectionSummary(
  draft: Wc01V2ConcernPolicyInputDraft,
): Wc01V2ConcernInputDryRunInspectionSummary {
  return {
    source: draft.source,
    productionEligible: draft.productionEligible,
    status: draft.status,
    totalAllowlistCandidates: draft.concernInputs.length + draft.blockedCandidates.length,
    concernInputDraftCount: draft.concernInputs.length,
    blockedCandidateCount: draft.blockedCandidates.length,
    countsByProposedConcernFamily: countBy(draft.concernInputs.map((input) => input.proposedConcernFamily)),
    countsBySuggestedConcernKey: countBy(draft.concernInputs.map((input) => input.suggestedNormalizedConcern.concernKey)),
    vendorPurposeCounts: countBy(draft.concernInputs.flatMap(concernInputVendorPurposes)),
    blockedCandidateReasons: countBy(draft.blockedCandidates.flatMap((candidate) => candidate.blockReasons)),
    sensitiveContextFlaggedCount: draft.concernInputs.filter((input) => input.sensitiveContextReview.sensitiveContextFlag).length,
    sensitiveContextCategories: countBy(draft.concernInputs.flatMap((input) =>
      input.sensitiveContextReview.sensitiveContextCategories
    )),
    draftsRequiringExtraPolicyReview: draft.concernInputs.filter((input) =>
      input.sensitiveContextReview.requiresExtraPolicyReview
    ).length,
    familySpecificCaveatCounts: countBy(draft.concernInputs.flatMap((input) =>
      input.evidenceAssessment.familySpecificCaveats
    )),
    reviewOnlyLanguageStatus: {
      inputsWithReviewLanguage: draft.concernInputs.filter((input) =>
        input.reviewLanguage.allowedPhrases.length > 0 &&
        input.reviewLanguage.prohibitedPhraseKeys.length > 0 &&
        input.reviewLanguage.suggestedInternalSummary.length > 0
      ).length,
      inputsMissingReviewLanguage: draft.concernInputs.filter((input) =>
        input.reviewLanguage.allowedPhrases.length === 0 ||
        input.reviewLanguage.prohibitedPhraseKeys.length === 0 ||
        input.reviewLanguage.suggestedInternalSummary.length === 0
      ).length,
      prohibitedPhraseKeyCount: draft.concernInputs.reduce(
        (sum, input) => sum + input.reviewLanguage.prohibitedPhraseKeys.length,
        0,
      ),
    },
    bannedTokenGuardrailStatus: bannedTokenGuardrailStatus(draft),
    guardrails: draft.guardrails,
  };
}

export function renderWc01V2ConcernInputDryRunMarkdown(
  summary: Wc01V2ConcernInputDryRunInspectionSummary,
) {
  return [
    "# WC01 v2 Concern Policy Input Draft",
    "",
    "Dry run only. Not production concern policy input. Not persisted normalized concerns. Not customer-facing report output.",
    "",
    `- Source URL: ${summary.source.url}`,
    `- Scan ID: ${summary.source.scanId}`,
    `- Review ID: ${summary.source.reviewId ?? "unknown"}`,
    `- Allowlist dry-run version: ${summary.source.allowlistDryRunVersion}`,
    `- Production eligible: ${String(summary.productionEligible)}`,
    `- Status: ${summary.status}`,
    `- Total allowlist candidates: ${summary.totalAllowlistCandidates}`,
    `- Concern input draft count: ${summary.concernInputDraftCount}`,
    `- Blocked candidate count: ${summary.blockedCandidateCount}`,
    `- Sensitive-context flagged draft count: ${summary.sensitiveContextFlaggedCount}`,
    `- Drafts requiring extra policy review: ${summary.draftsRequiringExtraPolicyReview}`,
    "",
    "## Counts By Proposed Concern Family",
    "",
    renderCountTable(summary.countsByProposedConcernFamily, "Family"),
    "",
    "## Counts By Suggested Concern Key",
    "",
    renderCountTable(summary.countsBySuggestedConcernKey, "Concern key"),
    "",
    "## Vendor Purpose Counts",
    "",
    renderCountTable(summary.vendorPurposeCounts, "Purpose"),
    "",
    "## Blocked Candidate Reasons",
    "",
    renderCountTable(summary.blockedCandidateReasons, "Reason"),
    "",
    "## Sensitive Context",
    "",
    renderCountTable(summary.sensitiveContextCategories, "Category"),
    "",
    "## Family-Specific Caveats",
    "",
    renderCountTable(summary.familySpecificCaveatCounts, "Caveat"),
    "",
    "## Review-Only Language Status",
    "",
    `- inputs with review-language block: ${summary.reviewOnlyLanguageStatus.inputsWithReviewLanguage}`,
    `- inputs missing review-language block: ${summary.reviewOnlyLanguageStatus.inputsMissingReviewLanguage}`,
    `- prohibited phrase key count: ${summary.reviewOnlyLanguageStatus.prohibitedPhraseKeyCount}`,
    `- forbidden gap status token present: ${String(summary.bannedTokenGuardrailStatus.containsForbiddenGapStatusToken)}`,
    `- legal-conclusion claim language present: ${String(summary.bannedTokenGuardrailStatus.containsLegalConclusionClaimLanguage)}`,
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

export function buildWc01V2ConcernInputDryRunBatchSummary(input: {
  inputAllowlistDir: string;
  outputDir: string;
  siteResults: Wc01V2ConcernInputDryRunBatchSiteResult[];
  totalAllowlistFilesFound: number;
}): Wc01V2ConcernInputDryRunBatchSummary {
  const succeeded = input.siteResults.filter((result) => result.status === "succeeded" && result.summary);
  const failed = input.siteResults.filter((result) => result.status === "failed");
  const countsByProposedConcernFamily: Record<string, number> = {};
  const countsBySuggestedConcernKey: Record<string, number> = {};
  const vendorPurposeCounts: Record<string, number> = {};
  const blockedCandidateReasons: Record<string, number> = {};
  const sensitiveContextCategories: Record<string, number> = {};
  const familySpecificCaveatCounts: Record<string, number> = {};
  const guardrailFailures: Wc01V2ConcernInputDryRunBatchSummary["guardrailFailures"] = [];
  const sitesWithConcernInputs: string[] = [];
  const sitesWithZeroConcernInputs: string[] = [];
  let totalAllowlistCandidates = 0;
  let totalConcernInputs = 0;
  let totalBlockedCandidates = 0;
  let sensitiveContextFlaggedCount = 0;
  let draftsRequiringExtraPolicyReview = 0;
  let inputsWithReviewLanguage = 0;
  let inputsMissingReviewLanguage = 0;
  let prohibitedPhraseKeyCount = 0;
  let containsForbiddenGapStatusToken = false;
  let containsLegalConclusionClaimLanguage = false;

  for (const result of succeeded) {
    const summary = result.summary!;
    totalAllowlistCandidates += summary.totalAllowlistCandidates;
    totalConcernInputs += summary.concernInputDraftCount;
    totalBlockedCandidates += summary.blockedCandidateCount;
    addCounts(countsByProposedConcernFamily, summary.countsByProposedConcernFamily);
    addCounts(countsBySuggestedConcernKey, summary.countsBySuggestedConcernKey);
    addCounts(vendorPurposeCounts, summary.vendorPurposeCounts);
    addCounts(blockedCandidateReasons, summary.blockedCandidateReasons);
    addCounts(sensitiveContextCategories, summary.sensitiveContextCategories);
    addCounts(familySpecificCaveatCounts, summary.familySpecificCaveatCounts);
    sensitiveContextFlaggedCount += summary.sensitiveContextFlaggedCount;
    draftsRequiringExtraPolicyReview += summary.draftsRequiringExtraPolicyReview;
    inputsWithReviewLanguage += summary.reviewOnlyLanguageStatus.inputsWithReviewLanguage;
    inputsMissingReviewLanguage += summary.reviewOnlyLanguageStatus.inputsMissingReviewLanguage;
    prohibitedPhraseKeyCount += summary.reviewOnlyLanguageStatus.prohibitedPhraseKeyCount;
    containsForbiddenGapStatusToken ||= summary.bannedTokenGuardrailStatus.containsForbiddenGapStatusToken;
    containsLegalConclusionClaimLanguage ||= summary.bannedTokenGuardrailStatus.containsLegalConclusionClaimLanguage;
    if (summary.concernInputDraftCount > 0) {
      sitesWithConcernInputs.push(result.siteKey);
    } else {
      sitesWithZeroConcernInputs.push(result.siteKey);
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
    inputAllowlistDir: input.inputAllowlistDir,
    outputDir: input.outputDir,
    totalAllowlistFilesFound: input.totalAllowlistFilesFound,
    succeededCount: succeeded.length,
    failedCount: failed.length,
    failures: failed.map((result) => ({
      allowlistPath: result.allowlistPath,
      errorMessage: result.errorMessage ?? "Unknown failure.",
      siteKey: result.siteKey,
    })),
    totalAllowlistCandidates,
    totalConcernInputs,
    totalBlockedCandidates,
    countsByProposedConcernFamily,
    countsBySuggestedConcernKey,
    vendorPurposeCounts,
    blockedCandidateReasons,
    sensitiveContextFlaggedCount,
    sensitiveContextCategories,
    draftsRequiringExtraPolicyReview,
    familySpecificCaveatCounts,
    reviewOnlyLanguageStatus: {
      inputsWithReviewLanguage,
      inputsMissingReviewLanguage,
      prohibitedPhraseKeyCount,
    },
    bannedTokenGuardrailStatus: {
      containsForbiddenGapStatusToken,
      containsLegalConclusionClaimLanguage,
    },
    guardrailFailures,
    malformedArtifacts: failed.map((result) => ({
      allowlistPath: result.allowlistPath,
      errorMessage: result.errorMessage ?? "Unknown failure.",
      siteKey: result.siteKey,
    })),
    sitesWithConcernInputs: uniqueStrings(sitesWithConcernInputs),
    sitesWithZeroConcernInputs: uniqueStrings(sitesWithZeroConcernInputs),
    siteResults: input.siteResults,
  };
}

export function renderWc01V2ConcernInputDryRunBatchMarkdown(
  summary: Wc01V2ConcernInputDryRunBatchSummary,
) {
  return [
    "# WC01 v2 Concern Policy Input Draft Batch Summary",
    "",
    "Dry run only. Not production concern policy input. Not persisted normalized concerns. Not customer-facing report output.",
    "",
    `- Input allowlist directory: ${summary.inputAllowlistDir}`,
    `- Output directory: ${summary.outputDir}`,
    `- Allowlist files found: ${summary.totalAllowlistFilesFound}`,
    `- Succeeded: ${summary.succeededCount}`,
    `- Failed: ${summary.failedCount}`,
    `- Total allowlist candidates: ${summary.totalAllowlistCandidates}`,
    `- Concern input draft count: ${summary.totalConcernInputs}`,
    `- Blocked candidate count: ${summary.totalBlockedCandidates}`,
    `- Sensitive-context flagged draft count: ${summary.sensitiveContextFlaggedCount}`,
    `- Drafts requiring extra policy review: ${summary.draftsRequiringExtraPolicyReview}`,
    "",
    "## Counts By Proposed Concern Family",
    "",
    renderCountTable(summary.countsByProposedConcernFamily, "Family"),
    "",
    "## Counts By Suggested Concern Key",
    "",
    renderCountTable(summary.countsBySuggestedConcernKey, "Concern key"),
    "",
    "## Vendor Purpose Counts",
    "",
    renderCountTable(summary.vendorPurposeCounts, "Purpose"),
    "",
    "## Blocked Candidate Reasons",
    "",
    renderCountTable(summary.blockedCandidateReasons, "Reason"),
    "",
    "## Sensitive Context Categories",
    "",
    renderCountTable(summary.sensitiveContextCategories, "Category"),
    "",
    "## Family-Specific Caveats",
    "",
    renderCountTable(summary.familySpecificCaveatCounts, "Caveat"),
    "",
    "## Review-Only Language Status",
    "",
    `- inputs with review-language block: ${summary.reviewOnlyLanguageStatus.inputsWithReviewLanguage}`,
    `- inputs missing review-language block: ${summary.reviewOnlyLanguageStatus.inputsMissingReviewLanguage}`,
    `- prohibited phrase key count: ${summary.reviewOnlyLanguageStatus.prohibitedPhraseKeyCount}`,
    `- forbidden gap status token present: ${String(summary.bannedTokenGuardrailStatus.containsForbiddenGapStatusToken)}`,
    `- legal-conclusion claim language present: ${String(summary.bannedTokenGuardrailStatus.containsLegalConclusionClaimLanguage)}`,
    "",
    "## Sites With Concern Inputs",
    "",
    ...renderStringRows(summary.sitesWithConcernInputs),
    "",
    "## Sites With Zero Concern Inputs",
    "",
    ...renderStringRows(summary.sitesWithZeroConcernInputs),
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

function concernInputVendorPurposes(input: Wc01V2ConcernInputDraft) {
  return input.vendors.flatMap((vendor) => [
    ...vendor.supportingPurposes,
    ...vendor.diagnosticPurposes,
  ]);
}

function bannedTokenGuardrailStatus(draft: Wc01V2ConcernPolicyInputDraft) {
  const serialized = JSON.stringify(draft);
  return {
    containsForbiddenGapStatusToken: serialized.includes("gap_observed"),
    containsLegalConclusionClaimLanguage: /\b(violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i.test(serialized),
  };
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
  failures: Wc01V2ConcernInputDryRunBatchSummary["malformedArtifacts"],
) {
  if (failures.length === 0) {
    return ["- none"];
  }
  return [
    "| Site | Allowlist path | Error |",
    "|---|---|---|",
    ...failures.map((failure) =>
      `| ${failure.siteKey} | ${failure.allowlistPath} | ${failure.errorMessage.replace(/\|/g, "/")} |`
    ),
  ];
}

function renderGuardrailFailureRows(
  failures: Wc01V2ConcernInputDryRunBatchSummary["guardrailFailures"],
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

function siteKeyForAllowlistPath(allowlistDir: string, allowlistPath: string) {
  const relativeDir = dirname(relative(allowlistDir, allowlistPath));
  return relativeDir === "." ? "root" : relativeDir.split(/[\\/]+/g).join("/");
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort();
}
