import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildWc01V2ConcernPolicyShapeComparisonJson,
  type Wc01V2ConcernPolicyShapeComparison,
} from "./wc01-v2-concern-policy-shape-comparison";

export type Wc01V2ConcernPolicyShapeComparisonSummary = {
  packetVersion: string;
  sourceSchemaComparisonPath: string;
  comparedFamilies: string[];
  proposedConcernPolicyKeys: string[];
  missingPolicyInputCountsByFamily: Record<string, number>;
  blockedReasonCounts: Record<string, number>;
  warningCount: number;
  recommendation: Wc01V2ConcernPolicyShapeComparison["recommendation"];
  productionEligible: false;
  persistEligible: false;
  concernPolicyCallEligible: false;
  unifiedFindingEligible: false;
  checklistProjectionEligible: false;
  customerFacingEligible: false;
  explicitApprovalRequired: true;
  decisionReadiness: Wc01V2ConcernPolicyShapeComparison["decisionReadiness"];
  suppressionReadiness: Wc01V2ConcernPolicyShapeComparison["suppressionReadiness"];
  copyReviewReadiness: Wc01V2ConcernPolicyShapeComparison["copyReviewReadiness"];
  guardrails: Wc01V2ConcernPolicyShapeComparison["guardrails"];
};

type GenerateSingleInput = {
  schemaComparisonPath: string;
  outPath: string;
  summaryPath?: string | false;
};

export async function generateWc01V2ConcernPolicyShapeComparisonSingleFromFile(
  input: GenerateSingleInput,
) {
  const comparison = buildWc01V2ConcernPolicyShapeComparisonJson(
    await readFile(input.schemaComparisonPath, "utf8"),
    input.schemaComparisonPath,
  );
  const summary = buildWc01V2ConcernPolicyShapeComparisonSummary(comparison);
  const summaryPath = input.summaryPath === false
    ? null
    : input.summaryPath ?? join(dirname(input.outPath), "Wc01V2ConcernPolicyShapeComparison.summary.md");

  await mkdir(dirname(input.outPath), { recursive: true });
  await writeFile(input.outPath, `${JSON.stringify(comparison, null, 2)}\n`, "utf8");

  if (summaryPath) {
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, renderWc01V2ConcernPolicyShapeComparisonMarkdown(summary), "utf8");
  }

  return { comparison, summary, summaryPath };
}

export function buildWc01V2ConcernPolicyShapeComparisonSummary(
  comparison: Wc01V2ConcernPolicyShapeComparison,
): Wc01V2ConcernPolicyShapeComparisonSummary {
  return {
    packetVersion: comparison.packetVersion,
    sourceSchemaComparisonPath: comparison.sourceSchemaComparisonPath,
    comparedFamilies: comparison.comparedFamilies,
    proposedConcernPolicyKeys: comparison.proposedConcernPolicyKeys,
    missingPolicyInputCountsByFamily: countRecordValues(comparison.missingPolicyInputs),
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
    decisionReadiness: comparison.decisionReadiness,
    suppressionReadiness: comparison.suppressionReadiness,
    copyReviewReadiness: comparison.copyReviewReadiness,
    guardrails: comparison.guardrails,
  };
}

export function renderWc01V2ConcernPolicyShapeComparisonMarkdown(
  summary: Wc01V2ConcernPolicyShapeComparisonSummary,
) {
  return [
    "# WC01 v2 Concern-Policy Shape Comparison",
    "",
    "Fixture-only internal diagnostic. Not implementation approval. Not customer-facing report output.",
    "",
    `- Packet version: ${summary.packetVersion}`,
    `- Source schema comparison path: ${summary.sourceSchemaComparisonPath}`,
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
    "## Proposed Concern Policy Keys",
    "",
    renderList(summary.proposedConcernPolicyKeys),
    "",
    "## Missing Policy Input Counts",
    "",
    renderCountTable(summary.missingPolicyInputCountsByFamily, "Family"),
    "",
    "## Blocked Reasons",
    "",
    renderCountTable(summary.blockedReasonCounts, "Reason"),
    "",
    "## Readiness",
    "",
    `- Decision readiness: ${summary.decisionReadiness.status}`,
    `- Suppression readiness: ${summary.suppressionReadiness.status}`,
    `- Copy review readiness: ${summary.copyReviewReadiness.status}`,
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
