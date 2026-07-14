import {
  CERT_SCORE_FINDING_REGISTRY,
  type CertScoreFindingDefinition,
  type CertScoreFindingSeverity
} from "../scans/finding-registry";
import {
  FINDING_DENSITY_BENCHMARKS,
  type FindingDensityBenchmark
} from "../scans/finding-density-benchmarks";
import { EXECUTIVE_SUMMARY_TOP_FINDING_IDS } from "../scans/rank-findings";
import {
  getSampleFindingById,
  type SampleFindingJson
} from "./sample-finding-json";
import {
  FINDING_REGULATORY_CONTEXTS,
  type FindingRegulatoryContext
} from "./finding-regulatory-context";

export type FindingReferenceCategory =
  | "Consent"
  | "Cookies"
  | "Third-party tracking"
  | "Accessibility"
  | "Fingerprinting"
  | "Disclosure gaps"
  | "Consumer protection";

export type FindingReferenceExample = {
  title: string;
  code: string;
};

// Pilot template: observed -> methodology -> examples -> regulatory context -> evidence standard -> review -> limitations.
// Keep evidence standards aligned to retained evidence and avoid legal conclusions.
export type FindingEvidenceStandard = {
  strong: string[];
  good: string[];
  auditOnly: string[];
  insufficient: string[];
};

export type FindingTopFindingRule = {
  minimumToSurface: string[];
  highConfidenceRequires: string[];
  criticalOrTopRankingRequires: string[];
  demoteOrSuppressWhen: string[];
};

export type FindingReferenceItem = {
  id: string;
  title: string;
  category: FindingReferenceCategory;
  runtimeSection: CertScoreFindingDefinition["section"];
  criticality: CertScoreFindingSeverity;
  confidenceSemantics: string;
  observed: string;
  detectionMethodology: string;
  evidenceStandard?: FindingEvidenceStandard;
  topFindingRule: FindingTopFindingRule;
  exampleEvidence: FindingReferenceExample[];
  commonCauses: string[];
  reviewQuestions: string[];
  relatedFindingIds: string[];
  benchmark: FindingDensityBenchmark;
  benchmarkBadge: string;
  limitations: string[];
  userImpact?: string;
  sample: SampleFindingJson;
  regulatoryContext?: FindingRegulatoryContext;
};

export const FINDING_REFERENCE_CATEGORIES: FindingReferenceCategory[] = [
  "Consent",
  "Cookies",
  "Third-party tracking",
  "Accessibility",
  "Fingerprinting",
  "Disclosure gaps",
  "Consumer protection"
];

export type DetectionMethodologySection = {
  id: string;
  title: string;
  categories: FindingReferenceCategory[];
  body: string;
  evidenceExamples: FindingReferenceExample[];
};

const TOP_FINDING_IDS = EXECUTIVE_SUMMARY_TOP_FINDING_IDS;
const PUBLIC_DEFERRED_FINDING_IDS = new Set<string>([
  "cpra_cba_opt_out_missing"
]);
const PUBLIC_DEFERRED_REGULATORY_CONTEXT_PATTERN =
  /CCPA|CPRA|California|CPPA|Do Not Sell|Do Not Share|sale\/share|sale or share|sale, sharing|selling\/sharing/i;

const ILLUSTRATIVE_PUBLIC_SAMPLE_FINDING_IDS = new Set<string>([
  "pre_consent_tracking_detected",
  "cpra_cba_opt_out_missing",
  "visual_contrast_accessibility_issue",
  "semantic_labeling_accessibility_issue",
  "text_alternative_accessibility_issue",
  "keyboard_navigation_accessibility_issue",
  "reject_option_missing_or_hidden",
  "forced_consent_interaction",
  "asymmetric_consent_ui",
  "consent_dark_patterns_detected",
  "third_party_cookie_pre_consent",
  "cookie_disclosure_gap",
  "long_lived_cookie_retention_review",
  "reject_tracking_persists_after_reject",
  "rtb_cookie_sync_observed",
  "cross_domain_identifier_sharing_observed",
  "session_recording_services_detected",
  "session_replay_present_with_sensitive_surfaces_observed",
  "possible_session_replay_on_sensitive_input_surface",
  "policy_behavior_contradiction_detected",
  "sensitive_data_collection_with_third_party_tracking_present",
  "focus_management_issue",
  "fingerprinting_related_signals_observed",
  "probable_fingerprinting"
]);

const SAMPLE_EVIDENCE_CONFIDENCE: Record<string, "strong" | "good" | "review_signal"> = {
  asymmetric_consent_ui: "good",
  consent_dark_patterns_detected: "good",
  cookie_disclosure_gap: "review_signal",
  cpra_cba_opt_out_missing: "review_signal",
  cross_domain_identifier_sharing_observed: "review_signal",
  fingerprinting_related_signals_observed: "review_signal",
  focus_management_issue: "good",
  forced_consent_interaction: "good",
  keyboard_navigation_accessibility_issue: "good",
  long_lived_cookie_retention_review: "strong",
  possible_session_replay_on_sensitive_input_surface: "review_signal",
  session_replay_present_with_sensitive_surfaces_observed: "review_signal",
  policy_behavior_contradiction_detected: "review_signal",
  pre_consent_tracking_detected: "strong",
  probable_fingerprinting: "review_signal",
  reject_option_missing_or_hidden: "good",
  reject_tracking_persists_after_reject: "good",
  rtb_cookie_sync_observed: "review_signal",
  semantic_labeling_accessibility_issue: "good",
  sensitive_data_collection_with_third_party_tracking_present: "review_signal",
  session_recording_services_detected: "review_signal",
  text_alternative_accessibility_issue: "good",
  third_party_cookie_pre_consent: "review_signal",
  visual_contrast_accessibility_issue: "good"
};

const SAMPLE_DIRECTNESS: Record<
  string,
  "direct_observation" | "correlated_observation" | "absence_observation" | "clustered_inference"
> = {
  asymmetric_consent_ui: "correlated_observation",
  consent_dark_patterns_detected: "correlated_observation",
  cookie_disclosure_gap: "correlated_observation",
  cpra_cba_opt_out_missing: "absence_observation",
  cross_domain_identifier_sharing_observed: "direct_observation",
  fingerprinting_related_signals_observed: "direct_observation",
  focus_management_issue: "direct_observation",
  forced_consent_interaction: "direct_observation",
  keyboard_navigation_accessibility_issue: "direct_observation",
  long_lived_cookie_retention_review: "direct_observation",
  possible_session_replay_on_sensitive_input_surface: "correlated_observation",
  session_replay_present_with_sensitive_surfaces_observed: "correlated_observation",
  policy_behavior_contradiction_detected: "correlated_observation",
  pre_consent_tracking_detected: "direct_observation",
  probable_fingerprinting: "clustered_inference",
  reject_option_missing_or_hidden: "absence_observation",
  reject_tracking_persists_after_reject: "direct_observation",
  rtb_cookie_sync_observed: "direct_observation",
  semantic_labeling_accessibility_issue: "direct_observation",
  sensitive_data_collection_with_third_party_tracking_present: "correlated_observation",
  session_recording_services_detected: "direct_observation",
  text_alternative_accessibility_issue: "direct_observation",
  third_party_cookie_pre_consent: "direct_observation",
  visual_contrast_accessibility_issue: "direct_observation"
};

const SEVERITY_BY_SECTION: Record<CertScoreFindingDefinition["section"], CertScoreFindingSeverity> = {
  Accessibility: "medium",
  "Consent Experience": "medium",
  "Cookies & Storage": "high",
  Fingerprinting: "high",
  "Financial & Claims": "medium",
  "Navigation & Redirects": "low",
  "Privacy & Tracking": "high",
  "Runtime & Diagnostics": "low",
  "Vendors & Requests": "high"
};

const SEVERITY_OVERRIDES: Record<string, CertScoreFindingSeverity> = {
  policy_behavior_contradiction_detected: "high",
  long_lived_cookie_retention_review: "high",
  possible_session_replay_on_sensitive_input_surface: "critical",
  session_replay_present_with_sensitive_surfaces_observed: "high",
  probable_fingerprinting: "critical",
  reject_tracking_persists_after_reject: "high",
  pre_consent_tracking_detected: "high",
  third_party_cookie_pre_consent: "high"
};

const CATEGORY_BY_FINDING_ID: Record<string, FindingReferenceCategory> = {
  asymmetric_consent_ui: "Consent",
  consent_dark_patterns_detected: "Consumer protection",
  cookie_disclosure_gap: "Disclosure gaps",
  cpra_cba_opt_out_missing: "Disclosure gaps",
  cross_domain_identifier_sharing_observed: "Third-party tracking",
  fingerprinting_related_signals_observed: "Fingerprinting",
  focus_management_issue: "Accessibility",
  forced_consent_interaction: "Consent",
  keyboard_navigation_accessibility_issue: "Accessibility",
  long_lived_cookie_retention_review: "Cookies",
  possible_session_replay_on_sensitive_input_surface: "Third-party tracking",
  session_replay_present_with_sensitive_surfaces_observed: "Third-party tracking",
  policy_behavior_contradiction_detected: "Consumer protection",
  pre_consent_tracking_detected: "Consent",
  probable_fingerprinting: "Fingerprinting",
  reject_option_missing_or_hidden: "Consent",
  reject_tracking_persists_after_reject: "Consent",
  rtb_cookie_sync_observed: "Third-party tracking",
  semantic_labeling_accessibility_issue: "Accessibility",
  sensitive_data_collection_with_third_party_tracking_present: "Third-party tracking",
  session_recording_services_detected: "Third-party tracking",
  text_alternative_accessibility_issue: "Accessibility",
  third_party_cookie_pre_consent: "Cookies",
  visual_contrast_accessibility_issue: "Accessibility"
};

const PUBLIC_TITLE_OVERRIDES: Record<string, string> = {
  cpra_cba_opt_out_missing: "CPRA / privacy choice opt-out review signal",
  cross_domain_identifier_sharing_observed: "Identifier-like values observed across domains",
  cookie_disclosure_gap: "Cookie disclosure gap",
  fingerprinting_related_signals_observed: "Fingerprinting-related browser/device signals observed",
  long_lived_cookie_retention_review: "Long-lived cookie retention review",
  possible_session_replay_on_sensitive_input_surface: "Possible session replay near sensitive input surface",
  session_replay_present_with_sensitive_surfaces_observed: "Session replay observed with sensitive input surfaces",
  policy_behavior_contradiction_detected: "Policy/runtime alignment review",
  probable_fingerprinting: "Probable browser/device fingerprinting review signal",
  sensitive_data_collection_with_third_party_tracking_present: "Sensitive input surface with third-party tracking context",
  session_recording_services_detected: "Session replay service signal observed",
  forced_consent_interaction: "Consent prompt appeared to require interaction",
  reject_option_missing_or_hidden: "Reject/refusal option not observed or nested",
  rtb_cookie_sync_observed: "Adtech identity sync-like request observed",
  third_party_cookie_pre_consent: "Third-party cookie or storage observed before consent"
};

function sanitizePublicRegulatoryContext(
  context: FindingRegulatoryContext | undefined
): FindingRegulatoryContext | undefined {
  if (!context || PUBLIC_DEFERRED_REGULATORY_CONTEXT_PATTERN.test(context.label)) {
    return undefined;
  }

  const technicalStandards = context.technicalStandards.filter((item) =>
    !PUBLIC_DEFERRED_REGULATORY_CONTEXT_PATTERN.test(`${item.id} ${item.label} ${item.appliesWhen} ${item.sourceRefs.join(" ")}`)
  );
  const jurisdictionalContexts = context.jurisdictionalContexts.filter((item) =>
    !PUBLIC_DEFERRED_REGULATORY_CONTEXT_PATTERN.test(`${item.id} ${item.label} ${item.appliesWhen} ${item.sourceRefs.join(" ")}`)
  );
  const sanitizeCopy = (value: string) => value
    .replace(/,?\s*sale\/share status/gi, "")
    .replace(/,?\s*sale\/share/gi, "")
    .replace(/,?\s*selling\/sharing status/gi, "")
    .replace(/,?\s*Do Not Sell\/Share status/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    ...context,
    displayCaution: sanitizeCopy(context.displayCaution),
    primaryConcern: {
      ...context.primaryConcern,
      displayCopy: sanitizeCopy(context.primaryConcern.displayCopy)
    },
    technicalStandards,
    jurisdictionalContexts
  };
}

const RELATED_FINDINGS: Record<string, string[]> = {
  asymmetric_consent_ui: ["reject_option_missing_or_hidden", "forced_consent_interaction", "consent_dark_patterns_detected"],
  consent_dark_patterns_detected: ["asymmetric_consent_ui", "reject_option_missing_or_hidden", "forced_consent_interaction"],
  cookie_disclosure_gap: ["third_party_cookie_pre_consent", "pre_consent_tracking_detected", "cpra_cba_opt_out_missing"],
  cpra_cba_opt_out_missing: ["cookie_disclosure_gap", "cross_domain_identifier_sharing_observed", "rtb_cookie_sync_observed"],
  cross_domain_identifier_sharing_observed: ["rtb_cookie_sync_observed", "pre_consent_tracking_detected", "cpra_cba_opt_out_missing"],
  fingerprinting_related_signals_observed: ["probable_fingerprinting", "pre_consent_tracking_detected", "cross_domain_identifier_sharing_observed"],
  focus_management_issue: ["keyboard_navigation_accessibility_issue", "semantic_labeling_accessibility_issue", "forced_consent_interaction"],
  forced_consent_interaction: ["reject_option_missing_or_hidden", "asymmetric_consent_ui", "consent_dark_patterns_detected"],
  keyboard_navigation_accessibility_issue: ["semantic_labeling_accessibility_issue", "visual_contrast_accessibility_issue"],
  long_lived_cookie_retention_review: ["cookie_disclosure_gap", "third_party_cookie_pre_consent", "pre_consent_tracking_detected"],
  possible_session_replay_on_sensitive_input_surface: [
    "session_replay_present_with_sensitive_surfaces_observed",
    "session_recording_services_detected",
    "sensitive_data_collection_with_third_party_tracking_present"
  ],
  session_replay_present_with_sensitive_surfaces_observed: [
    "possible_session_replay_on_sensitive_input_surface",
    "session_recording_services_detected",
    "sensitive_data_collection_with_third_party_tracking_present"
  ],
  policy_behavior_contradiction_detected: [
    "pre_consent_tracking_detected",
    "third_party_cookie_pre_consent",
    "cookie_disclosure_gap"
  ],
  pre_consent_tracking_detected: ["third_party_cookie_pre_consent", "cookie_disclosure_gap", "rtb_cookie_sync_observed"],
  probable_fingerprinting: ["fingerprinting_related_signals_observed", "cross_domain_identifier_sharing_observed", "rtb_cookie_sync_observed"],
  reject_option_missing_or_hidden: ["asymmetric_consent_ui", "forced_consent_interaction", "consent_dark_patterns_detected"],
  reject_tracking_persists_after_reject: ["pre_consent_tracking_detected", "third_party_cookie_pre_consent", "reject_option_missing_or_hidden"],
  rtb_cookie_sync_observed: ["cross_domain_identifier_sharing_observed", "pre_consent_tracking_detected", "cpra_cba_opt_out_missing"],
  semantic_labeling_accessibility_issue: ["keyboard_navigation_accessibility_issue", "text_alternative_accessibility_issue"],
  sensitive_data_collection_with_third_party_tracking_present: [
    "session_replay_present_with_sensitive_surfaces_observed",
    "possible_session_replay_on_sensitive_input_surface",
    "session_recording_services_detected",
    "pre_consent_tracking_detected"
  ],
  session_recording_services_detected: [
    "session_replay_present_with_sensitive_surfaces_observed",
    "possible_session_replay_on_sensitive_input_surface",
    "sensitive_data_collection_with_third_party_tracking_present",
    "pre_consent_tracking_detected"
  ],
  text_alternative_accessibility_issue: ["semantic_labeling_accessibility_issue", "visual_contrast_accessibility_issue"],
  third_party_cookie_pre_consent: ["pre_consent_tracking_detected", "cookie_disclosure_gap", "rtb_cookie_sync_observed"],
  visual_contrast_accessibility_issue: ["text_alternative_accessibility_issue", "semantic_labeling_accessibility_issue"]
};

export const FINDING_TOP_FINDING_RULES: Record<string, FindingTopFindingRule> = {
  pre_consent_tracking_detected: {
    minimumToSurface: ["Classified non-essential request or storage before observed consent."],
    highConfidenceRequires: ["Usable coverage.", "Purpose classification.", "Runtime anchor."],
    criticalOrTopRankingRequires: ["Advertising, replay, identifier-sync, or sensitive-surface context."],
    demoteOrSuppressWhen: ["Tag manager only.", "Strict necessity.", "Blocked scan.", "Unreliable timing."]
  },
  visual_contrast_accessibility_issue: {
    minimumToSurface: ["Automated contrast rule with selector, page, and WCAG reference."],
    highConfidenceRequires: ["Color pair or ratio.", "Element state.", "Meaningful visible content."],
    criticalOrTopRankingRequires: ["Repeated component.", "Critical user path.", "Control or focus indicator."],
    demoteOrSuppressWhen: ["Decorative, inactive, logo, or incidental context without manual review."]
  },
  semantic_labeling_accessibility_issue: {
    minimumToSurface: ["Automated label, name, or role rule with selector, page, and WCAG reference."],
    highConfidenceRequires: ["Visible-label context.", "Accessibility-name context.", "Role context."],
    criticalOrTopRankingRequires: ["Required or sensitive form field.", "Repeated component.", "Blocking control."],
    demoteOrSuppressWhen: ["Selector only.", "ARIA attribute only.", "No affected element."]
  },
  fingerprinting_related_signals_observed: {
    minimumToSurface: ["Retained high-entropy signal with script or request context."],
    highConfidenceRequires: ["Multiple categories or known signal script with runtime context."],
    criticalOrTopRankingRequires: ["Cluster plus identifier, cross-domain, or pre-consent context."],
    demoteOrSuppressWhen: ["Isolated common environment read.", "Vendor name only.", "Generic analytics."]
  },
  session_recording_services_detected: {
    minimumToSurface: ["Replay-related script, request, vendor, or endpoint artifact."],
    highConfidenceRequires: ["Endpoint or service classification plus page, timing, and vendor context."],
    criticalOrTopRankingRequires: ["Collection endpoint.", "Sensitive page.", "Pre-consent or post-reject timing.", "No masking or exclusion observed."],
    demoteOrSuppressWhen: ["Vendor name only.", "Generic analytics.", "Policy text only."]
  },
  third_party_cookie_pre_consent: {
    minimumToSurface: ["Third-party cookie or storage artifact before consent."],
    highConfidenceRequires: ["Domain or scope.", "Timing.", "Purpose or vendor classification."],
    criticalOrTopRankingRequires: ["Advertising, identity, sync, or persistent storage.", "Repeated pages."],
    demoteOrSuppressWhen: ["Request only.", "Cookie name only.", "Unknown timing.", "Blocked scan."]
  },
  cookie_disclosure_gap: {
    minimumToSurface: ["Runtime cookie/storage activity plus retained cookie-policy, CMP, or disclosure evidence that does not clearly reflect the observed cookie, vendor, or domain."],
    highConfidenceRequires: ["Cookie/domain/category evidence.", "Reached policy or cookie-disclosure surface.", "Clear mismatch rationale.", "Retained runtime-vendor disclosure evidence where the subtype is used.", "Consent-governance gaps remain supporting context unless corroborated by runtime consent evidence."],
    criticalOrTopRankingRequires: ["Advertising, analytics, identity, sync, persistent storage, or other promotion-grade runtime vendor/domain evidence with a disclosure alignment mismatch."],
    demoteOrSuppressWhen: ["Cookie count only.", "Policy page not reached.", "Blocked scan.", "Mismatch not tied to a retained runtime cookie artifact."]
  },
  long_lived_cookie_retention_review: {
    minimumToSurface: ["Concrete runtime cookie evidence with name, domain or host, page URL, classification, expiry or duration, and threshold basis."],
    highConfidenceRequires: ["Known tracking, advertising, marketing, or identity classification.", "Duration at or above the 365-day CertScore.ai review threshold.", "Vendor or source URL context."],
    criticalOrTopRankingRequires: ["Long-lived advertising, marketing, tracking, or identity cookie evidence, repeated long-lived adtech cookies, or a 730-day severe review threshold."],
    demoteOrSuppressWhen: ["Policy text only.", "Cookie count only.", "Missing duration or page attribution.", "Essential/session cookies only.", "Same cookie evidence already supports a stronger consent-timing finding."]
  },
  rtb_cookie_sync_observed: {
    minimumToSurface: ["Sync, match, adtech identity-like request, or redirect."],
    highConfidenceRequires: ["Origin or path.", "Vendor/category.", "Identifier-like keys.", "Redaction."],
    criticalOrTopRankingRequires: ["Multi-hop redirect.", "Repeated sync endpoints.", "Pre-consent timing.", "Cross-domain identifier sharing."],
    demoteOrSuppressWhen: ["Generic ad script.", "Ad impression.", "Vendor name only."]
  },
  text_alternative_accessibility_issue: {
    minimumToSurface: ["Automated alt/text alternative rule with selector, page, and WCAG reference."],
    highConfidenceRequires: ["Element purpose context.", "Accessible-name context."],
    criticalOrTopRankingRequires: ["Functional control.", "Important chart or graphic.", "Repeated CMS/template issue."],
    demoteOrSuppressWhen: ["Decorative, redundant, or logo context without manual review."]
  },
  consent_dark_patterns_detected: {
    minimumToSurface: ["Concrete consent-surface choice architecture signal, or retained consent-control lifecycle evidence showing no obvious preference-revisit control in sufficient scan coverage."],
    highConfidenceRequires: ["Two or more retained choice-architecture signals, or retained pages checked, footer/preferences surfaces inspected, and consent/tracking context for the revisit-control subtype.", "Consent preference-management explanation gaps are supporting disclosure context, not standalone top-card evidence."],
    criticalOrTopRankingRequires: ["Forced interaction plus missing/nested reject or repeated prompt. The revisit-control subtype remains Medium by default unless existing severity calibration supports escalation."],
    demoteOrSuppressWhen: ["CMP name only.", "Banner presence only.", "Unrelated modal.", "Prior consent state may have hidden controls.", "Blocked or shallow preference-control coverage."]
  },
  cpra_cba_opt_out_missing: {
    minimumToSurface: [
      "Advertising, cross-context behavioral advertising, or sale/share review signal plus retained public-surface search with no opt-out path observed."
    ],
    highConfidenceRequires: ["Footer, policy, CMP, state-rights, and preference-center coverage."],
    criticalOrTopRankingRequires: [
      "GPC scan state sent plus likely cross-context behavioral advertising or sale/share context plus no handling/path."
    ],
    demoteOrSuppressWhen: ["Adtech vendor only.", "No link coverage.", "No policy coverage.", "No region/context."]
  },
  forced_consent_interaction: {
    minimumToSurface: ["Consent UI artifact plus blocking or interruption signal."],
    highConfidenceRequires: ["Scroll/content/focus blocking plus visible controls and unrelated interruptions excluded."],
    criticalOrTopRankingRequires: ["Full blocking with no equivalent non-accept path."],
    demoteOrSuppressWhen: ["Generic modal.", "Paywall.", "Bot challenge.", "Age gate.", "Login wall."]
  },
  reject_option_missing_or_hidden: {
    minimumToSurface: ["Accept visible plus reject/refusal not observed or nested."],
    highConfidenceRequires: ["Visible controls retained plus preference path inspected."],
    criticalOrTopRankingRequires: ["Accept one step and reject unavailable or materially harder."],
    demoteOrSuppressWhen: ["Labels not retained.", "Scan did not reach consent surface.", "Unrelated overlay."]
  },
  sensitive_data_collection_with_third_party_tracking_present: {
    minimumToSurface: ["Retained sensitive surface plus retained third-party tracking on same page or flow."],
    highConfidenceRequires: ["Field/surface context plus vendor category, timing, and coverage."],
    criticalOrTopRankingRequires: ["Sensitive page plus advertising, replay, or measurement plus consent concern or event-capture signal."],
    demoteOrSuppressWhen: ["Sensitive field alone.", "Vendor elsewhere on site.", "No same-surface runtime artifact."]
  },
  asymmetric_consent_ui: {
    minimumToSurface: ["Retained accept/refusal relationship."],
    highConfidenceRequires: ["Step count, layer, and labels retained."],
    criticalOrTopRankingRequires: ["Materially higher refusal effort plus visual hierarchy imbalance."],
    demoteOrSuppressWhen: ["Button color alone.", "Accept button alone.", "No refusal path context."]
  },
  keyboard_navigation_accessibility_issue: {
    minimumToSurface: ["Automated keyboard/focus rule with selector, page, and WCAG reference."],
    highConfidenceRequires: ["Keyboard path, focus, and interaction state context."],
    criticalOrTopRankingRequires: ["Trap.", "Primary navigation blocked.", "Form submit blocked.", "Repeated component."],
    demoteOrSuppressWhen: ["Selector only.", "Inactive, hidden, or decorative element."]
  },
  focus_management_issue: {
    minimumToSurface: ["Automated focus-management or keyboard-focus evidence with selector, page, and interaction context."],
    highConfidenceRequires: ["Open/close or dynamic-state context.", "Focus target or trap context.", "Affected component role."],
    criticalOrTopRankingRequires: ["Modal, overlay, consent prompt, checkout, login, or primary navigation flow impact."],
    demoteOrSuppressWhen: ["Generic focus style issue.", "Selector only.", "No dynamic interaction state.", "Decorative or hidden element."]
  },
  cross_domain_identifier_sharing_observed: {
    minimumToSurface: ["Identifier-like key/value pattern in outbound cross-domain request."],
    highConfidenceRequires: ["Source/destination plus redacted key and vendor/category."],
    criticalOrTopRankingRequires: ["Persistent or scoped identifier to adtech/identity destination or pre-consent/post-reject timing."],
    demoteOrSuppressWhen: ["Generic query key.", "Destination unknown.", "Unredacted identifiers."]
  },
  reject_tracking_persists_after_reject: {
    minimumToSurface: ["Reject interaction plus post-reject classified non-essential request or storage."],
    highConfidenceRequires: ["Reject success, pre/post sequence, and artifact classification."],
    criticalOrTopRankingRequires: ["Post-reject advertising, replay, identifier sync, or repeated post-reject artifacts."],
    demoteOrSuppressWhen: ["Reject button present but not clicked.", "Unknown essentiality.", "Queued pre-reject beacon likely."]
  },
  possible_session_replay_on_sensitive_input_surface: {
    minimumToSurface: ["Replay signal plus sensitive surface in same observed scope."],
    highConfidenceRequires: ["Replay collection endpoint or strong replay runtime signal plus sensitive field/page context."],
    criticalOrTopRankingRequires: ["Collection endpoint plus sensitive form plus no masking/exclusion observed or consent concern."],
    demoteOrSuppressWhen: ["Replay library only.", "Global script only.", "Sensitive field not same page/flow.", "Masking or page exclusion observed."]
  },
  policy_behavior_contradiction_detected: {
    minimumToSurface: ["A retained policy/disclosure anchor plus concrete runtime behavior anchor and explicit bridge provenance, or retained runtime-vendor disclosure mismatch evidence under the alignment subtype."],
    highConfidenceRequires: ["Policy source URL, policy snippet or reached disclosure surface, runtime request/storage/vendor anchor, and deterministic bridge rationale.", "Consent governance disclosure gaps are supporting alignment context unless an existing policy/runtime finding passes its normal gates."],
    criticalOrTopRankingRequires: ["Pre-consent, post-reject, cookie, sharing, sensitive-surface, or promotion-grade runtime vendor/domain behavior with retained disclosure alignment evidence."],
    demoteOrSuppressWhen: ["Policy claim only.", "Runtime behavior only.", "Missing bridge provenance.", "Generic contradiction copy without concrete anchors.", "Same vendor/domain evidence already supports a stronger direct runtime finding."]
  },
  probable_fingerprinting: {
    minimumToSurface: ["Multi-signal high-entropy cluster."],
    highConfidenceRequires: ["Cluster plus script/request and tier/context."],
    criticalOrTopRankingRequires: ["Cluster plus identifier, cross-domain, pre-consent, or adtech context."],
    demoteOrSuppressWhen: ["Single common attribute.", "Vendor name only.", "Security script without retained cluster."]
  }
};

const DEFAULT_TOP_FINDING_RULE: FindingTopFindingRule = {
  minimumToSurface: ["Retained evidence supports the finding through the canonical concern/policy/unified-finding pipeline."],
  highConfidenceRequires: ["Corroborated retained evidence and usable coverage."],
  criticalOrTopRankingRequires: ["Stronger directness, corroboration, affected surface, and review relevance."],
  demoteOrSuppressWhen: ["Evidence is ambiguous, unsupported, blocked, or audit-only."]
};

const OBSERVED: Record<string, string> = {
  visual_contrast_accessibility_issue:
    "Retained automated accessibility evidence showed text or controls with contrast-related signals that may fall below the applicable automated threshold for the detected element and state.",
  pre_consent_tracking_detected:
    "Runtime evidence showed a classified non-essential tracking, analytics, advertising, cross-site measurement, or storage signal before CertScore.ai observed a consent action or a prior consent state associated with that purpose.",
  semantic_labeling_accessibility_issue:
    "Retained automated accessibility evidence showed controls, links, form fields, regions, headings, or ARIA attributes with label, accessible-name, role, relationship, or name/role/value signals that may require semantic accessibility review.",
  fingerprinting_related_signals_observed:
    "Retained runtime evidence showed browser, device, canvas, storage, or other high-entropy environment signals that may be relevant to fingerprinting review, without enough retained context to treat the cluster as probable fingerprinting.",
  session_recording_services_detected:
    "Retained runtime evidence showed a script, request, or vendor pattern associated with session replay, heatmaps, recording, or behavior analytics in the observed public-page scope.",
  third_party_cookie_pre_consent:
    "Retained runtime evidence showed a third-party cookie or storage artifact observed before CertScore.ai recorded a consent action or a prior consent state associated with that purpose.",
  cookie_disclosure_gap:
    "Retained runtime and public-surface evidence showed observed cookie, storage, vendor, or domain activity that was not clearly reflected in retained cookie-policy, CMP, or cookie-disclosure evidence in the scanned scope.",
  long_lived_cookie_retention_review:
    "Retained runtime cookie evidence showed persistent tracking, advertising, analytics, identity, or unclassified cookies whose observed expiry or computed duration met CertScore.ai retention review thresholds: 365 days or longer for main review, or 180-364 days for source-attributed or multiple tracking-cookie review context.",
  rtb_cookie_sync_observed:
    "Retained network evidence showed adtech, RTB, sync, match, redirect, or identifier-like request patterns that may be relevant to cookie/tracker, advertising, consent, transparency, sale/share, and vendor-governance review.",
  text_alternative_accessibility_issue:
    "Retained automated accessibility evidence showed non-text content, images, SVGs, icons, or media-related elements with text-alternative signals that may require accessibility review.",
  consent_dark_patterns_detected:
    "Retained consent-surface evidence showed choice-architecture signals, such as control availability, path depth, visual hierarchy, forced interaction, or repeated prompting, that may require consent UX or consumer-protection review.",
  cpra_cba_opt_out_missing:
    "Retained public-surface and runtime evidence showed advertising, cross-context behavioral advertising, or sale/share-related review signals without a clearly observed California privacy choice, Do Not Sell or Share, opt-out, or comparable privacy-choice path in the observed scan scope.",
  forced_consent_interaction:
    "Retained consent-surface evidence showed a consent prompt, overlay, or interaction state that appeared to block ordinary page access or require interaction before the scan could continue within the observed public-page scope.",
  reject_option_missing_or_hidden:
    "Retained consent-surface evidence showed that a reject, decline, or equivalent refusal control was not observed on the initial consent layer, or appeared less directly available than the accept path within the observed scan scope.",
  sensitive_data_collection_with_third_party_tracking_present:
    "Retained page and runtime evidence showed a sensitive-input or sensitive-context surface alongside third-party tracking, analytics, advertising, replay, or measurement context in the observed scan scope.",
  asymmetric_consent_ui:
    "Retained consent-surface evidence showed accept and refusal choices that appeared visually, procedurally, or structurally imbalanced within the observed scan scope.",
  keyboard_navigation_accessibility_issue:
    "Retained automated accessibility evidence showed interactive elements, focus behavior, or keyboard-related signals that may require keyboard accessibility review.",
  focus_management_issue:
    "Retained automated accessibility evidence showed focus movement, modal, overlay, dynamic-view, or keyboard-focus signals that may require focus-management review.",
  cross_domain_identifier_sharing_observed:
    "Retained outbound request evidence showed identifier-like keys or values moving to a different domain or third-party context within the observed scan scope.",
  reject_tracking_persists_after_reject:
    "Retained runtime evidence showed a reject-style consent interaction followed by classified non-essential request or storage activity in the observed scan scope.",
  possible_session_replay_on_sensitive_input_surface:
    "Retained runtime and page-surface evidence showed session-replay-related signals on or near a form, flow, or page surface that may collect sensitive information.",
  session_replay_present_with_sensitive_surfaces_observed:
    "Retained runtime and page-surface evidence showed session-replay-related signals and sensitive input surfaces in the same observed scan scope, without retained same-page or same-flow replay linkage.",
  policy_behavior_contradiction_detected:
    "Retained report evidence connected a public policy or disclosure claim to concrete runtime behavior, showed runtime third-party vendors/domains not clearly reflected in retained disclosure evidence, or retained consent-governance disclosure context as a supporting alignment review signal.",
  probable_fingerprinting:
    "Retained runtime evidence showed a clustered high-entropy browser/device signal pattern that may warrant probable fingerprinting review."
};

const METHODOLOGY: Record<string, string> = {
  visual_contrast_accessibility_issue:
    "CertScore.ai retains representative automated accessibility evidence for contrast-related checks, including the rule identifier, affected selector or element reference, page URL, impact label when available, and WCAG-oriented references. The finding is surfaced when retained evidence indicates that text, controls, or meaningful visual elements may fall below the applicable automated contrast threshold for the observed state. CertScore.ai treats automated contrast results as review signals. The scanner does not infer full WCAG conformance or non-conformance from a single automated rule result. Reviewers should consider text size, font weight, element purpose, component state, decorative or inactive status, surrounding context, responsive breakpoint, and whether the retained evidence reflects the affected user-visible state.",
  pre_consent_tracking_detected:
    "CertScore.ai records a timestamped runtime sequence for the page load, including page start, consent-surface observations, detected consent state, user-choice events when observed, network requests, cookie and storage activity, vendor attribution, and scan coverage signals. This finding is surfaced when retained runtime evidence shows at least one classified non-essential request or storage artifact, including vendor attribution where available, before CertScore.ai observed a consent action or a prior consent state associated with that purpose. CertScore.ai does not infer this finding from the mere presence of a consent banner, CMP script, tag manager, privacy policy language, static source reference, or vendor name alone. Vendor purpose, necessity, consent state, region targeting, exemptions, and coverage reliability should be reviewed before drawing conclusions.",
  semantic_labeling_accessibility_issue:
    "CertScore.ai retains representative automated accessibility evidence for semantic labeling and name/role/value checks, including the rule identifier, affected selector or element reference, page URL, impact label when available, and WCAG-oriented references. The finding is surfaced when retained evidence indicates that a control, link, form field, region, heading, ARIA attribute, or interactive element may have missing, ambiguous, invalid, or mismatched programmatic semantics. CertScore.ai treats automated semantic-labeling results as review signals. The scanner does not infer full WCAG conformance or non-conformance from a single automated rule result. Reviewers should consider visible label text, accessible name computation, role, state, value, instructions, grouping, ARIA validity, component behavior, and whether the retained evidence reflects the user-visible and assistive-technology-relevant context.",
  fingerprinting_related_signals_observed:
    "CertScore.ai inspects retained runtime evidence for browser, device, canvas, audio, storage, font, plugin, screen, locale, timing, and other high-entropy environment signals where available. The finding is surfaced when retained evidence indicates one or more fingerprinting-related or device-signal observations, but the retained cluster is not strong enough for probable fingerprinting. CertScore.ai treats fingerprinting-related results as review signals. The scanner does not determine personal identity, identity resolution, persistent fingerprint creation, user singling-out, legal status, consent validity, or compliance status. Reviewers should consider purpose, entropy, signal count, vendor role, consent state, security or fraud-prevention context, downstream use, and whether retained evidence distinguishes functional device checks from tracking or profiling uses.",
  session_recording_services_detected:
    "CertScore.ai inspects retained network, script-host, request, vendor, and category evidence for session replay, heatmap, recording, and behavior-analytics patterns. The finding is surfaced when retained runtime evidence includes a script, request, endpoint, or vendor pattern associated with replay-style tooling in the observed public-page scope. CertScore.ai treats session-replay service evidence as a review signal. The scanner does not determine that keystrokes, sensitive values, full recordings, or user communications were captured or retained. Reviewers should consider vendor configuration, masking, sampling, consent state, page-level exclusions, sensitive surfaces, payload evidence, and whether the retained artifact reflects active replay collection or only library availability.",
  third_party_cookie_pre_consent:
    "CertScore.ai records timestamped page-load, consent-state, cookie, storage, request, vendor, and coverage observations where available. This finding is surfaced when retained runtime evidence shows a third-party cookie or storage artifact before CertScore.ai observed a consent action or a prior consent state associated with that purpose. CertScore.ai treats third-party cookie-before-consent evidence as a review signal. The scanner does not determine legal status, consent validity, necessity, exemption status, or compliance status. Reviewers should consider cookie domain and scope, first-seen timestamp, purpose classification, whether the storage is strictly necessary or exempt, consent state, region, returning-user state, CMP configuration, and scan coverage reliability.",
  cookie_disclosure_gap:
    "CertScore.ai compares retained runtime cookie/storage observations with retained public cookie-policy, privacy-policy, CMP, preference-center, and disclosure evidence where available. This finding is surfaced when observed cookie activity is not clearly covered by the retained disclosure evidence, such as missing provider, purpose, category, or cookie-family coverage. Supporting consent-governance disclosure context may note whether retained public materials clearly explain how consent choices can be changed, withdrawn, retained, renewed, or managed when runtime consent relevance is present. CertScore.ai treats cookie-disclosure gaps as review signals. The scanner does not determine legal adequacy, completeness, applicability, or compliance status. Reviewers should consider cookie purpose, provider ownership, retention, policy version, regional disclosure variants, CMP cookie tables, and whether coverage limitations prevented CertScore.ai from reaching the relevant disclosure surface.",
  long_lived_cookie_retention_review:
    "CertScore.ai consumes retained runtime cookie evidence from the canonical scan pipeline, including cookie name, domain or host, page URL, classification, expiry timestamp, Max-Age, or computed duration, and a threshold basis. This finding is surfaced when concrete runtime evidence shows tracking, advertising, marketing, analytics, identity, or unknown/unclassified cookies meeting CertScore.ai retention review thresholds: 365 days or longer for main review, or 180-364 days for source-attributed or multiple tracking-cookie review context. These are CertScore.ai product review thresholds, not statutory thresholds, and GDPR does not set a universal numeric cookie-lifetime limit. CertScore.ai treats this as a retention, minimization, consent, opt-out, and disclosure review signal, not legal advice, certification, or a compliance determination. Reviewers should confirm purpose, vendor, necessity, consent phase, retention disclosures, opt-out behavior, and whether unknown cookies should be classified.",
  rtb_cookie_sync_observed:
    "CertScore.ai inspects retained network evidence for adtech, exchange, sync, match, redirect, and identifier-like request patterns, including request origin/path, classified vendor/category, redirect or sync context where available, identifier-like query keys with values redacted, and scan coverage context. This finding is surfaced when retained evidence shows a request or redirect pattern consistent with RTB, adtech sync, user match, or identity sync-like behavior in the observed scan scope. CertScore.ai treats adtech identity sync-like evidence as a review signal. The scanner does not infer confirmed cookie syncing, a complete identity graph, personal identity, legal status, consent validity, or compliance status. Reviewers should consider endpoint purpose, vendor role, identifier scope, consent timing, redirects, jurisdiction, server-side behavior not visible to the browser, and whether the retained request pattern is sufficient for the intended review.",
  text_alternative_accessibility_issue:
    "CertScore.ai retains representative automated accessibility evidence for text-alternative checks, including the rule identifier, affected selector or element reference, page URL, impact label when available, and WCAG-oriented references. The finding is surfaced when retained evidence indicates that non-text content, images, SVGs, icons, controls, or media-related elements may lack an appropriate text alternative or may require review to determine whether the content is informative, functional, decorative, redundant, or exempt. CertScore.ai treats automated text-alternative results as review signals. The scanner does not infer full WCAG conformance or non-conformance from a single automated rule result. Reviewers should consider the element purpose, surrounding text, whether the content is decorative or informative, whether an icon acts as a control, whether an image contains text, and whether the retained evidence reflects the user-visible and assistive-technology-relevant context.",
  consent_dark_patterns_detected:
    "CertScore.ai retains representative consent-surface evidence for visible controls, button labels, path depth, first-layer availability, hierarchy cues, overlays, repeated prompts, preference paths, public preference-management explanation, and scan coverage context where available. The finding is surfaced when retained evidence indicates a cluster of consent choice-architecture signals that may affect how users encounter, compare, accept, reject, or revisit privacy choices in the observed scan scope. Supporting consent-governance disclosure context may note whether retained public materials clearly explain how choices can be changed, withdrawn, retained, renewed, or managed when runtime consent relevance is present. CertScore.ai treats consent choice-architecture results as review signals. The scanner does not determine that dark-pattern status, deception, unfairness, consent validity, legal status, or compliance status occurred. Reviewers should consider jurisdiction, region, CMP configuration, prior consent state, user intent, accessibility, localization, repeated prompts, equivalent choice paths, public claims, and whether the retained evidence reflects the relevant user-facing consent surface.",
  cpra_cba_opt_out_missing:
    "CertScore.ai compares retained public-surface evidence for privacy links, footer links, policy language, state-specific rights references, Do Not Sell or Share wording, opt-out links, preference centers, and privacy-choice controls with retained runtime or page-surface signals that may be relevant to advertising, cross-context behavioral advertising, sale/share, tracking, or vendor-governance review. The finding is surfaced when retained evidence indicates relevant advertising or privacy-choice context, but a clear California privacy choice, Do Not Sell or Share, opt-out, or comparable choice path was not observed in the scanned public-page scope. CertScore.ai treats CPRA opt-out availability results as review signals. The scanner does not determine legal status, CPRA applicability, sale/share status, cross-context behavioral advertising status, opt-out failure, GPC handling, or compliance status. GPC handling is not determined unless a GPC-specific request state was sent and retained. Reviewers should consider organization scope, user region, purpose, vendor role, policy text, footer links, preference-center behavior, GPC-specific scan state, CMP configuration, exemptions, and whether the retained evidence reflects the relevant public user journey.",
  forced_consent_interaction:
    "CertScore.ai retains representative evidence for consent prompts, overlays, modal behavior, scroll blocking, visible controls, dismiss paths, and page-interaction state where available. The finding is surfaced when retained evidence indicates that the consent interface appeared to prevent ordinary page access, block scrolling or navigation, obscure primary content, or require interaction before the scan could proceed in the observed public-page scope. CertScore.ai treats required-interaction signals as review signals. The scanner does not determine whether consent was freely given, and does not determine legal status, deception, unfairness, consent validity, or compliance status. Reviewers should consider whether non-essential content was blocked, whether a reject or continue-without-accepting path exists, whether blocking is necessary for the service, whether accessibility is affected, and whether the retained evidence reflects the relevant region, viewport, browser state, and CMP configuration.",
  reject_option_missing_or_hidden:
    "CertScore.ai retains representative consent-surface evidence for visible controls, button labels, link text, consent-layer structure, first-layer availability, preference or settings paths, and scan coverage context where available. The finding is surfaced when retained evidence indicates that an accept path was observed but a reject, decline, or equivalent refusal control was not observed on the same layer, was nested behind additional steps, or was materially less direct in the observed scan scope. CertScore.ai treats refusal-path availability signals as review signals. The scanner does not determine that a reject option does not exist in every region or layer, legal status, deception, unfairness, consent validity, or compliance status. Reviewers should consider region, CMP configuration, prior consent state, localization, viewport, accessibility, whether an equivalent refusal path exists, and whether the retained evidence reflects the relevant user-facing consent surface.",
  sensitive_data_collection_with_third_party_tracking_present:
    "CertScore.ai compares retained page-surface evidence for sensitive input fields, form context, page purpose, and semantic cues with retained runtime evidence for third-party tracking, analytics, advertising, replay, measurement, or vendor requests observed in the same scan scope. The finding is surfaced when a sensitive-input or sensitive-context surface appears alongside third-party tracking context. CertScore.ai treats this co-occurrence as a review signal. The scanner does not determine that sensitive field values were transmitted, captured, read, linked to a third party, or that GDPR Article 9 applies. Financial, identity, contact, location, employment, children, protected-class, or other high-risk context signals require manual review and are not automatically GDPR Article 9 special-category data. Reviewers should consider field purpose, form state, masking, event listeners, payload evidence, vendor category, consent state, page template reuse, and whether the retained evidence reflects the affected user-facing flow.",
  session_replay_present_with_sensitive_surfaces_observed:
    "CertScore.ai compares retained replay-related runtime evidence with retained page-surface evidence for sensitive input fields, form context, page purpose, and semantic cues in the same scan. The finding is surfaced when replay-related runtime context and sensitive-surface context are both retained, but the retained evidence does not need to show same-page or same-flow replay linkage. CertScore.ai treats this co-presence as a review signal. The scanner does not determine that sensitive field values, keystrokes, screenshots, recordings, or user communications were captured. Reviewers should consider vendor configuration, masking, sampling, page exclusions, consent state, payload evidence, field purpose, and whether the retained evidence reflects the affected user-facing flow.",
  asymmetric_consent_ui:
    "CertScore.ai retains representative consent-surface evidence for button labels, visible controls, first-layer availability, hierarchy cues, step counts, preference paths, and scan coverage context where available. The finding is surfaced when retained evidence indicates that accepting may be materially easier, more visually prominent, or more direct than refusing within the observed consent interface. CertScore.ai treats asymmetric consent UI signals as review signals. The scanner does not determine legal status, deception, unfairness, consent validity, compliance status, or dark-pattern status. Reviewers should consider equivalent choice paths, visual hierarchy, copy, localization, accessibility, viewport, region, CMP configuration, prior consent state, and whether the retained evidence reflects the relevant user-facing consent surface.",
  keyboard_navigation_accessibility_issue:
    "CertScore.ai retains representative automated accessibility evidence for keyboard-related checks, including the rule identifier, affected selector or element reference, page URL, impact label when available, and WCAG-oriented references. The finding is surfaced when retained evidence indicates that an interactive element, focus behavior, focus visibility, focus order, or custom control may require keyboard accessibility review. CertScore.ai treats automated keyboard-navigation results as review signals. The scanner does not infer full WCAG conformance or non-conformance from a single automated rule result. Reviewers should consider whether the element can receive focus, whether it can be operated by keyboard, whether focus is visible and ordered logically, whether custom controls expose expected semantics, and whether user-triggered states, modals, menus, carousels, or overlays were included in the scan scope.",
  focus_management_issue:
    "CertScore.ai retains representative automated accessibility evidence for focus movement, focus containment, focus restoration, dynamic views, modals, overlays, menus, consent prompts, and keyboard-focus behavior where available. The finding is surfaced when retained evidence indicates focus may move unpredictably, become trapped, fail to enter or leave an active region, or be obscured during an interaction state. CertScore.ai treats automated focus-management evidence as a review signal. The scanner does not infer full WCAG conformance or non-conformance from a single automated result. Reviewers should confirm keyboard-only operation, screen-reader context, modal lifecycle, focus restoration, visible focus, background inertness, and user-triggered states.",
  cross_domain_identifier_sharing_observed:
    "CertScore.ai inspects retained outbound request evidence for identifier-like keys, redacted values, destination domains, request origin/path, third-party context, vendor/category classification, timing, and consent context where available. This finding is surfaced when retained evidence shows identifier-like data in an outbound request to a different domain or third-party context within the observed scan scope. CertScore.ai treats cross-domain identifier-sharing evidence as a review signal. The scanner does not determine personal identity, identity resolution, legal status, consent validity, sale/share status, or compliance status. Reviewers should consider whether the value is pseudonymous, hashed, scoped, session-only, security-related, analytics-related, advertising-related, or otherwise necessary, and whether the retained evidence is sufficient for the intended review.",
  reject_tracking_persists_after_reject:
    "CertScore.ai records consent interaction events, consent-state observations, runtime requests, cookie/storage activity, vendor classification, and coverage context where available. This finding is surfaced when retained evidence shows a reject-style interaction followed by a classified non-essential request or storage artifact after that interaction within the observed scan scope. CertScore.ai treats post-reject tracking evidence as a review signal. The scanner does not determine legal status, consent validity, vendor responsibility, or compliance status. Reviewers should confirm the reject interaction succeeded, whether the activity began before or after the reject action, whether the post-reject artifact was non-essential, whether queued or delayed beacons explain the timing, and whether CMP, consent-mode, tag-manager, or vendor configuration affected the result.",
  possible_session_replay_on_sensitive_input_surface:
    "CertScore.ai correlates retained session-replay-related runtime evidence with retained page-surface evidence for sensitive input fields, sensitive form context, or sensitive page purpose. The finding is surfaced when replay-style tooling appears on or near a surface that may collect health, financial, identity, location, contact, or other sensitive information in the observed scan scope. CertScore.ai treats the co-occurrence as a review signal. The scanner does not determine that sensitive values, keystrokes, form contents, screenshots, recordings, or intercepted communications were captured, or that GDPR Article 9 applies. Financial, identity, contact, location, employment, children, protected-class, or other high-risk context signals require manual review and are not automatically GDPR Article 9 special-category data. Reviewers should confirm masking, sampling, page exclusions, payload contents, event capture, consent state, vendor configuration, and whether the retained evidence reflects the affected user-visible state.",
  probable_fingerprinting:
    "CertScore.ai clusters retained runtime evidence for high-entropy browser and device signals, including canvas or WebGL behavior, audio or media characteristics, storage probes, font or plugin signals, screen or locale attributes, script/request context, identifier-like context, and coverage signals where available. The finding is surfaced when retained evidence includes a stronger multi-signal cluster than a single generic device observation. CertScore.ai treats probable fingerprinting as a review signal, not proof of identity, identity resolution, persistent fingerprint creation, user singling-out, legal status, consent validity, or compliance status. A security, fraud-prevention, bot-detection, or abuse-prevention purpose may explain collection, but does not automatically exempt terminal-equipment access or personal-data processing from applicable review. Reviewers should consider purpose, necessity, security or fraud-prevention use, consent state, vendor role, whether identifiers are linked, and whether retained evidence is sufficient for the intended review."
};

const COMMON_CAUSES: Record<string, string[]> = {
  visual_contrast_accessibility_issue: [
    "Design tokens or theme variables produce low foreground/background contrast.",
    "Disabled, placeholder, muted, secondary, hover, focus, active, or error states reuse colors that fall below the relevant threshold.",
    "Text over images, gradients, video, or transparent overlays lacks a stable contrast-safe treatment.",
    "Icon-only controls, form borders, focus indicators, or graphical objects rely on subtle color differences.",
    "Component libraries or templates were updated without contrast regression checks across breakpoints and states."
  ],
  pre_consent_tracking_detected: ["Tag manager containers firing before consent mode is initialized", "Analytics or ad pixels loaded in the document head", "CMP events not connected to downstream vendor blocking"],
  semantic_labeling_accessibility_issue: [
    "Visible labels are not programmatically associated with form fields.",
    "Icon-only buttons, links, or controls lack a meaningful accessible name.",
    "ARIA attributes are missing, invalid, duplicated, or disconnected from the intended element.",
    "Custom components do not expose expected name, role, state, or value.",
    "Headings, landmarks, or grouped controls are visually clear but not semantically represented."
  ],
  fingerprinting_related_signals_observed: [
    "Security, fraud-prevention, or bot-detection scripts collect browser or device attributes.",
    "Analytics, experimentation, or personalization libraries read environment details.",
    "Canvas, WebGL, audio, storage, screen, locale, font, or plugin checks are used for compatibility, telemetry, or abuse prevention.",
    "Tag managers load identity, measurement, or anti-fraud scripts with device-signal capabilities.",
    "Vendor configuration collects more browser/device attributes than the page owner expects."
  ],
  session_recording_services_detected: [
    "Replay, heatmap, or behavior-analytics tooling is loaded globally through a tag manager.",
    "Session-replay libraries initialize before consent state or page exclusions are applied.",
    "Masking, sampling, or page-exclusion settings are configured only in the vendor dashboard and not verified against the public runtime.",
    "Marketing, support, or product-analytics templates reuse the same replay snippet across sensitive and non-sensitive pages.",
    "Vendor categorization treats replay tooling as generic analytics instead of a higher-review behavior telemetry service."
  ],
  third_party_cookie_pre_consent: [
    "Third-party scripts initialize before CMP consent state is applied.",
    "Advertising, measurement, or analytics tags set cookies on initial page load.",
    "Consent mode or tag-manager sequencing is configured after vendor scripts run.",
    "Server-side tags or redirects still cause browser storage before a choice is recorded.",
    "Returning-user or regional CMP state changes which cookies appear during the scan."
  ],
  cookie_disclosure_gap: [
    "Cookie policy tables are maintained separately from live tag-manager or CMP configuration.",
    "New analytics, advertising, replay, or measurement vendors were added without updating cookie disclosures.",
    "Cookie categories, providers, or retention periods differ between runtime behavior and policy copy.",
    "Regional cookie banners and global policy pages expose different provider lists.",
    "Runtime cookies are set by embedded third parties whose provider names are not reflected in the disclosure surface."
  ],
  long_lived_cookie_retention_review: [
    "Advertising, marketing, analytics, identity, or retargeting tags set default cookie expirations longer than the site team expects.",
    "Tag-manager templates preserve vendor defaults even after retention or minimization practices change.",
    "First-party analytics or identity cookies are not classified in the cookie inventory, making retention review harder.",
    "Cookie disclosures are updated separately from runtime vendor configuration, causing retention periods or criteria to drift.",
    "Legacy cookies remain configured with multi-year expirations after a vendor migration, consent-mode rollout, or CMP update."
  ],
  rtb_cookie_sync_observed: [
    "Programmatic advertising tags initialize on page load.",
    "Audience manager, DMP, identity, or ad exchange integrations perform user-match requests.",
    "Retargeting or measurement pixels redirect through sync or match endpoints.",
    "Header bidding or ad stack scripts trigger partner sync calls.",
    "Consent or regional configuration allows adtech endpoints before suppression is applied."
  ],
  text_alternative_accessibility_issue: [
    "CMS image fields allow publishing without required alternative text.",
    "Decorative images are not hidden from assistive technologies, or informative images are incorrectly marked decorative.",
    "Icon-only buttons or SVG controls lack an accessible name.",
    "Image components do not pass alt text or accessible labels through to rendered markup.",
    "Marketing images, charts, badges, logos, or images of text are added without equivalent text context."
  ],
  consent_dark_patterns_detected: [
    "CMP template makes acceptance more prominent or easier than refusal.",
    "Refusal is nested behind preference screens or unclear labels.",
    "Consent prompts reappear after dismissal or refusal.",
    "Overlays, scroll locks, or modal behavior require interaction before ordinary browsing.",
    "Region, localization, A/B test, or returning-user configuration changes the observed choice architecture."
  ],
  cpra_cba_opt_out_missing: [
    "Footer or privacy navigation lacks a state-specific privacy choice link.",
    "Do Not Sell or Share wording exists only inside a policy page and is not discoverable from common public surfaces.",
    "CMP or preference-center controls are not connected to California privacy-choice flows.",
    "Advertising or cross-context vendor tags are present, but state-specific rights links are not configured for the scanned region or viewport.",
    "GPC, opt-out, and cookie-preference flows are implemented separately and not consistently linked."
  ],
  forced_consent_interaction: [
    "CMP overlay template blocks page content until a choice is made.",
    "Scroll locking or modal behavior persists without a clear dismiss or reject path.",
    "Consent UI is bundled with unrelated newsletter, app-install, age-gate, or login prompts.",
    "Region, language, or A/B test configuration changes whether browsing is blocked.",
    "Accessibility or keyboard focus behavior was not tested for the consent modal."
  ],
  reject_option_missing_or_hidden: [
    "CMP template includes accept and preferences controls but no first-layer reject control.",
    "Reject is nested inside a preference center or secondary layer.",
    "Region, language, or A/B test configuration changes the consent controls.",
    "Button labels use ambiguous wording that may not clearly express refusal.",
    "Returning-user state or prior cookies suppress the full consent choice surface."
  ],
  sensitive_data_collection_with_third_party_tracking_present: [
    "Shared layouts load analytics, advertising, replay, or measurement tags on every page.",
    "Form pages inherit global marketing tags or tag-manager containers.",
    "Sensitive flows are built on the same templates as general marketing or lead-generation pages.",
    "Vendor suppression rules do not distinguish sensitive form pages from ordinary content pages.",
    "Event tracking, pixels, or analytics SDKs are added without page-level exclusions for sensitive-input contexts."
  ],
  asymmetric_consent_ui: [
    "CMP template styles accept as the primary button and refusal as a secondary or text link.",
    "Refusal requires opening preferences while acceptance is one click.",
    "Button labels, layout, or ordering make acceptance more prominent than refusal.",
    "Mobile or localized layouts differ from desktop/default-region behavior.",
    "Preference-center settings require multiple toggles or save steps before refusal is applied."
  ],
  keyboard_navigation_accessibility_issue: [
    "Custom controls are built with non-semantic elements without full keyboard behavior.",
    "Focus styles are removed, hidden, clipped, or too subtle.",
    "Menus, modals, overlays, carousels, or accordions do not manage focus predictably.",
    "Keyboard handlers support mouse clicks but not Enter, Space, Escape, or arrow-key behavior where expected.",
    "Responsive navigation or user-triggered states are not tested with keyboard-only workflows."
  ],
  focus_management_issue: [
    "Modal, menu, drawer, or consent-prompt components do not move focus into the active surface when opened.",
    "Focus is not restored to the triggering control when a dynamic view closes.",
    "Background page content remains reachable while an overlay is active.",
    "Keyboard focus is hidden, clipped, or obscured by sticky headers, dialogs, or transitions.",
    "Dynamic route changes, validation errors, or multi-step forms do not announce or focus the new context."
  ],
  cross_domain_identifier_sharing_observed: [
    "Analytics or advertising requests include client, session, campaign, or device identifiers.",
    "Attribution or measurement SDKs append persistent IDs to outbound requests.",
    "Identity, data platform, or tag-manager integrations pass pseudonymous IDs across domains.",
    "Redirect or pixel flows include identifier-like parameters.",
    "Consent, regional, or minimization settings do not suppress identifier-like parameters before transmission."
  ],
  reject_tracking_persists_after_reject: [
    "Reject event is not propagated from CMP to tag manager or vendor scripts.",
    "Previously loaded scripts continue sending queued or delayed beacons after reject.",
    "Consent mode is configured after vendor tags initialize.",
    "Cookies or storage are not cleared, suppressed, or scoped after rejection.",
    "Region, language, returning-user state, or CMP configuration changes reject behavior."
  ],
  possible_session_replay_on_sensitive_input_surface: [
    "Replay or behavior-analytics tooling is loaded on form pages or account, application, health, financial, or identity flows.",
    "Sensitive fields, helper text, error states, or typed input events may not be fully masked or excluded.",
    "Replay vendor settings are managed separately from CMP or tag-manager consent state.",
    "Page-level replay exclusions do not cover dynamic routes, multi-step forms, or responsive variants.",
    "Sensitive forms inherit global replay scripts from a shared template or tag container."
  ],
  session_replay_present_with_sensitive_surfaces_observed: [
    "Replay or behavior-analytics tooling is loaded globally through a shared tag manager or layout.",
    "Sensitive forms inherit sitewide replay scripts from general marketing, support, or product analytics templates.",
    "Replay vendor settings are managed separately from CMP or tag-manager consent state.",
    "Page-level replay exclusions do not cover all account, application, intake, payment, health, financial, or identity flows.",
    "Sensitive-surface routing or multi-step forms make same-page or same-flow linkage harder to retain in an automated public scan."
  ],
  probable_fingerprinting: [
    "Security or fraud SDKs collect multiple high-entropy attributes in the same page-load context.",
    "Adtech, identity, analytics, or measurement scripts combine device signals with identifiers or cross-domain request context.",
    "Canvas, WebGL, audio, storage, screen, locale, font, or plugin APIs are used together.",
    "Tag-manager sequencing loads fingerprinting-capable scripts before purpose, consent, or suppression rules are applied.",
    "Legacy vendor tags retain fingerprinting-style behavior after product or privacy requirements changed."
  ]
};

const REVIEW_QUESTIONS: Record<string, string[]> = {
  visual_contrast_accessibility_issue: [
    "Which selector, component, page, and visual state triggered the automated contrast evidence?",
    "Is the affected element normal text, large text, an icon-only control, a form border, a focus indicator, a graphical object, placeholder text, error text, inactive component, decorative content, incidental content, or logo/brand content?",
    "What foreground and background colors, design tokens, or CSS variables produced the contrast pair?",
    "Does the relevant threshold differ because the text is large, bold, inactive, incidental, decorative, or part of a logo/brand mark?",
    "Does the issue appear only in one instance, or is it repeated across templates, components, themes, or responsive breakpoints?",
    "Were hover, focus, active, disabled, placeholder, error, and dark/light mode states reviewed?",
    "Could text over an image, gradient, video, transparency, canvas, pseudo-element, or shadow DOM affect the real contrast seen by users?",
    "Does the proposed remediation preserve design intent while meeting the applicable contrast threshold?",
    "Should a manual accessibility review confirm context, user impact, exemptions, and remediation quality?"
  ],
  pre_consent_tracking_detected: [
    "What was the first concrete pre-consent signal: request, cookie write, or storage event?",
    "Did CertScore.ai observe an affirmative consent action before that signal?",
    "Did CertScore.ai observe a prior consent state associated with that purpose before that signal?",
    "Is the signal classified as advertising, behavioral analytics, cross-site measurement, retargeting, pixel tracking, session replay, identifier syncing, or another non-essential purpose?",
    "Is the signal merely a tag manager/container load, or does it include downstream classified non-essential activity?",
    "What stable runtime anchor supports the finding: request URL origin/path, initiator, resource type, cookie/storage key, timestamp, and vendor attribution where available?",
    "Was scan coverage reliable enough to trust the pre-consent event order?",
    "Are query strings, cookie values, and payloads redacted while preserving enough evidence for review?",
    "Could the observed activity be strictly necessary or qualify for a jurisdiction-specific analytics or storage exemption?"
  ],
  semantic_labeling_accessibility_issue: [
    "Which selector, component, page, and element type triggered the automated semantic-labeling evidence?",
    "Is the affected element a form field, button, link, landmark, heading, custom control, region, or ARIA relationship?",
    "Does the visible label match or support the accessible name?",
    "Is the label programmatically associated with the form field or control?",
    "Are instructions, required/error states, helper text, and grouping exposed in a way assistive technologies can understand?",
    "Are ARIA attributes valid, unique, and connected to existing elements?",
    "Does the component expose the expected name, role, state, and value across default, focus, error, disabled, expanded, collapsed, and selected states?",
    "Is the issue isolated, or repeated across a component library, form pattern, template, or design system?",
    "Should manual assistive-technology review confirm semantic intent, user impact, and remediation quality?"
  ],
  fingerprinting_related_signals_observed: [
    "Which browser, device, canvas, storage, audio, screen, locale, font, plugin, or environment signals were retained?",
    "Which script, request, vendor category, or runtime artifact supports the fingerprinting-related signal?",
    "Is the signal isolated, or repeated across pages, scripts, vendors, or attribute categories?",
    "Is the likely purpose security, fraud prevention, bot detection, analytics, personalization, advertising, measurement, or compatibility?",
    "Does retained evidence show identifier-like context, cross-domain sharing, cookie syncing, or only local device checks?",
    "Was the signal observed before consent, after consent, after reject, or outside known consent context?",
    "Can the high-entropy collection be minimized, purpose-limited, consent-gated, or excluded from non-essential contexts?",
    "Are query strings, identifiers, payloads, and raw attribute values redacted or avoided in public evidence?",
    "Should privacy, security, legal, and engineering teams manually confirm purpose, necessity, disclosure, consent state, and remediation quality?"
  ],
  session_recording_services_detected: [
    "Which script, request, endpoint, or vendor pattern triggered the replay or behavior-analytics signal?",
    "Was the retained artifact a replay library, collection endpoint, heatmap script, behavior-analytics vendor, or supporting tag-manager context?",
    "Did the signal appear before consent, after consent, after reject, or outside known consent context?",
    "Is replay active on the page, or is the evidence limited to library availability or a vendor script load?",
    "Are masking, sampling, field exclusions, and page-level exclusions configured and verified?",
    "Could the tool capture clicks, scrolls, forms, errors, DOM changes, screenshots, or typed input under certain settings?",
    "Does the behavior vary by region, browser state, page path, login state, or CMP configuration?",
    "Are query strings, payloads, session identifiers, and user-entered values redacted or avoided in retained/public evidence?",
    "Should privacy, security, legal, and product teams manually review vendor configuration and remediation quality?"
  ],
  third_party_cookie_pre_consent: [
    "Which cookie or storage key was observed, and what domain/scope set it?",
    "What was the first-seen timestamp relative to page start and consent-state observations?",
    "Did CertScore.ai observe a consent action or prior consent state associated with that purpose before the artifact appeared?",
    "Is the artifact third-party by domain/scope, related request context, or vendor attribution?",
    "Is the purpose analytics, advertising, measurement, identity, security, fraud prevention, load balancing, or something else?",
    "Could the storage be strictly necessary or covered by a jurisdiction-specific exemption?",
    "Was scan coverage reliable enough to trust the timing and consent-state order?",
    "Does the behavior vary by region, browser state, returning-user state, or CMP configuration?",
    "Are cookie values and query strings redacted while retaining enough anchors for review?"
  ],
  rtb_cookie_sync_observed: [
    "Which request origin/path or redirect endpoint supported the sync-like classification?",
    "Which vendor/category owns the endpoint?",
    "Which identifier-like query keys or redirect parameters were retained, and were values redacted?",
    "Is the request a sync/match/user-match pattern or a generic ad impression/script request?",
    "Did the sync-like request occur before consent, after consent, after reject, or outside known consent context?",
    "Was the redirect chain complete enough for review, or only partial?",
    "Could the endpoint serve non-identity purposes such as measurement, fraud prevention, or frequency capping?",
    "Does the behavior vary by region, viewport, page path, browser state, or CMP configuration?",
    "Are query strings, identifiers, cookie values, and payloads redacted while preserving stable anchors?"
  ],
  text_alternative_accessibility_issue: [
    "Which selector, component, page, and non-text element triggered the automated text-alternative evidence?",
    "Is the element informative, functional, decorative, redundant, a logo/brand mark, an icon-only control, an image of text, media content, or a chart/graphic?",
    "Does the element have an accessible name or text alternative that communicates the same purpose or information?",
    "Is nearby visible text already providing an equivalent alternative?",
    "If the element is decorative, is it correctly hidden from assistive technologies?",
    "If the element is functional, does the alternative text describe the action or purpose rather than the visual appearance?",
    "Are SVGs, icon fonts, CSS background images, lazy-loaded images, and responsive image variants handled consistently?",
    "Is the issue isolated, or repeated across CMS content, templates, components, icon systems, or marketing modules?",
    "Should manual assistive-technology review confirm context, alternative-text quality, user impact, and remediation quality?"
  ],
  consent_dark_patterns_detected: [
    "Which consent-surface signals were retained: missing reject, nested reject, forced interaction, visual hierarchy, repeated prompting, unclear labels, or path depth?",
    "Which layer, page, region, language, viewport, and browser state produced the observation?",
    "Are accept and refusal paths available, equivalent, and accessible?",
    "How many steps are required to accept, reject, or manage choices?",
    "Does the interface use labels, colors, ordering, repetition, or modal behavior that may affect user choice?",
    "Could the signal be caused by a paywall, bot challenge, age gate, login wall, newsletter prompt, or unrelated modal?",
    "Do results vary by region, localization, viewport, A/B test, prior consent state, or CMP configuration?",
    "Should privacy, legal, UX, and accessibility review confirm user impact, legal interpretation, and remediation quality?"
  ],
  cpra_cba_opt_out_missing: [
    "Which public page, footer, privacy link, policy page, or preference-center surface was retained?",
    "Which advertising, cross-context, sale/share, tracking, or vendor-governance signal made this relevant for review?",
    "Was a Do Not Sell or Share, Your Privacy Choices, state privacy rights, opt-out, or comparable link observed?",
    "Was the choice path discoverable from the footer, privacy policy, CMP, cookie settings, or preference center?",
    "Does the site process data in ways that could be sale/share or cross-context behavioral advertising under applicable context?",
    "Does the organization fall within CPRA scope, and do exemptions or thresholds apply?",
    "Was a GPC-specific request state sent and retained, or is GPC handling not determined by this scan?",
    "Could region, viewport, language, prior consent state, or CMP configuration affect whether the choice path appears?",
    "Should privacy and legal review confirm applicability, opt-out sufficiency, GPC handling, exemptions, and remediation quality?"
  ],
  forced_consent_interaction: [
    "What prompt, overlay, modal, or interaction state was retained?",
    "Did the observed surface block scrolling, obscure content, trap focus, or interrupt navigation?",
    "Was a reject, close, continue-without-accepting, or settings path available?",
    "Could the interruption be a bot challenge, paywall, age gate, login wall, newsletter prompt, or unrelated modal rather than a consent interaction?",
    "Was the blocking behavior observed before a consent choice or prior consent state?",
    "Does the behavior vary by region, language, viewport, browser state, or CMP configuration?",
    "Can keyboard and screen-reader users reach and operate all available controls?",
    "Should privacy and legal review confirm whether the observed interaction model is acceptable for the relevant jurisdiction and purpose?"
  ],
  reject_option_missing_or_hidden: [
    "Which consent layer, page, region, language, viewport, and browser state produced the observation?",
    "Was an accept path visible on the same layer?",
    "Was a reject, decline, continue-without-accepting, or equivalent refusal control visible?",
    "If reject was behind settings or preferences, how many steps were required?",
    "Are the accept and refusal choices equally available to keyboard and screen-reader users?",
    "Could a prior consent state, geotargeting, A/B test, localization, or returning-user state have changed the observed controls?",
    "Is the issue isolated to one template/page, or repeated across pages and viewports?",
    "Should privacy and legal review confirm whether the observed choice path is acceptable for the relevant jurisdiction and purpose?"
  ],
  long_lived_cookie_retention_review: [
    "Which cookie name, domain or host, page URL, classification, and retained expiry or duration support the review signal?",
    "Is the cookie advertising, marketing, tracking, analytics, identity, personalization, unknown, unclassified, essential, or session-only?",
    "What is the threshold basis, and does the evidence meet the 365-day CertScore.ai review threshold or the 730-day severe review threshold?",
    "Is the cookie first-party or third-party, and which vendor, source request URL, tag, or integration appears responsible?",
    "Does the public cookie or privacy disclosure explain the purpose, retention period, or retention criteria for the cookie family or vendor?",
    "Is the observed lifetime necessary for the stated purpose, or can expiration be shortened without affecting essential functionality?",
    "Does consent, reject, opt-out, or GPC behavior affect whether this cookie is set, retained, refreshed, or removed?",
    "Are unknown or unclassified cookies documented, classified, and owned by an implementation team?",
    "Does materially different long-lived cookie evidence remain after stronger pre-consent or post-reject findings use their own evidence?"
  ],
  sensitive_data_collection_with_third_party_tracking_present: [
    "Which page, form, field, or flow produced the sensitive-input or sensitive-context evidence?",
    "What made the surface sensitive: health, financial, identity, contact, location, employment, children, protected-class, or other context?",
    "Which third-party tracking, analytics, advertising, replay, measurement, or vendor context was observed on the same surface?",
    "Does retained evidence show only co-occurrence, or does it include request payloads, event names, or field-level transmission?",
    "Could the third-party activity be necessary, security-related, fraud-prevention, support, or otherwise context-dependent?",
    "Was the activity observed before consent, after consent, after reject, or outside known consent context?",
    "Does the behavior appear only on one page, or across a shared template, form component, or multi-step flow?",
    "Are field values, identifiers, payloads, query strings, screenshots, and raw DOM excluded or redacted from public evidence?",
    "Should manual review confirm data sensitivity, vendor purpose, payload contents, consent state, minimization, and remediation quality?"
  ],
  asymmetric_consent_ui: [
    "Which consent layer, page, region, language, viewport, and browser state produced the observation?",
    "What controls or paths were available for acceptance and refusal?",
    "Were accept and refusal options presented on the same layer?",
    "How many steps were needed to accept versus refuse?",
    "Did button size, color, order, wording, or visual hierarchy make one path more prominent?",
    "Were keyboard and screen-reader users offered comparable access to both choices?",
    "Could localization, A/B tests, geotargeting, CMP settings, or prior consent state affect the observed balance?",
    "Is the imbalance isolated to one viewport/template, or repeated across pages and regions?",
    "Should privacy and legal review confirm whether the observed choice architecture is acceptable for the relevant jurisdiction and purpose?"
  ],
  keyboard_navigation_accessibility_issue: [
    "Which selector, component, page, and interaction state triggered the keyboard-related evidence?",
    "Is the affected element a native control, custom control, menu, modal, overlay, carousel, form field, link, or focusable region?",
    "Can the element receive focus and be operated with the keyboard alone?",
    "Is focus visible, logical, and not obscured across default, hover, focus, active, expanded, collapsed, open, closed, and disabled states?",
    "Are expected keys supported, such as Tab, Shift+Tab, Enter, Space, Escape, and arrow keys where applicable?",
    "Does focus move predictably into and out of menus, modals, overlays, carousels, and dynamic content?",
    "Could there be a keyboard trap or unreachable control in user-triggered states not covered by the automated scan?",
    "Is the issue isolated, or repeated across components, templates, responsive navigation, menus, or modals?",
    "Should manual keyboard and assistive-technology review confirm operability, focus order, user impact, and remediation quality?"
  ],
  focus_management_issue: [
    "Which selector, component, page, and interaction state triggered the focus-management evidence?",
    "Is the affected surface a modal, overlay, menu, drawer, consent prompt, dynamic route change, validation message, or multi-step form?",
    "Where should focus move when the surface opens, updates, or closes?",
    "Is focus visible, logical, and not obscured across default, open, close, error, expanded, collapsed, and responsive states?",
    "Can keyboard users enter the active region, operate controls, and return to the triggering context?",
    "Is background page content removed from the tab order while modal or blocking content is active?",
    "Could focus become trapped, lost, skipped, or moved to an unexpected location?",
    "Is the issue isolated, or repeated across components, templates, dialogs, menus, consent surfaces, or responsive navigation?",
    "Should manual keyboard and assistive-technology review confirm focus lifecycle, announcements, user impact, and remediation quality?"
  ],
  cross_domain_identifier_sharing_observed: [
    "Which outbound request carried the identifier-like key or value?",
    "What was the source origin and destination origin?",
    "Which query keys or parameter names were retained, and were values redacted or hashed?",
    "Is the value likely session-scoped, client-scoped, device-scoped, campaign-scoped, hashed, pseudonymous, or otherwise limited?",
    "What vendor/category or endpoint purpose is associated with the destination?",
    "Did the request occur before consent, after consent, after reject, or outside known consent context?",
    "Could the value support analytics, attribution, fraud prevention, security, advertising, or another purpose?",
    "Is the behavior browser-visible only, or might relevant server-side sharing be outside scan scope?",
    "Are query strings, identifiers, cookie values, and payloads redacted while preserving stable anchors?"
  ],
  reject_tracking_persists_after_reject: [
    "Was a reject-style interaction actually observed and timestamped?",
    "Did the reject interaction appear successful, or is success ambiguous?",
    "Which request, cookie, or storage artifact appeared after reject?",
    "Was the post-reject artifact classified as non-essential, and what classification basis was retained?",
    "Could the post-reject artifact have been queued or initiated before reject?",
    "Was the activity strictly necessary, security-related, fraud-prevention, load-balancing, or otherwise exempt?",
    "Did consent state transition or CMP event propagation occur before the post-reject artifact?",
    "Was scan coverage reliable enough to trust the interaction and timing sequence?",
    "Are query strings, identifiers, cookie values, and payloads redacted while preserving stable anchors for review?"
  ],
  possible_session_replay_on_sensitive_input_surface: [
    "Which replay-related runtime artifact and which sensitive surface were retained?",
    "Is the affected surface a form, multi-step flow, account page, checkout, application, portal, health, financial, identity, or support page?",
    "Was replay collection active on the surface, or was the evidence limited to replay library or vendor presence?",
    "Could sensitive values, field labels, error states, helper text, screenshots, DOM mutations, or typed events be exposed under current vendor settings?",
    "Are sensitive fields, page sections, and dynamic states masked or excluded before collection?",
    "Did the replay signal occur before consent, after consent, after reject, or outside known consent context?",
    "Do page-level exclusions cover responsive variants, localized pages, authenticated states, and multi-step forms?",
    "Are payloads, identifiers, screenshots, raw DOM, and user-entered values excluded or redacted from public evidence?",
    "Should manual privacy, security, legal, and accessibility review confirm masking, consent posture, user impact, and remediation quality?"
  ],
  session_replay_present_with_sensitive_surfaces_observed: [
    "Which replay-related runtime artifact and which sensitive surface were retained in the same scan?",
    "Is the sensitive surface a form, multi-step flow, account page, checkout, application, portal, health, financial, identity, or support page?",
    "Was replay collection active, or was the evidence limited to replay library or vendor presence?",
    "Does retained evidence show same-page or same-flow linkage, or only scan-level co-presence?",
    "Could sensitive values, field labels, error states, helper text, screenshots, DOM mutations, or typed events be exposed under current vendor settings?",
    "Are sensitive fields, page sections, and dynamic states masked or excluded before collection?",
    "Did the replay signal occur before consent, after consent, after reject, or outside known consent context?",
    "Do page-level exclusions cover responsive variants, localized pages, authenticated states, and multi-step forms?",
    "Are payloads, identifiers, screenshots, raw DOM, and user-entered values excluded or redacted from public evidence?",
    "Should manual privacy, security, legal, and accessibility review confirm masking, consent posture, user impact, and remediation quality?"
  ],
  probable_fingerprinting: [
    "Which high-entropy browser or device signal categories co-occurred?",
    "Which retained runtime artifacts, request anchors, script contexts, or artifact references support the probable cluster?",
    "Was the cluster supported by canvas, WebGL, audio, storage, font, plugin, screen, locale, timing, or other environment signals?",
    "Was identifier-like, cross-domain, cookie-sync, adtech, analytics, or identity context also retained?",
    "Was the cluster observed before consent, after consent, after reject, or outside known consent context?",
    "Could the collection support security, fraud prevention, bot detection, compatibility, analytics, advertising, or another context-dependent purpose?",
    "Does retained evidence show enough detail to distinguish probable fingerprinting review from generic telemetry?",
    "Are query strings, identifiers, payloads, raw attribute values, and sensitive values redacted or avoided in public evidence?",
    "Should privacy, security, legal, and engineering teams manually confirm purpose, necessity, consent state, disclosure, minimization, and remediation quality?"
  ]
};

const EVIDENCE_STANDARDS: Record<string, FindingEvidenceStandard> = {
  cpra_cba_opt_out_missing: {
    strong: [
      "Retained evidence includes public page URL, advertising/cross-context/sale-share-related review signal, and scanned public-surface context for privacy or footer links.",
      "Retained evidence shows no clearly observed California privacy choice, Do Not Sell or Share, opt-out, or comparable privacy-choice path in the observed scan scope.",
      "Evidence includes enough link text, policy heading, footer, CMP, or preference-center context for a reviewer to locate the relevant public choice path manually.",
      "Evidence includes runtime or page-surface context that may be relevant to advertising, cross-context behavioral advertising, sale/share, tracking, or vendor governance.",
      "Coverage context indicates the relevant public surface was not materially blocked, truncated, or replaced by unrelated overlays."
    ],
    good: [
      "Retained evidence suggests advertising or privacy-choice context and lacks an observed opt-out path, but policy wording, state-specific rights flow, GPC behavior, or preference-center coverage requires manual review.",
      "The retained example is enough for a reviewer to inspect footer links, privacy-policy paths, CMP settings, or preference-center behavior manually.",
      "The evidence is likely relevant to CPRA/privacy-choice review, but organization scope, sale/share status, cross-context behavioral advertising status, exemptions, and legal interpretation require manual review."
    ],
    auditOnly: [
      "Advertising, analytics, or third-party tracking context exists, but retained evidence does not establish sale/share or cross-context behavioral advertising relevance.",
      "Policy text references California rights or opt-out concepts, but retained evidence does not show whether the linked choice path is present, absent, or functional.",
      "Footer or privacy links exist, but retained evidence lacks enough context to determine whether an opt-out path was discoverable in the scanned scope."
    ],
    insufficient: [
      "Vendor name alone.",
      "Third-party request alone without advertising/sale-share/privacy-choice context.",
      "Policy text alone without retained public-surface or runtime context.",
      "Missing footer link assertion without retained page-surface evidence.",
      "Snapshot boolean without retained link, policy, or runtime anchors.",
      "Claiming legal status, CPRA applicability, sale/share status, opt-out sufficiency, GPC handling, or compliance status based only on automated evidence."
    ]
  },
  fingerprinting_related_signals_observed: {
    strong: [
      "Retained runtime evidence includes browser, device, canvas, audio, storage, screen, locale, font, plugin, or other high-entropy environment signal context.",
      "Evidence includes page URL, script or request context, signal category, timing or scan-state context where available, and redaction of raw values or payloads.",
      "Evidence gives enough context to identify the signal as relevant to fingerprinting or device-signal review without claiming persistent fingerprint creation.",
      "Evidence distinguishes the related signal from probable fingerprinting by noting limited signal count, weaker corroboration, or incomplete identity/linkage context.",
      "Coverage context indicates the retained runtime observation was not materially blocked or unreliable."
    ],
    good: [
      "Retained evidence shows one or more fingerprinting-related browser or device signals with enough context for reviewer inspection.",
      "The retained example is enough for a reviewer to inspect script, request, vendor category, signal category, purpose, and consent context manually.",
      "The evidence is likely relevant to fingerprinting review, but persistent fingerprint creation, identity resolution, purpose, necessity, and legal significance require manual review."
    ],
    auditOnly: [
      "A script, vendor, or attribute name suggests device-signal collection, but retained evidence lacks enough detail to identify affected signal category or runtime context.",
      "A known anti-fraud, analytics, or personalization vendor is present, but no retained high-entropy signal artifact supports the observed state.",
      "Policy text or vendor documentation suggests fingerprinting capability, but no retained runtime artifact supports the finding."
    ],
    insufficient: [
      "Vendor name alone.",
      "Generic analytics, security, or bot-detection script without retained high-entropy signal evidence.",
      "Cookie or request presence alone without browser/device signal context.",
      "Raw attribute values, screenshots, or payload dumps as public evidence.",
      "Claims about personal identity, persistent fingerprint creation, user singling-out, legal status, consent validity, or compliance status based only on automated evidence."
    ]
  },
  probable_fingerprinting: {
    strong: [
      "Retained runtime evidence includes a multi-signal browser/device cluster with high-entropy signal categories such as canvas, WebGL, audio, storage, font or plugin, screen, locale, timing, or similar environment attributes.",
      "Evidence includes page URL, script or request context, signal categories, timing or scan-state context where available, and redaction of raw values, identifiers, query strings, and payloads.",
      "Evidence includes stronger corroboration than a single generic device signal, such as repeated categories, retained fingerprint tier context, artifact references, identity-like context, or cross-domain request context where retained.",
      "Evidence distinguishes probable fingerprinting review from proof of personal identity, identity resolution, or a complete identity graph.",
      "Coverage context indicates the retained runtime observations were not materially blocked or unreliable."
    ],
    good: [
      "Retained evidence shows a clustered high-entropy browser/device signal pattern, but purpose, identity linkage, downstream use, or endpoint role requires manual review.",
      "The retained example is enough for a reviewer to inspect signal categories, script or request context, vendor role, consent timing, and likely owner manually.",
      "The evidence is likely a probable fingerprinting review signal, but personal identity, persistent fingerprint creation, user singling-out, legal significance, and remediation quality require manual review."
    ],
    auditOnly: [
      "Multiple browser/device signals are suggested, but retained evidence lacks enough detail to confirm category count, runtime context, or corroboration.",
      "Known fingerprinting-capable vendor or script is present, but retained evidence does not show a multi-signal cluster.",
      "Policy text, vendor documentation, or static source reference suggests fingerprinting capability, but no retained runtime cluster supports the observed state."
    ],
    insufficient: [
      "Single generic browser or device attribute without corroborating high-entropy context.",
      "Vendor name alone.",
      "Cookie, request, or tag-manager presence alone without retained browser/device signal evidence.",
      "Raw device attributes, raw identifiers, screenshots, or payload dumps as public evidence.",
      "Claims about personal identity, identity resolution, complete identity graph, legal status, consent validity, or compliance status based only on automated evidence."
    ]
  },
  visual_contrast_accessibility_issue: {
    strong: [
      "Representative automated contrast evidence includes rule ID, affected selector or element reference, page URL, impact label, and WCAG-oriented reference.",
      "Retained evidence gives enough context for review of whether the element is normal text, large text, a control, icon, border, focus indicator, graphical object, placeholder text, error text, inactive component, decorative content, incidental content, or logo/brand content.",
      "Retained evidence includes computed foreground/background colors and contrast ratio when available, or a retained automated rule result sufficient for reviewer inspection.",
      "Evidence indicates the affected element is meaningful user-visible content or a meaningful UI component, rather than purely decorative content or an inactive component.",
      "Repeated examples across templates, components, states, or breakpoints may strengthen confidence when retained."
    ],
    good: [
      "Representative automated contrast-rule evidence includes rule ID, selector or element reference, page URL, impact label, and WCAG-oriented references.",
      "The retained example is enough for a reviewer to locate the affected element and verify the contrast pair manually.",
      "The evidence is likely text contrast or control contrast, but details such as exact text-size classification, visual state, or repeated-instance scope may require manual review."
    ],
    auditOnly: [
      "Contextual contrast signals exist, but retained evidence lacks enough detail to confirm the affected element, state, color pair, or applicable threshold.",
      "Low-contrast colors appear in design tokens, screenshots, CSS, or component naming, but no retained automated contrast artifact identifies a user-visible affected element.",
      "The issue may involve text over images, gradients, video, transparency, pseudo-elements, canvas, or shadow DOM where automated evidence is incomplete."
    ],
    insufficient: [
      "Color values or design-token names without a retained affected element or automated contrast artifact.",
      "Selector alone without rule ID, page context, or contrast-related evidence.",
      "A screenshot, visual impression, or user report without retained automated evidence or reviewer-confirmed contrast measurements.",
      "Disabled or inactive, decorative, incidental, or logo/brand content treated as finding-supporting evidence without context review.",
      "Claims about WCAG status or legal status based only on automated evidence without manual context review."
    ]
  },
  semantic_labeling_accessibility_issue: {
    strong: [
      "Representative automated semantic-labeling evidence includes rule ID, affected selector or element reference, page URL, impact label, and WCAG-oriented reference.",
      "Retained evidence gives enough context to review visible label, accessible name, role, state, value, instructions, grouping, or ARIA relationship.",
      "Evidence indicates the affected element is meaningful user-visible or assistive-technology-relevant content, such as a form field, button, link, landmark, heading, widget, or custom control.",
      "Repeated examples across components, templates, form patterns, or interactive widgets may strengthen confidence when retained.",
      "Strong evidence does not require live assistive-technology testing unless that is explicitly retained; assistive-technology behavior remains a manual review consideration."
    ],
    good: [
      "Representative automated rule evidence includes rule ID, selector or element reference, page URL, impact label, and WCAG-oriented references.",
      "The retained example is enough for a reviewer to locate the affected element and inspect its label, accessible name, role, or ARIA relationship manually.",
      "The evidence is likely a label/name/role/value issue, but semantic intent, visible-label alignment, grouping, and assistive-technology behavior require manual review."
    ],
    auditOnly: [
      "Contextual signals suggest labeling or ARIA risk, but retained evidence lacks enough detail to identify the affected element, semantic relationship, or user-facing purpose.",
      "Component names, class names, ARIA attributes, or form patterns appear suspicious, but no retained automated accessibility artifact identifies a specific affected element.",
      "The issue may involve dynamic content, shadow DOM, custom widgets, or stateful controls where automated evidence is incomplete."
    ],
    insufficient: [
      "Selector alone without rule ID, page context, or retained semantic-labeling evidence.",
      "ARIA attribute names or component names without an affected user-visible or assistive-technology-relevant element.",
      "Visual impression, policy text, or code-style preference without retained automated evidence or manual accessibility verification.",
      "Claims about screen-reader behavior, WCAG status, or legal status based only on automated evidence without manual context review."
    ]
  },
  text_alternative_accessibility_issue: {
    strong: [
      "Representative automated text-alternative evidence includes rule ID, affected selector or element reference, page URL, impact label, and WCAG-oriented reference.",
      "Retained evidence gives enough context to review whether the element is informative, functional, decorative, redundant, a logo/brand mark, an image of text, an icon-only control, or media content.",
      "Evidence indicates the affected element is meaningful user-visible or assistive-technology-relevant non-text content, rather than purely decorative or redundant content.",
      "Repeated examples across templates, components, icon systems, cards, media galleries, or marketing modules may strengthen confidence when retained.",
      "Strong evidence does not require human judgment about alt-text quality unless that review is explicitly retained; alt-text appropriateness remains a manual review consideration."
    ],
    good: [
      "Representative automated rule evidence includes rule ID, selector or element reference, page URL, impact label, and WCAG-oriented references.",
      "The retained example is enough for a reviewer to locate the affected non-text element and inspect alternative text or accessible-name behavior manually.",
      "The evidence is likely a text-alternative issue, but decorative status, functional purpose, surrounding text, redundancy, image-of-text status, or alt-text quality may require manual review."
    ],
    auditOnly: [
      "Contextual signals suggest text-alternative risk, but retained evidence lacks enough detail to confirm the affected element, purpose, accessible name, or surrounding context.",
      "Image, SVG, icon, or media patterns appear suspicious, but no retained automated artifact identifies a user-visible affected element.",
      "The issue may involve CSS background images, canvas, icon fonts, lazy-loaded media, dynamically inserted images, shadow DOM, or responsive image variants where automated evidence is incomplete."
    ],
    insufficient: [
      "Image filename, class name, or asset URL without a retained affected element or automated text-alternative artifact.",
      "Selector alone without rule ID, page context, or text-alternative evidence.",
      "A visual impression, screenshot, or user report without retained automated evidence or manual accessibility verification.",
      "Treating decorative, redundant, or logo/brand content as finding-supporting evidence without context review.",
      "Claims about WCAG status or legal status based only on automated evidence without manual context review."
    ]
  },
  keyboard_navigation_accessibility_issue: {
    strong: [
      "Representative automated keyboard-related evidence includes rule ID, affected selector or element reference, page URL, impact label, and WCAG-oriented reference.",
      "Retained evidence gives enough context to review whether the affected element is an interactive control, custom widget, menu, modal, carousel, form control, link, or focusable region.",
      "Evidence indicates the affected element is meaningful and user-operable, not a decorative or inactive element.",
      "Repeated examples across templates, components, menus, modals, custom controls, or responsive states may strengthen confidence when retained.",
      "Strong evidence does not require full manual keyboard path replay unless that is explicitly retained; keyboard operability, traps, and focus order remain manual review considerations."
    ],
    good: [
      "Representative automated keyboard-related evidence includes rule ID, selector or element reference, page URL, impact label, and WCAG-oriented references.",
      "The retained example is enough for a reviewer to locate the affected element and verify keyboard operability, focus visibility, or focus order manually.",
      "The evidence is likely a keyboard-navigation issue, but interaction state, keyboard path, focus management, modal/menu behavior, and user-triggered states may require manual review."
    ],
    auditOnly: [
      "Contextual keyboard or focus signals exist, but retained evidence lacks enough detail to confirm the affected interactive element, state, keyboard path, or user impact.",
      "Custom control, menu, modal, carousel, overlay, or focusable element patterns appear suspicious, but no retained automated artifact identifies a specific affected element.",
      "The issue may involve user-triggered states, authenticated flows, dynamic content, shadow DOM, canvas, iframes, or responsive navigation where automated evidence is incomplete."
    ],
    insufficient: [
      "Selector alone without rule ID, page context, or keyboard-related evidence.",
      "Generic custom component or div-button signal without retained affected element and keyboard-related artifact.",
      "Visual impression, screenshot, or user report without retained automated evidence or manual keyboard verification.",
      "Treating decorative, inactive, hidden, or unreachable elements as finding-supporting evidence without context review.",
      "Claims about WCAG status or legal status based only on automated evidence without manual context review."
    ]
  },
  focus_management_issue: {
    strong: [
      "Representative automated focus-management evidence includes rule ID, affected selector or element reference, page URL, impact label, and interaction-state context.",
      "Retained evidence gives enough context to review focus movement, containment, restoration, visibility, background inertness, or active surface behavior.",
      "Evidence indicates the affected element or component is meaningful and user-operable, such as a modal, menu, overlay, consent prompt, form step, or dynamic route change.",
      "Repeated examples across components, templates, modals, menus, consent prompts, or responsive states may strengthen confidence when retained.",
      "Strong evidence does not replace manual keyboard and assistive-technology review for user impact and remediation quality."
    ],
    good: [
      "Representative focus-management evidence includes selector or element reference, page URL, impact label, and enough interaction detail for reviewer inspection.",
      "The retained example is enough for a reviewer to replay the focus behavior manually.",
      "The evidence is likely a focus-management issue, but focus lifecycle, screen-reader context, dynamic states, and user impact may require manual review."
    ],
    auditOnly: [
      "Contextual focus signals exist, but retained evidence lacks enough detail to confirm the affected component, state, or focus path.",
      "A modal, menu, overlay, or consent prompt pattern appears suspicious, but no retained automated artifact identifies the focus behavior.",
      "The issue may involve user-triggered states, authenticated flows, dynamic content, shadow DOM, canvas, iframes, or responsive navigation where automated evidence is incomplete."
    ],
    insufficient: [
      "Selector alone without rule ID, page context, or focus-related evidence.",
      "Generic custom component signal without retained affected element and interaction state.",
      "Visual impression, screenshot, or user report without retained automated evidence or manual keyboard verification.",
      "Treating decorative, inactive, hidden, or unreachable elements as finding-supporting evidence without context review.",
      "Claims about WCAG status or legal status based only on automated evidence without manual context review."
    ]
  },
  reject_option_missing_or_hidden: {
    strong: [
      "Retained consent-surface evidence includes page URL, consent layer or banner observation, visible accept control, and no visible reject, decline, or equivalent refusal control on the same observed layer.",
      "Retained evidence includes labels or control text sufficient to identify the accept path and available preference or settings path, if present.",
      "Evidence includes timing or scan-state context showing the observation occurred before a consent choice was recorded.",
      "Coverage context indicates the consent surface was not materially blocked, truncated, or replaced by unrelated overlays.",
      "Repeated observations across viewports, regions, or pages may strengthen confidence when retained."
    ],
    good: [
      "Retained evidence shows an accept path and a refusal path that appears nested behind settings, preferences, or additional steps, but some visual context or step detail may require manual review.",
      "The retained example is enough for a reviewer to inspect the observed consent layer and evaluate whether an equivalent refusal path exists.",
      "The evidence is likely a reject-availability issue, but localization, region rules, prior consent state, accessibility, and equivalent-choice analysis require manual review."
    ],
    auditOnly: [
      "CMP or banner present, but retained evidence does not clearly show all controls or their labels.",
      "Button or link labels suggest preferences or settings, but the scan did not retain enough path detail to determine whether reject was available.",
      "Static CMP configuration, policy text, or template name suggests a risk, but no retained consent-surface artifact identifies the user-facing controls."
    ],
    insufficient: [
      "A banner was detected without retained button or link labels.",
      "Reject button was not observed because the scan was blocked, interrupted, or did not reach the consent surface.",
      "Policy text, vendor name, CMP name, or visual impression alone without retained consent-surface evidence.",
      "Claims about legal status, compliance status, deception, unfairness, consent validity, or dark-pattern status based only on automated UI evidence."
    ]
  },
  forced_consent_interaction: {
    strong: [
      "Retained consent-surface evidence includes page URL, visible prompt or overlay, and a blocking or interruption signal such as content obscured, scroll locked, navigation interrupted, or interaction required before ordinary page access.",
      "Retained evidence identifies available controls, such as accept, reject, settings, close, or continue-without-accepting, where observed.",
      "Evidence includes scan-state context showing the prompt affected the public page before an ordinary browsing path continued.",
      "Coverage context indicates the blocking state was not caused by unrelated bot protection, paywall, age gate, login wall, or unrelated modal.",
      "Repeated observations across pages, viewports, or regions may strengthen confidence when retained."
    ],
    good: [
      "Retained evidence shows a consent overlay or modal that appears to block ordinary browsing, but exact scroll-lock, content-obscuring, or dismiss-path detail may require manual review.",
      "The retained example is enough for a reviewer to inspect the observed prompt and evaluate whether a non-consent path was available.",
      "The evidence is likely a forced-interaction review signal, but necessity, legal context, accessibility, and regional configuration require manual review."
    ],
    auditOnly: [
      "Banner or overlay present, but retained evidence does not show whether ordinary page access was blocked.",
      "Static UI text suggests consent is required, but no retained page-interaction or overlay artifact shows blocking behavior.",
      "A modal was observed, but it may be a paywall, age gate, login wall, bot challenge, newsletter prompt, or unrelated interruption."
    ],
    insufficient: [
      "Consent banner presence alone.",
      "User interaction required for unrelated reasons such as bot protection, login, paywall, age gate, or app install prompt.",
      "Artifact-free assertion that content was blocked.",
      "Policy text, CMP name, or visual impression without retained consent-surface evidence.",
      "Claims about legal status, compliance status, deception, unfairness, dark-pattern status, or consent validity based only on automated UI evidence."
    ]
  },
  asymmetric_consent_ui: {
    strong: [
      "Retained consent-surface evidence includes both accept and refusal paths, or a clear accept path with refusal available only through materially more steps.",
      "Evidence includes labels, layer or path context, and observed relationship between accept and refusal controls.",
      "Evidence indicates accept appears more direct, visually prominent, or lower effort than refusal in the observed scan scope.",
      "Coverage context indicates the consent surface was not materially blocked, truncated, or replaced by unrelated overlays.",
      "Repeated observations across viewports, regions, or pages may strengthen confidence when retained."
    ],
    good: [
      "Retained evidence suggests visual, procedural, or structural imbalance between accept and refusal paths, but exact prominence, step count, or equivalent-choice context may require manual review.",
      "The retained example is enough for a reviewer to inspect labels, button hierarchy, and path availability.",
      "The evidence is likely a choice-architecture review signal, but legal interpretation, accessibility, region configuration, and user impact require manual review."
    ],
    auditOnly: [
      "Accept and preference controls are visible, but retained evidence does not show whether refusal is available or how many steps it takes.",
      "Button styling, order, or copy appears potentially imbalanced, but no retained artifact identifies the relevant accept/refuse relationship.",
      "Static CMP configuration or policy text suggests possible asymmetry, but no retained consent-surface artifact supports the observed user-facing state."
    ],
    insufficient: [
      "Accept button presence alone.",
      "Generic button color or placement claim without retained consent-surface artifact.",
      "Preference link presence without evidence of refusal path or path depth.",
      "Visual impression, policy text, CMP name, or template name without retained UI evidence.",
      "Claims about deception, unfairness, dark-pattern status, legal status, compliance status, or consent validity based only on automated UI evidence."
    ]
  },
  consent_dark_patterns_detected: {
    strong: [
      "Retained consent-surface evidence includes multiple concrete choice-architecture signals, such as hidden refusal path, materially higher refusal effort, forced interaction, imbalanced visual hierarchy, repeated prompting, or unclear choice labels.",
      "Evidence includes page URL, observed consent layer, labels or path context, and scan-state context.",
      "Evidence distinguishes finding-supporting artifacts from review context and unrelated interruptions.",
      "Coverage context indicates the consent surface was not materially blocked, truncated, or replaced by unrelated overlays.",
      "Repeated observations across viewports, regions, pages, or consent states may strengthen confidence when retained."
    ],
    good: [
      "Retained evidence shows one or more consent choice-architecture signals with enough context for reviewer inspection, but full user impact, repetition, visual prominence, or equivalent-choice analysis may require manual review.",
      "The retained example is enough for a reviewer to inspect the observed surface, available choices, and likely remediation owner.",
      "The evidence is likely a choice-architecture review signal, but legal interpretation, dark-pattern, deception, or unfairness analysis, accessibility, and regional configuration require manual review."
    ],
    auditOnly: [
      "Contextual signals suggest choice-architecture risk, but retained evidence lacks enough detail to identify the affected consent layer, controls, labels, or interaction path.",
      "CMP template, policy language, or static configuration suggests possible risk, but no retained consent-surface artifact supports the observed user-facing state.",
      "A single low-detail UI signal appears relevant, but the evidence is not enough to distinguish consent UX from unrelated modals, paywalls, bot challenges, or login flows."
    ],
    insufficient: [
      "CMP vendor name alone.",
      "Policy text alone.",
      "Banner presence alone.",
      "Generic dark_pattern_label without retained consent-surface artifacts.",
      "Unrelated modal, paywall, bot challenge, age gate, login wall, or newsletter prompt without consent-surface linkage.",
      "Claims about deception, unfairness, dark-pattern status, legal status, compliance status, or consent validity based only on automated UI evidence."
    ]
  },
  third_party_cookie_pre_consent: {
    strong: [
      "Retained runtime evidence includes a cookie or storage artifact with timestamp, name or key, domain or scope, and value redacted or omitted.",
      "Evidence shows the artifact was observed before a consent action or prior consent state associated with that purpose.",
      "Evidence supports third-party context through domain or scope, related request domain, or vendor attribution where available.",
      "Evidence includes purpose or essentiality classification where available, especially analytics, advertising, measurement, identity, or another non-essential purpose.",
      "Coverage context indicates the consent timeline and storage observation were not materially blocked or unreliable."
    ],
    good: [
      "Retained evidence shows a third-party cookie or storage artifact and pre-consent timing, but purpose classification or related request context is less complete.",
      "The retained example is enough for a reviewer to inspect the cookie or storage domain, timing, and likely owner manually.",
      "The evidence is likely relevant to cookie and consent review, but necessity, exemption status, purpose, and regional context require manual review."
    ],
    auditOnly: [
      "Third-party request observed before consent, but no retained cookie or storage artifact is attached.",
      "Cookie name, vendor name, or domain appears relevant, but timing or consent-state context is incomplete.",
      "Static policy text, CMP configuration, or vendor registry entry suggests possible storage, but no retained runtime cookie or storage artifact supports the observed state."
    ],
    insufficient: [
      "Cookie name alone without timing, domain or scope, and retained artifact.",
      "Vendor name alone.",
      "Third-party request alone without cookie or storage artifact.",
      "Cookie count without retained timing and consent-state context.",
      "Policy text, CMP name, or static source reference without runtime storage evidence.",
      "Claims about legal status, compliance status, consent validity, or tracking lawfulness based only on automated evidence."
    ]
  },
  cookie_disclosure_gap: {
    strong: [
      "Retained runtime evidence includes concrete cookie or storage artifacts with name or family, domain or provider context, category where available, and values redacted or omitted.",
      "Retained public-surface evidence includes cookie-policy, privacy-policy, CMP, or disclosure coverage that was inspected during the scan.",
      "Evidence identifies the mismatch between observed cookie behavior and retained disclosure coverage without relying on cookie counts alone.",
      "Coverage context indicates the relevant public disclosure surface was not materially blocked, missing, or unreliable.",
      "The finding does not claim legal adequacy or compliance status without manual review."
    ],
    good: [
      "Retained evidence shows runtime cookie activity and a plausible disclosure mismatch, but provider naming, category mapping, regional policy variants, or coverage completeness requires manual review.",
      "The retained example is enough for a reviewer to compare runtime cookies with policy or CMP disclosure text manually.",
      "The evidence is likely relevant to transparency and disclosure review, but legal adequacy, policy completeness, and applicability require manual review."
    ],
    auditOnly: [
      "Cookie activity exists, but retained policy or disclosure coverage is incomplete.",
      "A policy page exists, but the scan did not retain enough cookie-table or provider context to compare it with runtime cookies.",
      "Provider or category names differ, but no retained runtime cookie artifact supports the mismatch."
    ],
    insufficient: [
      "Cookie count alone.",
      "Cookie name alone without domain, provider, timing, or disclosure comparison.",
      "Policy text alone without retained runtime cookie evidence.",
      "Blocked or degraded scans where disclosure coverage cannot be trusted.",
      "Claims about legal status, compliance status, or disclosure sufficiency based only on automated evidence."
    ]
  },
  long_lived_cookie_retention_review: {
    strong: [
      "Retained runtime cookie evidence includes cookie name, domain or host, page URL, classification, expiry timestamp, Max-Age, or computed duration, and threshold basis.",
      "The cookie is classified as advertising, tracking, marketing, identity, retargeting, or similar, with duration at or above the 365-day CertScore.ai review threshold.",
      "Evidence includes vendor or source request URL context, values redacted or omitted, and enough page attribution for reviewer inspection.",
      "Repeated long-lived adtech or marketing cookies, or a 730-day severe review threshold, may strengthen top-ranking relevance.",
      "The evidence frames 365 days as a CertScore.ai product review threshold, not a statutory threshold or legal conclusion."
    ],
    good: [
      "Retained runtime cookie evidence includes complete cookie identity, page attribution, classification, duration or expiry, and threshold basis.",
      "The retained example is enough for a reviewer to inspect purpose, vendor, retention, consent, opt-out, and disclosure alignment manually.",
      "Unknown or unclassified cookies at or above the 365-day threshold are eligible for review when concrete runtime duration evidence is retained."
    ],
    auditOnly: [
      "Unknown first-party cookie evidence is between 180 and 364 days without vendor, adtech, or stronger purpose context.",
      "Cookie volume is high, but expiry, duration, classification, or page attribution is incomplete.",
      "Policy or cookie-table retention text exists, but runtime cookie duration evidence is absent."
    ],
    insufficient: [
      "Policy text alone.",
      "Cookie count alone.",
      "Cookie name or domain without expiry, Max-Age, computed duration, or page attribution.",
      "Session cookies only.",
      "Essential cookies only.",
      "Fallback suspicion, model-only inference, static source reference, or missing threshold basis.",
      "Claims that a cookie lifetime violates GDPR or decides compliance status."
    ]
  },
  reject_tracking_persists_after_reject: {
    strong: [
      "Retained evidence includes a reject-style interaction event with timestamp or interaction-state context.",
      "Retained evidence includes a classified non-essential request or storage artifact after the reject interaction.",
      "Evidence includes stable runtime anchors such as URL origin and path with query redacted, cookie or storage key with value redacted, resource type, vendor or category, and timestamp.",
      "Evidence distinguishes post-reject activity from activity that began or was queued before the reject action where available.",
      "Coverage context indicates the interaction and post-reject observation were not materially blocked or unreliable."
    ],
    good: [
      "Retained evidence shows a reject-style interaction and post-reject non-essential artifact, but interaction-success confirmation or pre/post comparison is less complete.",
      "The retained example is enough for a reviewer to inspect timing, vendor or category, and artifact details manually.",
      "The evidence is likely relevant to reject-enforcement review, but queued beacons, strictly necessary activity, purpose, and CMP propagation require manual review."
    ],
    auditOnly: [
      "Reject control was present but not clicked or no reject-style interaction was retained.",
      "Post-reject request exists but essentiality, purpose, or timing relative to reject is unclear.",
      "Vendor name, CMP configuration, or policy text suggests possible persistence, but no retained post-reject runtime artifact supports it."
    ],
    insufficient: [
      "Reject button exists but was not interacted with.",
      "Failed or ambiguous reject interaction without post-interaction runtime evidence.",
      "Tracking observed only before reject.",
      "Vendor name alone.",
      "Snapshot boolean without post-interaction timeline and retained runtime anchors.",
      "Post-reject request with unknown essentiality and no purpose classification.",
      "Claims about legal status, compliance status, consent validity, vendor responsibility, or tracking lawfulness based only on automated evidence."
    ]
  },
  rtb_cookie_sync_observed: {
    strong: [
      "Retained network evidence includes a request or redirect endpoint consistent with adtech identity sync-like, user match, RTB, ad exchange, or adtech identity flow.",
      "Evidence includes origin and path, timing, vendor or category classification, and query redaction.",
      "Evidence includes identifier-like query keys, redirect context, or sync-like pattern with values redacted or hashed where retained.",
      "Evidence distinguishes sync or match context from a generic ad script or ad impression request where possible.",
      "Coverage context indicates request ordering and retained anchors were not materially blocked or unreliable."
    ],
    good: [
      "Retained request evidence is consistent with adtech sync-like or user-match behavior, but redirect-chain completeness, identifier scope, or endpoint purpose requires manual review.",
      "The retained example is enough for a reviewer to inspect origin and path, vendor or category, redacted parameters, and timing manually.",
      "The evidence is likely an adtech identity sync-like review signal, but consent state, legal relevance, and server-side behavior require manual review."
    ],
    auditOnly: [
      "Generic adtech request or script is present, but sync or match pattern is not retained.",
      "Vendor is known for adtech or identity, but no concrete sync endpoint, redirect, or identifier-like key is retained.",
      "Policy or CMP text references advertising or partners, but no retained network sync artifact supports the observed state."
    ],
    insufficient: [
      "Vendor name alone.",
      "Generic ad impression or script load without sync or match pattern.",
      "Policy text alone.",
      "Identifier-like key without request origin, path, and context.",
      "Unredacted identifiers or payloads in public examples.",
      "Claims about confirmed cookie syncing, complete identity graph, personal identity, legal status, compliance status, or tracking lawfulness based only on automated evidence."
    ]
  },
  cross_domain_identifier_sharing_observed: {
    strong: [
      "Retained outbound request evidence includes origin and path, destination domain, timestamp, and redacted identifier-like key or value pattern.",
      "Evidence shows the destination is a different domain or third-party context.",
      "Evidence includes vendor or category classification, purpose context, or request pattern sufficient for reviewer inspection.",
      "Evidence redacts or omits full identifier values, query strings, and payloads.",
      "Coverage context indicates request ordering and retained anchors were not materially blocked or unreliable."
    ],
    good: [
      "Retained request evidence shows identifier-like data sent cross-domain, but purpose, identifier scope, or vendor classification is less complete.",
      "The retained example is enough for a reviewer to inspect origin and path, destination, redacted key or value, and timing manually.",
      "The evidence is likely a cross-domain identifier-sharing review signal, but identity-resolution risk, consent relevance, server-side behavior, and legal significance require manual review."
    ],
    auditOnly: [
      "Third-party request observed, but no identifier-like key or value pattern is retained.",
      "Identifier-like key appears in a request, but destination, timing, or context is incomplete.",
      "Vendor registry or policy text suggests sharing, but no retained outbound request artifact supports the observed state."
    ],
    insufficient: [
      "Third-party request alone.",
      "Vendor name alone.",
      "Generic query string without identifier-like signal.",
      "Cookie presence without evidence of outbound cross-domain transfer.",
      "Identifier-like key without request origin, path, and destination context.",
      "Unredacted identifier values in public examples.",
      "Claims about personal identity, identity graph, legal status, sale or share status, compliance status, or tracking lawfulness based only on automated evidence."
    ]
  },
  session_recording_services_detected: {
    strong: [
      "Retained runtime evidence includes a script, request, endpoint, or vendor pattern associated with session replay, heatmaps, recording, or behavior analytics.",
      "Evidence includes page URL, request origin or script host, vendor or category classification, timing, and query or payload redaction where applicable.",
      "Evidence gives enough context to distinguish replay or behavior-analytics tooling from generic analytics where possible.",
      "Evidence includes consent timing, page-path context, or repeated observations across pages where retained.",
      "Coverage context indicates the retained request or script evidence was not materially blocked or unreliable."
    ],
    good: [
      "Retained evidence shows a replay-related vendor, script host, request, or endpoint with enough context for reviewer inspection.",
      "The retained example is enough for a reviewer to inspect vendor configuration, consent state, masking, sampling, and page exclusions manually.",
      "The evidence is likely a session-replay or behavior-analytics review signal, but active recording, payload contents, masking, and user impact require manual review."
    ],
    auditOnly: [
      "Vendor or script context suggests replay or behavior analytics, but retained evidence lacks enough detail to confirm service category or page context.",
      "A tag manager or analytics container may load replay tooling, but no retained replay-related script, request, or vendor artifact identifies the affected service.",
      "Policy text or vendor documentation mentions replay or recordings, but no retained runtime artifact supports the observed state."
    ],
    insufficient: [
      "Vendor name alone without retained script, request, endpoint, or page context.",
      "Generic analytics request without replay, heatmap, recording, or behavior-analytics classification.",
      "Policy text, CMP vendor name, or static source reference without runtime evidence.",
      "A screenshot, user report, or visual impression without retained runtime artifact or manual verification.",
      "Claims about keystroke capture, sensitive-value capture, full recordings, legal status, consent validity, or compliance status based only on automated evidence."
    ]
  },
  sensitive_data_collection_with_third_party_tracking_present: {
    strong: [
      "Retained page-surface evidence identifies a sensitive input field, sensitive form, or sensitive page context.",
      "Retained runtime evidence identifies third-party tracking, analytics, advertising, replay, measurement, or vendor context on the same page or flow.",
      "Evidence includes page URL, representative selector or field context where safe, vendor or category classification, timing, and redaction of user-entered values, query strings, and payloads.",
      "Evidence distinguishes co-occurrence from actual sensitive-value transmission where retained.",
      "Coverage context indicates the page-surface and runtime observations were not materially blocked or unreliable."
    ],
    good: [
      "Retained evidence shows sensitive-input or sensitive-context surface co-occurring with third-party tracking context, but payload contents or exact event capture may require manual review.",
      "The retained example is enough for a reviewer to locate the affected page or form and inspect vendor activity manually.",
      "The evidence is likely a sensitive-surface tracking review signal, but data sensitivity, purpose, consent state, payload contents, and minimization require manual review."
    ],
    auditOnly: [
      "Sensitive page or form context exists, but retained third-party runtime evidence is incomplete or not tied to the same observed surface.",
      "Third-party tracking exists on the site, but retained evidence does not show co-occurrence with the sensitive surface.",
      "Field names, labels, or page text suggest sensitivity, but no retained runtime tracking artifact supports the observed state."
    ],
    insufficient: [
      "Sensitive field label alone without retained page context and runtime tracking evidence.",
      "Third-party vendor name alone without co-occurrence on the affected surface.",
      "Screenshot, raw DOM, user-entered value, or full payload as public evidence.",
      "Tracking observed only on unrelated pages.",
      "Claims that sensitive values were transmitted, captured, read, or linked to a third party based only on co-occurrence evidence."
    ]
  },
  possible_session_replay_on_sensitive_input_surface: {
    strong: [
      "Retained runtime evidence includes replay-related script, request, endpoint, or vendor context on or near a sensitive-input or sensitive-context surface.",
      "Retained page-surface evidence identifies the sensitive form, field context, or page purpose without exposing user-entered values.",
      "Evidence includes page URL, replay-related runtime anchor, representative field or surface context where safe, consent timing where available, and redaction of payloads and identifiers.",
      "Evidence distinguishes replay-service presence from confirmed sensitive-value capture where retained.",
      "Coverage context indicates the runtime and page-surface observations were not materially blocked or unreliable."
    ],
    good: [
      "Retained evidence shows replay-related runtime context and a sensitive-input or sensitive-context surface in the same observed scope, but active capture, masking, or payload contents require manual review.",
      "The retained example is enough for a reviewer to inspect vendor configuration, page exclusions, masking, and consent state manually.",
      "The evidence is likely a replay-on-sensitive-surface review signal, but keystroke capture, screenshots, recordings, masking, and user impact require manual review."
    ],
    auditOnly: [
      "Replay-related tooling appears somewhere on the site, but retained evidence does not clearly connect it to the sensitive surface.",
      "Sensitive surface evidence exists, but replay-related runtime evidence is incomplete or outside the observed page scope.",
      "Vendor documentation, policy text, or template name suggests replay risk, but no retained co-occurrence artifact supports the observed state."
    ],
    insufficient: [
      "Replay vendor name alone without retained page or runtime co-occurrence evidence.",
      "Sensitive field label alone without replay-related runtime evidence.",
      "Raw DOM, screenshots, user-entered values, full payloads, or session recordings as public evidence.",
      "Replay observed only on unrelated pages.",
      "Claims that sensitive values, keystrokes, screenshots, form contents, or recordings were captured based only on automated co-occurrence evidence."
    ]
  },
  session_replay_present_with_sensitive_surfaces_observed: {
    strong: [
      "Retained runtime evidence includes replay-related script, request, endpoint, or vendor context in the scan.",
      "Retained page-surface evidence identifies a sensitive form, field context, or page purpose without exposing user-entered values.",
      "Evidence includes replay-related runtime anchor, representative field or surface context where safe, consent timing where available, and redaction of payloads and identifiers.",
      "Evidence distinguishes scan-level co-presence from same-page or same-flow replay linkage.",
      "Coverage context indicates the runtime and page-surface observations were not materially blocked or unreliable."
    ],
    good: [
      "Retained evidence shows replay-related runtime context and a sensitive-input or sensitive-context surface in the same scan, while same-page linkage, active capture, masking, or payload contents require manual review.",
      "The retained example is enough for a reviewer to inspect vendor configuration, page exclusions, masking, and consent state manually.",
      "The evidence is a replay-plus-sensitive-surface review signal, but keystroke capture, screenshots, recordings, masking, and user impact require manual review."
    ],
    auditOnly: [
      "Replay-related tooling appears somewhere on the site, but sensitive-surface evidence is incomplete or materially blocked.",
      "Sensitive surface evidence exists, but replay-related runtime evidence is incomplete or too weak.",
      "Vendor documentation, policy text, or template name suggests replay risk, but no retained scan-level co-presence artifact supports the observed state."
    ],
    insufficient: [
      "Replay vendor name alone without retained runtime evidence.",
      "Sensitive field label alone without replay-related runtime evidence.",
      "Raw DOM, screenshots, user-entered values, full payloads, or session recordings as public evidence.",
      "Claims that sensitive values, keystrokes, screenshots, form contents, or recordings were captured based only on automated co-presence evidence."
    ]
  },
  pre_consent_tracking_detected: {
    strong: [
      "Consent timeline sequence with page start, consent-surface or consent-state observation, and no observed consent action before the classified runtime signal.",
      "At least one concrete non-essential request or storage artifact with retained timing and a stable runtime anchor.",
      "Purpose classification showing advertising, behavioral analytics, cross-site measurement, retargeting, pixel tracking, session replay, identifier syncing, or another non-essential purpose.",
      "Coverage check showing the scan was not materially blocked or interrupted in a way that makes event order unreliable."
    ],
    good: [
      "Concrete non-essential runtime artifact before any observed consent action, with less complete supporting detail such as category-level classification or no paired storage evidence.",
      "Known advertising, analytics, or measurement endpoint observed before consent with enough URL origin/path and timing context for reviewer inspection."
    ],
    auditOnly: [
      "Contextual signals such as a CMP, banner, tag manager, vendor registry match, policy disclosure, or static script reference without a concrete pre-consent non-essential runtime artifact.",
      "Runtime activity that appears relevant but lacks enough timing, classification, or anchor detail to support public surfacing."
    ],
    insufficient: [
      "Snapshot booleans without consent timeline support and retained runtime anchors.",
      "Vendor names, policy text, cookie names, static source references, or tag manager load alone.",
      "Interrupted or materially blocked scans where request order or consent state cannot be trusted.",
      "Strictly necessary storage, security, load-balancing, fraud-prevention, or session activity without evidence of non-essential tracking purpose."
    ]
  }
};

const LIMITATIONS: Record<string, string[]> = {
  visual_contrast_accessibility_issue: [
    "This finding is an automated accessibility review signal, not a legal conclusion, certification, or determination of WCAG conformance or non-conformance.",
    "Automated contrast checks can identify many computed color-contrast issues, but they may miss or misread text over images, gradients, video, canvas, transparency, pseudo-elements, shadow DOM, dynamic states, responsive breakpoints, and authenticated or user-triggered states.",
    "Automated evidence may not fully determine text size, font weight, meaningfulness, decorative status, inactive status, logo/brand status, or whether a non-text visual element is necessary to understand the interface.",
    "Manual review is needed to confirm context, applicable threshold, exception status, user impact, and remediation quality.",
    "Remediation should be verified across default, hover, focus, active, disabled, placeholder, error, dark/light mode, and responsive states where relevant.",
    "CertScore.ai retains representative evidence for review and may not list every repeated instance across a template or component library.",
    "Findings should be evaluated with implementation context and applicable accessibility requirements before operational or legal reliance."
  ],
  semantic_labeling_accessibility_issue: [
    "This finding is an automated accessibility review signal, not a legal conclusion, certification, or determination of WCAG conformance or non-conformance.",
    "Automated semantic-labeling checks can identify many missing label, accessible-name, ARIA, role, and relationship issues, but they may miss or misread dynamic content, shadow DOM, custom widgets, state changes, localization, hidden text, and assistive-technology behavior.",
    "Automated evidence may not fully determine semantic intent, whether visible and programmatic labels align, whether instructions are sufficient, or whether remediation improves the experience for assistive-technology users.",
    "Manual review is needed to confirm context, user impact, semantic intent, assistive-technology behavior, and remediation quality.",
    "Remediation should be verified across default, focus, error, required, disabled, expanded, collapsed, selected, and responsive states where relevant.",
    "CertScore.ai retains representative evidence for review and may not list every repeated instance across a template or component library.",
    "Findings should be evaluated with implementation context and applicable accessibility requirements before operational or legal reliance."
  ],
  text_alternative_accessibility_issue: [
    "This finding is an automated accessibility review signal, not a legal conclusion, certification, or determination of WCAG conformance or non-conformance.",
    "Automated text-alternative checks can identify many missing or empty alternative-text issues, but they may not determine whether an image is informative, decorative, functional, redundant, a logo, an image of text, or already explained by surrounding content.",
    "Automated evidence may miss or misread CSS background images, canvas, SVGs, icon fonts, lazy-loaded media, shadow DOM, responsive image variants, and authenticated or user-triggered content.",
    "Automated evidence may not determine whether alternative text is accurate, concise, equivalent, or useful.",
    "Manual review is needed to confirm element purpose, surrounding context, assistive-technology behavior, user impact, and remediation quality.",
    "CertScore.ai retains representative evidence for review and may not list every repeated instance across CMS content, templates, or component libraries.",
    "Findings should be evaluated with implementation context and applicable accessibility requirements before operational or legal reliance."
  ],
  keyboard_navigation_accessibility_issue: [
    "This finding is an automated accessibility review signal, not a legal conclusion, certification, or determination of WCAG conformance or non-conformance.",
    "Automated keyboard-related checks can identify many focus, semantics, and keyboard-risk signals, but they may not fully test keyboard paths, focus order, keyboard traps, modal behavior, menu behavior, carousel behavior, authenticated flows, or user-triggered states.",
    "Automated evidence may miss or misread dynamic content, shadow DOM, iframes, canvas, responsive navigation, overlays, and script-driven focus management.",
    "Automated evidence may not determine whether an element is fully operable by keyboard or whether the focus order is logical for users.",
    "Manual keyboard review is needed to confirm operability, focus visibility, focus order, keyboard traps, expected key behavior, user impact, and remediation quality.",
    "Remediation should be verified across default, focus, active, expanded, collapsed, open, closed, disabled, modal, overlay, and responsive states where relevant.",
    "CertScore.ai retains representative evidence for review and may not list every repeated instance across a template or component library.",
    "Findings should be evaluated with implementation context and applicable accessibility requirements before operational or legal reliance."
  ],
  focus_management_issue: [
    "This finding is an automated accessibility review signal, not a legal conclusion, certification, or determination of WCAG conformance or non-conformance.",
    "Automated focus checks can identify many focus-management risks, but they may not fully test every keyboard path, assistive-technology announcement, modal lifecycle, or user-triggered state.",
    "Automated evidence may miss or misread dynamic content, shadow DOM, iframes, responsive navigation, animation timing, and authenticated flows.",
    "Manual review is needed to confirm focus order, focus restoration, background inertness, keyboard trapping, visible focus, user impact, and remediation quality.",
    "Remediation should be verified across open, close, escape, tab, shift-tab, route-change, validation-error, and responsive states where relevant.",
    "CertScore.ai retains representative evidence for review and may not list every repeated instance across a component library or template.",
    "Findings should be evaluated with implementation context and applicable accessibility requirements before operational or legal reliance."
  ],
  pre_consent_tracking_detected: [
    "This finding is an automated runtime risk signal for review, not a legal conclusion, certification, or compliance determination.",
    "A consent banner, CMP script, tag manager, vendor name, policy disclosure, or cookie name is not enough by itself.",
    "Some storage, security, fraud-prevention, load-balancing, session, or analytics activity may be necessary or exempt depending on purpose, configuration, retention, sharing, and jurisdiction.",
    "Consent state can vary by region, browser state, prior choices, A/B tests, CMP configuration, login state, and page path.",
    "Clean-profile scans may not reflect returning-user consent states; returning-profile scans may suppress banners because a prior preference exists.",
    "Automated vendor and purpose classification may be incomplete or incorrect. Review retained runtime anchors before taking action.",
    "CertScore.ai redacts or avoids retaining full query strings, cookie values, and sensitive payloads where possible while retaining stable anchors needed for review.",
    "Findings should be reviewed with retained evidence, implementation context, and applicable regional settings before operational or legal reliance."
  ],
  fingerprinting_related_signals_observed: [
    "This finding is an automated fingerprinting-related review signal, not a legal conclusion, certification, compliance determination, or determination of consent validity.",
    "Retained browser/device signals do not determine that a persistent fingerprint was created, that personal identity or identity resolution was established, or that user singling-out occurred.",
    "Security, fraud-prevention, bot-detection, analytics, compatibility, and personalization scripts may collect similar attributes for different purposes.",
    "Automated evidence may not fully determine purpose, entropy, necessity, downstream use, identity linkage, vendor role, or consent state.",
    "Manual review is needed to confirm purpose, necessity, consent state, disclosure, minimization, security context, and remediation quality.",
    "CertScore.ai redacts or avoids retaining raw attribute values, full query strings, identifiers, payloads, screenshots, and sensitive values while preserving stable anchors needed for review."
  ],
  probable_fingerprinting: [
    "This finding is an automated probable fingerprinting review signal, not a legal conclusion, certification, compliance determination, or determination of consent validity.",
    "Probable fingerprinting is inferred from clustered retained signals; it does not determine persistent fingerprint creation, personal identity, identity resolution, user singling-out, or a complete identity graph.",
    "Fraud-prevention, security, bot-detection, abuse-prevention, compatibility, or service-protection use cases may explain some high-entropy collection.",
    "Automated evidence may not fully determine purpose, necessity, downstream use, legal basis, consent state, vendor role, or whether signals are linked to identifiers.",
    "Manual review is needed to confirm purpose, necessity, consent state, disclosure, minimization, security context, data sharing, and remediation quality.",
    "CertScore.ai redacts or avoids retaining raw device attributes, full query strings, identifiers, payloads, screenshots, and sensitive values while preserving stable anchors needed for review."
  ],
  session_recording_services_detected: [
    "This finding is an automated session-replay and behavior-analytics review signal, not a legal conclusion, certification, compliance determination, or determination of consent validity.",
    "Detecting a replay-related vendor, script, or endpoint does not determine that keystrokes, sensitive values, full recordings, screenshots, or user communications were captured or retained.",
    "Some replay and behavior-analytics tools can be configured for masking, sampling, field suppression, page exclusions, and consent gating.",
    "Automated evidence may not fully determine active recording status, payload contents, masking quality, vendor settings, or downstream use.",
    "Manual review is needed to confirm vendor configuration, consent state, page-level exclusions, masking, sampling, payload contents, user impact, and remediation quality.",
    "CertScore.ai redacts or avoids retaining full query strings, payloads, identifiers, screenshots, raw DOM, and user-entered values while preserving stable anchors needed for review.",
    "Server-side processing, vendor-side recording retention, and dashboard configuration may not be visible to a browser scan."
  ],
  possible_session_replay_on_sensitive_input_surface: [
    "This finding is an automated replay-on-sensitive-surface review signal, not a legal conclusion, certification, compliance determination, or determination of consent validity.",
    "Co-occurrence of replay-related runtime evidence and a sensitive surface does not determine that sensitive field values, keystrokes, screenshots, form contents, or recordings were captured.",
    "The evidence may reflect a shared template, global script, library availability, or vendor tag presence rather than active replay collection on a submitted form.",
    "Automated evidence may not fully determine masking quality, sampling, page exclusions, payload contents, authenticated states, user-triggered form states, or vendor-side retention.",
    "Manual review is needed to confirm sensitive context, replay configuration, masking, consent state, payload contents, page exclusions, user impact, and remediation quality.",
    "CertScore.ai redacts or avoids retaining full query strings, payloads, identifiers, screenshots, raw DOM, and user-entered values while preserving stable anchors needed for review."
  ],
  session_replay_present_with_sensitive_surfaces_observed: [
    "This finding is an automated replay-plus-sensitive-surface review signal, not a legal conclusion, certification, compliance determination, or determination of consent validity.",
    "Scan-level co-presence of replay-related runtime evidence and a sensitive surface does not determine that sensitive field values, keystrokes, screenshots, form contents, or recordings were captured.",
    "This finding is distinct from same-page or same-flow replay linkage, which requires stronger retained evidence.",
    "The evidence may reflect a shared template, global script, library availability, or vendor tag presence rather than active replay collection on a submitted form.",
    "Automated evidence may not fully determine masking quality, sampling, page exclusions, payload contents, authenticated states, user-triggered form states, or vendor-side retention.",
    "Manual review is needed to confirm sensitive context, replay configuration, masking, consent state, payload contents, page exclusions, user impact, and remediation quality.",
    "CertScore.ai redacts or avoids retaining full query strings, payloads, identifiers, screenshots, raw DOM, and user-entered values while preserving stable anchors needed for review."
  ],
  sensitive_data_collection_with_third_party_tracking_present: [
    "This finding is an automated sensitive-surface tracking review signal, not a legal conclusion, certification, compliance determination, or determination of consent validity.",
    "Co-occurrence of a sensitive-input surface and third-party tracking context does not determine that sensitive field values were transmitted, captured, read, or linked to a third party.",
    "Automated evidence may not fully determine field purpose, data sensitivity, event capture, payload contents, masking, consent state, vendor necessity, or downstream use.",
    "Some third-party activity may support security, fraud prevention, support, performance, accessibility, or service delivery depending on context.",
    "Manual review is needed to confirm data sensitivity, payload contents, vendor purpose, consent state, minimization, page-level exclusions, and remediation quality.",
    "CertScore.ai redacts or avoids retaining full query strings, payloads, identifiers, screenshots, raw DOM, and user-entered values while preserving stable anchors needed for review."
  ],
  cpra_cba_opt_out_missing: [
    "This finding is an automated privacy-choice review signal, not a legal conclusion, certification, compliance determination, CPRA applicability determination, sale/share determination, GPC determination, or opt-out failure determination.",
    "Automated public-surface checks can identify link, policy, preference-center, CMP, and runtime context, but they may miss authenticated rights flows, region-specific links, GPC handling, preference-center behavior, mobile layouts, A/B tests, localization, and backend preference-state handling.",
    "Automated evidence may not determine whether advertising or vendor activity qualifies as sale, sharing, cross-context behavioral advertising, or targeted advertising under applicable law.",
    "Manual review is needed to confirm organization scope, applicable law, data purpose, vendor role, public choice paths, GPC handling, exemptions, user region, and remediation quality.",
    "CertScore.ai retains representative evidence for review and may not list every privacy path, footer variant, policy page, preference-center state, or regional configuration.",
    "Findings should be evaluated with implementation context and applicable privacy, consent, accessibility, and consumer-protection requirements before operational or legal reliance."
  ],
  consent_dark_patterns_detected: [
    "This finding is an automated consent UX review signal, not a legal conclusion, certification, compliance determination, dark-pattern determination, deception determination, unfairness determination, or determination of consent validity.",
    "Automated UI checks can identify choice-architecture signals, but they may miss or misclassify regional variants, A/B tests, localization, returning-user states, mobile layouts, preference-layer behavior, repeated prompts, accessibility issues, unrelated modals, and post-login flows.",
    "Automated evidence may not fully determine user intent, user impact, deception, unfairness, dark-pattern status, consent validity, or whether a legal standard applies.",
    "Manual review is needed to confirm consent context, equivalent choices, accessibility, public claims, legal interpretation, user impact, and remediation quality.",
    "CertScore.ai retains representative evidence for review and may not list every variant across regions, viewports, languages, CMP states, or user journeys.",
    "Findings should be evaluated with implementation context and applicable privacy, consent, accessibility, and consumer-protection requirements before operational or legal reliance."
  ],
  forced_consent_interaction: [
    "This finding is an automated consent UI review signal, not a legal conclusion, certification, compliance determination, dark-pattern determination, or determination of consent validity.",
    "Automated UI checks can identify prompts, overlays, and blocking or interruption signals, but they may miss or misclassify paywalls, bot challenges, age gates, login walls, app prompts, newsletter modals, regional variants, returning-user states, A/B tests, and post-login flows.",
    "Automated evidence may not fully determine whether a user had a genuine choice or whether blocking was necessary for the requested service.",
    "Manual review is needed to confirm consent context, necessity, accessibility, legal interpretation, user impact, and remediation quality.",
    "CertScore.ai retains representative evidence for review and may not list every variant across regions, viewports, languages, or CMP states.",
    "Findings should be evaluated with implementation context and applicable privacy, consent, accessibility, and consumer-protection requirements before operational or legal reliance."
  ],
  reject_option_missing_or_hidden: [
    "This finding is an automated consent UI review signal, not a legal conclusion, certification, compliance determination, or determination of consent validity.",
    "Automated consent-surface checks can identify visible control and path-availability signals, but they may miss regional variants, A/B tests, localization, returning-user states, CMP configuration, post-login flows, blocked overlays, and user-triggered preference layers.",
    "Automated evidence may not fully determine whether an equivalent refusal path exists or whether a path satisfies any legal standard.",
    "Manual review is needed to confirm UI context, equivalent choice paths, accessibility, legal interpretation, user impact, and remediation quality.",
    "CertScore.ai retains representative evidence for review and may not list every variant across regions, viewports, languages, or CMP states.",
    "Findings should be evaluated with implementation context and applicable privacy, consent, accessibility, and consumer-protection requirements before operational or legal reliance."
  ],
  asymmetric_consent_ui: [
    "This finding is an automated consent UI review signal, not a legal conclusion, certification, compliance determination, dark-pattern determination, deception determination, unfairness determination, or determination of consent validity.",
    "Automated UI checks can identify visible control, step-count, and hierarchy signals, but they may miss regional variants, A/B tests, localization, returning-user states, mobile layouts, preference-layer behavior, accessibility issues, and post-login flows.",
    "Automated evidence may not fully determine whether choices are equivalent, whether visual hierarchy is materially imbalanced, or whether a legal standard applies.",
    "Manual review is needed to confirm UI context, choice equivalence, accessibility, legal interpretation, user impact, and remediation quality.",
    "CertScore.ai retains representative evidence for review and may not list every variant across regions, viewports, languages, or CMP states.",
    "Findings should be evaluated with implementation context and applicable privacy, consent, accessibility, and consumer-protection requirements before operational or legal reliance."
  ],
  third_party_cookie_pre_consent: [
    "This finding is an automated cookie/storage review signal, not a legal conclusion, certification, compliance determination, or determination of consent validity.",
    "Automated storage observations can identify cookie or storage artifacts and timing, but they may not determine purpose, necessity, exemption status, legal basis, or downstream use.",
    "Some third-party storage may support security, fraud prevention, load balancing, session continuity, or other necessary purposes depending on context.",
    "Consent state can vary by region, browser state, prior choices, A/B tests, CMP configuration, login state, and page path.",
    "Automated evidence may miss server-side storage behavior, later user-triggered storage, blocked resources, or storage activity outside the scan scope.",
    "Manual review is needed to confirm purpose, necessity, consent state, exemption status, vendor ownership, and remediation quality.",
    "CertScore.ai redacts or avoids retaining full cookie values, query strings, and sensitive payloads while preserving stable anchors needed for review."
  ],
  cookie_disclosure_gap: [
    "This finding is an automated cookie-disclosure review signal, not a legal conclusion, certification, compliance determination, or determination that a policy is legally insufficient.",
    "Automated evidence can compare retained runtime cookie activity with retained disclosure coverage, but it may miss regional cookie tables, CMP preference-center details, or policy content loaded after interaction.",
    "Provider names, cookie families, purposes, and categories may differ across vendor documentation, CMP labels, policy pages, and browser-visible cookies.",
    "Manual review is needed to confirm policy scope, provider ownership, purpose mapping, retention, regional variants, and remediation quality.",
    "Blocked, interrupted, or content-degraded scans may limit disclosure coverage and should not be treated as clean or complete.",
    "CertScore.ai redacts or avoids retaining cookie values, query strings, and sensitive payloads while preserving stable anchors needed for review."
  ],
  long_lived_cookie_retention_review: [
    "This finding is an automated cookie-retention review signal, not a legal conclusion, certification, compliance determination, or determination of consent validity.",
    "The 365-day threshold is a CertScore.ai product review threshold, not a statutory threshold, and GDPR does not set a universal numeric cookie-lifetime threshold.",
    "Automated runtime evidence can identify cookie names, domains, page attribution, classifications, and retained expiry or duration evidence, but it may not determine purpose, necessity, legal basis, vendor role, or downstream use.",
    "Some persistent cookies may support session continuity, fraud prevention, security, preferences, or other context-dependent purposes, while others may support advertising, analytics, identity, or retargeting.",
    "Manual review is needed to confirm purpose, vendor ownership, classification, consent state, opt-out behavior, minimization, retention disclosures, and remediation quality.",
    "CertScore.ai redacts or avoids retaining cookie values, full query strings, identifiers, and sensitive payloads while preserving stable anchors needed for review."
  ],
  reject_tracking_persists_after_reject: [
    "This finding is an automated reject-enforcement review signal, not a legal conclusion, certification, compliance determination, or determination of consent validity.",
    "Automated evidence may not fully determine whether the reject interaction succeeded, whether a beacon was queued before reject, or whether a vendor was responsible for post-reject activity.",
    "Some post-reject activity may be strictly necessary, security-related, fraud-prevention, load-balancing, or otherwise context-dependent.",
    "Consent state can vary by region, browser state, prior choices, A/B tests, CMP configuration, login state, and page path.",
    "Automated evidence may miss server-side behavior, later user-triggered behavior, blocked resources, or vendor behavior outside the scan scope.",
    "Manual review is needed to confirm reject success, purpose, necessity, consent-state propagation, vendor configuration, and remediation quality.",
    "CertScore.ai redacts or avoids retaining full query strings, cookie values, identifiers, and sensitive payloads while preserving stable anchors needed for review."
  ],
  rtb_cookie_sync_observed: [
    "This finding is an automated adtech/RTB sync review signal, not a legal conclusion, certification, compliance determination, or determination of tracking lawfulness.",
    "Automated network evidence can identify sync-like endpoints, redirects, and identifier-like keys, but it does not infer a complete identity graph or determine personal identity.",
    "Redirects and sync endpoints may serve multiple purposes, including advertising, measurement, frequency capping, fraud prevention, or vendor interoperability.",
    "Identifier-like values may be pseudonymous, scoped, hashed, or otherwise limited, and public examples must not expose values.",
    "Server-side matching, partner-side processing, and downstream data use may not be visible to a browser scan.",
    "Consent timing, jurisdiction, vendor purpose, and applicable exemptions require manual review.",
    "CertScore.ai redacts or avoids retaining full query strings, identifiers, cookie values, and sensitive payloads while preserving stable anchors needed for review."
  ],
  cross_domain_identifier_sharing_observed: [
    "This finding is an automated cross-domain identifier-sharing review signal, not a legal conclusion, certification, compliance determination, sale/share determination, or determination of tracking lawfulness.",
    "Automated request evidence can identify identifier-like keys or value patterns, but it does not determine personal identity, identity resolution, or a complete identity graph.",
    "Identifier-like values may be pseudonymous, scoped, hashed, session-only, campaign-related, security-related, or otherwise limited.",
    "Some cross-domain requests may support analytics, attribution, fraud prevention, security, service delivery, or other context-dependent purposes.",
    "Server-side sharing, partner-side processing, and downstream data use may not be visible to a browser scan.",
    "Consent timing, jurisdiction, vendor purpose, and applicable exemptions require manual review.",
    "CertScore.ai redacts or avoids retaining full query strings, identifiers, cookie values, and sensitive payloads while preserving stable anchors needed for review."
  ]
};

const USER_IMPACT: Record<string, string> = {
  visual_contrast_accessibility_issue:
    "Users with low vision, color-vision differences, glare, aging-related vision changes, zoomed interfaces, or high-brightness environments may struggle to read text, identify controls, or distinguish meaningful visual states when contrast is too low.",
  semantic_labeling_accessibility_issue:
    "Clear labels, roles, and relationships help screen reader, voice control, keyboard, and cognitive-accessibility users understand what elements are, what they do, and how they relate to surrounding content.",
  text_alternative_accessibility_issue:
    "Text alternatives help screen reader, voice control, low-bandwidth, image-blocking, and cognitive-accessibility users understand meaningful non-text content.",
  keyboard_navigation_accessibility_issue:
    "Keyboard access is essential for people who use keyboards, switch devices, voice input, screen readers, or other assistive technologies to navigate and operate web interfaces.",
  focus_management_issue:
    "Predictable focus movement helps keyboard, screen-reader, voice-control, and cognitive-accessibility users understand where interaction moved and recover from dialogs, menus, overlays, and dynamic views.",
  long_lived_cookie_retention_review:
    "Long-lived tracking or unclassified cookies can affect user expectations about persistence, opt-out behavior, disclosure clarity, and data minimization, especially when cookie purpose or retention criteria are unclear."
};

const DEFAULT_LIMITATIONS = [
  "Automated findings may contain errors and should be reviewed with the retained evidence.",
  "Not detected means not observed in the scan scope; it is not proof of absence.",
  "Findings are runtime evidence and public-surface observations for review, not legal conclusions."
];

function makeBenchmarkBadge(benchmark: FindingDensityBenchmark) {
  if (benchmark.contextLabel.includes("<1%")) {
    return "Rare (<1%)";
  }

  if (benchmark.densityPct < 1.5) {
    return "Rare (~1%)";
  }

  if (benchmark.densityPct >= 15) {
    return `Frequently observed (~${Math.round(benchmark.densityPct)}%)`;
  }

  return `Seen on ~${Math.round(benchmark.densityPct)}% of comparable sites`;
}

function confidenceSemanticsFor(id: string, benchmark: FindingDensityBenchmark) {
  if (id === "pre_consent_tracking_detected") {
    return "Strong when retained runtime evidence includes consent timing, non-essential request or storage classification, concrete runtime anchors, and usable coverage; good when a concrete pre-consent artifact is present with less complete supporting detail.";
  }

  if (id === "visual_contrast_accessibility_issue") {
    return "Good when representative automated contrast-rule evidence includes rule ID, selector or element reference, page context, impact label, and WCAG-oriented references; stronger when retained evidence also includes computed color pairs, contrast ratio, text-size/state context, and repeated examples across templates. Manual review is still needed for context, exceptions, user impact, and remediation quality.";
  }

  if (id === "semantic_labeling_accessibility_issue") {
    return "Good when representative automated semantic-labeling evidence includes rule ID, selector or element reference, page context, impact label, and WCAG-oriented references; stronger when retained evidence also includes visible-label context, accessible-name or role context, repeated examples across components, and enough detail for manual verification. Manual review is still needed for semantic intent, assistive-technology behavior, and remediation quality.";
  }

  if (id === "text_alternative_accessibility_issue") {
    return "Good when representative automated text-alternative evidence includes rule ID, selector or element reference, page context, impact label, and WCAG-oriented references; stronger when retained evidence also includes element purpose context, accessible-name context, repeated examples across templates, or enough detail for manual verification. Manual review is still needed for decorative status, informative purpose, surrounding context, and remediation quality.";
  }

  if (id === "keyboard_navigation_accessibility_issue") {
    return "Good when representative automated keyboard-related evidence includes rule ID, selector or element reference, page context, impact label, and WCAG-oriented references; stronger when retained evidence also includes focus-state context, interaction-state context, repeated examples across components, or enough detail for manual keyboard-path verification. Manual review is still needed for keyboard operability, focus order, focus visibility, keyboard traps, and remediation quality.";
  }

  if (id === "focus_management_issue") {
    return "Good when representative automated focus-management evidence includes rule ID or signal type, selector or element reference, page context, and interaction-state detail; stronger when retained evidence includes modal lifecycle, focus restoration, focus containment, background inertness, repeated components, or enough detail for manual keyboard replay. Manual review is still needed for assistive-technology behavior, user impact, and remediation quality.";
  }

  if (id === "reject_option_missing_or_hidden") {
    return "Good when retained consent-surface evidence includes the observed consent layer, accept control, visible button or link labels, refusal-path availability, page context, and scan coverage; stronger when retained evidence also includes step count, preference-path context, repeated examples across regions or viewports, and enough detail for manual UI review. Manual review is still needed for legal interpretation, equivalent choice paths, accessibility, localization, and remediation quality.";
  }

  if (id === "forced_consent_interaction") {
    return "Good when retained consent-surface evidence includes the observed overlay or prompt, blocking or interruption signal, visible controls, page context, and scan coverage; stronger when retained evidence also includes scroll-lock, content-obscuring, dismiss-path, keyboard-access, or repeated viewport and region context. Manual review is still needed for necessity, equivalent choices, accessibility, legal interpretation, and remediation quality.";
  }

  if (id === "asymmetric_consent_ui") {
    return "Good when retained consent-surface evidence includes accept and refusal controls or paths, labels, first-layer availability, step-count or hierarchy context, page context, and scan coverage; stronger when retained evidence also includes repeated region or viewport examples, prominence measurements, preference-path details, or accessibility context. Manual review is still needed for equivalent-choice assessment, legal interpretation, user impact, and remediation quality.";
  }

  if (id === "consent_dark_patterns_detected") {
    return "Good when retained consent-surface evidence includes multiple choice-architecture signals, such as control availability, labels, path depth, hierarchy, overlay behavior, repeated prompts, or preference-path context; stronger when retained evidence includes repeated observations across regions, viewports, pages, or states. Manual review is still needed for user impact, legal interpretation, deception or unfairness assessment, accessibility, and remediation quality.";
  }

  if (id === "cpra_cba_opt_out_missing") {
    return "Good when retained evidence includes advertising or sale/share-related review signals, public page context, footer or privacy-link observations, policy or choice-link context, and enough detail for reviewer inspection; stronger when retained evidence also includes state-specific rights path context, GPC-specific request state or preference-center context where retained, repeated observations across pages, and usable coverage. Manual review is still needed for CPRA applicability, sale/share status, opt-out sufficiency, GPC handling, exemptions, and remediation quality.";
  }

  if (id === "third_party_cookie_pre_consent") {
    return "Good when retained runtime evidence includes a third-party cookie or storage artifact, first-seen timing, domain or scope, consent-state context, and enough page or request context for reviewer inspection; stronger when retained evidence also includes non-essential purpose classification, vendor attribution, related request context, repeated observations, and usable coverage. Manual review is still needed for purpose, necessity, exemption status, consent state, and remediation quality.";
  }

  if (id === "cookie_disclosure_gap") {
    return "Good when retained runtime cookie/storage evidence is compared against retained cookie-policy, CMP, or disclosure evidence and the mismatch is explicit; stronger when retained evidence includes cookie name or family, domain or provider, purpose/category, disclosure surface URL, reached-surface evidence, and coverage context. The runtime_vendor_not_disclosed subtype may support this parent when observed cookie/storage vendors or domains are not clearly reflected in retained disclosure evidence. Manual review is still needed for policy scope, regional variants, provider ownership, legal review, and remediation quality.";
  }

  if (id === "long_lived_cookie_retention_review") {
    return "Strong when retained runtime cookie evidence includes name, domain or host, page URL, known tracking/advertising/marketing/identity classification, duration at or above the 365-day CertScore.ai review threshold, and vendor or source URL context; good when concrete runtime evidence is complete but classification or vendor context is less specific. Unknown or unclassified cookies can surface at moderate confidence when duration and page attribution are retained. Manual review is still needed for purpose, necessity, consent state, opt-out behavior, disclosure alignment, and remediation quality.";
  }

  if (id === "reject_tracking_persists_after_reject") {
    return "Good when retained runtime evidence includes a reject-style interaction, post-reject timing, classified non-essential request or storage artifact, stable runtime anchor, and usable coverage; stronger when retained evidence also includes interaction success, consent-state transition, pre/post comparison, vendor attribution, repeated examples, and enough detail for manual verification. Manual review is still needed for reject success, queued beacons, purpose, necessity, CMP configuration, and remediation quality.";
  }

  if (id === "rtb_cookie_sync_observed") {
    return "Good when retained network evidence includes request origin and path, adtech or sync-category classification, timing, redacted identifier-like keys or redirect context, and enough context for reviewer inspection; stronger when retained evidence includes multi-hop redirect or sync-chain context, repeated sync endpoints, vendor attribution, consent timing, and usable coverage. Manual review is still needed for endpoint purpose, identifier scope, consent state, server-side behavior, and remediation quality.";
  }

  if (id === "policy_behavior_contradiction_detected") {
    return "Good when retained policy/runtime evidence includes a policy or disclosure anchor, runtime anchor, and explicit bridge rationale; the runtime_vendor_not_disclosed subtype may support this parent when observed runtime third-party vendors or domains did not clearly match retained privacy, downstream-sharing, cookie, CMP, or privacy-choice disclosure surfaces. Stronger direct runtime findings should remain primary when they use the same vendor or domain evidence. Manual review is still needed for disclosure scope, vendor ownership, applicability, and remediation quality.";
  }

  if (id === "cross_domain_identifier_sharing_observed") {
    return "Good when retained outbound request evidence includes request origin and path, destination domain, identifier-like key or redacted value pattern, timing, vendor or category classification, and enough context for reviewer inspection; stronger when retained evidence also includes repeated examples, consent timing, source and destination context, stable runtime anchors, and usable coverage. Manual review is still needed for purpose, identifier scope, identity-resolution risk, consent state, server-side behavior, and remediation quality.";
  }

  if (id === "session_recording_services_detected") {
    return "Good when retained runtime evidence includes replay-related script, request, endpoint, or vendor context with page URL, category, timing, and enough detail for reviewer inspection; stronger when retained evidence also includes consent timing, collection endpoint context, repeated examples, page exclusions, and usable coverage. Manual review is still needed for active recording status, masking, sampling, payload contents, consent state, and remediation quality.";
  }

  if (id === "sensitive_data_collection_with_third_party_tracking_present") {
    return "Good when retained page-surface evidence for a sensitive-input or sensitive-context surface co-occurs with retained third-party tracking, analytics, advertising, replay, or measurement context; stronger when retained evidence includes field context, vendor category, timing, consent state, and usable coverage. Manual review is still needed for data sensitivity, payload contents, purpose, necessity, minimization, and remediation quality.";
  }

  if (id === "possible_session_replay_on_sensitive_input_surface") {
    return "Good when retained replay-related runtime evidence co-occurs with retained sensitive-input or sensitive-context page evidence; stronger when retained evidence includes replay endpoint context, field or surface context, consent timing, masking or exclusion context, repeated examples, and usable coverage. Manual review is still needed for active capture, masking, payload contents, consent state, sensitive context, and remediation quality.";
  }

  if (id === "session_replay_present_with_sensitive_surfaces_observed") {
    return "Good when retained replay-related runtime evidence and sensitive-input or sensitive-context page evidence appear in the same scan; stronger when retained evidence includes replay endpoint context, field or surface context, consent timing, masking or exclusion context, repeated examples, and usable coverage. Manual review is still needed for same-page linkage, active capture, masking, payload contents, consent state, sensitive context, and remediation quality.";
  }

  if (id === "probable_fingerprinting") {
    return "Good when retained runtime evidence includes a multi-signal high-entropy browser/device cluster, signal categories, script or request context, and enough detail for reviewer inspection; stronger when retained evidence also includes fingerprint tier context, artifact references, identity-like or cross-domain context, consent timing, repeated examples, and usable coverage. A security or fraud-prevention purpose may explain collection but does not automatically exempt terminal-equipment access or personal-data processing. Manual review is still needed for purpose, necessity, identity linkage, consent state, downstream use, and remediation quality.";
  }

  if (id === "fingerprinting_related_signals_observed") {
    return "Good when retained runtime evidence includes browser/device signal category, script or request context, page context, and enough detail for reviewer inspection; stronger when retained evidence also includes multiple signal categories, artifact references, vendor attribution, consent timing, and usable coverage. Isolated common environment reads should remain audit-only unless paired with script or request context and a high-entropy signal category. Manual review is still needed for purpose, entropy, necessity, identity linkage, consent state, and remediation quality.";
  }

  if (id.includes("accessibility")) {
    return "good when representative automated rule evidence, selectors, and page context are retained; manual review is still needed for user impact and remediation quality";
  }

  if (id.includes("dark_patterns") || id.includes("asymmetric") || id.includes("forced") || id.includes("hidden")) {
    return "moderate to good depending on retained UI evidence; final interpretation depends on the full interaction context";
  }

  return benchmark.densityPct >= 10
    ? "strong or good when direct runtime evidence includes timing, vendor, request, cookie, or post-interaction support"
    : "good when direct runtime evidence is retained; lower prevalence does not reduce the need to review the specific evidence";
}

function makeEvidenceExamples(id: string): FindingReferenceExample[] {
  if (id === "pre_consent_tracking_detected") {
    return [
      {
        title: "Consent and request timeline",
        code: "0ms page_start\n842ms consent_banner_visible\n910ms consent_state_observed: no_choice_observed\n1,137ms https://tagmanager.example/gtm.js [supporting_context_only]\n3,405ms https://analytics.example/g/collect [classified_non_essential]\nconsent_action_observed_before_first_signal=false\nobserved_prior_consent_state_for_purpose=false"
      },
      {
        title: "Classified pre-consent runtime anchors",
        code: "artifact=req_002\ntype=network_request\nvendor=Example Analytics\npurpose_category=analytics_measurement\nessentiality=non_essential\ntimestamp_ms=3405\nquery_redacted=true\ninitiator=tagmanager.example script\n\nartifact=storage_001\ntype=cookie_write\nname=_ga\nvalue_redacted=true\npurpose_category=analytics_identifier\ntimestamp_ms=3468"
      },
      {
        title: "Coverage and caveats",
        code: "coverage_status=usable\nmaterial_block_observed=false\nscan_scope=public homepage runtime\nreview_caveat=automated observation; review consent state, vendor purpose, regional configuration, and exemptions"
      }
    ];
  }

  if (id === "third_party_cookie_pre_consent") {
    return [
      {
        title: "Third-party cookie timing example",
        code: "artifact=storage_001\nrole=finding_supporting_artifact\nurl=https://example.com/\ntype=cookie_observed\ncookie_name=example_id\nvalue_redacted=true\ncookie_domain=.ads.example\ncookie_scope=third_party\nfirst_seen_ms=1840\nconsent_action_observed_before_first_seen=false\nprior_consent_state_for_purpose=false\npurpose_category=advertising_or_measurement [manual_review_recommended]\nreview_caveat=manual review should confirm purpose, necessity, exemption status, consent state, and regional configuration"
      },
      {
        title: "Review context",
        code: "related_request_origin=https://ads.example\nrelated_request_path=/pixel [query_redacted=true]\npossible_vendor_category=advertising_or_measurement\nscan_scope=public homepage initial load\ncoverage_status=usable\nmanual_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "cookie_name=example_id [insufficient_without_timing_and_domain]\nthird_party_request_present=true [audit_only_without_cookie_artifact]\nvendor=Example Ads [insufficient_without_runtime_storage_anchor]\npolicy_mentions_cookies [insufficient_without_runtime_evidence]"
      }
    ];
  }

  if (id === "cookie_disclosure_gap") {
    return [
      {
        title: "Cookie disclosure mismatch example",
        code: "artifact=cookie_disclosure_001\nrole=finding_supporting_artifact\nsubtype=runtime_vendor_not_disclosed\nurl=https://example.com/\nruntime_cookie_name=example_id\nruntime_cookie_domain=.ads.example\nruntime_cookie_value_retained=false\npossible_provider=Example Ads\npossible_category=advertising_or_measurement\nobserved_runtime_domains=ads.example\nunmatched_runtime_domains=ads.example\npolicy_surface_type=cookie_policy\npolicy_surface_reached=true\ncookie_policy_url=https://example.com/cookie-policy\nobserved_policy_coverage=provider_or_cookie_family_not_found\nmismatch_rationale=observed runtime vendor/domain did not clearly match retained cookie disclosure evidence\nreview_caveat=manual review should confirm provider ownership, purpose, retention, regional disclosure variants, and legal review"
      },
      {
        title: "Review context",
        code: "runtime_cookie_artifact_present=true\ndisclosure_surface_scanned=true\npolicy_surfaces_searched=[cookie_policy]\ncmp_cookie_table_observed=manual_review_recommended\nvalues_redacted=true\ncoverage_status=usable\nevidence_confidence=moderate_or_strong\nmanual_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "cookie_count=12 [insufficient_without_named_runtime_artifact]\npolicy_page_missing [audit_only_without_runtime_cookie_context]\ncookie_name=example_id [insufficient_without_disclosure_comparison]\nlegal_review_claim [not_determined_by_automated_scan]"
      }
    ];
  }

  if (id === "policy_behavior_contradiction_detected") {
    return [
      {
        title: "Runtime vendor disclosure alignment example",
        code: "artifact=policy_runtime_001\nrole=finding_supporting_artifact\nsubtype=runtime_vendor_not_disclosed\nurl=https://example.com/\nruntime_anchor=third_party_request\nobserved_runtime_vendor=Example Ads\nobserved_runtime_domain=ads.example\nunmatched_runtime_domain=ads.example\npolicy_surface_type=privacy_policy\npolicy_surface_reached=true\nprivacy_policy_url=https://example.com/privacy\nmismatch_rationale=observed runtime vendor/domain did not clearly match retained privacy disclosure evidence\ncoverage_status=usable\nreview_caveat=manual review should confirm disclosure scope, provider ownership, policy variants, applicability, and legal review"
      },
      {
        title: "Disclosure surfaces searched",
        code: "policy_surfaces_searched=[privacy_policy,cookie_policy,cmp_preference_center]\nmatched_vendor_disclosure_count=1\nunmatched_vendor_disclosure_count=1\nretained_evidence_ref=policy_enrichment_001\ndirect_vs_inferred=direct\nmanual_review_needed=true"
      },
      {
        title: "When stronger runtime findings stay primary",
        code: "same_vendor_domain_cluster=true\nstronger_finding=rtb_cookie_sync_observed\nruntime_vendor_not_disclosed=related_disclosure_review_signal\nseparate_top_card=false\nsupporting_detail_preserved=true"
      }
    ];
  }

  if (id === "long_lived_cookie_retention_review") {
    return [
      {
        title: "Long-lived runtime cookie evidence",
        code: "artifact=cookie_retention_001\nrole=finding_supporting_artifact\nurl=https://example.com/\ncookie_name=_fbp\ncookie_domain=.example.com\nvalue_retained=false\nclassification=advertising_marketing\nvendor=Meta\nsource_request_url=https://connect.example/fbevents.js [query_redacted=true]\nduration_days=540\nthreshold_basis=duration_days >= 365 CertScore.ai product review threshold\nreview_caveat=manual review should confirm purpose, vendor ownership, consent state, opt-out behavior, retention disclosure, and minimization"
      },
      {
        title: "Unclassified cookie review context",
        code: "artifact=cookie_retention_002\nrole=finding_supporting_artifact\nurl=https://example.com/\ncookie_name=xbc\ncookie_domain=.example.com\nvalue_retained=false\nclassification=unknown_unclassified\nduration_days=399\nthreshold_basis=duration_days >= 365 CertScore.ai product review threshold\nclassification_review_needed=true\nreview_caveat=365 days is a CertScore.ai review threshold, not a universal statutory threshold"
      },
      {
        title: "What should not count by itself",
        code: "policy_mentions_analytics_cookies=true [insufficient_without_runtime_cookie_evidence]\ncookie_count=75 [audit_only_without_expiry_and_classification]\ncookie_name=session_id [suppressed_when_session_or_essential_only]\ncookie_domain=.example.com [insufficient_without_duration_and_page_url]\nmodel_suspicion=true [not_external_without_concrete_runtime_evidence]"
      }
    ];
  }

  if (id === "rtb_cookie_sync_observed") {
    return [
      {
        title: "Adtech sync request example",
        code: "artifact=req_003\nrole=finding_supporting_artifact\nurl=https://example.com/\nrequest_origin=https://sync.ads.example\nrequest_path=/user_sync [query_redacted=true]\nresource_type=image_or_redirect\nvendor_category=adtech_or_exchange\ndetected_pattern=identity_sync_like_request\nidentifier_like_keys=uid, partner_id [values_redacted=true]\ntimestamp_ms=2860\nreview_caveat=manual review should confirm endpoint purpose, identifier scope, consent timing, redirects, jurisdiction, and server-side behavior"
      },
      {
        title: "Review context",
        code: "possible_flow=adtech_sync_or_user_match\nredirect_chain_context=partial_or_manual_review_recommended\nconsent_timing_context=manual_review_recommended\nquery_values_redacted=true\ncoverage_status=usable\nmanual_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "adtech_vendor_present=true [insufficient_without_sync_request]\ngeneric_ad_script_loaded=true [audit_only_without_sync_pattern]\npolicy_mentions_partners [insufficient_without_runtime_request]\nidentifier_key_only [insufficient_without_origin_path_and_context]"
      }
    ];
  }

  if (id === "session_recording_services_detected") {
    return [
      {
        title: "Session replay service signal",
        code: "artifact=req_005\nrole=finding_supporting_artifact\nurl=https://example.com/\nrequest_origin=https://replay.example\nrequest_path=/recorder.js [query_redacted=true]\nresource_type=script\nvendor_category=session_replay_or_behavior_analytics\ndetected_pattern=replay_library_or_collection_endpoint\nconsent_timing_context=manual_review_recommended\nreview_caveat=manual review should confirm active collection, masking, sampling, consent state, page exclusions, and vendor configuration"
      },
      {
        title: "Review context",
        code: "possible_source=tag_manager_or_product_analytics\ncontexts_to_review=masking, sampling, page_exclusions, consent_gating, payload_contents\nsensitive_surface_observed=false\npayload_values_retained=false\nmanual_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "vendor_name=Example Replay [insufficient_without_runtime_artifact]\ngeneric_analytics_script=true [audit_only_without_replay_pattern]\npolicy_mentions_session_replay [insufficient_without_runtime_evidence]\nscreenshot_or_recording_claim [requires_manual_verification]"
      }
    ];
  }

  if (id === "cross_domain_identifier_sharing_observed") {
    return [
      {
        title: "Cross-domain identifier request example",
        code: "artifact=req_004\nrole=finding_supporting_artifact\nurl=https://example.com/\ninitiator_origin=https://example.com\ndestination_origin=https://measure.example\nrequest_path=/collect [query_redacted=true]\nthird_party_context=true\nidentifier_like_keys=client_id, campaign_id [values_redacted=true]\ntimestamp_ms=3180\nvendor_category=analytics_or_ad_measurement\nreview_caveat=manual review should confirm purpose, identifier scope, consent timing, destination role, and whether the value is pseudonymous, scoped, hashed, or otherwise limited"
      },
      {
        title: "Review context",
        code: "possible_flow=analytics_attribution_or_ad_measurement\nsource_domain=example.com\ndestination_domain=measure.example\nidentifier_values_redacted=true\nconsent_timing_context=manual_review_recommended\nmanual_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "third_party_request_present=true [insufficient_without_identifier_signal]\nvendor=Example Measurement [insufficient_without_request_anchor]\ncookie_present=true [audit_only_without_outbound_transfer]\nquery_key=id [insufficient_without_origin_destination_context]"
      }
    ];
  }

  if (id === "sensitive_data_collection_with_third_party_tracking_present") {
    return [
      {
        title: "Sensitive surface tracking context",
        code: "artifact=sensitive_tracking_001\nrole=finding_supporting_artifact\nurl=https://example.com/apply\nsurface_context=application_form\nsensitive_field_context=financial_or_identity [values_not_retained]\nthird_party_request_origin=https://analytics.example\nthird_party_request_path=/collect [query_redacted=true]\nvendor_category=analytics_or_measurement\ndetected_pattern=third_party_tracking_on_sensitive_surface\nreview_caveat=manual review should confirm data sensitivity, payload contents, purpose, consent state, minimization, and page-level exclusions"
      },
      {
        title: "Review context",
        code: "possible_source=shared_layout_or_tag_manager\ncontexts_to_review=field_purpose, event_capture, payload_contents, consent_state, vendor_purpose\npayload_values_retained=false\nraw_dom_retained=false\nmanual_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "sensitive_field_label=income [insufficient_without_runtime_tracking_context]\nthird_party_vendor_present=true [insufficient_without_same_surface_context]\nform_present=true [audit_only_without_sensitive_context]\nuser_entered_value [must_not_be_public_sample_evidence]"
      }
    ];
  }

  if (id === "possible_session_replay_on_sensitive_input_surface") {
    return [
      {
        title: "Replay near sensitive surface",
        code: "artifact=replay_sensitive_001\nrole=finding_supporting_artifact\nurl=https://example.com/apply\nreplay_request_origin=https://replay.example\nreplay_request_path=/collect [query_redacted=true]\nsurface_context=application_form\nsensitive_field_context=financial_or_identity [values_not_retained]\ndetected_pattern=replay_runtime_on_sensitive_surface\nreview_caveat=manual review should confirm active collection, masking, visual-capture settings, keystroke capture, payload contents, consent state, and page exclusions"
      },
      {
        title: "Review context",
        code: "possible_source=shared_template_or_tag_manager\nstates_to_review=default, focus, typing, validation_error, multi_step_form\npayload_values_retained=false\nscreenshots_retained=false\nmanual_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "replay_vendor_present=true [insufficient_without_sensitive_surface_context]\nsensitive_field_label=income [insufficient_without_runtime_replay_anchor]\nscreenshot_claim [requires_manual_verification]\nraw_dom_or_field_value [must_not_be_public_sample_evidence]"
      }
    ];
  }

  if (id === "fingerprinting_related_signals_observed") {
    return [
      {
        title: "Fingerprinting-related signal example",
        code: "artifact=fingerprint_related_001\nrole=finding_supporting_artifact\nurl=https://example.com/\nscript_origin=https://signals.example\nsignal_categories=canvas_or_webgl, storage [raw_values_not_retained]\nrequest_path=/collect [query_redacted=true]\nvendor_category=security_or_measurement [manual_review_recommended]\nfingerprint_cluster_strength=related_signal_not_probable\nreview_caveat=manual review should confirm purpose, entropy, necessity, consent state, vendor role, and whether the signal is linked to identifiers"
      },
      {
        title: "Review context",
        code: "possible_source=anti_fraud_analytics_or_measurement_script\ncontexts_to_review=security, fraud_prevention, analytics, advertising, compatibility, personalization\nidentity_linkage=not_determined\nraw_attribute_values_retained=false\nmanual_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "vendor_name=Example Signals [insufficient_without_runtime_signal]\ngeneric_script_loaded=true [audit_only_without_high_entropy_signal]\ncanvas_api_present [requires_signal_and_context_review]\nraw_device_attributes [must_not_be_public_sample_evidence]"
      }
    ];
  }

  if (id === "probable_fingerprinting") {
    return [
      {
        title: "Probable fingerprinting cluster example",
        code: "artifact=fingerprint_cluster_001\nrole=finding_supporting_artifact\nurl=https://example.com/\nscript_origin=https://signals.example\nsignal_categories=canvas_or_webgl, audio, storage, screen_locale [raw_values_not_retained]\nfingerprint_tier=probable_review_signal\nrequest_path=/collect [query_redacted=true]\nidentifier_linkage_context=manual_review_recommended\nreview_caveat=manual review should confirm purpose, necessity, consent state, identity linkage, endpoint role, and security or fraud-prevention context"
      },
      {
        title: "Review context",
        code: "possible_source=security_fraud_or_identity_script\ncontexts_to_review=fraud_prevention, bot_detection, analytics, advertising, identity, compatibility\ncross_domain_context=manual_review_recommended\nraw_attribute_values_retained=false\nmanual_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "single_signal=timezone [insufficient_without_cluster]\nvendor_name=Example Fingerprint [insufficient_without_runtime_cluster]\ntag_manager_present=true [audit_only_without_signal_categories]\nraw_device_attributes [must_not_be_public_sample_evidence]"
      }
    ];
  }

  if (id === "visual_contrast_accessibility_issue") {
    return [
      {
        title: "Text contrast example",
        code: "rule=color-contrast\nartifact=contrast_001\nrole=finding_supporting_artifact\nurl=https://example.com/pricing\nselector=[data-example-component=\"pricing-card\"] .example-muted-copy\nimpact=serious\nwcag_refs=1.4.3 Contrast (Minimum)\nelement_type=text\nstate=default\ncomputed_color_pair=not_retained_in_public_sample\nreview_caveat=manual review should confirm color pair, text size, font weight, state, and whether the text is meaningful user-visible content"
      },
      {
        title: "Review context",
        code: "component=pricing_card\npossible_source=design_token\nstates_to_review=default, hover, focus, active, disabled, placeholder, error\nresponsive_scope=public desktop/mobile page states observed in scan scope\nmanual_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "token_name=muted.foreground [audit_only_without_affected_element]\nselector=.text-muted [insufficient_without_rule_and_page_context]\nbrand_logo_low_contrast [requires_exception/context_review]\ndisabled_button [requires_inactive_state_review]"
      }
    ];
  }

  if (id === "semantic_labeling_accessibility_issue") {
    return [
      {
        title: "Semantic labeling example",
        code: "rule=label\nartifact=semantic_001\nrole=finding_supporting_artifact\nurl=https://example.com/signup\nselector=[data-example-component=\"signup-form\"] input[name=\"email\"]\nimpact=serious\nwcag_refs=1.3.1 Info and Relationships; 3.3.2 Labels or Instructions; 4.1.2 Name, Role, Value\nelement_type=form_field\ndetected_signal=missing_or_unassociated_label\nvisible_label_context=manual_review_recommended\naccessible_name_context=manual_review_recommended\nreview_caveat=manual review should confirm visible label, accessible name computation, instructions, grouping, and whether the field purpose is clear to assistive-technology users"
      },
      {
        title: "Review context",
        code: "component=signup_form\npossible_source=label_association_or_component_api\nstates_to_review=default, error, required, disabled, autocomplete\nassistive_technology_review_needed=true\nmanual_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "selector=input.email [insufficient_without_rule_and_page_context]\naria-label-present [audit_only_without_accessible_name_review]\ncomponent_name=TextField [audit_only_without_affected_element]\nvisual_label_nearby [requires_label_association_review]"
      }
    ];
  }

  if (id === "text_alternative_accessibility_issue") {
    return [
      {
        title: "Text alternative example",
        code: "rule=image-alt\nartifact=alt_001\nrole=finding_supporting_artifact\nurl=https://example.com/features\nselector=[data-example-component=\"feature-card\"] img\nimpact=critical\nwcag_refs=1.1.1 Non-text Content\nelement_type=image\ndetected_signal=missing_text_alternative\npurpose_context=manual_review_recommended\nreview_caveat=manual review should confirm whether the image is informative, functional, decorative, redundant, or covered by surrounding text"
      },
      {
        title: "Review context",
        code: "component=feature_card\npossible_source=image_component_or_cms_content\ncontexts_to_review=informative, decorative, functional, redundant, logo, image_of_text\nassistive_technology_review_needed=true\nmanual_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "filename=hero-image.png [audit_only_without_affected_element]\nselector=img.hero [insufficient_without_rule_and_page_context]\nempty_alt_on_decorative_image [requires_decorative_status_review]\nbrand_logo_without_alt [requires_logo/context_review]"
      }
    ];
  }

  if (id === "keyboard_navigation_accessibility_issue") {
    return [
      {
        title: "Keyboard navigation example",
        code: "rule=keyboard\nartifact=keyboard_001\nrole=finding_supporting_artifact\nurl=https://example.com/navigation\nselector=[data-example-component=\"nav-menu\"] button[aria-expanded]\nimpact=serious\nwcag_refs=2.1.1 Keyboard; 2.4.7 Focus Visible; 4.1.2 Name, Role, Value\nelement_type=custom_control\ndetected_signal=keyboard_or_focus_review_needed\ninteraction_state=collapsed [manual_review_recommended]\nreview_caveat=manual review should confirm keyboard operation, focus visibility, focus order, expanded/collapsed behavior, and escape/close behavior where relevant"
      },
      {
        title: "Review context",
        code: "component=nav_menu\npossible_source=custom_control_or_focus_management\nstates_to_review=default, focus, expanded, collapsed, open, closed, modal, overlay\nkeyboard_paths_to_review=Tab, Shift+Tab, Enter, Space, Escape, Arrow keys where applicable\nmanual_keyboard_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "selector=.nav-button [insufficient_without_rule_and_page_context]\ntabindex_present [audit_only_without_keyboard_path_review]\ncustom_component=Menu [audit_only_without_affected_element]\nfocus_style_hidden [requires_focus_visibility_context_review]"
      }
    ];
  }

  if (id === "focus_management_issue") {
    return [
      {
        title: "Focus management example",
        code: "rule=focus-management\nartifact=focus_001\nrole=finding_supporting_artifact\nurl=https://example.com/app\nselector=[data-example-component=\"dialog\"]\nimpact=serious\nwcag_refs=2.4.3 Focus Order; 2.4.7 Focus Visible; 4.1.2 Name, Role, Value\nelement_type=modal_or_overlay\ninteraction_state=open [manual_review_recommended]\ndetected_signal=focus_not_moved_or_restored\nreview_caveat=manual review should confirm focus lifecycle, background inertness, keyboard trap risk, and screen-reader context"
      },
      {
        title: "Review context",
        code: "component=dialog_or_drawer\nstates_to_review=open, close, escape, tab, shift_tab, route_change, validation_error\npossible_source=component_focus_lifecycle\nmanual_keyboard_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "selector=.modal [insufficient_without_interaction_state]\nfocus_outline_removed [audit_only_without_user_path_context]\ncomponent_name=Dialog [audit_only_without_focus_artifact]\nvisual_claim [requires_keyboard_review]"
      }
    ];
  }

  if (id.includes("accessibility")) {
    return [
      {
        title: "Accessibility issue example",
        code: "rule=automated_accessibility_check\nselector=representative affected node\nimpact=review\nwcag_refs=review applicable success criterion\nuser_impact=Review the retained selector and page context."
      }
    ];
  }

  if (id === "reject_tracking_persists_after_reject") {
    return [
      {
        title: "Post-reject runtime artifact",
        code: "artifact=req_002\nrole=finding_supporting_artifact\nurl=https://example.com/\nreject_action_timestamp_ms=2600\nreject_action_observed=true\nreject_interaction_status=observed [manual_review_recommended]\npost_reject_request_timestamp_ms=4120\nrequest_origin=https://analytics.example\nrequest_path=/collect [query_redacted=true]\nvendor_category=analytics\nessentiality=non_essential\nreview_caveat=manual review should confirm reject success, queued-beacon timing, purpose, necessity, and CMP/vendor configuration"
      },
      {
        title: "Review context",
        code: "pre_reject_activity_observed=true\npost_reject_activity_observed=true\nconsent_state_transition=manual_review_recommended\npossible_source=cmp_to_tag_manager_propagation\ncoverage_status=usable\nmanual_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "reject_button_present=true [insufficient_without_interaction]\nvendor=Example Analytics [insufficient_without_post_reject_artifact]\npost_reject_request_unknown_purpose [audit_only_until_classified]\ntracking_before_reject_only [insufficient_for_persistence]"
      }
    ];
  }

  if (id === "cpra_cba_opt_out_missing") {
    return [
      {
        title: "Privacy choice review signal",
        code: "artifact=privacy_choice_001\nrole=finding_supporting_artifact\nurl=https://example.com/\nobserved_surface=footer_and_privacy_links\nadvertising_or_cross_context_signal=true [manual_review_recommended]\ndo_not_sell_or_share_link_observed=false\nstate_privacy_choice_link_observed=false\nprivacy_policy_url=https://example.com/privacy\ngpc_specific_request_state=not_sent_or_not_retained\ngpc_handling=not_determined\nreview_caveat=manual review should confirm CPRA applicability, sale/share or cross-context behavioral advertising status, opt-out path availability, GPC-specific scan state, exemptions, and regional configuration"
      },
      {
        title: "Review context",
        code: "possible_source=footer_privacy_links_or_preference_center\npaths_to_review=footer, privacy_policy, cookie_settings, state_privacy_notice, do_not_sell_or_share, preference_center\nruntime_context=advertising_or_cross_context_review_signal\ncoverage_status=usable\nmanual_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "adtech_vendor_present=true [insufficient_without_choice_path_context]\npolicy_mentions_california [audit_only_without_runtime_or_link_context]\nprivacy_policy_present=true [insufficient_without_opt_out_path_review]\nmissing_dns_link_claim [insufficient_without_retained_public_surface_evidence]"
      }
    ];
  }

  if (id === "consent_dark_patterns_detected") {
    return [
      {
        title: "Choice architecture review signal",
        code: "artifact=consent_ui_004\nrole=finding_supporting_artifact\nurl=https://example.com/\ncomponent=cookie_banner\nsignals=reject_path_nested, accept_primary, repeated_prompt_after_dismiss\naccept_control_text=Accept all\npreferences_control_text=Manage choices\nreject_control_location=preferences_layer [manual_review_recommended]\nprompt_reappeared_after_dismiss=true [manual_review_recommended]\nreview_caveat=manual review should confirm choice equivalence, repetition, accessibility, region, CMP configuration, user impact, and legal interpretation"
      },
      {
        title: "Preference revisitability review signal",
        code: "artifact=consent_control_lifecycle_001\nrole=finding_supporting_artifact\nurl=https://example.com/\nsubtype=privacy_settings_control_not_observed\ninitial_consent_layer_observed=true\ntracking_requiring_consent_review_observed=true\ncoverage_status=usable\npages_checked=[https://example.com/]\ncontrols_searched=[cookie preferences, privacy settings, manage consent]\nfooter_links_inspected=retained_bounded_labels_and_hrefs\nprivacy_settings_control_observed=false\ncookie_preferences_link_observed=false\ncmp_reopen_control_observed=false\nwithdrawal_text_observed=false\nreview_caveat=automated public-page observation; manual review should confirm regional variants, returning-user state, CMP configuration, and legal interpretation"
      },
      {
        title: "Review context",
        code: "possible_source=cmp_choice_architecture\ncontexts_to_review=first_layer_controls, preference_path, visual_hierarchy, repeated_prompting, preference_revisitability, keyboard_access, screen_reader_access\njurisdictional_review_needed=true\nmanual_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "cmp_vendor=Example CMP [insufficient_without_consent_surface_artifact]\nbanner_present=true [insufficient_without_choice_architecture_signal]\naccept_button_primary=true [audit_only_without_refusal_path_context]\ndark_pattern_label [not_a_finding_determination]"
      }
    ];
  }

  if (id === "forced_consent_interaction") {
    return [
      {
        title: "Forced interaction example",
        code: "artifact=consent_ui_002\nrole=finding_supporting_artifact\nurl=https://example.com/\ncomponent=consent_overlay\nobserved_state=modal_overlay_visible\nordinary_page_access=blocked_in_observed_scope\nscroll_state=blocked_or_obscured [manual_review_recommended]\nvisible_controls=Accept all, Manage choices\ndismiss_or_continue_without_choice_observed=false\nreview_caveat=manual review should confirm whether blocking is consent-related, region-specific, necessary, accessible, and whether an equivalent non-accept path exists"
      },
      {
        title: "Review context",
        code: "possible_source=cmp_overlay_template\nstates_to_review=initial_load, scroll, keyboard_focus, settings_layer, close_or_continue_path\ninterruptions_to_exclude=bot_challenge, paywall, age_gate, login_wall, newsletter_modal\nmanual_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "banner_present=true [insufficient_without_blocking_context]\nmodal_detected=true [audit_only_until_consent_related]\nscroll_locked=true [audit_only_without_consent_surface_link]\ninteraction_required_claim [requires_manual_choice_context_review]"
      }
    ];
  }

  if (id === "reject_option_missing_or_hidden") {
    return [
      {
        title: "Reject availability example",
        code: "artifact=consent_ui_001\nrole=finding_supporting_artifact\nurl=https://example.com/\ncomponent=cookie_banner\nobserved_layer=initial\naccept_control_text=Accept all\nreject_control_observed=false\npreferences_control_text=Manage choices\nconsent_action_observed=false\nscan_scope=public homepage initial load\nreview_caveat=manual review should confirm whether an equivalent refusal path exists for the relevant region, language, viewport, and CMP configuration"
      },
      {
        title: "Review context",
        code: "possible_source=cmp_template_or_region_config\ncontrols_to_review=accept, reject, decline, manage choices, close, continue without accepting\npaths_to_review=initial_layer, preferences_layer, footer_privacy_link\naccessibility_review_needed=true\nmanual_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "cmp_vendor=Example CMP [audit_only_without_visible_controls]\nbanner_present=true [insufficient_without_button_labels]\npolicy_mentions_opt_out [insufficient_without_runtime_consent_surface]\nreject_not_clicked [insufficient_without_control_availability_context]"
      }
    ];
  }

  if (id === "asymmetric_consent_ui") {
    return [
      {
        title: "Choice imbalance example",
        code: "artifact=consent_ui_003\nrole=finding_supporting_artifact\nurl=https://example.com/\ncomponent=cookie_banner\naccept_control_text=Accept all\nreject_control_text=Reject all\naccept_layer=initial\nreject_layer=settings\naccept_steps=1\nreject_steps=3 [manual_review_recommended]\nvisual_hierarchy=accept_primary_vs_reject_secondary [manual_review_recommended]\nreview_caveat=manual review should confirm step count, visual hierarchy, accessibility, region, localization, and equivalent-choice context"
      },
      {
        title: "Review context",
        code: "possible_source=cmp_button_hierarchy_or_preference_flow\npaths_to_review=accept_path, reject_path, manage_choices_path, close_path\nstates_to_review=initial_layer, preferences_layer, mobile_viewport, keyboard_focus\nmanual_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "accept_button_primary=true [audit_only_without_refusal_path_context]\nreject_button_secondary=true [requires_hierarchy_and_context_review]\npreferences_link_present=true [insufficient_without_path_depth]\ncmp_vendor=Example CMP [insufficient_without_observed_controls]"
      }
    ];
  }

  if (id.includes("consent") || id.includes("reject")) {
    return [
      {
        title: "Consent UI observation",
        code: "accept_visible=true\nreject_visible=false\nsettings_visible=true\nsteps_to_accept=1\nsteps_to_reject=3\nbanner_blocks_content=true"
      }
    ];
  }

  if (id === "session_replay_present_with_sensitive_surfaces_observed") {
    return [
      {
        title: "Replay plus sensitive surface scan context",
        code: "artifact=replay_sensitive_scan_001\nrole=finding_supporting_artifact\nurl=https://example.com/\nreplay_request_origin=https://replay.example\nreplay_request_path=/collect [query_redacted=true]\nsensitive_surface_context=account_or_application_form [values_not_retained]\nobserved_scope=same_scan\nsame_page_or_same_flow_linkage=false_or_not_retained\nreview_caveat=manual review should confirm active collection, masking, visual-capture settings, payload contents, consent state, and page exclusions"
      },
      {
        title: "Review context",
        code: "possible_source=shared_template_or_tag_manager\ncontexts_to_review=replay_vendor_config, masking, sampling, page_exclusions, consent_gating, field_purpose\npayload_values_retained=false\nscreenshots_retained=false\nmanual_review_needed=true"
      },
      {
        title: "What should not count by itself",
        code: "replay_vendor_present=true [insufficient_without_sensitive_surface_context]\nsensitive_field_label=income [insufficient_without_runtime_replay_anchor]\nsame_scan_context [does_not_show_field_value_capture]\nraw_dom_or_field_value [must_not_be_public_sample_evidence]"
      }
    ];
  }

  return [
    {
      title: "Runtime evidence",
      code: "signal_retained=true\nsource=runtime_observation\nreview_recommended=true"
    }
  ];
}

function makeFallbackEvidenceBlocks(findingId: string): Record<string, unknown> {
  const blocks: Record<string, unknown> = {};

  if (
    findingId === "pre_consent_tracking_detected" ||
    findingId === "third_party_cookie_pre_consent" ||
    findingId === "cookie_disclosure_gap" ||
    findingId === "reject_tracking_persists_after_reject"
  ) {
    blocks.consentTimeline = {
      consentStateBasis: "observed_scan_scope",
      consentActionObservedBeforeFirstSignal: false,
      manualReviewNeeded: true
    };
  }

  if (
    findingId === "pre_consent_tracking_detected" ||
    findingId === "third_party_cookie_pre_consent" ||
    findingId === "reject_tracking_persists_after_reject" ||
    findingId === "rtb_cookie_sync_observed" ||
    findingId === "cross_domain_identifier_sharing_observed"
  ) {
    blocks.networkEvidence = {
      artifactRefs: [],
      queryStringsRedacted: true,
      valuesRedacted: true,
      manualReviewNeeded: true
    };
  }

  if (
    findingId === "reject_option_missing_or_hidden" ||
    findingId === "forced_consent_interaction" ||
    findingId === "asymmetric_consent_ui" ||
    findingId === "consent_dark_patterns_detected" ||
    findingId === "cpra_cba_opt_out_missing"
  ) {
    blocks.uiEvidence = {
      observedSurface: findingId === "cpra_cba_opt_out_missing" ? "public_privacy_choice_surface" : "consent_surface",
      retainedControlContext: true,
      manualReviewNeeded: true
    };
  }

  if (
    findingId === "visual_contrast_accessibility_issue" ||
    findingId === "semantic_labeling_accessibility_issue" ||
    findingId === "text_alternative_accessibility_issue" ||
    findingId === "keyboard_navigation_accessibility_issue" ||
    findingId === "focus_management_issue"
  ) {
    blocks.accessibilityEvidence = {
      ruleId: "representative_automated_rule",
      selector: "redacted_selector_reference",
      pageUrl: "https://example.com/",
      impact: "review",
      wcagRefs: ["WCAG-oriented automated review reference"],
      elementType: "user_visible_element",
      elementState: "observed_state",
      repeatedInstanceCount: 1,
      componentOrTemplateScope: "manual_review_recommended",
      exceptionContext: "not_determined",
      manualReviewNeeded: true
    };
  }

  if (findingId === "session_recording_services_detected" || findingId === "possible_session_replay_on_sensitive_input_surface") {
    blocks.sessionReplayEvidence = {
      replayArtifactObserved: true,
      replayCollectionEndpointObserved: "not_determined",
      maskingOrPageExclusionObserved: "not_determined",
      captureOrRetentionDetermined: false,
      manualReviewNeeded: true
    };
  }

  if (
    findingId === "sensitive_data_collection_with_third_party_tracking_present" ||
    findingId === "possible_session_replay_on_sensitive_input_surface"
  ) {
    blocks.sensitiveSurfaceEvidence = {
      sensitiveSurfaceObserved: true,
      surfaceCategory: "sensitive_or_high_risk_context_review",
      article9SpecialCategoryDetermined: false,
      userEnteredValuesRetained: false,
      manualReviewNeeded: true
    };
  }

  if (findingId === "fingerprinting_related_signals_observed" || findingId === "probable_fingerprinting") {
    blocks.fingerprintEvidence = {
      clusterSize: findingId === "probable_fingerprinting" ? "multi_signal_cluster" : "related_signal",
      entropyTiers: findingId === "probable_fingerprinting" ? ["high", "medium"] : ["review"],
      clusterStrength: findingId === "probable_fingerprinting" ? "probable_review_signal" : "related_signal_not_probable",
      identifierLinkageContext: "manual_review_recommended",
      possibleSecurityOrFraudPurpose: "not_determined",
      rawDeviceValuesRetained: false,
      manualReviewNeeded: true
    };
  }

  return blocks;
}

function makeFallbackSample(definition: CertScoreFindingDefinition, benchmark: FindingDensityBenchmark): SampleFindingJson {
  return {
    findingId: definition.id,
    label: definition.label,
    sourceLabel: ILLUSTRATIVE_PUBLIC_SAMPLE_FINDING_IDS.has(definition.id)
      ? "Illustrative public evidence sample"
      : benchmark.sourceLabel,
    payload: {
      id: definition.id,
      title: definition.label,
      category: CATEGORY_BY_FINDING_ID[definition.id] ?? "Third-party tracking",
      section: definition.section,
      criticality: SEVERITY_OVERRIDES[definition.id] ?? SEVERITY_BY_SECTION[definition.section],
      confidenceSemantics: confidenceSemanticsFor(definition.id, benchmark),
      evidenceVersion: "2.0",
      evidenceConfidence: SAMPLE_EVIDENCE_CONFIDENCE[definition.id] ?? "review_signal",
      directVsInferred: SAMPLE_DIRECTNESS[definition.id] ?? "direct_observation",
      scanContext: {
        domain: "example.com",
        requestedUrl: "https://example.com/",
        finalUrl: "https://example.com/",
        publicWebObservation: true,
        legalConclusion: false
      },
      artifacts: {
        runtimeAnchors: [],
        requestSamples: [],
        cookieOrStorageSamples: [],
        policyAnchors: [],
        rawValuesRetained: false
      },
      classification: {
        section: definition.section,
        criticality: SEVERITY_OVERRIDES[definition.id] ?? SEVERITY_BY_SECTION[definition.section],
        evidenceConfidence: SAMPLE_EVIDENCE_CONFIDENCE[definition.id] ?? "review_signal",
        directVsInferred: SAMPLE_DIRECTNESS[definition.id] ?? "direct_observation",
        legalStatusDetermined: false
      },
      coverage: {
        coverageFlags: [],
        coverageReliableForTopRanking: true,
        notDetectedMeans: "not_observed_in_scan_scope",
        manualReviewNeeded: true
      },
      observed: OBSERVED[definition.id] ?? definition.whyItMatters,
      detectionMethodology: METHODOLOGY[definition.id] ?? definition.whyItMatters,
      topFindingCalibration: FINDING_TOP_FINDING_RULES[definition.id] ?? DEFAULT_TOP_FINDING_RULE,
      evidenceExamples: makeEvidenceExamples(definition.id),
      automationLimits: [
        "Automated public-web observations do not determine legal status, compliance status, proof that a law was breached, proof of data capture, or tracking lawfulness.",
        "Manual review is needed to confirm purpose, necessity, jurisdiction, configuration, exemptions, and remediation quality."
      ],
      redaction: {
        rawIdentifiersRetained: false,
        storageValueContentsRetained: false,
        completeQueryStringsRetained: false,
        requestBodiesRetained: false,
        renderedPageImagesRetained: false,
        sourceMarkupRetained: false,
        userEnteredValuesRetained: false
      },
      selectionReason:
        "Illustrative public sample selected to show retained evidence, directness, limits, and top-finding calibration.",
      ...makeFallbackEvidenceBlocks(definition.id),
      limitations: LIMITATIONS[definition.id] ?? DEFAULT_LIMITATIONS
    }
  };
}

export const DETECTION_METHODOLOGY_SECTIONS: DetectionMethodologySection[] = [
  {
    id: "method-pre-consent-tracking",
    title: "How detection works: pre-consent tracking",
    categories: ["Consent", "Cookies", "Third-party tracking"],
    body:
      "CertScore.ai compares consent-state observations with request, vendor, and cookie timing. A signal is stronger when the scan retains page-start timing, a visible consent surface, no observed consent action, and classified non-essential requests or storage before the choice point.",
    evidenceExamples: makeEvidenceExamples("pre_consent_tracking_detected")
  },
  {
    id: "method-rtb-cookie-sync",
    title: "How detection works: RTB cookie sync",
    categories: ["Third-party tracking", "Cookies"],
    body:
      "RTB and identity-sync review looks for known ad exchange hosts, redirect chains, sync endpoints, and identifier-like query keys. The finding is about observed sync-style evidence, not a conclusion about every downstream partner or data use.",
    evidenceExamples: makeEvidenceExamples("rtb_cookie_sync_observed")
  },
  {
    id: "method-fingerprinting",
    title: "How detection works: fingerprinting-related signals",
    categories: ["Fingerprinting"],
    body:
      "Fingerprinting review separates weak related signals from stronger probable clusters. Single browser attributes may remain a related signal; clusters involving high-entropy APIs, storage probes, identity context, or cross-domain linkage can support probable fingerprinting review.",
    evidenceExamples: makeEvidenceExamples("probable_fingerprinting")
  },
  {
    id: "method-session-replay",
    title: "How detection works: session replay",
    categories: ["Third-party tracking"],
    body:
      "Session replay detection starts with vendor and script signatures, then adds page context. Sensitive-surface findings require co-occurrence evidence between replay runtime and forms or pages that appear to collect sensitive information.",
    evidenceExamples: makeEvidenceExamples("possible_session_replay_on_sensitive_input_surface")
  },
  {
    id: "method-accessibility",
    title: "How detection works: accessibility findings",
    categories: ["Accessibility"],
    body:
      "Accessibility findings retain representative automated examples with selectors, rule IDs, impact labels, and WCAG-oriented categories. They are triage findings: useful for prioritization, but remediation quality still needs keyboard, screen reader, zoom, and design-system review.",
    evidenceExamples: makeEvidenceExamples("visual_contrast_accessibility_issue")
  }
];

export function getFindingReferenceItems(): FindingReferenceItem[] {
  return TOP_FINDING_IDS.flatMap((findingId) => {
    if (PUBLIC_DEFERRED_FINDING_IDS.has(findingId)) {
      return [];
    }

    const definition = CERT_SCORE_FINDING_REGISTRY[findingId];
    const benchmark = FINDING_DENSITY_BENCHMARKS[findingId];

    if (!definition || !benchmark) {
      return [];
    }

    const item: FindingReferenceItem = {
      id: definition.id,
      title: PUBLIC_TITLE_OVERRIDES[findingId] ?? definition.label,
      category: CATEGORY_BY_FINDING_ID[findingId] ?? "Third-party tracking",
      runtimeSection: definition.section,
      criticality: SEVERITY_OVERRIDES[findingId] ?? SEVERITY_BY_SECTION[definition.section],
      confidenceSemantics: confidenceSemanticsFor(findingId, benchmark),
      observed: OBSERVED[findingId] ?? definition.whyItMatters,
      detectionMethodology: METHODOLOGY[findingId] ?? definition.whyItMatters,
      evidenceStandard: EVIDENCE_STANDARDS[findingId],
      topFindingRule: FINDING_TOP_FINDING_RULES[findingId] ?? DEFAULT_TOP_FINDING_RULE,
      exampleEvidence: makeEvidenceExamples(findingId),
      commonCauses: COMMON_CAUSES[findingId] ?? ["Unexpected runtime configuration", "Third-party tag behavior changed", "Public surface differed from expected implementation"],
      reviewQuestions: REVIEW_QUESTIONS[findingId] ?? ["What signal was retained?", "Which public surface or runtime event supports it?", "What implementation owner can confirm the behavior?"],
      relatedFindingIds: (RELATED_FINDINGS[findingId] ?? []).filter((id) => !PUBLIC_DEFERRED_FINDING_IDS.has(id)),
      benchmark,
      benchmarkBadge: makeBenchmarkBadge(benchmark),
      limitations: [...(LIMITATIONS[findingId] ?? []), ...DEFAULT_LIMITATIONS],
      userImpact: USER_IMPACT[findingId],
      sample: getSampleFindingById(findingId) ?? makeFallbackSample(definition, benchmark),
      regulatoryContext: sanitizePublicRegulatoryContext(FINDING_REGULATORY_CONTEXTS[findingId])
    };

    return [item];
  });
}

export const getTopFindingAtlasItems = getFindingReferenceItems;

export function getFindingReferenceObservedCopy(findingId: string) {
  const definition = CERT_SCORE_FINDING_REGISTRY[findingId];
  if (!definition) {
    return null;
  }

  return OBSERVED[findingId] ?? definition.whyItMatters;
}

export function getFindingReferenceTitle(findingId: string) {
  const definition = CERT_SCORE_FINDING_REGISTRY[findingId];
  if (!definition) {
    return null;
  }

  return PUBLIC_TITLE_OVERRIDES[findingId] ?? definition.label;
}

export function getFindingReferenceCriticality(findingId: string) {
  const definition = CERT_SCORE_FINDING_REGISTRY[findingId];
  if (!definition) {
    return null;
  }

  return SEVERITY_OVERRIDES[findingId] ?? SEVERITY_BY_SECTION[definition.section];
}
