import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildWc01V2LimitedAdminPreviewImplementationProposalDraftJson,
  type Wc01V2LimitedAdminPreviewImplementationProposalDraft,
} from "./wc01-v2-limited-admin-preview-implementation-proposal";

export type Wc01V2LimitedAdminPreviewImplementationProposalSummary = {
  proposalVersion: string;
  targetSurfaceClass: "limited_admin_internal_preview";
  implementationStatus: "not_approved";
  approvalStatus: Wc01V2LimitedAdminPreviewImplementationProposalDraft["approvalStatus"];
  surfaceStatus: "blocked_until_explicit_approval";
  targetRoute: "not_configured";
  proposalOwner: "TBD";
  sourceApprovalMetadataPath: string;
  sourceProductSurfaceProposalCount: number;
  allowedFamilies: string[];
  blockedFamilyContextCount: number;
  ownerApprovalCounts: Record<string, number>;
  guardrailRequirementCount: number;
  testPlanCount: number;
  failClosedReasons: string[];
  productionEligible: false;
  persistEligible: false;
  concernPolicyCallEligible: false;
  unifiedFindingEligible: false;
  checklistProjectionEligible: false;
  customerFacingEligible: false;
  explicitApprovalRequired: true;
  guardrails: Wc01V2LimitedAdminPreviewImplementationProposalDraft["guardrails"];
};

type GenerateSingleInput = {
  approvalMetadataPath: string;
  productSurfaceProposalPaths: string[];
  outPath: string;
  summaryPath?: string | false;
};

export async function generateWc01V2LimitedAdminPreviewImplementationProposalSingleFromFile(
  input: GenerateSingleInput,
) {
  const draft = buildWc01V2LimitedAdminPreviewImplementationProposalDraftJson({
    approvalMetadataRaw: await readFile(input.approvalMetadataPath, "utf8"),
    sourceApprovalMetadataPath: input.approvalMetadataPath,
    productSurfaceProposalRaws: await Promise.all(
      input.productSurfaceProposalPaths.map((path) => readFile(path, "utf8")),
    ),
    sourceProductSurfaceProposalPaths: input.productSurfaceProposalPaths,
  });
  const summary = buildWc01V2LimitedAdminPreviewImplementationProposalSummary(draft);
  const summaryPath = input.summaryPath === false
    ? null
    : input.summaryPath ?? join(dirname(input.outPath), "Wc01V2LimitedAdminPreviewImplementationProposal.summary.md");

  await mkdir(dirname(input.outPath), { recursive: true });
  await writeFile(input.outPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");

  if (summaryPath) {
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, renderWc01V2LimitedAdminPreviewImplementationProposalMarkdown(summary), "utf8");
  }

  return { draft, summary, summaryPath };
}

export function buildWc01V2LimitedAdminPreviewImplementationProposalSummary(
  draft: Wc01V2LimitedAdminPreviewImplementationProposalDraft,
): Wc01V2LimitedAdminPreviewImplementationProposalSummary {
  return {
    proposalVersion: draft.proposalVersion,
    targetSurfaceClass: draft.targetSurfaceClass,
    implementationStatus: draft.implementationStatus,
    approvalStatus: draft.approvalStatus,
    surfaceStatus: draft.surfaceStatus,
    targetRoute: draft.targetRoute,
    proposalOwner: draft.proposalOwner,
    sourceApprovalMetadataPath: draft.sourceApprovalMetadataPath,
    sourceProductSurfaceProposalCount: draft.sourceProductSurfaceProposalPaths.length,
    allowedFamilies: draft.allowedFamilies,
    blockedFamilyContextCount: draft.blockedFamiliesAndContexts.length,
    ownerApprovalCounts: countBy(draft.ownerApprovals.map((approval) => approval.approvalDecision)),
    guardrailRequirementCount: draft.guardrailRequirements.length,
    testPlanCount: draft.testPlan.length,
    failClosedReasons: draft.failClosedReasons,
    productionEligible: draft.productionEligible,
    persistEligible: draft.persistEligible,
    concernPolicyCallEligible: draft.concernPolicyCallEligible,
    unifiedFindingEligible: draft.unifiedFindingEligible,
    checklistProjectionEligible: draft.checklistProjectionEligible,
    customerFacingEligible: draft.customerFacingEligible,
    explicitApprovalRequired: draft.explicitApprovalRequired,
    guardrails: draft.guardrails,
  };
}

export function renderWc01V2LimitedAdminPreviewImplementationProposalMarkdown(
  summary: Wc01V2LimitedAdminPreviewImplementationProposalSummary,
) {
  return [
    "# WC01 v2 Limited Admin Preview Implementation Proposal Draft",
    "",
    "Internal diagnostic only. Not implementation approval. Not customer-facing report output.",
    "",
    `- Proposal version: ${summary.proposalVersion}`,
    `- Target surface class: ${summary.targetSurfaceClass}`,
    `- Surface status: ${summary.surfaceStatus}`,
    `- Approval status: ${summary.approvalStatus}`,
    `- Implementation status: ${summary.implementationStatus}`,
    `- Target route: ${summary.targetRoute}`,
    `- Proposal owner: ${summary.proposalOwner}`,
    `- Source approval metadata path: ${summary.sourceApprovalMetadataPath}`,
    `- Source product surface proposals: ${summary.sourceProductSurfaceProposalCount}`,
    `- Allowed families: ${summary.allowedFamilies.join(", ")}`,
    `- Blocked families/contexts: ${summary.blockedFamilyContextCount}`,
    `- Guardrail requirements: ${summary.guardrailRequirementCount}`,
    `- Test plan entries: ${summary.testPlanCount}`,
    `- Production eligible: ${String(summary.productionEligible)}`,
    `- Persist eligible: ${String(summary.persistEligible)}`,
    `- Concern policy call eligible: ${String(summary.concernPolicyCallEligible)}`,
    `- Unified finding eligible: ${String(summary.unifiedFindingEligible)}`,
    `- Checklist projection eligible: ${String(summary.checklistProjectionEligible)}`,
    `- Customer-facing eligible: ${String(summary.customerFacingEligible)}`,
    `- Explicit approval required: ${String(summary.explicitApprovalRequired)}`,
    "",
    "## Owner Approval Status",
    "",
    renderCountTable(summary.ownerApprovalCounts, "Status"),
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
    `- No checklist rows: ${String(summary.guardrails.noChecklistRows)}`,
    `- No report rows: ${String(summary.guardrails.noReportRows)}`,
    `- No executive summaries: ${String(summary.guardrails.noExecutiveSummaries)}`,
    `- No top findings: ${String(summary.guardrails.noTopFindings)}`,
    `- No scoring output: ${String(summary.guardrails.noScoringOutput)}`,
    `- No regulatory-lens output: ${String(summary.guardrails.noRegulatoryLensOutput)}`,
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
    return `| ${label} | Count |\n|---|---:|\n| none | 0 |`;
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
