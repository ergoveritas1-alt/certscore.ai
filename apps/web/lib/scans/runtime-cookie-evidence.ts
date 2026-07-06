export type RuntimeCookieEvidenceRow = {
  category: string;
  cookieName: string;
  domain: string | null;
  firstObservedAtMs: number | null;
  initiatorDomain: string | null;
  initiatorUrl: string | null;
  initiatorVendor: string | null;
  nonEssential: boolean;
  party: "first_party" | "third_party" | "unknown";
  responseUrl: string | null;
  sourceRequestUrl: string | null;
  setAtMs: number | null;
  setMethod: string | null;
  timingBasis: string | null;
  evidenceGrade: string | null;
  timingEvidence: "before_consent_cookie_write" | "initial_cookie_snapshot" | "unknown";
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

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

export type FableCookieHint = {
  category:
    | "advertising"
    | "analytics"
    | "functional"
    | "geolocation"
    | "necessary"
    | "privacy_preference";
  provider: string;
  priority: "high" | "medium" | "contextual" | "review_needed";
};

const FABLE_COOKIE_DOMAIN_HINTS: Array<FableCookieHint & {
  cookieName: RegExp;
  domain: RegExp;
}> = [
  { cookieName: /^(?:MR|MUID|SRM_B)$/i, domain: /(^|\.)bing\.com$/i, category: "advertising", provider: "Microsoft Bing UET", priority: "high" },
  { cookieName: /^(?:ANONCHK|CLID|MR|MUID|SM)$/i, domain: /(^|\.)clarity\.ms$/i, category: "analytics", provider: "Microsoft Clarity", priority: "medium" },
  { cookieName: /^UID$/i, domain: /(^|\.)(?:doubleclick\.net|ipredictive\.com|lightboxcdn\.com|pubmatic\.com)$/i, category: "advertising", provider: "Adtech", priority: "high" },
  { cookieName: /^UID$/i, domain: /(^|\.)(?:scorecardresearch\.com|latimes\.com)$/i, category: "analytics", provider: "Comscore / ScorecardResearch", priority: "medium" },
  { cookieName: /^XID$/i, domain: /(^|\.)(?:liadm\.com|linkedin\.com|nbcnews\.com)$/i, category: "advertising", provider: "Adtech", priority: "high" },
  { cookieName: /^XID$/i, domain: /(^|\.)(?:scorecardresearch\.com|latimes\.com)$/i, category: "analytics", provider: "Comscore / ScorecardResearch", priority: "medium" },
  { cookieName: /^adEdition$/i, domain: /(^|\.)smartadserver\.com$/i, category: "advertising", provider: "Smart AdServer (Equativ)", priority: "high" },
  { cookieName: /^adEdition$/i, domain: /(^|\.)rubiconproject\.com$/i, category: "advertising", provider: "Magnite / Rubicon Project", priority: "high" },
  { cookieName: /^adEdition$/i, domain: /(^|\.)tapad\.com$/i, category: "advertising", provider: "Tapad", priority: "high" },
  { cookieName: /^adEdition$/i, domain: /(^|\.)nbcuni\.com$|^app\.mps\.vsnt\.net$/i, category: "advertising", provider: "NBCUniversal ad platform (MPS)", priority: "high" },
  { cookieName: /^geo_country$/i, domain: /(^|\.)adidas\.com$/i, category: "geolocation", provider: "Adidas", priority: "contextual" },
];

const FABLE_COOKIE_NAME_HINTS: Record<string, FableCookieHint> = {
  a3: { category: "advertising", provider: "Yahoo", priority: "high" },
  aka_a2: { category: "necessary", provider: "Akamai Adaptive Acceleration", priority: "contextual" },
  apc: { category: "advertising", provider: "Xandr / AppNexus", priority: "high" },
  awsalb: { category: "necessary", provider: "AWS Application Load Balancer", priority: "contextual" },
  cdipartners: { category: "advertising", provider: "Conversant / Dotomi", priority: "high" },
  cdiuser: { category: "advertising", provider: "Conversant / Dotomi", priority: "high" },
  cmid: { category: "advertising", provider: "Index Exchange / Casale", priority: "high" },
  cmpro: { category: "advertising", provider: "Index Exchange / Casale", priority: "high" },
  cmps: { category: "advertising", provider: "Index Exchange / Casale", priority: "high" },
  co_lang: { category: "functional", provider: "CAMPUSonline", priority: "contextual" },
  co_profile: { category: "functional", provider: "CAMPUSonline", priority: "contextual" },
  dotomitest: { category: "advertising", provider: "Conversant / Dotomi", priority: "high" },
  fastab: { category: "functional", provider: "Publisher A/B check", priority: "contextual" },
  gclb: { category: "necessary", provider: "Google Cloud Load Balancer", priority: "contextual" },
  grecaptcha: { category: "necessary", provider: "Google reCAPTCHA", priority: "contextual" },
  ide: { category: "advertising", provider: "Google DoubleClick", priority: "high" },
  idsync: { category: "advertising", provider: "Yahoo / Blis", priority: "high" },
  ingresscookie: { category: "necessary", provider: "Kubernetes ingress", priority: "contextual" },
  iqpdata: { category: "advertising", provider: "Intent IQ", priority: "high" },
  iqver: { category: "advertising", provider: "Intent IQ", priority: "high" },
  kadusercookie: { category: "advertising", provider: "PubMatic", priority: "high" },
  ktpcacookie: { category: "advertising", provider: "PubMatic", priority: "high" },
  oau: { category: "advertising", provider: "Criteo", priority: "high" },
  phpsessid: { category: "necessary", provider: "PHP session", priority: "contextual" },
  psessionid: { category: "necessary", provider: "CAMPUSonline session", priority: "contextual" },
  secgpc: { category: "privacy_preference", provider: "Global Privacy Control flag", priority: "contextual" },
  syncrtb4: { category: "advertising", provider: "PubMatic", priority: "high" },
  tdcpm: { category: "advertising", provider: "The Trade Desk", priority: "high" },
  tdid: { category: "advertising", provider: "The Trade Desk", priority: "high" },
  tapad_3way_syncs: { category: "advertising", provider: "Tapad", priority: "high" },
  tapad_did: { category: "advertising", provider: "Tapad", priority: "high" },
  tapad_ts: { category: "advertising", provider: "Tapad", priority: "high" },
  testifcookiep: { category: "advertising", provider: "Weborama / ad sync", priority: "high" },
  tipmix: { category: "necessary", provider: "Azure Traffic Manager", priority: "contextual" },
  v: { category: "necessary", provider: "Etsy", priority: "contextual" },
  visitorid: { category: "analytics", provider: "WebMD / Yahoo", priority: "medium" },
  wppldoc: { category: "functional", provider: "Fandango", priority: "contextual" },
  xandr_panid: { category: "advertising", provider: "Xandr / AppNexus", priority: "high" },
  "__host-next-auth.csrf-token": { category: "necessary", provider: "NextAuth.js", priority: "contextual" },
  "__secure-next-auth.callback-url": { category: "necessary", provider: "NextAuth.js", priority: "contextual" },
  "__cf_bm": { category: "necessary", provider: "Cloudflare Bot Management", priority: "contextual" },
  "__cflb": { category: "necessary", provider: "Cloudflare Load Balancer", priority: "contextual" },
  "__eoi": { category: "advertising", provider: "Google Ad Manager", priority: "high" },
  "__gads": { category: "advertising", provider: "Google Ad Manager", priority: "high" },
  "__gpi": { category: "advertising", provider: "Google Ad Manager", priority: "high" },
  "_abck": { category: "necessary", provider: "Akamai Bot Manager / Edge", priority: "contextual" },
  "_cfuvid": { category: "necessary", provider: "Cloudflare", priority: "contextual" },
  "_dd_s_v2": { category: "analytics", provider: "Datadog RUM", priority: "medium" },
  "_lc2_fpi": { category: "advertising", provider: "Lotame", priority: "high" },
  "_li_ss": { category: "advertising", provider: "LiveIntent", priority: "high" },
  ab: { category: "advertising", provider: "Neustar / AGKN", priority: "high" },
  ac_r: { category: "advertising", provider: "Yahoo", priority: "high" },
  acx: { category: "advertising", provider: "Primis", priority: "high" },
  "ad-id": { category: "advertising", provider: "Amazon Ads", priority: "high" },
  "ad-privacy": { category: "advertising", provider: "Amazon Ads", priority: "high" },
  admtr: { category: "advertising", provider: "Zeta Global (Rezync)", priority: "high" },
  ak_bmsc: { category: "necessary", provider: "Akamai Bot Manager / Edge", priority: "contextual" },
  akaas_nbcnews: { category: "necessary", provider: "Akamai", priority: "contextual" },
  akacd_phased_www_adidas_com_generic: { category: "necessary", provider: "Akamai", priority: "contextual" },
  akacd_shop_ford_com_pr: { category: "necessary", provider: "Akamai", priority: "contextual" },
  akacd_www_ford_com_pr: { category: "necessary", provider: "Akamai", priority: "contextual" },
  akamai_generated_location: { category: "geolocation", provider: "Akamai edge geolocation", priority: "contextual" },
  akamai_location: { category: "geolocation", provider: "Akamai edge geolocation", priority: "contextual" },
  akamai_set_zip: { category: "geolocation", provider: "Akamai edge geolocation", priority: "contextual" },
  anj: { category: "advertising", provider: "Xandr / AppNexus", priority: "high" },
  audit: { category: "advertising", provider: "LiveRamp", priority: "high" },
  audit_p: { category: "advertising", provider: "LiveRamp", priority: "high" },
  b: { category: "advertising", provider: "Magnite / Rubicon", priority: "high" },
  bcookie: { category: "advertising", provider: "LinkedIn Insight Tag", priority: "high" },
  bito: { category: "advertising", provider: "Beeswax", priority: "high" },
  bitoissecure: { category: "advertising", provider: "Beeswax", priority: "high" },
  bm_s: { category: "necessary", provider: "Akamai Bot Manager / Edge", priority: "contextual" },
  bm_sc: { category: "necessary", provider: "Akamai Bot Manager / Edge", priority: "contextual" },
  bm_so: { category: "necessary", provider: "Akamai Bot Manager / Edge", priority: "contextual" },
  bm_ss: { category: "necessary", provider: "Akamai Bot Manager / Edge", priority: "contextual" },
  bm_sv: { category: "necessary", provider: "Akamai Bot Manager / Edge", priority: "contextual" },
  bm_sz: { category: "necessary", provider: "Akamai Bot Manager / Edge", priority: "contextual" },
  c_code: { category: "geolocation", provider: "NVIDIA", priority: "contextual" },
  c_sid: { category: "analytics", provider: "Comscore", priority: "medium" },
  cf_clearance: { category: "necessary", provider: "Cloudflare", priority: "contextual" },
  chkchromeab67sec: { category: "functional", provider: "Publisher A/B check", priority: "contextual" },
  "color-palette": { category: "functional", provider: "Site preference", priority: "contextual" },
  country: { category: "geolocation", provider: "OpenAI", priority: "contextual" },
  countrycode: { category: "geolocation", provider: "Publisher geo preference", priority: "contextual" },
  csuuid: { category: "advertising", provider: "Throtle", priority: "high" },
  cto_bundle: { category: "advertising", provider: "Criteo", priority: "high" },
  custom_data: { category: "advertising", provider: "Yahoo", priority: "high" },
  "data-bs": { category: "advertising", provider: "NYT / ad sync", priority: "high" },
  "data-cl": { category: "advertising", provider: "PulsePoint / ad sync", priority: "high" },
  "data-co": { category: "advertising", provider: "LiveIntent / ad sync", priority: "high" },
  "data-mf": { category: "advertising", provider: "Zeta Rezync / ad sync", priority: "high" },
  "data-p": { category: "advertising", provider: "Media.net / ad sync", priority: "high" },
  "data-rbh": { category: "advertising", provider: "StackAdapt / ad sync", priority: "high" },
  "data-rk": { category: "advertising", provider: "NYT / ad sync", priority: "high" },
  "data-ttd": { category: "advertising", provider: "The Trade Desk sync", priority: "high" },
  datadome: { category: "necessary", provider: "DataDome", priority: "contextual" },
  did: { category: "advertising", provider: "LiveRamp", priority: "high" },
  didts: { category: "advertising", provider: "LiveRamp", priority: "high" },
  "et-ppvid": { category: "analytics", provider: "New York Times", priority: "medium" },
  eud: { category: "advertising", provider: "LiveRamp", priority: "high" },
  euds: { category: "advertising", provider: "LiveRamp", priority: "high" },
  exp_ebid: { category: "functional", provider: "Etsy", priority: "contextual" },
  geodata: { category: "geolocation", provider: "Publisher geo preference", priority: "contextual" },
  geoedition: { category: "geolocation", provider: "Publisher geo preference", priority: "contextual" },
  geo_coordinates: { category: "geolocation", provider: "Adidas", priority: "contextual" },
  geo_ip: { category: "geolocation", provider: "Adidas", priority: "contextual" },
  geo_postcode: { category: "geolocation", provider: "Adidas", priority: "contextual" },
  geo_state: { category: "geolocation", provider: "Adidas", priority: "contextual" },
  "gpp-string": { category: "privacy_preference", provider: "IAB GPP consent string", priority: "contextual" },
  gtinfo: { category: "geolocation", provider: "WebMD", priority: "contextual" },
  i: { category: "advertising", provider: "OpenX", priority: "high" },
  idx: { category: "advertising", provider: "LiveIntent", priority: "high" },
  intentiq: { category: "advertising", provider: "Intent IQ", priority: "high" },
  intentiqcdate: { category: "advertising", provider: "Intent IQ", priority: "high" },
  "jkidd-p": { category: "advertising", provider: "New York Times", priority: "high" },
  "jkidd-s": { category: "advertising", provider: "New York Times", priority: "high" },
  khaos: { category: "advertising", provider: "Magnite / Rubicon", priority: "high" },
  khaos_p: { category: "advertising", provider: "Magnite / Rubicon", priority: "high" },
  ktcid: { category: "advertising", provider: "Kargo", priority: "high" },
  li_sugr: { category: "advertising", provider: "LinkedIn", priority: "high" },
  lidc: { category: "advertising", provider: "LinkedIn Insight Tag", priority: "high" },
  lidid: { category: "advertising", provider: "LiveIntent", priority: "high" },
  locale: { category: "functional", provider: "OpenAI", priority: "contextual" },
  long: { category: "geolocation", provider: "Adidas", priority: "contextual" },
  lrt_wrk: { category: "functional", provider: "WebMD", priority: "contextual" },
  mc: { category: "advertising", provider: "Quantcast / Media.net", priority: "high" },
  ng_geolocation: { category: "geolocation", provider: "Publisher geo preference", priority: "contextual" },
  novaexp: { category: "advertising", provider: "Novatiq", priority: "high" },
  novasig: { category: "advertising", provider: "Novatiq", priority: "high" },
  novasyncts: { category: "advertising", provider: "Novatiq", priority: "high" },
  novauid: { category: "advertising", provider: "Novatiq", priority: "high" },
  "nyt-a": { category: "analytics", provider: "New York Times", priority: "medium" },
  "nyt-gdpr": { category: "privacy_preference", provider: "New York Times", priority: "contextual" },
  "nyt-geo": { category: "geolocation", provider: "New York Times", priority: "contextual" },
  "nyt-jkidd": { category: "advertising", provider: "New York Times", priority: "high" },
  "nyt-purr": { category: "privacy_preference", provider: "New York Times", priority: "contextual" },
  "nyt-traceid": { category: "necessary", provider: "New York Times", priority: "contextual" },
  "oai-did": { category: "necessary", provider: "OpenAI", priority: "contextual" },
  obuid: { category: "advertising", provider: "Outbrain", priority: "high" },
  onesite_country: { category: "geolocation", provider: "Adidas", priority: "contextual" },
  pbw: { category: "advertising", provider: "Magnite / Rubicon", priority: "high" },
  pid: { category: "advertising", provider: "Smart AdServer (Equativ)", priority: "high" },
  "purr-cache": { category: "privacy_preference", provider: "New York Times", priority: "contextual" },
  "purr-pref-agent": { category: "privacy_preference", provider: "New York Times", priority: "contextual" },
  pxrc: { category: "advertising", provider: "LiveRamp", priority: "high" },
  "receive-cookie-deprecation": { category: "functional", provider: "Chrome Privacy Sandbox", priority: "contextual" },
  rlas3: { category: "advertising", provider: "LiveRamp", priority: "high" },
  rud: { category: "advertising", provider: "LiveRamp", priority: "high" },
  ruds: { category: "advertising", provider: "LiveRamp", priority: "high" },
  "sa-user-id": { category: "advertising", provider: "StackAdapt", priority: "high" },
  "sa-user-id-v2": { category: "advertising", provider: "StackAdapt", priority: "high" },
  "sa-user-id-v3": { category: "advertising", provider: "StackAdapt", priority: "high" },
  "sa-user-id-v4": { category: "advertising", provider: "StackAdapt", priority: "high" },
  sasd: { category: "advertising", provider: "Smart AdServer (Equativ)", priority: "high" },
  sasd2: { category: "advertising", provider: "Smart AdServer (Equativ)", priority: "high" },
  "sd-session-id": { category: "advertising", provider: "StackAdapt", priority: "high" },
  searchcity: { category: "geolocation", provider: "Publisher preference", priority: "contextual" },
  searchlocation: { category: "geolocation", provider: "Publisher preference", priority: "contextual" },
  searchstate: { category: "geolocation", provider: "Publisher preference", priority: "contextual" },
  sessionactive: { category: "analytics", provider: "New York Times", priority: "medium" },
  sessionindex: { category: "analytics", provider: "New York Times", priority: "medium" },
  statecode: { category: "geolocation", provider: "Publisher geo preference", priority: "contextual" },
  stx_user_id: { category: "advertising", provider: "Sharethrough", priority: "high" },
  t_gid: { category: "advertising", provider: "Taboola", priority: "high" },
  t_pt_gid: { category: "advertising", provider: "Taboola", priority: "high" },
  taboola_session_id: { category: "advertising", provider: "Taboola", priority: "high" },
  test_cookie: { category: "advertising", provider: "Google DoubleClick", priority: "high" },
  "theme-options": { category: "functional", provider: "Site preference", priority: "contextual" },
  tluid: { category: "advertising", provider: "TripleLift", priority: "high" },
  tuuid: { category: "advertising", provider: "Improve Digital / BidSwitch", priority: "high" },
  tuuid_lu: { category: "advertising", provider: "Improve Digital / BidSwitch", priority: "high" },
  uid: { category: "advertising", provider: "Criteo / adtech", priority: "high" },
  uids: { category: "advertising", provider: "Xandr / AppNexus (Prebid)", priority: "high" },
  userinfo: { category: "functional", provider: "Ford", priority: "contextual" },
  usp_status: { category: "privacy_preference", provider: "US Privacy (CCPA) status", priority: "contextual" },
  uuid: { category: "advertising", provider: "MediaMath / adtech", priority: "high" },
  uuid2: { category: "advertising", provider: "Xandr / AppNexus", priority: "high" },
  "visitor-id": { category: "advertising", provider: "Adtech", priority: "high" },
  wbdfch: { category: "functional", provider: "Warner Bros. Discovery", priority: "contextual" },
  "x-ms-routing-name": { category: "necessary", provider: "Azure", priority: "contextual" },
  zip: { category: "geolocation", provider: "Publisher preference", priority: "contextual" },
  "zync-uuid": { category: "advertising", provider: "Zeta Global (Rezync)", priority: "high" },
};

function normalizeFableCookieKey(value: string) {
  return value.toLowerCase().replace(/^_grecaptcha$/, "grecaptcha");
}

export function getFableCookieHint(name: string, domain: string | null = null): FableCookieHint | null {
  const normalizedDomain = domain?.replace(/^\./, "").toLowerCase() ?? "";
  for (const hint of FABLE_COOKIE_DOMAIN_HINTS) {
    if (hint.cookieName.test(name) && hint.domain.test(normalizedDomain)) {
      return hint;
    }
  }
  return FABLE_COOKIE_NAME_HINTS[normalizeFableCookieKey(name)] ?? null;
}

export function classifyRuntimeCookieCategory(name: string, domain: string | null = null) {
  const fableHint = getFableCookieHint(name, domain);
  if (fableHint) {
    return fableHint.category;
  }

  const normalized = `${name} ${domain ?? ""}`.toLowerCase();
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
  if (
    /(^_ga|^_gid|^_gat|ga_|goog|gtm|plausible|analytics|amplitude|segment|mixpanel|posthog|ajs_anonymous_id|ajs_user_id|analytics_session_id|heap|mp_|intercom-id|hubspotutk|__hstc|__hssc|(^|\b)s_ecid(\b|$)|(^|\b)s_sess(\b|$)|(^|\b)s_cc(\b|$)|(^|\b)s_dslv(\b|$)|(^|\b)sat_ppv(\b|$)|^_ali_s_|(^|\b)cna(\b|$)|(^|\b)sca(\b|$)|^yandex|^yuid|aliyun\.com|mmstat\.com|yandex\.(?:ru|com))/i.test(
      normalized
    )
  ) {
    return "analytics";
  }
  if (/(^|\b)aam(\b|$)|(^|\b)dpm(\b|$)|demdex|dpm\.demdex|audience[._-\s]?manager/i.test(normalized)) {
    return "dmp";
  }
  if (
    /(^_fbp|^_fbc|gcl_|ttclid|ttp|_twpid|li_sugr|bcookie|lidc|uuid2|xandr|adnxs|anusercookie|rtmark|infolinks|doubleclick|criteo|cto_bundle|media\.net|_mkto_trk|muid|fr\b|amcvs?_|adobeorg|kndctr_.*adobeorg|mbox|mboxedgecluster|at_check|optimizely|_vwo|_vis_opt|guest_id_ads|guest_id_marketing|personalization_id|pubmatic|krtbcookie|pugt|spugt|bidswitch|tuuid|id5|casalemedia|cmid|cmps|cmpro|gumgum|3lift|tluid|sync\b|tapad|adsrvr|tdid|tdcpm|rubiconproject|openx|adform|bidr\.io|scorecardresearch|quantserve|crwdcntrl|panoramaid|_pubcid|lijit|mathtag|rlcdn|rlas3|pxrc|pippio|deepintent|amazon-adsystem|stackadapt|onaudience|(^|\b)ide(\b|$)|(^|\b)dextp(\b|$)|(^|\b)tvid(\b|$)|(^|\b)tv_uicr(\b|$)|(^|\b)uid(\b|$)|(^|\b)mc(\b|$)|receive-cookie-deprecation|sailthru|^yabs|sync_cookie_csrf|(^|\b)ftid(\b|$)|(^|\b)bh(\b|$)|ad-privacy|mail\.ru|adriver\.ru)/i.test(
      normalized
    )
  ) {
    return "advertising";
  }
  if (/(qsi_replaysession|qsi_historysession|qualtrics|siteintercept|hotjar|fullstory|clarity|contentsquare|mouseflow|fs_uid|hjSession|_hj)/i.test(normalized)) {
    return "session_replay";
  }
  if (
    /(cf_clearance|__cf|recaptcha|akamai|datadome|perimeterx|awsalb|awsalbcors|awsalbtg|akaalb|usp-google|bm_sz|bm_sv|bm_mi|ak_bmsc|_abck|csrf|xsrf|phpsessid|jsessionid|(^|\b)sid($|\b)|(^|\b)session($|\b)|optanonconsent|optanonalertboxclosed|cookieyes-consent|didomi_token|geo_country|trp-country|trp-language)/i.test(
      normalized
    )
  ) {
    return "necessary";
  }
  return "unknown";
}

export function isFunctionalCookieExcludedFromTrackingEvidence(name: string | null | undefined, domain: string | null = null) {
  if (name) {
    const fableHint = getFableCookieHint(name, domain);
    if (fableHint && fableHint.priority === "contextual") {
      return true;
    }
  }

  const normalized = `${name ?? ""} ${domain ?? ""}`.toLowerCase();
  return /(^|\b)(optanonconsent|optanonalertboxclosed|cookieconsent|euconsent-v2|tcfv2|cmapi_cookie_privacy|notice_preferences|notice_gdpr_prefs|cookieyes-consent|didomi_token|geo_country|trp-country|trp-language|__cf_bm|cf_clearance|bigipserver|awsalb|awsalbcors|awsalbtg|akaalb|usp-google|bm_sz|bm_sv|bm_mi|ak_bmsc|_abck|csrf|xsrf|phpsessid|jsessionid)|(^|\b)_sp_/.test(
    normalized
  );
}

export function isNonEssentialCookieCategory(category: string | null | undefined) {
  return category === "analytics" || category === "advertising" || category === "dmp" || category === "session_replay" || category === "personalization" || category === "experimentation";
}

function inferCookieProvider(name: string, domain: string | null = null) {
  const fableHint = getFableCookieHint(name, domain);
  if (fableHint) {
    return fableHint.provider;
  }

  const normalized = `${name} ${domain ?? ""}`.toLowerCase();
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
  if (/mixpanel|mp_/.test(normalized)) {
    return "Mixpanel";
  }
  if (/heap/.test(normalized)) {
    return "Heap";
  }
  return null;
}

function getHybridPageHostname(hybrid: Record<string, unknown> | null) {
  const navigationSummary = getRecord(hybrid?.navigationSummary ?? hybrid?.navigation_summary);
  const url = getString(
    navigationSummary?.finalUrl ??
      navigationSummary?.final_url ??
      navigationSummary?.initialUrl ??
      navigationSummary?.initial_url
  );
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function normalizeHostForCookieParty(value: string | null | undefined) {
  return value?.trim().replace(/^\./, "").replace(/^www\./, "").toLowerCase() ?? null;
}

function roughEtldPlusOne(hostname: string | null | undefined) {
  const parts = (hostname ?? "").replace(/^\./, "").toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) {
    return parts.join(".");
  }
  const lastTwo = parts.slice(-2).join(".");
  return new Set(["co.uk", "com.au", "com.br", "co.jp", "co.nz", "com.mx"]).has(lastTwo) && parts.length >= 3
    ? parts.slice(-3).join(".")
    : lastTwo;
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
    roughEtldPlusOne(normalizedCookieDomain) === roughEtldPlusOne(normalizedPageHostname)
  );
}

function getCookiePartyType(
  row: Record<string, unknown>,
  domain: string | null,
  hybrid: Record<string, unknown> | null
): RuntimeCookieEvidenceRow["party"] {
  if (isSameSiteCookieDomain(domain, getHybridPageHostname(hybrid))) {
    return "first_party";
  }
  if (row.thirdParty === true || row.third_party === true) {
    return "third_party";
  }
  const cookiePartyType = getString(row.cookiePartyType ?? row.cookie_party_type);
  if (cookiePartyType === "third_party" || cookiePartyType === "first_party") {
    return cookiePartyType;
  }
  return "first_party";
}

function isPreconsentCookieWrite(row: Record<string, unknown>, hybrid: Record<string, unknown> | null) {
  if (row.beforeConsent === true || row.before_consent === true) {
    return true;
  }
  const timingEvidence = getString(row.timingEvidence ?? row.timing_evidence);
  if (timingEvidence === "before_consent_cookie_write" || timingEvidence === "initial_cookie_snapshot_with_visible_cmp") {
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
  const domain = getString(row.domain ?? row.cookieDomain ?? row.cookie_domain);
  const explicitCategory = getString(row.category ?? row.cookieCategory ?? row.cookie_category);
  const inferredCategory = classifyRuntimeCookieCategory(cookieName, domain);
  const category = explicitCategory && !/^unknown$/i.test(explicitCategory) ? explicitCategory : inferredCategory;
  const rawSetAtMs = getNumber(row.setAtMs ?? row.set_at_ms);
  const setAtMs = rawSetAtMs !== null && rawSetAtMs >= 0 ? rawSetAtMs : null;
  const rawFirstObservedAtMs = getNumber(row.firstObservedAtMs ?? row.first_observed_at_ms);
  const firstObservedAtMs = rawFirstObservedAtMs !== null && rawFirstObservedAtMs >= 0 ? rawFirstObservedAtMs : setAtMs;
  return {
    category,
    cookieName,
    domain,
    firstObservedAtMs,
    initiatorDomain: getString(row.initiatorDomain ?? row.initiator_domain ?? row.cookieInitiatorDomain ?? row.cookie_initiator_domain),
    initiatorUrl: getString(row.initiatorUrl ?? row.initiator_url ?? row.cookieInitiatorUrl ?? row.cookie_initiator_url),
    initiatorVendor: getString(row.initiatorVendor ?? row.initiator_vendor ?? row.cookieInitiatorVendor ?? row.cookie_initiator_vendor),
    nonEssential: getBoolean(row.nonEssential ?? row.non_essential) ?? isNonEssentialCookieCategory(category),
    party: getCookiePartyType(row, domain, hybrid),
    responseUrl: getString(row.responseUrl ?? row.response_url),
    sourceRequestUrl: getString(row.sourceRequestUrl ?? row.source_request_url ?? row.responseUrl ?? row.response_url ?? row.initiatorUrl ?? row.initiator_url),
    setAtMs,
    setMethod: getString(row.cookieSetMethod ?? row.cookie_set_method ?? row.setMethod ?? row.set_method),
    timingBasis: getString(row.timingBasis ?? row.timing_basis ?? row.timingEvidence ?? row.timing_evidence),
    evidenceGrade: getString(row.evidenceGrade ?? row.evidence_grade),
    timingEvidence: isPreconsentCookieWrite(row, hybrid) ? "before_consent_cookie_write" : "unknown"
  };
}

function normalizeInitialCookieRow(cookieName: string, domain: string | null): RuntimeCookieEvidenceRow {
  const category = classifyRuntimeCookieCategory(cookieName, domain);
  return {
    category,
    cookieName,
    domain,
    firstObservedAtMs: null,
    initiatorDomain: null,
    initiatorUrl: null,
    initiatorVendor: null,
    nonEssential: isNonEssentialCookieCategory(category),
    party: "unknown",
    responseUrl: null,
    sourceRequestUrl: null,
    setAtMs: null,
    setMethod: "initial_cookie_snapshot",
    timingBasis: "initial_cookie_snapshot",
    evidenceGrade: null,
    timingEvidence: "initial_cookie_snapshot"
  };
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
    .map((row) => normalizeCookieWriteRow({ ...row, beforeConsent: true }, hybrid))
    .filter((row): row is RuntimeCookieEvidenceRow => Boolean(row));
  const initialCookieNames = getStringArray(runtimeArtifacts?.initial_cookie_names ?? runtimeArtifacts?.initialCookieNames);
  const initialCookieDomains = getStringArray(runtimeArtifacts?.initial_cookie_domains ?? runtimeArtifacts?.initialCookieDomains);
  const initialRows = initialCookieNames.map((cookieName, index) => normalizeInitialCookieRow(cookieName, initialCookieDomains[index] ?? null));
  const rowsByKey = new Map<string, RuntimeCookieEvidenceRow>();
  for (const row of [...cookieWriteRows, ...explicitPreconsentRows, ...initialRows]) {
    if (!row.domain) {
      const hasDomainBearingRow = [...rowsByKey.values()].some((existing) => existing.cookieName === row.cookieName && Boolean(existing.domain));
      if (hasDomainBearingRow) {
        continue;
      }
    } else {
      rowsByKey.delete(`${row.cookieName}\u0000`);
    }
    const key = `${row.cookieName}\u0000${row.domain ?? ""}`;
    const existing = rowsByKey.get(key);
    if (!existing || existing.timingEvidence !== "before_consent_cookie_write" && row.timingEvidence === "before_consent_cookie_write") {
      rowsByKey.set(key, row);
    }
  }
  const rows = [...rowsByKey.values()];
  const beforeConsentRows = rows.filter((row) => row.timingEvidence === "before_consent_cookie_write");
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
      const key = `${row.cookieName}\u0000${row.domain ?? ""}`;
      return allRows.findIndex((candidate) => `${candidate.cookieName}\u0000${candidate.domain ?? ""}` === key) === index;
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

  const runtimeProvider = normalizeCookieToken(row.initiatorVendor ?? inferCookieProvider(row.cookieName, row.domain));
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
    unmatched_cookie_vendors: uniqueStrings(
      unmatchedRuntimeCookies.map((row) => row.initiatorVendor ?? inferCookieProvider(row.cookieName, row.domain))
    ),
    unmatched_runtime_cookies: unmatchedRuntimeCookies,
    unmatched_third_party_cookie_count: unmatchedRuntimeCookies.filter((row) => row.party === "third_party").length
  };
}
