import assert from "node:assert/strict";
import test from "node:test";
import {
  getFindingCriticalityBadge,
  getFindingCriticalityBadgeRationale,
  type FindingCriticalityBadge
} from "./finding-criticality-badges";
import { EXECUTIVE_SUMMARY_TOP_FINDING_IDS } from "./rank-findings";

const EXPECTED_BADGES = {
  pre_consent_tracking_detected: "critical",
  keyboard_navigation_accessibility_issue: "high",
  semantic_labeling_accessibility_issue: "medium",
  text_alternative_accessibility_issue: "medium",
  visual_contrast_accessibility_issue: "medium",
  focus_management_issue: "high",
  cross_domain_identifier_sharing_observed: "high",
  cpra_cba_opt_out_missing: "high",
  reject_tracking_persists_after_reject: "critical",
  session_recording_services_detected: "medium",
  third_party_cookie_pre_consent: "critical",
  long_lived_cookie_retention_review: "medium",
  cookie_disclosure_gap: "medium",
  sensitive_data_collection_with_third_party_tracking_present: "high",
  session_replay_present_with_sensitive_surfaces_observed: "high",
  possible_session_replay_on_sensitive_input_surface: "critical",
  rtb_cookie_sync_observed: "high",
  policy_behavior_contradiction_detected: "high",
  scan_quality_visual_no_go: "high",
  consent_preference_reopen_control_not_observed: "medium",
  consent_dark_patterns_detected: "high",
  reject_option_missing_or_hidden: "medium",
  asymmetric_consent_ui: "medium",
  forced_consent_interaction: "high",
  probable_fingerprinting: "high"
} satisfies Record<(typeof EXECUTIVE_SUMMARY_TOP_FINDING_IDS)[number], FindingCriticalityBadge>;

test("finding criticality badges cover every executive top finding", () => {
  assert.equal(EXECUTIVE_SUMMARY_TOP_FINDING_IDS.length, 25);

  for (const findingId of EXECUTIVE_SUMMARY_TOP_FINDING_IDS) {
    assert.equal(getFindingCriticalityBadge(findingId), EXPECTED_BADGES[findingId]);
    assert.equal(typeof getFindingCriticalityBadgeRationale(findingId), "string");
  }
});

test("finding criticality badges return null for non-top findings", () => {
  assert.equal(getFindingCriticalityBadge("third_party_tracking_pre_consent"), null);
  assert.equal(getFindingCriticalityBadgeRationale("third_party_tracking_pre_consent"), null);
});
