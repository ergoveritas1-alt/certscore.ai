import type { CertScoreFinding } from "./finding-registry";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";
import {
  getAssessmentDirection,
  getEvidenceLabel
} from "./gdpr-eprivacy-assessment-direction";
import { deriveGdprEprivacyCoverageChecklistRowRationale } from "./gdpr-eprivacy-checklist-rationale";
import { getReportableGdprEprivacyCoverageItems } from "./gdpr-eprivacy-reportable-rows";
import { buildRegulatoryGapTopFindings } from "./regulatory-gap-top-findings";

export function buildChecklistConcernTopFindings(
  checklist: GdprEprivacyCoverageChecklistItem[]
): CertScoreFinding[] {
  const rows = getReportableGdprEprivacyCoverageItems(checklist).map((item) => {
    const statusBasis = deriveGdprEprivacyCoverageChecklistRowRationale(item);
    return {
      ...item,
      assessmentDirection: getAssessmentDirection(item),
      criticalEvidence: {
        ...item.criticalEvidence,
        statusBasis
      },
      evidenceLabel: getEvidenceLabel(item),
      note: statusBasis
    };
  });

  return buildRegulatoryGapTopFindings({
    gdprEprivacyArea: {
      id: "gdpr_eprivacy",
      rows,
      title: "GDPR / ePrivacy"
    }
  });
}

export function selectCanonicalHighPriorityFindings(checklistFindings: CertScoreFinding[]) {
  const byId = new Map<string, CertScoreFinding>();
  // Executive high-priority cards are a checklist concern projection. Unified
  // runtime findings remain reportable in their owning report surfaces, but an
  // observed signal must not become a top finding merely because it appears in
  // the legacy executive allowlist.
  for (const finding of checklistFindings) {
    if (!byId.has(finding.id)) {
      byId.set(finding.id, finding);
    }
  }
  return [...byId.values()];
}
