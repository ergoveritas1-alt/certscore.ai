/** Navigation over existing report projections. These mappings never establish a finding. */
export const REPORT_EVIDENCE_LINK_TARGETS = [
  { findingId: 'regulatory_gap__gdpr_eprivacy__pre_consent_third_party_tracking', anchor: 'evidence-row-pre_consent_third_party_tracking', label: 'Inspect the tracking observed before consent in CertScore.ai', reviewFocus: 'gdpr_eprivacy' },
  { findingId: 'regulatory_gap__gdpr_eprivacy__pre_consent_cookies_storage', anchor: 'evidence-row-pre_consent_cookies_storage', label: 'Inspect the cookies and storage observed before consent in CertScore.ai', reviewFocus: 'gdpr_eprivacy' },
  { findingId: 'regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction', anchor: 'evidence-row-post_reject_tracking_reduction', label: 'Inspect the evidence observed after Reject in CertScore.ai', reviewFocus: 'gdpr_eprivacy' },
  { findingId: 'regulatory_gap__gdpr_eprivacy__session_replay_fingerprinting_review', anchor: 'evidence-row-session_replay_fingerprinting_review', label: 'Review the session replay evidence in CertScore.ai', reviewFocus: 'gdpr_eprivacy' },
  { findingId: 'regulatory_gap__gdpr_eprivacy__device_identification_fingerprinting_signal_observed', anchor: 'evidence-row-device_identification_fingerprinting_signal_observed', label: 'Inspect the device-identification signal evidence in CertScore.ai', reviewFocus: 'gdpr_eprivacy' },
  { findingId: 'accessibility_priority_group', anchor: 'accessibility-evidence', label: 'Inspect the accessibility examples in CertScore.ai' },
  { findingId: 'gpc_response', anchor: 'gpc-evidence', label: 'Review the GPC observations in CertScore.ai' },
] as const;

export const REPORT_SECTION_LINK_TARGETS = ['evidence', 'report-top-issues', 'page-event-timeline', 'report-resource-inventory', 'report-forms'] as const;
