import type { ShadowReportData } from "./shadow-report-data";
import { evidenceRowAnchor, HIDDEN_DETAILED_EVIDENCE_ROW_IDS } from "../../../lib/scans/report-evidence-navigation";

export type SharedEvidenceLink = { targetId: string; label: string; showLink?: boolean };
/** Route already-projected rows to one full evidence view. No assessment changes. */
export function detailedEvidenceLayout(report: ShadowReportData) {
  const platformRows = report.consentRows.filter(row => ["cmp_framework_signal_observed", "consent-management-framework"].includes(row.id));
  const cookieRows = report.consentRows.filter(row => row.id === "cookie_notice_policy_availability" || row.id === "cookie-notice-policy").map(row => ({
    ...row, title: "Cookie disclosure available",
    summary: row.status === "Observed" ? "A cookie policy or disclosure notice was found." : row.summary,
  }));
  const policyRows = [...report.gdprTransparencyRows, ...cookieRows];
  const consentRows = report.consentRows.filter(row => !platformRows.includes(row) && !cookieRows.some(cookie => cookie.id === row.id));
  const consentLinks: Record<string, SharedEvidenceLink> = {};
  const cmpLinks: Record<string, SharedEvidenceLink> = {};
  const cmp = report.cmpAudit?.rows;
  const banner = cmp?.find(row => row.id === "banner");
  for (const row of consentRows) {
    if (["consent_surface_observed", "consent-surface"].includes(row.id) && banner?.status === row.status) {
      consentLinks[row.id] = { targetId: "cmp-criterion-banner", label: "View cookie-banner evidence in CMP Details" };
    }
    if (row.id === "post_reject_tracking_reduction" && cmp?.find(item => item.id === "implementation")?.sourceIds.includes(row.id)) {
      consentLinks[row.id] = { targetId: "cmp-criterion-implementation", label: "View post-Reject tracking evidence in CMP Details", showLink: !report.rejectPath };
    }
    const control = row.id === "accept_consent_control" ? "accept" : row.id === "options_settings_preferences_control" ? "options" : null;
    if (control && report.consentControlsAvailable !== false && row.status === report.controls[control]) {
      consentLinks[row.id] = { targetId: "consent-choice-controls", label: "View consent choices", showLink: false };
    }
    // The owner removed this legacy row from Detailed Evidence. Retain its
    // canonical assessment and navigation alias; use the current CMP check.
    if (HIDDEN_DETAILED_EVIDENCE_ROW_IDS.includes(row.id)) {
      consentLinks[row.id] = { targetId: "cmp-criterion-reject", label: "View Reject availability", showLink: false };
    }
  }
  const privacy = cmp?.find(row => row.id === "privacy_link");
  const privacySource = policyRows.find(row => privacy?.sourceIds.includes(row.id));
  if (privacySource) cmpLinks.privacy_link = { targetId: evidenceRowAnchor(privacySource.id), label: "View privacy-policy discovery evidence" };
  return { platformRows, cookieRows, policyRows, consentRows, consentLinks, cmpLinks };
}
