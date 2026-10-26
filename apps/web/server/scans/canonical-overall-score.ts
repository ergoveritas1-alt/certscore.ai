import { siteIntegrityDeduction, siteIntegrityFindingEffects, siteIntegrityPolicyForScoreVersion } from "../../lib/scans/site-integrity-score-policy";
import { accessibilityFindingDeductionBreakdown } from "../../lib/scans/accessibility-score-policy";
import { SCORE_FLOOR, SCORE_BASE, SCORING_POLICY_VERSION, type GdprEprivacyScoringPolicyVersion, SCORING_RULE_BY_ID, SCORING_FAMILIES } from "../../lib/scans/scoring-policy";
import { projectScanReportNoGo, type ScanReportAccessContext } from "../../lib/scans/scan-report-disposition";
import { resolveScanReportScore } from "../../lib/scans/scan-report-disposition";
import type { GdprEprivacyCoverageChecklistItem } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import type { UnifiedFindingDisplayPacket } from "../../lib/scans/unified-findings";
import {
  CANONICAL_OVERALL_SCORE_SOURCE,
  CANONICAL_OVERALL_SCORE_VERSION,
} from "../../lib/scans/california-gpc-response-policy";
import { deriveRegulatoryCoverageScore, deriveGdprEprivacyDeductionBreakdown } from "../../lib/scans/regulatory-coverage-score";

export { CANONICAL_OVERALL_SCORE_SOURCE, CANONICAL_OVERALL_SCORE_VERSION };

// GPC deductions are suspended, including effects retained in historical packets.

export function deriveCanonicalOverallScoreExplanationForReport(input: {
  scanRecord: ScanReportAccessContext;
  checklistRows: GdprEprivacyCoverageChecklistItem[];
  unifiedFindings: UnifiedFindingDisplayPacket[];
  scorePolicyVersion?: GdprEprivacyScoringPolicyVersion;
}) {
  if (projectScanReportNoGo(input.scanRecord)) return null;
  const postureScore = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: input.checklistRows
  }).score;
  if (postureScore === null) return null;
  const integrityEffects = siteIntegrityFindingEffects(input.unifiedFindings);
  const deductions = deriveGdprEprivacyDeductionBreakdown(input.checklistRows, input.scorePolicyVersion);
  const accessibility = accessibilityFindingDeductionBreakdown(input.unifiedFindings);
  if (accessibility.deductionPoints) {
    deductions.push({ family: accessibility.family, label: accessibility.label, deductionPoints: accessibility.deductionPoints, rules: accessibility.rules });
  }
  for (const [ruleId, points] of [["site_integrity_hidden_outbound_links", siteIntegrityDeduction(integrityEffects, { policyVersion: siteIntegrityPolicyForScoreVersion(input.scanRecord.snapshot?.score_version) })]] as const) {
    if (!points) continue;
    const rule = SCORING_RULE_BY_ID.get(ruleId)!;
    deductions.push({ family: rule.family, label: SCORING_FAMILIES[rule.family].label, deductionPoints: points,
      rules: [{ ruleId, label: rule.label, policyDeductionPoints: points, decisionVerification: "not_applicable" }] });
  }
  const totalPolicyDeductionPoints = deductions.reduce((sum, row) => sum + row.deductionPoints, 0);
  const score = resolveScanReportScore(input.scanRecord, Math.max(SCORE_FLOOR, SCORE_BASE - totalPolicyDeductionPoints));
  if (score === null) return null;
  return { score, baseScore: SCORE_BASE, scoreFloor: SCORE_FLOOR, totalPolicyDeductionPoints,
    scoreVersion: input.scorePolicyVersion === "gdpr-eprivacy-posture.v18" ? "overall-posture.v8"
      : input.scorePolicyVersion === "gdpr-eprivacy-posture.v19" ? "overall-posture.v9"
      : input.scorePolicyVersion === "gdpr-eprivacy-posture.v20" ? "overall-posture.v11"
      : input.scorePolicyVersion === "gdpr-eprivacy-posture.v21" ? "overall-posture.v12"
      : input.scanRecord.snapshot?.score_version === "overall-posture.v13" ? "overall-posture.v13" : CANONICAL_OVERALL_SCORE_VERSION,
    policyVersion: input.scorePolicyVersion ?? SCORING_POLICY_VERSION, deductions };
}

export function deriveCanonicalOverallScoreForReport(input: Parameters<typeof deriveCanonicalOverallScoreExplanationForReport>[0]) {
  return deriveCanonicalOverallScoreExplanationForReport(input)?.score ?? null;
}
