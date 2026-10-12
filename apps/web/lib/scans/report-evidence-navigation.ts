export const evidenceRowAnchor = (rowId: string) => `evidence-row-${rowId}`;

/** Navigation over projected finding identities only; this never determines eligibility. */
export function findingEvidenceAnchor(id: string, presentationGroup?: unknown) {
  if (presentationGroup === "accessibility") return "accessibility-evidence";
  if (id === "site_integrity_cms_security") return "cms-security-evidence";
  if (id === "form_data_unexpected_destination") return "form-destination-evidence";
  if (id.startsWith("site_integrity_")) return "site-integrity-evidence";
  if (id === "acceptance_signal_contradicts_action") return "consent-review-evidence";
  const prefix = "regulatory_gap__gdpr_eprivacy__";
  return id.startsWith(prefix) ? evidenceRowAnchor(id.slice(prefix.length)) : "evidence";
}
