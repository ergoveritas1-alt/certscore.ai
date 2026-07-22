import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import type {
  CanonicalShadowCoverageRow,
  CanonicalShadowScoreFinding
} from "./canonical-shadow-score";

export const GDPR_EPRIVACY_SHADOW_SCORE_ELIGIBLE_FAMILIES = [
  "consent_tracking",
  "contradiction",
  "policy_extraction",
  "rights_gap"
] as const;

const GDPR_EPRIVACY_SHADOW_SCORE_ELIGIBLE_FAMILY_SET = new Set<string>(
  GDPR_EPRIVACY_SHADOW_SCORE_ELIGIBLE_FAMILIES
);

export function buildCanonicalShadowScoreInput(input: {
  checklistRows: GdprEprivacyCoverageChecklistItem[];
  unifiedFindings: UnifiedFindingDisplayPacket[];
}): {
  coverageRows: CanonicalShadowCoverageRow[];
  findings: CanonicalShadowScoreFinding[];
} {
  return {
    coverageRows: input.checklistRows.map((row) => ({
      assessmentStatus: row.assessmentStatus,
      evidenceState: row.evidenceState,
      rowId: row.id
    })),
    findings: input.unifiedFindings.flatMap((packet) => {
      if (!packet.surfacingDecision.reportable || packet.presentationDecision.status !== "surface") {
        return [];
      }
      const family = packet.surfacingDecision.family.trim();
      if (!family || !GDPR_EPRIVACY_SHADOW_SCORE_ELIGIBLE_FAMILY_SET.has(family)) {
        return [];
      }
      return [{
        family,
        findingId: packet.unifiedFindingId,
        severity: packet.severity
      }];
    })
  };
}
