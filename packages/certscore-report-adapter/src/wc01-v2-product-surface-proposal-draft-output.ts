import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildWc01V2ProductSurfaceProposalDraftJson,
  type Wc01V2ProductSurfaceProposalDraft,
} from "./wc01-v2-product-surface-proposal-draft";

export type Wc01V2ProductSurfaceProposalDraftSummary = {
  packetVersion: string;
  proposedSurfaceClass: string;
  proposedSurfaceAudience: string;
  implementationStatus: "not_approved";
  productionEligible: false;
  customerFacingEligible: false;
  explicitApprovalRequired: true;
  allowedFamilyCount: number;
  blockedFamilyCount: number;
  sensitiveContextRequired: boolean;
  sensitiveContextCategories: string[];
  copyPosture: string;
  userVisibleWordingStatus: string;
  evidenceRequirementCount: number;
  guardrailRequirementCount: number;
  approvalRequirementCounts: Record<string, number>;
  failClosedReasons: string[];
  guardrails: Wc01V2ProductSurfaceProposalDraft["guardrails"];
};

type GenerateSingleInput = {
  inputPath: string;
  outPath: string;
  summaryPath?: string | false;
};

export async function generateWc01V2ProductSurfaceProposalDraftSingleFromFile(
  input: GenerateSingleInput,
) {
  const draft = buildWc01V2ProductSurfaceProposalDraftJson(await readFile(input.inputPath, "utf8"));
  const summary = buildWc01V2ProductSurfaceProposalDraftSummary(draft);
  const summaryPath = input.summaryPath === false
    ? null
    : input.summaryPath ?? join(dirname(input.outPath), "Wc01V2ProductSurfaceProposalDraft.summary.md");

  await mkdir(dirname(input.outPath), { recursive: true });
  await writeFile(input.outPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");

  if (summaryPath) {
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, renderWc01V2ProductSurfaceProposalDraftMarkdown(summary), "utf8");
  }

  return { draft, summary, summaryPath };
}

export function buildWc01V2ProductSurfaceProposalDraftSummary(
  draft: Wc01V2ProductSurfaceProposalDraft,
): Wc01V2ProductSurfaceProposalDraftSummary {
  return {
    packetVersion: draft.packetVersion,
    proposedSurfaceClass: draft.proposedSurfaceClass,
    proposedSurfaceAudience: draft.proposedSurfaceAudience,
    implementationStatus: draft.implementationStatus,
    productionEligible: draft.productionEligible,
    customerFacingEligible: draft.customerFacingEligible,
    explicitApprovalRequired: draft.explicitApprovalRequired,
    allowedFamilyCount: draft.allowedFamilies.length,
    blockedFamilyCount: draft.blockedFamilies.length,
    sensitiveContextRequired: draft.sensitiveContextHandling.required,
    sensitiveContextCategories: draft.sensitiveContextHandling.categories,
    copyPosture: draft.copyPosture,
    userVisibleWordingStatus: draft.userVisibleWordingStatus,
    evidenceRequirementCount: draft.evidenceRequirements.length,
    guardrailRequirementCount: draft.guardrailRequirements.length,
    approvalRequirementCounts: countBy(draft.approvalRequirements.map((requirement) => requirement.status)),
    failClosedReasons: draft.failClosedReasons,
    guardrails: draft.guardrails,
  };
}

export function renderWc01V2ProductSurfaceProposalDraftMarkdown(
  summary: Wc01V2ProductSurfaceProposalDraftSummary,
) {
  return [
    "# WC01 v2 Product Surface Proposal Draft",
    "",
    "Internal diagnostic only. Not implementation approval. Not customer-facing report output.",
    "",
    `- Packet version: ${summary.packetVersion}`,
    `- Proposed surface class: ${summary.proposedSurfaceClass}`,
    `- Proposed audience: ${summary.proposedSurfaceAudience}`,
    `- Implementation status: ${summary.implementationStatus}`,
    `- Production eligible: ${String(summary.productionEligible)}`,
    `- Customer-facing eligible: ${String(summary.customerFacingEligible)}`,
    `- Explicit approval required: ${String(summary.explicitApprovalRequired)}`,
    `- Copy posture: ${summary.copyPosture}`,
    `- User-visible wording status: ${summary.userVisibleWordingStatus}`,
    `- Allowed families: ${summary.allowedFamilyCount}`,
    `- Blocked families: ${summary.blockedFamilyCount}`,
    `- Sensitive context required: ${String(summary.sensitiveContextRequired)}`,
    `- Sensitive context categories: ${summary.sensitiveContextCategories.join(", ") || "none"}`,
    `- Evidence requirements: ${summary.evidenceRequirementCount}`,
    `- Guardrail requirements: ${summary.guardrailRequirementCount}`,
    "",
    "## Approval Requirements",
    "",
    renderCountTable(summary.approvalRequirementCounts, "Status"),
    "",
    "## Fail-Closed Reasons",
    "",
    summary.failClosedReasons.length > 0
      ? summary.failClosedReasons.map((reason) => `- ${reason}`).join("\n")
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
