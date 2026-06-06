export const CALIFORNIA_PRIVACY_REGULATORY_REVIEW_AREA = "california_ccpa_cpra" as const;

export type CaliforniaPrivacyRegulatoryReviewArea = typeof CALIFORNIA_PRIVACY_REGULATORY_REVIEW_AREA;

export type CaliforniaPrivacyReviewStatus =
  | "observed"
  | "potential_gap"
  | "review_signal"
  | "not_observed"
  | "not_testable"
  | "not_applicable";

export type CaliforniaPrivacyEvidenceFamily =
  | "notice_surface"
  | "collection_notice"
  | "sale_share_control"
  | "gpc_handling"
  | "adtech_sharing_runtime"
  | "disclosure_alignment"
  | "sensitive_pi"
  | "cipa_interaction_recording"
  | "cipa_communication_interception"
  | "opt_out_friction"
  | "post_opt_out_tracking"
  | "rights_methods"
  | "privacy_control_accessibility";

export type CaliforniaPrivacyReviewStatusLabel =
  | "Observed"
  | "Potential gap"
  | "Review signal"
  | "Not observed"
  | "Not testable"
  | "Not applicable";

export const CALIFORNIA_PRIVACY_REVIEW_STATUS_LABELS: Record<
  CaliforniaPrivacyReviewStatus,
  CaliforniaPrivacyReviewStatusLabel
> = {
  not_applicable: "Not applicable",
  not_observed: "Not observed",
  not_testable: "Not testable",
  observed: "Observed",
  potential_gap: "Potential gap",
  review_signal: "Review signal"
};

export function getCaliforniaPrivacyReviewStatusLabel(
  status: CaliforniaPrivacyReviewStatus
): CaliforniaPrivacyReviewStatusLabel {
  return CALIFORNIA_PRIVACY_REVIEW_STATUS_LABELS[status];
}
