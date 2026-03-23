import type { FindingDefinition, LaunchFindingId, RegulatoryMapping } from "./types";

function mapping(jurisdiction: string, framework: string, citationKey: string, notes?: string): RegulatoryMapping {
  return {
    jurisdiction,
    framework,
    mappingType: "relevance_mapping",
    citationKey,
    ...(notes ? { notes } : {})
  };
}

const STATE_PRIVACY_MAPPINGS: RegulatoryMapping[] = [
  mapping("United States", "Unified 2026 U.S. state privacy posture", "us_state_privacy.notice_and_rights"),
  mapping("California", "California privacy choice posture", "ca_privacy.notice_and_choice"),
  mapping("Colorado", "State privacy posture relevance", "co_privacy.consumer_rights"),
  mapping("Connecticut", "State privacy posture relevance", "ct_privacy.consumer_rights"),
  mapping("Virginia", "State privacy posture relevance", "va_privacy.consumer_rights"),
  mapping("Texas", "State privacy posture relevance", "tx_privacy.consumer_rights"),
  mapping("Oregon", "State privacy posture relevance", "or_privacy.consumer_rights"),
  mapping("New Jersey", "State privacy posture relevance", "nj_privacy.consumer_rights")
];

export const REGULATORY_FINDING_DEFINITIONS: Record<LaunchFindingId, FindingDefinition> = {
  "privacy.ca.privacy_policy_surface_missing": {
    claimType: "surface_absence",
    defaultSeverity: "high",
    findingId: "privacy.ca.privacy_policy_surface_missing",
    module: "California Privacy Choice Posture",
    pillar: "Privacy & Consent",
    regulatoryMappings: [
      mapping("California", "California privacy choice posture", "ca_privacy.privacy_policy_surface")
    ],
    title: "Privacy policy surface not detected"
  },
  "privacy.ca.opt_out_surface_missing": {
    claimType: "surface_absence",
    defaultSeverity: "high",
    findingId: "privacy.ca.opt_out_surface_missing",
    module: "California Privacy Choice Posture",
    pillar: "Privacy & Consent",
    regulatoryMappings: [
      mapping("California", "California privacy choice posture", "ca_privacy.opt_out_surface")
    ],
    title: "Opt-out privacy control surface not detected"
  },
  "privacy.ca.browser_signal_not_evident": {
    claimType: "readiness_not_evident",
    defaultSeverity: "high",
    findingId: "privacy.ca.browser_signal_not_evident",
    module: "California Privacy Choice Posture",
    pillar: "Privacy & Consent",
    regulatoryMappings: [
      mapping("California", "California privacy choice posture", "ca_privacy.browser_signal_handling")
    ],
    title: "Browser opt-out signal handling not evident"
  },
  "privacy.ca.pre_choice_tracking_observed": {
    claimType: "observable_behavior",
    defaultSeverity: "high",
    findingId: "privacy.ca.pre_choice_tracking_observed",
    module: "California Privacy Choice Posture",
    pillar: "Privacy & Consent",
    regulatoryMappings: [
      mapping("California", "California privacy choice posture", "ca_privacy.pre_choice_tracking")
    ],
    title: "Tracking observed before privacy choice interaction"
  },
  "privacy.ca.claim_behavior_gap": {
    claimType: "claim_vs_behavior_gap",
    defaultSeverity: "medium",
    findingId: "privacy.ca.claim_behavior_gap",
    module: "California Privacy Choice Posture",
    pillar: "Privacy & Consent",
    regulatoryMappings: [
      mapping("California", "California privacy choice posture", "ca_privacy.claim_behavior_gap")
    ],
    title: "Public privacy disclosure may not clearly align with observed choice behavior"
  },
  "privacy.state.consumer_rights_mechanism_missing": {
    claimType: "surface_absence",
    defaultSeverity: "high",
    findingId: "privacy.state.consumer_rights_mechanism_missing",
    module: "Unified 2026 State Privacy Posture",
    pillar: "Privacy & Consent",
    regulatoryMappings: STATE_PRIVACY_MAPPINGS,
    title: "Consumer rights request mechanism not detected"
  },
  "privacy.state.targeted_ads_opt_out_missing": {
    claimType: "surface_absence",
    defaultSeverity: "high",
    findingId: "privacy.state.targeted_ads_opt_out_missing",
    module: "Unified 2026 State Privacy Posture",
    pillar: "Privacy & Consent",
    regulatoryMappings: STATE_PRIVACY_MAPPINGS,
    title: "Targeted advertising opt-out surface not detected"
  },
  "privacy.state.universal_opt_out_not_evident": {
    claimType: "readiness_not_evident",
    defaultSeverity: "high",
    findingId: "privacy.state.universal_opt_out_not_evident",
    module: "Unified 2026 State Privacy Posture",
    pillar: "Privacy & Consent",
    regulatoryMappings: STATE_PRIVACY_MAPPINGS,
    title: "Universal opt-out handling not evident"
  },
  "privacy.state.disclosure_behavior_gap": {
    claimType: "claim_vs_behavior_gap",
    defaultSeverity: "medium",
    findingId: "privacy.state.disclosure_behavior_gap",
    module: "Unified 2026 State Privacy Posture",
    pillar: "Privacy & Consent",
    regulatoryMappings: STATE_PRIVACY_MAPPINGS,
    title: "Public privacy disclosures may not clearly explain observed data and choice posture"
  },
  "accessibility.eu.statement_missing": {
    claimType: "surface_absence",
    defaultSeverity: "medium",
    findingId: "accessibility.eu.statement_missing",
    module: "EU Accessibility Act Posture",
    pillar: "Accessibility",
    regulatoryMappings: [
      mapping("European Union", "EU accessibility posture", "eu_accessibility.public_statement_surface")
    ],
    title: "Accessibility statement not detected"
  },
  "accessibility.eu.automated_barriers_detected": {
    claimType: "observable_behavior",
    defaultSeverity: "high",
    findingId: "accessibility.eu.automated_barriers_detected",
    module: "EU Accessibility Act Posture",
    pillar: "Accessibility",
    regulatoryMappings: [
      mapping("European Union", "EU accessibility posture", "eu_accessibility.automated_barrier_evidence")
    ],
    title: "Automated accessibility barriers detected on tested pages"
  },
  "accessibility.eu.key_flow_barriers": {
    claimType: "manual_review_recommended",
    defaultSeverity: "critical",
    findingId: "accessibility.eu.key_flow_barriers",
    module: "EU Accessibility Act Posture",
    pillar: "Accessibility",
    regulatoryMappings: [
      mapping("European Union", "EU accessibility posture", "eu_accessibility.key_flow_barriers")
    ],
    title: "Key user flows may include barriers for assistive technology users"
  },
  "accessibility.eu.claim_gap": {
    claimType: "claim_vs_behavior_gap",
    defaultSeverity: "medium",
    findingId: "accessibility.eu.claim_gap",
    module: "EU Accessibility Act Posture",
    pillar: "Accessibility",
    regulatoryMappings: [
      mapping("European Union", "EU accessibility posture", "eu_accessibility.claim_substantiation_gap")
    ],
    title: "Public accessibility claim not fully substantiated by automated test results"
  },
  "privacy.ca.browser_readiness_not_evident": {
    claimType: "readiness_not_evident",
    defaultSeverity: "high",
    findingId: "privacy.ca.browser_readiness_not_evident",
    module: "California Browser Opt-Out Readiness",
    pillar: "Privacy & Consent",
    regulatoryMappings: [
      mapping("California", "California browser opt-out readiness", "ca_privacy.browser_signal_readiness")
    ],
    title: "Browser-level privacy signal readiness not evident"
  },
  "privacy.ca.preference_persistence_not_evident": {
    claimType: "observable_behavior",
    defaultSeverity: "medium",
    findingId: "privacy.ca.preference_persistence_not_evident",
    module: "California Browser Opt-Out Readiness",
    pillar: "Privacy & Consent",
    regulatoryMappings: [
      mapping("California", "California browser opt-out readiness", "ca_privacy.preference_persistence")
    ],
    title: "Privacy preference persistence not evident"
  },
  "privacy.ca.user_confirmation_not_evident": {
    claimType: "readiness_not_evident",
    defaultSeverity: "medium",
    findingId: "privacy.ca.user_confirmation_not_evident",
    module: "California Browser Opt-Out Readiness",
    pillar: "Privacy & Consent",
    regulatoryMappings: [
      mapping("California", "California browser opt-out readiness", "ca_privacy.user_confirmation")
    ],
    title: "User confirmation of received privacy preference not evident"
  }
};

export const REGULATORY_FINDING_IDS = Object.keys(REGULATORY_FINDING_DEFINITIONS) as LaunchFindingId[];
