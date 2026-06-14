import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildWc01V2NormalizedConcernSchemaComparisonJson,
  type Wc01V2NormalizedConcernSchemaComparison,
} from "./wc01-v2-normalized-concern-schema-comparison";

export type Wc01V2NormalizedConcernSchemaComparisonSummary = {
  packetVersion: string;
  sourceCandidatePath: string;
  comparedFamilies: string[];
  proposedNormalizedConcernTypes: string[];
  proposedConcernPolicyKeys: string[];
  missingFieldCountsByFamily: Record<string, number>;
  extraFieldCountsByFamily: Record<string, number>;
  blockedReasonCounts: Record<string, number>;
  warningCount: number;
  recommendation: Wc01V2NormalizedConcernSchemaComparison["recommendation"];
  productionEligible: false;
  persistEligible: false;
  concernPolicyCallEligible: false;
  unifiedFindingEligible: false;
  checklistProjectionEligible: false;
  customerFacingEligible: false;
  explicitApprovalRequired: true;
  concernPolicyReadiness: Wc01V2NormalizedConcernSchemaComparison["concernPolicyReadiness"];
  unifiedFindingReadiness: Wc01V2NormalizedConcernSchemaComparison["unifiedFindingReadiness"];
  checklistProjectionReadiness: Wc01V2NormalizedConcernSchemaComparison["checklistProjectionReadiness"];
  guardrails: Wc01V2NormalizedConcernSchemaComparison["guardrails"];
};

type GenerateSingleInput = {
  candidatePath: string;
  outPath: string;
  summaryPath?: string | false;
};

export async function generateWc01V2NormalizedConcernSchemaComparisonSingleFromFile(
  input: GenerateSingleInput,
) {
  const comparison = buildWc01V2NormalizedConcernSchemaComparisonJson(
    await readFile(input.candidatePath, "utf8"),
    input.candidatePath,
  );
  const summary = buildWc01V2NormalizedConcernSchemaComparisonSummary(comparison);
  const summaryPath = input.summaryPath === false
    ? null
    : input.summaryPath ?? join(dirname(input.outPath), "Wc01V2NormalizedConcernSchemaComparison.summary.md");

  await mkdir(dirname(input.outPath), { recursive: true });
  await writeFile(input.outPath, `${JSON.stringify(comparison, null, 2)}\n`, "utf8");

  if (summaryPath) {
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, renderWc01V2NormalizedConcernSchemaComparisonMarkdown(summary), "utf8");
  }

  return { comparison, summary, summaryPath };
}

export function buildWc01V2NormalizedConcernSchemaComparisonSummary(
  comparison: Wc01V2NormalizedConcernSchemaComparison,
): Wc01V2NormalizedConcernSchemaComparisonSummary {
  return {
    packetVersion: comparison.packetVersion,
    sourceCandidatePath: comparison.sourceCandidatePath,
    comparedFamilies: comparison.comparedFamilies,
    proposedNormalizedConcernTypes: comparison.proposedNormalizedConcernTypes,
    proposedConcernPolicyKeys: comparison.proposedConcernPolicyKeys,
    missingFieldCountsByFamily: countRecordValues(comparison.missingFields),
    extraFieldCountsByFamily: countRecordValues(comparison.extraFields),
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
    concernPolicyReadiness: comparison.concernPolicyReadiness,
    unifiedFindingReadiness: comparison.unifiedFindingReadiness,
    checklistProjectionReadiness: comparison.checklistProjectionReadiness,
    guardrails: comparison.guardrails,
  };
}

export function renderWc01V2NormalizedConcernSchemaComparisonMarkdown(
  summary: Wc01V2NormalizedConcernSchemaComparisonSummary,
) {
  return [
    "# WC01 v2 Normalized Concern Schema Comparison",
    "",
    "Fixture-only internal diagnostic. Not implementation approval. Not customer-facing report output.",
    "",
    `- Packet version: ${summary.packetVersion}`,
    `- Source candidate path: ${summary.sourceCandidatePath}`,
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
    "## Proposed Normalized Concern Types",
    "",
    renderList(summary.proposedNormalizedConcernTypes),
    "",
    "## Proposed Concern Policy Keys",
    "",
    renderList(summary.proposedConcernPolicyKeys),
    "",
    "## Missing Field Counts",
    "",
    renderCountTable(summary.missingFieldCountsByFamily, "Family"),
    "",
    "## Extra Field Counts",
    "",
    renderCountTable(summary.extraFieldCountsByFamily, "Family"),
    "",
    "## Blocked Reasons",
    "",
    renderCountTable(summary.blockedReasonCounts, "Reason"),
    "",
    "## Readiness",
    "",
    `- Concern policy readiness: ${summary.concernPolicyReadiness.status}`,
    `- Unified finding readiness: ${summary.unifiedFindingReadiness.status}`,
    `- Checklist projection readiness: ${summary.checklistProjectionReadiness.status}`,
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
