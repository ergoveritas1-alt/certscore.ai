export const GDPR_TRANSPARENCY_REPORT_ROW_IDS = [
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
] as const;

export type GdprTransparencyReportRowId =
  (typeof GDPR_TRANSPARENCY_REPORT_ROW_IDS)[number];

export type GdprTransparencyReportEvidenceLabel =
  | "Observed"
  | "Not confirmed"
  | "No match found";

export const GDPR_TRANSPARENCY_REPORT_ROW_ID_SET = new Set<string>(
  GDPR_TRANSPARENCY_REPORT_ROW_IDS,
);

export function isGdprTransparencyReportRowId(
  value: string,
): value is GdprTransparencyReportRowId {
  return GDPR_TRANSPARENCY_REPORT_ROW_ID_SET.has(value);
}

export function deriveGdprTransparencyReportEvidenceLabel(input: {
  assessmentResult?: string | null;
  status: string;
}): GdprTransparencyReportEvidenceLabel {
  if (input.status === "Observed") {
    return "Observed";
  }
  if (input.assessmentResult === "not_located_automatically") {
    return "No match found";
  }
  return "Not confirmed";
}
