export type CertScoreFindingSection =
  | "Privacy & Tracking"
  | "Consent Experience"
  | "Cookies & Storage"
  | "Vendors & Requests"
  | "Fingerprinting"
  | "Navigation & Redirects"
  | "Runtime & Diagnostics"
  | "Accessibility"
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

export type CertScoreFindingEvidenceDetails = {
  counts?: Record<string, number>;
  policyRuntimeConflict?: {
    policyAnchor: {
      claimType: string | null;
      sourceUrl: string | null;
      snippet: string | null;
    };
    runtimeAnchor: {
      observationType: string | null;
      phase: string | null;
      requestUrls: string[];
      vendors: string[];
    };
    conflictBridge: {
      conflictType: string | null;
      reasoning: string | null;
      supportsPromotion: boolean;
    };
    evidenceSufficiency: {
      reviewStatus: string | null;
      promotionEligible: boolean;
    };
    references: {
      policySourceUrls: string[];
      runtimeRequestUrls: string[];
      validationRuleKeys: string[];
    };
  };
  disclosureFindings?: string[];
  evidenceSnippets?: string[];
  offerSnippets?: string[];
  pageUrls?: string[];
  runtimeRequestUrls?: string[];
  runtimeVendors?: string[];
  sensitiveDataTypes?: string[];
  sensitiveFieldContexts?: string[];
  evidenceFlags?: string[];
  sourceSignals?: string[];
  sourceUrls?: string[];
  timing?: Record<string, number | null>;
  consentInteraction?: Record<string, unknown>;
  promotionDecision?: Record<string, unknown>;
  rejectEvidenceDiff?: Record<string, unknown>;
  postRejectNonEssentialRequests?: Array<Record<string, unknown>>;
  rtbCookieSyncEvidence?: Array<Record<string, unknown>>;
  crossDomainIdentifierSharingEvidence?: Array<Record<string, unknown>>;
  confidenceRisks?: string[];
  suppressionChecks?: Record<string, unknown>;
};

export type CertScoreFinding = CertScoreFindingDefinition & {
  confidence: CertScoreFindingConfidence;
  directVsInferred: CertScoreFindingDirectness;
  evidenceDetails?: CertScoreFindingEvidenceDetails;
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
  reject_tracking_persists_after_reject: {
    id: "reject_tracking_persists_after_reject",
    label: "Non-essential tracking continued after reject",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 97,
    whyItMatters: "Tracking that still fires after an explicit reject interaction suggests the site's consent outcome is not being enforced as presented.",
    remediation: "Compare baseline and post-reject vendor activity, suppress non-essential requests after reject, and verify the live reject path with concrete request-level evidence."
  },
  third_party_tracking_pre_consent: {
    id: "third_party_tracking_pre_consent",
    label: "Third-party tracking before consent",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 98,
    whyItMatters: "External vendors firing before consent increases privacy and compliance risk.",
    remediation: "Block third-party analytics and adtech until consent is granted."
  },
  rtb_cookie_sync_observed: {
    id: "rtb_cookie_sync_observed",
    label: "RTB cookie sync observed",
    section: "Vendors & Requests",
    defaultSurfacePriority: 94,
    whyItMatters: "Cookie-sync and identity-sync requests can transmit advertising identifiers across multiple third parties during the initial page load.",
    remediation: "Inventory the sync endpoints, suppress non-essential RTB or identity-sync calls until consent permits them, and verify the request path after deployment."
  },
  cross_domain_identifier_sharing_observed: {
    id: "cross_domain_identifier_sharing_observed",
    label: "Identifiers shared across domains",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 95,
    whyItMatters:
      "Identifier-like values observed across multiple external domains can indicate cross-site tracking, attribution, or data-sharing behavior that users may not expect.",
    remediation:
      "Inventory the destinations receiving identifier-like values, confirm the purpose and consent/disclosure basis, and suppress non-essential identifier transmission where it is not needed."
  },
  cookie_disclosure_gap: {
    id: "cookie_disclosure_gap",
    label: "Cookie disclosure gap",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 91,
    whyItMatters: "When observed cookie activity is not covered by retained cookie-policy evidence, users cannot reliably understand what tracking is happening or why.",
    remediation: "Reconcile runtime cookie behavior with the cookie policy so observed cookies, providers, and purposes are disclosed accurately."
  },
  third_party_cookie_pre_consent: {
    id: "third_party_cookie_pre_consent",
    label: "Tracking cookies set before consent",
    section: "Cookies & Storage",
    defaultSurfacePriority: 92,
    whyItMatters: "This is direct evidence of pre-consent tracking persistence, including first-party-domain cookies written by third-party scripts.",
    remediation: "Prevent non-essential tracking cookie writes before consent or remove the vendor."
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
  blocking_overlay_observed: {
    id: "blocking_overlay_observed",
    label: "Blocking consent overlay observed",
    section: "Consent Experience",
    defaultSurfacePriority: 87,
    whyItMatters:
      "A blocking consent or cookie overlay is common, but it becomes important executive context when users cannot reach page content, cannot easily dismiss the overlay, or cannot reject as easily as they can accept.",
    remediation:
      "Keep consent controls clear and comparable, preserve a usable reject or manage path, and avoid blocking normal page access unless the choice architecture remains balanced."
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
  session_replay_on_sensitive_input_surface: {
    id: "session_replay_on_sensitive_input_surface",
    label: "Session replay observed on a sensitive input surface",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 99,
    whyItMatters:
      "Session replay on pages that collect health, financial, identity, or other sensitive data can materially increase privacy and data-handling risk, especially if masking or consent controls are weak.",
    remediation:
      "Disable session replay on sensitive forms unless it is clearly necessary, confirm that sensitive fields are fully masked, and gate collection behind the appropriate consent and disclosure controls."
  },
  sensitive_data_collection_with_third_party_tracking_present: {
    id: "sensitive_data_collection_with_third_party_tracking_present",
    label: "Sensitive-data collection with third-party tracking present",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 98,
    whyItMatters:
      "Collecting sensitive data on pages that also load third-party tracking can increase exposure by linking sensitive form activity with analytics, advertising, or profiling infrastructure.",
    remediation:
      "Review the page or form where sensitive data is collected, remove non-essential third-party tracking from that flow, and confirm that only tightly controlled collection endpoints remain."
  },
  sensitive_collection_surface_observed: {
    id: "sensitive_collection_surface_observed",
    label: "Sensitive collection surface observed",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 52,
    whyItMatters:
      "Sensitive input fields are important handling context, even when the retained evidence does not show third-party transmission or replay on that surface.",
    remediation:
      "Review the affected form, minimize sensitive fields where possible, and keep non-essential tracking or replay tooling out of the collection flow."
  },
  video_content_tracking_exposure: {
    id: "video_content_tracking_exposure",
    label: "Video content tracking exposure",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 90,
    whyItMatters: "Advertising pixels on video-content pages can create VPPA-style privacy exposure when viewing context is linked to user or ad identifiers.",
    remediation: "Gate advertising pixels on video surfaces behind appropriate consent and avoid sending video titles or page context unless necessary and disclosed."
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
  consent_dark_patterns_detected: {
    id: "consent_dark_patterns_detected",
    label: "Dark pattern consent signals detected",
    section: "Consent Experience",
    defaultSurfacePriority: 95,
    whyItMatters:
      "Choice architecture that steers users toward acceptance can undermine meaningful consent and create dark-pattern risk.",
    remediation:
      "Expose reject and settings at the first layer, remove accept-only or forced paths, and equalize button prominence and interaction cost across consent choices."
  },
  policy_behavior_contradiction_detected: {
    id: "policy_behavior_contradiction_detected",
    label: "Policy and runtime behavior conflict",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 97,
    whyItMatters:
      "A mismatch between public policy language and observed runtime behavior is one of the clearest reasons for targeted analyst review.",
    remediation:
      "Compare the retained policy claim against the observed runtime behavior, then either correct the implementation or narrow the policy language so it accurately reflects what the site does in practice."
  },
  policy_clarity_risk: {
    id: "policy_clarity_risk",
    label: "Disclosure clarity remains weak",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 65,
    whyItMatters:
      "Ambiguous or incomplete disclosure language can create consumer-protection and enforcement risk even when no single runtime contradiction is retained.",
    remediation:
      "Tighten disclosure language so it clearly explains what data is collected, why it is used, and when consent or choice mechanisms apply."
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
  accessibility_risk_score: {
    id: "accessibility_risk_score",
    label: "Representative accessibility barriers detected",
    section: "Accessibility",
    defaultSurfacePriority: 72,
    whyItMatters:
      "Representative WCAG examples make accessibility risk reviewable because they identify the page, rule, impacted node, and severity behind the automated signal.",
    remediation:
      "Fix the retained WCAG rule examples first, then rerun the accessibility scan to confirm representative barriers no longer reproduce."
  },
  guaranteed_outcome_claim_detected: {
    id: "guaranteed_outcome_claim_detected",
    label: "Guaranteed outcome claim detected",
    section: "Financial & Claims",
    defaultSurfacePriority: 92,
    whyItMatters: "Guaranteed-results language on public financial promotions can materially increase commercial-claims and enforcement risk.",
    remediation: "Remove or qualify guaranteed-results language and place balancing disclosure directly adjacent to the claim."
  },
  regulatory_registration_disclosure_absent: {
    id: "regulatory_registration_disclosure_absent",
    label: "Regulatory registration disclosure absent",
    section: "Financial & Claims",
    defaultSurfacePriority: 88,
    whyItMatters: "Trading-signal, forex, derivatives, and advisory surfaces create elevated review risk when users cannot tell whether the operator is registered or unregistered.",
    remediation:
      "Disclose the relevant NFA, CFTC, SEC, FCA, or equivalent registration status, or clearly state that the service is not registered and signals are for informational use only."
  },
  unsubstantiated_testimonial_near_performance_claim: {
    id: "unsubstantiated_testimonial_near_performance_claim",
    label: "Testimonial adjacent to unsubstantiated performance claim",
    section: "Financial & Claims",
    defaultSurfacePriority: 86,
    whyItMatters: "Pairing social proof with guaranteed-return or performance language can amplify deception risk in financial promotions.",
    remediation: "Separate testimonials from performance claims or add clear adjacent disclosure explaining substantiation, typicality, compensation, and material limitations."
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
