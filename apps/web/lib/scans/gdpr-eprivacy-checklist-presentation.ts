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
import {
  getReportableGdprEprivacyCoverageItems,
  isReportableGdprEprivacyCoverageRowId,
} from "./gdpr-eprivacy-reportable-rows";
import { deriveRegulatoryCoverageScore, type RegulatoryCoverageScore } from "./regulatory-coverage-score";
import {
  GDPR_TRANSPARENCY_REPORT_ROW_ID_SET,
  type GdprTransparencyReportEvidenceLabel,
} from "./gdpr-transparency-report-contract";

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

const GDPR_TRANSPARENCY_REPORT_VALUE_SET = new Set<GdprTransparencyReportEvidenceLabel>([
  "Observed",
  "Not confirmed",
  "No match found",
]);

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
          GDPR_TRANSPARENCY_REPORT_ROW_ID_SET.has(item.id) &&
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
  const seenRowIds = new Set<string>();
  return (
    candidate.artifactVersion === GDPR_EPRIVACY_CHECKLIST_PRESENTATION_VERSION &&
    Array.isArray(candidate.rows) &&
    candidate.rows.every((row) => {
      const structurallyValid = Boolean(
        row &&
          typeof row.id === "string" &&
          typeof row.label === "string" &&
          typeof row.rationale === "string" &&
          typeof row.evidenceLabel === "string" &&
          typeof row.assessmentDirection === "string",
      );
      if (!structurallyValid) return false;
      if (seenRowIds.has(row.id)) return false;
      seenRowIds.add(row.id);
      if (!GDPR_TRANSPARENCY_REPORT_ROW_ID_SET.has(row.id)) return true;
      if (!(
        GDPR_TRANSPARENCY_REPORT_VALUE_SET.has(
          row.evidenceLabel as GdprTransparencyReportEvidenceLabel,
        ) && row.status === row.evidenceLabel
      )) return false;
      if (row.evidenceLabel === "Observed") {
        return row.assessmentStatus === "checked" &&
          row.assessmentDirection === "positive_signal" &&
          row.evidenceState === "observed";
      }
      if (row.evidenceLabel === "No match found") {
        return row.assessmentStatus === "checked" &&
          row.assessmentDirection === "neutral_signal" &&
          row.evidenceState === "not_observed";
      }
      return row.assessmentDirection !== "positive_signal";
    }) &&
    Boolean(candidate.checklistScore && typeof candidate.checklistScore === "object") &&
    Boolean(candidate.reviewSummary && typeof candidate.reviewSummary === "object") &&
    Boolean(candidate.summaryCounts && typeof candidate.summaryCounts === "object")
  );
}

export function filterGdprEprivacyChecklistPresentationForReport(
  presentation: GdprEprivacyChecklistPresentation,
): GdprEprivacyChecklistPresentation {
  const rows = presentation.rows.filter((row) =>
    isReportableGdprEprivacyCoverageRowId(row.id)
  );
  if (rows.length === presentation.rows.length) return presentation;
  const summaryCounts = rows.reduce<GdprEprivacyAssessmentSummaryCounts>((counts, row) => {
    if (row.assessmentDirection === "technical_limitation") {
      counts.technical_limitation += 1;
    } else if (row.assessmentDirection === "positive_signal") {
      counts.positive_signal += 1;
    } else if (row.assessmentDirection === "neutral_signal") {
      counts.neutral_signal += 1;
    } else if (row.assessmentStatus === "gap_observed" || row.status === "Gap observed") {
      counts.gap_observed += 1;
    } else if (row.assessmentDirection === "potential_concern") {
      counts.potential_concern += 1;
    } else {
      counts.review_signal += 1;
    }
    return counts;
  }, {
    gap_observed: 0,
    neutral_signal: 0,
    positive_signal: 0,
    potential_concern: 0,
    review_signal: 0,
    technical_limitation: 0,
  });
  return {
    ...presentation,
    rows,
    summaryCounts,
  };
}
