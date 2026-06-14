import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildWc01V2ProductionReadinessGateDraftJson,
  type Wc01V2ProductionReadinessGateDecision,
  type Wc01V2ProductionReadinessGateDraft,
  type Wc01V2ProductionReadinessGateOutcome,
} from "./wc01-v2-production-readiness-gate-draft";

export type Wc01V2ProductionReadinessGateDraftSummary = {
  packetVersion: string;
  siteDomain: string;
  queueItemId: string;
  candidateFamily: string;
  reviewerAction: string;
  overallGateOutcome: Wc01V2ProductionReadinessGateOutcome;
  allowedNextStep: string;
  productionEligible: false;
  customerFacingEligible: false;
  explicitApprovalRequired: true;
  sensitiveContextCategories: string[];
  evidenceRefCount: number;
  excerptRefCount: number;
  unresolvedRefCount: number;
  redactionWarningCount: number;
  gateDecisionCounts: Record<Wc01V2ProductionReadinessGateDecision, number>;
  blockedReason: string[];
  guardrailScanPassed: boolean;
  guardrailScanNotes: string[];
  approvalDecisionCounts: Record<string, number>;
  guardrails: Wc01V2ProductionReadinessGateDraft["guardrails"];
};

type GenerateSingleInput = {
  inputPath: string;
  outPath: string;
  summaryPath?: string | false;
};

export async function generateWc01V2ProductionReadinessGateDraftSingleFromFile(
  input: GenerateSingleInput,
) {
  const draft = buildWc01V2ProductionReadinessGateDraftJson(await readFile(input.inputPath, "utf8"));
  const summary = buildWc01V2ProductionReadinessGateDraftSummary(draft);
  const summaryPath = input.summaryPath === false
    ? null
    : input.summaryPath ?? join(dirname(input.outPath), "Wc01V2ProductionReadinessGateDraft.summary.md");

  await mkdir(dirname(input.outPath), { recursive: true });
  await writeFile(input.outPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");

  if (summaryPath) {
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, renderWc01V2ProductionReadinessGateDraftMarkdown(summary), "utf8");
  }

  return { draft, summary, summaryPath };
}

export function buildWc01V2ProductionReadinessGateDraftSummary(
  draft: Wc01V2ProductionReadinessGateDraft,
): Wc01V2ProductionReadinessGateDraftSummary {
  return {
    packetVersion: draft.packetVersion,
    siteDomain: draft.siteDomain,
    queueItemId: draft.queueItemId,
    candidateFamily: draft.candidateFamily,
    reviewerAction: draft.reviewerAction,
    overallGateOutcome: draft.overallGateOutcome,
    allowedNextStep: draft.allowedNextStep,
    productionEligible: draft.productionEligible,
    customerFacingEligible: draft.customerFacingEligible,
    explicitApprovalRequired: draft.explicitApprovalRequired,
    sensitiveContextCategories: draft.sensitiveContextCategories,
    evidenceRefCount: draft.evidenceRefs.length,
    excerptRefCount: draft.excerptRefs.length,
    unresolvedRefCount: draft.unresolvedRefCount,
    redactionWarningCount: draft.redactionWarningCount,
    gateDecisionCounts: countBy(draft.gateResults.map((result) => result.decision)) as Record<Wc01V2ProductionReadinessGateDecision, number>,
    blockedReason: draft.blockedReason,
    guardrailScanPassed: draft.auditTrail.guardrailScanPassed,
    guardrailScanNotes: draft.auditTrail.guardrailScanNotes,
    approvalDecisionCounts: countBy(draft.approvalRecord.map((approval) => approval.decision)),
    guardrails: draft.guardrails,
  };
}

export function renderWc01V2ProductionReadinessGateDraftMarkdown(
  summary: Wc01V2ProductionReadinessGateDraftSummary,
) {
  return [
    "# WC01 v2 Production Readiness Gate Draft",
    "",
    "Internal diagnostic only. Not implementation approval. Not customer-facing report output.",
    "",
    `- Packet version: ${summary.packetVersion}`,
    `- Site/domain: ${summary.siteDomain}`,
    `- Queue item ID: ${summary.queueItemId}`,
    `- Candidate family: ${summary.candidateFamily}`,
    `- Reviewer action: ${summary.reviewerAction}`,
    `- Overall gate outcome: ${summary.overallGateOutcome}`,
    `- Allowed next step: ${summary.allowedNextStep}`,
    `- Production eligible: ${String(summary.productionEligible)}`,
    `- Customer-facing eligible: ${String(summary.customerFacingEligible)}`,
    `- Explicit approval required: ${String(summary.explicitApprovalRequired)}`,
    `- Sensitive-context categories: ${summary.sensitiveContextCategories.join(", ") || "none"}`,
    `- Evidence refs: ${summary.evidenceRefCount}`,
    `- Excerpt refs: ${summary.excerptRefCount}`,
    `- Unresolved refs: ${summary.unresolvedRefCount}`,
    `- Redaction warnings: ${summary.redactionWarningCount}`,
    `- Guardrail scan passed: ${String(summary.guardrailScanPassed)}`,
    "",
    "## Gate Decisions",
    "",
    renderCountTable(summary.gateDecisionCounts, "Decision"),
    "",
    "## Approval Record",
    "",
    renderCountTable(summary.approvalDecisionCounts, "Decision"),
    "",
    "## Blocked Reasons",
    "",
    summary.blockedReason.length > 0
      ? summary.blockedReason.map((reason) => `- ${reason}`).join("\n")
      : "- none",
    "",
    "## Guardrail Scan Notes",
    "",
    summary.guardrailScanNotes.length > 0
      ? summary.guardrailScanNotes.map((note) => `- ${note}`).join("\n")
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
