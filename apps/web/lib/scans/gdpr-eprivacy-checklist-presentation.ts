import type {
  GdprEprivacyCoverageChecklistItem,
  GdprEprivacyCoverageChecklistStatus,
  GdprEprivacyCoverageChecklistTone,
  RegulatoryAssessmentStatus,
  RegulatoryChecklistDebugConfidence,
  RegulatoryEvidenceState,
} from "./gdpr-eprivacy-coverage-checklist";
import {
  getAssessmentDirection,
  getEvidenceLabel,
  summarizeGdprEprivacyAssessmentDirections,
  type AssessmentDirection,
  type EvidenceLabel,
  type GdprEprivacyAssessmentSummaryCounts,
} from "./gdpr-eprivacy-assessment-direction";
import { deriveGdprEprivacyCoverageChecklistRowRationale } from "./gdpr-eprivacy-checklist-rationale";
import { deriveGdprEprivacyReviewSummary } from "./gdpr-eprivacy-review-summary";
import { getReportableGdprEprivacyCoverageItems } from "./gdpr-eprivacy-reportable-rows";
import { deriveRegulatoryCoverageScore, type RegulatoryCoverageScore } from "./regulatory-coverage-score";

export const GDPR_EPRIVACY_CHECKLIST_PRESENTATION_VERSION =
  "gdpr-eprivacy-checklist-presentation-v1";

export type GdprEprivacyChecklistPresentationRow = {
  assessmentDirection: AssessmentDirection;
  assessmentStatus: RegulatoryAssessmentStatus;
  debugConfidence?: RegulatoryChecklistDebugConfidence;
  evidenceLabel: EvidenceLabel;
  evidenceState: RegulatoryEvidenceState;
  id: string;
  label: string;
  policyReviewCandidate: boolean;
  rationale: string;
  scannerCoverageGap: boolean;
  status: GdprEprivacyCoverageChecklistStatus;
  tone: GdprEprivacyCoverageChecklistTone;
};

export type GdprEprivacyChecklistPresentation = {
  artifactVersion: typeof GDPR_EPRIVACY_CHECKLIST_PRESENTATION_VERSION;
  checklistScore: RegulatoryCoverageScore;
  reviewSummary: {
    coverageText: string;
    priorityReviewText: string;
  };
  rows: GdprEprivacyChecklistPresentationRow[];
  summaryCounts: GdprEprivacyAssessmentSummaryCounts;
};

const TRANSPARENCY_ROW_IDS = new Set([
  "privacy_notice_availability",
  "controller_contact_disclosure",
  "processing_purposes_disclosure",
  "legal_basis_disclosure_observed",
  "recipients_vendor_categories_disclosure",
  "retention_disclosure",
  "retention_disclosure_observed",
  "retention_disclosure_present",
  "data_subject_rights_disclosure",
  "international_transfers_disclosure",
  "dpo_contact_point_disclosure",
  "supervisory_authority_complaint_disclosure",
  "automated_decision_making_profiling_disclosure",
]);

const TRANSPARENCY_DISCLOSURE_TYPE_BY_ROW_ID: Record<string, string> = {
  automated_decision_making_profiling_disclosure: "automated_decision_making_or_profiling",
  controller_contact_disclosure: "controller_contact",
  data_subject_rights_disclosure: "data_subject_rights",
  dpo_contact_point_disclosure: "dpo_contact",
  international_transfers_disclosure: "international_transfers",
  legal_basis_disclosure_observed: "legal_basis",
  processing_purposes_disclosure: "processing_purposes",
  recipients_vendor_categories_disclosure: "recipients_or_vendor_categories",
  retention_disclosure: "data_retention",
  retention_disclosure_observed: "data_retention",
  retention_disclosure_present: "data_retention",
  supervisory_authority_complaint_disclosure: "supervisory_authority",
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasTypedPolicyReviewEvidence(item: GdprEprivacyCoverageChecklistItem) {
  const disclosureType = TRANSPARENCY_DISCLOSURE_TYPE_BY_ROW_ID[item.id];
  if (!disclosureType) {
    return false;
  }
  const evidence = item.criticalEvidence.retainedEvidence;
  const directSignal =
    record(evidence.article13Signal) ?? record(evidence.article_13_signal);
  const directType = directSignal?.disclosureType ?? directSignal?.disclosure_type;
  if (
    directType === disclosureType &&
    (hasText(directSignal?.evidenceText) || hasText(directSignal?.evidence_text))
  ) {
    return true;
  }
  const rowSection =
    record(evidence.rowSpecificSectionEvidence) ??
    record(evidence.row_specific_section_evidence);
  if (
    hasText(rowSection?.evidenceText) ||
    hasText(rowSection?.evidence_text) ||
    hasText(rowSection?.excerpt)
  ) {
    return true;
  }
  const summary =
    record(evidence.policySurfaceSummary) ?? record(evidence.policy_surface_summary);
  const signals = summary?.article13DisclosureSignals ?? summary?.article_13_disclosure_signals;
  return Array.isArray(signals) && signals.some((value) => {
    const signal = record(value);
    const signalType = signal?.disclosureType ?? signal?.disclosure_type;
    return (
      signalType === disclosureType &&
      (hasText(signal?.evidenceText) || hasText(signal?.evidence_text))
    );
  });
}

function hasScannerCoverageGap(item: GdprEprivacyCoverageChecklistItem) {
  if (item.evidenceState !== "not_testable" && item.assessmentStatus !== "coverage_limitation") {
    return false;
  }
  return item.criticalEvidence.missingOrIncompleteSourceSignals.some((gap) =>
    /policysurfacescanner|consentflowruntimescanner|preconsentruntimescanner|scanner did not run|required_source_module_not_run/i.test(
      String(gap.whyNeeded),
    ),
  );
}

export function buildGdprEprivacyChecklistPresentation(
  items: GdprEprivacyCoverageChecklistItem[],
): GdprEprivacyChecklistPresentation {
  const reportableRows = getReportableGdprEprivacyCoverageItems(items);
  const reviewSummary = deriveGdprEprivacyReviewSummary(reportableRows);
  return {
    artifactVersion: GDPR_EPRIVACY_CHECKLIST_PRESENTATION_VERSION,
    checklistScore: deriveRegulatoryCoverageScore({
      framework: "gdpr_eprivacy",
      rows: reportableRows,
    }),
    reviewSummary: {
      coverageText: reviewSummary.coverageText,
      priorityReviewText: reviewSummary.priorityReviewText,
    },
    rows: reportableRows.map((item) => {
      const evidenceLabel = getEvidenceLabel(item);
      return {
        assessmentDirection: getAssessmentDirection(item),
        assessmentStatus: item.assessmentStatus,
        debugConfidence: item.debugConfidence,
        evidenceLabel,
        evidenceState: item.evidenceState,
        id: item.id,
        label: item.label,
        policyReviewCandidate:
          TRANSPARENCY_ROW_IDS.has(item.id) &&
          (evidenceLabel === "Observed" || evidenceLabel === "Not confirmed") &&
          hasTypedPolicyReviewEvidence(item),
        rationale: deriveGdprEprivacyCoverageChecklistRowRationale(item),
        scannerCoverageGap: hasScannerCoverageGap(item),
        status: item.status,
        tone: item.tone,
      };
    }),
    summaryCounts: summarizeGdprEprivacyAssessmentDirections(reportableRows),
  };
}

export function isGdprEprivacyChecklistPresentation(
  value: unknown,
): value is GdprEprivacyChecklistPresentation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<GdprEprivacyChecklistPresentation>;
  return (
    candidate.artifactVersion === GDPR_EPRIVACY_CHECKLIST_PRESENTATION_VERSION &&
    Array.isArray(candidate.rows) &&
    candidate.rows.every((row) =>
      Boolean(
        row &&
          typeof row.id === "string" &&
          typeof row.label === "string" &&
          typeof row.rationale === "string" &&
          typeof row.evidenceLabel === "string" &&
          typeof row.assessmentDirection === "string",
      ),
    ) &&
    Boolean(candidate.checklistScore && typeof candidate.checklistScore === "object") &&
    Boolean(candidate.reviewSummary && typeof candidate.reviewSummary === "object") &&
    Boolean(candidate.summaryCounts && typeof candidate.summaryCounts === "object")
  );
}
