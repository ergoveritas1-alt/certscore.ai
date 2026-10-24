import { NAMED_NECESSARY_ONLY_REJECT_LABELS } from "@certscore/contracts";

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
  | {
      kind: "canonical_first_layer_ui_transition";
      bannerSelector: string;
      controlSelector: string;
    }
  | { kind: "cmp_cookie_changed"; cookieName: string }
  | { kind: "cmp_cookie_names_changed"; cookieNames: string[] }
  | {
      kind: "cmp_cookie_values_equal";
      cookies: Array<{ expectedValue: string; name: string; path: string }>;
    }
  | { kind: "local_storage_equals"; expectedValue: string; key: string }
  | {
      kind: "cmp_api_consent_state_changed";
      provider: "termly" | "transcend" | "borlabs" | "osano" | "hubspot" | "drupal_eu_cookie" | "didomi" | "cookie_information" | "cookiescript" | "finsweet";
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
  /** Separate California action recipe; cookie Reject/Save never authorizes this action. */
  saleSharingOptOut?: { version: string; entranceSelector: string; entranceLabels?: readonly string[]; dialogSelector: string; submitSelector: string; submitLabels: readonly string[]; documentationUrls: readonly string[];
    /** Separate, owner-reviewed Settings opening authority; submission is unchanged.
     * Applies only after the exact source route has reached its bound destination. */
    settingsEntrances?: readonly { version: string; originalTargetUrl: string; actionTargetUrl: string;
      buttonSelector: string; anchorSelector?: string; labels: readonly string[] }[];
  };
  /** Explicit documented tenant/site cookie variants; identity only. */
  cookieNameVariants?: Array<{ canonicalName: string; pattern: RegExp }>;
  initialOptionalOffCloseObservation?: {
    recipe: "axeptio.initial_optional_off_close.v1";
    submitSelector: '#axeptio_btn_close[aria-label="Close cookie settings"]';
    categoryContainerSelector: '[data-testid="widget-container"]';
    widgetSelector: string; acceptSelector: string; nextSelector: string; inputSelector: string;
  };
  /** One read-only preference visit; never shared with Accept/Reject recipes. */
  preferenceInspection?: {
    version: string;
    kind: "borlabs_v3";
    entranceSelector: string;
    controlSelector: string;
    dialogSelector: string;
  };
  /** Preference-only vendor scope. Does not register Accept/Reject controls. */
  preferenceScopeSelector?: string;
  /** Registered primary Options area; excludes duplicate explanatory links. */
  preferenceControlScopeSelector?: string;
  /** Permit an exact aria-controls target to appear under this retained root.
   * The target still requires a named dialog/region and one Options action. */
  preferenceDeferredAriaBinding?: { version: string; rootSelector: string };
  /** Reviewed sibling portal, bound to the original root/control and SDK. */
  preferencePortalBinding?: { version: string; kind: "iubenda_portal" | "trustarc_portal";
    rootSelector: string; controlSelector: string; panelSelector: string; contentReadySelector: string; shadowContentSelector?: string; sdkPath: string[] };
  /** Read-only inventory adapter for already-loaded vendor configuration. */
  preferenceInventory?: "cookieyes_loaded_configuration.v1";
  /** Critical passive initialization assets only; never telemetry endpoints or
   * an interaction recipe. Used to bound settling of an already-observed load. */
  passiveInitializationRequests?: {
    version: "onetrust_initialization_requests.v1";
    endpoints: Array<{ origin: string; path: RegExp; resourceTypes: Array<"script" | "xhr" | "fetch"> }>;
  };
  /** Existing passive page-link budget, after visual work and with restored scroll. */
  passivePrivacyLinkInspection?: "same_origin_after_visual.v1";
  /** Bounded response capture; no request, getter, panel opening or consent state. */
  passiveNetworkInventory?: {version:"termly_cookie_response.v1";origin:"https://app.termly.io";scriptPathPrefix:"/resource-blocker/";responsePathPrefix:"/api/v1/snippets/websites/"};
  /** Read only already-ready configured vendor names, without opening UI. */
  passiveServiceInventory?: {
    version: "didomi_required_vendors.v1";
    rootSelector: "#didomi-host";
    noticeSelector: ".didomi-notice-banner, .didomi-notice-popup, #didomi-notice";
  };
  /** Public declarations already loaded under the verified preference panel.
   * Collapsed data is configuration evidence, never visible inventory proof. */
  preferenceLoadedInventory?: {
    version: "cookiebot_loaded_declarations.v1";
    groupSelector: string; providerSelector: string; countSelector: string;
    recordSelector: string; nameSelector: string; descriptionSelector: string;
    footerSelector: string;
  };
  /** Read the already-mounted declaration panel without opening it. */
  passiveLoadedInventory?: {
    version: "cookiebot_passive_loaded_inventory.v1";
    rootSelector: "#CybotCookiebotDialog";
    panelSelector: "#CybotCookiebotDialogTabContentDetails";
  } | {
    version: "consentmanager_passive_loaded_inventory.v1";
    rootSelector: "#cmpbox";
    panelSelector: ".cmpcookiesdescrbox table.cmpcookietbl";
  };
  /** Read-only category identity inside a verified preference dialog.
   * Identifies control type only, never cookie purpose or consent state. */
  preferenceCategoryInventory?: {
    version: string;
    kind?: "category" | "service";
    serviceLinkSelector?: string;
    serviceLinkLabelSuffix?: string;
    dialogSelector: string;
    categorySelector: string;
    radioGroupSelector?: string;
    titleSelector: string;
    toggleSelector: string;
    /** Exact reviewed sibling for a styled native checkbox, not a guessed label. */
    visibleProxySelector?: string;
  };
  /** Named-CMP Options binding when aria-controls is absent. An on-demand
   * panel must appear under the same pre-existing registered vendor root.
   * Never opens via a vendor API or accepts an arbitrary new modal. */
  preferenceDialogBinding?: { version: string; openingBudgetMs?: number; controlSelector: string; dialogSelector: string; deferredRootSelector?: string; dialogRoles?: string[]; allowObservedOptionsLabel?: boolean; allowPrivacyOptOutEntrance?: boolean; allowExternalOptionsEntrance?: boolean; layerTransitionSelector?: string; tabSelector?: string };
  /** Factual cookie identity from an already-loaded, own-data configuration.
   * Never a semantic consent witness or a global cookie-name alias. */
  configuredConsentCookiePath?: string;
  /** Content-specific opt-in controls are not first-layer visitor consent choices. */
  nonFirstLayerSurfaceSelectors?: string[];
  /** Exclude actual consent dialogs from collection inventory, not blocked content. */
  formExclusionSelectors?: string[];

  /** Passive control recognition only; never an action/dispatch recipe. */
  observationControlRecipes?: Array<{ recipeId: string; controlSelector: string; containerSelectors: string[] }>;

  /** Reviewed contextual approval labels may activate only this exact named
   * first-layer scope. This is control proof, never semantic consent proof. */
  acceptContextualApproval?: {
    policyVersion: "registered_contextual_accept.v1";
    bannerSelector: string;
    expectedNormalizedLabel: string;
  };
  acceptConfirmation?: KnownCmpActionConfirmation;
  /** Exact first-layer control plus visible label-bound refusal instructions.
   * Authorizes activation only; semantic registration is verified separately. */
  rejectLabelBoundNecessaryOnly?: {
    policyVersion: keyof typeof NAMED_NECESSARY_ONLY_REJECT_LABELS;
    bannerSelector: string;
    controlSelector: string;
    expectedNormalizedLabels: string[];
  };
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
  /** Vendor-specific retained selector syntax, avoiding generic attribute values. */
  domMarkerPatterns?: RegExp[];
  evidenceTreatment: KnownCmpEvidenceTreatment;
  globalNames?: string[];
  /** Read-only loaded configuration identity; never a visible/actionable scope. */
  passiveConfigurationApi?: "OneTrust.GetDomainData";
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
    // Passive identity only. Source-reviewed on the Volkswagen consent bundle;
    // Bootstrapper/Ensighten Manage alone does not identify a consent UI.
    canonicalName: "Ensighten Privacy", aliases: ["CHEQ Enforce"], domains: [],
    domSelectors: ["#ensNotifyBanner", "#ensModalWrapper", "#tcf2__ensNotifyBanner", "#tcf2__ensModalWrapper"],
    domMarkerPatterns: [/^#(?:ensNotifyBanner|ensModalWrapper|tcf2__ensNotifyBanner|tcf2__ensModalWrapper)$/],
    preferenceScopeSelector: "#ensNotifyBanner, #ensModalWrapper, #tcf2__ensNotifyBanner, #tcf2__ensModalWrapper",
    evidenceTreatment: "cmp_infrastructure", role: "consent management platform",
    interactionDocumentationUrls: ["https://academy.ensighten.com/hc/en-us/articles/22832165668241-Enforce-Training-Course-Overview"],
  },
  {
    // FC-Moto's reviewed self-hosted app is CCM19, not a Tracking Garden CMP.
    // No generic CCM global, /app.js path, cookie or tracking-domain alias.
    canonicalName: "CCM19", aliases: ["CCM19 Cookie Consent Manager"], domains: [],
    domSelectors: [".ccm-root", "#ccm-widget"],
    domMarkerPatterns: [/^(?:\.ccm-root|#ccm-widget)$/],
    preferenceScopeSelector: ".ccm-root",
    urlPatterns: [/^https:\/\/www\.fc-moto\.com\/rp\/cb\/app\.js(?:\?[^#]*)?$/],
    evidenceTreatment: "cmp_infrastructure", role: "consent management platform",
    interactionDocumentationUrls: ["https://www.ccm19.de/en/knowledge/api", "https://www.ccm19.de/faq/kann-ich-das-einstellungs-icon-unten-links-entfernen.html"],
  },
  {
    preferenceScopeSelector: '.ax-website-overlay, [data-testid="widget-container"]:has(#axeptio_btn_close[aria-label="Close cookie settings"]):not(.ax-website-overlay *)',
    preferenceDialogBinding: { version: "axeptio_preferences.v1", openingBudgetMs: 3_000,
      controlSelector: '#axeptio_main_button[title="Manage your preferences about cookies"]',
      dialogSelector: '.ax-website-overlay [data-testid="widget-container"]',
      deferredRootSelector: '.ax-website-overlay', allowObservedOptionsLabel: true },
    preferenceCategoryInventory: { version: "axeptio_preference_services.v1", kind: "service",
      dialogSelector: '.axeptio_widget', categorySelector: 'li:has(> div > a[aria-label][href])',
      titleSelector: 'label > div > span[dir="auto"]:first-child', toggleSelector: 'label input[type="checkbox"]',
      serviceLinkSelector: 'a[aria-label][href]', serviceLinkLabelSuffix: ': More information about this cookie' },
    canonicalName: "Axeptio", aliases: ["Axeptio CMP"],
    domains: ["axept.io", "axeptio.eu"],
    cookieNames: ["axeptio_cookies", "axeptio_all_vendors", "axeptio_authorized_vendors"],
    domSelectors: ["#axeptio_btn_close", "#axeptio_main_button"],
    globalNames: ["axeptioSettings", "axeptioSDK"],
    urlPatterns: [/^https:\/\/(?:static|client|api)\.axept\.io\//i],
    evidenceTreatment: "cmp_infrastructure", role: "consent management platform",
    standards: ["google_consent_mode"],
    initialOptionalOffCloseObservation: {
      recipe: "axeptio.initial_optional_off_close.v1",
      submitSelector: '#axeptio_btn_close[aria-label="Close cookie settings"]',
      categoryContainerSelector: '[data-testid="widget-container"]',
      widgetSelector: '#axeptio_main_button[aria-label="Close the widget without accepting cookie settings"]',
      acceptSelector: "#axeptio_btn_acceptAllAndNext", nextSelector: "#axeptio_btn_next",
      // Non-interactive consent-record metadata is not an optional category.
      // Hidden checkbox choices and unrelated fields remain in the inspection.
      inputSelector: 'input:not(#axeptio_consent_checkbox):not([type="hidden"][name^="axeptio_cookies_"][name$="_value"]),select,textarea,[role="switch"]',
    },
    // Passive all-off recognition does not authorize a Close action. Registration
    // requires its own separately verified action recipe and semantic witness.
    interactionDocumentationUrls: ["https://support.axeptio.eu/en/articles/274085-does-axeptio-place-cookies"],
  },
  {
    canonicalName: "DataGrail", aliases: ["DataGrail Consent"],
    domains: ["consentjs.datagrail.io"], domSelectors: [".dg-consent-banner"],
    globalNames: ["DG_BANNER_API"],
    preferenceCategoryInventory: {
      version: "datagrail_preference_categories.v1", dialogSelector: '.dg-app[role="dialog"]',
      categorySelector: ".dg-main-content-policy-option",
      titleSelector: ".dg-main-content-policy-option-heading strong",
      toggleSelector: '.dg-main-content-policy-option-input input[type="checkbox"]',
    },
    evidenceTreatment: "cmp_infrastructure", role: "consent management platform",
    preferenceDialogBinding: {
      version: "datagrail_preferences.v1", controlSelector: "button.dg-button.open_layer",
      dialogSelector: '.dg-consent-banner .dg-app[role="dialog"]',
      layerTransitionSelector: ".dg-main-content-policies",
    },
    interactionDocumentationUrls: ["https://docs.datagrail.io/docs/consent/banner/css-customization/", "https://docs.datagrail.io/docs/consent/banner/layouts-overview/"],
  },
  {
    canonicalName: "Anthropic first-party preferences", aliases: [], domains: [],
    evidenceTreatment: "cmp_infrastructure", role: "consent management platform", standards: [],
    // The public cookie-policy link binds these otherwise generic IDs to the
    // vendor's actual panel. This scope is exclusive to preference inspection.
    preferenceScopeSelector: 'dialog#consent-container:has(#consent-description a[href="https://www.anthropic.com/legal/cookies"])',
    preferenceDialogBinding: { version: "anthropic_preferences.v1",
      controlSelector: '#customize-btn', dialogSelector: 'dialog#consent-container #detailed-options' },
    preferenceCategoryInventory: { version: "anthropic_preference_categories.v1",
      dialogSelector: '#detailed-options', categorySelector: '#consent-form > div',
      titleSelector: 'h6', toggleSelector: 'input[type="checkbox"]' },
    interactionDocumentationUrls: ["https://www.anthropic.com/legal/cookies"],
  },
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
    acceptConfirmation: {
      kind: "canonical_first_layer_ui_transition",
      bannerSelector: "#cos-banner",
      controlSelector: "#cos-banner span.a-button:has(#sp-cc-accept)",
    },
    acceptControlSelectors: ["#cos-banner span.a-button:has(#sp-cc-accept)"],
    aliases: [
      "Amazon Privacy Preferences",
      "Amazon Cookies and Advertising Choices",
      "Cookies and Advertising Choices"
    ],
    canonicalName: "Amazon Privacy Preferences",
    domains: [],
    domSelectors: ["#cos-banner"],
    evidenceTreatment: "cmp_infrastructure",
    recipeVersion: "v1",
    reopenControlHints: ["amazon privacy preferences", "cookies and advertising choices", "cookie notice"],
    rejectConfirmation: {
      kind: "canonical_first_layer_ui_transition",
      bannerSelector: "#cos-banner",
      controlSelector: "#cos-banner span.a-button:has(#sp-cc-rejectall-link)",
    },
    rejectControlSelectors: ["#cos-banner span.a-button:has(#sp-cc-rejectall-link)"],
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
    configuredConsentCookiePath: "drupalSettings.eu_cookie_compliance.cookie_name",
    recipeVersion: "v2",
    acceptControlSelectors: ["#sliding-popup .agree-button"],
    rejectControlSelectors: ["#sliding-popup .decline-button", "#sliding-popup .eu-cookie-compliance-reject-button"],
    acceptConfirmation: { kind: "cmp_api_consent_state_changed", provider: "drupal_eu_cookie" },
    rejectConfirmation: { kind: "cmp_api_consent_state_changed", provider: "drupal_eu_cookie" },
    interactionDocumentationUrls: ["https://ftp.drupal.org/files/projects/eu_cookie_compliance-8.x-1.24.tar.gz"],
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
    observationControlRecipes: [{recipeId:"onetrust.notice_continue.v1",controlSelector:"#onetrust-accept-btn-handler",containerSelectors:["#onetrust-button-group","#onetrust-banner-sdk"]}],
    saleSharingOptOut: { version: "onetrust.explicit_sale_share.v2", entranceSelector: "button.ot-sdk-show-settings", dialogSelector: "#onetrust-pc-sdk",
      settingsEntrances: [
        { version: "onetrust.readcube_settings.v1", originalTargetUrl: "https://readcube.com/", actionTargetUrl: "https://about.readcube.com/",
          buttonSelector: "button#onetrust-pc-btn-handler", labels: ["cookies settings", "cookies settings, opens the preference center dialog"] },
        { version: "onetrust.gimbal_settings.v2", originalTargetUrl: "https://gimbal.com/", actionTargetUrl: "https://infillion.com/",
          buttonSelector: "button#onetrust-pc-btn-handler", anchorSelector: "a#ot-sdk-btn.ot-sdk-show-settings",
          labels: ["cookie settings", "cookie settings, opens preference center dialog", "cookie settings, opens the preference center dialog"] },
      ],
      entranceLabels: ["your privacy choices", "privacy choices", "do not sell or share my personal information", "do not sell or share", "do not sell my personal information"],
      submitSelector: "button.save-preference-btn-handler.onetrust-close-btn-handler", submitLabels: ["do not sell or share my personal information", "do not sell or share", "do not sell my personal information"],
      documentationUrls: ["https://developer.onetrust.com/onetrust/docs/common-custom-css", "https://developer.onetrust.com/onetrust/docs/single-page-applications", "https://developer.onetrust.com/onetrust/reference/publishscripttosite", "https://developer.onetrust.com/onetrust/docs/iab-ccpa-us-privacy-string"] },
    preferenceDialogBinding: { version: "onetrust_preferences.v3", allowPrivacyOptOutEntrance: true, controlSelector: "#onetrust-pc-btn-handler, #ot-sdk-btn.ot-sdk-show-settings", dialogSelector: "#onetrust-pc-sdk", deferredRootSelector: "#onetrust-consent-sdk" },
    rejectLabelBoundNecessaryOnly: {
      policyVersion: "label_bound_necessary_only_reject.v2",
      bannerSelector: "#onetrust-banner-sdk",
      controlSelector: "#onetrust-reject-all-handler",
      expectedNormalizedLabels: [...NAMED_NECESSARY_ONLY_REJECT_LABELS["label_bound_necessary_only_reject.v2"]],
    },
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
    passiveConfigurationApi: "OneTrust.GetDomainData",
    passiveInitializationRequests: {
      version: "onetrust_initialization_requests.v1",
      endpoints: [
        { origin: "https://cdn.cookielaw.org", path: /^\/consent\/[a-f0-9-]{36}\/(?:otSDKStub\.js|[A-Za-z0-9-]{2,40}\.json)$/, resourceTypes: ["script", "xhr", "fetch"] },
        { origin: "https://cdn.cookielaw.org", path: /^\/scripttemplates\/(?:(?:new|old)\/scripttemplates\/)?(?:otSDKStub\.js|[A-Za-z0-9._-]{1,40}\/(?:otBannerSdk\.js|sri-hashes\.json))$/, resourceTypes: ["script", "xhr", "fetch"] },
        { origin: "https://geolocation.onetrust.com", path: /^\/cookieconsentpub\/v1\/geo\/location(?:\/dnsfeed)?$/, resourceTypes: ["xhr", "fetch"] },
      ],
    },
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
    preferenceScopeSelector: "#truste-consent-track",
    preferencePortalBinding: { version: "trustarc_preferences_portal.v2", kind: "trustarc_portal", rootSelector: "#truste-consent-track", controlSelector: "#truste-show-consent",
      panelSelector: '.truste_box_overlay_inner[role="dialog"]', contentReadySelector: '.gdprAccessiblePrefPanel', shadowContentSelector: 'div[name="trustarc_cm"].trustarc_newcm_container.truste_popframe', sdkPath: ["truste", "eu"] },
    preferenceCategoryInventory: { version: "trustarc_radio_categories.v1", dialogSelector: ".gdprAccessiblePrefPanel", categorySelector: ".categoryPanelAccessible",
      titleSelector: ".accessibleCategoryHeadingName h2", toggleSelector: '[role="radiogroup"].accessibleSwitch', radioGroupSelector: '[role="radiogroup"].accessibleSwitch' },
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
    passiveLoadedInventory: {
      version: "consentmanager_passive_loaded_inventory.v1",
      rootSelector: "#cmpbox",
      panelSelector: ".cmpcookiesdescrbox table.cmpcookietbl",
    },
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
    passivePrivacyLinkInspection: "same_origin_after_visual.v1",
    passiveLoadedInventory: { version: "cookiebot_passive_loaded_inventory.v1", rootSelector: "#CybotCookiebotDialog", panelSelector: "#CybotCookiebotDialogTabContentDetails" },
    preferenceDialogBinding: {version: "cookiebot_customize_tab.v1", controlSelector: "#CybotCookiebotDialogBodyLevelButtonCustomize",
      dialogSelector: '#CybotCookiebotDialog #CybotCookiebotDialogTabContentDetails[role="tabpanel"]', deferredRootSelector: "#CybotCookiebotDialog",
      dialogRoles: ["tabpanel"], tabSelector: "#CybotCookiebotDialogNavDetails"},
    preferenceDeferredAriaBinding: { version: "cookiebot_aria_preferences.v1", rootSelector: "#CybotCookiebotDialog" },
    preferenceCategoryInventory: {
      version: "cookiebot_inline_categories.v1",
      dialogSelector: '#CybotCookiebotDialog #CybotCookiebotDialogTabContentDetails[role="tabpanel"]',
      categorySelector: '.CybotCookiebotDialogDetailBodyContentCookieContainerHeader',
      titleSelector: '[id^="CybotCookiebotDialogBodyLevelButton"][id$="InlineLabel"][role="heading"]',
      toggleSelector: 'input[type="checkbox"][role="switch"][id^="CybotCookiebotDialogBodyLevelButton"][id$="Inline"]',
      visibleProxySelector: '.CybotCookiebotDialogBodyLevelButtonSlider',
    },
    preferenceLoadedInventory: {
      version: "cookiebot_loaded_declarations.v1",
      groupSelector: '.CybotCookiebotDialogDetailBodyContentCookieGroup',
      providerSelector: '.CybotCookiebotDialogDetailBodyContentCookieProvider',
      countSelector: '.CybotCookiebotDialogDetailBodyContentCookieInfoCount',
      recordSelector: '.CybotCookiebotDialogDetailBodyContentCookieInfo',
      nameSelector: '.CybotCookiebotDialogDetailBodyContentCookieInfoTitle',
      descriptionSelector: '.CybotCookiebotDialogDetailBodyContentCookieInfoDescription',
      footerSelector: '.CybotCookiebotDialogDetailBodyContentCookieInfoFooterContent',
    },
    observationControlRecipes: [{
      recipeId: "Cookiebot.options.v1",
      controlSelector: "#CybotCookiebotDialogBodyEdgeMoreDetailsLink",
      containerSelectors: ["#CybotCookiebotDialog", "#CybotCookiebotDialogTabContent", "#CybotCookiebotDialogBody"],
    }],
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
    preferenceInventory: "cookieyes_loaded_configuration.v1",
    preferenceCategoryInventory: {
      version: "cookieyes_preference_categories.v1",
      dialogSelector: '.cky-preference-center[data-cky-tag="detail"][role="dialog"]',
      categorySelector: '.cky-accordion',
      titleSelector: '[data-cky-tag="detail-category-title"]',
      toggleSelector: '[data-cky-tag="detail-category-toggle"] input[type="checkbox"][role="switch"]',
    },
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
    // This WordPress variant uses a span for Accept. The same id can also
    // reload or open preferences in other variants, so bind the reviewed
    // first-layer handler as well as the live canonical Accept label.
    acceptControlSelectors: ['#tarteaucitronAlertBig #tarteaucitronPersonalize[onclick="tarteaucitron.userInterface.respondAll(true);"]'],
    acceptConfirmation: {
      kind: "canonical_first_layer_ui_transition",
      bannerSelector: "#tarteaucitronAlertBig",
      controlSelector: '#tarteaucitronAlertBig #tarteaucitronPersonalize[onclick="tarteaucitron.userInterface.respondAll(true);"]',
    },
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
    interactionDocumentationUrls: ["https://plugins.svn.wordpress.org/dsgvo-all-in-one-for-wp/trunk/assets/js/tarteaucitron/tarteaucitron.min.js"],
    recipeVersion: "v1",
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
    acceptContextualApproval: {
      policyVersion: "registered_contextual_accept.v1",
      bannerSelector: ".bst-panel",
      expectedNormalizedLabel: "verstanden",
    },
    // The plugin's receipt (bst_dsgvo_cookie=1) means acknowledgment, not
    // consent granted. Only independently decoded state may confirm consent.
    acceptConfirmation: {
      kind: "canonical_first_layer_ui_transition",
      bannerSelector: ".bst-panel",
      controlSelector: ".bst-panel .bst-accept, .bst-panel .bst-accept-btn",
    },
    acceptControlSelectors: [".bst-panel .bst-accept", ".bst-panel .bst-accept-btn"],
    aliases: ["BST DSGVO Cookie", "bst-dsgvo-cookie"],
    canonicalName: "BST DSGVO Cookie notice plugin, non-TCF",
    cookieNames: ["bst_dsgvo_cookie"],
    domains: [],
    domSelectors: [".bst-panel", ".bst-popup-link"],
    evidenceTreatment: "cmp_infrastructure",
    interactionDocumentationUrls: [
      "https://plugins.svn.wordpress.org/bst-dsgvo-cookie/trunk/bst.php",
      "https://plugins.svn.wordpress.org/bst-dsgvo-cookie/trunk/includes/js/scripts.js",
    ],
    recipeVersion: "v2",
    role: "consent management platform",
    standards: [],
    urlPatterns: [
      /(?:^|\/)wp-content\/plugins\/bst-dsgvo-cookie(?:\/|[?#]|$)/i,
    ],
  },
  {
    aliases: ["Borlabs Cookie", "Borlabs Cookie CMP", "BorlabsCookie"],
    canonicalName: "Borlabs Cookie",
    preferenceInspection: {
      version: "borlabs_preferences.v1", kind: "borlabs_v3",
      entranceSelector: ".brlbs-cmpnt-dialog-box-entrance",
      controlSelector: "#CookieBoxPreferencesButton",
      dialogSelector: ".brlbs-cmpnt-dialog",
    },
    formExclusionSelectors: ["#BorlabsCookieBox", "[class*='brlbs-cmpnt-dialog']"],
    nonFirstLayerSurfaceSelectors: [".brlbs-cmpnt-content-blocker", "[data-borlabs-cookie-content-blocker]", "[data-borlabs-cookie-content-blocker-id]", "[data-borlabs-cookie-accept-service]"],
    acceptControlTargets: [{ scopeSelector: ".brlbs-cmpnt-dialog-box-entrance", resolution: "scoped_accessible_control" }],
    rejectControlTargets: [{ scopeSelector: ".brlbs-cmpnt-dialog-box-entrance", resolution: "scoped_accessible_control" }],
    acceptConfirmation: { kind: "cmp_api_consent_state_changed", provider: "borlabs" },
    rejectConfirmation: { kind: "cmp_api_consent_state_changed", provider: "borlabs" },
    recipeVersion: "v3-api-state-1",
    interactionDocumentationUrls: ["https://borlabs.io/docs/javascript-api-v3/"],
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
    acceptConfirmation: { kind: "cmp_api_consent_state_changed", provider: "didomi" },
    acceptControlSelectors: ["#didomi-notice-agree-button"],
    canonicalName: "Didomi",
    passiveServiceInventory: {version: "didomi_required_vendors.v1", rootSelector: "#didomi-host",
      noticeSelector: ".didomi-notice-banner, .didomi-notice-popup, #didomi-notice"},
    preferenceScopeSelector: "#didomi-host .didomi-notice-banner, #didomi-host .didomi-notice-popup, #didomi-host #didomi-notice",
    preferenceDialogBinding: { version: "didomi_preferences.v1", controlSelector: "#didomi-notice-learn-more-button", dialogSelector: "#didomi-consent-popup", deferredRootSelector: "#didomi-host" },
    cookieNames: ["didomi_token", "euconsent-v2"],
    domains: ["didomi.io", "sdk.privacy-center.org", "privacy-center.org"],
    domSelectors: ["#didomi-host"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["Didomi", "__tcfapi"],
    interactionDocumentationUrls: [
      "https://developers.didomi.io/cmp/web-sdk/reference/api",
      "https://developers.didomi.io/cmp/web-sdk/reference/events",
    ],
    reopenControlHints: ["didomi", "privacy choices"],
    rejectConfirmation: { kind: "cmp_api_consent_state_changed", provider: "didomi" },
    rejectControlSelectors: ["#didomi-notice-disagree-button"],
    recipeVersion: "v3",
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
      kind: "cmp_api_consent_state_changed",
      provider: "hubspot",
    },
    acceptControlSelectors: ["#hs-eu-confirmation-button"],
    canonicalName: "HubSpot Consent Banner",
    preferenceDialogBinding: { version: "hubspot_preferences.v2", allowExternalOptionsEntrance: true, controlSelector: "#hs-eu-cookie-settings-button", dialogSelector: "#hs-modal-content", deferredRootSelector: "#hs-banner-parent", dialogRoles: ["alertdialog"] },
    cookieNames: ["__hs_cookie_cat_pref", "__hs_opt_out", "__hs_do_not_track"],
    domains: ["js.hs-banner.com"],
    domSelectors: ["#hs-eu-cookie-confirmation"],
    evidenceTreatment: "cmp_infrastructure",
    interactionDocumentationUrls: [
      "https://developers.hubspot.com/docs/api-reference/latest/account/settings/consent-banner/consent-banner-api",
    ],
    reopenControlHints: ["cookie settings", "privacy settings"],
    rejectConfirmation: {
      kind: "cmp_api_consent_state_changed",
      provider: "hubspot",
    },
    rejectControlSelectors: ["#hs-eu-decline-button"],
    recipeVersion: "v2",
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
    passivePrivacyLinkInspection: "same_origin_after_visual.v1",
    passiveNetworkInventory:{version:"termly_cookie_response.v1",origin:"https://app.termly.io",scriptPathPrefix:"/resource-blocker/",responsePathPrefix:"/api/v1/snippets/websites/"},
    preferenceControlScopeSelector: '[data-termly-part="banner-actions"]',
    preferenceDeferredAriaBinding: { version: "termly_aria_preferences.v1", rootSelector: '[data-termly-part="consent-banner"]' },
    cookieNames: ["TERMLY_API_CACHE", "termly_gtm_template_default_consents"],
    domains: ["termly.io", "app.termly.io"],
    domSelectors: ['[data-termly-part="consent-banner"]', "[id*='termly' i]"],
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
    recipeVersion: "v2",
    role: "consent management platform",
    standards: ["gpc", "google_consent_mode"],
    urlPatterns: [/termly/i]
  },
  {
    aliases: ["Osano CMP"],
    canonicalName: "Osano",
    preferenceDialogBinding: { version: "osano_preferences.v2",
      controlSelector: ".osano-cm-dialog .osano-cm-button--type_manage, .osano-cm-window button.osano-cm-window__widget",
      dialogSelector: ".osano-cm-window .osano-cm-info-dialog", deferredRootSelector: ".osano-cm-window", allowObservedOptionsLabel: true },
    acceptConfirmation: {
      kind: "cmp_api_consent_state_changed",
      provider: "osano",
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
      kind: "cmp_api_consent_state_changed",
      provider: "osano",
    },
    rejectControlSelectors: [".osano-cm-deny-all"],
    recipeVersion: "v2",
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
    // Official getBanner() binds the legacy banner or the UI-v2 shadow host.
    // Broad product/marketing classes identify the SDK, not an actionable CMP.
    preferenceScopeSelector: "#iubenda-cs-banner, tb-banner-wrapper",
    preferencePortalBinding: { version: "iubenda_preferences_portal.v1", kind: "iubenda_portal", rootSelector: "tb-banner-wrapper", controlSelector: "button.tb-banner-tab-button.inactive",
      panelSelector: '#iubenda-iframe > #iubenda-iframe-popup[role="alertdialog"]', contentReadySelector: "#purposes-content-container .purposes-body", sdkPath: ["_iub", "cs"] },
    preferenceCategoryInventory: { version: "iubenda_purpose_categories.v1", dialogSelector: "#purposes-content-container",
      categorySelector: ".purposes-item", titleSelector: ".purposes-item-title label", toggleSelector: '.purposes-checkbox input[type="checkbox"]' },
    cookieNames: ["_iub_cs"],
    // Official manual-tagging guidance names site-ID and cookie-policy-ID cookies.
    // Keep matching bounded to numeric IDs; unrelated _iub names stay excluded.
    cookieNameVariants: [{canonicalName: "_iub_cs", pattern: /^_iub_cs-(?:s)?[0-9]{1,16}$/i}],
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
    canonicalName: "Finsweet Consent Pro",
    aliases: ["Finsweet Cookie Consent"],
    cookieNames: ["fs-consent"], domains: ["consentpro.com"],
    domSelectors: ['[fs-consent-element="banner"]'],
    domMarkerPatterns: [/\[fs-consent-element\s*=\s*["']banner["']\]/i],
    globalNames: ["FinsweetConsentPro"], evidenceTreatment: "cmp_infrastructure",
    role: "consent management platform", recipeVersion: "v1",
    interactionDocumentationUrls: ["https://docs.consentpro.com/runtime/api", "https://docs.consentpro.com/runtime/attributes"],
    rejectConfirmation: {kind: "cmp_api_consent_state_changed", provider: "finsweet"},
  },
  {
    canonicalName: "CookieScript", aliases: ["Cookie-Script"],
    cookieNames: ["CookieScriptConsent"], domains: ["cookie-script.com"],
    domSelectors: ["#cookiescript_injected"], globalNames: ["CookieScript"],
    evidenceTreatment: "cmp_infrastructure", role: "consent management platform", recipeVersion: "v1",
    interactionDocumentationUrls: ["https://help.cookie-script.com/en/articles/30246-custom-functions", "https://help.cookie-script.com/en/articles/30242-custom-events"],
    rejectConfirmation: {kind: "cmp_api_consent_state_changed", provider: "cookiescript"},
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
    recipeVersion: "v2",
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
    if ((definition.cookieNameVariants ?? []).some(variant => textMatches(cookieName, variant.pattern)) || (definition.cookieNames ?? []).some((knownName) => {
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
    if (definition.domMarkerPatterns
      ? definition.domMarkerPatterns.some(pattern => textMatches(selector, pattern))
      : (definition.domSelectors ?? []).some((knownSelector) => {
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

/** Exact retained selector binding, not a guessed label or site-specific fallback. */
export function knownCmpObservationRecipe(controlSelector: string, containerSelector: string | undefined): string | undefined {
  if (!containerSelector) return undefined;
  for (const cmp of KNOWN_CMP_REGISTRY) {
    const recipe = cmp.observationControlRecipes?.find((entry) => entry.controlSelector === controlSelector && entry.containerSelectors.includes(containerSelector));
    if (recipe) return recipe.recipeId;
  }
  return undefined;
}

/** Canonical variant identity, independent of semantic consent registration. */
export function matchesKnownCmpCookieVariant(actualName: string, canonicalName: string) {
  return KNOWN_CMP_REGISTRY.some(definition => definition.cookieNameVariants?.some(variant =>
    variant.canonicalName === canonicalName && textMatches(actualName, variant.pattern)));
}
