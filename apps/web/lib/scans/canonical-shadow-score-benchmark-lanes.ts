export const LUNA_EXPECTED_BAND_LANE_IDS = [
  "access_limited_no_go",
  "accessibility",
  "consumer_protection",
  "cross_region_equivalence",
  "low_signal",
  "policy_gaps",
  "pre_consent_tracking_storage",
  "sensitive_contexts",
  "session_replay_fingerprinting",
  "source_equivalence",
  "strong_consent_controls",
  "transport_security"
] as const;

export type LunaExpectedBandLaneId = typeof LUNA_EXPECTED_BAND_LANE_IDS[number];
