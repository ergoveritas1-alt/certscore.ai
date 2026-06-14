import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { Wc01V2ShadowProjection } from "./wc01-shadow-contract";
import {
  projectWc01V2ShadowJsonToAllowlistDryRun,
  projectWc01V2ShadowToAllowlistDryRun,
  type Wc01V2AllowlistDryRun,
  type Wc01V2BlockedRow,
  type Wc01V2NormalizedConcernCandidateDraft,
} from "./wc01-v2-allowlist-bridge";

export type Wc01V2AllowlistDryRunInspectionSummary = {
  source: Wc01V2AllowlistDryRun["source"];
  productionEligible: false;
  totalRowsEvaluated: number;
  candidateCount: number;
  blockedCount: number;
  candidatesByProposedConcernFamily: Record<string, number>;
  blockedByTier: Record<string, number>;
  topBlockReasons: Record<string, number>;
  candidateVendorPurposeCounts: Record<string, number>;
  candidateSupportingPurposeCounts: Record<string, number>;
  candidateDiagnosticPurposeCounts: Record<string, number>;
  surpriseCandidateCount: number;
  candidatesWithDiagnosticOnlyPurposesCount: number;
  candidatesWithTierCDiagnosticPurposeCount: number;
  candidatesBlockedForTierCDiagnosticPurposeCount: number;
  mixedTrackerAndTierCBlockedCount: number;
  diagnosticSecurityPresenceCount: number;
  diagnosticPerformancePresenceCount: number;
  diagnosticCustomerSupportPresenceCount: number;
  diagnosticInfrastructurePresenceCount: number;
  tagManagementDiagnosticPresenceCount: number;
  tagManagementSupportingCount: number;
  consentManagementSupportingCount: number;
  candidatesWithTagManagementPresentCount: number;
  candidatesWithConsentManagementPresentCount: number;
  candidatesWithOriginalShadowStatusNotAllowedCount: number;
  candidatesMissingSourceRefsCount: number;
  candidatesMissingExcerptsOrDisplaySafeEvidenceCount: number;
  candidatesWithWeakOrMissingConfidenceDirectnessCount: number;
  thirdPartyVendorsObservedCandidateCount: number;
  tierBcLeakageCount: number;
  guardrails: Wc01V2AllowlistDryRun["guardrails"];
};

export type Wc01V2AllowlistDryRunBatchSiteResult = {
  shadowPath: string;
  siteKey: string;
  status: "succeeded" | "failed";
  outputPath?: string;
  summaryPath?: string;
  errorMessage?: string;
  summary?: Wc01V2AllowlistDryRunInspectionSummary;
};

export type Wc01V2AllowlistDryRunBatchSummary = {
  inputShadowDir: string;
  outputDir: string;
  totalShadowFilesFound: number;
  succeededCount: number;
  failedCount: number;
  failures: Array<{
    errorMessage: string;
    shadowPath: string;
    siteKey: string;
  }>;
  totalCandidates: number;
  totalBlockedRows: number;
  candidatesByProposedConcernFamily: Record<string, number>;
  blockedByTier: Record<string, number>;
  topBlockReasons: Record<string, number>;
  candidateSupportingPurposeCounts: Record<string, number>;
  candidateDiagnosticPurposeCounts: Record<string, number>;
  surpriseCandidateCount: number;
  candidatesWithDiagnosticOnlyPurposesCount: number;
  candidatesWithTierCDiagnosticPurposeCount: number;
  candidatesBlockedForTierCDiagnosticPurposeCount: number;
  mixedTrackerAndTierCBlockedCount: number;
  diagnosticSecurityPresenceCount: number;
  diagnosticPerformancePresenceCount: number;
  diagnosticCustomerSupportPresenceCount: number;
  diagnosticInfrastructurePresenceCount: number;
  tagManagementDiagnosticPresenceCount: number;
  tagManagementSupportingCount: number;
  consentManagementSupportingCount: number;
  candidatesWithTagManagementPresentCount: number;
  candidatesWithConsentManagementPresentCount: number;
  candidatesWithOriginalShadowStatusNotAllowedCount: number;
  candidatesMissingSourceRefsCount: number;
  candidatesMissingExcerptsOrDisplaySafeEvidenceCount: number;
  candidatesWithWeakOrMissingConfidenceDirectnessCount: number;
  thirdPartyVendorsObservedCandidateCount: number;
  tierBcLeakageCount: number;
  sitesWithCandidates: string[];
  sitesWithZeroCandidates: string[];
  guardrailFailures: Array<{
    failures: string[];
    siteKey: string;
  }>;
  malformedArtifacts: Array<{
    errorMessage: string;
    shadowPath: string;
    siteKey: string;
  }>;
  siteResults: Wc01V2AllowlistDryRunBatchSiteResult[];
};

type GenerateSingleInput = {
  outPath: string;
  shadowPath: string;
  summaryPath?: string | false;
};

type GenerateSingleFromShadowInput = {
  outPath: string;
  shadow: Wc01V2ShadowProjection;
  summaryPath?: string | false;
};

type GenerateBatchInput = {
  aggregateJsonPath?: string;
  aggregateMarkdownPath?: string;
  outDir: string;
  shadowDir: string;
};

export async function generateWc01V2AllowlistDryRunSingleFromFile(
  input: GenerateSingleInput,
) {
  const dryRun = projectWc01V2ShadowJsonToAllowlistDryRun(await readFile(input.shadowPath, "utf8"));
  return writeWc01V2AllowlistDryRunSingle({
    dryRun,
    outPath: input.outPath,
    summaryPath: input.summaryPath,
  });
}

export async function generateWc01V2AllowlistDryRunSingleFromShadow(input: GenerateSingleFromShadowInput) {
  const dryRun = projectWc01V2ShadowToAllowlistDryRun(input.shadow);
  return writeWc01V2AllowlistDryRunSingle({
    dryRun,
    outPath: input.outPath,
    summaryPath: input.summaryPath,
  });
}

async function writeWc01V2AllowlistDryRunSingle(input: {
  dryRun: Wc01V2AllowlistDryRun;
  outPath: string;
  summaryPath?: string | false;
}) {
  const dryRun = input.dryRun;
  const summary = buildWc01V2AllowlistDryRunInspectionSummary(dryRun);
  const summaryPath = input.summaryPath === false
    ? null
    : input.summaryPath ?? join(dirname(input.outPath), "Wc01V2AllowlistDryRun.summary.md");

  await mkdir(dirname(input.outPath), { recursive: true });
  await writeFile(input.outPath, `${JSON.stringify(dryRun, null, 2)}\n`, "utf8");

  if (summaryPath) {
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, renderWc01V2AllowlistDryRunMarkdown(summary), "utf8");
  }

  return { dryRun, summary, summaryPath };
}

export async function generateWc01V2AllowlistDryRunBatch(
  input: GenerateBatchInput,
): Promise<Wc01V2AllowlistDryRunBatchSummary> {
  const shadowPaths = await findWc01V2ShadowProjectionFiles(input.shadowDir);
  const siteResults: Wc01V2AllowlistDryRunBatchSiteResult[] = [];

  for (const shadowPath of shadowPaths) {
    const siteKey = siteKeyForShadowPath(input.shadowDir, shadowPath);
    const relativeOutputDir = dirname(relative(input.shadowDir, shadowPath));
    const outDir = relativeOutputDir === "." ? input.outDir : join(input.outDir, relativeOutputDir);
    const outputPath = join(outDir, "Wc01V2AllowlistDryRun.json");
    const summaryPath = join(outDir, "Wc01V2AllowlistDryRun.summary.md");

    try {
      const generated = await generateWc01V2AllowlistDryRunSingleFromFile({
        shadowPath,
        outPath: outputPath,
        summaryPath,
      });
      siteResults.push({
        shadowPath,
        siteKey,
        status: "succeeded",
        outputPath,
        summaryPath,
        summary: generated.summary,
      });
    } catch (error) {
      siteResults.push({
        shadowPath,
        siteKey,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = buildWc01V2AllowlistDryRunBatchSummary({
    inputShadowDir: input.shadowDir,
    outputDir: input.outDir,
    siteResults,
    totalShadowFilesFound: shadowPaths.length,
  });
  const aggregateJsonPath = input.aggregateJsonPath ?? join(input.outDir, "wc01-v2-allowlist-dry-run-summary.json");
  const aggregateMarkdownPath = input.aggregateMarkdownPath ?? join(input.outDir, "wc01-v2-allowlist-dry-run-summary.md");

  await mkdir(input.outDir, { recursive: true });
  await writeFile(aggregateJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(aggregateMarkdownPath, renderWc01V2AllowlistDryRunBatchMarkdown(summary), "utf8");

  return summary;
}

export async function findWc01V2ShadowProjectionFiles(shadowDir: string) {
  const results: string[] = [];

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && entry.name === "Wc01V2ShadowProjection.json") {
        results.push(entryPath);
      }
    }
  }

  await walk(shadowDir);
  return results.sort();
}

export function buildWc01V2AllowlistDryRunInspectionSummary(
  dryRun: Wc01V2AllowlistDryRun,
): Wc01V2AllowlistDryRunInspectionSummary {
  return {
    source: dryRun.source,
    productionEligible: dryRun.productionEligible,
    totalRowsEvaluated: dryRun.candidates.length + dryRun.blockedRows.length,
    candidateCount: dryRun.candidates.length,
    blockedCount: dryRun.blockedRows.length,
    candidatesByProposedConcernFamily: countBy(dryRun.candidates.map((candidate) => candidate.proposedConcernFamily)),
    blockedByTier: countBy(dryRun.blockedRows.map((row) => row.tier)),
    topBlockReasons: countBy(dryRun.blockedRows.flatMap((row) => row.blockReasons)),
    candidateVendorPurposeCounts: countBy(dryRun.candidates.flatMap(candidateVendorPurposes)),
    candidateSupportingPurposeCounts: countBy(dryRun.candidates.flatMap((candidate) => candidate.purposeClassification.supportingPurposes)),
    candidateDiagnosticPurposeCounts: countBy(dryRun.candidates.flatMap((candidate) => candidate.purposeClassification.diagnosticPurposes)),
    surpriseCandidateCount: dryRun.candidates.filter(isSurpriseCandidate).length,
    candidatesWithDiagnosticOnlyPurposesCount: dryRun.candidates.filter((candidate) =>
      candidate.purposeClassification.diagnosticPurposes.length > 0
    ).length,
    candidatesWithTierCDiagnosticPurposeCount: dryRun.candidates.filter(candidateHasTierCDiagnosticPurpose).length,
    candidatesBlockedForTierCDiagnosticPurposeCount: dryRun.blockedRows.filter(rowBlockedForTierCDiagnosticPurpose).length,
    mixedTrackerAndTierCBlockedCount: dryRun.blockedRows.filter(rowBlockedForMixedTrackerAndTierC).length,
    diagnosticSecurityPresenceCount: dryRun.candidates.filter((candidate) =>
      candidate.purposeClassification.diagnosticPurposes.includes("security")
    ).length,
    diagnosticPerformancePresenceCount: dryRun.candidates.filter((candidate) =>
      candidate.purposeClassification.diagnosticPurposes.includes("performance_monitoring") ||
      candidate.purposeClassification.diagnosticPurposes.includes("rum")
    ).length,
    diagnosticCustomerSupportPresenceCount: dryRun.candidates.filter((candidate) =>
      candidate.purposeClassification.diagnosticPurposes.includes("customer_support") ||
      candidate.purposeClassification.diagnosticPurposes.includes("live_chat")
    ).length,
    diagnosticInfrastructurePresenceCount: dryRun.candidates.filter((candidate) =>
      candidate.purposeClassification.diagnosticPurposes.some((purpose) => infrastructurePurposes.has(purpose))
    ).length,
    tagManagementDiagnosticPresenceCount: dryRun.candidates.filter((candidate) =>
      candidate.purposeClassification.diagnosticPurposes.includes("tag_management")
    ).length,
    tagManagementSupportingCount: dryRun.candidates.filter((candidate) =>
      candidate.purposeClassification.supportingPurposes.includes("tag_management")
    ).length,
    consentManagementSupportingCount: dryRun.candidates.filter((candidate) =>
      candidate.purposeClassification.supportingPurposes.includes("consent_management")
    ).length,
    candidatesWithTagManagementPresentCount: dryRun.candidates.filter((candidate) =>
      candidate.purposeClassification.diagnosticPurposes.includes("tag_management") ||
      candidate.vendors.some((vendor) => vendor.purposes.includes("tag_management"))
    ).length,
    candidatesWithConsentManagementPresentCount: dryRun.candidates.filter((candidate) =>
      candidate.purposeClassification.diagnosticPurposes.includes("consent_management") ||
      candidate.vendors.some((vendor) => vendor.purposes.includes("consent_management"))
    ).length,
    candidatesWithOriginalShadowStatusNotAllowedCount: dryRun.candidates.filter((candidate) =>
      !candidateOriginalStatusAllowed(candidate)
    ).length,
    candidatesMissingSourceRefsCount: dryRun.candidates.filter((candidate) =>
      candidate.evidence.sourceRefIds.length === 0
    ).length,
    candidatesMissingExcerptsOrDisplaySafeEvidenceCount: dryRun.candidates.filter((candidate) =>
      candidate.evidence.excerptIds.length === 0 && candidate.evidence.displaySafeExcerptCount === 0
    ).length,
    candidatesWithWeakOrMissingConfidenceDirectnessCount: dryRun.candidates.filter((candidate) =>
      candidate.confidence.band === "low" ||
      !candidate.confidence.band ||
      candidate.confidence.directVsInferred === "unknown" ||
      candidate.confidence.directVsInferred === "inferred" ||
      !candidate.confidence.directVsInferred
    ).length,
    thirdPartyVendorsObservedCandidateCount: dryRun.candidates.filter((candidate) =>
      candidate.source.sourceFindingKey === "third_party_vendors_observed"
    ).length,
    tierBcLeakageCount: dryRun.candidates.filter((candidate) =>
      isTierBSourceKey(candidate.source.sourceFindingKey) ||
      candidate.purposeClassification.diagnosticPurposes.some((purpose) => tierCPurposes.has(purpose))
    ).length,
    guardrails: dryRun.guardrails,
  };
}

export function renderWc01V2AllowlistDryRunMarkdown(
  summary: Wc01V2AllowlistDryRunInspectionSummary,
) {
  return [
    "# WC01 v2 Allowlist Dry Run",
    "",
    "Dry run only. Not production normalized concerns. Not customer-facing report output.",
    "",
    `- Source URL: ${summary.source.url}`,
    `- Scan ID: ${summary.source.scanId}`,
    `- Review ID: ${summary.source.reviewId ?? "unknown"}`,
    `- Production eligible: ${String(summary.productionEligible)}`,
    `- Total rows evaluated: ${summary.totalRowsEvaluated}`,
    `- Candidate count: ${summary.candidateCount}`,
    `- Blocked count: ${summary.blockedCount}`,
    "",
    "## Candidate Counts By Proposed Concern Family",
    "",
    renderCountTable(summary.candidatesByProposedConcernFamily, "Family"),
    "",
    "## Blocked Counts By Tier",
    "",
    renderCountTable(summary.blockedByTier, "Tier"),
    "",
    "## Top Block Reasons",
    "",
    renderCountTable(summary.topBlockReasons, "Reason"),
    "",
    "## Candidate Vendor Purposes",
    "",
    renderCountTable(summary.candidateVendorPurposeCounts, "Purpose"),
    "",
    "## Candidate Purpose Classification",
    "",
    "Supporting purposes:",
    "",
    renderCountTable(summary.candidateSupportingPurposeCounts, "Purpose"),
    "",
    "Diagnostic purposes:",
    "",
    renderCountTable(summary.candidateDiagnosticPurposeCounts, "Purpose"),
    "",
    "## Audit Checks",
    "",
    `- surprise candidates: ${summary.surpriseCandidateCount}`,
    `- candidates with diagnostic-only purposes: ${summary.candidatesWithDiagnosticOnlyPurposesCount}`,
    `- candidates_with_tier_c_diagnostic_purpose: ${summary.candidatesWithTierCDiagnosticPurposeCount}`,
    `- candidates_blocked_for_tier_c_diagnostic_purpose: ${summary.candidatesBlockedForTierCDiagnosticPurposeCount}`,
    `- mixed_tracker_and_tier_c_blocked_count: ${summary.mixedTrackerAndTierCBlockedCount}`,
    `- diagnostic_security_presence: ${summary.diagnosticSecurityPresenceCount}`,
    `- diagnostic_performance_presence: ${summary.diagnosticPerformancePresenceCount}`,
    `- diagnostic_customer_support_presence: ${summary.diagnosticCustomerSupportPresenceCount}`,
    `- diagnostic_infrastructure_presence: ${summary.diagnosticInfrastructurePresenceCount}`,
    `- tag_management_diagnostic_presence: ${summary.tagManagementDiagnosticPresenceCount}`,
    `- tag_management_supporting_count: ${summary.tagManagementSupportingCount}`,
    `- consent_management_supporting_count: ${summary.consentManagementSupportingCount}`,
    `- candidates with tag_management present: ${summary.candidatesWithTagManagementPresentCount}`,
    `- candidates with consent_management present: ${summary.candidatesWithConsentManagementPresentCount}`,
    `- candidates whose original shadow status was not allowed: ${summary.candidatesWithOriginalShadowStatusNotAllowedCount}`,
    `- candidates missing source refs: ${summary.candidatesMissingSourceRefsCount}`,
    `- candidates missing excerpts/display-safe evidence: ${summary.candidatesMissingExcerptsOrDisplaySafeEvidenceCount}`,
    `- candidates with weak/missing confidence or directness: ${summary.candidatesWithWeakOrMissingConfidenceDirectnessCount}`,
    `- candidates from third_party_vendors_observed: ${summary.thirdPartyVendorsObservedCandidateCount}`,
    `- Tier B/C leakage count: ${summary.tierBcLeakageCount}`,
    "",
    "## Guardrails",
    "",
    `- productionEligible false: ${String(summary.productionEligible === false && summary.guardrails.noProductionEligibility)}`,
    `- no candidate topFindingEligible: ${String(summary.guardrails.noTopFindingEligibility)}`,
    `- no candidate gapEligible: ${String(summary.guardrails.noGapEligibility)}`,
    `- no forbidden gap status token: ${String(summary.guardrails.noGapObserved)}`,
    `- no raw blocked fields: ${String(summary.guardrails.noRawBlockedFields)}`,
    "",
  ].join("\n");
}

export function buildWc01V2AllowlistDryRunBatchSummary(input: {
  inputShadowDir: string;
  outputDir: string;
  siteResults: Wc01V2AllowlistDryRunBatchSiteResult[];
  totalShadowFilesFound: number;
}): Wc01V2AllowlistDryRunBatchSummary {
  const succeeded = input.siteResults.filter((result) => result.status === "succeeded" && result.summary);
  const failed = input.siteResults.filter((result) => result.status === "failed");
  const candidatesByProposedConcernFamily: Record<string, number> = {};
  const blockedByTier: Record<string, number> = {};
  const topBlockReasons: Record<string, number> = {};
  const candidateSupportingPurposeCounts: Record<string, number> = {};
  const candidateDiagnosticPurposeCounts: Record<string, number> = {};
  const guardrailFailures: Wc01V2AllowlistDryRunBatchSummary["guardrailFailures"] = [];
  const sitesWithCandidates: string[] = [];
  const sitesWithZeroCandidates: string[] = [];
  let totalCandidates = 0;
  let totalBlockedRows = 0;
  let surpriseCandidateCount = 0;
  let candidatesWithDiagnosticOnlyPurposesCount = 0;
  let candidatesWithTierCDiagnosticPurposeCount = 0;
  let candidatesBlockedForTierCDiagnosticPurposeCount = 0;
  let mixedTrackerAndTierCBlockedCount = 0;
  let diagnosticSecurityPresenceCount = 0;
  let diagnosticPerformancePresenceCount = 0;
  let diagnosticCustomerSupportPresenceCount = 0;
  let diagnosticInfrastructurePresenceCount = 0;
  let tagManagementDiagnosticPresenceCount = 0;
  let tagManagementSupportingCount = 0;
  let consentManagementSupportingCount = 0;
  let candidatesWithTagManagementPresentCount = 0;
  let candidatesWithConsentManagementPresentCount = 0;
  let candidatesWithOriginalShadowStatusNotAllowedCount = 0;
  let candidatesMissingSourceRefsCount = 0;
  let candidatesMissingExcerptsOrDisplaySafeEvidenceCount = 0;
  let candidatesWithWeakOrMissingConfidenceDirectnessCount = 0;
  let thirdPartyVendorsObservedCandidateCount = 0;
  let tierBcLeakageCount = 0;

  for (const result of succeeded) {
    const summary = result.summary!;
    totalCandidates += summary.candidateCount;
    totalBlockedRows += summary.blockedCount;
    addCounts(candidatesByProposedConcernFamily, summary.candidatesByProposedConcernFamily);
    addCounts(blockedByTier, summary.blockedByTier);
    addCounts(topBlockReasons, summary.topBlockReasons);
    addCounts(candidateSupportingPurposeCounts, summary.candidateSupportingPurposeCounts);
    addCounts(candidateDiagnosticPurposeCounts, summary.candidateDiagnosticPurposeCounts);
    surpriseCandidateCount += summary.surpriseCandidateCount;
    candidatesWithDiagnosticOnlyPurposesCount += summary.candidatesWithDiagnosticOnlyPurposesCount;
    candidatesWithTierCDiagnosticPurposeCount += summary.candidatesWithTierCDiagnosticPurposeCount;
    candidatesBlockedForTierCDiagnosticPurposeCount += summary.candidatesBlockedForTierCDiagnosticPurposeCount;
    mixedTrackerAndTierCBlockedCount += summary.mixedTrackerAndTierCBlockedCount;
    diagnosticSecurityPresenceCount += summary.diagnosticSecurityPresenceCount;
    diagnosticPerformancePresenceCount += summary.diagnosticPerformancePresenceCount;
    diagnosticCustomerSupportPresenceCount += summary.diagnosticCustomerSupportPresenceCount;
    diagnosticInfrastructurePresenceCount += summary.diagnosticInfrastructurePresenceCount;
    tagManagementDiagnosticPresenceCount += summary.tagManagementDiagnosticPresenceCount;
    tagManagementSupportingCount += summary.tagManagementSupportingCount;
    consentManagementSupportingCount += summary.consentManagementSupportingCount;
    candidatesWithTagManagementPresentCount += summary.candidatesWithTagManagementPresentCount;
    candidatesWithConsentManagementPresentCount += summary.candidatesWithConsentManagementPresentCount;
    candidatesWithOriginalShadowStatusNotAllowedCount += summary.candidatesWithOriginalShadowStatusNotAllowedCount;
    candidatesMissingSourceRefsCount += summary.candidatesMissingSourceRefsCount;
    candidatesMissingExcerptsOrDisplaySafeEvidenceCount += summary.candidatesMissingExcerptsOrDisplaySafeEvidenceCount;
    candidatesWithWeakOrMissingConfidenceDirectnessCount += summary.candidatesWithWeakOrMissingConfidenceDirectnessCount;
    thirdPartyVendorsObservedCandidateCount += summary.thirdPartyVendorsObservedCandidateCount;
    tierBcLeakageCount += summary.tierBcLeakageCount;
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
    inputShadowDir: input.inputShadowDir,
    outputDir: input.outputDir,
    totalShadowFilesFound: input.totalShadowFilesFound,
    succeededCount: succeeded.length,
    failedCount: failed.length,
    failures: failed.map((result) => ({
      errorMessage: result.errorMessage ?? "Unknown failure.",
      shadowPath: result.shadowPath,
      siteKey: result.siteKey,
    })),
    totalCandidates,
    totalBlockedRows,
    candidatesByProposedConcernFamily,
    blockedByTier,
    topBlockReasons,
    candidateSupportingPurposeCounts,
    candidateDiagnosticPurposeCounts,
    surpriseCandidateCount,
    candidatesWithDiagnosticOnlyPurposesCount,
    candidatesWithTierCDiagnosticPurposeCount,
    candidatesBlockedForTierCDiagnosticPurposeCount,
    mixedTrackerAndTierCBlockedCount,
    diagnosticSecurityPresenceCount,
    diagnosticPerformancePresenceCount,
    diagnosticCustomerSupportPresenceCount,
    diagnosticInfrastructurePresenceCount,
    tagManagementDiagnosticPresenceCount,
    tagManagementSupportingCount,
    consentManagementSupportingCount,
    candidatesWithTagManagementPresentCount,
    candidatesWithConsentManagementPresentCount,
    candidatesWithOriginalShadowStatusNotAllowedCount,
    candidatesMissingSourceRefsCount,
    candidatesMissingExcerptsOrDisplaySafeEvidenceCount,
    candidatesWithWeakOrMissingConfidenceDirectnessCount,
    thirdPartyVendorsObservedCandidateCount,
    tierBcLeakageCount,
    sitesWithCandidates: uniqueStrings(sitesWithCandidates),
    sitesWithZeroCandidates: uniqueStrings(sitesWithZeroCandidates),
    guardrailFailures,
    malformedArtifacts: failed.map((result) => ({
      errorMessage: result.errorMessage ?? "Unknown failure.",
      shadowPath: result.shadowPath,
      siteKey: result.siteKey,
    })),
    siteResults: input.siteResults,
  };
}

export function renderWc01V2AllowlistDryRunBatchMarkdown(
  summary: Wc01V2AllowlistDryRunBatchSummary,
) {
  return [
    "# WC01 v2 Allowlist Dry Run Batch Summary",
    "",
    "Dry run only. Not production normalized concerns. Not customer-facing report output.",
    "",
    `- Input shadow directory: ${summary.inputShadowDir}`,
    `- Output directory: ${summary.outputDir}`,
    `- Shadow files found: ${summary.totalShadowFilesFound}`,
    `- Succeeded: ${summary.succeededCount}`,
    `- Failed: ${summary.failedCount}`,
    `- Total candidates: ${summary.totalCandidates}`,
    `- Total blocked rows: ${summary.totalBlockedRows}`,
    "",
    "## Candidate Counts By Proposed Concern Family",
    "",
    renderCountTable(summary.candidatesByProposedConcernFamily, "Family"),
    "",
    "## Blocked Counts By Tier",
    "",
    renderCountTable(summary.blockedByTier, "Tier"),
    "",
    "## Top Block Reasons",
    "",
    renderCountTable(summary.topBlockReasons, "Reason"),
    "",
    "## Candidate Purpose Classification",
    "",
    "Supporting purposes:",
    "",
    renderCountTable(summary.candidateSupportingPurposeCounts, "Purpose"),
    "",
    "Diagnostic purposes:",
    "",
    renderCountTable(summary.candidateDiagnosticPurposeCounts, "Purpose"),
    "",
    "## Audit Checks",
    "",
    `- surprise candidates: ${summary.surpriseCandidateCount}`,
    `- candidates with diagnostic-only purposes: ${summary.candidatesWithDiagnosticOnlyPurposesCount}`,
    `- candidates_with_tier_c_diagnostic_purpose: ${summary.candidatesWithTierCDiagnosticPurposeCount}`,
    `- candidates_blocked_for_tier_c_diagnostic_purpose: ${summary.candidatesBlockedForTierCDiagnosticPurposeCount}`,
    `- mixed_tracker_and_tier_c_blocked_count: ${summary.mixedTrackerAndTierCBlockedCount}`,
    `- diagnostic_security_presence: ${summary.diagnosticSecurityPresenceCount}`,
    `- diagnostic_performance_presence: ${summary.diagnosticPerformancePresenceCount}`,
    `- diagnostic_customer_support_presence: ${summary.diagnosticCustomerSupportPresenceCount}`,
    `- diagnostic_infrastructure_presence: ${summary.diagnosticInfrastructurePresenceCount}`,
    `- tag_management_diagnostic_presence: ${summary.tagManagementDiagnosticPresenceCount}`,
    `- tag_management_supporting_count: ${summary.tagManagementSupportingCount}`,
    `- consent_management_supporting_count: ${summary.consentManagementSupportingCount}`,
    `- candidates with tag_management present: ${summary.candidatesWithTagManagementPresentCount}`,
    `- candidates with consent_management present: ${summary.candidatesWithConsentManagementPresentCount}`,
    `- candidates whose original shadow status was not allowed: ${summary.candidatesWithOriginalShadowStatusNotAllowedCount}`,
    `- candidates missing source refs: ${summary.candidatesMissingSourceRefsCount}`,
    `- candidates missing excerpts/display-safe evidence: ${summary.candidatesMissingExcerptsOrDisplaySafeEvidenceCount}`,
    `- candidates with weak/missing confidence or directness: ${summary.candidatesWithWeakOrMissingConfidenceDirectnessCount}`,
    `- candidates from third_party_vendors_observed: ${summary.thirdPartyVendorsObservedCandidateCount}`,
    `- Tier B/C leakage count: ${summary.tierBcLeakageCount}`,
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

function candidateVendorPurposes(candidate: Wc01V2NormalizedConcernCandidateDraft) {
  return candidate.vendors.flatMap((vendor) => vendor.purposes);
}

function isSurpriseCandidate(candidate: Wc01V2NormalizedConcernCandidateDraft) {
  return (
    candidate.source.sourceFindingKey === "third_party_vendors_observed" ||
    isTierBSourceKey(candidate.source.sourceFindingKey) ||
    !candidateOriginalStatusAllowed(candidate) ||
    candidate.evidence.sourceRefIds.length === 0 ||
    (candidate.evidence.excerptIds.length === 0 && candidate.evidence.displaySafeExcerptCount === 0) ||
    candidate.confidence.band === "low" ||
    !candidate.confidence.band ||
    candidate.confidence.directVsInferred === "unknown" ||
    candidate.confidence.directVsInferred === "inferred" ||
    !candidate.confidence.directVsInferred ||
    candidate.purposeClassification.diagnosticPurposes.some((purpose) => tierCPurposes.has(purpose)) ||
    candidate.purposeClassification.supportingPurposes.length === 0
  );
}

function candidateHasTierCDiagnosticPurpose(candidate: Wc01V2NormalizedConcernCandidateDraft) {
  return candidate.purposeClassification.diagnosticPurposes.some((purpose) => tierCPurposes.has(purpose));
}

function rowBlockedForTierCDiagnosticPurpose(row: Wc01V2BlockedRow) {
  return row.blockReasons.includes("tier_c_diagnostic_purpose_present");
}

function rowBlockedForMixedTrackerAndTierC(row: Wc01V2BlockedRow) {
  return row.blockReasons.includes("mixed_tracker_and_tier_c_purpose_requires_evidence_subset_gate");
}

function candidateOriginalStatusAllowed(candidate: Wc01V2NormalizedConcernCandidateDraft) {
  if (candidate.source.sourceFindingKey === "consent_banner_observed_or_not_observed") {
    return ["observed", "checked", "not_observed"].includes(candidate.source.shadowStatus);
  }
  return candidate.source.shadowStatus === "observed";
}

function isTierBSourceKey(sourceFindingKey: string) {
  return /unresolved.*endpoint|policy_runtime_vendor_alignment|accept_reject_runtime_delta|tracking_after_refusal|reject_did_not_reduce|persist_after_reject|post_reject|appear_only_after_accept|policy|privacy_notice|cookie_policy|privacy_choices|do_not_sell|gpc_disclosure|notice_at_collection|policy_vendor_mentions/i.test(sourceFindingKey);
}

const tierCPurposes = new Set([
  "security",
  "performance_monitoring",
  "customer_support",
  "cdn",
  "static",
  "site_owned_infrastructure",
  "infrastructure",
  "fraud_prevention",
  "bot_defense",
  "rum",
  "live_chat",
  "unknown",
]);

const infrastructurePurposes = new Set([
  "cdn",
  "static",
  "site_owned_infrastructure",
  "infrastructure",
  "unknown",
]);

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
    return "| " + label + " | Count |\n|---|---:|\n| none | 0 |";
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
  failures: Wc01V2AllowlistDryRunBatchSummary["malformedArtifacts"],
) {
  if (failures.length === 0) {
    return ["- none"];
  }
  return [
    "| Site | Shadow path | Error |",
    "|---|---|---|",
    ...failures.map((failure) =>
      `| ${failure.siteKey} | ${failure.shadowPath} | ${failure.errorMessage.replace(/\|/g, "/")} |`
    ),
  ];
}

function renderGuardrailFailureRows(
  failures: Wc01V2AllowlistDryRunBatchSummary["guardrailFailures"],
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

function siteKeyForShadowPath(shadowDir: string, shadowPath: string) {
  const relativeDir = dirname(relative(shadowDir, shadowPath));
  return relativeDir === "." ? "root" : relativeDir.split(/[\\/]+/g).join("/");
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort();
}
