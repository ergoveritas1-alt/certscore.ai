import {
  CERT_SCORE_FINDING_REGISTRY,
  type CertScoreFindingDefinition,
  type CertScoreFindingSeverity
} from "../scans/finding-registry";
import {
  FINDING_DENSITY_BENCHMARKS,
  type FindingDensityBenchmark
} from "../scans/finding-density-benchmarks";
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

export type FindingReferenceItem = {
  id: string;
  title: string;
  category: FindingReferenceCategory;
  runtimeSection: CertScoreFindingDefinition["section"];
  criticality: CertScoreFindingSeverity;
  confidenceSemantics: string;
  observed: string;
  detectionMethodology: string;
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

const TOP_FINDING_IDS = [
  "pre_consent_tracking_detected",
  "visual_contrast_accessibility_issue",
  "semantic_labeling_accessibility_issue",
  "fingerprinting_related_signals_observed",
  "session_recording_services_detected",
  "third_party_cookie_pre_consent",
  "rtb_cookie_sync_observed",
  "text_alternative_accessibility_issue",
  "consent_dark_patterns_detected",
  "cpra_cba_opt_out_missing",
  "forced_consent_interaction",
  "reject_option_missing_or_hidden",
  "sensitive_data_collection_with_third_party_tracking_present",
  "asymmetric_consent_ui",
  "keyboard_navigation_accessibility_issue",
  "cross_domain_identifier_sharing_observed",
  "reject_tracking_persists_after_reject",
  "possible_session_replay_on_sensitive_input_surface",
  "probable_fingerprinting"
] as const;

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
  possible_session_replay_on_sensitive_input_surface: "critical",
  probable_fingerprinting: "critical",
  reject_tracking_persists_after_reject: "high",
  pre_consent_tracking_detected: "high",
  third_party_cookie_pre_consent: "high"
};

const CATEGORY_BY_FINDING_ID: Record<string, FindingReferenceCategory> = {
  asymmetric_consent_ui: "Consent",
  consent_dark_patterns_detected: "Consumer protection",
  cpra_cba_opt_out_missing: "Disclosure gaps",
  cross_domain_identifier_sharing_observed: "Third-party tracking",
  fingerprinting_related_signals_observed: "Fingerprinting",
  forced_consent_interaction: "Consent",
  keyboard_navigation_accessibility_issue: "Accessibility",
  possible_session_replay_on_sensitive_input_surface: "Third-party tracking",
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

const RELATED_FINDINGS: Record<string, string[]> = {
  asymmetric_consent_ui: ["reject_option_missing_or_hidden", "forced_consent_interaction", "consent_dark_patterns_detected"],
  consent_dark_patterns_detected: ["asymmetric_consent_ui", "reject_option_missing_or_hidden", "forced_consent_interaction"],
  cpra_cba_opt_out_missing: ["cross_domain_identifier_sharing_observed", "rtb_cookie_sync_observed", "pre_consent_tracking_detected"],
  cross_domain_identifier_sharing_observed: ["rtb_cookie_sync_observed", "pre_consent_tracking_detected", "cpra_cba_opt_out_missing"],
  fingerprinting_related_signals_observed: ["probable_fingerprinting", "pre_consent_tracking_detected", "cross_domain_identifier_sharing_observed"],
  forced_consent_interaction: ["reject_option_missing_or_hidden", "asymmetric_consent_ui", "consent_dark_patterns_detected"],
  keyboard_navigation_accessibility_issue: ["focus_management_issue", "semantic_labeling_accessibility_issue", "visual_contrast_accessibility_issue"],
  possible_session_replay_on_sensitive_input_surface: [
    "session_recording_services_detected",
    "sensitive_data_collection_with_third_party_tracking_present",
    "pre_submit_text_capture_detected"
  ],
  pre_consent_tracking_detected: ["third_party_cookie_pre_consent", "rtb_cookie_sync_observed", "reject_tracking_persists_after_reject"],
  probable_fingerprinting: ["fingerprinting_related_signals_observed", "device_data_collection_detected", "cross_domain_identifier_sharing_observed"],
  reject_option_missing_or_hidden: ["asymmetric_consent_ui", "forced_consent_interaction", "consent_dark_patterns_detected"],
  reject_tracking_persists_after_reject: ["pre_consent_tracking_detected", "third_party_cookie_pre_consent", "reject_option_missing_or_hidden"],
  rtb_cookie_sync_observed: ["cross_domain_identifier_sharing_observed", "pre_consent_tracking_detected", "cpra_cba_opt_out_missing"],
  semantic_labeling_accessibility_issue: ["keyboard_navigation_accessibility_issue", "text_alternative_accessibility_issue", "focus_management_issue"],
  sensitive_data_collection_with_third_party_tracking_present: [
    "possible_session_replay_on_sensitive_input_surface",
    "session_recording_services_detected",
    "pre_consent_tracking_detected"
  ],
  session_recording_services_detected: [
    "possible_session_replay_on_sensitive_input_surface",
    "sensitive_data_collection_with_third_party_tracking_present",
    "pre_consent_tracking_detected"
  ],
  text_alternative_accessibility_issue: ["semantic_labeling_accessibility_issue", "visual_contrast_accessibility_issue"],
  third_party_cookie_pre_consent: ["pre_consent_tracking_detected", "rtb_cookie_sync_observed", "reject_tracking_persists_after_reject"],
  visual_contrast_accessibility_issue: ["text_alternative_accessibility_issue", "semantic_labeling_accessibility_issue"]
};

const OBSERVED: Record<string, string> = {
  visual_contrast_accessibility_issue:
    "Retained accessibility evidence included text or controls where foreground and background colors did not meet the applicable automated contrast threshold.",
  pre_consent_tracking_detected:
    "Runtime evidence showed non-essential tracking requests, vendors, or storage activity before the scan recorded a consent choice.",
  semantic_labeling_accessibility_issue:
    "Accessibility evidence included controls, links, regions, form fields, or ARIA attributes with missing, invalid, or ambiguous accessible semantics.",
  fingerprinting_related_signals_observed:
    "Signals associated with browser, device, canvas, storage, or high-entropy environment collection were observed, but the evidence did not necessarily prove fingerprinting.",
  session_recording_services_detected:
    "A vendor or script associated with session replay, recording, heatmaps, or behavior analytics appeared in retained runtime evidence.",
  third_party_cookie_pre_consent:
    "A cookie associated with a third-party service or non-essential purpose was observed before a recorded consent action.",
  rtb_cookie_sync_observed:
    "Advertising or identity endpoints appeared to match, sync, or redirect identifiers across adtech domains during the observed page load.",
  text_alternative_accessibility_issue:
    "Automated accessibility evidence found non-text content, images, or objects without adequate retained text alternative evidence.",
  consent_dark_patterns_detected:
    "Consent interface signals suggested that refusal may be materially less available than acceptance.",
  cpra_cba_opt_out_missing:
    "Advertising or cross-context tracking signals were observed without retained evidence of a clear CPRA-style opt-out or privacy choices path.",
  forced_consent_interaction:
    "The observed page flow appeared to require interaction with a consent prompt before normal browsing could continue.",
  reject_option_missing_or_hidden:
    "A first-layer reject path was not visible, was less prominent, or appeared harder to reach than the accept path.",
  sensitive_data_collection_with_third_party_tracking_present:
    "A page or form that appeared to collect sensitive information loaded third-party tracking or analytics context in the same observed flow.",
  asymmetric_consent_ui:
    "The accept and reject choices appeared visually or procedurally imbalanced in the retained consent UI evidence.",
  keyboard_navigation_accessibility_issue:
    "Accessibility evidence suggested important controls may be hard to reach, operate, or understand through keyboard-only interaction.",
  cross_domain_identifier_sharing_observed:
    "Identifier-like values appeared in outbound requests to external advertising, identity, measurement, or attribution destinations.",
  reject_tracking_persists_after_reject:
    "Tracking activity remained visible after the scanner performed a reject-style interaction and compared post-reject evidence.",
  possible_session_replay_on_sensitive_input_surface:
    "Replay-related runtime evidence appeared near a page or form surface that may collect sensitive information.",
  probable_fingerprinting:
    "A cluster of high-entropy browser or device collection signals was strong enough to warrant fingerprinting-specific review."
};

const METHODOLOGY: Record<string, string> = {
  visual_contrast_accessibility_issue:
    "CertScore retains representative axe-style rule evidence, affected selectors, impact labels, and page URLs, then promotes the observation when examples indicate a WCAG contrast-oriented barrier.",
  pre_consent_tracking_detected:
    "The scanner timestamps page start, consent-state observations, requests, cookies, and vendors. A finding is promoted when non-essential tracking signals appear before a consent action is observed.",
  semantic_labeling_accessibility_issue:
    "Automated accessibility checks inspect accessible names, labels, roles, ARIA validity, and semantic structure, then retain representative examples rather than every repeated node.",
  fingerprinting_related_signals_observed:
    "Runtime signals are normalized into browser/device collection observations. This lower-confidence finding is used when attributes are relevant to fingerprinting review but the cluster is not strong enough for probable fingerprinting.",
  session_recording_services_detected:
    "Vendor signatures, script hosts, collection endpoints, and tracker categories are matched against replay and behavior-analytics patterns in retained network and script evidence.",
  third_party_cookie_pre_consent:
    "Cookie snapshots are compared against consent timing. The finding is promoted when third-party or non-essential cookies are present before the scan records an opt-in or equivalent consent state.",
  rtb_cookie_sync_observed:
    "Requests are inspected for known sync hosts, redirect chains, ad exchange paths, identifier query keys, and cookie-matching destinations. Stronger evidence includes multiple sync domains or explicit ID parameters.",
  text_alternative_accessibility_issue:
    "Automated checks retain representative media and image examples where text alternative evidence is missing or weak, then map those examples to WCAG-oriented review categories.",
  consent_dark_patterns_detected:
    "Consent UI observations are evaluated for forced paths, missing reject controls, asymmetric button treatment, repeated prompts, and interaction cost differences.",
  cpra_cba_opt_out_missing:
    "Advertising-sharing runtime evidence is compared with retained policy and page-surface evidence for privacy choices, Do Not Sell or Share, or comparable opt-out mechanisms.",
  forced_consent_interaction:
    "The crawler observes whether page access is materially blocked by the consent prompt and whether normal browsing is possible without a consent action.",
  reject_option_missing_or_hidden:
    "Consent controls are inspected for first-layer reject or manage paths, visual prominence, accessible labeling, and relative interaction cost.",
  sensitive_data_collection_with_third_party_tracking_present:
    "Sensitive input surfaces are detected from form context and field semantics, then compared with third-party request and vendor evidence observed in the same flow.",
  asymmetric_consent_ui:
    "The consent UI is evaluated for button hierarchy, wording, layout, visibility, and the number of steps required to accept versus reject.",
  keyboard_navigation_accessibility_issue:
    "Representative accessibility evidence is mapped to keyboard operability, focus order, focus visibility, trapped focus, and controls that cannot be operated without pointer input.",
  cross_domain_identifier_sharing_observed:
    "Outbound requests are inspected for identifier-like values, adtech or identity destinations, redirect hops, and query keys commonly used for matching or attribution.",
  reject_tracking_persists_after_reject:
    "The scanner captures baseline runtime evidence, performs a reject-style consent interaction when available, then compares post-reject requests, vendors, and cookies for non-essential persistence.",
  possible_session_replay_on_sensitive_input_surface:
    "Replay vendor evidence is correlated with sensitive form or page-surface evidence. Promotion requires co-occurrence rather than a generic replay vendor observation alone.",
  probable_fingerprinting:
    "High-entropy browser/device signals are clustered with script, request, storage, canvas, or identity-linking context. A probable finding requires stronger co-occurrence than a single generic device signal."
};

const COMMON_CAUSES: Record<string, string[]> = {
  visual_contrast_accessibility_issue: ["Design tokens with low color contrast", "Disabled or placeholder text reused as body text", "Hover or focus states not checked against WCAG contrast thresholds"],
  pre_consent_tracking_detected: ["Tag manager containers firing before consent mode is initialized", "Analytics or ad pixels loaded in the document head", "CMP events not connected to downstream vendor blocking"],
  semantic_labeling_accessibility_issue: ["Icon-only controls without accessible names", "Form inputs missing labels", "ARIA attributes applied to unsupported roles"],
  fingerprinting_related_signals_observed: ["Fraud-prevention scripts collecting browser attributes", "Analytics SDKs collecting device metadata", "A/B testing or personalization libraries reading environment details"],
  session_recording_services_detected: ["Replay SDK loaded globally", "Behavior analytics added through a tag manager", "Masking and consent settings not scoped by page type"],
  third_party_cookie_pre_consent: ["Third-party scripts writing cookies on load", "Server-side tag proxying that still creates browser storage", "Consent mode configured after vendor scripts initialize"],
  rtb_cookie_sync_observed: ["Programmatic advertising tags active on initial load", "Audience manager or DMP integrations", "Retargeting scripts that perform identity matching"],
  text_alternative_accessibility_issue: ["Decorative and informative images not distinguished", "CMS media fields missing alt text", "SVG or icon buttons without names"],
  consent_dark_patterns_detected: ["Accept-only first layer", "Reject hidden behind settings", "Unequal button prominence or repeated prompts"],
  cpra_cba_opt_out_missing: ["Advertising vendors present but privacy choices link absent", "Opt-out link only in policy text", "Region handling not exposed in the public flow"],
  forced_consent_interaction: ["Full-screen consent wall", "Overlay blocks scroll and navigation", "Dismiss path omitted or disabled"],
  reject_option_missing_or_hidden: ["CMP template lacks a reject-all button", "Reject is nested in preferences", "Reject label is ambiguous or visually de-emphasized"],
  sensitive_data_collection_with_third_party_tracking_present: ["Shared layout loads trackers on every page", "Form pages inherit global marketing tags", "Analytics not excluded from sensitive flows"],
  asymmetric_consent_ui: ["Accept button styled as primary while reject is plain text", "Reject requires more clicks", "Preference flow makes refusal harder than acceptance"],
  keyboard_navigation_accessibility_issue: ["Custom controls missing keyboard handlers", "Focus outline removed", "Modal or menu focus not managed"],
  cross_domain_identifier_sharing_observed: ["Ad pixels append identifiers to URL parameters", "Identity-sync redirects", "Measurement SDKs transmit persistent IDs"],
  reject_tracking_persists_after_reject: ["Reject event not propagated to tag manager", "Previously loaded scripts continue sending beacons", "Cookies are not cleared or suppressed after opt-out"],
  possible_session_replay_on_sensitive_input_surface: ["Replay script loaded on forms", "Sensitive fields not masked", "Replay vendor excluded from consent gating"],
  probable_fingerprinting: ["Security or fraud SDKs collect high-entropy attributes", "Adtech or identity scripts combine device signals with identifiers", "Canvas, storage, and browser APIs are used together"]
};

const REVIEW_QUESTIONS: Record<string, string[]> = {
  visual_contrast_accessibility_issue: ["Which selector and state failed the automated contrast check?", "Does the affected text meet the expected WCAG contrast ratio after design-token changes?", "Is the issue repeated across templates?"],
  pre_consent_tracking_detected: ["Which request, cookie, or vendor appeared first?", "Was a consent action observed before that signal?", "Is the vendor essential, consent-gated, or disclosed as optional?"],
  semantic_labeling_accessibility_issue: ["Can a screen reader identify the control purpose?", "Is the visible label programmatically associated with the input?", "Does the ARIA repair improve semantics without creating invalid markup?"],
  fingerprinting_related_signals_observed: ["Which attributes were collected and by which script?", "Is the purpose security, analytics, personalization, or advertising?", "Can high-entropy collection be minimized or consent-gated?"],
  session_recording_services_detected: ["Which vendor or script triggered the replay signal?", "Is replay enabled before consent?", "Are sensitive fields and pages excluded or masked?"],
  third_party_cookie_pre_consent: ["Which cookie was written and by which domain?", "Was it present before the consent action?", "Is it necessary storage or optional tracking storage?"],
  rtb_cookie_sync_observed: ["Which sync domains and identifier keys appeared?", "Did the path run before consent?", "Which adtech integration owns the sync call?"],
  text_alternative_accessibility_issue: ["Is the image informative, decorative, functional, or complex?", "Does the accessible name communicate the same purpose as the visual content?", "Is the issue generated by CMS content or component code?"],
  consent_dark_patterns_detected: ["Can a user refuse at the same layer and effort as accept?", "Are labels, colors, and hierarchy balanced?", "Does the prompt resurface after a refusal?"],
  cpra_cba_opt_out_missing: ["Are advertising-sharing vendors present?", "Is a privacy choices or Do Not Sell or Share path visible?", "Does opt-out actually suppress the relevant runtime evidence?"],
  forced_consent_interaction: ["Can a user browse ordinary content without accepting?", "Is there a close, reject, or continue-without-accepting path?", "Does the overlay block keyboard or screen reader users?"],
  reject_option_missing_or_hidden: ["Is reject available on the first layer?", "Is it named clearly?", "Does it require materially more steps than accept?"],
  sensitive_data_collection_with_third_party_tracking_present: ["What sensitive data type appears in the form context?", "Which third-party vendors load on that surface?", "Can global tags be removed from sensitive flows?"],
  asymmetric_consent_ui: ["Are accept and reject controls comparable in size, color, and placement?", "Does one path require more steps?", "Would a keyboard or screen reader user find both paths equally?"],
  keyboard_navigation_accessibility_issue: ["Can all controls be reached with Tab and Shift+Tab?", "Is focus visible and logical?", "Can modals, menus, and banners be exited with keyboard controls?"],
  cross_domain_identifier_sharing_observed: ["Which identifier-like value was transmitted?", "Which destination received it?", "Is the purpose disclosed and consent-gated where needed?"],
  reject_tracking_persists_after_reject: ["Which post-reject request or cookie persisted?", "Was the reject action successfully detected?", "Do vendor tags listen to the same consent state?"],
  possible_session_replay_on_sensitive_input_surface: ["Was replay active on the sensitive page or only elsewhere on the site?", "Are fields masked before capture?", "Is replay disabled for regulated or sensitive flows?"],
  probable_fingerprinting: ["Which high-entropy signals co-occurred?", "Was identity or cross-domain context also present?", "Is the collection necessary, minimized, and disclosed?"]
};

const LIMITATIONS: Record<string, string[]> = {
  fingerprinting_related_signals_observed: [
    "This finding does not prove that a persistent browser fingerprint was created.",
    "Security and fraud-prevention scripts may collect similar attributes for legitimate purposes.",
    "Review recommended before treating the signal as fingerprinting behavior."
  ],
  probable_fingerprinting: [
    "Probable fingerprinting is inferred from clustered signals, not from observing a vendor's internal identity graph.",
    "Fraud-prevention or abuse-prevention use cases may explain some high-entropy collection.",
    "A manual review should confirm purpose, disclosure, consent posture, and data sharing."
  ],
  session_recording_services_detected: [
    "Detecting a replay vendor does not prove that keystrokes, sensitive values, or full recordings were retained.",
    "Some replay tools can be configured for masking or sampling.",
    "Review vendor settings, consent gating, and sensitive-page exclusions."
  ],
  possible_session_replay_on_sensitive_input_surface: [
    "Co-occurrence does not prove that sensitive field values were captured.",
    "The evidence may reflect a shared template or global script rather than replay use on a submitted form.",
    "Manual review should confirm masking, sampling, and page-level exclusions."
  ],
  cpra_cba_opt_out_missing: [
    "This finding is a review signal, not a CPRA legal determination.",
    "A valid opt-out path may exist outside the observed page surface or may be regionally targeted.",
    "Review the public path, policy text, and runtime opt-out effect together."
  ],
  consent_dark_patterns_detected: [
    "Dark-pattern review involves context and user-interface judgment.",
    "Automated observations may miss regional variants, A/B tests, or post-login experiences.",
    "Treat the finding as a prompt for design and legal review, not a final conclusion."
  ]
};

const USER_IMPACT: Record<string, string> = {
  visual_contrast_accessibility_issue:
    "Users with low vision, color-vision differences, glare, or zoomed interfaces may struggle to read text or distinguish controls.",
  semantic_labeling_accessibility_issue:
    "Screen reader and voice-control users may hear vague control names or lose the relationship between a label and the action it controls.",
  text_alternative_accessibility_issue:
    "Users who cannot perceive images may miss product details, warnings, icons, or functional image-button meaning.",
  keyboard_navigation_accessibility_issue:
    "Keyboard-only users may be unable to open menus, dismiss banners, complete forms, or recover focus after a modal opens."
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
  if (id === "probable_fingerprinting") {
    return "strong when multiple high-entropy observations co-occur; still reviewed as probable because intent and downstream identity use are inferred";
  }

  if (id === "fingerprinting_related_signals_observed") {
    return "moderate by design; the signal is relevant to review but weaker than a probable fingerprinting cluster";
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
        title: "Request timeline",
        code: "0ms page_start\n842ms consent_banner_visible\n1,137ms https://www.googletagmanager.com/gtm.js\n3,405ms https://www.google-analytics.com/g/collect\nconsent_action_observed=false"
      },
      {
        title: "Observed vendors",
        code: "Google Tag Manager, Google Analytics, Meta Pixel, AdRoll\npre_consent_tracking_requests=6\nunique_pre_consent_vendors=5"
      }
    ];
  }

  if (id === "third_party_cookie_pre_consent") {
    return [
      {
        title: "Cookie snapshot",
        code: "IDE=.doubleclick.net; SameSite=None; first_seen_ms=911\nTDID=.adsrvr.org; first_seen_ms=1,208\nconsent_action_observed=false"
      }
    ];
  }

  if (id === "rtb_cookie_sync_observed") {
    return [
      {
        title: "Sync chain",
        code: "cm.g.doubleclick.net -> idsync.rlcdn.com -> match.adsrvr.org\nquery_keys: google_gid, gdpr, redirect\nrtb_cookie_sync_domain_count=15"
      }
    ];
  }

  if (id === "semantic_labeling_accessibility_issue") {
    return [
      {
        title: "Semantic labeling example",
        code: "rule=label\nselector=form input[name=\"email\"]\nissue=input_missing_accessible_name\nwcag_refs=1.3.1 Info and Relationships, 4.1.2 Name Role Value\nuser_impact=Screen reader users may not know what information the field expects."
      }
    ];
  }

  if (id === "text_alternative_accessibility_issue") {
    return [
      {
        title: "Text alternative example",
        code: "rule=image-alt\nselector=main img.product-badge\nissue=missing_alt_text\nwcag_refs=1.1.1 Non-text Content\nuser_impact=Users who cannot perceive the image may miss the badge meaning."
      }
    ];
  }

  if (id === "keyboard_navigation_accessibility_issue") {
    return [
      {
        title: "Keyboard navigation example",
        code: "rule=keyboard\nselector=button[data-menu-trigger]\nissue=control_not_keyboard_operable\nwcag_refs=2.1.1 Keyboard, 2.4.7 Focus Visible\nuser_impact=Keyboard-only users may be unable to open or exit the control."
      }
    ];
  }

  if (id === "session_recording_services_detected" || id === "possible_session_replay_on_sensitive_input_surface") {
    return [
      {
        title: "Replay signal",
        code: "script_host=static.hotjar.com\ntracker_category=session_replay\nmatched_signature=hotjar\ncollection_endpoint=/api/v2/client/sites"
      },
      {
        title: "Sensitive-surface context",
        code: "page_url=/apply\nfield_contexts: income, account number, health condition\nreplay_vendor_present=true"
      }
    ];
  }

  if (id === "cross_domain_identifier_sharing_observed") {
    return [
      {
        title: "Identifier-sharing request",
        code: "identifier_like_value_present=true\ndestination=idsync.rlcdn.com\nsource_domain=example.com\nquery_keys: partner_uid, redirect, gdpr\nreview_recommended=true"
      }
    ];
  }

  if (id === "sensitive_data_collection_with_third_party_tracking_present") {
    return [
      {
        title: "Sensitive surface with third-party context",
        code: "page_url=/apply\nfield_contexts: income, account number, date of birth\nthird_party_tracking_present=true\nobserved_vendors=Google Analytics, Meta Pixel\nreview_recommended=true"
      }
    ];
  }

  if (id.includes("fingerprinting")) {
    return [
      {
        title: "Device signal cluster",
        code: "canvas_read=true\nwebgl_vendor=true\ntimezone=true\nscreen_geometry=true\nstorage_probe=true\nidentity_request_context=present"
      }
    ];
  }

  if (id === "visual_contrast_accessibility_issue") {
    return [
      {
        title: "Visual contrast example",
        code: "rule=color-contrast\nselector=footer > p\nimpact=serious\nwcag_refs=1.4.3 Contrast (Minimum)\nuser_impact=Low-vision users may struggle to read the text."
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
        title: "Post-reject diff",
        code: "action=reject_all\nbaseline_vendors=Adobe Analytics, Google Ads\npost_reject_non_essential_requests=4\npersisting_hosts=analytics.example.com, googleads.g.doubleclick.net"
      }
    ];
  }

  if (id === "cpra_cba_opt_out_missing") {
    return [
      {
        title: "Disclosure and runtime context",
        code: "advertising_sharing_runtime_evidence=true\nprivacy_choices_link_detected=false\ndo_not_sell_or_share_detected=false\nreview_recommended=true"
      }
    ];
  }

  if (id === "consent_dark_patterns_detected") {
    return [
      {
        title: "Consent choice architecture",
        code: "accept_prominence=primary_button\nreject_visible=false\nsettings_visible=true\nrefusal_path=secondary_settings_flow\nreview_recommended=true"
      }
    ];
  }

  if (id === "forced_consent_interaction") {
    return [
      {
        title: "Forced consent interaction",
        code: "banner_blocks_content=true\nclose_visible=false\ncontinue_without_accepting_visible=false\npage_scroll_blocked=true\nreview_recommended=true"
      }
    ];
  }

  if (id === "reject_option_missing_or_hidden") {
    return [
      {
        title: "Reject path visibility",
        code: "accept_visible=true\nreject_visible=false\nsettings_visible=true\nsteps_to_accept=1\nsteps_to_reject=3\nreview_recommended=true"
      }
    ];
  }

  if (id === "asymmetric_consent_ui") {
    return [
      {
        title: "Consent choice imbalance",
        code: "interaction_cost_imbalanced=true\naccept_style=primary_button\nreject_style=text_link\naccept_position=first_layer\nreject_position=settings_layer"
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

  return [
    {
      title: "Runtime evidence",
      code: "signal_retained=true\nsource=runtime_observation\nreview_recommended=true"
    }
  ];
}

function makeFallbackSample(definition: CertScoreFindingDefinition, benchmark: FindingDensityBenchmark): SampleFindingJson {
  return {
    findingId: definition.id,
    label: definition.label,
    sourceLabel: benchmark.sourceLabel,
    payload: {
      id: definition.id,
      title: definition.label,
      category: CATEGORY_BY_FINDING_ID[definition.id] ?? "Third-party tracking",
      section: definition.section,
      criticality: SEVERITY_OVERRIDES[definition.id] ?? SEVERITY_BY_SECTION[definition.section],
      confidenceSemantics: confidenceSemanticsFor(definition.id, benchmark),
      evidenceVersion: "1.1",
      observed: OBSERVED[definition.id] ?? definition.whyItMatters,
      detectionMethodology: METHODOLOGY[definition.id] ?? definition.whyItMatters,
      evidenceExamples: makeEvidenceExamples(definition.id),
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
      "CertScore compares consent-state observations with request, vendor, and cookie timing. A signal is stronger when the scan retains page-start timing, a visible consent surface, no observed consent action, and classified non-essential requests or storage before the choice point.",
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
    const definition = CERT_SCORE_FINDING_REGISTRY[findingId];
    const benchmark = FINDING_DENSITY_BENCHMARKS[findingId];

    if (!definition || !benchmark) {
      return [];
    }

    const item: FindingReferenceItem = {
      id: definition.id,
      title: definition.label,
      category: CATEGORY_BY_FINDING_ID[findingId] ?? "Third-party tracking",
      runtimeSection: definition.section,
      criticality: SEVERITY_OVERRIDES[findingId] ?? SEVERITY_BY_SECTION[definition.section],
      confidenceSemantics: confidenceSemanticsFor(findingId, benchmark),
      observed: OBSERVED[findingId] ?? definition.whyItMatters,
      detectionMethodology: METHODOLOGY[findingId] ?? definition.whyItMatters,
      exampleEvidence: makeEvidenceExamples(findingId),
      commonCauses: COMMON_CAUSES[findingId] ?? ["Unexpected runtime configuration", "Third-party tag behavior changed", "Public surface differed from expected implementation"],
      reviewQuestions: REVIEW_QUESTIONS[findingId] ?? ["What signal was retained?", "Which public surface or runtime event supports it?", "What implementation owner can confirm the behavior?"],
      relatedFindingIds: RELATED_FINDINGS[findingId] ?? [],
      benchmark,
      benchmarkBadge: makeBenchmarkBadge(benchmark),
      limitations: [...(LIMITATIONS[findingId] ?? []), ...DEFAULT_LIMITATIONS],
      userImpact: USER_IMPACT[findingId],
      sample: getSampleFindingById(findingId) ?? makeFallbackSample(definition, benchmark),
      regulatoryContext: FINDING_REGULATORY_CONTEXTS[findingId]
    };

    return [item];
  });
}

export const getTopFindingAtlasItems = getFindingReferenceItems;
