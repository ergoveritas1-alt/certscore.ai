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

const ACCESSIBILITY_JURISDICTIONAL_CONTEXTS: FindingRegulatoryContextItem[] = [
  {
    id: "ada_title_ii_web_mobile_accessibility",
    label: "ADA Title II web/mobile accessibility review",
    appliesWhen: "State or local government web content or mobile apps are in scope.",
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
    appliesWhen: "Federal agency ICT, federal web content, or federal procurement/vendor review is in scope.",
    sourceRefs: ["section_508_mapping"]
  },
  {
    id: "en_301_549_eu_accessibility",
    label: "EN 301 549 / EU accessibility review",
    appliesWhen: "EU public-sector, procurement, Web Accessibility Directive, or European Accessibility Act service context is in scope.",
    sourceRefs: ["eu_web_accessibility_directive_en_301_549", "eu_eaa"]
  },
  {
    id: "uk_public_sector_accessibility",
    label: "UK public-sector accessibility review",
    appliesWhen: "UK public-sector website or mobile app is in scope.",
    sourceRefs: ["uk_public_sector_accessibility"]
  }
];

const CONSENT_JURISDICTIONAL_CONTEXTS: FindingRegulatoryContextItem[] = [
  {
    id: "eu_gdpr_eprivacy_consent_ui_review",
    label: "EU GDPR/ePrivacy consent UI review",
    appliesWhen: "EU/EEA users and cookie or tracking consent UI are in scope.",
    sourceRefs: ["edpb_consent_guidelines", "edpb_cookie_banner_taskforce"]
  },
  {
    id: "uk_pecr_cookie_choice_review",
    label: "UK PECR / ICO cookie-choice review",
    appliesWhen: "UK users and non-essential cookie choices are in scope.",
    sourceRefs: ["ico_cookies"]
  },
  {
    id: "us_privacy_dark_pattern_review",
    label: "U.S. privacy dark-pattern review",
    appliesWhen: "The UI affects privacy choices, opt-outs, consent, or targeted advertising controls.",
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
    label: "EU GDPR sensitive-data review",
    appliesWhen: "EU/EEA users and special-category data or sensitive inferences may be in scope.",
    sourceRefs: ["gdpr_article_9", "gdpr_article_25"]
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
        "Low-contrast text, controls, or visual indicators may make content harder to perceive for users with low vision, color-vision differences, glare, zoomed interfaces, or other visual accessibility needs. This is a signal for accessibility review, not a legal conclusion."
    },
    technicalStandards: [
      {
        id: "wcag_1_4_3_contrast_minimum",
        label: "WCAG 1.4.3 Contrast (Minimum)",
        level: "AA",
        appliesWhen: "Text or images of text have insufficient foreground/background contrast.",
        sourceRefs: ["wcag_2_2"]
      },
      {
        id: "wcag_1_4_11_non_text_contrast",
        label: "WCAG 1.4.11 Non-text Contrast",
        level: "AA",
        appliesWhen: "Controls, icons, focus states, boundaries, or meaningful graphical objects have insufficient contrast.",
        sourceRefs: ["wcag_non_text_contrast", "wcag_2_2"]
      }
    ],
    jurisdictionalContexts: ACCESSIBILITY_JURISDICTIONAL_CONTEXTS,
    displayCaution: "Applicability depends on the affected element, page context, user impact, organization type, jurisdiction, and manual accessibility review."
  },
  pre_consent_tracking_detected: {
    findingId: "pre_consent_tracking_detected",
    label: "Tracking started before consent",
    category: "Consent",
    regulatoryConcernGroup: "consent_and_tracking",
    primaryConcern: {
      id: "pre_consent_non_essential_tracking_review",
      label: "Consent timing: tracking before recorded choice",
      displayCopy:
        "Runtime evidence showed non-essential tracking requests, vendors, or storage activity before the scan recorded a consent choice. This may be relevant to consent, cookie, tracking, and transparency review depending on jurisdiction and purpose."
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
        sourceRefs: ["gdpr_article_4", "gdpr_article_13", "gdpr_article_25"]
      }
    ],
    jurisdictionalContexts: [
      {
        id: "eu_eprivacy_gdpr_tracking_consent",
        label: "EU ePrivacy/GDPR tracking consent review",
        appliesWhen: "EU/EEA users, cookies, device access, analytics, advertising, or profiling are in scope.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_consent_guidelines"]
      },
      {
        id: "uk_pecr_cookie_consent_review",
        label: "UK PECR / ICO cookie consent review",
        appliesWhen: "UK users and non-essential cookies or similar technologies are in scope.",
        sourceRefs: ["ico_cookies"]
      },
      {
        id: "ccpa_cpra_sale_share_or_targeted_ad_review",
        label: "CCPA/CPRA sale, share, or cross-context advertising review",
        appliesWhen: "California users, advertising sharing, sale/share signals, or opt-out honoring are in scope.",
        sourceRefs: ["california_oag_ccpa", "cppa_faq"]
      },
      {
        id: "ftc_privacy_claims_review",
        label: "FTC privacy claim or deceptive-practice review",
        appliesWhen: "Runtime behavior may conflict with public statements, consent claims, or privacy representations.",
        sourceRefs: ["ftc_dark_patterns"]
      }
    ],
    displayCaution: "This finding does not determine legal status. Review vendor purpose, necessity, consent state, disclosure, region targeting, and exemptions."
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
        "Missing, invalid, or ambiguous accessible names, labels, roles, regions, or ARIA relationships may make controls harder to understand or operate with assistive technologies. This is a signal for accessibility review, not a legal conclusion."
    },
    technicalStandards: [
      {
        id: "wcag_4_1_2_name_role_value",
        label: "WCAG 4.1.2 Name, Role, Value",
        level: "A",
        appliesWhen: "Custom controls, form elements, or ARIA usage do not expose accurate names, roles, states, or values to assistive technologies.",
        sourceRefs: ["wcag_2_2"]
      },
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
        id: "wcag_2_4_4_link_purpose",
        label: "WCAG 2.4.4 Link Purpose (In Context)",
        level: "A",
        appliesWhen: "Links or controls have ambiguous accessible names without context.",
        sourceRefs: ["wcag_2_2"]
      }
    ],
    jurisdictionalContexts: ACCESSIBILITY_JURISDICTIONAL_CONTEXTS,
    displayCaution: "Automated semantic checks need manual review with keyboard, screen reader, visible-label, and component-context testing."
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
        "Browser, device, canvas, storage, or high-entropy environment signals were observed. This may be relevant to fingerprinting, device-access, profiling, minimization, and disclosure review, but it does not by itself show that a persistent fingerprint was created."
    },
    technicalStandards: [
      {
        id: "eprivacy_article_5_3_device_access_review",
        label: "ePrivacy Article 5(3) device access review",
        appliesWhen: "The observed technique stores information on, or gains access to information from, a user's terminal equipment.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_eprivacy_art_5_3_scope"]
      },
      {
        id: "gdpr_online_identifier_and_profiling_review",
        label: "GDPR online identifier / profiling review",
        appliesWhen: "Device or browser identifiers may relate to an identified or identifiable person or may be combined to create profiles.",
        sourceRefs: ["gdpr", "gdpr_article_4"]
      },
      {
        id: "gdpr_data_minimization_and_transparency_review",
        label: "GDPR minimization and transparency review",
        appliesWhen: "High-entropy collection, profiling, or third-party use may require purpose, legal basis, transparency, minimization, and default-setting review.",
        sourceRefs: ["gdpr_article_13", "gdpr_article_25"]
      }
    ],
    jurisdictionalContexts: [
      {
        id: "eu_eprivacy_fingerprinting_review",
        label: "EU ePrivacy fingerprinting/device-access review",
        appliesWhen: "EU/EEA users and device/browser signals are collected through terminal-equipment access.",
        sourceRefs: ["edpb_eprivacy_art_5_3_scope"]
      },
      {
        id: "uk_pecr_similar_technology_review",
        label: "UK PECR similar-technology review",
        appliesWhen: "UK users and non-cookie tracking or device access are in scope.",
        sourceRefs: ["ico_cookies"]
      },
      {
        id: "ccpa_cpra_cross_context_ad_or_profiling_review",
        label: "CCPA/CPRA advertising, sharing, or profiling review",
        appliesWhen: "California users, cross-context behavioral advertising, sale/share, or sensitive personal information are in scope.",
        sourceRefs: ["california_oag_ccpa", "cppa_faq"]
      }
    ],
    displayCaution: "This is a lower-confidence fingerprinting-related signal. Security, fraud-prevention, analytics, and personalization scripts may collect similar attributes for different purposes."
  },
  session_recording_services_detected: {
    findingId: "session_recording_services_detected",
    label: "Session recording services detected",
    category: "Third-party tracking",
    regulatoryConcernGroup: "session_replay_and_behavior_analytics",
    primaryConcern: {
      id: "session_replay_behavior_analytics_review",
      label: "Session replay and behavior analytics review",
      displayCopy:
        "A script or vendor associated with session replay, recording, heatmaps, or behavior analytics appeared in runtime evidence. This is a signal to review disclosure, consent gating, masking, sampling, sensitive-page exclusions, and vendor configuration."
    },
    technicalStandards: [
      {
        id: "gdpr_transparency_minimization_security_review",
        label: "GDPR transparency, minimization, and security review",
        appliesWhen: "Behavioral recordings or interaction telemetry involve personal data, identifiers, form interactions, or user behavior profiles.",
        sourceRefs: ["gdpr_article_4", "gdpr_article_13", "gdpr_article_25"]
      },
      {
        id: "eprivacy_device_access_or_storage_review",
        label: "ePrivacy device access/storage review",
        appliesWhen: "Replay tooling stores identifiers, accesses device/browser information, or uses cookies/similar technologies.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_eprivacy_art_5_3_scope"]
      },
      {
        id: "wiretap_eavesdropping_manual_review",
        label: "Wiretap/eavesdropping law review",
        appliesWhen: "The implementation records, intercepts, or transmits user communications or interactions in jurisdictions where such theories may be relevant.",
        sourceRefs: ["ecpa_18_usc_2511"]
      }
    ],
    jurisdictionalContexts: [
      {
        id: "eu_gdpr_eprivacy_session_replay_review",
        label: "EU GDPR/ePrivacy session replay review",
        appliesWhen: "EU/EEA users, identifiers, behavior telemetry, cookies, or device access are in scope.",
        sourceRefs: ["gdpr", "eprivacy_directive_article_5_3"]
      },
      {
        id: "uk_pecr_uk_gdpr_behavior_analytics_review",
        label: "UK PECR / UK GDPR behavior analytics review",
        appliesWhen: "UK users, cookies/similar technologies, or personal-data behavior analytics are in scope.",
        sourceRefs: ["ico_cookies"]
      },
      ...HEALTH_CONTEXTS.slice(0, 2)
    ],
    displayCaution: "Detecting a replay vendor does not show that keystrokes, sensitive values, or full recordings were retained. Review vendor settings, consent posture, masking, sampling, and page-level exclusions."
  },
  third_party_cookie_pre_consent: {
    findingId: "third_party_cookie_pre_consent",
    label: "Tracking cookies set before consent",
    category: "Cookies",
    regulatoryConcernGroup: "cookies_and_storage",
    primaryConcern: {
      id: "third_party_cookie_before_consent_review",
      label: "Cookie/storage timing: third-party cookie before recorded choice",
      displayCopy:
        "A cookie associated with a third-party service or non-essential purpose was observed before a recorded consent action. This may be relevant to cookie consent, device storage/access, disclosure, and opt-out-effect review."
    },
    technicalStandards: [
      {
        id: "eprivacy_article_5_3_cookie_storage_review",
        label: "ePrivacy Article 5(3) cookie/storage review",
        appliesWhen: "A cookie or similar storage is set or accessed before consent and is not strictly necessary for a user-requested service.",
        sourceRefs: ["eprivacy_directive_article_5_3"]
      },
      {
        id: "gdpr_consent_and_transparency_review",
        label: "GDPR consent and transparency review",
        appliesWhen: "Cookie identifiers or tracking storage relate to personal data, profiling, analytics, or advertising.",
        sourceRefs: ["gdpr", "gdpr_article_4", "gdpr_article_13", "edpb_consent_guidelines"]
      }
    ],
    jurisdictionalContexts: [
      {
        id: "eu_cookie_consent_review",
        label: "EU cookie consent review",
        appliesWhen: "EU/EEA users and non-essential cookies or storage are in scope.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_cookie_banner_taskforce"]
      },
      {
        id: "uk_pecr_cookie_consent_review",
        label: "UK PECR / ICO cookie consent review",
        appliesWhen: "UK users and non-essential cookies are in scope.",
        sourceRefs: ["ico_cookies"]
      },
      {
        id: "ccpa_cpra_ad_cookie_sale_share_review",
        label: "CCPA/CPRA advertising cookie sale/share review",
        appliesWhen: "California users and third-party advertising cookies may support sale, sharing, or cross-context behavioral advertising.",
        sourceRefs: ["california_oag_ccpa", "cppa_faq"]
      }
    ],
    displayCaution: "Review whether the cookie is strictly necessary, the timing of consent, user region, vendor purpose, and whether opt-out or reject states suppress or clear the cookie."
  },
  rtb_cookie_sync_observed: {
    findingId: "rtb_cookie_sync_observed",
    label: "RTB cookie sync observed",
    category: "Third-party tracking",
    regulatoryConcernGroup: "adtech_identity_sync",
    primaryConcern: {
      id: "rtb_cookie_sync_identity_matching_review",
      label: "Adtech identity sync / cookie matching review",
      displayCopy:
        "Advertising or identity endpoints appeared to match, sync, redirect, or share identifiers across adtech domains. This may be relevant to cookie consent, sale/share, targeted advertising, profiling, and third-party disclosure review."
    },
    technicalStandards: [
      {
        id: "eprivacy_cookie_sync_storage_access_review",
        label: "ePrivacy cookie sync storage/access review",
        appliesWhen: "Syncing involves cookies, redirect identifiers, device storage, or terminal-equipment access.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_eprivacy_art_5_3_scope"]
      },
      {
        id: "gdpr_online_identifier_profiling_transparency_review",
        label: "GDPR online identifier, profiling, and transparency review",
        appliesWhen: "Identifier sharing, profiling, advertising, or data transfers involve personal data or online identifiers.",
        sourceRefs: ["gdpr_article_4", "gdpr_article_13", "gdpr_article_25"]
      }
    ],
    jurisdictionalContexts: [
      {
        id: "eu_eprivacy_gdpr_adtech_review",
        label: "EU ePrivacy/GDPR adtech review",
        appliesWhen: "EU/EEA users and adtech cookie sync or identity matching are in scope.",
        sourceRefs: ["eprivacy_directive_article_5_3", "gdpr"]
      },
      {
        id: "uk_pecr_adtech_cookie_review",
        label: "UK PECR adtech cookie/similar-technology review",
        appliesWhen: "UK users and non-essential adtech cookies or similar technologies are in scope.",
        sourceRefs: ["ico_cookies"]
      },
      {
        id: "ccpa_cpra_sale_share_cross_context_ad_review",
        label: "CCPA/CPRA sale/share and cross-context behavioral advertising review",
        appliesWhen: "California users, advertising sharing, or cross-context behavioral advertising are in scope.",
        sourceRefs: ["california_oag_ccpa", "cppa_faq"]
      }
    ],
    displayCaution: "This finding is about observed sync-style runtime evidence, not a conclusion about every downstream partner, data use, or legal status."
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
        "Non-text content, images, icons, objects, or functional image controls without adequate text alternative evidence may prevent users of assistive technologies from perceiving equivalent meaning or purpose. This is a signal for accessibility review, not a legal conclusion."
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
    displayCaution: "Manual review should distinguish decorative, informative, functional, and complex images before determining the appropriate remediation."
  },
  consent_dark_patterns_detected: {
    findingId: "consent_dark_patterns_detected",
    label: "Dark pattern consent signals detected",
    category: "Consumer protection",
    regulatoryConcernGroup: "consent_experience_and_choice_architecture",
    primaryConcern: {
      id: "consent_choice_architecture_dark_pattern_review",
      label: "Consent UX: possible dark-pattern review",
      displayCopy:
        "Consent interface signals suggested that choice architecture may steer users toward acceptance or make refusal materially harder. This is a prompt for design, privacy, and legal review, not a final conclusion."
    },
    technicalStandards: [
      {
        id: "gdpr_valid_consent_free_specific_informed_unambiguous",
        label: "GDPR valid consent review",
        appliesWhen: "Consent is used for cookies, tracking, personal data processing, profiling, or advertising.",
        sourceRefs: ["gdpr", "edpb_consent_guidelines"]
      },
      {
        id: "edpb_cookie_banner_design_review",
        label: "EDPB cookie banner design review",
        appliesWhen: "Cookie banners use hidden reject paths, preselected choices, confusing hierarchy, or unequal interaction cost.",
        sourceRefs: ["edpb_cookie_banner_taskforce"]
      },
      {
        id: "ccpa_cpra_dark_pattern_consent_or_request_review",
        label: "CCPA/CPRA dark-pattern review",
        appliesWhen: "The interface affects California privacy choices, opt-out paths, or consent.",
        sourceRefs: ["cppa_dark_patterns", "california_oag_ccpa"]
      },
      {
        id: "ftc_dark_pattern_review",
        label: "FTC dark-pattern / unfair or deceptive practice review",
        appliesWhen: "Design choices may obscure or burden user choices involving privacy or commerce.",
        sourceRefs: ["ftc_dark_patterns"]
      }
    ],
    jurisdictionalContexts: CONSENT_JURISDICTIONAL_CONTEXTS,
    displayCaution: "Dark-pattern review involves context, visual hierarchy, user flow, wording, region behavior, and user-impact judgment."
  },
  cpra_cba_opt_out_missing: {
    findingId: "cpra_cba_opt_out_missing",
    label: "CPRA advertising opt-out missing or incomplete",
    category: "Disclosure gaps",
    regulatoryConcernGroup: "privacy_choices_and_opt_outs",
    primaryConcern: {
      id: "cpra_cross_context_advertising_opt_out_review",
      label: "California privacy choices: sale/share or cross-context advertising opt-out review",
      displayCopy:
        "Advertising or cross-context tracking signals were observed without retained evidence of a clear CPRA-style privacy choices, Do Not Sell or Share, or comparable opt-out path. This is a review signal, not a CPRA legal determination."
    },
    technicalStandards: [
      {
        id: "ccpa_cpra_sale_share_opt_out_review",
        label: "CCPA/CPRA sale/share opt-out review",
        appliesWhen: "California users and sale, sharing, or cross-context behavioral advertising may be in scope.",
        sourceRefs: ["california_oag_ccpa", "cppa_faq"]
      },
      {
        id: "gpc_and_privacy_choice_honoring_review",
        label: "Global Privacy Control / privacy-choice honoring review",
        appliesWhen: "User-enabled opt-out preference signals or visible privacy-choice paths should be reviewed.",
        sourceRefs: ["california_oag_ccpa"]
      },
      {
        id: "privacy_notice_and_runtime_consistency_review",
        label: "Privacy notice and runtime consistency review",
        appliesWhen: "Runtime advertising-sharing evidence should be compared with policy text, footer links, privacy choices, and actual opt-out effects.",
        sourceRefs: ["california_oag_ccpa", "cppa_dark_patterns"]
      }
    ],
    jurisdictionalContexts: [
      {
        id: "california_ccpa_cpra_review",
        label: "California CCPA/CPRA review",
        appliesWhen: "The organization is covered by CCPA/CPRA and California consumer data, sale/share, or cross-context advertising is in scope.",
        sourceRefs: ["california_oag_ccpa", "cppa_faq"]
      },
      {
        id: "us_state_privacy_targeted_ad_opt_out_review",
        label: "U.S. state privacy targeted-advertising opt-out review",
        appliesWhen: "Other U.S. state comprehensive privacy laws and targeted-advertising opt-outs may be in scope.",
        sourceRefs: []
      },
      {
        id: "ftc_privacy_representation_review",
        label: "FTC privacy representation review",
        appliesWhen: "Public privacy statements, consent choices, or opt-out claims may not align with runtime behavior.",
        sourceRefs: ["ftc_dark_patterns"]
      }
    ],
    displayCaution: "A valid opt-out path may exist outside the observed page surface or may be regionally targeted. Review the public path, policy text, GPC handling, and runtime opt-out effect together."
  },
  forced_consent_interaction: {
    findingId: "forced_consent_interaction",
    label: "Consent interaction was forced",
    category: "Consent",
    regulatoryConcernGroup: "consent_experience_and_choice_architecture",
    primaryConcern: {
      id: "forced_consent_or_cookie_wall_review",
      label: "Consent UX: forced interaction or cookie-wall review",
      displayCopy:
        "The observed page flow appeared to require interaction with a consent prompt before normal browsing could continue. This may be relevant to review of consent freedom, access conditioning, consent-wall design, and accessibility impact."
    },
    technicalStandards: [
      {
        id: "gdpr_freely_given_consent_review",
        label: "GDPR freely given consent review",
        appliesWhen: "The user is asked to consent to tracking or personal-data processing as a condition of access or ordinary browsing.",
        sourceRefs: ["edpb_consent_guidelines"]
      },
      {
        id: "eprivacy_cookie_consent_review",
        label: "ePrivacy cookie consent review",
        appliesWhen: "The prompt governs non-essential cookies or similar technologies.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_cookie_banner_taskforce"]
      },
      {
        id: "accessibility_modal_or_overlay_review",
        label: "Accessibility overlay/modal review",
        appliesWhen: "The consent overlay blocks content, traps focus, prevents keyboard operation, or interferes with screen-reader flow.",
        sourceRefs: ["wcag_2_2"]
      }
    ],
    jurisdictionalContexts: CONSENT_JURISDICTIONAL_CONTEXTS,
    displayCaution: "Forced-interaction signals need review of the full flow, region behavior, alternative access paths, business model, and accessibility behavior."
  },
  reject_option_missing_or_hidden: {
    findingId: "reject_option_missing_or_hidden",
    label: "Reject option missing or hidden",
    category: "Consent",
    regulatoryConcernGroup: "consent_experience_and_choice_architecture",
    primaryConcern: {
      id: "missing_or_hidden_reject_path_review",
      label: "Consent UX: missing or hidden reject path",
      displayCopy:
        "A first-layer reject path was not visible, was less prominent, or appeared harder to reach than the accept path. This may be relevant to consent validity, cookie-banner design, opt-out friction, and dark-pattern review."
    },
    technicalStandards: [
      {
        id: "edpb_cookie_banner_reject_path_review",
        label: "EDPB cookie banner reject-path review",
        appliesWhen: "A banner offers accept on the first layer but no equivalent reject or refusal path is visible or easy to reach.",
        sourceRefs: ["edpb_cookie_banner_taskforce"]
      },
      {
        id: "gdpr_freely_given_unambiguous_consent_review",
        label: "GDPR freely given and unambiguous consent review",
        appliesWhen: "Consent is used for cookies, tracking, personal data processing, profiling, or advertising.",
        sourceRefs: ["edpb_consent_guidelines", "gdpr"]
      },
      {
        id: "ccpa_cpra_dark_pattern_opt_out_friction_review",
        label: "CCPA/CPRA dark-pattern and opt-out friction review",
        appliesWhen: "The interface affects California privacy choices, opt-out paths, or consent.",
        sourceRefs: ["cppa_dark_patterns", "california_oag_ccpa"]
      },
      {
        id: "ftc_dark_pattern_review",
        label: "FTC dark-pattern / choice architecture review",
        appliesWhen: "The flow may obscure or burden refusal or privacy choices.",
        sourceRefs: ["ftc_dark_patterns"]
      }
    ],
    jurisdictionalContexts: CONSENT_JURISDICTIONAL_CONTEXTS,
    displayCaution: "A hidden or missing reject path is a review signal. Applicability depends on region, consent model, exact UI text, visual hierarchy, and whether a meaningful refusal path exists elsewhere."
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
        "A page or form that appeared to collect sensitive information loaded third-party tracking or analytics context in the same observed flow. This is a high-priority signal to review data sensitivity, vendor access, consent, minimization, and page-level exclusions."
    },
    technicalStandards: [
      {
        id: "gdpr_special_category_and_sensitive_context_review",
        label: "GDPR special-category or sensitive-context review",
        appliesWhen: "The surface may involve health, financial, biometric, sexual-orientation, political, religious, or other sensitive data categories.",
        sourceRefs: ["gdpr_article_9"]
      },
      {
        id: "gdpr_minimization_security_transparency_review",
        label: "GDPR minimization, security, and transparency review",
        appliesWhen: "Third-party vendors, tracking, or identifiers appear on sensitive data collection surfaces.",
        sourceRefs: ["gdpr_article_4", "gdpr_article_13", "gdpr_article_25"]
      },
      {
        id: "eprivacy_tracking_on_sensitive_surface_review",
        label: "ePrivacy cookie/device-access review",
        appliesWhen: "The sensitive surface uses cookies, device access, analytics, advertising, or similar tracking technologies.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_eprivacy_art_5_3_scope"]
      }
    ],
    jurisdictionalContexts: HEALTH_CONTEXTS,
    displayCaution: "Co-occurrence does not show that sensitive field values were transmitted. Review field masking, vendor requests, page templates, event capture, consent gating, and actual payload evidence."
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
        "The accept and reject choices appeared visually or procedurally imbalanced in retained consent UI evidence. This may be relevant to consent validity, cookie-banner fairness, opt-out friction, and dark-pattern review."
    },
    technicalStandards: [
      {
        id: "edpb_cookie_banner_visual_hierarchy_review",
        label: "EDPB cookie banner visual hierarchy review",
        appliesWhen: "Reject is hidden, de-emphasized, nested, link-only, or materially harder than accept.",
        sourceRefs: ["edpb_cookie_banner_taskforce"]
      },
      {
        id: "gdpr_freely_given_specific_informed_unambiguous_consent_review",
        label: "GDPR consent quality review",
        appliesWhen: "Consent is requested through imbalanced wording, layout, visual hierarchy, or interaction cost.",
        sourceRefs: ["edpb_consent_guidelines", "gdpr"]
      },
      {
        id: "ccpa_cpra_clear_and_balanced_choice_review",
        label: "CCPA/CPRA clear and balanced choice review",
        appliesWhen: "California privacy choices, opt-out requests, or consent flows are affected by unclear or imbalanced UI.",
        sourceRefs: ["cppa_dark_patterns"]
      },
      {
        id: "ftc_dark_pattern_choice_architecture_review",
        label: "FTC dark-pattern choice architecture review",
        appliesWhen: "Design choices may manipulate or burden privacy choices.",
        sourceRefs: ["ftc_dark_patterns"]
      }
    ],
    jurisdictionalContexts: CONSENT_JURISDICTIONAL_CONTEXTS,
    displayCaution: "Imbalance requires contextual UI review, including button prominence, wording, position, keyboard flow, number of steps, and region-specific variants."
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
        "Important controls may be hard to reach, operate, exit, or understand through keyboard-only interaction. This is a signal for accessibility review, not a legal conclusion."
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
      }
    ],
    jurisdictionalContexts: ACCESSIBILITY_JURISDICTIONAL_CONTEXTS,
    displayCaution: "Manual keyboard testing is needed to confirm reachability, focus order, focus visibility, escape behavior, and operability across modals, menus, forms, and consent banners."
  },
  cross_domain_identifier_sharing_observed: {
    findingId: "cross_domain_identifier_sharing_observed",
    label: "Identifiers shared across domains",
    category: "Third-party tracking",
    regulatoryConcernGroup: "adtech_identity_sync",
    primaryConcern: {
      id: "cross_domain_identifier_disclosure_review",
      label: "Cross-domain identifier sharing review",
      displayCopy:
        "Identifier-like values appeared in outbound requests to external advertising, identity, measurement, or attribution destinations. This may be relevant to transparency, consent, sale/share, profiling, and third-party disclosure review."
    },
    technicalStandards: [
      {
        id: "gdpr_online_identifier_personal_data_review",
        label: "GDPR online identifier review",
        appliesWhen: "Cookie IDs, IP addresses, device IDs, or other online identifiers may relate to an identified or identifiable person.",
        sourceRefs: ["gdpr_article_4", "gdpr"]
      },
      {
        id: "gdpr_transparency_third_party_disclosure_review",
        label: "GDPR transparency and third-party disclosure review",
        appliesWhen: "Identifiers are shared with third-party analytics, advertising, attribution, or identity partners.",
        sourceRefs: ["gdpr_article_13", "gdpr_article_25"]
      },
      {
        id: "eprivacy_storage_access_or_cookie_identifier_review",
        label: "ePrivacy cookie/device identifier review",
        appliesWhen: "Identifier sharing involves cookies, browser storage, redirects, or access to terminal-equipment information.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_eprivacy_art_5_3_scope"]
      }
    ],
    jurisdictionalContexts: [
      {
        id: "eu_gdpr_eprivacy_identifier_sharing_review",
        label: "EU GDPR/ePrivacy identifier sharing review",
        appliesWhen: "EU/EEA users, online identifiers, profiling, cookies, or third-party sharing are in scope.",
        sourceRefs: ["gdpr_article_4", "eprivacy_directive_article_5_3"]
      },
      {
        id: "ccpa_cpra_sale_share_cross_context_ad_review",
        label: "CCPA/CPRA sale/share and cross-context behavioral advertising review",
        appliesWhen: "California users and identifiers are shared for advertising, identity matching, attribution, or cross-context behavioral advertising.",
        sourceRefs: ["california_oag_ccpa", "cppa_faq"]
      },
      {
        id: "ftc_privacy_representation_review",
        label: "FTC privacy representation review",
        appliesWhen: "Runtime sharing may conflict with privacy disclosures, consent promises, or data-sharing statements.",
        sourceRefs: ["ftc_dark_patterns"]
      }
    ],
    displayCaution: "Identifier-like evidence requires review of payloads, hashing, partner purpose, disclosure, consent state, opt-out effect, and whether the value can reasonably identify or profile a person."
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
        "Tracking activity remained visible after the scanner performed a reject-style interaction and compared post-reject evidence. This may be relevant to consent effectiveness, opt-out honoring, cookie suppression, and runtime enforcement review."
    },
    technicalStandards: [
      {
        id: "eprivacy_reject_effect_cookie_storage_review",
        label: "ePrivacy cookie/storage refusal effect review",
        appliesWhen: "Non-essential cookies, storage, or similar technologies remain active after a refusal or reject action.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_cookie_banner_taskforce"]
      },
      {
        id: "gdpr_withdrawal_and_consent_effect_review",
        label: "GDPR consent effect and withdrawal review",
        appliesWhen: "Consent is used for personal-data processing and a refusal or withdrawal should affect downstream processing.",
        sourceRefs: ["edpb_consent_guidelines", "gdpr"]
      },
      {
        id: "ccpa_cpra_opt_out_honoring_review",
        label: "CCPA/CPRA opt-out honoring review",
        appliesWhen: "The reject or opt-out interaction should suppress sale, sharing, or cross-context behavioral advertising for California users.",
        sourceRefs: ["california_oag_ccpa", "cppa_faq"]
      }
    ],
    jurisdictionalContexts: [
      {
        id: "eu_gdpr_eprivacy_post_reject_review",
        label: "EU GDPR/ePrivacy post-reject tracking review",
        appliesWhen: "EU/EEA users and cookies, tracking, analytics, advertising, or profiling are in scope.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_consent_guidelines"]
      },
      {
        id: "uk_pecr_post_reject_review",
        label: "UK PECR / ICO post-reject cookie review",
        appliesWhen: "UK users and non-essential cookies or similar technologies are in scope.",
        sourceRefs: ["ico_cookies"]
      },
      {
        id: "us_privacy_opt_out_effect_review",
        label: "U.S. privacy opt-out effect review",
        appliesWhen: "The flow claims to honor privacy choices, sale/share opt-outs, targeted-advertising opt-outs, or GPC-style signals.",
        sourceRefs: ["california_oag_ccpa", "cppa_dark_patterns", "ftc_dark_patterns"]
      }
    ],
    displayCaution: "Review whether the reject action was successfully detected, whether residual requests were essential or already-loaded beacons, whether cookies were cleared or suppressed, and whether vendors listen to the same consent state."
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
        "Replay-related runtime evidence appeared near a page or form surface that may collect sensitive information. This is a high-priority review signal for masking, exclusion, consent gating, vendor access, and sensitive-data handling."
    },
    technicalStandards: [
      {
        id: "gdpr_special_category_data_review",
        label: "GDPR special-category data review",
        appliesWhen: "The surface may involve health, biometric, sexual-orientation, political, religious, trade-union, genetic, or other special-category data.",
        sourceRefs: ["gdpr_article_9"]
      },
      {
        id: "gdpr_minimization_security_and_transparency_review",
        label: "GDPR minimization, security, and transparency review",
        appliesWhen: "Replay telemetry, identifiers, form context, or user behavior may involve personal data or sensitive inferences.",
        sourceRefs: ["gdpr_article_4", "gdpr_article_13", "gdpr_article_25"]
      },
      {
        id: "wiretap_eavesdropping_manual_review",
        label: "Wiretap/eavesdropping law review",
        appliesWhen: "The implementation records, intercepts, or transmits user communications or form interactions in jurisdictions where such theories may be relevant.",
        sourceRefs: ["ecpa_18_usc_2511"]
      }
    ],
    jurisdictionalContexts: [
      ...HEALTH_CONTEXTS.slice(0, 3),
      {
        id: "state_wiretap_or_session_replay_litigation_review",
        label: "State wiretap/eavesdropping or session-replay review",
        appliesWhen: "Jurisdiction-specific consent-to-record, wiretap, or eavesdropping theories may apply to session replay or interaction capture.",
        sourceRefs: ["ecpa_18_usc_2511"]
      }
    ],
    displayCaution: "Co-occurrence does not show that sensitive field values were captured. Manual review should confirm masking, sampling, payload contents, page-level exclusions, consent gating, and vendor configuration."
  },
  probable_fingerprinting: {
    findingId: "probable_fingerprinting",
    label: "Probable browser/device fingerprinting behavior",
    category: "Fingerprinting",
    regulatoryConcernGroup: "fingerprinting_and_device_signals",
    primaryConcern: {
      id: "probable_device_fingerprinting_review",
      label: "Probable browser/device fingerprinting review",
      displayCopy:
        "A cluster of high-entropy browser or device collection signals was strong enough to warrant fingerprinting-specific review. Purpose, disclosure, consent posture, minimization, and downstream identity use should be reviewed."
    },
    technicalStandards: [
      {
        id: "eprivacy_article_5_3_fingerprinting_review",
        label: "ePrivacy Article 5(3) fingerprinting/device-access review",
        appliesWhen: "Fingerprinting or device-signal collection stores information on, or gains access to information from, terminal equipment.",
        sourceRefs: ["eprivacy_directive_article_5_3", "edpb_eprivacy_art_5_3_scope"]
      },
      {
        id: "gdpr_online_identifier_profiling_review",
        label: "GDPR online identifier and profiling review",
        appliesWhen: "High-entropy browser/device signals may identify, single out, profile, or be combined with identifiers.",
        sourceRefs: ["gdpr_article_4", "gdpr_article_13", "gdpr_article_25"]
      },
      {
        id: "gdpr_data_minimization_purpose_limitation_review",
        label: "GDPR minimization and purpose review",
        appliesWhen: "Collection includes high-entropy attributes beyond what is necessary for a stated purpose.",
        sourceRefs: ["gdpr_article_25"]
      }
    ],
    jurisdictionalContexts: [
      {
        id: "eu_eprivacy_gdpr_fingerprinting_review",
        label: "EU ePrivacy/GDPR fingerprinting review",
        appliesWhen: "EU/EEA users and high-entropy device/browser signals are in scope.",
        sourceRefs: ["edpb_eprivacy_art_5_3_scope", "gdpr_article_4"]
      },
      {
        id: "uk_pecr_fingerprinting_or_similar_technology_review",
        label: "UK PECR fingerprinting/similar-technology review",
        appliesWhen: "UK users and non-cookie tracking, device access, or similar technology are in scope.",
        sourceRefs: ["ico_cookies"]
      },
      {
        id: "ccpa_cpra_profiling_adtech_sensitive_review",
        label: "CCPA/CPRA profiling, advertising, or sensitive-data review",
        appliesWhen: "California users, cross-context advertising, sale/share, sensitive data, or profiling-related uses are in scope.",
        sourceRefs: ["california_oag_ccpa", "cppa_faq"]
      },
      {
        id: "security_or_fraud_exception_review",
        label: "Security/fraud-prevention purpose review",
        appliesWhen: "The collection is claimed to support fraud prevention, bot detection, abuse prevention, or security rather than advertising or profiling.",
        sourceRefs: ["gdpr_article_25"]
      }
    ],
    displayCaution: "Probable fingerprinting is inferred from clustered signals, not from observing a vendor's internal identity graph. Fraud-prevention or abuse-prevention use cases may explain some high-entropy collection."
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
