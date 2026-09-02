import type { GdprEprivacyCoverageChecklistItem } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import type { UnifiedFindingDisplayPacket } from "../../lib/scans/unified-findings";
import {
  CALIFORNIA_GPC_NO_SUPPRESSION_DEDUCTION_POINTS,
  CALIFORNIA_GPC_NO_SUPPRESSION_POLICY_KEY,
  CALIFORNIA_GPC_RESPONSE_POLICY_VERSION,
  CANONICAL_OVERALL_SCORE_SOURCE,
  CANONICAL_OVERALL_SCORE_VERSION,
} from "../../lib/scans/california-gpc-response-policy";
import { deriveRegulatoryCoverageScore } from "../../lib/scans/regulatory-coverage-score";

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

export function deriveCanonicalOverallScoreForReport(input: {
  checklistRows: GdprEprivacyCoverageChecklistItem[];
  unifiedFindings: UnifiedFindingDisplayPacket[];
}) {
  const postureScore = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: input.checklistRows
  }).score;
  if (postureScore === null) return null;
  return Math.max(0, postureScore - californiaGpcDeduction(input.unifiedFindings));
}
