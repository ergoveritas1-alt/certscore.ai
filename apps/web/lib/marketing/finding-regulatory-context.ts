export type FindingRegulatoryConcern = {
  id: string;
  label: string;
  displayCopy: string;
};

export type FindingRegulatoryContextItem = {
  id: string;
  label: string;
  level?: string;
  appliesWhen: string;
  sourceRefs: string[];
};

export type FindingRegulatoryContext = {
  findingId: string;
  label: string;
  category: string;
  regulatoryConcernGroup: string;
  primaryConcern: FindingRegulatoryConcern;
  technicalStandards: FindingRegulatoryContextItem[];
  jurisdictionalContexts: FindingRegulatoryContextItem[];
  displayCaution: string;
};

export const FINDING_REGULATORY_CONTEXT_VERSION = "2026-05-17";

export const FINDING_REGULATORY_CONTEXT_GLOBAL_CAUTION =
  "Regulatory applicability depends on jurisdiction, entity type, service category, user region, configuration, exemptions, and manual review. CertScore observations are automated public-web signals for review, not legal conclusions.";

const ACCESSIBILITY_LEGAL_VERSION_CAUTION =
  "WCAG references are technical review references. Legal obligations and incorporated versions may vary by jurisdiction and organization type, including WCAG 2.0, 2.1, 2.2, EN 301 549, ADA Title II, Section 508, EU Web Accessibility Directive / European Accessibility Act, and UK public-sector accessibility rules. This finding does not determine legal status or WCAG conformance.";

const ACCESSIBILITY_JURISDICTIONAL_CONTEXTS: FindingRegulatoryContextItem[] = [
  {
    id: "ada_title_ii_web_mobile_accessibility",
    label: "ADA Title II web/mobile accessibility review",
    appliesWhen: "State or local government web content or mobile apps may be in scope depending on organization context, service context, and manual review.",
    sourceRefs: ["ada_title_ii_web_rule"]
  },
  {
    id: "ada_title_iii_public_accommodation_accessibility",
    label: "ADA Title III public accommodation accessibility review",
    appliesWhen: "A business open to the public provides goods, services, or communications through the website.",
    sourceRefs: ["ada_web_guidance"]
  },
  {
    id: "section_508_ict_accessibility",
    label: "Section 508 ICT accessibility review",
    appliesWhen: "Federal agency ICT, federal web content, or federal procurement/vendor review may be in scope depending on organization context, procurement context, and manual review.",
    sourceRefs: ["section_508_mapping"]
  },
  {
    id: "en_301_549_eu_accessibility",
    label: "EN 301 549 / EU accessibility review",
    appliesWhen: "EU public-sector, procurement, Web Accessibility Directive, or European Accessibility Act service context may be in scope depending on organization context, service context, and manual review.",
    sourceRefs: ["eu_web_accessibility_directive_en_301_549", "eu_eaa"]
  },
  {
    id: "uk_public_sector_accessibility",
    label: "UK public-sector accessibility review",
    appliesWhen: "UK public-sector website or mobile app may be in scope depending on organization context, service context, and manual review.",
    sourceRefs: ["uk_public_sector_accessibility"]
  }
];

const CONSENT_JURISDICTIONAL_CONTEXTS: FindingRegulatoryContextItem[] = [
  {
    id: "eu_gdpr_eprivacy_consent_ui_review",
    label: "EU GDPR/ePrivacy consent UI review",
    appliesWhen: "EU/EEA users and cookie or tracking consent UI may be in scope.",
    sourceRefs: ["edpb_consent_guidelines", "edpb_cookie_banner_taskforce"]
  },
  {
    id: "uk_pecr_cookie_choice_review",
    label: "UK PECR / ICO cookie-choice review",
    appliesWhen: "UK users and non-essential cookie choices may be in scope.",
    sourceRefs: ["ico_cookies"]
  },
  {
    id: "us_privacy_dark_pattern_review",
    label: "U.S. privacy choice-architecture / dark-pattern review context",
    appliesWhen: "Retained UI evidence suggests privacy choices, opt-outs, consent, or targeted advertising controls may be affected.",
    sourceRefs: ["cppa_dark_patterns", "ftc_dark_patterns"]
  }
];

const HEALTH_CONTEXTS: FindingRegulatoryContextItem[] = [
  {
    id: "health_context_tracking_review",
    label: "Health-context online tracking review",
    appliesWhen: "The observed surface may involve health, telehealth, patient portals, health apps, or consumer health data.",
    sourceRefs: [
      "hhs_hipaa_tracking_technologies",
      "ftc_hhs_tracking_technologies",
      "ftc_health_notification_rule",
      "washington_my_health_my_data"
    ]
  },
  {
    id: "ccpa_cpra_sensitive_personal_information_review",
    label: "CCPA/CPRA sensitive personal information review",
    appliesWhen: "California users and sensitive personal information, sale/share, or cross-context advertising may be in scope.",
    sourceRefs: ["california_oag_ccpa", "cppa_faq"]
  },
  {
    id: "eu_gdpr_sensitive_data_review",
    label: "EU GDPR special-category or high-risk context review",
    appliesWhen: "EU/EEA users and Article 9 special-category data, sensitive inferences, or high-risk context may be in scope depending on the surface, purpose, and manual review.",
    sourceRefs: ["gdpr_article_9", "gdpr_article_5", "gdpr_article_6", "gdpr_article_32"]
  },
  {
    id: "ftc_sensitive_data_privacy_review",
    label: "FTC sensitive-data privacy review",
    appliesWhen: "Consumer-facing privacy claims, sensitive information, or third-party sharing practices may be at issue.",
    sourceRefs: ["ftc_hhs_tracking_technologies", "ftc_dark_patterns"]
  }
];

export const FINDING_REGULATORY_CONTEXTS: Record<string, FindingRegulatoryContext> = {
  visual_contrast_accessibility_issue: {
    findingId: "visual_contrast_accessibility_issue",
    label: "Visual contrast accessibility issue",
    category: "Accessibility",
    regulatoryConcernGroup: "accessibility",
    primaryConcern: {
      id: "low_visual_contrast_accessibility_review",
      label: "Accessibility: low visual contrast",
      displayCopy:
        "Retained automated accessibility evidence showed text or controls with contrast-related signals that may be relevant to WCAG-oriented accessibility review. Applicability depends on the affected element, visual state, text size, purpose, decorative or inactive status, page context, organization type, jurisdiction, and manual accessibility review."
    },
    technicalStandards: [
      {
        id: "wcag_1_4_3_contrast_minimum",
        label: "WCAG 1.4.3 Contrast (Minimum)",
        level: "AA",
        appliesWhen: "Text or images of text have contrast-related evidence that may require Contrast (Minimum) review.",
        sourceRefs: ["wcag_2_2"]
      },
      {
        id: "wcag_1_4_11_non_text_contrast",
        label: "WCAG 1.4.11 Non-text Contrast",
        level: "AA",
        appliesWhen: "Controls, icons, focus states, boundaries, or meaningful graphical objects have contrast-related evidence that may require non-text contrast review.",
        sourceRefs: ["wcag_non_text_contrast", "wcag_2_2"]
      }
    ],
    jurisdictionalContexts: ACCESSIBILITY_JURISDICTIONAL_CONTEXTS,
    displayCaution: `${ACCESSIBILITY_LEGAL_VERSION_CAUTION} Review the retained selector, color pair, text size, component state, element purpose, page context, applicable exceptions, organization type, jurisdiction, and manual accessibility findings.`
  },
  pre_consent_tracking_detected: {
    findingId: "pre_consent_tracking_detected",
    label: "Third-party tracking observed before recorded consent",
    category: "Consent",
    regulatoryConcernGroup: "consent_and_tracking",
    primaryConcern: {
      id: "pre_consent_non_essential_tracking_review",
      label: "Consent timing: tracking before recorded choice",
      displayCopy:
        "Runtime evidence showed a classified non-essential tracking, analytics, advertising, cross-site measurement, or storage signal before CertScore observed a consent action or a prior consent state associated with that purpose. This may be relevant to consent timing, cookie/tracker, storage, transparency, and user-choice review depending on jurisdiction, purpose, configuration, and exemptions."
    },
    technicalStandards: [
      {
        id: "eprivacy_article_5_3_storage_or_access",
        label: "ePrivacy Article 5(3) storage/access review",
        appliesWhen: "Cookies, local storage, device identifiers, or similar terminal-equipment access occurs before consent or outside a recognized exemption.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_eprivacy_art_5_3_scope"]
      },
      {
        id: "gdpr_valid_consent_review",
        label: "GDPR valid consent review",
        appliesWhen: "Consent is used as the lawful basis for personal-data processing or for cookie/device-access consent.",
        sourceRefs: ["gdpr", "edpb_consent_guidelines"]
      },
      {
        id: "gdpr_transparency_and_default_review",
        label: "GDPR transparency and data protection by default review",
        appliesWhen: "Personal data, online identifiers, profiling, or third-party disclosure may be involved.",
        sourceRefs: ["gdpr_article_4", "gdpr_article_5", "gdpr_article_13", "gdpr_article_25"]
      }
    ],
    jurisdictionalContexts: [
      {
        id: "eu_eprivacy_gdpr_tracking_consent",
        label: "EU ePrivacy/GDPR tracking consent review",
        appliesWhen: "EU/EEA users, cookies, device access, analytics, advertising, or profiling may be in scope depending on purpose, consent state, jurisdictional context, and manual review.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_consent_guidelines"]
      },
      {
        id: "uk_pecr_cookie_consent_review",
        label: "UK PECR / ICO cookie consent review",
        appliesWhen: "UK users and non-essential cookies or similar technologies may be in scope depending on purpose, consent state, jurisdictional context, and manual review.",
        sourceRefs: ["ico_cookies"]
      },
      {
        id: "ccpa_cpra_sale_share_or_targeted_ad_review",
        label: "CCPA/CPRA sale, share, or cross-context advertising review",
        appliesWhen: "California users and the observed non-essential advertising, analytics, identifier-sharing, or vendor activity could be relevant to sale/share, cross-context behavioral advertising, or opt-out honoring review; pre-consent timing alone does not determine sale/share status.",
        sourceRefs: ["california_oag_ccpa", "cppa_faq"]
      },
      {
        id: "ftc_privacy_claims_review",
        label: "FTC privacy claim review",
        appliesWhen: "Runtime behavior may conflict with public statements, consent claims, or privacy representations.",
        sourceRefs: ["ftc_dark_patterns"]
      }
    ],
    displayCaution: "This finding does not determine legal status. Review the retained runtime anchors, vendor purpose, necessity, consent state, disclosure, region targeting, CMP configuration, prior consent state, and any applicable exemptions."
  },
  semantic_labeling_accessibility_issue: {
    findingId: "semantic_labeling_accessibility_issue",
    label: "Semantic labeling accessibility issue",
    category: "Accessibility",
    regulatoryConcernGroup: "accessibility",
    primaryConcern: {
      id: "accessible_name_role_semantics_review",
      label: "Accessibility: semantic labels and programmatic meaning",
      displayCopy:
        "Retained automated accessibility evidence showed label, accessible-name, ARIA, role, relationship, or name/role/value signals that may be relevant to WCAG-oriented accessibility review. Applicability depends on the affected element, component behavior, semantic intent, user impact, organization type, jurisdiction, and manual accessibility review."
    },
    technicalStandards: [
      {
        id: "wcag_1_3_1_info_and_relationships",
        label: "WCAG 1.3.1 Info and Relationships",
        level: "A",
        appliesWhen: "Visual structure, labels, groups, headings, or relationships are not programmatically determinable.",
        sourceRefs: ["wcag_2_2"]
      },
      {
        id: "wcag_3_3_2_labels_or_instructions",
        label: "WCAG 3.3.2 Labels or Instructions",
        level: "A",
        appliesWhen: "Inputs or required user actions lack adequate labels or instructions.",
        sourceRefs: ["wcag_2_2"]
      },
      {
        id: "wcag_4_1_2_name_role_value",
        label: "WCAG 4.1.2 Name, Role, Value",
        level: "A",
        appliesWhen: "Custom controls, form elements, or ARIA usage may require name, role, state, or value review.",
        sourceRefs: ["wcag_2_2"]
      },
      {
        id: "wcag_2_4_6_headings_and_labels",
        label: "WCAG 2.4.6 Headings and Labels",
        level: "AA",
        appliesWhen: "Headings or labels may not describe topic or purpose clearly enough for review.",
        sourceRefs: ["wcag_2_2"]
      }
    ],
    jurisdictionalContexts: ACCESSIBILITY_JURISDICTIONAL_CONTEXTS,
    displayCaution: `${ACCESSIBILITY_LEGAL_VERSION_CAUTION} Review the retained selector, visible label, accessible name, role, state, value, ARIA relationship, component behavior, page context, organization type, jurisdiction, and manual accessibility findings.`
  },
  fingerprinting_related_signals_observed: {
    findingId: "fingerprinting_related_signals_observed",
    label: "Fingerprinting-related signals observed",
    category: "Fingerprinting",
    regulatoryConcernGroup: "fingerprinting_and_device_signals",
    primaryConcern: {
      id: "fingerprinting_related_device_signal_review",
      label: "Device/browser signal collection review",
      displayCopy:
        "Retained runtime evidence showed browser, device, canvas, storage, or other high-entropy environment signals that may be relevant to fingerprinting, device-access, profiling, minimization, and disclosure review. This related signal does not by itself show that a persistent fingerprint was created."
    },
    technicalStandards: [
      {
        id: "eprivacy_article_5_3_device_access_review",
        label: "ePrivacy Article 5(3) device access review",
        appliesWhen: "Retained evidence suggests browser/device signals may involve storing information on, or gaining access to information from, user terminal equipment.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_eprivacy_art_5_3_scope"]
      },
      {
        id: "gdpr_online_identifier_and_profiling_review",
        label: "GDPR online identifier / profiling review",
        appliesWhen: "Device or browser signals may relate to online identifiers, profiling, or identifiability depending on purpose, linkage, and manual review.",
        sourceRefs: ["gdpr", "gdpr_article_4"]
      },
      {
        id: "gdpr_data_minimization_and_transparency_review",
        label: "GDPR minimization and transparency review",
        appliesWhen: "High-entropy collection, profiling, or third-party use may require review of purpose, transparency, minimization, and default settings.",
        sourceRefs: ["gdpr_article_5", "gdpr_article_13", "gdpr_article_25"]
      }
    ],
    jurisdictionalContexts: [
      {
        id: "eu_eprivacy_fingerprinting_review",
        label: "EU ePrivacy fingerprinting/device-access review",
        appliesWhen: "EU/EEA users and device/browser signal collection may be in scope depending on terminal-equipment access, purpose, consent state, and manual review.",
        sourceRefs: ["edpb_eprivacy_art_5_3_scope"]
      },
      {
        id: "uk_pecr_similar_technology_review",
        label: "UK PECR similar-technology review",
        appliesWhen: "UK users and non-cookie tracking or device-access signals may be in scope depending on purpose, consent state, and manual review.",
        sourceRefs: ["ico_cookies"]
      },
      {
        id: "ccpa_cpra_cross_context_ad_or_profiling_review",
        label: "CCPA/CPRA advertising, sharing, or profiling review",
        appliesWhen: "California users, cross-context behavioral advertising, sale/share, or sensitive personal information context may be relevant depending on purpose, user region, and manual review.",
        sourceRefs: ["california_oag_ccpa", "cppa_faq"]
      }
    ],
    displayCaution: "This finding does not determine legal status, consent validity, personal identity, identity resolution, persistent fingerprint creation, user singling-out, or compliance status. Security, fraud-prevention, analytics, compatibility, and personalization scripts may collect similar attributes for different purposes."
  },
  session_recording_services_detected: {
    findingId: "session_recording_services_detected",
    label: "Session replay service signal observed",
    category: "Third-party tracking",
    regulatoryConcernGroup: "session_replay_and_behavior_analytics",
    primaryConcern: {
      id: "session_replay_behavior_analytics_review",
      label: "Session replay and behavior analytics review",
      displayCopy:
        "Retained runtime evidence showed session replay, heatmap, recording, or behavior-analytics service signals that may be relevant to consent, transparency, minimization, security, sensitive-page exclusion, and vendor-governance review. Browser-visible evidence does not determine capture, retention, interception, or legal status."
    },
    technicalStandards: [
      {
        id: "gdpr_transparency_minimization_security_review",
        label: "GDPR transparency, minimization, and security review",
        appliesWhen: "Behavior-analytics or replay signals may involve personal data, identifiers, form interactions, or user behavior profiles depending on implementation and context.",
        sourceRefs: ["gdpr_article_4", "gdpr_article_5", "gdpr_article_13", "gdpr_article_25", "gdpr_article_32"]
      },
      {
        id: "eprivacy_device_access_or_storage_review",
        label: "ePrivacy device access/storage review",
        appliesWhen: "Replay tooling may store identifiers, access device/browser information, or use cookies/similar technologies depending on vendor configuration.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_eprivacy_art_5_3_scope"]
      },
      {
        id: "wiretap_eavesdropping_manual_review",
        label: "Wiretap, eavesdropping, or recording-law manual review",
        appliesWhen: "Replay or recording signals may require jurisdiction-specific manual legal review where interaction capture, communications, consent-to-record, or similar theories may be relevant. Browser-visible evidence does not determine capture, retention, interception, or legal status.",
        sourceRefs: ["ecpa_18_usc_2511"]
      }
    ],
    jurisdictionalContexts: [
      {
        id: "eu_gdpr_eprivacy_session_replay_review",
        label: "EU GDPR/ePrivacy session replay review",
        appliesWhen: "EU/EEA users, identifiers, behavior telemetry, cookies, or device-access signals may be in scope depending on purpose, consent state, and jurisdictional context.",
        sourceRefs: ["gdpr", "eprivacy_directive_article_5_3"]
      },
      {
        id: "uk_pecr_uk_gdpr_behavior_analytics_review",
        label: "UK PECR / UK GDPR behavior analytics review",
        appliesWhen: "UK users, cookies/similar technologies, or personal-data behavior analytics may be in scope depending on purpose, consent state, and manual review.",
        sourceRefs: ["ico_cookies"]
      },
      ...HEALTH_CONTEXTS.slice(0, 2)
    ],
    displayCaution: "This finding does not determine legal status, consent validity, keystroke capture, sensitive-value capture, full recording retention, interception, or compliance status. Review retained runtime anchors, vendor configuration, masking, sampling, consent state, payload contents, and page exclusions."
  },
  third_party_cookie_pre_consent: {
    findingId: "third_party_cookie_pre_consent",
    label: "Third-party cookie or storage observed before consent",
    category: "Cookies",
    regulatoryConcernGroup: "cookies_and_storage",
    primaryConcern: {
      id: "third_party_cookie_before_consent_review",
      label: "Cookie/storage timing: third-party cookie or storage before recorded choice",
      displayCopy:
        "Retained runtime evidence showed third-party cookie or storage timing signals that may be relevant to cookie/tracker, consent timing, storage/access, transparency, and vendor-governance review. Applicability depends on jurisdiction, purpose, domain/scope, consent state, necessity, exemptions, and manual review."
    },
    technicalStandards: [
      {
        id: "eprivacy_article_5_3_cookie_storage_review",
        label: "ePrivacy Article 5(3) cookie/storage review",
        appliesWhen: "Retained evidence suggests cookie or similar-storage timing may require review before treating the purpose as consent-gated, necessary, or exempt.",
        sourceRefs: ["eprivacy_directive_article_5_3"]
      },
      {
        id: "gdpr_consent_and_transparency_review",
        label: "GDPR consent and transparency review",
        appliesWhen: "Cookie identifiers or tracking storage may relate to personal data, profiling, analytics, or advertising depending on purpose and context.",
        sourceRefs: ["gdpr", "gdpr_article_4", "gdpr_article_13", "edpb_consent_guidelines"]
      }
    ],
    jurisdictionalContexts: [
      {
        id: "eu_cookie_consent_review",
        label: "EU cookie consent review",
        appliesWhen: "EU/EEA users and non-essential cookies or storage may be in scope depending on purpose, consent state, jurisdictional context, and manual review.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_cookie_banner_taskforce"]
      },
      {
        id: "uk_pecr_cookie_consent_review",
        label: "UK PECR / ICO cookie consent review",
        appliesWhen: "UK users and non-essential cookies, storage, or similar technologies may be in scope depending on purpose, consent state, jurisdictional context, and manual review.",
        sourceRefs: ["ico_cookies"]
      },
      {
        id: "ccpa_cpra_ad_cookie_sale_share_review",
        label: "CCPA/CPRA advertising cookie sale/share review",
        appliesWhen: "California users and third-party advertising cookie or storage signals may be relevant to sale/share or cross-context behavioral advertising review depending on purpose, vendor role, user region, and manual review.",
        sourceRefs: ["california_oag_ccpa", "cppa_faq"]
      }
    ],
    displayCaution: "This finding does not determine legal status, consent validity, necessity, exemption status, or compliance status. Review the retained cookie/storage anchor, domain/scope, timing, vendor purpose, consent state, regional configuration, and applicable exemptions."
  },
  rtb_cookie_sync_observed: {
    findingId: "rtb_cookie_sync_observed",
    label: "Adtech identity sync-like request observed",
    category: "Third-party tracking",
    regulatoryConcernGroup: "adtech_identity_sync",
    primaryConcern: {
      id: "rtb_cookie_sync_identity_matching_review",
      label: "Adtech identity sync-like request review",
      displayCopy:
        "Retained network evidence showed adtech, RTB, sync, match, redirect, or identifier-like request patterns that may be relevant to cookie/tracker, advertising, consent, transparency, sale/share, and vendor-governance review. Applicability depends on endpoint purpose, identifier scope, consent state, jurisdiction, vendor role, server-side behavior, and manual review."
    },
    technicalStandards: [
      {
        id: "eprivacy_cookie_sync_storage_access_review",
        label: "ePrivacy adtech sync-like storage/access review",
        appliesWhen: "Sync-like requests may involve cookies, redirect identifiers, device storage, or terminal-equipment access.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_eprivacy_art_5_3_scope"]
      },
      {
        id: "gdpr_online_identifier_profiling_transparency_review",
        label: "GDPR online identifier, profiling, and transparency review",
        appliesWhen: "Identifier sharing, profiling, advertising, or data-transfer review may be relevant where personal data or online identifiers may be in scope depending on purpose, context, and manual review.",
        sourceRefs: ["gdpr_article_4", "gdpr_article_5", "gdpr_article_6", "gdpr_article_13", "gdpr_article_25"]
      }
    ],
    jurisdictionalContexts: [
      {
        id: "eu_eprivacy_gdpr_adtech_review",
        label: "EU ePrivacy/GDPR adtech review",
        appliesWhen: "EU/EEA users and adtech sync-like or identity-matching signals may be in scope depending on endpoint purpose, consent state, and jurisdictional context.",
        sourceRefs: ["eprivacy_directive_article_5_3", "gdpr"]
      },
      {
        id: "uk_pecr_adtech_cookie_review",
        label: "UK PECR adtech cookie/similar-technology review",
        appliesWhen: "UK users and non-essential adtech cookies or similar technologies may be in scope depending on purpose, consent state, jurisdictional context, and manual review.",
        sourceRefs: ["ico_cookies"]
      },
      {
        id: "ccpa_cpra_sale_share_cross_context_ad_review",
        label: "CCPA/CPRA sale/share and cross-context behavioral advertising review",
        appliesWhen: "California users, advertising-sharing signals, or cross-context behavioral advertising context may be in scope depending on purpose, user region, and manual review.",
        sourceRefs: ["california_oag_ccpa", "cppa_faq"]
      }
    ],
    displayCaution: "This finding does not determine legal status, confirmed cookie syncing, personal identity, complete identity graph, consent validity, sale/share status, or compliance status. Review the retained request anchors, vendor purpose, redacted identifier-like keys, redirect context, consent timing, regional configuration, and applicable exemptions."
  },
  text_alternative_accessibility_issue: {
    findingId: "text_alternative_accessibility_issue",
    label: "Text alternative accessibility issue",
    category: "Accessibility",
    regulatoryConcernGroup: "accessibility",
    primaryConcern: {
      id: "missing_or_weak_text_alternatives_review",
      label: "Accessibility: missing or weak text alternatives",
      displayCopy:
        "Retained automated accessibility evidence showed non-text content, images, icons, SVGs, or media-related elements with text-alternative signals that may be relevant to WCAG-oriented accessibility review. Applicability depends on element purpose, decorative or informative status, functional behavior, surrounding content, organization type, jurisdiction, and manual accessibility review."
    },
    technicalStandards: [
      {
        id: "wcag_1_1_1_non_text_content",
        label: "WCAG 1.1.1 Non-text Content",
        level: "A",
        appliesWhen: "Informative, functional, complex, or sensory non-text content lacks an appropriate text alternative.",
        sourceRefs: ["wcag_2_2"]
      },
      {
        id: "wcag_4_1_2_name_role_value_functional_images",
        label: "WCAG 4.1.2 Name, Role, Value",
        level: "A",
        appliesWhen: "Image buttons, SVG controls, or icon-only controls do not expose an accessible name, role, state, or value.",
        sourceRefs: ["wcag_2_2"]
      },
      {
        id: "wcag_1_4_5_images_of_text",
        label: "WCAG 1.4.5 Images of Text",
        level: "AA",
        appliesWhen: "Images of text are used where real text could provide equivalent presentation and accessibility.",
        sourceRefs: ["wcag_2_2"]
      }
    ],
    jurisdictionalContexts: ACCESSIBILITY_JURISDICTIONAL_CONTEXTS,
    displayCaution: `${ACCESSIBILITY_LEGAL_VERSION_CAUTION} Review the retained selector, element purpose, accessible name or text alternative, surrounding text, decorative or informative status, functional behavior, page context, organization type, jurisdiction, and manual accessibility findings.`
  },
  consent_dark_patterns_detected: {
    findingId: "consent_dark_patterns_detected",
    label: "Consent choice architecture review signals",
    category: "Consumer protection / Consent UX",
    regulatoryConcernGroup: "consent_experience_and_choice_architecture",
    primaryConcern: {
      id: "consent_choice_architecture_dark_pattern_review",
      label: "Consent UX choice architecture review",
      displayCopy:
        "Retained consent-surface evidence showed choice-architecture signals that may be relevant to consent, cookie/tracker, transparency, accessibility, consumer-protection, and privacy-claims review. Applicability depends on jurisdiction, region, purpose, CMP configuration, equivalent choice paths, public statements, accessibility, user impact, and manual review."
    },
    technicalStandards: [
      {
        id: "gdpr_valid_consent_free_specific_informed_unambiguous",
        label: "GDPR valid consent review",
        appliesWhen: "Consent may be used for cookies, tracking, personal data processing, profiling, or advertising.",
        sourceRefs: ["gdpr", "edpb_consent_guidelines"]
      },
      {
        id: "edpb_cookie_banner_design_review",
        label: "EDPB cookie banner design review",
        appliesWhen: "Retained consent-surface evidence suggests hidden reject paths, preselected choices, confusing hierarchy, or unequal interaction cost may require review.",
        sourceRefs: ["edpb_cookie_banner_taskforce"]
      },
      {
        id: "ccpa_cpra_dark_pattern_consent_or_request_review",
        label: "CCPA/CPRA choice-architecture / dark-pattern review context",
        appliesWhen: "The interface may affect California privacy choices, opt-out paths, or consent.",
        sourceRefs: ["cppa_dark_patterns", "california_oag_ccpa"]
      },
      {
        id: "ftc_dark_pattern_review",
        label: "FTC choice architecture / dark-pattern review context",
        appliesWhen: "Design choices may obscure, burden, or otherwise affect user choices involving privacy or commerce.",
        sourceRefs: ["ftc_dark_patterns"]
      }
    ],
    jurisdictionalContexts: CONSENT_JURISDICTIONAL_CONTEXTS,
    displayCaution: "This finding does not determine legal status, deception, unfairness, dark-pattern status, consent validity, or compliance status. Review the retained consent-surface evidence, labels, hierarchy, path depth, prompt behavior, region targeting, CMP configuration, accessibility, public statements, and applicable exemptions."
  },
  cpra_cba_opt_out_missing: {
    findingId: "cpra_cba_opt_out_missing",
    label: "CPRA / privacy choice opt-out review signal",
    category: "Disclosure gaps",
    regulatoryConcernGroup: "privacy_choices_and_opt_outs",
    primaryConcern: {
      id: "cpra_cross_context_advertising_opt_out_review",
      label: "California privacy choices: sale/share or cross-context advertising opt-out review",
      displayCopy:
        "Retained public-surface and runtime evidence showed privacy-choice, advertising, cross-context behavioral advertising, or sale/share-related review signals that may be relevant to CPRA, opt-out, GPC, disclosure, consent, and vendor-governance review. Applicability depends on organization scope, user region, purpose, vendor role, sale/share or cross-context behavioral advertising analysis, exemptions, GPC-specific scan state, and manual review."
    },
    technicalStandards: [
      {
        id: "ccpa_cpra_sale_share_opt_out_review",
        label: "CPRA Do Not Sell or Share review context",
        appliesWhen: "California users and the observed advertising, cross-context behavioral advertising, sale/share-related, or privacy-choice context may be relevant depending on organization scope, user region, data purpose, vendor role, exemptions, GPC-specific scan state, and manual review.",
        sourceRefs: ["california_oag_ccpa", "cppa_faq"]
      },
      {
        id: "gpc_and_privacy_choice_honoring_review",
        label: "Global Privacy Control / privacy-choice honoring review",
        appliesWhen: "GPC handling is relevant only when a GPC-specific request state was sent and retained; otherwise privacy-choice handling requires manual review of retained public-surface evidence, choice paths, and opt-out context.",
        sourceRefs: ["california_oag_ccpa"]
      },
      {
        id: "privacy_notice_and_runtime_consistency_review",
        label: "California privacy notice and rights-flow review",
        appliesWhen: "Retained policy, footer, preference-center, or privacy-link evidence may require review against the observed runtime or public-surface context.",
        sourceRefs: ["california_oag_ccpa", "cppa_dark_patterns"]
      }
    ],
    jurisdictionalContexts: [
      {
        id: "california_ccpa_cpra_review",
        label: "CCPA/CPRA opt-out / privacy choice review",
        appliesWhen: "California privacy-choice review may be relevant depending on organization scope, user region, data purpose, vendor role, sale/share analysis, cross-context behavioral advertising context, GPC-specific scan state, and exemptions.",
        sourceRefs: ["california_oag_ccpa", "cppa_faq"]
      },
      {
        id: "ftc_privacy_representation_review",
        label: "FTC privacy claims / choice architecture review context",
        appliesWhen: "Public privacy statements, consent choices, opt-out paths, or runtime behavior may be relevant to consumer-protection review without determining deception, unfairness, or legal status.",
        sourceRefs: ["ftc_dark_patterns"]
      },
      {
        id: "eprivacy_consent_choice_review",
        label: "ePrivacy / consent review where cookies or trackers are connected to the choice interface",
        appliesWhen: "Cookie, tracker, consent, or similar-technology context may be relevant where retained runtime evidence is connected to the privacy-choice interface.",
        sourceRefs: ["ico_cookies", "edpb_consent_guidelines"]
      }
    ],
    displayCaution: "This finding does not determine legal status, CPRA applicability, sale/share status, cross-context behavioral advertising status, opt-out sufficiency, GPC handling, exemption status, or compliance status. GPC handling is not determined unless a GPC-specific request state was sent and retained. Review the retained public-surface evidence, privacy links, policy text, preference-center behavior, runtime context, user region, organization scope, and applicable exemptions."
  },
  forced_consent_interaction: {
    findingId: "forced_consent_interaction",
    label: "Consent prompt appeared to require interaction",
    category: "Consent",
    regulatoryConcernGroup: "consent_experience_and_choice_architecture",
    primaryConcern: {
      id: "forced_consent_or_cookie_wall_review",
      label: "Consent UX: required-interaction or cookie-wall review signal",
      displayCopy:
        "Retained consent-surface evidence showed overlay, blocking, or required-interaction signals that appeared to block ordinary page access or require interaction before continuing. These signals may be relevant to consent, cookie/tracker, transparency, accessibility, and choice-architecture review depending on jurisdiction, service necessity, CMP configuration, available choice paths, and manual review."
    },
    technicalStandards: [
      {
        id: "gdpr_freely_given_consent_review",
        label: "GDPR freely given consent review",
        appliesWhen: "Retained consent-surface evidence suggests consent may be requested for tracking or personal-data processing before ordinary access or browsing continues.",
        sourceRefs: ["edpb_consent_guidelines"]
      },
      {
        id: "eprivacy_cookie_consent_review",
        label: "ePrivacy cookie consent review",
        appliesWhen: "The prompt may govern non-essential cookies or similar technologies.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_cookie_banner_taskforce"]
      },
      {
        id: "accessibility_modal_or_overlay_review",
        label: "Accessibility overlay/modal review",
        appliesWhen: "Retained consent-surface evidence suggests an overlay or modal may affect content access, focus, keyboard operation, or screen-reader flow.",
        sourceRefs: ["wcag_2_2"]
      }
    ],
    jurisdictionalContexts: CONSENT_JURISDICTIONAL_CONTEXTS,
    displayCaution: "This finding does not determine legal status, consent validity, deception, unfairness, or dark-pattern status. Review the retained consent-surface evidence, blocking behavior, available controls, service context, region targeting, CMP configuration, accessibility, and applicable exemptions."
  },
  reject_option_missing_or_hidden: {
    findingId: "reject_option_missing_or_hidden",
    label: "Reject/refusal option not observed or nested",
    category: "Consent",
    regulatoryConcernGroup: "consent_experience_and_choice_architecture",
    primaryConcern: {
      id: "missing_or_hidden_reject_path_review",
      label: "Consent UX: refusal-path availability review signal",
      displayCopy:
        "Retained consent-surface evidence showed refusal-control availability or path-depth signals, such as a refusal option not observed on the initial layer, nested behind another control, or presented through a less direct path. These signals may be relevant to consent, cookie/tracker, transparency, and choice-architecture review depending on jurisdiction, CMP configuration, equivalent choice paths, accessibility, and manual review."
    },
    technicalStandards: [
      {
        id: "edpb_cookie_banner_reject_path_review",
        label: "EDPB cookie banner reject-path review",
        appliesWhen: "Retained consent-surface evidence suggests accept is available on the first layer while an equivalent reject or refusal path may be absent, less visible, or harder to reach.",
        sourceRefs: ["edpb_cookie_banner_taskforce"]
      },
      {
        id: "gdpr_freely_given_unambiguous_consent_review",
        label: "GDPR freely given and unambiguous consent review",
        appliesWhen: "Consent may be used for cookies, tracking, personal data processing, profiling, or advertising.",
        sourceRefs: ["edpb_consent_guidelines", "gdpr"]
      },
      {
        id: "ccpa_cpra_dark_pattern_opt_out_friction_review",
        label: "CCPA/CPRA choice-architecture and opt-out friction review",
        appliesWhen: "The interface may affect California privacy choices, opt-out paths, or consent.",
        sourceRefs: ["cppa_dark_patterns", "california_oag_ccpa"]
      },
      {
        id: "ftc_dark_pattern_review",
        label: "FTC choice architecture / dark-pattern review context",
        appliesWhen: "The flow may obscure or burden refusal or privacy choices.",
        sourceRefs: ["ftc_dark_patterns"]
      }
    ],
    jurisdictionalContexts: CONSENT_JURISDICTIONAL_CONTEXTS,
    displayCaution: "This finding does not determine legal status, whether a reject option exists in all regions or layers, consent validity, deception, unfairness, or dark-pattern status. Review the retained consent-surface evidence, labels, paths, region targeting, CMP configuration, accessibility, and applicable exemptions."
  },
  sensitive_data_collection_with_third_party_tracking_present: {
    findingId: "sensitive_data_collection_with_third_party_tracking_present",
    label: "Sensitive input surfaces detected alongside third-party tracking",
    category: "Third-party tracking",
    regulatoryConcernGroup: "sensitive_data_and_tracking",
    primaryConcern: {
      id: "sensitive_surface_third_party_tracking_review",
      label: "Sensitive surface with third-party tracking review",
      displayCopy:
        "Retained page and runtime evidence showed sensitive-input or sensitive-context signals alongside third-party tracking context that may be relevant to privacy, consent, minimization, sensitive-data, and vendor-governance review. Applicability depends on field purpose, payload contents, vendor role, consent state, jurisdiction, and manual review."
    },
    technicalStandards: [
      {
      id: "gdpr_special_category_and_sensitive_context_review",
        label: "GDPR special-category or high-risk context review",
        appliesWhen: "The retained surface context may involve Article 9 special-category data, such as health, biometric-for-identification, genetic, racial or ethnic origin, political opinion, religious or philosophical belief, trade-union membership, sex-life, or sexual-orientation context, or may otherwise involve sensitive/high-risk fields that require manual review.",
        sourceRefs: ["gdpr_article_9", "gdpr_article_5", "gdpr_article_6", "gdpr_article_32"]
      },
      {
        id: "gdpr_minimization_security_transparency_review",
        label: "GDPR minimization, security, and transparency review",
        appliesWhen: "Third-party vendor, tracking, or identifier-like signals appear near sensitive data collection surfaces and may require minimization, transparency, or security review.",
        sourceRefs: ["gdpr_article_4", "gdpr_article_5", "gdpr_article_6", "gdpr_article_13", "gdpr_article_25", "gdpr_article_32"]
      },
      {
        id: "eprivacy_tracking_on_sensitive_surface_review",
        label: "ePrivacy cookie/device-access review",
        appliesWhen: "The sensitive surface may involve cookies, device access, analytics, advertising, or similar tracking technologies depending on retained runtime evidence and manual review.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_eprivacy_art_5_3_scope"]
      }
    ],
    jurisdictionalContexts: HEALTH_CONTEXTS,
    displayCaution: "This finding does not determine legal status, GDPR Article 9 status, consent validity, sensitive-value transmission, third-party receipt, or compliance status. Financial, identity, contact, location, employment, children, protected-class, or other high-risk context signals require manual review and are not automatically GDPR Article 9 special-category data. Review retained surface context, runtime anchors, payload evidence, vendor purpose, consent state, minimization, and page-level exclusions."
  },
  asymmetric_consent_ui: {
    findingId: "asymmetric_consent_ui",
    label: "Consent choices appear imbalanced",
    category: "Consent",
    regulatoryConcernGroup: "consent_experience_and_choice_architecture",
    primaryConcern: {
      id: "asymmetric_consent_choice_architecture_review",
      label: "Consent UX: imbalanced accept/reject choices",
      displayCopy:
        "Retained consent-surface evidence showed visual, procedural, or structural choice-architecture signals that may be relevant to consent, cookie/tracker, transparency, accessibility, and consumer-protection review. Applicability depends on jurisdiction, region, purpose, CMP configuration, available choice paths, accessibility, user impact, and manual review."
    },
    technicalStandards: [
      {
        id: "edpb_cookie_banner_visual_hierarchy_review",
        label: "EDPB cookie banner visual hierarchy review",
        appliesWhen: "Retained consent-surface evidence suggests reject may be hidden, de-emphasized, nested, link-only, or materially harder than accept.",
        sourceRefs: ["edpb_cookie_banner_taskforce"]
      },
      {
        id: "gdpr_freely_given_specific_informed_unambiguous_consent_review",
        label: "GDPR consent quality review",
        appliesWhen: "Consent may be requested through imbalanced wording, layout, visual hierarchy, or interaction cost.",
        sourceRefs: ["edpb_consent_guidelines", "gdpr"]
      },
      {
        id: "ccpa_cpra_clear_and_balanced_choice_review",
        label: "CCPA/CPRA clear and balanced choice review",
        appliesWhen: "California privacy choices, opt-out requests, or consent flows may be affected by unclear or imbalanced UI.",
        sourceRefs: ["cppa_dark_patterns"]
      },
      {
        id: "ftc_dark_pattern_choice_architecture_review",
        label: "FTC choice architecture / dark-pattern review context",
        appliesWhen: "Design choices may obscure, burden, or otherwise affect privacy choices.",
        sourceRefs: ["ftc_dark_patterns"]
      }
    ],
    jurisdictionalContexts: CONSENT_JURISDICTIONAL_CONTEXTS,
    displayCaution: "This finding does not determine legal status, deception, unfairness, dark-pattern status, consent validity, or compliance status. Review the retained consent-surface evidence, labels, hierarchy, path depth, region targeting, CMP configuration, accessibility, and applicable exemptions."
  },
  keyboard_navigation_accessibility_issue: {
    findingId: "keyboard_navigation_accessibility_issue",
    label: "Keyboard navigation accessibility issue",
    category: "Accessibility",
    regulatoryConcernGroup: "accessibility",
    primaryConcern: {
      id: "keyboard_operability_and_focus_review",
      label: "Accessibility: keyboard operability and focus",
      displayCopy:
        "Retained automated accessibility evidence showed keyboard, focus, interaction, or custom-control signals that may be relevant to WCAG-oriented accessibility review. Applicability depends on the affected element, interaction state, keyboard path, focus behavior, component behavior, organization type, jurisdiction, and manual accessibility review."
    },
    technicalStandards: [
      {
        id: "wcag_2_1_1_keyboard",
        label: "WCAG 2.1.1 Keyboard",
        level: "A",
        appliesWhen: "Functionality cannot be operated through a keyboard interface.",
        sourceRefs: ["wcag_2_2"]
      },
      {
        id: "wcag_2_1_2_no_keyboard_trap",
        label: "WCAG 2.1.2 No Keyboard Trap",
        level: "A",
        appliesWhen: "Keyboard focus can enter a component but cannot leave it using keyboard controls.",
        sourceRefs: ["wcag_2_2"]
      },
      {
        id: "wcag_2_4_3_focus_order",
        label: "WCAG 2.4.3 Focus Order",
        level: "A",
        appliesWhen: "Focus order does not preserve meaning or operability.",
        sourceRefs: ["wcag_2_2"]
      },
      {
        id: "wcag_2_4_7_focus_visible",
        label: "WCAG 2.4.7 Focus Visible",
        level: "AA",
        appliesWhen: "Keyboard focus indicator is not visible or is visually suppressed.",
        sourceRefs: ["wcag_2_2"]
      },
      {
        id: "wcag_2_4_11_focus_not_obscured",
        label: "WCAG 2.4.11 Focus Not Obscured",
        level: "AA",
        appliesWhen: "Focused components are hidden or obscured by sticky headers, overlays, cookie banners, or modals.",
        sourceRefs: ["wcag_2_2"]
      },
      {
        id: "wcag_4_1_2_name_role_value_keyboard_controls",
        label: "WCAG 4.1.2 Name, Role, Value",
        level: "A",
        appliesWhen: "Custom controls may require name, role, state, or value review to support keyboard and assistive-technology interaction.",
        sourceRefs: ["wcag_2_2"]
      }
    ],
    jurisdictionalContexts: ACCESSIBILITY_JURISDICTIONAL_CONTEXTS,
    displayCaution: `${ACCESSIBILITY_LEGAL_VERSION_CAUTION} Review the retained selector, element role, keyboard operability, focus visibility, focus order, interaction state, component behavior, page context, organization type, jurisdiction, and manual accessibility findings.`
  },
  focus_management_issue: {
    findingId: "focus_management_issue",
    label: "Focus management issue",
    category: "Accessibility",
    regulatoryConcernGroup: "accessibility",
    primaryConcern: {
      id: "focus_management_and_keyboard_context_review",
      label: "Accessibility: focus management and keyboard context",
      displayCopy:
        "Retained automated accessibility evidence showed focus movement, focus containment, focus restoration, dynamic-view, modal, overlay, or keyboard-focus signals that may be relevant to WCAG-oriented accessibility review. Applicability depends on the affected component, interaction state, keyboard path, focus behavior, organization type, jurisdiction, and manual accessibility review."
    },
    technicalStandards: [
      {
        id: "wcag_2_1_2_no_keyboard_trap",
        label: "WCAG 2.1.2 No Keyboard Trap",
        level: "A",
        appliesWhen: "Keyboard focus can enter a component but cannot leave it using keyboard controls.",
        sourceRefs: ["wcag_2_2"]
      },
      {
        id: "wcag_2_4_3_focus_order",
        label: "WCAG 2.4.3 Focus Order",
        level: "A",
        appliesWhen: "Focus movement does not preserve meaning or operability when dialogs, overlays, dynamic content, or route changes occur.",
        sourceRefs: ["wcag_2_2"]
      },
      {
        id: "wcag_2_4_7_focus_visible",
        label: "WCAG 2.4.7 Focus Visible",
        level: "AA",
        appliesWhen: "Keyboard focus indicator is not visible or is visually suppressed.",
        sourceRefs: ["wcag_2_2"]
      },
      {
        id: "wcag_2_4_11_focus_not_obscured",
        label: "WCAG 2.4.11 Focus Not Obscured",
        level: "AA",
        appliesWhen: "Focused components are hidden or obscured by sticky headers, overlays, cookie banners, or modals.",
        sourceRefs: ["wcag_2_2"]
      }
    ],
    jurisdictionalContexts: ACCESSIBILITY_JURISDICTIONAL_CONTEXTS,
    displayCaution: `${ACCESSIBILITY_LEGAL_VERSION_CAUTION} Review the retained selector, component role, focus lifecycle, focus visibility, focus order, keyboard trap risk, interaction state, page context, organization type, jurisdiction, and manual accessibility findings.`
  },
  cross_domain_identifier_sharing_observed: {
    findingId: "cross_domain_identifier_sharing_observed",
    label: "Identifier-like values observed across domains",
    category: "Third-party tracking",
    regulatoryConcernGroup: "adtech_identity_sync",
    primaryConcern: {
      id: "cross_domain_identifier_disclosure_review",
      label: "Cross-domain identifier sharing review",
      displayCopy:
        "Retained outbound request evidence showed identifier-like cross-domain request patterns that may be relevant to tracking, advertising, analytics, attribution, consent, transparency, sale/share, and vendor-governance review. Applicability depends on identifier scope, purpose, destination role, consent state, jurisdiction, server-side behavior, and manual review."
    },
    technicalStandards: [
      {
        id: "gdpr_online_identifier_personal_data_review",
        label: "GDPR online identifier review",
        appliesWhen: "Cookie IDs, IP addresses, device IDs, or other online identifiers may require review where they could relate to an identified or identifiable person.",
        sourceRefs: ["gdpr_article_4", "gdpr"]
      },
      {
        id: "gdpr_transparency_third_party_disclosure_review",
        label: "GDPR transparency and third-party disclosure review",
        appliesWhen: "Retained evidence suggests identifiers may move to third-party analytics, advertising, attribution, or identity partners.",
        sourceRefs: ["gdpr_article_5", "gdpr_article_13", "gdpr_article_25"]
      },
      {
        id: "eprivacy_storage_access_or_cookie_identifier_review",
        label: "ePrivacy cookie/device identifier review",
        appliesWhen: "Identifier-sharing review may be relevant where cookies, browser storage, redirects, or terminal-equipment information are involved.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_eprivacy_art_5_3_scope"]
      }
    ],
    jurisdictionalContexts: [
      {
        id: "eu_gdpr_eprivacy_identifier_sharing_review",
        label: "EU GDPR/ePrivacy identifier sharing review",
        appliesWhen: "EU/EEA users, online identifiers, profiling, cookies, or third-party sharing may be in scope depending on purpose, consent state, jurisdictional context, and manual review.",
        sourceRefs: ["gdpr_article_4", "eprivacy_directive_article_5_3"]
      },
      {
        id: "ccpa_cpra_sale_share_cross_context_ad_review",
        label: "CCPA/CPRA sale/share and cross-context behavioral advertising review",
        appliesWhen: "California users and identifier-like request signals may be relevant to advertising, identity matching, attribution, sale/share, or cross-context behavioral advertising review depending on purpose, vendor role, user region, and manual review.",
        sourceRefs: ["california_oag_ccpa", "cppa_faq"]
      },
      {
        id: "ftc_privacy_representation_review",
        label: "FTC privacy representation review",
        appliesWhen: "Runtime sharing may conflict with privacy disclosures, consent promises, or data-sharing statements.",
        sourceRefs: ["ftc_dark_patterns"]
      }
    ],
    displayCaution: "This finding does not determine legal status, personal identity, identity resolution, sale/share status, consent validity, or compliance status. Review the retained request anchors, redacted identifier-like keys, source and destination context, vendor purpose, consent timing, regional configuration, and applicable exemptions."
  },
  reject_tracking_persists_after_reject: {
    findingId: "reject_tracking_persists_after_reject",
    label: "Non-essential tracking continued after reject",
    category: "Consent",
    regulatoryConcernGroup: "consent_effect_and_opt_out_honoring",
    primaryConcern: {
      id: "post_reject_tracking_persistence_review",
      label: "Consent effect: tracking persisted after reject",
      displayCopy:
        "Retained runtime evidence showed post-reject request or storage signals that may be relevant to consent enforcement, cookie/tracker, storage/access, transparency, and vendor-governance review. Applicability depends on reject success, timing, purpose, consent state, necessity, exemptions, jurisdiction, and manual review."
    },
    technicalStandards: [
      {
        id: "eprivacy_reject_effect_cookie_storage_review",
        label: "ePrivacy cookie/storage refusal effect review",
        appliesWhen: "Retained evidence suggests non-essential cookies, storage, or similar technologies may remain active after a refusal or reject action.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_cookie_banner_taskforce"]
      },
      {
        id: "gdpr_withdrawal_and_consent_effect_review",
        label: "GDPR consent effect and withdrawal review",
        appliesWhen: "Consent-effect review may be relevant where consent is used for personal-data processing and a refusal or withdrawal should affect downstream processing.",
        sourceRefs: ["edpb_consent_guidelines", "gdpr"]
      },
      {
        id: "ccpa_cpra_opt_out_honoring_review",
        label: "CCPA/CPRA opt-out honoring review",
        appliesWhen: "The reject or opt-out interaction may affect sale, sharing, or cross-context behavioral advertising choices for California users.",
        sourceRefs: ["california_oag_ccpa", "cppa_faq"]
      }
    ],
    jurisdictionalContexts: [
      {
        id: "eu_gdpr_eprivacy_post_reject_review",
        label: "EU GDPR/ePrivacy post-reject tracking review",
        appliesWhen: "EU/EEA users and cookies, tracking, analytics, advertising, or profiling may be in scope depending on purpose, consent state, jurisdictional context, and manual review.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_consent_guidelines"]
      },
      {
        id: "uk_pecr_post_reject_review",
        label: "UK PECR / ICO post-reject cookie review",
        appliesWhen: "UK users and non-essential cookies or similar technologies may be in scope depending on purpose, consent state, jurisdictional context, and manual review.",
        sourceRefs: ["ico_cookies"]
      },
      {
        id: "us_privacy_opt_out_effect_review",
        label: "U.S. privacy opt-out effect review",
        appliesWhen: "The flow claims to honor privacy choices, sale/share opt-outs, targeted-advertising opt-outs, or GPC-style signals.",
        sourceRefs: ["california_oag_ccpa", "cppa_dark_patterns", "ftc_dark_patterns"]
      }
    ],
    displayCaution: "This finding does not determine legal status, consent validity, vendor responsibility, necessity, exemption status, or compliance status. Review the retained interaction evidence, post-reject runtime anchors, vendor purpose, queued-beacon timing, consent-state propagation, regional configuration, and applicable exemptions."
  },
  possible_session_replay_on_sensitive_input_surface: {
    findingId: "possible_session_replay_on_sensitive_input_surface",
    label: "Possible session replay on a sensitive input surface",
    category: "Third-party tracking",
    regulatoryConcernGroup: "session_replay_and_sensitive_data",
    primaryConcern: {
      id: "sensitive_surface_session_replay_review",
      label: "Session replay near sensitive input review",
      displayCopy:
        "Retained runtime and page-surface evidence showed session-replay-related signals near a sensitive-input or sensitive-context surface that may be relevant to masking, consent, special-category or high-risk context, security, and vendor-governance review. Browser-visible evidence does not determine capture, retention, interception, or legal status."
    },
    technicalStandards: [
      {
        id: "gdpr_special_category_or_high_risk_context_review",
        label: "GDPR special-category or high-risk context review",
        appliesWhen: "The retained surface context may involve Article 9 special-category data, such as health, biometric-for-identification, genetic, racial or ethnic origin, political opinion, religious or philosophical belief, trade-union membership, sex-life, or sexual-orientation context, or may otherwise involve sensitive/high-risk fields that require manual review.",
        sourceRefs: ["gdpr_article_9", "gdpr_article_5", "gdpr_article_6", "gdpr_article_32"]
      },
      {
        id: "gdpr_minimization_security_and_transparency_review",
        label: "GDPR minimization, security, and transparency review",
        appliesWhen: "Replay telemetry, identifiers, form context, or user behavior signals may involve personal data or sensitive inferences depending on implementation and manual review.",
        sourceRefs: ["gdpr_article_4", "gdpr_article_5", "gdpr_article_6", "gdpr_article_13", "gdpr_article_25", "gdpr_article_32"]
      },
      {
        id: "wiretap_eavesdropping_manual_review",
        label: "Wiretap, eavesdropping, or recording-law manual review",
        appliesWhen: "Replay or recording signals may require jurisdiction-specific manual legal review where interaction capture, communications, consent-to-record, or similar theories may be relevant. Browser-visible evidence does not determine capture, retention, interception, or legal status.",
        sourceRefs: ["ecpa_18_usc_2511"]
      }
    ],
    jurisdictionalContexts: [
      ...HEALTH_CONTEXTS.slice(0, 3),
      {
        id: "jurisdiction_specific_wiretap_or_session_replay_review",
        label: "Jurisdiction-specific wiretap/eavesdropping or session-replay review",
        appliesWhen: "Replay or recording signals may require jurisdiction-specific manual legal review where interaction capture, communications, consent-to-record, or similar theories may be relevant. Browser-visible evidence does not determine capture, retention, interception, or legal status.",
        sourceRefs: ["ecpa_18_usc_2511"]
      }
    ],
    displayCaution: "This finding does not determine legal status, GDPR Article 9 status, consent validity, keystroke capture, screenshot capture, sensitive-value capture, recording retention, interception, or compliance status. Financial, identity, contact, location, employment, children, protected-class, or other high-risk context signals require manual review and are not automatically GDPR Article 9 special-category data. Review retained replay anchors, sensitive-surface context, masking, sampling, payload evidence, consent state, and vendor configuration."
  },
  session_replay_present_with_sensitive_surfaces_observed: {
    findingId: "session_replay_present_with_sensitive_surfaces_observed",
    label: "Session replay observed with sensitive input surfaces",
    category: "Third-party tracking",
    regulatoryConcernGroup: "session_replay_and_sensitive_data",
    primaryConcern: {
      id: "scan_level_sensitive_surface_session_replay_review",
      label: "Session replay plus sensitive-surface review",
      displayCopy:
        "Retained runtime and page-surface evidence showed session-replay-related signals and sensitive-input or sensitive-context surfaces in the same scan. This may be relevant to masking, consent, special-category or high-risk context, security, and vendor-governance review, but browser-visible evidence does not determine capture, retention, interception, same-flow linkage, or legal status."
    },
    technicalStandards: [
      {
        id: "gdpr_special_category_or_high_risk_context_review",
        label: "GDPR special-category or high-risk context review",
        appliesWhen: "The retained surface context may involve Article 9 special-category data or otherwise sensitive/high-risk fields that require manual review.",
        sourceRefs: ["gdpr_article_9", "gdpr_article_5", "gdpr_article_6", "gdpr_article_32"]
      },
      {
        id: "gdpr_minimization_security_and_transparency_review",
        label: "GDPR minimization, security, and transparency review",
        appliesWhen: "Replay telemetry, identifiers, form context, or user behavior signals may involve personal data or sensitive inferences depending on implementation and manual review.",
        sourceRefs: ["gdpr_article_4", "gdpr_article_5", "gdpr_article_6", "gdpr_article_13", "gdpr_article_25", "gdpr_article_32"]
      },
      {
        id: "wiretap_eavesdropping_manual_review",
        label: "Wiretap, eavesdropping, or recording-law manual review",
        appliesWhen: "Replay or recording signals may require jurisdiction-specific manual legal review where interaction capture, communications, consent-to-record, or similar theories may be relevant. Browser-visible evidence does not determine capture, retention, interception, or legal status.",
        sourceRefs: ["ecpa_18_usc_2511"]
      }
    ],
    jurisdictionalContexts: [
      ...HEALTH_CONTEXTS.slice(0, 3),
      {
        id: "jurisdiction_specific_wiretap_or_session_replay_review",
        label: "Jurisdiction-specific wiretap/eavesdropping or session-replay review",
        appliesWhen: "Replay or recording signals may require jurisdiction-specific manual legal review where interaction capture, communications, consent-to-record, or similar theories may be relevant. Browser-visible evidence does not determine capture, retention, interception, or legal status.",
        sourceRefs: ["ecpa_18_usc_2511"]
      }
    ],
    displayCaution: "This finding does not determine legal status, GDPR Article 9 status, consent validity, same-flow linkage, keystroke capture, screenshot capture, sensitive-value capture, recording retention, interception, or compliance status. Review retained replay anchors, sensitive-surface context, masking, sampling, payload evidence, consent state, and vendor configuration."
  },
  long_lived_cookie_retention_review: {
    findingId: "long_lived_cookie_retention_review",
    label: "Long-lived cookie retention review",
    category: "Cookies & Storage",
    regulatoryConcernGroup: "cookie_retention_minimization_disclosure",
    primaryConcern: {
      id: "cookie_retention_lifetime_review",
      label: "Cookie retention and minimization review",
      displayCopy:
        "Retained runtime cookie evidence showed persistent tracking, advertising, analytics, identity, or unclassified cookies with expiry or duration evidence that met a CertScore retention review threshold. This may be relevant to retention, minimization, consent, opt-out, and disclosure review depending on purpose, configuration, user region, and manual review."
    },
    technicalStandards: [
      {
        id: "gdpr_storage_limitation_minimization_review",
        label: "GDPR storage limitation and minimization review",
        appliesWhen: "Persistent cookies or identifiers may involve personal data, online identifiers, profiling, or retention practices depending on purpose and linkage.",
        sourceRefs: ["gdpr_article_4", "gdpr_article_5", "gdpr_article_13", "gdpr_article_25"]
      },
      {
        id: "eprivacy_cookie_storage_access_review",
        label: "ePrivacy cookie storage/access review",
        appliesWhen: "Cookies or similar technologies store information on, or access information from, terminal equipment.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_eprivacy_art_5_3_scope"]
      },
      {
        id: "ccpa_cpra_retention_and_purpose_review",
        label: "CCPA/CPRA retention and purpose review",
        appliesWhen: "Persistent identifiers, advertising cookies, or cross-context behavioral advertising context may be relevant for retention disclosure, purpose limitation, deletion, sale/share, or opt-out review.",
        sourceRefs: ["california_oag_ccpa", "cppa_faq"]
      }
    ],
    jurisdictionalContexts: [
      {
        id: "eu_gdpr_eprivacy_cookie_retention_review",
        label: "EU GDPR/ePrivacy cookie-retention review",
        appliesWhen: "EU/EEA users and persistent non-essential cookies or online identifiers may be in scope depending on purpose, consent state, retention disclosure, and manual review.",
        sourceRefs: ["gdpr_article_5", "gdpr_article_13", "eprivacy_directive_article_5_3"]
      },
      {
        id: "uk_pecr_cookie_retention_review",
        label: "UK PECR / ICO cookie-retention review",
        appliesWhen: "UK users and persistent cookies or similar technologies may be in scope depending on purpose, consent state, and manual review.",
        sourceRefs: ["ico_cookies"]
      },
      {
        id: "ccpa_cpra_persistent_identifier_review",
        label: "CCPA/CPRA persistent identifier and retention review",
        appliesWhen: "California users and persistent identifiers may be relevant to retention disclosure, deletion, sale/share, opt-out, or cross-context behavioral advertising review depending on purpose and manual review.",
        sourceRefs: ["california_oag_ccpa", "cppa_faq"]
      }
    ],
    displayCaution:
      "This finding does not determine legal status, consent validity, sale/share status, GDPR compliance, or cookie-law compliance. The 365-day threshold is a CertScore product review threshold, not a statutory threshold, and GDPR does not set a universal numeric cookie-lifetime threshold. Review retained cookie name, domain, page attribution, classification, duration, threshold basis, vendor/source context, consent state, opt-out behavior, retention disclosure, and minimization."
  },
  probable_fingerprinting: {
    findingId: "probable_fingerprinting",
    label: "Probable browser/device fingerprinting review signal",
    category: "Fingerprinting",
    regulatoryConcernGroup: "fingerprinting_and_device_signals",
    primaryConcern: {
      id: "probable_device_fingerprinting_review",
      label: "Probable browser/device fingerprinting review",
      displayCopy:
        "Retained runtime evidence showed a clustered high-entropy browser/device signal pattern that may warrant probable fingerprinting review. Purpose, disclosure, consent state, minimization, security or fraud-prevention context, and downstream use should be reviewed."
    },
    technicalStandards: [
      {
        id: "eprivacy_article_5_3_fingerprinting_review",
        label: "ePrivacy Article 5(3) fingerprinting/device-access review",
        appliesWhen: "Retained clustered browser/device signals may involve storing information on, or gaining access to information from, terminal equipment.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_eprivacy_art_5_3_scope"]
      },
      {
        id: "gdpr_online_identifier_profiling_review",
        label: "GDPR online identifier and profiling review",
        appliesWhen: "High-entropy browser/device signals may be relevant to online identifier, profiling, or identifiability review depending on linkage, purpose, and manual review.",
        sourceRefs: ["gdpr_article_4", "gdpr_article_5", "gdpr_article_6", "gdpr_article_13", "gdpr_article_25"]
      },
      {
        id: "gdpr_data_minimization_purpose_limitation_review",
        label: "GDPR minimization and purpose review",
        appliesWhen: "Collection may include high-entropy attributes that may warrant purpose, necessity, minimization, and default-setting review.",
        sourceRefs: ["gdpr_article_5", "gdpr_article_6", "gdpr_article_25"]
      }
    ],
    jurisdictionalContexts: [
      {
        id: "eu_eprivacy_gdpr_fingerprinting_review",
        label: "EU ePrivacy/GDPR fingerprinting review",
        appliesWhen: "EU/EEA users and high-entropy device/browser signals may be in scope depending on terminal-equipment access, purpose, consent state, and manual review.",
        sourceRefs: ["edpb_eprivacy_art_5_3_scope", "gdpr_article_4"]
      },
      {
        id: "uk_pecr_fingerprinting_or_similar_technology_review",
        label: "UK PECR fingerprinting/similar-technology review",
        appliesWhen: "UK users and non-cookie tracking, device access, or similar technology may be in scope depending on purpose, consent state, and manual review.",
        sourceRefs: ["ico_cookies"]
      },
      {
        id: "ccpa_cpra_profiling_adtech_sensitive_review",
        label: "CCPA/CPRA profiling, advertising, or sensitive-data review",
        appliesWhen: "California users, cross-context advertising, sale/share, sensitive data, or profiling-related use context may be relevant depending on purpose, user region, and manual review.",
        sourceRefs: ["california_oag_ccpa", "cppa_faq"]
      },
      {
        id: "security_or_fraud_exception_review",
        label: "Security/fraud-prevention purpose review",
        appliesWhen: "A security, fraud-prevention, bot-detection, or abuse-prevention purpose may explain collection, but does not automatically exempt terminal-equipment access or personal-data processing from applicable review.",
        sourceRefs: ["gdpr_article_6", "gdpr_article_32", "eprivacy_directive_article_5_3", "edpb_eprivacy_art_5_3_scope"]
      }
    ],
    displayCaution: "This finding does not determine legal status, consent validity, persistent fingerprint creation, personal identity, identity resolution, user singling-out, complete identity graph, or compliance status. Probable fingerprinting review is inferred from clustered retained signals, and fraud-prevention or abuse-prevention use cases may explain some high-entropy collection without automatically exempting terminal-equipment access or personal-data processing from applicable review."
  }
};

export function getFindingRegulatoryContext(findingId: string) {
  return FINDING_REGULATORY_CONTEXTS[findingId];
}

export function getFindingRegulatoryContextLabels(findingId: string) {
  const context = getFindingRegulatoryContext(findingId);

  if (!context) {
    return [];
  }

  return [
    context.primaryConcern.label,
    ...context.technicalStandards.map((item) => item.label),
    ...context.jurisdictionalContexts.map((item) => item.label)
  ];
}

export function getFindingReviewContextChips(findingId: string, limit = 6) {
  const context = getFindingRegulatoryContext(findingId);

  if (!context) {
    return [];
  }

  return [
    ...context.technicalStandards.map((item) => item.label),
    ...context.jurisdictionalContexts.map((item) => item.label)
  ].slice(0, Math.max(0, limit));
}
