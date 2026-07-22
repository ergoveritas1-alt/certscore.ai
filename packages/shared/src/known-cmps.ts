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

export type KnownCmpDefinition = {
  aliases: string[];
  canonicalName: string;
  cookieNames?: string[];
  domains: string[];
  domSelectors?: string[];
  evidenceTreatment: KnownCmpEvidenceTreatment;
  globalNames?: string[];
  iframePatterns?: RegExp[];
  reopenControlHints?: string[];
  role: "consent management platform";
  standards?: KnownCmpStandard[];
  storageKeys?: string[];
  urlPatterns?: RegExp[];
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
    aliases: ["CookiePro", "Optanon", "OptanonConsent", "OptanonAlertBoxClosed"],
    canonicalName: "OneTrust",
    cookieNames: ["OptanonConsent", "OptanonAlertBoxClosed"],
    domains: ["onetrust.com", "onetrust.io", "cookielaw.org", "cdn.cookielaw.org", "cookiepro.com", "cookie-cdn.cookiepro.com", "geolocation.onetrust.com", "optanon.blob.core.windows.net", "cookies-data.onetrust.io"],
    domSelectors: ["#onetrust-banner-sdk", "#onetrust-consent-sdk", "#ot-sdk-btn", ".ot-sdk-container"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["OneTrust", "Optanon", "OptanonWrapper"],
    reopenControlHints: ["cookie settings", "privacy choices", "do not sell or share", "onetrust"],
    role: "consent management platform",
    standards: ["tcf", "gpp", "usp", "gpc", "google_consent_mode"],
    storageKeys: ["OptanonConsent", "OptanonAlertBoxClosed"],
    urlPatterns: [/otSDKStub\.js/i, /optanon/i, /(?:^|\/)cdn\.cookielaw\.org(?:\/|$)/i]
  },
  {
    aliases: ["TRUSTe", "TrustArc Preference Manager"],
    canonicalName: "TrustArc",
    cookieNames: ["notice_behavior", "TAsessionID", "notice_preferences", "notice_gdpr_prefs"],
    domains: ["trustarc.com", "truste.com", "consent.trustarc.com", "form-renderer.trustarc.com", "privacy-policy.truste.com", "preferences.trustarc.com"],
    domSelectors: ["#truste-consent-track", "[id*='truste' i]", "[id*='trustarc' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["truste", "TrustArc"],
    reopenControlHints: ["trustarc", "privacy preferences", "cookie preferences"],
    role: "consent management platform",
    standards: ["tcf", "gpp", "usp", "gpc"],
    urlPatterns: [/trustarc/i, /truste/i]
  },
  {
    aliases: ["Usercentrics CMP", "Usercentrics Consent Management"],
    canonicalName: "Usercentrics",
    cookieNames: ["uc_settings", "ucString", "usercentrics"],
    domains: ["usercentrics.com", "usercentrics.eu", "app.usercentrics.eu", "api.usercentrics.eu", "aggregator.service.usercentrics.eu", "consent-api.service.consent.usercentrics.eu"],
    domSelectors: ["#usercentrics-root", "[data-testid*='uc-' i]", "[id*='usercentrics' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["UC_UI", "UC_UI_SUPPRESS_CMP_DISPLAY", "usercentrics"],
    reopenControlHints: ["usercentrics", "privacy settings", "cookie settings"],
    role: "consent management platform",
    standards: ["tcf", "gpp", "google_consent_mode"],
    storageKeys: ["uc_settings", "ucString", "uc_user_interaction"],
    urlPatterns: [/usercentrics/i]
  },
  {
    aliases: ["Consentmanager CMP", "consentmanager.net", "consentmanager.de", "ConsentManager"],
    canonicalName: "Consentmanager",
    cookieNames: ["__cmpconsent*", "__cmpconsents*", "__cmpconsentx*", "__cmpcc", "__cmpcpc", "__cmpcvc", "__cmpiab"],
    domains: ["consentmanager.net", "consentmanager.de", "cdn.consentmanager.net", "delivery.consentmanager.net"],
    domSelectors: ["#cmpbox", "#cmpboxrecall", "[id*='cmpbox' i]", "[class*='cmpbox' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["__cmp", "__cmpapi", "__tcfapi", "cmp_data", "cmp_config"],
    reopenControlHints: ["consentmanager", "privacy settings", "cookie settings", "privacy preferences"],
    role: "consent management platform",
    standards: ["tcf", "gpp", "usp", "gpc", "google_consent_mode"],
    storageKeys: ["__cmpconsent*", "__cmpconsents*", "__cmpconsentx*", "__cmpcc", "__cmpcpc", "__cmpcvc", "__cmpiab"],
    urlPatterns: [/consentmanager/i, /cdn\.consentmanager\.net\/(?:delivery|cmp|choice|consent)/i, /semiautomatic\.min\.js/i]
  },
  {
    aliases: ["Cybot", "Cookiebot by Usercentrics"],
    canonicalName: "Cookiebot",
    cookieNames: ["CookieConsent", "CookieConsentBulkTicket"],
    domains: ["cookiebot.com", "consent.cookiebot.com", "cookiebot.eu", "consent.cookiebot.eu", "consentcdn.cookiebot.eu"],
    domSelectors: ["#CybotCookiebotDialog", "#CookiebotWidget"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["Cookiebot", "CookieConsent"],
    reopenControlHints: ["cookiebot", "cookie declaration", "change your consent"],
    role: "consent management platform",
    standards: ["tcf", "gpp", "google_consent_mode"],
    urlPatterns: [/cookiebot/i]
  },
  {
    aliases: ["CookieYes CMP", "CookieYes Consent", "GDPR Cookie Consent plugin", "Cookie Law Info"],
    canonicalName: "CookieYes",
    cookieNames: ["cookieyes-consent", "cookielawinfo-checkbox-*", "viewed_cookie_policy"],
    domains: ["cookieyes.com", "cdn-cookieyes.com", "log.cookieyes.com"],
    domSelectors: ["[id*='cookieyes' i]", "[class*='cky-' i]", "#cookie-law-info-bar", "[class*='cli-' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["CookieYes", "ckyConsent"],
    reopenControlHints: ["cookieyes", "cookie settings"],
    role: "consent management platform",
    standards: ["gpc", "google_consent_mode"],
    storageKeys: ["cookieyes-consent", "cookielawinfo-checkbox-*", "viewed_cookie_policy"],
    urlPatterns: [/cookieyes/i, /\bcky-/i, /cookie-law-info/i, /cookielawinfo/i]
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
    canonicalName: "Sourcepoint",
    cookieNames: ["_sp_su", "_sp_v1_*", "_sp_user_consent", "_sp_user_consent_*", "_sp_local_state", "_sp_non_keyed_local_state", "_sp_enable_dfp_personalized_ads", "sp_choice"],
    domains: ["privacy-mgmt.com", "cdn.privacy-mgmt.com", "sourcepoint.mgr.consensu.org", "cmp-cdn.privacy-mgmt.com"],
    domSelectors: ["[id*='sp_message_container' i]", "iframe[id*='sp_message_iframe' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["__tcfapi", "_sp_"],
    reopenControlHints: ["sourcepoint", "privacy manager"],
    role: "consent management platform",
    standards: ["tcf", "gpp", "usp"],
    storageKeys: ["_sp_su", "_sp_v1_*", "_sp_user_consent", "_sp_user_consent_*", "_sp_local_state", "_sp_non_keyed_local_state", "_sp_enable_dfp_personalized_ads", "sp_choice"],
    urlPatterns: [/privacy-mgmt/i, /sourcepoint/i, /sp_message/i]
  },
  {
    aliases: ["Didomi CMP"],
    canonicalName: "Didomi",
    cookieNames: ["didomi_token", "euconsent-v2"],
    domains: ["didomi.io", "sdk.privacy-center.org", "privacy-center.org"],
    domSelectors: ["#didomi-host", "[id*='didomi' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["Didomi", "__tcfapi"],
    reopenControlHints: ["didomi", "privacy choices"],
    role: "consent management platform",
    standards: ["tcf", "gpp", "google_consent_mode"],
    urlPatterns: [/didomi/i]
  },
  {
    aliases: ["Quantcast CMP", "Quantcast Choice"],
    canonicalName: "Quantcast Choice",
    cookieNames: ["euconsent-v2", "qcConsent"],
    domains: ["quantcast.mgr.consensu.org", "mgr.consensu.org"],
    domSelectors: ["#qc-cmp2-ui", "[id*='qc-cmp' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["__tcfapi", "QCChoice"],
    reopenControlHints: ["quantcast", "privacy manager"],
    role: "consent management platform",
    standards: ["tcf"],
    urlPatterns: [/qc-cmp/i, /quantcast\.mgr\.consensu\.org/i]
  },
  {
    aliases: ["Seznam CMP", "Seznam Consent", "Seznam TCF CMP"],
    canonicalName: "Seznam CMP",
    cookieNames: ["sznlbr", "euconsent-v2"],
    domains: ["cmp.seznam.cz", "cmp.seznamzpravy.cz"],
    domSelectors: ["[id*='seznam-cmp' i]", "[class*='seznam-cmp' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["__tcfapi"],
    reopenControlHints: ["nastavit souhlas", "nastavit cookies", "seznam cmp"],
    role: "consent management platform",
    standards: ["tcf"],
    storageKeys: ["sznlbr", "euconsent-v2"],
    urlPatterns: [/cmp\.seznam(?:zpravy)?\.cz/i, /seznam.*cmp/i]
  },
  {
    aliases: ["Funding Choices", "Google Consent Management Solutions"],
    canonicalName: "Google Funding Choices",
    cookieNames: ["FCCDCF", "FCNEC"],
    domains: ["fundingchoicesmessages.google.com"],
    domSelectors: ["[id*='fundingchoices' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["googlefc"],
    reopenControlHints: ["privacy and messaging", "funding choices"],
    role: "consent management platform",
    standards: ["tcf", "google_consent_mode"],
    urlPatterns: [/fundingchoicesmessages\.google\.com/i, /googlefc/i]
  },
  {
    aliases: ["Termly CMP"],
    canonicalName: "Termly",
    cookieNames: ["TERMLY_API_CACHE", "termly_gtm_template_default_consents"],
    domains: ["termly.io", "app.termly.io"],
    domSelectors: ["[id*='termly' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["Termly"],
    reopenControlHints: ["termly", "consent preferences"],
    role: "consent management platform",
    standards: ["gpc", "google_consent_mode"],
    urlPatterns: [/termly/i]
  },
  {
    aliases: ["Osano CMP"],
    canonicalName: "Osano",
    cookieNames: ["osano_consentmanager", "osano_consentmanager_uuid"],
    domains: ["osano.com", "cmp.osano.com", "disclosure.api.osano.com"],
    domSelectors: [".osano-cm-window", "[class*='osano-cm' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["Osano"],
    reopenControlHints: ["osano", "cookie preferences"],
    role: "consent management platform",
    standards: ["gpc"],
    urlPatterns: [/osano/i]
  },
  {
    aliases: ["Iubenda CMP"],
    canonicalName: "Iubenda",
    cookieNames: ["_iub_cs"],
    domains: ["iubenda.com", "cdn.iubenda.com", "cs.iubenda.com"],
    domSelectors: ["[id*='iubenda' i]", "[class*='iubenda' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["_iub", "iubenda"],
    reopenControlHints: ["iubenda", "privacy preferences"],
    role: "consent management platform",
    standards: ["tcf", "gpp"],
    urlPatterns: [/iubenda/i]
  },
  {
    aliases: ["Cookie Information CMP"],
    canonicalName: "Cookie Information",
    cookieNames: ["CookieInformationConsent"],
    domains: ["cookieinformation.com", "app.cookieinformation.com"],
    domSelectors: ["#coiOverlay", "[id*='cookie-information' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["CookieInformation"],
    reopenControlHints: ["cookie information", "cookie settings"],
    role: "consent management platform",
    standards: ["tcf", "google_consent_mode"],
    urlPatterns: [/cookieinformation/i]
  },
  {
    aliases: ["InMobi Choice", "InMobi CMP", "Choice CMP"],
    canonicalName: "InMobi Choice",
    cookieNames: ["euconsent-v2"],
    domains: ["cmp.inmobi.com"],
    domSelectors: ["[id*='inmobi-cmp' i]", "[class*='inmobi-cmp' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["__tcfapi"],
    reopenControlHints: ["privacy choices", "consent choices"],
    role: "consent management platform",
    standards: ["tcf"],
    storageKeys: ["euconsent-v2"],
    urlPatterns: [/cmp\.inmobi\.com\/(?:choice|geoip|vendor-list|tcfv2)/i]
  },
  {
    aliases: ["Ketch CMP", "Ketch Consent Management"],
    canonicalName: "Ketch",
    cookieNames: ["ketch_consent"],
    domains: ["ketch.com", "ketchcdn.com", "cdn.ketchjs.com"],
    domSelectors: ["#ketch-banner", "[class*='ketch-consent' i]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["Ketch", "ketch"],
    reopenControlHints: ["privacy choices", "privacy preferences", "ketch"],
    role: "consent management platform",
    standards: ["tcf", "gpp", "gpc"],
    storageKeys: ["ketch_consent"],
    urlPatterns: [/cdn\.ketchjs\.com\/(?:ketchtag\/stable\/v\d+(?:\.\d+)*\/ketch-sdk\.js|plugins\/v\d+\/tcf\/stub\.js|web\/v\d+\/ketch\.js|tcf\/v\d+\/stub\.js|ketch\.js)/i]
  },
  {
    aliases: ["Transcend Consent", "Transcend Consent Management", "Airgap"],
    canonicalName: "Transcend",
    cookieNames: ["transcend-consent", "airgap"],
    domains: ["transcend.io", "transcend-cdn.com", "privacy-center-api.transcend.io"],
    domSelectors: ["[id*='transcend' i]", "[data-transcend-consent]"],
    evidenceTreatment: "cmp_infrastructure",
    globalNames: ["airgap", "transcend"],
    reopenControlHints: ["transcend", "privacy center", "privacy choices"],
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

const GENERIC_SELECTOR_TOKENS = new Set(["aria", "class", "data", "dialog", "iframe", "role", "testid"]);
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
    if ([definition.canonicalName, ...definition.aliases].some((knownName) => text.toLowerCase().includes(knownName.toLowerCase())) || (definition.urlPatterns ?? []).some((pattern) => textMatches(text, pattern))) {
      push("text", text);
    }
  }

  return signals;
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
