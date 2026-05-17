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

export type PreConsentTrackingEvidenceDetails = {
  scanContext: {
    pageUrl: string | null;
    scanMode: "initial_page_load";
    interactionBeforeFinding: boolean;
  };
  consentState: {
    cmpDetected: boolean | null;
    cmpVisibleMs: number | null;
    userConsentActionObserved: boolean;
    consentActionType: string | null;
    trackingOccurredBeforeConsentChoice: boolean;
  };
  consentBasis: string;
  timingAnalysis: {
    trackingBeforeConsentWindow: boolean;
    basis: string;
  };
  timing: {
    pageStartMs: number;
    firstRequestMs: number | null;
    firstThirdPartyRequestMs: number | null;
    firstThirdPartyTrackingRequestMs: number | null;
    firstCookieSeenMs: number | null;
    firstTrackingCookieSeenMs: number | null;
  };
  counts: {
    totalPreConsentThirdPartyTrackingRequests: number;
    representativePreConsentTrackingRequests: number;
    uniquePreConsentTrackingVendorsObserved: number;
    preConsentTrackingCookies: number;
    identifierLikeRequests: number;
  };
  requestSelectionNote: string;
  vendors: Array<{
    name: string;
    category: string | null;
    preConsent: boolean;
    representativeUrl: string | null;
    firstSeenMs: number | null;
  }>;
  representativeRequests: Array<{
    url: string;
    hostname: string;
    vendor: string | null;
    category: string | null;
    resourceType: string | null;
    firstSeenMs: number | null;
    thirdParty: boolean;
    preConsent: boolean;
    identifierLike: boolean;
    deviceDataLike: boolean;
    queryKeysSample: string[];
  }>;
  identifierEvidence: {
    addressingOrSignalingTransmittedByRequest: boolean;
    basis: string[];
    interpretation: string;
    identifierLikeRequestCount: number;
    deviceDataLikeRequestCount: number;
  };
  policyEvidence:
    | {
        evaluated: false;
      }
    | {
        evaluated: true;
        cookieOrPrivacyPolicyFound: boolean;
        relevantDisclosureFound: boolean;
        disclosureGapObserved: boolean;
        policyUrl: string | null;
        snippet: string | null;
      };
  legalRelevance: {
    cipaPenRegisterTheorySupport: "supportive_runtime_signal" | "possible" | "not_evaluated";
    gdprEprivacyConsentSupport: "strong_consent_timing_signal" | "possible" | "not_evaluated";
    cpraSharingSupport: "possible" | "not_evaluated";
    ftcDarkPatternOrDeceptionSupport: "support_only" | "not_evaluated";
  };
  limitations: string[];
};

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
  scanContext?: PreConsentTrackingEvidenceDetails["scanContext"];
  consentState?: PreConsentTrackingEvidenceDetails["consentState"];
  consentBasis?: string;
  timingAnalysis?: PreConsentTrackingEvidenceDetails["timingAnalysis"];
  rejectInteraction?: Record<string, unknown>;
  postRejectEvidence?: Record<string, unknown>;
  sessionReplayEvidence?: Record<string, unknown>;
  inputSurfaceEvidence?: Record<string, unknown>;
  syncEvidence?: Record<string, unknown>;
  cookieEvidence?: Record<string, unknown>;
  optOutControlEvidence?: Record<string, unknown>;
  jurisdictionOrPolicyContext?: Record<string, unknown>;
  trackingOrSharingContext?: Record<string, unknown>;
  trackingEvidence?: Record<string, unknown>;
  consentUiEvidence?: Record<string, unknown>;
  sensitiveDataEvidence?: Record<string, unknown>;
  telemetryEvidence?: Record<string, unknown>;
  accessibilityEvidence?: Record<string, unknown>;
  policyEvidenceDetails?: Record<string, unknown>;
  financialClaimsEvidence?: Record<string, unknown>;
  disclosureEvidence?: Record<string, unknown>;
  policyRuntimeConflict?: {
    policyAnchor: {
      claimType: string | null;
      sourceUrl: string | null;
      snippet: string | null;
    };
    runtimeAnchor: {
      observationType: string | null;
      phase: string | null;
      firstSeenMs?: number | null;
      host?: string | null;
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
  timing?: Record<string, number | null> | PreConsentTrackingEvidenceDetails["timing"];
  requestSelectionNote?: string;
  vendors?: PreConsentTrackingEvidenceDetails["vendors"];
  representativeRequests?: PreConsentTrackingEvidenceDetails["representativeRequests"];
  identifierEvidence?: PreConsentTrackingEvidenceDetails["identifierEvidence"];
  policyEvidence?: PreConsentTrackingEvidenceDetails["policyEvidence"];
  legalRelevance?: PreConsentTrackingEvidenceDetails["legalRelevance"];
  limitations?: string[];
  consentInteraction?: Record<string, unknown>;
  promotionDecision?: Record<string, unknown>;
  rejectEvidenceDiff?: Record<string, unknown>;
  postRejectNonEssentialRequests?: Array<Record<string, unknown>>;
  rtbCookieSyncEvidence?: Array<Record<string, unknown>>;
  rtbCookieSyncSubtypeCounts?: Record<string, number>;
  rtbCookieSyncEvidenceSubtypes?: string[];
  rtbCookieSyncRedirectTargets?: string[];
  rtbCookieSyncIdentifierQueryKeys?: string[];
  rtbCookieSyncWeakObservationCount?: number;
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
  evidenceVersion?: string;
  severity: CertScoreFindingSeverity;
  shortSummary: string;
};

export const CERT_SCORE_FINDING_REGISTRY: Record<string, CertScoreFindingDefinition> = {
  pre_consent_tracking_detected: {
    id: "pre_consent_tracking_detected",
    label: "Third-party tracking observed before recorded consent",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 100,
    whyItMatters: "Observed runtime behavior placed classified third-party tracking before a recorded consent choice, which is a high-priority implementation review signal.",
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
  cpra_cba_opt_out_missing: {
    id: "cpra_cba_opt_out_missing",
    label: "CPRA advertising opt-out missing or incomplete",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 96,
    whyItMatters:
      "Cross-context behavioral advertising vendors create CPRA opt-out expectations when the site does not expose or confirm a complete Do Not Sell or Share or Your Privacy Choices mechanism.",
    remediation:
      "Add or verify a CPRA-specific opt-out mechanism, include the required privacy choices treatment, and confirm that advertising-sharing vendors are suppressed when opt-out signals apply."
  },
  cross_domain_identifier_sharing_observed: {
    id: "cross_domain_identifier_sharing_observed",
    label: "Identifiers shared across domains",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 95,
    whyItMatters:
      "Identifier-like values observed in external identity, RTB, or adtech requests can indicate cross-site tracking, attribution, or data-sharing behavior that users may not expect.",
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
    whyItMatters: "Visual imbalance can make one consent outcome materially easier to choose than another.",
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
  possible_session_replay_on_sensitive_input_surface: {
    id: "possible_session_replay_on_sensitive_input_surface",
    label: "Possible session replay on a sensitive input surface",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 99,
    whyItMatters:
      "Possible session replay on pages that collect health, financial, identity, or other sensitive data can materially increase privacy and data-handling risk, especially if masking or consent controls are weak.",
    remediation:
      "Disable session replay on sensitive forms unless it is clearly necessary, confirm that sensitive fields are fully masked, and gate collection behind the appropriate consent and disclosure controls."
  },
  sensitive_data_collection_with_third_party_tracking_present: {
    id: "sensitive_data_collection_with_third_party_tracking_present",
    label: "Sensitive input surfaces detected alongside third-party tracking",
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
  fingerprinting_related_signals_observed: {
    id: "fingerprinting_related_signals_observed",
    label: "Fingerprinting-related signals observed",
    section: "Fingerprinting",
    defaultSurfacePriority: 72,
    whyItMatters: "Browser and device attributes can be relevant to fingerprinting review, even when strong fingerprinting proof was not retained.",
    remediation: "Review scripts collecting browser or device attributes and limit non-essential collection to disclosed, necessary purposes."
  },
  probable_fingerprinting: {
    id: "probable_fingerprinting",
    label: "Probable browser/device fingerprinting behavior",
    section: "Fingerprinting",
    defaultSurfacePriority: 93,
    whyItMatters: "Browser/device fingerprinting may support fraud prevention or security, but it can still create privacy review obligations depending on jurisdiction, disclosure, consent posture, and data sharing.",
    remediation: "Review the scripts collecting high-entropy browser or device attributes, document any security or fraud-prevention purpose, and align disclosures, consent posture, and data sharing controls."
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
    label: "Consent choice architecture review signals",
    section: "Consent Experience",
    defaultSurfacePriority: 95,
    whyItMatters:
      "Retained consent interaction structure can show that refusal or settings were less available than acceptance, which warrants consent UX review.",
    remediation:
      "Expose reject and settings at the first layer, remove accept-only or forced paths, and keep button prominence and interaction cost comparable across consent choices."
  },
  policy_behavior_contradiction_detected: {
    id: "policy_behavior_contradiction_detected",
    label: "Policy/runtime alignment review",
    section: "Privacy & Tracking",
    defaultSurfacePriority: 97,
    whyItMatters:
      "Runtime behavior and public disclosures should be reviewed together so teams can confirm the consent flow, implementation, and policy language are aligned.",
    remediation:
      "Compare the retained disclosure language against the observed runtime behavior, then confirm whether the implementation, consent flow, and public disclosures align."
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
    whyItMatters: "Popups are not inherently problematic, but they can degrade user experience.",
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
  keyboard_navigation_accessibility_issue: {
    id: "keyboard_navigation_accessibility_issue",
    label: "Keyboard navigation accessibility issue",
    section: "Accessibility",
    defaultSurfacePriority: 88,
    whyItMatters:
      "Keyboard operability barriers can prevent users from reaching or operating important page controls without a mouse.",
    remediation:
      "Fix the retained keyboard-related WCAG examples, verify controls are reachable and operable with Tab, Shift+Tab, Enter, Space, and Escape, then rerun the scan."
  },
  semantic_labeling_accessibility_issue: {
    id: "semantic_labeling_accessibility_issue",
    label: "Semantic labeling accessibility issue",
    section: "Accessibility",
    defaultSurfacePriority: 74,
    whyItMatters:
      "Missing or invalid accessible names, labels, roles, and ARIA semantics can make controls ambiguous or unusable for assistive technology users.",
    remediation:
      "Repair labels, accessible names, role/ARIA usage, and semantic structure for the retained axe examples, then rerun the accessibility scan."
  },
  text_alternative_accessibility_issue: {
    id: "text_alternative_accessibility_issue",
    label: "Text alternative accessibility issue",
    section: "Accessibility",
    defaultSurfacePriority: 62,
    whyItMatters:
      "Missing text alternatives can prevent non-text content from being understood by screen reader users and other assistive technologies.",
    remediation:
      "Add appropriate alt text, captions, or equivalent alternatives for the retained media and object examples, then rerun the accessibility scan."
  },
  visual_contrast_accessibility_issue: {
    id: "visual_contrast_accessibility_issue",
    label: "Visual contrast accessibility issue",
    section: "Accessibility",
    defaultSurfacePriority: 70,
    whyItMatters:
      "Insufficient contrast can make text and controls difficult to perceive, especially for users with low vision or color-vision differences.",
    remediation:
      "Adjust foreground, background, and state colors for the retained contrast examples until they meet the applicable WCAG contrast threshold."
  },
  focus_management_issue: {
    id: "focus_management_issue",
    label: "Focus management issue",
    section: "Accessibility",
    defaultSurfacePriority: 90,
    whyItMatters:
      "Broken focus handling in modals, overlays, consent banners, or dynamic views can trap keyboard users or leave them unable to understand where interaction moved.",
    remediation:
      "Move focus predictably on open, keep modal background content out of the tab order, restore focus on close, preserve visible focus, and verify the behavior with keyboard-only interaction."
  },
  guaranteed_or_high_return_claims_present: {
    id: "guaranteed_or_high_return_claims_present",
    label: "Guaranteed or high-return claims present",
    section: "Financial & Claims",
    defaultSurfacePriority: 76,
    whyItMatters:
      "Prominent guaranteed or unusually high-return language can create financial promotion review risk when substantiation and risk context are not visible near the claim.",
    remediation:
      "Qualify return language, keep assumptions and risk disclosures near the claim, and avoid implying guaranteed investment or trading outcomes."
  },
  performance_claims_without_context: {
    id: "performance_claims_without_context",
    label: "Performance claims lack context",
    section: "Financial & Claims",
    defaultSurfacePriority: 75,
    whyItMatters:
      "Performance claims need clear context so visitors can distinguish representative, historical, simulated, or aspirational results.",
    remediation:
      "Add adjacent context for timeframe, assumptions, variability, and whether the performance claim is historical, simulated, or illustrative."
  },
  high_risk_product_risk_disclosure_missing: {
    id: "high_risk_product_risk_disclosure_missing",
    label: "High-risk product risk disclosure missing",
    section: "Financial & Claims",
    defaultSurfacePriority: 74,
    whyItMatters: "High-risk product marketing can increase disclosure review risk when the associated risk context is not visible near the offer.",
    remediation: "Place clear risk, fee, eligibility, and material offer restriction disclosures adjacent to high-risk product marketing language."
  }
};
