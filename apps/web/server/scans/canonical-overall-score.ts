import { siteIntegrityDeduction } from "../../lib/scans/site-integrity-score-policy";
import { SITE_INTEGRITY_FINDING_ID } from "@certscore/contracts";
import { SCORE_FLOOR, SCORE_BASE, SCORING_POLICY_VERSION, SCORING_RULE_BY_ID, SCORING_FAMILIES } from "../../lib/scans/scoring-policy";
import { projectScanReportNoGo, type ScanReportAccessContext } from "../../lib/scans/scan-report-disposition";
import { resolveScanReportScore } from "../../lib/scans/scan-report-disposition";
import type { GdprEprivacyCoverageChecklistItem } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import type { UnifiedFindingDisplayPacket } from "../../lib/scans/unified-findings";
import {
  CALIFORNIA_GPC_NO_SUPPRESSION_DEDUCTION_POINTS,
  CALIFORNIA_GPC_NO_SUPPRESSION_POLICY_KEY,
  CALIFORNIA_GPC_RESPONSE_POLICY_VERSION,
  CANONICAL_OVERALL_SCORE_SOURCE,
  CANONICAL_OVERALL_SCORE_VERSION,
} from "../../lib/scans/california-gpc-response-policy";
import { deriveRegulatoryCoverageScore, deriveGdprEprivacyDeductionBreakdown } from "../../lib/scans/regulatory-coverage-score";

export { CANONICAL_OVERALL_SCORE_SOURCE, CANONICAL_OVERALL_SCORE_VERSION };

function californiaGpcDeduction(unifiedFindings: UnifiedFindingDisplayPacket[]) {
  const effect = unifiedFindings
    .filter((finding) => finding.unifiedFindingId === "gpc_response")
    .flatMap((finding) => finding.scoreEffects ?? [])
    .find((candidate) =>
      candidate.appliesTo === "certscore_overall" &&
      candidate.framework === "california" &&
      candidate.policyKey === CALIFORNIA_GPC_NO_SUPPRESSION_POLICY_KEY &&
      candidate.policyVersion === CALIFORNIA_GPC_RESPONSE_POLICY_VERSION &&
      candidate.deductionPoints === CALIFORNIA_GPC_NO_SUPPRESSION_DEDUCTION_POINTS
    );
  return effect ? CALIFORNIA_GPC_NO_SUPPRESSION_DEDUCTION_POINTS : 0;
}

export function deriveCanonicalOverallScoreExplanationForReport(input: {
  scanRecord: ScanReportAccessContext;
  checklistRows: GdprEprivacyCoverageChecklistItem[];
  unifiedFindings: UnifiedFindingDisplayPacket[];
}) {
  if (projectScanReportNoGo(input.scanRecord)) return null;
  const postureScore = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: input.checklistRows
  }).score;
  if (postureScore === null) return null;
  const integrityEffects = input.unifiedFindings
    .filter(finding => finding.unifiedFindingId === SITE_INTEGRITY_FINDING_ID)
    .flatMap(finding => finding.scoreEffects ?? []);
  const deductions = deriveGdprEprivacyDeductionBreakdown(input.checklistRows);
  for (const [ruleId, points] of [["gpc_response", californiaGpcDeduction(input.unifiedFindings)],
    ["site_integrity_hidden_outbound_links", siteIntegrityDeduction(integrityEffects)]] as const) {
    if (!points) continue;
    const rule = SCORING_RULE_BY_ID.get(ruleId)!;
    deductions.push({ family: rule.family, label: SCORING_FAMILIES[rule.family].label, deductionPoints: points,
      rules: [{ ruleId, label: rule.label, policyDeductionPoints: points, decisionVerification: "not_applicable" }] });
  }
  const totalPolicyDeductionPoints = deductions.reduce((sum, row) => sum + row.deductionPoints, 0);
  const score = resolveScanReportScore(input.scanRecord, Math.max(SCORE_FLOOR, SCORE_BASE - totalPolicyDeductionPoints));
  if (score === null) return null;
  return { score, baseScore: SCORE_BASE, scoreFloor: SCORE_FLOOR, totalPolicyDeductionPoints,
    scoreVersion: CANONICAL_OVERALL_SCORE_VERSION, policyVersion: SCORING_POLICY_VERSION, deductions };
}

export function deriveCanonicalOverallScoreForReport(input: Parameters<typeof deriveCanonicalOverallScoreExplanationForReport>[0]) {
  return deriveCanonicalOverallScoreExplanationForReport(input)?.score ?? null;
}
