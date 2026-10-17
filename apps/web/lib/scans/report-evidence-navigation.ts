export const evidenceRowAnchor = (rowId: string) => `evidence-row-${rowId}`;

/** Owner-removed legacy presentation; preserve its assessment and navigation alias. */
export const HIDDEN_DETAILED_EVIDENCE_ROW_IDS: readonly string[] = ["reject_all_path_availability"];

/** Navigation over projected finding identities only; this never determines eligibility. */
export function findingEvidenceAnchor(id: string, presentationGroup?: unknown) {
  if (presentationGroup === "accessibility" || id === "accessibility_priority_group") return "accessibility-evidence";
  if (id === "gpc_response") return "gpc-evidence";
  if (id === "site_integrity_cms_security") return "cms-security-evidence";
  if (id === "form_data_unexpected_destination") return "form-destination-evidence";
  if (id.startsWith("site_integrity_")) return "site-integrity-evidence";
  if ((id.startsWith("california_privacy_choice_") || id === "california_sale_sharing_opt_out_activity" || id === "california_notice_at_collection_destination_error" || id === "california_rights_information_destination_error")) return "california-privacy-evidence";
  if (id === "acceptance_signal_contradicts_action") return "consent-review-evidence";
  const prefix = "regulatory_gap__gdpr_eprivacy__";
  return id.startsWith(prefix) ? evidenceRowAnchor(id.slice(prefix.length)) : "evidence";
}
