import type { GdprEprivacyCoverageChecklistItem } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import type { UnifiedFindingDisplayPacket } from "../../lib/scans/unified-findings";
import { deriveRegulatoryCoverageScore } from "../../lib/scans/regulatory-coverage-score";

export function deriveCanonicalOverallScoreForReport(input: {
  checklistRows: GdprEprivacyCoverageChecklistItem[];
  unifiedFindings: UnifiedFindingDisplayPacket[];
}) {
  void input.unifiedFindings;
  return deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: input.checklistRows
  }).score;
}
