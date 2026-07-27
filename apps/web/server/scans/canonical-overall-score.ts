import { buildCanonicalShadowScoreInput } from "../../lib/scans/canonical-shadow-score-input";
import { deriveCanonicalShadowScore } from "../../lib/scans/canonical-shadow-score";
import { GDPR_EPRIVACY_SHADOW_CANDIDATE_V6_MODEL } from "../../lib/scans/canonical-shadow-score-model";
import type { GdprEprivacyCoverageChecklistItem } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import type { UnifiedFindingDisplayPacket } from "../../lib/scans/unified-findings";

export function deriveCanonicalOverallScoreForReport(input: {
  checklistRows: GdprEprivacyCoverageChecklistItem[];
  unifiedFindings: UnifiedFindingDisplayPacket[];
}) {
  try {
    const scoreInput = buildCanonicalShadowScoreInput(input);
    return deriveCanonicalShadowScore({
      ...scoreInput,
      model: GDPR_EPRIVACY_SHADOW_CANDIDATE_V6_MODEL
    }).postureScore;
  } catch {
    return null;
  }
}
