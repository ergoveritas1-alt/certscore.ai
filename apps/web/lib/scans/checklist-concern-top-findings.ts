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

export function mergeCanonicalHighPriorityFindings(input: {
  checklistFindings: CertScoreFinding[];
  executiveFindings: CertScoreFinding[];
}) {
  const checklistRowIds = new Set(
    input.checklistFindings
      .map((finding) => finding.evidenceDetails?.policyEvidenceDetails?.rowId)
      .filter((rowId): rowId is string => typeof rowId === "string")
  );
  const byId = new Map<string, CertScoreFinding>();
  const nonDuplicateExecutiveFindings = input.executiveFindings.filter((finding) => {
    const equivalentChecklistRowId = EXECUTIVE_FINDING_CHECKLIST_ROW_EQUIVALENTS[finding.id];
    return !equivalentChecklistRowId || !checklistRowIds.has(equivalentChecklistRowId);
  });
  for (const finding of [...input.checklistFindings, ...nonDuplicateExecutiveFindings]) {
    if (!byId.has(finding.id)) {
      byId.set(finding.id, finding);
    }
  }
  return [...byId.values()];
}

const EXECUTIVE_FINDING_CHECKLIST_ROW_EQUIVALENTS: Readonly<Record<string, string>> = {
  adtech_cookie_pre_consent: "pre_consent_cookies_storage",
  analytics_cookie_pre_consent: "pre_consent_cookies_storage",
  pre_consent_tracking_detected: "pre_consent_third_party_tracking",
  third_party_cookie_pre_consent: "pre_consent_cookies_storage",
  third_party_tracking_pre_consent: "pre_consent_third_party_tracking"
};
