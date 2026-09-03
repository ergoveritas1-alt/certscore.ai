export type KnownCmpStandard = "tcf" | "gpp" | "usp" | "gpc" | "google_consent_mode";

export type KnownCmpSignalSource =
  | "alias"
  | "cookie"
  | "dom"
  | "global"
  | "host"
  | "iframe"
  | "script"
  | "storage"
  | "text"
  | "url";

export type KnownCmpEvidenceTreatment = "cmp_infrastructure";

export type KnownCmpActionConfirmation =
  | { kind: "cmp_cookie_changed"; cookieName: string }
  | { kind: "cmp_cookie_names_changed"; cookieNames: string[] }
  | {
      kind: "cmp_cookie_values_equal";
      cookies: Array<{ expectedValue: string; name: string; path: string }>;
    }
  | { kind: "local_storage_equals"; expectedValue: string; key: string }
  | {
      kind: "cmp_api_consent_state_changed";
      provider: "termly" | "transcend";
    }
  | {
      kind: "tcf_purposes_or_cmp_cookie_changed";
      cookieName: string;
      purposeIds?: number[];
    }
  | {
      kind: "tcf_purposes_or_cmp_storage_keys_changed";
      keys: string[];
      purposeIds?: number[];
      storageType: "local_storage" | "session_storage";
    };

export type KnownCmpActionCapability = {
  action: "accept" | "reject";
  canonicalName: string;
  documentationUrls: string[];
  recipeAvailable: boolean;
  recipeVersion?: string;
  semanticConfirmationRegistered: boolean;
  selectorRegistered: boolean;
  unsupportedReason?:
    | "missing_deterministic_selector"
    | "missing_semantic_confirmation"
    | "closed_shadow_root_or_custom_ui"
    | "consent_or_pay_variant_requires_review";
};

export type KnownCmpDefinition = {
  acceptConfirmation?: KnownCmpActionConfirmation;
  acceptControlSelectors?: string[];
  acceptControlTargets?: KnownCmpControlTarget[];
  acceptanceCookieValues?: Array<{
    expectedValue: string;
    name: string;
    path: string;
  }>;
  aliases: string[];
  canonicalName: string;
  cookieNames?: string[];
  domains: string[];
  domSelectors?: string[];
  evidenceTreatment: KnownCmpEvidenceTreatment;
  globalNames?: string[];
  iframePatterns?: RegExp[];
  interactionDocumentationUrls?: string[];
  interactionRisks?: Array<
    | "closed_shadow_root_or_custom_ui"
    | "consent_or_pay_variant_requires_review"
  >;
  necessaryOnlyControlTargets?: Array<{
    bannerSelector: string;
    controlSelector: string;
    disallowedCheckedSelector: string;
    expectedNormalizedLabel: string;
    requiredCheckedSelector: string;
  }>;
  reopenControlHints?: string[];
  refusalCookieValues?: Array<{
    expectedValue: string;
    name: string;
    path: string;
  }>;
  rejectConfirmation?: KnownCmpActionConfirmation;
  rejectControlSelectors?: string[];
  rejectControlTargets?: KnownCmpControlTarget[];
  recipeVersion?: string;
  role: "consent management platform";
  standards?: KnownCmpStandard[];
  storageKeys?: string[];
  urlPatterns?: RegExp[];
};

export type KnownCmpControlTarget = {
  /** Stable vendor-owned first-layer scope. The action is selected only when
   * exactly one accessible control inside it has the canonical intent. */
  scopeSelector: string;
  resolution: "scoped_accessible_control" | "closed_shadow_accessible_control";
  runtimeUrlPatterns?: RegExp[];
};

export type KnownCmpSignal = {
  source: KnownCmpSignalSource;
  value: string;
};

export type KnownCmpDetection = {
  canonicalName: string;
  confidence: number;
  evidenceTreatment: KnownCmpEvidenceTreatment;
  isCmpInfrastructure: true;
  matchedSignals: KnownCmpSignal[];
  standards: KnownCmpStandard[];
};

export type KnownCmpDetectionInput = {
  cookieNames?: string[];
  domains?: string[];
  domSelectors?: string[];
  iframeUrls?: string[];
  jsGlobals?: string[];
  labels?: string[];
  storageKeys?: string[];
  textSnippets?: string[];
  urls?: string[];
};

export const KNOWN_CMP_REGISTRY: KnownCmpDefinition[] = [
  {
    aliases: [
      "OpenAI first-party consent controls",
      "OpenAI cookie preferences",
    ],
    canonicalName: "OpenAI first-party consent controls",
    cookieNames: [
      "oai-allow-ne",
      "oai-logged-out-consent-chosen",
      "oai_consent_analytics",
      "oai_consent_marketing",
      "oai_consent_personalization",
    ],
    domains: [],
    domSelectors: ["div[class*='_bannerActions']"],
    evidenceTreatment: "cmp_infrastructure",
    reopenControlHints: ["cookie preferences"],
    refusalCookieValues: [
      { expectedValue: "false", name: "oai-allow-ne", path: "/" },
      { expectedValue: "true", name: "oai-logged-out-consent-chosen", path: "/" },
      { expectedValue: "false", name: "oai_consent_analytics", path: "/" },
      { expectedValue: "false", name: "oai_consent_marketing", path: "/" },
      { expectedValue: "false", name: "oai_consent_personalization", path: "/" },
    ],
    rejectConfirmation: {
      kind: "cmp_cookie_values_equal",
      cookies: [
        { expectedValue: "false", name: "oai-allow-ne", path: "/" },
        { expectedValue: "true", name: "oai-logged-out-consent-chosen", path: "/" },
        { expectedValue: "false", name: "oai_consent_analytics", path: "/" },
        { expectedValue: "false", name: "oai_consent_marketing", path: "/" },
        { expectedValue: "false", name: "oai_consent_personalization", path: "/" },
      ],
    },
    rejectControlSelectors: [
      "button.wm-button.wm-button--secondary.wm-button--radius-full",
    ],
    role: "consent management platform",
    standards: [],
    storageKeys: [],
  },
  {
    aliases: [
      "Amazon Privacy Preferences",
      "Amazon Cookies and Advertising Choices",
      "Cookies and Advertising Choices"
    ],
    canonicalName: "Amazon Privacy Preferences",
    domains: [],
    domSelectors: [],
    evidenceTreatment: "cmp_infrastructure",
    reopenControlHints: ["amazon privacy preferences", "cookies and advertising choices", "cookie notice"],
    role: "consent management platform",
    standards: [],
    urlPatterns: [/\/(?:privacyprefs)\/(?:retail|customize)(?:\/|[?#]|$)/i]
  },
  {
    aliases: [
      "Drupal EU Cookie Compliance",
      "EU Cookie Compliance",
      "Drupal Cookie Compliance",
      "eu_cookie_compliance",
    ],
    canonicalName: "Drupal EU Cookie Compliance module, non-TCF",
    cookieNames: ["cookie-agreed", "cookie-agreed-version", "cookie-agreed-categories"],
    domains: [],
    domSelectors: [
      "#sliding-popup",
      ".eu-cookie-compliance-banner",
      "[id*='eu-cookie-compliance' i]",
      "[class*='eu-cookie-compliance' i]",
    ],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["drupalSettings.eu_cookie_compliance"],
    reopenControlHints: ["cookie settings", "privacy settings", "change cookie settings"],
    role: "consent management platform",
    standards: [],
    urlPatterns: [
      /(?:^|\/)modules\/contrib\/eu_cookie_compliance(?:\/|[?#]|$)/i,
      /(?:^|\/)libraries\/eu_cookie_compliance(?:\/|[?#]|$)/i,
      /eu_cookie_compliance(?:\.min)?\.js(?:[?#]|$)/i,
    ],
  },
  {
    aliases: ["OneTrust CMP", "CookiePro", "Optanon", "OptanonConsent", "OptanonAlertBoxClosed"],
    acceptConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "OptanonConsent",
    },
    acceptControlSelectors: ["#onetrust-accept-btn-handler"],
    canonicalName: "OneTrust",
    cookieNames: [
      "OptanonConsent",
      "OptanonConsent_*",
      "OptanonAlertBoxClosed",
      "OptanonAlertBoxClosed_*",
    ],
    domains: ["onetrust.com", "onetrust.io", "cookielaw.org", "cdn.cookielaw.org", "cookiepro.com", "cookie-cdn.cookiepro.com", "geolocation.onetrust.com", "optanon.blob.core.windows.net", "cookies-data.onetrust.io"],
    domSelectors: ["#onetrust-banner-sdk", "#onetrust-consent-sdk", "#ot-sdk-btn", ".ot-sdk-container"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["OneTrust", "Optanon", "OptanonWrapper"],
    reopenControlHints: ["cookie settings", "privacy choices", "do not sell or share", "onetrust"],
    rejectControlSelectors: [
      "#onetrust-reject-all-handler",
      "#onetrust-banner-sdk.ot-close-btn-link button.onetrust-close-btn-handler.banner-close-button",
    ],
    rejectConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "OptanonConsent",
    },
    recipeVersion: "v1",
    role: "consent management platform",
    standards: ["tcf", "gpp", "usp", "gpc", "google_consent_mode"],
    storageKeys: ["OptanonConsent", "OptanonAlertBoxClosed"],
    urlPatterns: [/otSDKStub\.js/i, /optanon/i, /(?:^|\/)cdn\.cookielaw\.org(?:\/|$)/i]
  },
  {
    aliases: ["Ethyca Fides", "FidesJS", "Fides Consent Management"],
    acceptConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "fides_consent",
    },
    acceptControlSelectors: [
      "#fides-banner button.fides-accept-all-button",
    ],
    canonicalName: "Fides",
    cookieNames: ["fides_consent", "fides_consent_*", "fides_consent_override"],
    domains: [],
    domSelectors: [
      "#fides-banner",
      "#fides-banner-inner",
      "#fides-modal",
      "#fides-manage-preferences-button",
    ],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["Fides", "FidesInitialized"],
    reopenControlHints: ["manage preferences", "manage privacy preferences", "fides"],
    rejectControlSelectors: [
      "#fides-banner button.fides-reject-all-button",
    ],
    rejectConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "fides_consent",
    },
    recipeVersion: "v1",
    role: "consent management platform",
    standards: ["tcf", "gpp", "gpc", "google_consent_mode"],
    storageKeys: [],
    urlPatterns: [/(?:^|[\/_-])fides(?:[\/_-]|\.min\.js|\.js|$)/i],
  },
  {
    aliases: ["TRUSTe", "TrustArc Preference Manager"],
    acceptConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "notice_gdpr_prefs",
    },
    acceptControlSelectors: [".trustarc-acceptall-btn"],
    canonicalName: "TrustArc",
    cookieNames: ["notice_behavior", "TAsessionID", "notice_preferences", "notice_gdpr_prefs"],
    domains: ["trustarc.com", "truste.com", "consent.trustarc.com", "form-renderer.trustarc.com", "privacy-policy.truste.com", "preferences.trustarc.com"],
    domSelectors: ["#truste-consent-track", "[id*='truste' i]", "[id*='trustarc' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["truste", "TrustArc"],
    interactionDocumentationUrls: [
      "https://consent.trustarc.com/asset/TrustArc_Cookie_Consent_Manager_Implementation_Guide.pdf",
    ],
    reopenControlHints: ["trustarc", "privacy preferences", "cookie preferences"],
    rejectConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "notice_gdpr_prefs",
    },
    rejectControlSelectors: [".trustarc-declineall-btn"],
    recipeVersion: "v1",
    role: "consent management platform",
    standards: ["tcf", "gpp", "usp", "gpc"],
    urlPatterns: [/trustarc/i, /truste/i]
  },
  {
    aliases: ["Usercentrics CMP", "Usercentrics Consent Management"],
    acceptConfirmation: {
      kind: "tcf_purposes_or_cmp_storage_keys_changed",
      storageType: "local_storage",
      keys: ["uc_settings", "ucString"],
    },
    acceptControlSelectors: [
      'button[data-testid="uc-accept-all-button"]',
      "#uc-cmp-footer #accept",
    ],
    canonicalName: "Usercentrics",
    cookieNames: ["uc_settings", "ucString", "usercentrics"],
    domains: ["usercentrics.com", "usercentrics.eu", "app.usercentrics.eu", "api.usercentrics.eu", "aggregator.service.usercentrics.eu", "consent-api.service.consent.usercentrics.eu"],
    domSelectors: ["#usercentrics-root", "[data-testid*='uc-' i]", "[id*='usercentrics' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["UC_UI", "UC_UI_SUPPRESS_CMP_DISPLAY", "usercentrics"],
    reopenControlHints: ["usercentrics", "privacy settings", "cookie settings"],
    rejectControlSelectors: [
      'button[data-testid="uc-deny-all-button"]',
      "#uc-cmp-footer #deny",
    ],
    rejectConfirmation: {
      kind: "tcf_purposes_or_cmp_storage_keys_changed",
      storageType: "local_storage",
      keys: ["uc_settings", "ucString"],
    },
    recipeVersion: "v1",
    role: "consent management platform",
    standards: ["tcf", "gpp", "google_consent_mode"],
    storageKeys: ["uc_settings", "ucString", "uc_user_interaction"],
    urlPatterns: [/usercentrics/i]
  },
  {
    aliases: ["Consentmanager CMP", "consentmanager.net", "consentmanager.de", "ConsentManager"],
    acceptConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "__cmpconsent",
    },
    acceptControlSelectors: ["a.cmpboxbtnyes"],
    canonicalName: "Consentmanager",
    cookieNames: ["__cmpconsent*", "__cmpconsents*", "__cmpconsentx*", "__cmpcc", "__cmpcpc", "__cmpcvc", "__cmpiab"],
    domains: ["consentmanager.net", "consentmanager.de", "cdn.consentmanager.net", "delivery.consentmanager.net"],
    domSelectors: ["#cmpbox", "#cmpboxrecall", "[id*='cmpbox' i]", "[class*='cmpbox' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["__cmp", "__cmpapi", "__tcfapi", "cmp_data", "cmp_config"],
    interactionDocumentationUrls: [
      "https://www.help.consentmanager.net/books/cmp/page/cmp-events",
      "https://www.help.consentmanager.net/books/cmp/page/javascript-api",
      "https://www.help.consentmanager.net/books/cmp/page/text-macros-and-placeholders",
    ],
    reopenControlHints: ["consentmanager", "privacy settings", "cookie settings", "privacy preferences"],
    rejectConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "__cmpconsent",
    },
    rejectControlSelectors: ["a.cmpboxbtnno"],
    recipeVersion: "v1",
    role: "consent management platform",
    standards: ["tcf", "gpp", "usp", "gpc", "google_consent_mode"],
    storageKeys: ["__cmpconsent*", "__cmpconsents*", "__cmpconsentx*", "__cmpcc", "__cmpcpc", "__cmpcvc", "__cmpiab"],
    urlPatterns: [/consentmanager/i, /cdn\.consentmanager\.net\/(?:delivery|cmp|choice|consent)/i, /semiautomatic\.min\.js/i]
  },
  {
    aliases: ["Cybot", "Cookiebot by Usercentrics"],
    acceptConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "CookieConsent",
    },
    acceptControlSelectors: [
      "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
      "#CybotCookiebotDialogBodyButtonAccept",
    ],
    canonicalName: "Cookiebot",
    cookieNames: ["CookieConsent", "CookieConsentBulkTicket"],
    domains: ["cookiebot.com", "consent.cookiebot.com", "cookiebot.eu", "consent.cookiebot.eu", "consentcdn.cookiebot.eu"],
    domSelectors: ["#CybotCookiebotDialog", "#CookiebotWidget"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["Cookiebot", "CookieConsent"],
    reopenControlHints: ["cookiebot", "cookie declaration", "change your consent"],
    rejectControlSelectors: [
      "#CybotCookiebotDialogBodyButtonDecline",
      "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll",
    ],
    rejectConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "CookieConsent",
    },
    recipeVersion: "v1",
    role: "consent management platform",
    standards: ["tcf", "gpp", "google_consent_mode"],
    urlPatterns: [/cookiebot/i]
  },
  {
    aliases: ["CookieYes CMP", "CookieYes Consent", "GDPR Cookie Consent plugin", "Cookie Law Info"],
    acceptConfirmation: {
      kind: "cmp_cookie_changed",
      cookieName: "cookieyes-consent",
    },
    acceptControlSelectors: [".cky-consent-container .cky-btn-accept"],
    canonicalName: "CookieYes",
    cookieNames: ["cookieyes-consent", "cookielawinfo-checkbox-*", "viewed_cookie_policy"],
    domains: ["cookieyes.com", "cdn-cookieyes.com", "log.cookieyes.com"],
    domSelectors: [
      "#cookieyes-banner",
      ".cky-consent-container",
      ".cky-consent-bar",
      "[data-cky-tag]",
      "#cookie-law-info-bar",
      ".cli-bar-container",
      ".cli-modal",
    ],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["CookieYes", "ckyConsent"],
    interactionDocumentationUrls: [
      "https://www.cookieyes.com/documentation/change-the-order-of-buttons/",
      "https://www.cookieyes.com/documentation/consent-banner-action-api/",
    ],
    reopenControlHints: ["cookieyes", "cookie settings"],
    rejectConfirmation: {
      kind: "cmp_cookie_changed",
      cookieName: "cookieyes-consent",
    },
    rejectControlSelectors: [".cky-consent-container .cky-btn-reject"],
    recipeVersion: "v1",
    role: "consent management platform",
    standards: ["gpc", "google_consent_mode"],
    storageKeys: ["cookieyes-consent", "cookielawinfo-checkbox-*", "viewed_cookie_policy"],
    urlPatterns: [
      /(?:^|\.)cookieyes\.com\//i,
      /cdn-cookieyes\.com\//i,
      /cookie-law-info/i,
      /cookielawinfo/i,
      /cookieyes(?:-banner|\.min)?\.js/i,
    ]
  },
  {
    aliases: ["Orejime", "Orejime consent manager"],
    canonicalName: "Orejime",
    cookieNames: ["orejime"],
    domains: [],
    domSelectors: ["#orejime", ".orejime-Notice", ".orejime-Env"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["orejime", "orejimeConfig", "loadOrejime"],
    reopenControlHints: ["cookie settings", "privacy settings", "gestion des cookies"],
    role: "consent management platform",
    standards: [],
    storageKeys: ["orejime"],
    urlPatterns: [/(?:^|\/)orejime(?:\/|[-_.][^/?#]*)/i],
  },
  {
    aliases: ["DSGVO All in One for WP", "DSGVO AIO", "dsgvoaio", "tarteaucitron"],
    canonicalName: "DSGVO All in One / tarteaucitron",
    cookieNames: ["dsgvoaio", "dsgvoaio_create", "tarteaucitron"],
    domains: ["tarteaucitron.io"],
    domSelectors: [
      "#tarteaucitronRoot",
      "#tarteaucitronAlertBig",
      "#tarteaucitronPersonalize",
      "#tarteaucitronCloseAlert",
      "#tarteaucitronCustomize",
      "[id^='tarteaucitron']",
      "[class*='dsgvoaio' i]",
    ],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["tarteaucitron", "dsgvoaio"],
    necessaryOnlyControlTargets: [{
      bannerSelector: "#tarteaucitronAlertBig",
      controlSelector: "#tarteaucitronCloseAlert",
      disallowedCheckedSelector:
        "#tarteaucitronRoot input:checked:not(#dsgvoaio-checkbox-essentials)",
      expectedNormalizedLabel: "auswahl speichern",
      requiredCheckedSelector: "#dsgvoaio-checkbox-essentials:checked",
    }],
    reopenControlHints: ["tarteaucitron", "dsgvoaio", "datenschutzeinstellungen", "cookie-einstellungen"],
    role: "consent management platform",
    standards: [],
    storageKeys: ["dsgvoaio", "dsgvoaio_create", "tarteaucitron"],
    urlPatterns: [/dsgvo-all-in-one/i, /dsgvoaio/i, /tarteaucitron(?:\.min)?\.js/i]
  },
  {
    aliases: ["BST DSGVO Cookie", "bst-dsgvo-cookie"],
    canonicalName: "BST DSGVO Cookie notice plugin, non-TCF",
    domains: [],
    domSelectors: [".bst-popup-link"],
    evidenceTreatment: "cmp_infrastructure",
    role: "consent management platform",
    standards: [],
    urlPatterns: [
      /(?:^|\/)wp-content\/plugins\/bst-dsgvo-cookie(?:\/|[?#]|$)/i,
    ],
  },
  {
    aliases: ["Borlabs Cookie", "Borlabs Cookie CMP", "BorlabsCookie"],
    canonicalName: "Borlabs Cookie",
    cookieNames: ["borlabs-cookie", "borlabsCookie"],
    domains: ["borlabs.io"],
    domSelectors: ["#BorlabsCookieBox", "[data-borlabs-cookie-consent-required]", "[class*='brlbs-' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["BorlabsCookie"],
    reopenControlHints: ["borlabs", "privacy preferences", "cookie preferences"],
    role: "consent management platform",
    storageKeys: ["borlabs-cookie", "borlabsCookie"],
    urlPatterns: [/borlabs-cookie/i, /borlabscookie/i]
  },
  {
    aliases: ["Sourcepoint CMP", "Sourcepoint Dialogue"],
    acceptConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "_sp_user_consent",
    },
    acceptControlSelectors: [".sp_choice_type_ACCEPT_ALL"],
    canonicalName: "Sourcepoint",
    cookieNames: ["_sp_su", "_sp_v1_*", "_sp_user_consent", "_sp_user_consent_*", "_sp_local_state", "_sp_non_keyed_local_state", "_sp_enable_dfp_personalized_ads", "sp_choice"],
    domains: ["privacy-mgmt.com", "cdn.privacy-mgmt.com", "sourcepoint.mgr.consensu.org", "cmp-cdn.privacy-mgmt.com"],
    domSelectors: ["[id*='sp_message_container' i]", "iframe[id*='sp_message_iframe' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["__tcfapi", "_sp_"],
    interactionDocumentationUrls: [
      "https://docs.sourcepoint.com/hc/en-us/articles/33502420772883-Test-automation-for-privacy-manager-actions",
      "https://docs.sourcepoint.com/hc/en-us/articles/4405397717395-Vendor-grants-Web",
    ],
    interactionRisks: ["consent_or_pay_variant_requires_review"],
    reopenControlHints: ["sourcepoint", "privacy manager"],
    rejectConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "_sp_user_consent",
    },
    rejectControlSelectors: [".sp_choice_type_REJECT_ALL"],
    recipeVersion: "v1",
    role: "consent management platform",
    standards: ["tcf", "gpp", "usp"],
    storageKeys: ["_sp_su", "_sp_v1_*", "_sp_user_consent", "_sp_user_consent_*", "_sp_local_state", "_sp_non_keyed_local_state", "_sp_enable_dfp_personalized_ads", "sp_choice"],
    urlPatterns: [/privacy-mgmt/i, /sourcepoint/i, /sp_message/i]
  },
  {
    aliases: ["Didomi CMP"],
    acceptConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "didomi_token",
    },
    acceptControlSelectors: ["#didomi-notice-agree-button"],
    canonicalName: "Didomi",
    cookieNames: ["didomi_token", "euconsent-v2"],
    domains: ["didomi.io", "sdk.privacy-center.org", "privacy-center.org"],
    domSelectors: ["#didomi-host", "[id*='didomi' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["Didomi", "__tcfapi"],
    interactionDocumentationUrls: [
      "https://developers.didomi.io/cmp/web-sdk/reference/api",
      "https://developers.didomi.io/cmp/web-sdk/reference/events",
    ],
    reopenControlHints: ["didomi", "privacy choices"],
    rejectConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "didomi_token",
    },
    rejectControlSelectors: ["#didomi-notice-disagree-button"],
    recipeVersion: "v1",
    role: "consent management platform",
    standards: ["tcf", "gpp", "google_consent_mode"],
    urlPatterns: [/didomi/i]
  },
  {
    aliases: ["Quantcast CMP", "Quantcast Choice"],
    acceptConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "euconsent-v2",
    },
    acceptControlTargets: [{
      scopeSelector: "#qc-cmp2-ui",
      resolution: "scoped_accessible_control",
      runtimeUrlPatterns: [/qc-cmp/i, /quantcast\.mgr\.consensu\.org/i],
    }],
    canonicalName: "Quantcast Choice",
    cookieNames: ["euconsent-v2", "qcConsent"],
    domains: ["quantcast.mgr.consensu.org", "mgr.consensu.org"],
    domSelectors: ["#qc-cmp2-ui", "[id*='qc-cmp' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["__tcfapi", "QCChoice"],
    interactionDocumentationUrls: [
      "https://support.inmobi.com/choice/changelog/web-changelog-cmp/",
      "https://support.inmobi.com/choice/how-to-guide/callbacks/web-callbacks",
    ],
    reopenControlHints: ["quantcast", "privacy manager"],
    rejectConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "euconsent-v2",
    },
    rejectControlTargets: [{
      scopeSelector: "#qc-cmp2-ui",
      resolution: "scoped_accessible_control",
      runtimeUrlPatterns: [/qc-cmp/i, /quantcast\.mgr\.consensu\.org/i],
    }],
    recipeVersion: "v1",
    role: "consent management platform",
    standards: ["tcf"],
    urlPatterns: [/qc-cmp/i, /quantcast\.mgr\.consensu\.org/i]
  },
  {
    aliases: ["Seznam CMP", "Seznam Consent", "Seznam TCF CMP"],
    acceptConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "sznlbr",
    },
    acceptControlSelectors: ['[data-testid="button-accept"]'],
    canonicalName: "Seznam CMP",
    cookieNames: ["sznlbr", "euconsent-v2"],
    domains: ["cmp.seznam.cz", "cmp.seznamzpravy.cz"],
    domSelectors: ["[id*='seznam-cmp' i]", "[class*='seznam-cmp' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["__tcfapi"],
    reopenControlHints: ["nastavit souhlas", "nastavit cookies", "seznam cmp"],
    rejectControlSelectors: ['[data-testid="button-reject"]'],
    rejectConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "sznlbr",
    },
    recipeVersion: "v1",
    role: "consent management platform",
    standards: ["tcf"],
    storageKeys: ["sznlbr", "euconsent-v2"],
    urlPatterns: [/cmp\.seznam(?:zpravy)?\.cz/i, /seznam.*cmp/i]
  },
  {
    aliases: ["Funding Choices", "Google Consent Management Solutions"],
    acceptConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "FCCDCF",
    },
    acceptControlSelectors: [
      "button.fc-cta-consent",
      'button[aria-label="Consent"]:has(.fc-button-label)',
    ],
    canonicalName: "Google Funding Choices",
    cookieNames: ["FCCDCF", "FCNEC"],
    domains: ["fundingchoicesmessages.google.com"],
    domSelectors: ["[id*='fundingchoices' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["googlefc"],
    reopenControlHints: ["privacy and messaging", "funding choices"],
    rejectControlSelectors: [
      "button.fc-cta-do-not-consent",
      'button[aria-label="Do not consent"]:has(.fc-button-label)',
    ],
    rejectConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "FCCDCF",
    },
    recipeVersion: "v1",
    role: "consent management platform",
    standards: ["tcf", "google_consent_mode"],
    urlPatterns: [/fundingchoicesmessages\.google\.com/i, /googlefc/i]
  },
  {
    aliases: ["HubSpot Banner", "HubSpot Cookie Banner", "HubSpot Consent Banner"],
    acceptConfirmation: {
      kind: "cmp_cookie_names_changed",
      cookieNames: ["__hs_cookie_cat_pref", "__hs_opt_out"],
    },
    acceptControlSelectors: ["#hs-eu-confirmation-button"],
    canonicalName: "HubSpot Consent Banner",
    cookieNames: ["__hs_cookie_cat_pref", "__hs_opt_out", "__hs_do_not_track"],
    domains: ["js.hs-banner.com"],
    domSelectors: ["#hs-eu-cookie-confirmation"],
    evidenceTreatment: "cmp_infrastructure",
    interactionDocumentationUrls: [
      "https://developers.hubspot.com/docs/api-reference/latest/account/settings/consent-banner/consent-banner-api",
    ],
    reopenControlHints: ["cookie settings", "privacy settings"],
    rejectConfirmation: {
      kind: "cmp_cookie_names_changed",
      cookieNames: ["__hs_cookie_cat_pref", "__hs_opt_out"],
    },
    rejectControlSelectors: ["#hs-eu-decline-button"],
    recipeVersion: "v1",
    role: "consent management platform",
    standards: ["gpc", "google_consent_mode"],
    storageKeys: ["__hs_cookie_cat_pref", "__hs_opt_out", "__hs_do_not_track"],
    urlPatterns: [/js\.hs-banner\.com\//i, /hubspot.*cookie[-_/]banner/i],
  },
  {
    aliases: ["Termly CMP"],
    acceptConfirmation: {
      kind: "cmp_api_consent_state_changed",
      provider: "termly",
    },
    acceptControlTargets: [{
      scopeSelector: '[data-termly-part="banner-actions"]',
      resolution: "scoped_accessible_control",
    }],
    canonicalName: "Termly",
    cookieNames: ["TERMLY_API_CACHE", "termly_gtm_template_default_consents"],
    domains: ["termly.io", "app.termly.io"],
    domSelectors: ["[id*='termly' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["Termly"],
    interactionDocumentationUrls: [
      "https://support.termly.io/hc/en-us/articles/49692200680465-Styling-the-consent-banner-data-termly-attributes",
      "https://support.termly.io/hc/en-us/articles/30710442081553-Getting-Consent-State-and-Handling-Consent-Changes-with-Termly",
    ],
    reopenControlHints: ["termly", "consent preferences"],
    rejectConfirmation: {
      kind: "cmp_api_consent_state_changed",
      provider: "termly",
    },
    rejectControlTargets: [{
      scopeSelector: '[data-termly-part="banner-actions"]',
      resolution: "scoped_accessible_control",
    }],
    recipeVersion: "v1",
    role: "consent management platform",
    standards: ["gpc", "google_consent_mode"],
    urlPatterns: [/termly/i]
  },
  {
    aliases: ["Osano CMP"],
    canonicalName: "Osano",
    acceptConfirmation: {
      kind: "cmp_cookie_changed",
      cookieName: "osano_consentmanager",
    },
    acceptControlSelectors: [".osano-cm-accept-all"],
    cookieNames: ["osano_consentmanager", "osano_consentmanager_uuid"],
    domains: ["osano.com", "cmp.osano.com", "disclosure.api.osano.com"],
    domSelectors: [".osano-cm-window", "[class*='osano-cm' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["Osano"],
    interactionDocumentationUrls: [
      "https://developers.osano.com/cmp/javascript-api/developer-documentation-consent-javascript-api",
    ],
    reopenControlHints: ["osano", "cookie preferences"],
    rejectConfirmation: {
      kind: "cmp_cookie_changed",
      cookieName: "osano_consentmanager",
    },
    rejectControlSelectors: [".osano-cm-deny-all"],
    recipeVersion: "v1",
    role: "consent management platform",
    standards: ["gpc"],
    urlPatterns: [/osano/i]
  },
  {
    aliases: ["Iubenda CMP"],
    acceptConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "_iub_cs",
    },
    acceptControlSelectors: [".iubenda-cs-accept-btn"],
    canonicalName: "Iubenda",
    cookieNames: ["_iub_cs"],
    domains: ["iubenda.com", "cdn.iubenda.com", "cs.iubenda.com"],
    domSelectors: ["[id*='iubenda' i]", "[class*='iubenda' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["_iub", "iubenda"],
    interactionDocumentationUrls: [
      "https://www.iubenda.com/en/help/1205-how-to-configure-your-cookie-solution-advanced-guide-2/",
    ],
    reopenControlHints: ["iubenda", "privacy preferences"],
    rejectConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "_iub_cs",
    },
    rejectControlTargets: [{
      scopeSelector: ".iubenda-cs-opt-group-consent",
      resolution: "scoped_accessible_control",
    }],
    recipeVersion: "v1",
    role: "consent management platform",
    standards: ["tcf", "gpp"],
    urlPatterns: [/iubenda/i]
  },
  {
    aliases: ["Cookie Information CMP"],
    acceptConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "CookieInformationConsent",
    },
    acceptControlSelectors: [".coi-banner__accept"],
    canonicalName: "Cookie Information",
    cookieNames: ["CookieInformationConsent"],
    domains: ["cookieinformation.com", "app.cookieinformation.com"],
    domSelectors: ["#coiOverlay", "[id*='cookie-information' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["CookieInformation"],
    reopenControlHints: ["cookie information", "cookie settings"],
    rejectConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "CookieInformationConsent",
    },
    rejectControlSelectors: [".coi-banner__decline"],
    recipeVersion: "v1",
    role: "consent management platform",
    standards: ["tcf", "google_consent_mode"],
    urlPatterns: [/cookieinformation/i]
  },
  {
    aliases: ["InMobi Choice", "InMobi CMP", "Choice CMP"],
    acceptConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "euconsent-v2",
    },
    acceptControlTargets: [{
      scopeSelector: "#qc-cmp2-ui",
      resolution: "scoped_accessible_control",
      runtimeUrlPatterns: [/cmp\.inmobi\.com\/(?:choice|geoip|vendor-list|tcfv2)/i],
    }],
    canonicalName: "InMobi Choice",
    cookieNames: ["euconsent-v2"],
    domains: ["cmp.inmobi.com"],
    domSelectors: ["[id*='inmobi-cmp' i]", "[class*='inmobi-cmp' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["__tcfapi"],
    interactionDocumentationUrls: [
      "https://support.inmobi.com/choice/how-to-guide/callbacks/web-callbacks",
      "https://support.inmobi.com/choice/changelog/web-changelog-cmp/",
    ],
    reopenControlHints: ["privacy choices", "consent choices"],
    rejectConfirmation: {
      kind: "tcf_purposes_or_cmp_cookie_changed",
      cookieName: "euconsent-v2",
    },
    rejectControlTargets: [{
      scopeSelector: "#qc-cmp2-ui",
      resolution: "scoped_accessible_control",
      runtimeUrlPatterns: [/cmp\.inmobi\.com\/(?:choice|geoip|vendor-list|tcfv2)/i],
    }],
    recipeVersion: "v1",
    role: "consent management platform",
    standards: ["tcf"],
    storageKeys: ["euconsent-v2"],
    urlPatterns: [/cmp\.inmobi\.com\/(?:choice|geoip|vendor-list|tcfv2)/i]
  },
  {
    aliases: ["Ketch CMP", "Ketch Consent Management"],
    acceptConfirmation: {
      kind: "cmp_cookie_changed",
      cookieName: "ketch_consent",
    },
    acceptControlSelectors: ["#ketch-banner-button-tertiary"],
    canonicalName: "Ketch",
    cookieNames: ["ketch_consent"],
    domains: ["ketch.com", "ketchcdn.com", "cdn.ketchjs.com"],
    domSelectors: ["#ketch-banner", "[class*='ketch-consent' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["Ketch", "ketch"],
    interactionDocumentationUrls: [
      "https://docs.ketch.com/",
      "https://github.com/ketch-sdk/ketch-js",
    ],
    reopenControlHints: ["privacy choices", "privacy preferences", "ketch"],
    rejectConfirmation: {
      kind: "cmp_cookie_changed",
      cookieName: "ketch_consent",
    },
    rejectControlSelectors: ["#ketch-banner-button-secondary"],
    recipeVersion: "v1",
    role: "consent management platform",
    standards: ["tcf", "gpp", "gpc"],
    storageKeys: ["ketch_consent"],
    urlPatterns: [/cdn\.ketchjs\.com\/(?:ketchtag\/stable\/v\d+(?:\.\d+)*\/ketch-sdk\.js|plugins\/v\d+\/tcf\/stub\.js|web\/v\d+\/ketch\.js|tcf\/v\d+\/stub\.js|ketch\.js)/i]
  },
  {
    aliases: ["Transcend Consent", "Transcend Consent Management", "Airgap"],
    acceptConfirmation: {
      kind: "cmp_api_consent_state_changed",
      provider: "transcend",
    },
    acceptControlTargets: [{
      scopeSelector: "#transcend-shadow-root",
      resolution: "closed_shadow_accessible_control",
    }],
    canonicalName: "Transcend",
    cookieNames: ["transcend-consent", "airgap"],
    domains: ["transcend.io", "transcend-cdn.com", "privacy-center-api.transcend.io"],
    domSelectors: ["#transcend-shadow-root", "[id*='transcend' i]", "[data-transcend-consent]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["airgap", "transcend"],
    interactionDocumentationUrls: [
      "https://docs.transcend.io/docs/articles/consent-management/reference/airgap/load-options",
    ],
    reopenControlHints: ["transcend", "privacy center", "privacy choices"],
    rejectConfirmation: {
      kind: "cmp_api_consent_state_changed",
      provider: "transcend",
    },
    rejectControlTargets: [{
      scopeSelector: "#transcend-shadow-root",
      resolution: "closed_shadow_accessible_control",
    }],
    recipeVersion: "v1",
    role: "consent management platform",
    standards: ["gpc", "google_consent_mode"],
    storageKeys: ["transcend-consent", "airgap"],
    urlPatterns: [/airgap\.js/i, /transcend-cdn/i, /privacy-center-api\.transcend\.io/i]
  }
];

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeHostname(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new URL(trimmed).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").split("/")[0]?.replace(/:\d+$/, "").toLowerCase().replace(/^www\./, "") ?? null;
  }
}

function hostMatches(candidate: string, domain: string) {
  const normalizedCandidate = normalizeHostname(candidate);
  const normalizedDomain = normalizeHostname(domain);
  return Boolean(normalizedCandidate && normalizedDomain && (normalizedCandidate === normalizedDomain || normalizedCandidate.endsWith(`.${normalizedDomain}`)));
}

function textMatches(value: string, pattern: RegExp) {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

const GENERIC_SELECTOR_TOKENS = new Set([
  "a",
  "aria",
  "aside",
  "button",
  "class",
  "data",
  "dialog",
  "div",
  "footer",
  "form",
  "header",
  "iframe",
  "input",
  "main",
  "role",
  "section",
  "span",
  "testid",
]);
const GENERIC_CMP_PROTOCOL_GLOBALS = new Set(["__tcfapi", "__gpp", "__uspapi", "__cmp"]);

function selectorTokens(value: string) {
  return (value.toLowerCase().match(/[a-z0-9_-]{3,}/g) ?? []).filter((token) => !GENERIC_SELECTOR_TOKENS.has(token));
}

function collectSignalsForDefinition(definition: KnownCmpDefinition, input: KnownCmpDetectionInput) {
  const signals: KnownCmpSignal[] = [];
  const push = (source: KnownCmpSignalSource, value: string) => {
    const trimmed = value.trim();
    if (trimmed && !signals.some((signal) => signal.source === source && signal.value === trimmed)) {
      signals.push({ source, value: trimmed });
    }
  };

  for (const domain of uniqueStrings([...(input.domains ?? []), ...(input.urls ?? []).map((url) => normalizeHostname(url) ?? "")])) {
    if (definition.domains.some((knownDomain) => hostMatches(domain, knownDomain))) {
      push("host", domain);
    }
  }

  for (const url of uniqueStrings(input.urls ?? [])) {
    const host = normalizeHostname(url);
    if (host && definition.domains.some((knownDomain) => hostMatches(host, knownDomain))) {
      push("url", url);
    } else if ((definition.urlPatterns ?? []).some((pattern) => textMatches(url, pattern))) {
      push("script", url);
    }
  }

  for (const iframeUrl of uniqueStrings(input.iframeUrls ?? [])) {
    const host = normalizeHostname(iframeUrl);
    if (host && definition.domains.some((knownDomain) => hostMatches(host, knownDomain))) {
      push("iframe", iframeUrl);
    } else if ((definition.iframePatterns ?? definition.urlPatterns ?? []).some((pattern) => textMatches(iframeUrl, pattern))) {
      push("iframe", iframeUrl);
    }
  }

  for (const cookieName of uniqueStrings(input.cookieNames ?? [])) {
    if ((definition.cookieNames ?? []).some((knownName) => {
      const normalizedCookieName = cookieName.toLowerCase();
      const normalizedKnownName = knownName.toLowerCase();
      const prefixName = normalizedKnownName.endsWith("*") ? normalizedKnownName.slice(0, -1) : null;
      return normalizedCookieName === normalizedKnownName ||
        normalizedCookieName.startsWith(`${normalizedKnownName}.`) ||
        (normalizedKnownName.endsWith("_") && normalizedCookieName.startsWith(normalizedKnownName)) ||
        (prefixName !== null && normalizedCookieName.startsWith(prefixName));
    })) {
      push("cookie", cookieName);
    }
  }

  for (const storageKey of uniqueStrings(input.storageKeys ?? [])) {
    if ((definition.storageKeys ?? definition.cookieNames ?? []).some((knownName) => {
      const normalizedStorageKey = storageKey.toLowerCase();
      const normalizedKnownName = knownName.toLowerCase();
      const prefixName = normalizedKnownName.endsWith("*") ? normalizedKnownName.slice(0, -1) : null;
      return normalizedStorageKey === normalizedKnownName ||
        normalizedStorageKey.includes(normalizedKnownName) ||
        (prefixName !== null && normalizedStorageKey.startsWith(prefixName));
    })) {
      push("storage", storageKey);
    }
  }

  for (const globalName of uniqueStrings(input.jsGlobals ?? [])) {
    if ((definition.globalNames ?? []).some((knownName) => {
      const normalizedGlobalName = globalName.toLowerCase();
      const normalizedKnownName = knownName.toLowerCase();
      if (GENERIC_CMP_PROTOCOL_GLOBALS.has(normalizedGlobalName) && GENERIC_CMP_PROTOCOL_GLOBALS.has(normalizedKnownName)) {
        return false;
      }
      return normalizedGlobalName === normalizedKnownName || normalizedGlobalName.includes(normalizedKnownName);
    })) {
      push("global", globalName);
    }
  }

  for (const selector of uniqueStrings(input.domSelectors ?? [])) {
    const inputTokens = selectorTokens(selector);
    if ((definition.domSelectors ?? []).some((knownSelector) => {
      const knownTokens = selectorTokens(knownSelector);
      return knownTokens.some((token) => inputTokens.includes(token) || selector.toLowerCase().includes(token));
    })) {
      push("dom", selector);
    }
  }

  for (const label of uniqueStrings(input.labels ?? [])) {
    if ([definition.canonicalName, ...definition.aliases].some((knownName) => label.toLowerCase().includes(knownName.toLowerCase()))) {
      push("alias", label);
    }
  }

  for (const text of uniqueStrings(input.textSnippets ?? [])) {
    // Text snippets are rendered/document text, not URLs. Applying URL
    // patterns here allowed short legacy aliases such as `truste` to match
    // unrelated JavaScript identifiers such as `trustedTypes`. Require a
    // bounded canonical name or alias; URL patterns remain authoritative only
    // for URL/script/iframe inputs above.
    if ([definition.canonicalName, ...definition.aliases].some((knownName) => containsBoundedCmpName(text, knownName))) {
      push("text", text);
    }
  }

  return signals;
}

function containsBoundedCmpName(value: string, knownName: string): boolean {
  const escaped = knownName
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  if (!escaped) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu").test(value);
}

function confidenceForSignals(signals: KnownCmpSignal[]) {
  if (signals.some((signal) => signal.source === "host" || signal.source === "url" || signal.source === "script" || signal.source === "cookie" || signal.source === "global")) {
    return 0.95;
  }
  if (signals.some((signal) => signal.source === "dom" || signal.source === "iframe" || signal.source === "storage")) {
    return 0.85;
  }
  return 0.7;
}

function detectionSpecificityScore(detection: KnownCmpDetection) {
  const sourceWeight: Record<KnownCmpSignalSource, number> = {
    alias: 4, cookie: 9, dom: 6, global: 5, host: 10, iframe: 7, script: 8, storage: 6, text: 3, url: 10
  };
  return detection.matchedSignals.reduce((score, signal) => score + (sourceWeight[signal.source] ?? 1), 0);
}

export function getKnownCmpDefinitionByName(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  return KNOWN_CMP_REGISTRY.find((definition) =>
    definition.canonicalName.toLowerCase() === normalized ||
    definition.aliases.some((alias) => alias.toLowerCase() === normalized)
  );
}

export function canonicalizeKnownCmpName(value: string | null | undefined) {
  return getKnownCmpDefinitionByName(value)?.canonicalName ?? null;
}

export function getKnownCmpActionCapability(
  value: string,
  action: "accept" | "reject",
): KnownCmpActionCapability | undefined {
  const definition = getKnownCmpDefinitionByName(value);
  if (!definition) return undefined;
  const selectorRegistered = action === "accept"
    ? Boolean(
        definition.acceptControlSelectors?.length ||
        definition.acceptControlTargets?.length
      )
    : Boolean(
        definition.rejectControlSelectors?.length ||
        definition.rejectControlTargets?.length ||
        definition.necessaryOnlyControlTargets?.length
      );
  const semanticConfirmationRegistered = action === "accept"
    ? Boolean(definition.acceptConfirmation || definition.acceptanceCookieValues?.length)
    : Boolean(
        definition.rejectConfirmation ||
        definition.refusalCookieValues?.length ||
        definition.necessaryOnlyControlTargets?.length
      );
  const recipeAvailable = selectorRegistered && semanticConfirmationRegistered;
  const risk = definition.interactionRisks?.[0];
  return {
    action,
    canonicalName: definition.canonicalName,
    documentationUrls: definition.interactionDocumentationUrls ?? [],
    recipeAvailable,
    ...(definition.recipeVersion ? { recipeVersion: definition.recipeVersion } : {}),
    semanticConfirmationRegistered,
    selectorRegistered,
    ...(!recipeAvailable
      ? {
          unsupportedReason: risk
            ? risk
            : !selectorRegistered
              ? "missing_deterministic_selector" as const
              : "missing_semantic_confirmation" as const,
        }
      : {}),
  };
}

export function getKnownCmpCapabilityMatrix() {
  return KNOWN_CMP_REGISTRY.map((definition) => ({
    canonicalName: definition.canonicalName,
    accept: getKnownCmpActionCapability(definition.canonicalName, "accept")!,
    reject: getKnownCmpActionCapability(definition.canonicalName, "reject")!,
  }));
}

export function detectKnownCmps(input: KnownCmpDetectionInput) {
  return KNOWN_CMP_REGISTRY.flatMap((definition): KnownCmpDetection[] => {
    const matchedSignals = collectSignalsForDefinition(definition, input);
    if (matchedSignals.length === 0) {
      return [];
    }
    return [{
      canonicalName: definition.canonicalName,
      confidence: confidenceForSignals(matchedSignals),
      evidenceTreatment: definition.evidenceTreatment,
      isCmpInfrastructure: true,
      matchedSignals,
      standards: definition.standards ?? []
    }];
  }).sort((left, right) =>
    right.confidence - left.confidence ||
    detectionSpecificityScore(right) - detectionSpecificityScore(left) ||
    right.matchedSignals.length - left.matchedSignals.length ||
    left.canonicalName.localeCompare(right.canonicalName)
  );
}

export function getKnownCmpVendorName(input: KnownCmpDetectionInput) {
  return detectKnownCmps(input)[0]?.canonicalName ?? null;
}

export function getKnownCmpVendorForHost(value: string | null | undefined) {
  return getKnownCmpVendorName({ domains: value ? [value] : [] });
}

export function isKnownCmpInfrastructureHost(value: string | null | undefined) {
  return Boolean(getKnownCmpVendorForHost(value));
}

export function isKnownCmpInfrastructureUrl(value: string | null | undefined) {
  return Boolean(value && detectKnownCmps({ urls: [value] }).length > 0);
}

export function isKnownCmpCookieName(value: string | null | undefined) {
  return Boolean(value && detectKnownCmps({ cookieNames: [value] }).length > 0);
}

export function isKnownCmpVendorLabel(value: string | null | undefined) {
  return Boolean(value && detectKnownCmps({ labels: [value] }).length > 0);
}
