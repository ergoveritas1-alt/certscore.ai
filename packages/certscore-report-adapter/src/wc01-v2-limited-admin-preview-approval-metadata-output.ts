import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildWc01V2LimitedAdminPreviewApprovalMetadataJson,
  type Wc01V2LimitedAdminPreviewApprovalMetadata,
} from "./wc01-v2-limited-admin-preview-approval-metadata";

export type Wc01V2LimitedAdminPreviewApprovalMetadataSummary = {
  metadataVersion: string;
  sourceProjectionShapePath: string;
  targetSurfaceClass: "limited_admin_internal_preview";
  approvalStatus: Wc01V2LimitedAdminPreviewApprovalMetadata["approvalStatus"];
  implementationStatus: "not_approved";
  allowedFamilies: string[];
  blockedFamilyCount: number;
  ownerApprovalCounts: Record<string, number>;
  failClosedReasons: string[];
  evidenceRequirementCount: number;
  guardrailRequirementCount: number;
  blockedSurfaceAssertionCount: number;
  productionEligible: false;
  persistEligible: false;
  concernPolicyCallEligible: false;
  unifiedFindingEligible: false;
  checklistProjectionEligible: false;
  customerFacingEligible: false;
  explicitApprovalRequired: true;
  guardrails: Wc01V2LimitedAdminPreviewApprovalMetadata["guardrails"];
};

type GenerateSingleInput = {
  projectionShapePath: string;
  outPath: string;
  summaryPath?: string | false;
};

export async function generateWc01V2LimitedAdminPreviewApprovalMetadataSingleFromFile(
  input: GenerateSingleInput,
) {
  const metadata = buildWc01V2LimitedAdminPreviewApprovalMetadataJson(
    await readFile(input.projectionShapePath, "utf8"),
    input.projectionShapePath,
  );
  const summary = buildWc01V2LimitedAdminPreviewApprovalMetadataSummary(metadata);
  const summaryPath = input.summaryPath === false
    ? null
    : input.summaryPath ?? join(dirname(input.outPath), "Wc01V2LimitedAdminPreviewApprovalMetadata.summary.md");

  await mkdir(dirname(input.outPath), { recursive: true });
  await writeFile(input.outPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  if (summaryPath) {
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, renderWc01V2LimitedAdminPreviewApprovalMetadataMarkdown(summary), "utf8");
  }

  return { metadata, summary, summaryPath };
}

export function buildWc01V2LimitedAdminPreviewApprovalMetadataSummary(
  metadata: Wc01V2LimitedAdminPreviewApprovalMetadata,
): Wc01V2LimitedAdminPreviewApprovalMetadataSummary {
  return {
    metadataVersion: metadata.metadataVersion,
    sourceProjectionShapePath: metadata.sourceProjectionShapePath,
    targetSurfaceClass: metadata.targetSurfaceClass,
    approvalStatus: metadata.approvalStatus,
    implementationStatus: metadata.implementationStatus,
    allowedFamilies: metadata.allowedFamilies,
    blockedFamilyCount: metadata.blockedFamilies.length,
    ownerApprovalCounts: countBy(metadata.ownerApprovals.map((approval) => approval.approvalDecision)),
    failClosedReasons: metadata.failClosedReasons,
    evidenceRequirementCount: metadata.evidenceRequirements.length,
    guardrailRequirementCount: metadata.guardrailRequirements.length,
    blockedSurfaceAssertionCount: metadata.blockedSurfaceAssertions.length,
    productionEligible: metadata.productionEligible,
    persistEligible: metadata.persistEligible,
    concernPolicyCallEligible: metadata.concernPolicyCallEligible,
    unifiedFindingEligible: metadata.unifiedFindingEligible,
    checklistProjectionEligible: metadata.checklistProjectionEligible,
    customerFacingEligible: metadata.customerFacingEligible,
    explicitApprovalRequired: metadata.explicitApprovalRequired,
    guardrails: metadata.guardrails,
  };
}

export function renderWc01V2LimitedAdminPreviewApprovalMetadataMarkdown(
  summary: Wc01V2LimitedAdminPreviewApprovalMetadataSummary,
) {
  return [
    "# WC01 v2 Limited Internal Admin Preview Approval Metadata",
    "",
    "Internal diagnostic only. Not implementation approval. Not customer-facing report output.",
    "",
    `- Metadata version: ${summary.metadataVersion}`,
    `- Source projection shape path: ${summary.sourceProjectionShapePath}`,
    `- Target surface class: ${summary.targetSurfaceClass}`,
    `- Approval status: ${summary.approvalStatus}`,
    `- Implementation status: ${summary.implementationStatus}`,
    `- Allowed families: ${summary.allowedFamilies.join(", ")}`,
    `- Blocked families/contexts: ${summary.blockedFamilyCount}`,
    `- Evidence requirements: ${summary.evidenceRequirementCount}`,
    `- Guardrail requirements: ${summary.guardrailRequirementCount}`,
    `- Blocked surface assertions: ${summary.blockedSurfaceAssertionCount}`,
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
