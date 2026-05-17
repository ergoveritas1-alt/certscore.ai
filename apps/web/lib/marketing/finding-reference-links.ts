import { getFindingReferenceItems } from "./finding-atlas";

const REPORT_FINDING_ID_TO_REFERENCE_ID: Record<string, string> = {
  accept_more_prominent_than_reject: "asymmetric_consent_ui",
  accept_only_banner: "consent_dark_patterns_detected",
  dismiss_without_reject: "consent_dark_patterns_detected",
  fingerprinting_observed: "probable_fingerprinting",
  forced_consent_wall: "forced_consent_interaction",
  preconsent_tracking: "pre_consent_tracking_detected",
  reject_button_missing: "reject_option_missing_or_hidden",
  reject_did_not_reduce_tracking: "reject_tracking_persists_after_reject",
  session_replay_observed: "session_recording_services_detected",
  session_replay_undisclosed: "session_recording_services_detected"
};

const FINDING_REFERENCE_IDS = new Set(getFindingReferenceItems().map((finding) => finding.id));

export function getFindingReferenceIdForReportFindingId(findingId: string) {
  const referenceId = REPORT_FINDING_ID_TO_REFERENCE_ID[findingId] ?? findingId;
  return FINDING_REFERENCE_IDS.has(referenceId) ? referenceId : null;
}

export function getFindingReferenceHrefForReportFindingId(findingId: string) {
  const referenceId = getFindingReferenceIdForReportFindingId(findingId);
  return referenceId ? `/guides/findings/${referenceId}` : null;
}
