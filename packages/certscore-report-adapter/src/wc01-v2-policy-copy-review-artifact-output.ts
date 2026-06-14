import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildWc01V2PolicyCopyReviewArtifactJson,
  type Wc01V2PolicyCopyReviewArtifact,
  type Wc01V2PolicyCopyOutcome,
} from "./wc01-v2-policy-copy-review-artifact";

export type Wc01V2PolicyCopyReviewArtifactSummary = {
  packetVersion: string;
  siteDomain: string;
  queueItemId: string;
  candidateFamily: string;
  reviewerAction: string;
  policyCopyOutcome: Wc01V2PolicyCopyOutcome;
  allowedNextStep: string;
  productionEligible: false;
  customerFacingEligible: false;
  explicitApprovalRequired: true;
  sensitiveContextCategories: string[];
  sensitiveContextIsRoutingMetadataOnly: true;
  evidenceRefCount: number;
  excerptRefCount: number;
  confidenceBand: string;
  directness: string;
  familyEvidenceContextCount: number;
  allowedInternalPhrasingCount: number;
  blockedPhrasingPatternCount: number;
  decisionCounts: Record<string, number>;
  unresolvedRefCount: number;
  unresolvedRefsBlockReview: boolean;
  redactionSanitizationPassed: boolean;
  redactionWarningCount: number;
  caveatCount: number;
  coverageLimitationCount: number;
  blockedReason: string[];
  guardrails: Wc01V2PolicyCopyReviewArtifact["guardrails"];
};

type GenerateSingleInput = {
  inputPath: string;
  outPath: string;
  summaryPath?: string | false;
};

export async function generateWc01V2PolicyCopyReviewArtifactSingleFromFile(
  input: GenerateSingleInput,
) {
  const artifact = buildWc01V2PolicyCopyReviewArtifactJson(await readFile(input.inputPath, "utf8"));
  const summary = buildWc01V2PolicyCopyReviewArtifactSummary(artifact);
  const summaryPath = input.summaryPath === false
    ? null
    : input.summaryPath ?? join(dirname(input.outPath), "Wc01V2PolicyCopyReviewArtifact.summary.md");

  await mkdir(dirname(input.outPath), { recursive: true });
  await writeFile(input.outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  if (summaryPath) {
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, renderWc01V2PolicyCopyReviewArtifactMarkdown(summary), "utf8");
  }

  return { artifact, summary, summaryPath };
}

export function buildWc01V2PolicyCopyReviewArtifactSummary(
  artifact: Wc01V2PolicyCopyReviewArtifact,
): Wc01V2PolicyCopyReviewArtifactSummary {
  return {
    packetVersion: artifact.packetVersion,
    siteDomain: artifact.siteDomain,
    queueItemId: artifact.queueItemId,
    candidateFamily: artifact.candidateFamily,
    reviewerAction: artifact.reviewerAction,
    policyCopyOutcome: artifact.policyCopyOutcome,
    allowedNextStep: artifact.allowedNextStep,
    productionEligible: artifact.productionEligible,
    customerFacingEligible: artifact.customerFacingEligible,
    explicitApprovalRequired: artifact.explicitApprovalRequired,
    sensitiveContextCategories: artifact.sensitiveContextCategories,
    sensitiveContextIsRoutingMetadataOnly: artifact.sensitiveContextIsRoutingMetadataOnly,
    evidenceRefCount: artifact.evidenceRefs.length,
    excerptRefCount: artifact.excerptRefs.length,
    confidenceBand: artifact.confidenceBand,
    directness: artifact.directness,
    familyEvidenceContextCount: artifact.familyEvidenceContext.length,
    allowedInternalPhrasingCount: artifact.allowedInternalPhrasing.length,
    blockedPhrasingPatternCount: artifact.blockedPhrasingPatterns.length,
    decisionCounts: countBy(artifact.policyCopyDecisions.map((decision) => decision.decision)),
    unresolvedRefCount: artifact.unresolvedRefsDisposition.unresolvedRefCount,
    unresolvedRefsBlockReview: artifact.unresolvedRefsDisposition.blocksReview,
    redactionSanitizationPassed: artifact.redactionSanitization.passed,
    redactionWarningCount: artifact.redactionSanitization.warningCount,
    caveatCount: artifact.caveats.length,
    coverageLimitationCount: artifact.coverageLimitations.length,
    blockedReason: artifact.blockedReason,
    guardrails: artifact.guardrails,
  };
}

export function renderWc01V2PolicyCopyReviewArtifactMarkdown(
  summary: Wc01V2PolicyCopyReviewArtifactSummary,
) {
  return [
    "# WC01 v2 Policy/Copy Review Artifact",
    "",
    "Internal diagnostic only. Not implementation approval. Not customer-facing report output.",
    "",
    `- Packet version: ${summary.packetVersion}`,
    `- Site/domain: ${summary.siteDomain}`,
    `- Queue item ID: ${summary.queueItemId}`,
    `- Candidate family: ${summary.candidateFamily}`,
    `- Reviewer action: ${summary.reviewerAction}`,
    `- Policy/copy outcome: ${summary.policyCopyOutcome}`,
    `- Allowed next step: ${summary.allowedNextStep}`,
    `- Production eligible: ${String(summary.productionEligible)}`,
    `- Customer-facing eligible: ${String(summary.customerFacingEligible)}`,
    `- Explicit approval required: ${String(summary.explicitApprovalRequired)}`,
    `- Sensitive context is routing metadata only: ${String(summary.sensitiveContextIsRoutingMetadataOnly)}`,
    `- Sensitive-context categories: ${summary.sensitiveContextCategories.join(", ") || "none"}`,
    `- Evidence refs: ${summary.evidenceRefCount}`,
    `- Excerpt refs: ${summary.excerptRefCount}`,
    `- Confidence band: ${summary.confidenceBand}`,
    `- Directness: ${summary.directness}`,
    `- Family evidence context entries: ${summary.familyEvidenceContextCount}`,
    `- Allowed internal phrasing entries: ${summary.allowedInternalPhrasingCount}`,
    `- Blocked phrasing pattern entries: ${summary.blockedPhrasingPatternCount}`,
    `- Unresolved refs: ${summary.unresolvedRefCount}`,
    `- Unresolved refs block review: ${String(summary.unresolvedRefsBlockReview)}`,
    `- Redaction/sanitization passed: ${String(summary.redactionSanitizationPassed)}`,
    `- Redaction warnings: ${summary.redactionWarningCount}`,
    `- Caveats: ${summary.caveatCount}`,
    `- Coverage limitations: ${summary.coverageLimitationCount}`,
    "",
    "## Policy/Copy Decisions",
    "",
    renderCountTable(summary.decisionCounts, "Decision"),
    "",
    "## Blocked Reasons",
    "",
    summary.blockedReason.length > 0
      ? summary.blockedReason.map((reason) => `- ${reason}`).join("\n")
      : "- none",
    "",
    "## Guardrails",
    "",
    `- No app UI: ${String(summary.guardrails.noAppUi)}`,
    `- No persistence: ${String(summary.guardrails.noPersistence)}`,
    `- No production integration: ${String(summary.guardrails.noProductionIntegration)}`,
    `- No production concern policy call: ${String(summary.guardrails.noProductionConcernPolicyCall)}`,
    `- No persisted normalized concerns: ${String(summary.guardrails.noPersistedNormalizedConcerns)}`,
    `- No unified findings: ${String(summary.guardrails.noUnifiedFindings)}`,
    `- No report/checklist/executive/scoring/regulatory output: ${String(summary.guardrails.noReportChecklistExecutiveScoringRegulatoryOutput)}`,
    `- No API/MCP/export output: ${String(summary.guardrails.noApiMcpExportOutput)}`,
    `- No customer-facing copy: ${String(summary.guardrails.noCustomerFacingCopy)}`,
    `- No legal-conclusion language: ${String(summary.guardrails.noLegalConclusionLanguage)}`,
    `- No forbidden status mapping: ${String(summary.guardrails.noForbiddenStatusMapping)}`,
    `- No raw blocked fields: ${String(summary.guardrails.noRawBlockedFields)}`,
  ].join("\n");
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

function countBy(values: string[]) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}
