import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildWc01V2ProjectionShapeComparisonJson,
  type Wc01V2ProjectionShapeComparison,
} from "./wc01-v2-projection-shape-comparison";

export type Wc01V2ProjectionShapeComparisonSummary = {
  packetVersion: string;
  sourceConcernPolicyShapePath: string;
  comparedFamilies: string[];
  proposedUnifiedFindingKeys: string[];
  proposedChecklistRowKeys: string[];
  missingProjectionInputCountsByFamily: Record<string, number>;
  blockedReasonCounts: Record<string, number>;
  warningCount: number;
  recommendation: Wc01V2ProjectionShapeComparison["recommendation"];
  productionEligible: false;
  persistEligible: false;
  concernPolicyCallEligible: false;
  unifiedFindingEligible: false;
  checklistProjectionEligible: false;
  customerFacingEligible: false;
  explicitApprovalRequired: true;
  unifiedFindingShapeReadiness: Wc01V2ProjectionShapeComparison["unifiedFindingShapeReadiness"];
  checklistProjectionShapeReadiness: Wc01V2ProjectionShapeComparison["checklistProjectionShapeReadiness"];
  evidencePacketReadiness: Wc01V2ProjectionShapeComparison["evidencePacketReadiness"];
  guardrails: Wc01V2ProjectionShapeComparison["guardrails"];
};

type GenerateSingleInput = {
  concernPolicyShapePath: string;
  outPath: string;
  summaryPath?: string | false;
};

export async function generateWc01V2ProjectionShapeComparisonSingleFromFile(
  input: GenerateSingleInput,
) {
  const comparison = buildWc01V2ProjectionShapeComparisonJson(
    await readFile(input.concernPolicyShapePath, "utf8"),
    input.concernPolicyShapePath,
  );
  const summary = buildWc01V2ProjectionShapeComparisonSummary(comparison);
  const summaryPath = input.summaryPath === false
    ? null
    : input.summaryPath ?? join(dirname(input.outPath), "Wc01V2ProjectionShapeComparison.summary.md");

  await mkdir(dirname(input.outPath), { recursive: true });
  await writeFile(input.outPath, `${JSON.stringify(comparison, null, 2)}\n`, "utf8");

  if (summaryPath) {
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, renderWc01V2ProjectionShapeComparisonMarkdown(summary), "utf8");
  }

  return { comparison, summary, summaryPath };
}

export function buildWc01V2ProjectionShapeComparisonSummary(
  comparison: Wc01V2ProjectionShapeComparison,
): Wc01V2ProjectionShapeComparisonSummary {
  return {
    packetVersion: comparison.packetVersion,
    sourceConcernPolicyShapePath: comparison.sourceConcernPolicyShapePath,
    comparedFamilies: comparison.comparedFamilies,
    proposedUnifiedFindingKeys: comparison.proposedUnifiedFindingKeys,
    proposedChecklistRowKeys: comparison.proposedChecklistRowKeys,
    missingProjectionInputCountsByFamily: countRecordValues(comparison.missingProjectionInputs),
    blockedReasonCounts: countBy(comparison.blockedReasons),
    warningCount: comparison.warnings.length,
    recommendation: comparison.recommendation,
    productionEligible: comparison.productionEligible,
    persistEligible: comparison.persistEligible,
    concernPolicyCallEligible: comparison.concernPolicyCallEligible,
    unifiedFindingEligible: comparison.unifiedFindingEligible,
    checklistProjectionEligible: comparison.checklistProjectionEligible,
    customerFacingEligible: comparison.customerFacingEligible,
    explicitApprovalRequired: comparison.explicitApprovalRequired,
    unifiedFindingShapeReadiness: comparison.unifiedFindingShapeReadiness,
    checklistProjectionShapeReadiness: comparison.checklistProjectionShapeReadiness,
    evidencePacketReadiness: comparison.evidencePacketReadiness,
    guardrails: comparison.guardrails,
  };
}

export function renderWc01V2ProjectionShapeComparisonMarkdown(
  summary: Wc01V2ProjectionShapeComparisonSummary,
) {
  return [
    "# WC01 v2 Unified-Finding/Checklist Projection Shape Comparison",
    "",
    "Fixture-only internal diagnostic. Not implementation approval. Not customer-facing report output.",
    "",
    `- Packet version: ${summary.packetVersion}`,
    `- Source concern-policy shape path: ${summary.sourceConcernPolicyShapePath}`,
    `- Compared families: ${summary.comparedFamilies.join(", ") || "none"}`,
    `- Recommendation: ${summary.recommendation}`,
    `- Production eligible: ${String(summary.productionEligible)}`,
    `- Persist eligible: ${String(summary.persistEligible)}`,
    `- Concern policy call eligible: ${String(summary.concernPolicyCallEligible)}`,
    `- Unified finding eligible: ${String(summary.unifiedFindingEligible)}`,
    `- Checklist projection eligible: ${String(summary.checklistProjectionEligible)}`,
    `- Customer-facing eligible: ${String(summary.customerFacingEligible)}`,
    `- Explicit approval required: ${String(summary.explicitApprovalRequired)}`,
    "",
    "## Proposed Unified Finding Keys",
    "",
    renderList(summary.proposedUnifiedFindingKeys),
    "",
    "## Proposed Checklist Row Keys",
    "",
    renderList(summary.proposedChecklistRowKeys),
    "",
    "## Missing Projection Input Counts",
    "",
    renderCountTable(summary.missingProjectionInputCountsByFamily, "Family"),
    "",
    "## Blocked Reasons",
    "",
    renderCountTable(summary.blockedReasonCounts, "Reason"),
    "",
    "## Readiness",
    "",
    `- Unified finding shape readiness: ${summary.unifiedFindingShapeReadiness.status}`,
    `- Checklist projection shape readiness: ${summary.checklistProjectionShapeReadiness.status}`,
    `- Evidence packet readiness: ${summary.evidencePacketReadiness.status}`,
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

function renderList(values: string[]) {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- none";
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

function countRecordValues(record: Record<string, string[]>) {
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(record)) {
    counts[key] = value.length;
  }
  return counts;
}

function countBy(values: string[]) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}
