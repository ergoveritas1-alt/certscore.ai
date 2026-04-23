export type CertScoreFindingSection =
  | "Privacy & Tracking"
  | "Consent Experience"
  | "Cookies & Storage"
  | "Vendors & Requests"
  | "Fingerprinting"
  | "Navigation & Redirects"
  | "Runtime & Diagnostics"
  | "Financial & Claims";

export type CertScoreFindingSeverity = "critical" | "high" | "medium" | "low";
export type CertScoreFindingConfidence = "strong" | "good" | "moderate";
export type CertScoreFindingDirectness = "direct" | "inferred" | "mixed";

export type CertScoreFindingDefinition = {
  id: string;
  label: string;
  section: CertScoreFindingSection;
  defaultSurfacePriority: number;
  whyItMatters: string;
  remediation: string;
};

export type CertScoreFinding = CertScoreFindingDefinition & {
  confidence: CertScoreFindingConfidence;
  directVsInferred: CertScoreFindingDirectness;
  evidencePreview: string[];
  evidenceRefs: string[];
  severity: CertScoreFindingSeverity;
  shortSummary: string;
};

export const CERT_SCORE_FINDING_REGISTRY: Record<string, CertScoreFindingDefinition> = {
  pre_consent_tracking_detected: {
    id: "pre_consent_tracking_detected",
    label: "Tracking started before consent",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 100,
    whyItMatters: "This is one of the clearest automated signals that non-essential activity began before the user could choose.",
    remediation: "Delay non-essential requests until consent state is established."
  },
  third_party_tracking_pre_consent: {
    id: "third_party_tracking_pre_consent",
    label: "Third-party tracking before consent",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 98,
    whyItMatters: "External vendors firing before consent increases privacy and compliance risk.",
    remediation: "Block third-party analytics and adtech until consent is granted."
  },
  storage_before_consent: {
    id: "storage_before_consent",
    label: "Storage written before consent",
    section: "Cookies & Storage",
    defaultSurfacePriority: 88,
    whyItMatters: "Persistence can support tracking even when cookies are limited.",
    remediation: "Defer non-essential local storage, session storage, and IndexedDB writes until consent."
  },
  third_party_cookie_pre_consent: {
    id: "third_party_cookie_pre_consent",
    label: "Third-party cookies before consent",
    section: "Cookies & Storage",
    defaultSurfacePriority: 92,
    whyItMatters: "This is direct evidence of pre-consent third-party persistence.",
    remediation: "Prevent third-party cookie writes before consent or remove the vendor."
  },
  analytics_cookie_pre_consent: {
    id: "analytics_cookie_pre_consent",
    label: "Analytics cookies before consent",
    section: "Cookies & Storage",
    defaultSurfacePriority: 94,
    whyItMatters: "Analytics cookies before consent are an easy-to-understand and commercially important signal for reviewers.",
    remediation: "Defer analytics cookies until explicit user consent is obtained."
  },
  adtech_cookie_pre_consent: {
    id: "adtech_cookie_pre_consent",
    label: "Adtech cookies before consent",
    section: "Cookies & Storage",
    defaultSurfacePriority: 91,
    whyItMatters: "Advertising and exchange-related cookies before consent are stronger signals than generic analytics alone.",
    remediation: "Block adtech and exchange cookies until consent is granted."
  },
  telemetry_rich_identification_observed: {
    id: "telemetry_rich_identification_observed",
    label: "Identity-rich telemetry observed",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 82,
    whyItMatters: "Rich browser, device, and identifier transmission can support user recognition even without explicit fingerprinting proof.",
    remediation: "Reduce browser and device metadata in analytics requests and suppress non-essential telemetry before consent."
  },
  reject_option_missing_or_hidden: {
    id: "reject_option_missing_or_hidden",
    label: "Reject option missing or hidden",
    section: "Consent Experience",
    defaultSurfacePriority: 90,
    whyItMatters: "Users should be able to refuse non-essential processing as easily as they accept it.",
    remediation: "Expose a visible reject action on the first consent layer."
  },
  asymmetric_consent_ui: {
    id: "asymmetric_consent_ui",
    label: "Consent choices appear imbalanced",
    section: "Consent Experience",
    defaultSurfacePriority: 84,
    whyItMatters: "Visual imbalance can steer users toward one outcome.",
    remediation: "Make accept and reject options equally visible and comparable in emphasis."
  },
  forced_consent_interaction: {
    id: "forced_consent_interaction",
    label: "Consent interaction was forced",
    section: "Consent Experience",
    defaultSurfacePriority: 86,
    whyItMatters: "Blocking normal use increases friction and can undermine meaningful choice.",
    remediation: "Allow non-essential browsing access without forcing a consent choice."
  },
  content_obstructed_by_overlay: {
    id: "content_obstructed_by_overlay",
    label: "Content was obstructed by an overlay",
    section: "Consent Experience",
    defaultSurfacePriority: 72,
    whyItMatters: "Blocking UI can pressure action and degrade usability.",
    remediation: "Reduce blocking overlays and preserve access to core content."
  },
  repeated_consent_prompt: {
    id: "repeated_consent_prompt",
    label: "Consent prompt appears to resurface",
    section: "Consent Experience",
    defaultSurfacePriority: 62,
    whyItMatters: "Repeated prompts add pressure and create a poor consent experience.",
    remediation: "Respect prior user actions and avoid resurfacing the prompt unnecessarily."
  },
  multi_vendor_tracking_detected: {
    id: "multi_vendor_tracking_detected",
    label: "Multiple tracking vendors observed",
    section: "Vendors & Requests",
    defaultSurfacePriority: 70,
    whyItMatters: "A broader vendor footprint increases data-sharing risk and operational complexity.",
    remediation: "Reduce duplicate vendors and remove non-essential third-party tags."
  },
  session_recording_services_detected: {
    id: "session_recording_services_detected",
    label: "Session recording services detected",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 89,
    whyItMatters: "Session replay or recording tools can capture detailed on-page behavior and require careful consent, masking, and disclosure controls.",
    remediation: "Audit replay tooling, ensure sensitive fields are masked, gate it behind consent where required, and disclose it clearly."
  },
  pre_submit_text_capture_detected: {
    id: "pre_submit_text_capture_detected",
    label: "Possible pre-submit text capture",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 96,
    whyItMatters: "Capturing typed text before form submission is a stronger and more sensitive signal than generic analytics alone.",
    remediation: "Review text-input listeners and outbound requests tied to typing, disable non-essential capture before submit, and mask sensitive fields."
  },
  identifier_transmission_detected: {
    id: "identifier_transmission_detected",
    label: "Identifier-like data was transmitted",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 87,
    whyItMatters: "Identifier transmission can support tracking, attribution, or cross-context linking.",
    remediation: "Minimize identifier fields in network requests and block non-essential transmission before consent."
  },
  device_data_collection_detected: {
    id: "device_data_collection_detected",
    label: "Device data was collected",
    section: "Fingerprinting",
    defaultSurfacePriority: 66,
    whyItMatters: "Broad environment collection can support device recognition even without cookies.",
    remediation: "Limit collection of high-entropy device and browser attributes to essential uses."
  },
  probable_fingerprinting: {
    id: "probable_fingerprinting",
    label: "Probable fingerprinting behavior",
    section: "Fingerprinting",
    defaultSurfacePriority: 93,
    whyItMatters: "Fingerprinting can identify or re-identify users without relying on cookies.",
    remediation: "Remove non-essential fingerprinting scripts or restrict collection to clearly necessary fraud controls."
  },
  non_cookie_tracking_detected: {
    id: "non_cookie_tracking_detected",
    label: "Non-cookie tracking signals observed",
    section: "Cookies & Storage",
    defaultSurfacePriority: 74,
    whyItMatters: "Users and reviewers often miss tracking that does not rely on cookies.",
    remediation: "Audit non-cookie persistence paths and defer non-essential writes until consent."
  },
  high_request_density: {
    id: "high_request_density",
    label: "High request density",
    section: "Vendors & Requests",
    defaultSurfacePriority: 55,
    whyItMatters: "Dense network bursts can indicate aggressive tag loading or collection behavior.",
    remediation: "Reduce unnecessary tags and consolidate duplicate client-side calls."
  },
  large_third_party_footprint: {
    id: "large_third_party_footprint",
    label: "Large third-party footprint",
    section: "Vendors & Requests",
    defaultSurfacePriority: 68,
    whyItMatters: "A large external footprint increases privacy exposure and operational complexity.",
    remediation: "Trim third-party dependencies and remove vendors that do not serve a clear purpose."
  },
  collection_endpoints_detected: {
    id: "collection_endpoints_detected",
    label: "Collection endpoints detected",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 64,
    whyItMatters: "Collection endpoints often reflect analytics or tracking data transmission.",
    remediation: "Review data collection endpoints and disable non-essential ones before consent."
  },
  tracking_redirect_chain: {
    id: "tracking_redirect_chain",
    label: "Tracking-style redirect chain",
    section: "Navigation & Redirects",
    defaultSurfacePriority: 60,
    whyItMatters: "Redirect chains can be used for attribution, vendor routing, or cross-site tracking.",
    remediation: "Reduce redirect hops and remove attribution or routing redirects that are not essential."
  },
  autoplay_before_consent: {
    id: "autoplay_before_consent",
    label: "Autoplay before consent",
    section: "Runtime & Diagnostics",
    defaultSurfacePriority: 58,
    whyItMatters: "Autoplay is intrusive and can signal ad-heavy or disruptive UX.",
    remediation: "Disable autoplay until user interaction or explicit consent where appropriate."
  },
  popup_or_modal_present: {
    id: "popup_or_modal_present",
    label: "Popup or modal present",
    section: "Runtime & Diagnostics",
    defaultSurfacePriority: 38,
    whyItMatters: "Popups are not inherently non-compliant, but they can degrade user experience.",
    remediation: "Reduce unnecessary popups and ensure they are easy to dismiss."
  },
  interstitial_detected: {
    id: "interstitial_detected",
    label: "Interstitial detected",
    section: "Runtime & Diagnostics",
    defaultSurfacePriority: 57,
    whyItMatters: "Interstitials can block access and create pressure to act.",
    remediation: "Avoid full-page interruptions for non-essential messaging."
  },
  guaranteed_outcome_claim_detected: {
    id: "guaranteed_outcome_claim_detected",
    label: "Guaranteed outcome claim detected",
    section: "Financial & Claims",
    defaultSurfacePriority: 92,
    whyItMatters: "Guaranteed-results language on public financial promotions can materially increase commercial-claims and enforcement risk.",
    remediation: "Remove or qualify guaranteed-results language and place balancing disclosure directly adjacent to the claim."
  },
  earnings_claim_without_adjacent_disclosure: {
    id: "earnings_claim_without_adjacent_disclosure",
    label: "Earnings claim without nearby disclosure",
    section: "Financial & Claims",
    defaultSurfacePriority: 90,
    whyItMatters: "Performance or earnings language without nearby balancing disclosure is a strong commercial-claims review trigger.",
    remediation: "Pair performance or earnings claims with clear adjacent disclosure that explains limits, assumptions, and variability."
  },
  pricing_or_fee_transparency_unclear: {
    id: "pricing_or_fee_transparency_unclear",
    label: "Pricing or fee transparency unclear",
    section: "Financial & Claims",
    defaultSurfacePriority: 78,
    whyItMatters: "Pricing or fee promotion language without clear nearby terms can mislead users and raise disclosure risk.",
    remediation: "Place pricing, fee, and term disclosures directly next to the promotional claim or offer."
  },
  leveraged_or_high_risk_product_promotion: {
    id: "leveraged_or_high_risk_product_promotion",
    label: "Leveraged or high-risk product promotion",
    section: "Financial & Claims",
    defaultSurfacePriority: 74,
    whyItMatters: "High-risk financial product promotion can materially increase commercial-claims and disclosure review risk even before narrower earnings or fee findings are confirmed.",
    remediation: "Review high-risk product marketing claims and place clear risk, fee, and eligibility disclosures adjacent to the offer language."
  }
};
