import { resolveCanonicalCookieKnowledge } from "@certscore/vendor-resolver";
import { getDomain as getTldtsDomain, getHostname as getTldtsHostname } from "tldts";
import {
  findRuntimeCookieOwner,
  findRuntimeEntityOwner,
  findRuntimeVendorLabelOwner
} from "./runtime-vendor-ownership";

export type RuntimeCookieEvidenceRow = {
  category: string;
  cookieName: string;
  cookiePath?: string;
  partitionContext?: string;
  observationCount?: number;
  classificationConflicts?: string[];
  evidenceRefs?: string[];
  dataTypes?: string[];
  description?: string;
  domain: string | null;
  expiresAt?: string | null;
  firstObservedAtMs: number | null;
  initiatorDomain: string | null;
  initiatorUrl: string | null;
  initiatorVendor: string | null;
  initiatorChain?: string[];
  lifespanSeconds?: number | null;
  lifespanSource?: string | null;
  longLived?: boolean;
  nonEssential: boolean;
  observedBeforeConsent?: boolean;
  explicitPreconsentEvidence?: boolean;
  essentiality?: "essential" | "non_essential" | "unknown";
  essentialityConfidence?: number | null;
  essentialityReasonCodes?: string[];
  essentialitySource?:
    | "canonical_registry"
    | "deterministic_classifier"
    | "retained_explicit_classification"
    | "unknown";
  party: "first_party" | "third_party" | "unknown";
  responseUrl: string | null;
  sourceRequestUrl: string | null;
  setAtMs: number | null;
  setByThirdPartyScript?: boolean;
  setterScriptUrl?: string | null;
  setMethod: string | null;
  timingBasis: string | null;
  evidenceGrade: string | null;
  timingEvidence: "before_consent_cookie_write" | "initial_cookie_snapshot" | "periodic_cookie_snapshot" | "unknown";
};

export type PreConsentStorageAssessmentStatus =
  | "classified_nonessential_observed"
  | "classified_zero"
  | "partially_classified"
  | "snapshot_presence_only"
  | "insufficient_evidence";

export type PreConsentStorageReconciliationStatus =
  | "reconciled"
  | "aggregate_exceeds_attributed_rows"
  | "row_count_exceeds_aggregate"
  | "aggregate_unavailable";

export type PreConsentStorageAssessmentEvidenceRow = {
  category: string;
  domain: string | null;
  essentiality: "essential" | "non_essential" | "unknown";
  essentialitySource:
    | "canonical_registry"
    | "deterministic_classifier"
    | "retained_explicit_classification"
    | "unknown";
  exclusionReason: string | null;
  firstObservedMs: number | null;
  initiatorDomain: string | null;
  initiatorVendor: string | null;
  name: string;
  party: "first_party" | "third_party" | "unknown";
  storageType: "cookie";
  timingEvidence:
    | "before_consent_write"
    | "periodic_preconsent_snapshot"
    | "initial_snapshot"
    | "unknown";
};

export type PreConsentStorageAssessment = {
  aggregateObservedCount: number | null;
  assessmentVersion: "pre-consent-storage-assessment-v1";
  attributedPreConsentRecordCount: number;
  classifiedEssentialCount: number;
  classifiedNonEssentialCount: number;
  excludedFunctionalOrConsentCount: number;
  evidenceRows: PreConsentStorageAssessmentEvidenceRow[];
  provenWriteCount: number;
  reconciliationStatus: PreConsentStorageReconciliationStatus;
  snapshotPresenceCount: number;
  status: PreConsentStorageAssessmentStatus;
  unclassifiedCount: number;
};

export type PreConsentStorageMetricProjection = {
  available: boolean;
  explanation: string;
  label: "Non-essential storage";
  scope: "nonessential_only";
  status: "measured_positive" | "measured_zero" | "partially_classified" | "unavailable";
  value: number | null;
};

export type PolicyCookieDisclosureRow = {
  category: string | null;
  cookieName: string | null;
  domain: string | null;
  provider: string | null;
  purpose: string | null;
};

export type CookieDisclosureGapEvidence = {
  cookie_policy_url?: string | null;
  disclosed_cookie_categories: string[];
  disclosed_cookie_names: string[];
  disclosed_cookie_providers: string[];
  matched_runtime_cookies: Array<RuntimeCookieEvidenceRow & { matchType: string }>;
  runtime_cookie_categories: string[];
  runtime_cookie_names: string[];
  unmatched_cookie_categories: string[];
  unmatched_cookie_count: number;
  unmatched_cookie_names: string[];
  unmatched_cookie_vendors: string[];
  unmatched_runtime_cookies: RuntimeCookieEvidenceRow[];
  unmatched_third_party_cookie_count: number;
};

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function getObjectArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function getRecordNumber(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }
  return null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

export function classifyRuntimeCookieCategory(name: string, domain: string | null = null) {
  const normalized = `${name} ${domain ?? ""}`.toLowerCase();
  if (/^_sp_(?:id|ses)\./i.test(name)) {
    return "analytics";
  }
  if (/^(?:cookielawinfo-checkbox-|viewed_cookie_policy$)/i.test(name)) {
    return "consent_management";
  }
  if (isFunctionalCookieExcludedFromTrackingEvidence(name, domain)) {
    return "necessary";
  }
  if (/^(c_code|countrycode|statecode|geodata|geo_country|trp-country|trp-language)(\b|$)/i.test(normalized)) {
    return "geolocation";
  }
  if (/^(secgpc|usprivacy|uspapi|gpp|euconsent-v2)(\b|$)/i.test(normalized)) {
    return "privacy_preference";
  }
  if (/^(fastab|optimizely|optimizelyenduserid|optimizelysession|mbox|at_check)(\b|$)/i.test(normalized)) {
    return "experimentation";
  }
  if (/^wbdfch$/i.test(name)) {
    return "site_functionality";
  }
  if (/^_dd_s$/i.test(name)) {
    return "analytics";
  }
  if (/^fccdcf$/i.test(name)) {
    return "necessary";
  }
  if (/^_zitok$/i.test(name)) {
    return "analytics";
  }
  if (/^(?:ebEventToTrack|stableId)$/i.test(name)) {
    return "analytics";
  }
  if (/^wisepops(?:_(?:visitor|visits|session))?$/i.test(name)) {
    return "analytics";
  }
  if (/^AMP_MKTG_[A-Za-z0-9_-]+$/i.test(name)) {
    return "advertising";
  }
  if (/^AMP_(?!MKTG_)[A-Za-z0-9_-]+$/i.test(name)) {
    return "analytics";
  }
  if (/^ld_anonymous_user_key$/i.test(name)) {
    return "personalization";
  }
  // Meta's `fr` cookie is advertising evidence, but `.fr` is also a country
  // suffix. Match the cookie name only so every cookie on a French domain does
  // not inherit an advertising classification.
  if (/^fr$/i.test(name)) {
    return "advertising";
  }
  if (
    /(^_ga|^_gid|^_gat|^_ym_|^_ymab_param|ga_|goog|gtm|plausible|analytics|amplitude|segment|mixpanel|posthog|ajs_anonymous_id|ajs_user_id|analytics_session_id|heap|mp_|intercom-id|hubspotutk|__hstc|__hssc|(^|\b)s_ecid(\b|$)|(^|\b)s_sess(\b|$)|(^|\b)s_cc(\b|$)|(^|\b)s_dslv(\b|$)|(^|\b)sat_ppv(\b|$)|^_ali_s_|(^|\b)cna(\b|$)|(^|\b)sca(\b|$)|^yandex|^yuid|aliyun\.com|mmstat\.com|yandex\.(?:ru|com))/i.test(
      normalized
    )
  ) {
    return "analytics";
  }
  if (/(^|\b)aam(\b|$)|(^|\b)dpm(\b|$)|demdex|dpm\.demdex|audience[._-\s]?manager/i.test(normalized)) {
    return "dmp";
  }
  if (
    /(^_fbp|^_fbc|gcl_|ttclid|ttp|_twpid|li_sugr|bcookie|lidc|uuid2|xandr|adnxs|anusercookie|rtmark|infolinks|doubleclick|criteo|cto_bundle|media\.net|_mkto_trk|muid|amcvs?_|adobeorg|kndctr_.*adobeorg|mbox|mboxedgecluster|at_check|optimizely|_vwo|_vis_opt|guest_id_ads|guest_id_marketing|personalization_id|pubmatic|krtbcookie|pugt|spugt|bidswitch|tuuid|id5|casalemedia|cmid|cmps|cmpro|gumgum|3lift|tluid|sync\b|tapad|adsrvr|tdid|tdcpm|rubiconproject|openx|adform|bidr\.io|scorecardresearch|quantserve|crwdcntrl|panoramaid|_pubcid|lijit|mathtag|rlcdn|rlas3|pxrc|pippio|deepintent|amazon-adsystem|stackadapt|onaudience|(^|\b)ide(\b|$)|(^|\b)dextp(\b|$)|(^|\b)tvid(\b|$)|(^|\b)tv_uicr(\b|$)|(^|\b)uid(\b|$)|(^|\b)mc(\b|$)|receive-cookie-deprecation|sailthru|^yabs|sync_cookie_csrf|(^|\b)ftid(\b|$)|(^|\b)bh(\b|$)|ad-privacy|mail\.ru|adriver\.ru)/i.test(
      normalized
    )
  ) {
    return "advertising";
  }
  if (/(qsi_replaysession|qsi_historysession|qualtrics|siteintercept|hotjar|fullstory|clarity|contentsquare|mouseflow|fs_uid|hjSession|_hj)/i.test(normalized)) {
    return "session_replay";
  }
  if (
    /(cf_clearance|__cf|recaptcha|akamai|datadome|perimeterx|awsalb(?:tg|tgcors|app-\d+|cors)?|akaalb|usp-google|bm_sz|bm_sv|bm_mi|ak_bmsc|_abck|csrf|xsrf|phpsessid|jsessionid|(^|\b)sid($|\b)|(^|\b)session($|\b)|optanonconsent|optanonalertboxclosed|cookieyes-consent|didomi_token|geo_country|trp-country|trp-language)/i.test(
      normalized
    )
  ) {
    return "necessary";
  }
  return "unknown";
}

export function isFunctionalCookieExcludedFromTrackingEvidence(name: string | null | undefined, domain: string | null = null) {
  const normalized = `${name ?? ""} ${domain ?? ""}`.toLowerCase();
  return /(^|\b)(fccdcf|fcnec|optanonconsent|optanonalertboxclosed|cookieconsent|euconsent-v2|tcfv2|cmapi_cookie_privacy|notice_preferences|notice_gdpr_prefs|cookieyes-consent|cookielawinfo-checkbox-[a-z0-9_-]+|viewed_cookie_policy|didomi_token|geo_country|trp-country|trp-language|__cf_bm|_cfuvid|cf_clearance|bigipserver|awsalb(?:tg|tgcors|app-\d+|cors)?|akaalb|usp-google|bm_sz|bm_sv|bm_mi|ak_bmsc|_abck|csrf|xsrf|phpsessid|jsessionid)/.test(normalized) ||
    /(^|\b)(_sp_su|_sp_v1_[a-z0-9_-]+|_sp_user_consent(?:_[a-z0-9_-]+)?|_sp_local_state|_sp_non_keyed_local_state|_sp_enable_dfp_personalized_ads)(\b|$)/.test(normalized);
}

export function isNonEssentialCookieCategory(category: string | null | undefined) {
  const normalizedCategory = category?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return normalizedCategory === "analytics" ||
    normalizedCategory === "advertising" ||
    normalizedCategory === "dmp" ||
    normalizedCategory === "session_replay" ||
    normalizedCategory === "personalization" ||
    normalizedCategory === "marketing" ||
    normalizedCategory === "experimentation";
}

export function isEligibleNonEssentialPreconsentStorageRow(row: RuntimeCookieEvidenceRow) {
  return row.timingEvidence === "before_consent_cookie_write" &&
    row.nonEssential === true &&
    !isFunctionalCookieExcludedFromTrackingEvidence(row.cookieName, row.domain);
}

/**
 * Descriptive report metric: includes non-essential storage explicitly observed
 * during the pre-consent runtime, even when the retained artifact is a snapshot
 * rather than promotion-grade write evidence.
 */
export function isEligibleNonEssentialPreconsentStorageMetricRow(row: RuntimeCookieEvidenceRow) {
  const retainedPreConsentObservation =
    row.timingEvidence === "before_consent_cookie_write" ||
    (row.timingEvidence === "periodic_cookie_snapshot" && row.observedBeforeConsent === true);
  return retainedPreConsentObservation &&
    row.nonEssential === true &&
    !isFunctionalCookieExcludedFromTrackingEvidence(row.cookieName, row.domain);
}

export function countEligibleNonEssentialPreconsentStorageMetricRows(rows: RuntimeCookieEvidenceRow[]) {
  return rows.filter(isEligibleNonEssentialPreconsentStorageMetricRow).length;
}

export function countUnclassifiedNonEssentialPreconsentStorageRows(rows: RuntimeCookieEvidenceRow[]) {
  return rows.filter((row) => {
    const retainedPreConsentObservation =
      row.timingEvidence === "before_consent_cookie_write" ||
      (row.timingEvidence === "periodic_cookie_snapshot" && row.observedBeforeConsent === true);
    return retainedPreConsentObservation &&
      (row.category === "unknown" || row.essentiality === "unknown");
  }).length;
}

/**
 * A zero count is only conclusive when every retained pre-consent storage row
 * has a resolved category and essentiality classification.
 */
export function hasUnresolvedNonEssentialPreconsentStorageEvidence(rows: RuntimeCookieEvidenceRow[]) {
  return countUnclassifiedNonEssentialPreconsentStorageRows(rows) > 0;
}

function inferCookieProvider(name: string, domain: string | null = null) {
  const normalized = `${name} ${domain ?? ""}`.toLowerCase();
  if (/^awsalb(?:tg|tgcors|app-\d+|cors)?\b/.test(normalized)) {
    return "AWS Elastic Load Balancing";
  }
  if (/^(?:__cf_bm|_cfuvid|cf_clearance|cf_chl_)\b/.test(normalized)) {
    return "Cloudflare";
  }
  if (/^_dd_s\b/.test(normalized)) {
    return "Datadog";
  }
  if (/^_zitok\b/.test(normalized)) {
    return "ZoomInfo";
  }
  if (/^wisepops(?:_(?:visitor|visits|session))?\b/.test(normalized)) {
    return "WisePops";
  }
  if (/^amp_mktg_[a-z0-9_-]+\b/.test(normalized) || /^amp_(?!mktg_)[a-z0-9_-]+\b/.test(normalized)) {
    return "Amplitude";
  }
  if (/^ld_anonymous_user_key\b/.test(normalized)) {
    return "LaunchDarkly";
  }
  if (/^_sp_(?:id|ses)\./.test(normalized)) {
    return "Snowplow Analytics";
  }
  if (/^(?:cookielawinfo-checkbox-|viewed_cookie_policy\b)/.test(normalized)) {
    return "CookieYes";
  }
  if (/^(?:ebeventtotrack|stableid)\b/.test(normalized)) {
    return "Eventbrite";
  }
  if (/^optanonconsent\b|^optanonalertboxclosed\b/.test(normalized)) {
    return "OneTrust";
  }
  if (/^fccdcf\b|^fcnec\b/.test(normalized)) {
    return "Google Funding Choices";
  }
  if (/^_gcl_/.test(normalized)) {
    return "Google";
  }
  if (/^_ym_(?:uid|d|isad)\b|^_ymab_param\b/.test(normalized)) {
    return "Yandex Metrica";
  }
  if (/^_ga|^_gid|^_gat|ga_|goog|gtm|doubleclick/.test(normalized)) {
    return "Google";
  }
  if (/^_fbp|^_fbc|facebook|connect\.facebook|fbcdn/.test(normalized)) {
    return "Meta";
  }
  if (/criteo|cto_bundle/.test(normalized)) {
    return "Criteo";
  }
  if (/doubleclick|googlesyndication|googleads|__gads|__gpi|__eoi/.test(normalized)) {
    return "Google";
  }
  if (/pubmatic|krtbcookie|pugt|spugt/.test(normalized)) {
    return "PubMatic";
  }
  if (/casalemedia|cmid|cmps|cmpro/.test(normalized)) {
    return "Index Exchange";
  }
  if (/bidswitch|tuuid/.test(normalized)) {
    return "BidSwitch";
  }
  if (/id5/.test(normalized)) {
    return "ID5";
  }
  if (/gumgum/.test(normalized)) {
    return "GumGum";
  }
  if (/3lift|tluid/.test(normalized)) {
    return "TripleLift";
  }
  if (/tapad/.test(normalized)) {
    return "Tapad";
  }
  if (/adsrvr|tdid|tdcpm/.test(normalized)) {
    return "The Trade Desk";
  }
  if (/rubiconproject/.test(normalized)) {
    return "Magnite/Rubicon";
  }
  if (/openx/.test(normalized)) {
    return "OpenX";
  }
  if (/^_ttp|ttclid|tiktok/.test(normalized)) {
    return "TikTok";
  }
  if (/(^|\b)aam(\b|$)|demdex|dpm\.demdex|audience[._-\s]?manager/.test(normalized)) {
    return "Adobe Audience Manager";
  }
  if (/amcvs?_|adobeorg|kndctr_.*adobeorg|mbox|mboxedgecluster|at_check/.test(normalized)) {
    return "Adobe Experience Cloud";
  }
  if (/qsi_replaysession|qualtrics|siteintercept/.test(normalized)) {
    return "Qualtrics";
  }
  if (/hotjar|_hj/.test(normalized)) {
    return "Hotjar";
  }
  if (/fullstory|fs_uid/.test(normalized)) {
    return "FullStory";
  }
  if (/clarity|muid/.test(normalized)) {
    return "Microsoft";
  }
  if (/optimizely/.test(normalized)) {
    return "Optimizely";
  }
  if (/_vwo|_vis_opt/.test(normalized)) {
    return "VWO";
  }
  if (/hubspot|__hstc|__hssc/.test(normalized)) {
    return "HubSpot";
  }
  if (/segment|ajs_anonymous_id|ajs_user_id/.test(normalized)) {
    return "Segment";
  }
  if (/_ali_s_|aliyun|mmstat|(^|\b)cna(\b|$)|(^|\b)sca(\b|$)/.test(normalized)) {
    return "Alibaba / Umeng Analytics";
  }
  if (/yandex|yuid|yabs/.test(normalized)) {
    return /yabs|sync_cookie_csrf/.test(normalized) ? "Yandex Ads" : "Yandex";
  }
  if (/mail\.ru|(^|\b)ftid(\b|$)|(^|\b)bh(\b|$)/.test(normalized)) {
    return "Mail.ru / VK Ads";
  }
  if (/adriver/.test(normalized)) {
    return "Adriver";
  }
  if (/amazon-adsystem|ad-privacy/.test(normalized)) {
    return "Amazon Ads";
  }
  if (/xiaomi|mi\.com|xm_user_bucket|^xm_/.test(normalized)) {
    return "Xiaomi";
  }
  if (/mixpanel|(?:^|\s)mp_/.test(normalized)) {
    return "Mixpanel";
  }
  if (/heap/.test(normalized)) {
    return "Heap";
  }
  return null;
}

function hostnameFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function normalizeAttributionHost(value: string | null | undefined) {
  return value?.trim().replace(/^\.+/, "").replace(/^www\./, "").toLowerCase() ?? null;
}

function hostFamilyMatches(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizeAttributionHost(left);
  const normalizedRight = normalizeAttributionHost(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.endsWith(`.${normalizedRight}`) ||
    normalizedRight.endsWith(`.${normalizedLeft}`) ||
    registrableDomain(normalizedLeft) === registrableDomain(normalizedRight)
  );
}

function inferCookieSourceProviderFromHost(host: string | null | undefined) {
  const normalized = normalizeAttributionHost(host);
  if (!normalized) {
    return null;
  }
  if (/(^|\.)github\.com$/.test(normalized)) {
    return "GitHub";
  }
  if (/(^|\.)ctfassets\.net$/.test(normalized)) {
    return "Contentful Assets";
  }
  if (/(^|\.)hotjar\.com$/.test(normalized)) {
    return "Hotjar";
  }
  if (/(^|\.)clarity\.ms$/.test(normalized)) {
    return "Microsoft Clarity";
  }
  if (/(^|\.)trustarc\.com$/.test(normalized)) {
    return "TrustArc CMP";
  }
  if (/(^|\.)privacy-mgmt\.com$/.test(normalized)) {
    return "Sourcepoint CMP";
  }
  return null;
}

export function getRuntimeCookiePrimaryProvider(row: RuntimeCookieEvidenceRow) {
  const inferredCookieProvider = inferCookieProvider(row.cookieName, row.domain);
  if (inferredCookieProvider) {
    return inferredCookieProvider;
  }

  const sourceHost =
    hostnameFromUrl(row.sourceRequestUrl) ??
    hostnameFromUrl(row.responseUrl) ??
    normalizeAttributionHost(row.initiatorDomain);
  const canonicalCookieOwner = findRuntimeCookieOwner(row.cookieName, sourceHost ?? row.domain);
  if (canonicalCookieOwner) {
    return canonicalCookieOwner.product;
  }
  const sourceProvider = inferCookieSourceProviderFromHost(sourceHost);
  if (sourceProvider) {
    return sourceProvider;
  }

  const cookieDomain = normalizeAttributionHost(row.domain);
  if (cookieDomain && sourceHost && hostFamilyMatches(cookieDomain, sourceHost)) {
    return cookieDomain;
  }

  return row.initiatorVendor ?? row.initiatorDomain ?? row.domain ?? row.cookieName;
}

function getHybridPageHostnames(hybrid: Record<string, unknown> | null) {
  const navigationSummary = getRecord(hybrid?.navigationSummary ?? hybrid?.navigation_summary);
  const redirectChain = [
    ...(Array.isArray(navigationSummary?.redirectChain) ? navigationSummary.redirectChain : []),
    ...(Array.isArray(navigationSummary?.redirect_chain) ? navigationSummary.redirect_chain : [])
  ];
  return [
    navigationSummary?.requestedUrl,
    navigationSummary?.requested_url,
    navigationSummary?.initialUrl,
    navigationSummary?.initial_url,
    ...redirectChain,
    navigationSummary?.finalUrl,
    navigationSummary?.final_url,
    navigationSummary?.effectiveScannedPageUrl,
    navigationSummary?.effective_scanned_page_url
  ]
    .map((value) => getString(value))
    .map((value) => hostnameFromUrl(value))
    .filter((value): value is string => Boolean(value));
}

function normalizeHostForCookieParty(value: string | null | undefined) {
  return value?.trim().replace(/^\./, "").replace(/^www\./, "").toLowerCase() ?? null;
}

function registrableDomain(value: string | null | undefined) {
  const normalized = normalizeHostForCookieParty(value);
  if (!normalized) return null;
  const hostname = getTldtsHostname(normalized.includes("://") ? normalized : `https://${normalized}`);
  return hostname ? getTldtsDomain(hostname, { allowPrivateDomains: true }) ?? hostname : null;
}

function isSameSiteCookieDomain(cookieDomain: string | null, pageHostname: string | null) {
  const normalizedCookieDomain = normalizeHostForCookieParty(cookieDomain);
  const normalizedPageHostname = normalizeHostForCookieParty(pageHostname);
  if (!normalizedCookieDomain || !normalizedPageHostname) {
    return false;
  }
  return (
    normalizedCookieDomain === normalizedPageHostname ||
    normalizedPageHostname.endsWith(`.${normalizedCookieDomain}`) ||
    normalizedCookieDomain.endsWith(`.${normalizedPageHostname}`) ||
    registrableDomain(normalizedCookieDomain) === registrableDomain(normalizedPageHostname)
  );
}

function getCookiePartyType(
  row: Record<string, unknown>,
  domain: string | null,
  hybrid: Record<string, unknown> | null
): RuntimeCookieEvidenceRow["party"] {
  const navigationHosts = getHybridPageHostnames(hybrid);
  const scannedSite = navigationHosts.map(registrableDomain).find((value): value is string => Boolean(value));
  const cookieSite = registrableDomain(domain);
  if (scannedSite && cookieSite) {
    return scannedSite === cookieSite ? "first_party" : "third_party";
  }
  if (navigationHosts.some((hostname) => isSameSiteCookieDomain(domain, hostname))) {
    return "first_party";
  }
  if (row.thirdParty === true || row.third_party === true) {
    return "third_party";
  }
  const cookiePartyType = getString(row.cookiePartyType ?? row.cookie_party_type);
  if (cookiePartyType === "third_party" || cookiePartyType === "first_party") {
    return cookiePartyType;
  }
  return "unknown";
}

function isPreconsentCookieWrite(row: Record<string, unknown>, hybrid: Record<string, unknown> | null) {
  const timingEvidence = getString(row.timingEvidence ?? row.timing_evidence);
  const operation = getString(row.cookieSetMethod ?? row.cookie_set_method ?? row.setMethod ?? row.set_method ?? row.operation);
  if (/^(?:browser_snapshot|periodic_cookie_snapshot|initial_cookie_snapshot)$/i.test(operation ?? "")) {
    return false;
  }
  if (timingEvidence === "initial_cookie_snapshot_with_visible_cmp") {
    return false;
  }
  if (row.beforeConsent === true || row.before_consent === true) {
    return true;
  }
  if (timingEvidence === "before_consent_cookie_write") {
    return true;
  }
  const setAtMs = getNumber(row.setAtMs ?? row.set_at_ms ?? row.firstObservedAtMs ?? row.first_observed_at_ms);
  const timelineMarkers = getRecord(hybrid?.timelineMarkers ?? hybrid?.timeline_markers);
  const consentChoiceAtMs = getNumber(
    timelineMarkers?.consentChoiceAtMs ??
      timelineMarkers?.consent_choice_at_ms ??
      timelineMarkers?.consentAcceptedAtMs ??
      timelineMarkers?.consent_accepted_at_ms ??
      timelineMarkers?.consentRejectedAtMs ??
      timelineMarkers?.consent_rejected_at_ms
  );
  const consentBannerDetectedMs = getNumber(timelineMarkers?.consentBannerDetectedMs ?? timelineMarkers?.consent_banner_detected_ms);
  const threshold = consentChoiceAtMs ?? consentBannerDetectedMs;
  return setAtMs !== null && threshold !== null && setAtMs < threshold;
}

function normalizeCookieWriteRow(row: Record<string, unknown>, hybrid: Record<string, unknown> | null): RuntimeCookieEvidenceRow | null {
  const cookieName = getString(row.cookieName ?? row.cookie_name ?? row.name);
  if (!cookieName) {
    return null;
  }
  const domain = getString(row.domain ?? row.cookieDomain ?? row.cookie_domain)?.replace(/^\.+/, "") ?? null;
  const knowledge = resolveCanonicalCookieKnowledge(cookieName, {
    cookieDomain: domain,
    hostname: getString(row.initiatorDomain ?? row.initiator_domain ?? row.cookieInitiatorDomain ?? row.cookie_initiator_domain),
    initiatorChain: getStringArray(row.initiatorChain ?? row.initiator_chain),
    setterScriptUrl: getString(
      row.setterScriptUrl ?? row.setter_script_url ?? row.initiatorUrl ?? row.initiator_url ??
      row.sourceRequestUrl ?? row.source_request_url ?? row.responseUrl ?? row.response_url
    ),
  });
  const explicitCategory = getString(row.category ?? row.cookieCategory ?? row.cookie_category);
  const retainedEssentiality = getString(row.essentiality ?? row.cookieEssentiality ?? row.cookie_essentiality);
  const typedRetainedEssentiality = retainedEssentiality === "essential" || retainedEssentiality === "non_essential"
    ? retainedEssentiality
    : retainedEssentiality === "unknown"
      ? "unknown" as const
      : null;
  const inferredCategory = classifyRuntimeCookieCategory(cookieName, domain);
  const inferredSecurityOrNecessary = /^(?:security|necessary|functional|consent_management)$/i.test(inferredCategory);
  const canonicalNamedCategory =
    /^AMP_(?:MKTG_)?[A-Za-z0-9_-]+$/i.test(cookieName) ||
    /^ld_anonymous_user_key$/i.test(cookieName) ||
    /^_sp_(?:id|ses)\./i.test(cookieName);
  const retainedCategoryIsUnsupportedEssentialClaim =
    /^(?:security|necessary|functional|consent_management|infrastructure|cdn|service)$/i.test(explicitCategory ?? "");
  const category = knowledge.category !== "unknown"
    ? knowledge.category
    : /^unknown$/i.test(explicitCategory ?? "") && typedRetainedEssentiality === "unknown"
      ? "unknown"
    : inferredSecurityOrNecessary || canonicalNamedCategory
      ? inferredCategory
      : explicitCategory && !/^unknown$/i.test(explicitCategory) && !retainedCategoryIsUnsupportedEssentialClaim
        ? explicitCategory
        : inferredCategory;
  const setMethod = getString(row.cookieSetMethod ?? row.cookie_set_method ?? row.setMethod ?? row.set_method ?? row.operation);
  const snapshot = /^(?:browser_snapshot|periodic_cookie_snapshot|initial_cookie_snapshot)$/i.test(setMethod ?? "");
  const rawFirstObservedAtMs = getNumber(
    row.firstObservedAtMs ??
    row.first_observed_at_ms ??
    row.observedAtMs ??
    row.observed_at_ms ??
    row.timestampMs ??
    row.timestamp_ms ??
    row.capturedAtMs ??
    row.captured_at_ms
  );
  const initialSnapshot = /^initial_cookie_snapshot$/i.test(setMethod ?? "") ||
    /^browser_snapshot$/i.test(setMethod ?? "") && rawFirstObservedAtMs === null;
  const rawSetAtMs = getNumber(row.setAtMs ?? row.set_at_ms);
  const setAtMs = !snapshot && rawSetAtMs !== null && rawSetAtMs >= 0 ? rawSetAtMs : null;
  const firstObservedAtMs = rawFirstObservedAtMs !== null && rawFirstObservedAtMs >= 0 ? rawFirstObservedAtMs : setAtMs;
  const retainedNonEssential = getBoolean(row.nonEssential ?? row.non_essential);
  const canonicalNonEssentialIdentifier = canonicalNamedCategory;
  const inferredNonEssential = knowledge.essentiality !== "unknown"
    ? knowledge.essentiality === "non_essential"
    : inferredSecurityOrNecessary
      ? false
    : canonicalNonEssentialIdentifier && isNonEssentialCookieCategory(inferredCategory)
      ? true
    : retainedNonEssential !== null
      ? retainedNonEssential
      : isNonEssentialCookieCategory(category);
  const essentiality = knowledge.essentiality !== "unknown"
    ? knowledge.essentiality
    : typedRetainedEssentiality !== null
      ? typedRetainedEssentiality
    : inferredSecurityOrNecessary
      ? "essential" as const
    : inferredNonEssential
      ? "non_essential" as const
      : "unknown" as const;
  const nonEssential = essentiality === "non_essential";
  const essentialitySource = knowledge.essentiality !== "unknown"
    ? "canonical_registry" as const
    : typedRetainedEssentiality === "essential" || typedRetainedEssentiality === "non_essential"
      ? "retained_explicit_classification" as const
    : typedRetainedEssentiality === "unknown"
      ? "unknown" as const
    : inferredSecurityOrNecessary || canonicalNonEssentialIdentifier || isNonEssentialCookieCategory(category)
      ? "deterministic_classifier" as const
      : retainedNonEssential !== null
        ? "retained_explicit_classification" as const
        : "unknown" as const;
  const rawInitiatorVendor = getString(row.initiatorVendor ?? row.initiator_vendor ?? row.cookieInitiatorVendor ?? row.cookie_initiator_vendor);
  const sourceHost =
    hostnameFromUrl(getString(row.sourceRequestUrl ?? row.source_request_url ?? row.responseUrl ?? row.response_url ?? row.initiatorUrl ?? row.initiator_url)) ??
    getString(row.initiatorDomain ?? row.initiator_domain ?? row.cookieInitiatorDomain ?? row.cookie_initiator_domain) ??
    domain;
  const cookieOwner = findRuntimeCookieOwner(cookieName, sourceHost ?? domain);
  const rawInitiatorOwner = findRuntimeVendorLabelOwner(rawInitiatorVendor);
  const sourceHostOwner = findRuntimeEntityOwner(sourceHost);
  const inferredProviderOwner = findRuntimeVendorLabelOwner(inferCookieProvider(cookieName, domain));
  const initiatorVendor = cookieOwner && rawInitiatorOwner
    ? cookieOwner.entity === rawInitiatorOwner.entity ? rawInitiatorVendor : cookieOwner.product
    : rawInitiatorOwner && inferredProviderOwner && rawInitiatorOwner.entity === inferredProviderOwner.entity
      ? rawInitiatorVendor
    : rawInitiatorOwner && (!sourceHostOwner || sourceHostOwner.entity !== rawInitiatorOwner.entity)
      ? null
      : rawInitiatorOwner
        ? rawInitiatorVendor
        : null;
  const initiatorUrl = getString(row.initiatorUrl ?? row.initiator_url ?? row.cookieInitiatorUrl ?? row.cookie_initiator_url);
  const initiatorDomain = getString(row.initiatorDomain ?? row.initiator_domain ?? row.cookieInitiatorDomain ?? row.cookie_initiator_domain) ??
    hostnameFromUrl(initiatorUrl);
  const navigationHosts = getHybridPageHostnames(hybrid);
  const scannedSite = navigationHosts.map(registrableDomain).find((value): value is string => Boolean(value));
  const initiatorSite = registrableDomain(initiatorDomain);
  const cookieSite = registrableDomain(domain);
  const initiatorChain = getStringArray(row.initiatorChain ?? row.initiator_chain);
  const setterScriptUrl = getString(row.setterScriptUrl ?? row.setter_script_url) ?? initiatorUrl;
  const setByThirdPartyScript = getBoolean(row.setByThirdPartyScript ?? row.set_by_third_party_script) ??
    Boolean(scannedSite && cookieSite === scannedSite && initiatorSite && initiatorSite !== scannedSite);
  const lifespanSeconds = getNumber(row.lifespanSeconds ?? row.lifespan_seconds);
  const expiresAt = getString(row.expiresAt ?? row.expires_at ?? row.expires);
  return {
    category,
    cookieName,
    cookiePath: getString(row.cookiePath ?? row.cookie_path ?? row.path) ?? "/",
    partitionContext: getString(row.partitionContext ?? row.partition_context ?? row.partitionKey ?? row.partition_key) ??
      (getBoolean(row.partitioned) === true ? "partitioned_unspecified" : "unpartitioned_or_unknown"),
    observationCount: 1,
    classificationConflicts: [],
    evidenceRefs: uniqueStrings([
      ...getStringArray(row.evidenceRefs ?? row.evidence_refs),
      getString(row.eventId ?? row.event_id ?? row.evidenceId ?? row.evidence_id)
    ]),
    dataTypes: getStringArray(row.dataTypes ?? row.data_types).length > 0
      ? getStringArray(row.dataTypes ?? row.data_types)
      : knowledge.dataTypes,
    description: getString(row.description ?? row.cookieDescription ?? row.cookie_description) ?? knowledge.description,
    domain,
    expiresAt,
    firstObservedAtMs,
    initiatorDomain,
    initiatorUrl,
    initiatorVendor,
    initiatorChain,
    lifespanSeconds,
    lifespanSource: getString(row.lifespanSource ?? row.lifespan_source),
    longLived: lifespanSeconds !== null && lifespanSeconds > 365 * 24 * 60 * 60,
    // Canonical cookie-name/domain classification wins over stale generic flags. In
    // particular, edge-security cookies must never be promoted as advertising or
    // other non-essential storage merely because an upstream row said `true`.
    nonEssential,
    observedBeforeConsent:
      row.beforeConsent === true ||
      row.before_consent === true ||
      getString(row.consentStateAtTime ?? row.consent_state_at_time) === "pre_consent",
    essentiality,
    essentialityConfidence: getNumber(row.essentialityConfidence ?? row.cookieEssentialityConfidence ?? row.cookie_essentiality_confidence),
    essentialityReasonCodes: getStringArray(row.essentialityReasonCodes ?? row.cookieEssentialityReasonCodes ?? row.cookie_essentiality_reason_codes),
    essentialitySource,
    explicitPreconsentEvidence: false,
    party: getCookiePartyType(row, domain, hybrid),
    responseUrl: getString(row.responseUrl ?? row.response_url),
    sourceRequestUrl: getString(row.sourceRequestUrl ?? row.source_request_url ?? row.responseUrl ?? row.response_url ?? row.initiatorUrl ?? row.initiator_url),
    setAtMs,
    setByThirdPartyScript,
    setterScriptUrl,
    setMethod,
    timingBasis: snapshot
      ? initialSnapshot ? "initial_cookie_snapshot" : "periodic_cookie_snapshot"
      : getString(row.timingBasis ?? row.timing_basis ?? row.timingEvidence ?? row.timing_evidence),
    evidenceGrade: getString(row.evidenceGrade ?? row.evidence_grade),
    timingEvidence: isPreconsentCookieWrite(row, hybrid)
      ? "before_consent_cookie_write"
      : snapshot
        ? initialSnapshot ? "initial_cookie_snapshot" : "periodic_cookie_snapshot"
        : "unknown"
  };
}

function normalizeInitialCookieRow(cookieName: string, domain: string | null): RuntimeCookieEvidenceRow {
  const normalizedDomain = domain?.replace(/^\.+/, "") ?? null;
  const knowledge = resolveCanonicalCookieKnowledge(cookieName, { cookieDomain: normalizedDomain });
  const category = knowledge.category !== "unknown"
    ? knowledge.category
    : classifyRuntimeCookieCategory(cookieName, normalizedDomain);
  return {
    category,
    cookieName,
    cookiePath: "/",
    partitionContext: "unpartitioned_or_unknown",
    observationCount: 1,
    classificationConflicts: [],
    evidenceRefs: [],
    dataTypes: knowledge.dataTypes,
    description: knowledge.description,
    domain: normalizedDomain,
    expiresAt: null,
    firstObservedAtMs: null,
    initiatorDomain: null,
    initiatorUrl: null,
    initiatorVendor: null,
    initiatorChain: [],
    lifespanSeconds: null,
    lifespanSource: null,
    longLived: false,
    nonEssential: isNonEssentialCookieCategory(category),
    observedBeforeConsent: false,
    essentiality: isNonEssentialCookieCategory(category)
      ? "non_essential"
      : category === "necessary" ? "essential" : "unknown",
    essentialitySource: knowledge.essentiality !== "unknown"
      ? "canonical_registry"
      : category === "necessary" || isNonEssentialCookieCategory(category)
        ? "deterministic_classifier"
        : "unknown",
    party: "unknown",
    responseUrl: null,
    sourceRequestUrl: null,
    setAtMs: null,
    setByThirdPartyScript: false,
    setterScriptUrl: null,
    setMethod: "initial_cookie_snapshot",
    timingBasis: "initial_cookie_snapshot",
    evidenceGrade: null,
    timingEvidence: "initial_cookie_snapshot",
    explicitPreconsentEvidence: false
  };
}

export function getRuntimeCookieEvidenceIdentity(row: RuntimeCookieEvidenceRow) {
  return [
    row.cookieName.trim().toLowerCase(),
    row.domain?.replace(/^\.+/, "").toLowerCase() ?? "",
    row.cookiePath?.trim() || "/",
    row.partitionContext?.trim().toLowerCase() || "unpartitioned_or_unknown"
  ].join("\u0000");
}

function essentialitySourceWeight(row: RuntimeCookieEvidenceRow) {
  return {
    canonical_registry: 4,
    deterministic_classifier: 3,
    retained_explicit_classification: 2,
    unknown: 1,
  }[row.essentialitySource ?? "unknown"];
}

function mergeRuntimeCookieObservations(
  existing: RuntimeCookieEvidenceRow,
  candidate: RuntimeCookieEvidenceRow
) {
  const existingWeight = essentialitySourceWeight(existing);
  const candidateWeight = essentialitySourceWeight(candidate);
  const preferCandidate = candidateWeight > existingWeight || (
    candidateWeight === existingWeight &&
    existing.timingEvidence !== "before_consent_cookie_write" &&
    candidate.timingEvidence === "before_consent_cookie_write"
  );
  const preferred = preferCandidate ? candidate : existing;
  const alternate = preferCandidate ? existing : candidate;
  const categoryConflict = existing.category !== candidate.category;
  const essentialityConflict = (existing.essentiality ?? "unknown") !== (candidate.essentiality ?? "unknown");
  const equallyAuthoritativeConflict = existingWeight === candidateWeight && (categoryConflict || essentialityConflict);
  const conflictLabels = uniqueStrings([
    ...(existing.classificationConflicts ?? []),
    ...(candidate.classificationConflicts ?? []),
    categoryConflict ? `category:${existing.category}|${candidate.category}` : null,
    essentialityConflict ? `essentiality:${existing.essentiality ?? "unknown"}|${candidate.essentiality ?? "unknown"}` : null,
  ]);
  const firstObservedAtMs = [existing.firstObservedAtMs, candidate.firstObservedAtMs]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((left, right) => left - right)[0] ?? null;
  const setAtMs = [existing.setAtMs, candidate.setAtMs]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((left, right) => left - right)[0] ?? null;

  return {
    ...alternate,
    ...preferred,
    category: equallyAuthoritativeConflict ? "unknown" : preferred.category,
    essentiality: equallyAuthoritativeConflict ? "unknown" as const : preferred.essentiality,
    essentialitySource: equallyAuthoritativeConflict ? "unknown" as const : preferred.essentialitySource,
    nonEssential: equallyAuthoritativeConflict ? false : preferred.nonEssential,
    classificationConflicts: conflictLabels,
    evidenceRefs: uniqueStrings([...(existing.evidenceRefs ?? []), ...(candidate.evidenceRefs ?? [])]),
    firstObservedAtMs,
    observationCount: (existing.observationCount ?? 1) + (candidate.observationCount ?? 1),
    observedBeforeConsent: existing.observedBeforeConsent === true || candidate.observedBeforeConsent === true,
    setAtMs,
    timingEvidence:
      existing.timingEvidence === "before_consent_cookie_write" || candidate.timingEvidence === "before_consent_cookie_write"
        ? "before_consent_cookie_write" as const
        : preferred.timingEvidence,
  } satisfies RuntimeCookieEvidenceRow;
}

export function buildRuntimeCookieInventory(input: {
  hybridRuntimeEvidence?: Record<string, unknown> | null;
  runtimeArtifacts?: Record<string, unknown> | null;
}) {
  const runtimeArtifacts = getRecord(input.runtimeArtifacts);
  const hybrid =
    getRecord(input.hybridRuntimeEvidence) ??
    getRecord(runtimeArtifacts?.hybrid_runtime_evidence ?? runtimeArtifacts?.hybridRuntimeEvidence);
  const cookieWriteRows = getObjectArray(hybrid?.cookieWriteObservations ?? hybrid?.cookie_write_observations)
    .map((row) => normalizeCookieWriteRow(row, hybrid))
    .filter((row): row is RuntimeCookieEvidenceRow => Boolean(row));
  const explicitPreconsentRows = getObjectArray(hybrid?.preconsentCookieEvidence ?? hybrid?.preconsent_cookie_evidence)
    .map((row) => {
      const normalized = normalizeCookieWriteRow({ ...row, beforeConsent: true }, hybrid);
      return normalized ? { ...normalized, explicitPreconsentEvidence: true } : null;
    })
    .filter((row) => Boolean(row)) as RuntimeCookieEvidenceRow[];
  const initialCookieNames = getStringArray(runtimeArtifacts?.initial_cookie_names ?? runtimeArtifacts?.initialCookieNames);
  const initialCookieDomains = getStringArray(runtimeArtifacts?.initial_cookie_domains ?? runtimeArtifacts?.initialCookieDomains);
  const initialRows = initialCookieNames.map((cookieName, index) => normalizeInitialCookieRow(cookieName, initialCookieDomains[index] ?? null));
  const rowsByKey = new Map<string, RuntimeCookieEvidenceRow>();
  for (const row of [...cookieWriteRows, ...explicitPreconsentRows, ...initialRows]) {
    if (!row.domain) {
      const hasDomainBearingRow = [...rowsByKey.values()].some((existing) =>
        existing.cookieName.trim().toLowerCase() === row.cookieName.trim().toLowerCase() && Boolean(existing.domain)
      );
      if (hasDomainBearingRow) {
        continue;
      }
    } else {
      for (const [existingKey, existing] of rowsByKey) {
        if (
          existing.cookieName.trim().toLowerCase() === row.cookieName.trim().toLowerCase() &&
          !existing.domain
        ) {
          rowsByKey.delete(existingKey);
        }
      }
    }
    const key = getRuntimeCookieEvidenceIdentity(row);
    const existing = rowsByKey.get(key);
    rowsByKey.set(key, existing ? mergeRuntimeCookieObservations(existing, row) : row);
  }
  const rows = [...rowsByKey.values()];
  const beforeConsentRows = rows.filter((row) =>
    row.timingEvidence === "before_consent_cookie_write" ||
    (row.explicitPreconsentEvidence === true && row.nonEssential)
  );
  const nonEssentialRows = rows.filter((row) => row.nonEssential);
  const runtimePolicyReconciliationRows = getObjectArray(
    hybrid?.runtimePolicyReconciliations ?? hybrid?.runtime_policy_reconciliations
  );
  const genericCookieGapUnmatchedRows = runtimePolicyReconciliationRows
    .filter((row) => {
      const signalKey = getString(row.signalKey ?? row.signal_key);
      const findingId = getString(row.findingId ?? row.finding_id);
      const subjectKind = getString(row.subjectKind ?? row.subject_kind);
      return (
        subjectKind === "cookie" &&
        (signalKey === "privacy.cookie_runtime_disclosure_gap_detected" || findingId === "cookie_disclosure_gap")
      );
    })
    .flatMap((row) => getObjectArray(row.unmatchedRuntimeItems ?? row.unmatched_runtime_items));
  const unmatchedRows = [
    ...getObjectArray(hybrid?.unmatchedRuntimeCookies ?? hybrid?.unmatched_runtime_cookies),
    ...genericCookieGapUnmatchedRows
  ]
    .map((row) => normalizeCookieWriteRow(row, hybrid))
    .filter((row): row is RuntimeCookieEvidenceRow => Boolean(row))
    .filter((row, index, allRows) => {
      const key = getRuntimeCookieEvidenceIdentity(row);
      return allRows.findIndex((candidate) => getRuntimeCookieEvidenceIdentity(candidate) === key) === index;
    });
  const unmatchedCookieNames = uniqueStrings([
    ...getStringArray(hybrid?.unmatchedCookieNames ?? hybrid?.unmatched_cookie_names),
    ...unmatchedRows.map((row) => row.cookieName)
  ]);

  return {
    beforeConsentCookieNames: uniqueStrings(beforeConsentRows.map((row) => row.cookieName)),
    beforeConsentRows,
    cookieCategories: uniqueStrings(rows.map((row) => row.category)),
    cookieNames: uniqueStrings(rows.map((row) => row.cookieName)),
    nonEssentialCookieNames: uniqueStrings(nonEssentialRows.map((row) => row.cookieName)),
    rows,
    unmatchedCookieNames,
    unmatchedRows
  };
}

function isPreConsentAssessmentRow(row: RuntimeCookieEvidenceRow) {
  return row.timingEvidence === "before_consent_cookie_write" ||
    row.timingEvidence === "initial_cookie_snapshot" ||
    (row.timingEvidence === "periodic_cookie_snapshot" && row.observedBeforeConsent === true) ||
    row.explicitPreconsentEvidence === true;
}

function mapPreConsentStorageTimingEvidence(
  row: RuntimeCookieEvidenceRow
): PreConsentStorageAssessmentEvidenceRow["timingEvidence"] {
  if (row.timingEvidence === "before_consent_cookie_write") {
    return "before_consent_write";
  }
  if (row.timingEvidence === "periodic_cookie_snapshot" && row.observedBeforeConsent === true) {
    return "periodic_preconsent_snapshot";
  }
  if (row.timingEvidence === "initial_cookie_snapshot") {
    return "initial_snapshot";
  }
  return "unknown";
}

function normalizePreConsentStorageObservedMs(
  value: number | null,
  navigationStartMs: number | null
) {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return null;
  }
  if (value <= 10 * 60 * 1000) {
    return value;
  }
  if (navigationStartMs !== null && value >= navigationStartMs) {
    const elapsed = value - navigationStartMs;
    return elapsed <= 10 * 60 * 1000 ? elapsed : null;
  }
  return null;
}

export function buildPreConsentStorageAssessment(input: {
  hybridRuntimeEvidence?: Record<string, unknown> | null;
  runtimeArtifacts?: Record<string, unknown> | null;
  runtimeCookieRows?: RuntimeCookieEvidenceRow[];
}): PreConsentStorageAssessment {
  const runtimeArtifacts = getRecord(input.runtimeArtifacts);
  const hybrid =
    getRecord(input.hybridRuntimeEvidence) ??
    getRecord(runtimeArtifacts?.hybrid_runtime_evidence ?? runtimeArtifacts?.hybridRuntimeEvidence);
  const storageSummary = getRecord(hybrid?.storageSummary ?? hybrid?.storage_summary);
  const timelineMarkers = getRecord(hybrid?.timelineMarkers ?? hybrid?.timeline_markers);
  const navigationStartMs = getRecordNumber(timelineMarkers, [
    "navigationStartMs",
    "navigation_start_ms"
  ]);
  const rows = input.runtimeCookieRows ?? buildRuntimeCookieInventory({
    hybridRuntimeEvidence: hybrid,
    runtimeArtifacts
  }).rows;
  const preConsentRows = rows.filter(isPreConsentAssessmentRow);
  const aggregateCandidates = [
    getRecordNumber(storageSummary, [
      "distinctPreConsentCookieCount",
      "distinct_pre_consent_cookie_count",
      "cookiesBeforeConsentCount",
      "cookies_before_consent_count"
    ]),
    getRecordNumber(runtimeArtifacts, [
      "initialCookieCount",
      "initial_cookie_count"
    ])
  ].filter((value): value is number => value !== null);
  const aggregateObservedCount = aggregateCandidates.length > 0
    ? Math.max(...aggregateCandidates)
    : null;
  const classifiedNonEssentialRows = preConsentRows.filter((row) =>
    isEligibleNonEssentialPreconsentStorageMetricRow(row)
  );
  const classifiedEssentialRows = preConsentRows.filter((row) => row.essentiality === "essential");
  const unclassifiedRows = preConsentRows.filter((row) => row.essentiality === "unknown");
  const excludedRows = preConsentRows.filter((row) =>
    isFunctionalCookieExcludedFromTrackingEvidence(row.cookieName, row.domain)
  );
  const snapshotRows = preConsentRows.filter((row) =>
    row.timingEvidence === "initial_cookie_snapshot" ||
    row.timingEvidence === "periodic_cookie_snapshot"
  );
  const snapshotNonEssentialCandidates = snapshotRows.filter((row) =>
    row.nonEssential === true &&
    !isFunctionalCookieExcludedFromTrackingEvidence(row.cookieName, row.domain)
  );
  const reconciliationStatus: PreConsentStorageReconciliationStatus =
    aggregateObservedCount === null
      ? "aggregate_unavailable"
      : aggregateObservedCount > preConsentRows.length
        ? "aggregate_exceeds_attributed_rows"
        : aggregateObservedCount < preConsentRows.length
          ? "row_count_exceeds_aggregate"
          : "reconciled";
  const captureRetained =
    preConsentRows.length > 0 ||
    aggregateObservedCount !== null ||
    storageSummary !== null;
  const status: PreConsentStorageAssessmentStatus =
    !captureRetained
      ? "insufficient_evidence"
      : classifiedNonEssentialRows.length > 0
        ? "classified_nonessential_observed"
        : unclassifiedRows.length > 0 ||
            reconciliationStatus === "aggregate_exceeds_attributed_rows" ||
            reconciliationStatus === "row_count_exceeds_aggregate"
          ? "partially_classified"
          : snapshotNonEssentialCandidates.length > 0
            ? "snapshot_presence_only"
            : "classified_zero";
  const evidenceRows = preConsentRows.slice(0, 24).map((row) => ({
    category: row.category,
    domain: row.domain,
    essentiality: row.essentiality ?? "unknown",
    essentialitySource: row.essentialitySource ?? "unknown",
    exclusionReason: isFunctionalCookieExcludedFromTrackingEvidence(row.cookieName, row.domain)
      ? "functional_or_consent_storage"
      : null,
    firstObservedMs: normalizePreConsentStorageObservedMs(
      row.setAtMs ?? row.firstObservedAtMs,
      navigationStartMs
    ),
    initiatorDomain: row.initiatorDomain,
    initiatorVendor: row.initiatorVendor,
    name: row.cookieName,
    party: row.party,
    storageType: "cookie" as const,
    timingEvidence: mapPreConsentStorageTimingEvidence(row)
  }));

  return {
    aggregateObservedCount,
    assessmentVersion: "pre-consent-storage-assessment-v1",
    attributedPreConsentRecordCount: preConsentRows.length,
    classifiedEssentialCount: classifiedEssentialRows.length,
    classifiedNonEssentialCount: classifiedNonEssentialRows.length,
    excludedFunctionalOrConsentCount: excludedRows.length,
    evidenceRows,
    provenWriteCount: preConsentRows.filter((row) =>
      row.timingEvidence === "before_consent_cookie_write"
    ).length,
    reconciliationStatus,
    snapshotPresenceCount: snapshotRows.length,
    status,
    unclassifiedCount: unclassifiedRows.length
  };
}

export function isPreConsentStorageAssessment(value: unknown): value is PreConsentStorageAssessment {
  const record = getRecord(value);
  return record?.assessmentVersion === "pre-consent-storage-assessment-v1" &&
    typeof record.status === "string" &&
    typeof record.classifiedNonEssentialCount === "number" &&
    typeof record.classifiedEssentialCount === "number" &&
    typeof record.unclassifiedCount === "number" &&
    Array.isArray(record.evidenceRows);
}

export function projectPreConsentStorageMetric(
  assessment: PreConsentStorageAssessment
): PreConsentStorageMetricProjection {
  if (assessment.status === "classified_nonessential_observed") {
    const limitation = assessment.unclassifiedCount > 0
      ? ` ${assessment.unclassifiedCount} additional pre-consent record${assessment.unclassifiedCount === 1 ? " remains" : "s remain"} unclassified.`
      : assessment.reconciliationStatus !== "reconciled"
        ? " Additional retained storage could not be fully reconciled to attributed rows."
        : "";
    return {
      available: true,
      explanation: `Classified non-essential storage was observed before a recorded consent action.${limitation}`,
      label: "Non-essential storage",
      scope: "nonessential_only",
      status: "measured_positive",
      value: assessment.classifiedNonEssentialCount
    };
  }
  if (assessment.status === "classified_zero") {
    return {
      available: true,
      explanation: "Storage was scanned and no non-essential storage was detected in the reported scope.",
      label: "Non-essential storage",
      scope: "nonessential_only",
      status: "measured_zero",
      value: 0
    };
  }
  if (assessment.status === "partially_classified") {
    return {
      available: false,
      explanation: assessment.unclassifiedCount > 0
        ? `Pre-consent storage was retained, but ${assessment.unclassifiedCount} record${assessment.unclassifiedCount === 1 ? " remains" : "s remain"} unclassified.`
        : "Pre-consent storage was retained, but the aggregate count could not be reconciled to attributed storage rows.",
      label: "Non-essential storage",
      scope: "nonessential_only",
      status: "partially_classified",
      value: null
    };
  }
  if (assessment.status === "snapshot_presence_only") {
    return {
      available: false,
      explanation: "Non-essential storage candidates were present in a pre-consent snapshot, but write timing was not confirmed.",
      label: "Non-essential storage",
      scope: "nonessential_only",
      status: "partially_classified",
      value: null
    };
  }
  return {
    available: false,
    explanation: "Pre-consent storage capture or attribution was insufficient for a non-essential storage count.",
    label: "Non-essential storage",
    scope: "nonessential_only",
    status: "unavailable",
    value: null
  };
}

function normalizeCookieToken(value: string | null | undefined) {
  return value ? value.trim().toLowerCase() : null;
}

function normalizeDomainToken(value: string | null | undefined) {
  const normalized = normalizeCookieToken(value);
  return normalized?.replace(/^\.+/, "") ?? null;
}

export function normalizePolicyCookieDisclosures(disclosures: unknown): PolicyCookieDisclosureRow[] {
  return getObjectArray(disclosures).map((row) => {
    const cookieName = getString(row.cookieName ?? row.cookie_name ?? row.name);
    const domain = getString(row.domain ?? row.cookieDomain ?? row.cookie_domain);
    const provider = getString(row.provider ?? row.vendor ?? row.serviceProvider ?? row.service_provider);
    const purpose = getString(row.purpose ?? row.description ?? row.use ?? row.usage);
    const category = getString(row.category ?? row.cookieCategory ?? row.cookie_category ?? row.purposeCategory ?? row.purpose_category);
    return {
      category,
      cookieName,
      domain,
      provider,
      purpose
    };
  });
}

function disclosureMatchesRuntimeCookie(row: RuntimeCookieEvidenceRow, disclosure: PolicyCookieDisclosureRow) {
  const runtimeName = normalizeCookieToken(row.cookieName);
  const disclosedName = normalizeCookieToken(disclosure.cookieName);
  if (runtimeName && disclosedName && (runtimeName === disclosedName || runtimeName.startsWith(disclosedName) || disclosedName.startsWith(runtimeName))) {
    return "name";
  }

  const runtimeDomain = normalizeDomainToken(row.domain ?? row.initiatorDomain);
  const disclosedDomain = normalizeDomainToken(disclosure.domain);
  if (
    runtimeDomain &&
    disclosedDomain &&
    (runtimeDomain === disclosedDomain || runtimeDomain.endsWith(`.${disclosedDomain}`) || disclosedDomain.endsWith(`.${runtimeDomain}`))
  ) {
    return "domain";
  }

  const runtimeProvider = normalizeCookieToken(getRuntimeCookiePrimaryProvider(row));
  const disclosedProvider = normalizeCookieToken(disclosure.provider);
  if (runtimeProvider && disclosedProvider && (runtimeProvider.includes(disclosedProvider) || disclosedProvider.includes(runtimeProvider))) {
    return "provider";
  }

  return null;
}

function shouldEvaluateCookieForDisclosureGap(row: RuntimeCookieEvidenceRow) {
  return row.nonEssential || row.party === "third_party" && row.category !== "necessary";
}

export function buildCookieDisclosureGapEvidence(input: {
  cookiePolicyUrl?: string | null;
  disclosures: unknown;
  inventory: ReturnType<typeof buildRuntimeCookieInventory>;
}): CookieDisclosureGapEvidence {
  const disclosedRows = normalizePolicyCookieDisclosures(input.disclosures);
  const matchedRuntimeCookies: Array<RuntimeCookieEvidenceRow & { matchType: string }> = [];
  const unmatchedRuntimeCookies: RuntimeCookieEvidenceRow[] = [];

  for (const row of input.inventory.rows.filter(shouldEvaluateCookieForDisclosureGap)) {
    const matchType = disclosedRows.map((disclosure) => disclosureMatchesRuntimeCookie(row, disclosure)).find(Boolean) ?? null;
    if (matchType) {
      matchedRuntimeCookies.push({ ...row, matchType });
    } else {
      unmatchedRuntimeCookies.push(row);
    }
  }

  return {
    cookie_policy_url: input.cookiePolicyUrl ?? null,
    disclosed_cookie_categories: uniqueStrings(disclosedRows.map((row) => row.category)),
    disclosed_cookie_names: uniqueStrings(disclosedRows.map((row) => row.cookieName)),
    disclosed_cookie_providers: uniqueStrings(disclosedRows.map((row) => row.provider)),
    matched_runtime_cookies: matchedRuntimeCookies,
    runtime_cookie_categories: input.inventory.cookieCategories,
    runtime_cookie_names: input.inventory.cookieNames,
    unmatched_cookie_categories: uniqueStrings(unmatchedRuntimeCookies.map((row) => row.category)),
    unmatched_cookie_count: unmatchedRuntimeCookies.length,
    unmatched_cookie_names: uniqueStrings(unmatchedRuntimeCookies.map((row) => row.cookieName)),
    unmatched_cookie_vendors: uniqueStrings(unmatchedRuntimeCookies.map(getRuntimeCookiePrimaryProvider)),
    unmatched_runtime_cookies: unmatchedRuntimeCookies,
    unmatched_third_party_cookie_count: unmatchedRuntimeCookies.filter((row) => row.party === "third_party").length
  };
}
