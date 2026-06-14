import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildWc01V2ProductionIntegrationCandidateArtifactJson,
  type Wc01V2ProductionIntegrationCandidateArtifact,
} from "./wc01-v2-production-integration-candidate";

export type Wc01V2ProductionIntegrationCandidateSummary = {
  packetVersion: string;
  sourceMappingArtifactPath: string;
  sourceMappingVersion: string;
  implementationStatus: "not_approved";
  productionEligible: false;
  persistEligible: false;
  concernPolicyCallEligible: false;
  unifiedFindingEligible: false;
  checklistProjectionEligible: false;
  customerFacingEligible: false;
  explicitApprovalRequired: true;
  candidateCount: number;
  blockedCandidateCount: number;
  candidateCountsByFamily: Record<string, number>;
  blockedReasons: Record<string, number>;
  proposedConcernPolicyKeys: string[];
  guardrails: Wc01V2ProductionIntegrationCandidateArtifact["guardrails"];
};

type GenerateSingleInput = {
  inputPath: string;
  outPath: string;
  summaryPath?: string | false;
};

export async function generateWc01V2ProductionIntegrationCandidateSingleFromFile(
  input: GenerateSingleInput,
) {
  const artifact = buildWc01V2ProductionIntegrationCandidateArtifactJson(
    await readFile(input.inputPath, "utf8"),
    input.inputPath,
  );
  const summary = buildWc01V2ProductionIntegrationCandidateSummary(artifact);
  const summaryPath = input.summaryPath === false
    ? null
    : input.summaryPath ?? join(dirname(input.outPath), "Wc01V2ProductionIntegrationCandidate.summary.md");

  await mkdir(dirname(input.outPath), { recursive: true });
  await writeFile(input.outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  if (summaryPath) {
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, renderWc01V2ProductionIntegrationCandidateMarkdown(summary), "utf8");
  }

  return { artifact, summary, summaryPath };
}

export function buildWc01V2ProductionIntegrationCandidateSummary(
  artifact: Wc01V2ProductionIntegrationCandidateArtifact,
): Wc01V2ProductionIntegrationCandidateSummary {
  return {
    packetVersion: artifact.packetVersion,
    sourceMappingArtifactPath: artifact.sourceMappingArtifactPath,
    sourceMappingVersion: artifact.sourceMappingVersion,
    implementationStatus: artifact.implementationStatus,
    productionEligible: artifact.productionEligible,
    persistEligible: artifact.persistEligible,
    concernPolicyCallEligible: artifact.concernPolicyCallEligible,
    unifiedFindingEligible: artifact.unifiedFindingEligible,
    checklistProjectionEligible: artifact.checklistProjectionEligible,
    customerFacingEligible: artifact.customerFacingEligible,
    explicitApprovalRequired: artifact.explicitApprovalRequired,
    candidateCount: artifact.candidates.length,
    blockedCandidateCount: artifact.blockedCandidates.length,
    candidateCountsByFamily: countBy(artifact.candidates.map((candidate) => candidate.family)),
    blockedReasons: countBy(artifact.blockedCandidates.flatMap((blocked) => blocked.failClosedReasons)),
    proposedConcernPolicyKeys: uniqueStrings(
      artifact.candidates.map((candidate) => candidate.proposedConcernPolicyKey),
    ),
    guardrails: artifact.guardrails,
  };
}

export function renderWc01V2ProductionIntegrationCandidateMarkdown(
  summary: Wc01V2ProductionIntegrationCandidateSummary,
) {
  return [
    "# WC01 v2 Production Integration Candidate",
    "",
    "Internal artifact only. Not implementation approval. Not customer-facing report output.",
    "",
    `- Packet version: ${summary.packetVersion}`,
    `- Source mapping artifact: ${summary.sourceMappingArtifactPath}`,
    `- Source mapping version: ${summary.sourceMappingVersion}`,
    `- Implementation status: ${summary.implementationStatus}`,
    `- Production eligible: ${String(summary.productionEligible)}`,
    `- Persist eligible: ${String(summary.persistEligible)}`,
    `- Concern policy call eligible: ${String(summary.concernPolicyCallEligible)}`,
    `- Unified finding eligible: ${String(summary.unifiedFindingEligible)}`,
    `- Checklist projection eligible: ${String(summary.checklistProjectionEligible)}`,
    `- Customer-facing eligible: ${String(summary.customerFacingEligible)}`,
    `- Explicit approval required: ${String(summary.explicitApprovalRequired)}`,
    `- Candidates: ${summary.candidateCount}`,
    `- Blocked candidates: ${summary.blockedCandidateCount}`,
    "",
    "## Candidate Counts By Family",
    "",
    renderCountTable(summary.candidateCountsByFamily, "Family"),
    "",
    "## Proposed Concern Policy Keys",
    "",
    summary.proposedConcernPolicyKeys.length > 0
      ? summary.proposedConcernPolicyKeys.map((key) => `- ${key}`).join("\n")
      : "- none",
    "",
    "## Blocked Reasons",
    "",
    renderCountTable(summary.blockedReasons, "Reason"),
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

function uniqueStrings(values: string[]) {
  return [...new Set(values)].sort();
}
