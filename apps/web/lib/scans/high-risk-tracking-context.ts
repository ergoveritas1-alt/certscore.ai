import { detectKnownCmps } from "../../../../packages/shared/src/known-cmps";

export type HighRiskTrackingVendor = {
  category:
    | "dmp"
    | "identity_data_broker"
    | "data_broker"
    | "identity_resolution"
    | "health_adtech"
    | "adtech"
    | "session_replay"
    | "marketing_automation"
    | "sports_data_advertising"
    | "post_purchase_advertising"
    | "cross_device_identity"
    | "device_signal_adtech"
    | "device_signal"
    | "enterprise_device_risk"
    | "cmp";
  evidence: string[];
  name: string;
  role: string;
};

export type HighRiskTrackingContext = {
  cmpVendors: HighRiskTrackingVendor[];
  cmpVendorName: string | null;
  highRiskVendors: HighRiskTrackingVendor[];
  isSensitiveContext: boolean;
  sensitiveContextLabel: string | null;
};

type VendorRule = {
  category: HighRiskTrackingVendor["category"];
  domains?: string[];
  name: string;
  patterns?: RegExp[];
  role: string;
};

const HIGH_RISK_VENDOR_RULES: VendorRule[] = [
  {
    name: "Experian",
    category: "identity_data_broker",
    role: "credit bureau and consumer data broker",
    domains: ["experian.com", "experianmarketingservices.com"],
    patterns: [/\bexperian\b/i, /\bexperianauts\b/i, /\bexperian-hitwise\b/i]
  },
  {
    name: "Adobe Audience Manager",
    category: "dmp",
    role: "data management platform audience profiling",
    domains: ["demdex.net", "dpm.demdex.net"],
    patterns: [/(^|\b)aam(\b|$)/i, /\bdemdex\b/i, /\bdpm\.demdex\b/i, /\badobe audience manager\b/i]
  },
  {
    name: "ID5",
    category: "identity_resolution",
    role: "cross-site identity resolution",
    domains: ["id5-sync.com", "cdn.id5-sync.com"],
    patterns: [/\bid5(?:id|-sync)?\b/i]
  },
  {
    name: "PulsePoint / ContextWeb",
    category: "health_adtech",
    role: "health-contextual advertising network",
    domains: ["contextweb.com", "pulsepoint.com"],
    patterns: [/\bbh-medscape\b/i]
  },
  {
    name: "Amazon Publisher Services",
    category: "device_signal_adtech",
    role: "advertising device-signal collection",
    domains: ["amazon-adsystem.com", "aax.amazon-adsystem.com"],
    patterns: [/\baps:\d+:deviceSignal\b/i, /\bamazon publisher services\b/i]
  },
  {
    name: "reCAPTCHA Enterprise",
    category: "enterprise_device_risk",
    role: "bot and device-risk telemetry",
    domains: ["google.com", "www.google.com", "gstatic.com", "www.gstatic.com"],
    patterns: [/\/recaptcha\/enterprise(?:\.js|\/)/i, /\brecaptcha enterprise\b/i]
  },
  {
    name: "FullStory",
    category: "session_replay",
    role: "session recording and behavioral replay",
    domains: ["fullstory.com", "rs.fullstory.com", "edge.fullstory.com"],
    patterns: [/\bfullstory\b/i]
  },
  {
    name: "Braze",
    category: "marketing_automation",
    role: "customer engagement and marketing automation",
    domains: ["appboycdn.com", "js.appboycdn.com", "braze.com"],
    patterns: [/\bappboy\b/i, /\bbraze\b/i]
  },
  {
    name: "Meta Pixel",
    category: "adtech",
    role: "advertising pixel",
    domains: ["connect.facebook.net", "facebook.com", "www.facebook.com"],
    patterns: [/\bfbevents\.js\b/i, /\bmeta pixel\b/i, /\bfacebook pixel\b/i]
  },
  {
    name: "Reddit Pixel",
    category: "adtech",
    role: "advertising pixel",
    domains: ["redditstatic.com", "www.redditstatic.com"],
    patterns: [/\breddit.*pixel\b/i]
  },
  {
    name: "Microsoft Bing Ads",
    category: "adtech",
    role: "advertising conversion tracking",
    domains: ["bat.bing.com"],
    patterns: [/\bbing ads\b/i, /\bbat\.js\b/i]
  },
  {
    name: "Snapchat Pixel",
    category: "adtech",
    role: "advertising pixel",
    domains: ["sc-static.net", "tr.snapchat.com", "snapchat.com"],
    patterns: [/\bscevent\.min\.js\b/i, /\bsnapchat pixel\b/i]
  },
  {
    name: "Twitter/X Ads",
    category: "adtech",
    role: "advertising conversion tracking",
    domains: ["static.ads-twitter.com", "analytics.twitter.com", "t.co"],
    patterns: [/\btwitter\/x ads\b/i, /\buwt\.js\b/i, /\badsct\b/i]
  },
  {
    name: "Comscore / Scorecard Research",
    category: "adtech",
    role: "audience measurement",
    domains: ["scorecardresearch.com", "sb.scorecardresearch.com"],
    patterns: [/\bscorecardresearch\b/i, /\bcomscore\b/i]
  },
  {
    name: "The Trade Desk",
    category: "adtech",
    role: "programmatic advertising",
    domains: ["adsrvr.org", "js.adsrvr.org"],
    patterns: [/\bthe trade desk\b/i, /\badsrvr\b/i]
  },
  {
    name: "Sift",
    category: "device_signal",
    role: "fraud and device-risk telemetry",
    domains: ["sift.com", "cdn.sift.com"],
    patterns: [/\bsift\b/i]
  },
  {
    name: "TVSquared",
    category: "adtech",
    role: "TV attribution tracking",
    domains: ["tvsquared.com"],
    patterns: [/\btvsquared\b/i, /\btv2track\.js\b/i]
  },
  {
    name: "Singular",
    category: "adtech",
    role: "marketing attribution",
    domains: ["singular.net", "web-sdk-cdn.singular.net"],
    patterns: [/\bsingular\b/i]
  },
  {
    name: "Sportradar",
    category: "sports_data_advertising",
    role: "sports data advertising and audience infrastructure",
    domains: ["sportradar.com", "ads.sportradar.com", "tm.ads.sportradar.com"],
    patterns: [/\bsportradar\b/i]
  },
  {
    name: "Rokt",
    category: "post_purchase_advertising",
    role: "post-purchase advertising and offer optimization",
    domains: ["rokt.com", "apps.rokt.com"],
    patterns: [/\brokt\b/i, /\breferral-tag\.js\b/i]
  },
  {
    name: "Digital Turbine / Barometric",
    category: "cross_device_identity",
    role: "cross-device identity resolution",
    domains: ["barometric.com", "digitalturbine.com"],
    patterns: [/\bbarometric\b/i, /\bbarometric\[cuid\]/i]
  },
];

const HEALTH_CONTEXT_PATTERNS = [
  /\bhealth\b/i,
  /\bmedical\b/i,
  /\bclinic(?:al)?\b/i,
  /\bhospital\b/i,
  /\bpatient\b/i,
  /\bsymptom\b/i,
  /\bcondition\b/i,
  /\bdiagnos/i,
  /\bmedscape\b/i,
  /\bwebmd\b/i,
  /\bmayoclinic\b/i,
  /\beverydayhealth\b/i,
  /\bverywellhealth\b/i,
  /\bdrugs\.com\b/i
];

const GAMBLING_CONTEXT_PATTERNS = [
  /\bgambling\b/i,
  /\bsportsbook\b/i,
  /\bsports betting\b/i,
  /\bcasino\b/i,
  /\bwager(?:ing)?\b/i,
  /\bbet(?:ting)?\b/i,
  /\bdraftkings\b/i,
  /\bfanduel\b/i,
  /\bbetmgm\b/i,
  /\bcaesars sportsbook\b/i,
  /\bresponsible gam(?:ing|bling)\b/i,
  /\b1-800-gambler\b/i
];

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()))];
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getStringArray(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function getBoolean(record: Record<string, unknown> | null | undefined, key: string) {
  return typeof record?.[key] === "boolean" ? record[key] === true : null;
}

function hostnameFromUrl(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function domainMatches(candidate: string, domain: string) {
  const normalizedCandidate = candidate.toLowerCase().replace(/^\.+/, "");
  const normalizedDomain = domain.toLowerCase().replace(/^\.+/, "");
  return normalizedCandidate === normalizedDomain || normalizedCandidate.endsWith(`.${normalizedDomain}`);
}

function collectTextEvidence(input: {
  hostname?: string | null;
  snapshot?: Record<string, unknown> | null;
  runtimeArtifacts?: Record<string, unknown> | null;
  evidenceUrls?: string[];
  thirdPartyDomains?: string[];
}) {
  const snapshot = getRecord(input.snapshot);
  const runtimeArtifacts = getRecord(input.runtimeArtifacts);
  const evidenceUrls = uniqueStrings([
    ...(input.evidenceUrls ?? []),
    ...getStringArray(runtimeArtifacts, "consent_baseline_tracker_evidence_urls"),
    ...getStringArray(runtimeArtifacts, "consent_post_reject_tracker_evidence_urls"),
    ...getStringArray(runtimeArtifacts, "consent_post_accept_tracker_evidence_urls")
  ]);
  const thirdPartyDomains = uniqueStrings([
    ...(input.thirdPartyDomains ?? []),
    ...getStringArray(runtimeArtifacts, "third_party_request_domains"),
    ...getStringArray(snapshot, "third_party_request_domains"),
    ...evidenceUrls.map(hostnameFromUrl)
  ]);
  const textValues = uniqueStrings([
    input.hostname ?? null,
    typeof snapshot?.registered_domain === "string" ? snapshot.registered_domain : null,
    typeof snapshot?.final_url === "string" ? snapshot.final_url : null,
    typeof snapshot?.finalUrl === "string" ? snapshot.finalUrl : null,
    ...evidenceUrls,
    ...thirdPartyDomains,
    ...getStringArray(runtimeArtifacts, "consent_baseline_tracker_script_hosts"),
    ...getStringArray(runtimeArtifacts, "initial_cookie_names"),
    ...getStringArray(runtimeArtifacts, "initialCookieNames"),
    ...getStringArray(runtimeArtifacts, "local_storage_keys"),
    ...getStringArray(runtimeArtifacts, "session_storage_keys")
  ]);

  return { evidenceUrls, textValues, thirdPartyDomains };
}

export function deriveHighRiskTrackingContext(input: {
  hostname?: string | null;
  snapshot?: Record<string, unknown> | null;
  runtimeArtifacts?: Record<string, unknown> | null;
  evidenceUrls?: string[];
  thirdPartyDomains?: string[];
}): HighRiskTrackingContext {
  const snapshot = getRecord(input.snapshot);
  const runtimeArtifacts = getRecord(input.runtimeArtifacts);
  const { evidenceUrls, textValues, thirdPartyDomains } = collectTextEvidence(input);
  const haystack = textValues.join("\n");
  const isHealthContext =
    getBoolean(snapshot, "healthcare_site_likely") === true ||
    getBoolean(snapshot, "mentions_health_data") === true ||
    getBoolean(snapshot, "form_collects_health_information") === true ||
    getBoolean(snapshot, "high_sensitivity_data_collection_detected") === true ||
    HEALTH_CONTEXT_PATTERNS.some((pattern) => pattern.test(haystack));
  const isGamblingContext = GAMBLING_CONTEXT_PATTERNS.some((pattern) => pattern.test(haystack));
  const isSensitiveContext = isHealthContext || isGamblingContext;
  const sensitiveContextLabel = isHealthContext
    ? "health information site"
    : isGamblingContext
      ? "sports betting or gambling site"
      : null;

  const highRiskVendors = HIGH_RISK_VENDOR_RULES.flatMap((rule): HighRiskTrackingVendor[] => {
    const evidence = uniqueStrings([
      ...thirdPartyDomains.filter((domain) => (rule.domains ?? []).some((ruleDomain) => domainMatches(domain, ruleDomain))),
      ...textValues.filter((value) => (rule.patterns ?? []).some((pattern) => pattern.test(value))).slice(0, 4)
    ]);

    if (evidence.length === 0) {
      return [];
    }

    return [{
      category: rule.category,
      evidence,
      name: rule.name,
      role: rule.role
    }];
  });

  const cmpVendors = detectKnownCmps({
    cookieNames: [
      ...getStringArray(runtimeArtifacts, "initial_cookie_names"),
      ...getStringArray(runtimeArtifacts, "initialCookieNames")
    ],
    domains: thirdPartyDomains,
    labels: [typeof snapshot?.cmp_vendor_name === "string" ? snapshot.cmp_vendor_name : ""],
    storageKeys: [
      ...getStringArray(runtimeArtifacts, "local_storage_keys"),
      ...getStringArray(runtimeArtifacts, "localStorageKeys"),
      ...getStringArray(runtimeArtifacts, "session_storage_keys"),
      ...getStringArray(runtimeArtifacts, "sessionStorageKeys")
    ],
    textSnippets: textValues,
    urls: evidenceUrls
  }).map((detection): HighRiskTrackingVendor => ({
    category: "cmp",
    evidence: uniqueStrings(detection.matchedSignals.map((signal) => signal.value)).slice(0, 4),
    name: detection.canonicalName,
    role: "consent management platform"
  }));
  const cmpVendorName = cmpVendors[0]?.name ?? null;

  return {
    cmpVendors,
    cmpVendorName,
    highRiskVendors,
    isSensitiveContext,
    sensitiveContextLabel
  };
}

export function formatHighRiskVendorSummary(vendors: HighRiskTrackingVendor[], limit = 3) {
  return vendors.slice(0, limit).map((vendor) => `${vendor.name} (${vendor.role})`);
}
