import type { CertScoreFinding } from "./finding-registry";
import { EXECUTIVE_SUMMARY_TOP_FINDING_IDS } from "./rank-findings";

export type FindingCriticalityBadge = "critical" | "high" | "medium" | "low";

type FindingCriticalityBadgeDefinition = {
  badge: FindingCriticalityBadge;
  rationale: string;
};

const FINDING_CRITICALITY_BADGES = {
  pre_consent_tracking_detected: {
    badge: "critical",
    rationale: "Direct evidence that tracking began before recorded consent."
  },
  keyboard_navigation_accessibility_issue: {
    badge: "high",
    rationale: "Can block users from completing core flows."
  },
  semantic_labeling_accessibility_issue: {
    badge: "medium",
    rationale: "Important assistive-technology issue, but often context-dependent."
  },
  text_alternative_accessibility_issue: {
    badge: "medium",
    rationale: "Actionable accessibility issue, but urgency depends on affected content."
  },
  visual_contrast_accessibility_issue: {
    badge: "medium",
    rationale: "Common and actionable, but often context-dependent."
  },
  focus_management_issue: {
    badge: "high",
    rationale: "Can trap or disorient keyboard/screen-reader users."
  },
  cross_domain_identifier_sharing_observed: {
    badge: "high",
    rationale: "Strong privacy/adtech ecosystem risk signal."
  },
  cpra_cba_opt_out_missing: {
    badge: "high",
    rationale: "Important advertising opt-out risk without asserting legal violation."
  },
  reject_tracking_persists_after_reject: {
    badge: "critical",
    rationale: "Tracking after explicit reject is highly urgent."
  },
  session_recording_services_detected: {
    badge: "medium",
    rationale: "Review-worthy but not inherently critical without sensitive-surface evidence."
  },
  third_party_cookie_pre_consent: {
    badge: "critical",
    rationale: "Concrete evidence of tracking cookies before consent."
  },
  sensitive_data_collection_with_third_party_tracking_present: {
    badge: "high",
    rationale: "Material concern, but not proof of sensitive data capture."
  },
  possible_session_replay_on_sensitive_input_surface: {
    badge: "critical",
    rationale: "High potential harm where replay risk intersects with sensitive input surfaces."
  },
  rtb_cookie_sync_observed: {
    badge: "high",
    rationale: "Strong adtech data-sharing signal."
  },
  consent_dark_patterns_detected: {
    badge: "high",
    rationale: "Meaningful user-choice and enforcement risk."
  },
  reject_option_missing_or_hidden: {
    badge: "high",
    rationale: "Major consent UX concern, but less direct than tracking after reject."
  },
  asymmetric_consent_ui: {
    badge: "medium",
    rationale: "Review-worthy UX imbalance requiring context."
  },
  forced_consent_interaction: {
    badge: "high",
    rationale: "Can materially impair user choice or access."
  },
  fingerprinting_related_signals_observed: {
    badge: "medium",
    rationale: "Useful review context, not enough for high urgency by itself."
  },
  probable_fingerprinting: {
    badge: "high",
    rationale: "Important privacy risk, but probable should stay below critical."
  }
} satisfies Record<(typeof EXECUTIVE_SUMMARY_TOP_FINDING_IDS)[number], FindingCriticalityBadgeDefinition>;

export function getFindingCriticalityBadge(findingId: CertScoreFinding["id"]): FindingCriticalityBadge | null {
  return FINDING_CRITICALITY_BADGES[findingId as keyof typeof FINDING_CRITICALITY_BADGES]?.badge ?? null;
}

export function getFindingCriticalityBadgeRationale(findingId: CertScoreFinding["id"]): string | null {
  return FINDING_CRITICALITY_BADGES[findingId as keyof typeof FINDING_CRITICALITY_BADGES]?.rationale ?? null;
}
