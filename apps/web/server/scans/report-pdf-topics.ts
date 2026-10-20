import { pdfNarrativeFindings } from "./report-pdf-evidence";
import { getReportUnifiedFinding, getReportUnifiedFindingByAlias, getReportEvidenceCategory } from "@website-signal-risk-scanner/shared";
import { CERT_SCORE_FINDING_REGISTRY } from "../../lib/scans/finding-registry";
import { isGdprTransparencyReportRowId } from "../../lib/scans/gdpr-transparency-report-contract";
import type { CanonicalReportExport } from "./report-export";

export const PDF_REPORT_TOPICS = [
  { id: "consent", title: "Consent management" },
  { id: "storage", title: "Cookies and similar technologies", subtitle: "Cookies, local storage and session storage" },
  { id: "policy", title: "Privacy policy" },
  { id: "forms", title: "Forms" },
  { id: "security", title: "Webserver security" },
  { id: "external", title: "External services / domains" },
  { id: "tls", title: "TLS" },
  { id: "accessibility", title: "ADA/WCAG" },
] as const;
export type PdfReportTopic = typeof PDF_REPORT_TOPICS[number]["id"];

const rowTopics: Record<string, PdfReportTopic> = {
  cookie_policy_present: "policy", privacy_policy_present: "policy", california_rights_disclosure_not_observed: "policy", post_refusal_non_essential_activity: "consent",
  consent_surface_observed: "consent", cmp_framework_signal_observed: "consent", reject_all_path_availability: "consent",
  accept_consent_control: "consent", options_settings_preferences_control: "consent", consent_choice_quality: "consent",
  post_reject_tracking_reduction: "consent", preference_withdrawal_control: "consent", gpc_response: "consent",
  fingerprinting_observed: "storage", cookie_retention_lifetime_review_signal: "storage", weak_cookie_security_attributes: "storage",
  pre_submit_text_capture_detected: "forms", cookie_disclosure_gap: "policy",
  cookie_notice_policy_availability: "policy", outdated_transfer_framework_reference: "policy",
  pre_consent_cookies_storage: "storage", session_replay_fingerprinting_review: "storage", device_identification_fingerprinting_signal_observed: "storage",
  pre_consent_third_party_tracking: "external", advertising_retargeting_vendor_signal_observed: "external",
  retargeting_behavioral_advertising_signal_observed: "external", analytics_vendor_observed: "external", third_party_iframe_pre_consent: "external",
  social_media_embed_pre_consent: "external", embedded_content_pre_consent: "external", cross_border_endpoint_review: "external",
  public_collection_surfaces: "forms", sensitive_surfaces_third_party_tracking: "forms",
  transport_security_https_delivery: "security", transport_security_http_redirect: "security", transport_security_mixed_content: "security",
  transport_security_form_transport: "forms", transport_security_tls_certificate: "tls", accessibility_consent_controls: "accessibility",
};
const familyTopics: Record<string, PdfReportTopic> = {
  form_destinations: "forms", sensitive_data: "forms", cms_security: "security", site_integrity: "security",
  california_privacy_review: "policy", policy_extraction: "policy", rights_gap: "policy", contradiction: "policy",
  privacy_signal: "consent", accessibility: "accessibility",
};
const sectionTopics: Record<string, PdfReportTopic> = {
  "Consent Experience": "consent", "Cookies & Storage": "storage", Fingerprinting: "storage",
  "Vendors & Requests": "external", "Navigation & Redirects": "external", Accessibility: "accessibility",
};
const ownerTopics: Record<string, PdfReportTopic> = {
  consent_interface_control_availability: "consent", choice_symmetry_dark_pattern_indicators: "consent",
  consent_framework_cmp_signals: "consent", enforcement_outcomes_after_user_choice: "consent",
  preconsent_tracking_incidents: "consent", vendor_tracker_inventory: "external", third_party_network_cookie_surface: "external",
  adtech_analytics_replay_footprint: "external", notice_scope_entity_identity: "policy", rights_request_mechanisms: "policy",
  data_handling_disclosures: "policy", privacy_contacts_accountability: "policy", policy_to_behavior_contradictions: "policy",
  clarity_completeness_risk: "policy", cross_document_consistency: "policy", collection_surface_entry_points_and_handling_context: "forms",
  identity_financial_data_collection: "forms", health_location_other_sensitive_data_collection: "forms",
  minor_related_age_gated_collection_context: "forms", sensitive_data_third_party_exposure_context: "forms",
  site_integrity_observations: "security", perceivability_barriers: "accessibility", navigation_interaction_and_task_path_barriers: "accessibility",
  form_task_completion_and_critical_workflow_barriers: "accessibility", representative_rule_level_evidence: "accessibility",
};
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
/** Display grouping only: never derives a finding, severity or score from observations. */
export function pdfTopicForRow(id: string): PdfReportTopic | null {
  return isGdprTransparencyReportRowId(id) ? "policy" : rowTopics[id] ?? null;
}
export function pdfTopicForFinding(finding: Record<string, unknown>): PdfReportTopic | null {
  const presentation = object(finding.presentation);
  const ids = [finding.unifiedFindingId, finding.id, finding.findingId, finding.checklistRowId, presentation.findingId, presentation.checklistRowId].filter((id): id is string => typeof id === "string");
  for (const id of ids) { const topic = pdfTopicForRow(id); if (topic) return topic; }
  const family = object(finding.details).family;
  for (const id of ids) { const section = CERT_SCORE_FINDING_REGISTRY[id]?.section; if (section && sectionTopics[section]) return sectionTopics[section]!; }
  const definition = ids.map(id => getReportUnifiedFinding(id) ?? getReportUnifiedFindingByAlias(id)).find(Boolean);
  const alignments = finding.categoryAlignments ?? definition?.categoryAlignments;
  const owner = Array.isArray(alignments) ? alignments.map(object).find(row => row.relation === "owner") : null;
  if (typeof owner?.evidenceCategoryId !== "string") return typeof family === "string" ? familyTopics[family] ?? null : null;
  const section = getReportEvidenceCategory(owner.evidenceCategoryId)?.sectionId;
  const categorySectionTopics: Record<string, PdfReportTopic> = {
    privacy_notices_rights_data_handling: "policy", policy_clarity_consistency_review: "policy",
    consent_controls_enforcement: "consent", tracking_third_party_ecosystem: "external", sensitive_data_collection: "forms",
    access_barriers_task_completion: "accessibility", accessibility_commitments_conformance_support: "accessibility",
  };
  return ownerTopics[owner.evidenceCategoryId] ?? (section ? categorySectionTopics[section] ?? null : null) ?? (typeof family === "string" ? familyTopics[family] ?? null : null);
}
export function pdfTopicOverview(report: CanonicalReportExport) {
  const findings = pdfNarrativeFindings(report);
  return PDF_REPORT_TOPICS.map(topic => {
    const rows = (report.gdprEprivacyReview?.rows ?? []).filter(row => pdfTopicForRow(row.id) === topic.id);
    const selected = findings.filter(finding => pdfTopicForFinding(finding) === topic.id);
    let detail = rows.length ? `${rows.length} checklist rows retained` : "Evidence unavailable";
    if (topic.id === "storage") detail = `${report.appendix.cookieAndTrackerInventory.summary.cookieRows} cookies; ${report.appendix.cookieAndTrackerInventory.summary.storageRows ?? 0} local/session storage rows`;
    if (topic.id === "external") detail = `${report.appendix.cookieAndTrackerInventory.summary.trackerRows} service / tracker rows retained`;
    if (topic.id === "forms") detail = `${report.appendix.dataCollectionSurfaces.summary.totalForms} forms; ${report.appendix.dataCollectionSurfaces.assessmentStatus.replaceAll("_", " ")}`;
    if (topic.id === "accessibility" && report.accessibilityAudit) detail = `${report.accessibilityAudit.status}; ${report.accessibilityAudit.failedRuleCount ?? "unknown"} failed automated rules`;
    if (topic.id === "consent" && report.consentControlAssessment) detail = `${report.consentControlAssessment.assessmentStatus} consent assessment`;
    if (["storage", "external"].includes(topic.id) && report.appendix.cookieAndTrackerInventory.presentationStatus === "insufficient_evidence") detail = "Inventory evidence unavailable";
    return { ...topic, findings: selected, detail };
  });
}
