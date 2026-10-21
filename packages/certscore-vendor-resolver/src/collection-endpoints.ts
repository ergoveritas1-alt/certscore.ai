/** Versioned resource-role classification, independent of vendor ownership,
 * recipient identity and legal interpretation. Raw support contacts stay retained. */
export const COLLECTION_ENDPOINT_POLICY_VERSION = "canonical_collection_endpoint.v5";

export function classifyCanonicalCollectionEndpoint(
  url: string,
  resourceType: string | undefined,
): { observed: boolean; category?: string } {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return { observed: false }; }
  if (!["https:", "http:"].includes(parsed.protocol)) return { observed: false };
  const hostname = parsed.hostname;
  const path = parsed.pathname;
  // GPT dictionaries are supporting resources even when delivered without a
  // .js suffix. A successful download does not establish visitor collection.
  if (hostname === "securepubads.g.doubleclick.net" && /^\/pagead\/managed\/dict(?:\/|$)/i.test(path)) {
    return { observed: false, category: "vendor_configuration" };
  }
  if (["www.google.com", "google.com", "pagead2.googlesyndication.com", "ad.doubleclick.net"].includes(hostname) &&
      /^\/ccm\/(?:s\/)?collect\/?$/i.test(path)) {
    return { observed: true, category: "google_consent_or_tag_support" };
  }
  if (hostname === "pagead2.googlesyndication.com" && /^\/pagead\/gen_204\/?$/i.test(path)) {
    return { observed: true, category: "advertising_measurement_support" };
  }
  // The OpenX pd HTML document bootstraps child work. A later cookie-sync or
  // identity-bearing request is assessed separately. Publisher/configuration
  // parameters such as plm do not identify a visitor.
  if (/(?:^|\.)openx\.net$/i.test(hostname) && /^\/w\/1\.0\/pd\/?$/i.test(path) &&
      resourceType === "document" && ![...parsed.searchParams].some(([key,value]) =>
        /^(?:uid|uuid|puid|user_id|visitor_id)$/i.test(key) && value.length > 0)) {
    return { observed: false, category: "identity_sync_bootstrap" };
  }
  // Retain the explicitly declared processing qualifier. It does not erase an
  // actual identity-bearing ad event or independently prove that GPC is honored.
  if (/^(?:www\.)?facebook\.com$/i.test(hostname) && /^\/tr\/?$/i.test(path) &&
      (parsed.searchParams.get("dpo") ?? "").split(/[,\s]+/).includes("LDU")) {
    return { observed: true, category: "restricted_use_advertising_collection" };
  }
  // Successful verification telemetry and a sync-frame download are observable
  // activity, but do not by themselves establish advertising/identity collection.
  // Any later identity-bearing collector request is assessed independently.
  if (hostname === "pagead2.googlesyndication.com" && /^\/pagead\/sodar\/?$/i.test(path)) {
    return { observed: true, category: "security_or_performance_support" };
  }
  if (hostname === "pixel.adsafeprotected.com" && /^\/services\/pub\/?$/i.test(path)) {
    return { observed: true, category: "advertising_measurement_support" };
  }
  if (hostname === "ads.pubmatic.com" && /^\/AdServer\/js\/user_sync\.html$/i.test(path)) {
    return { observed: false, category: "identity_sync_bootstrap" };
  }
  // Vendor purpose alone does not establish collection by a code/style/font
  // resource. Retained SDK downloads can be labeled fetch or xhr, so inspect
  // the pathname independently of resource type. Vendor activity stays retained.
  // Dynamic script beacons and image collectors remain eligible below.
  if (/\.(?:m?js|css|woff2?|ttf|otf|eot)$/i.test(path)) {
    return { observed: false };
  }
  // Configuration and support requests remain vendor activity. Neither a
  // vendor hostname nor a successful config response establishes collection.
  if ((hostname === "config.aps.amazon-adsystem.com" && /^\/configs(?:\/|$)/i.test(path)) ||
      (hostname === "pixel-config.reddit.com" && /^\/v[0-9]+\/config(?:\/|$)/i.test(path))) {
    return { observed: false, category: "vendor_configuration" };
  }
  if (hostname === "pagead2.googlesyndication.com" && /^\/pagead\/ping$/i.test(path)) {
    return { observed: true, category: "advertising_measurement_support" };
  }
  if (/^(?:www\.)?google\.com$/i.test(hostname)) {
    if (/^\/ccm\/collect\b/i.test(path)) {
      return { observed: true, category: "google_consent_or_tag_support" };
    }
    if (/^\/(?:pagead|ads|aclk|gmp\/conversion)\b/i.test(path) || /\/conversion\b/i.test(path)) {
      return { observed: true, category: "advertising_collection" };
    }
    if (/^\/recaptcha\//i.test(path)) {
      return { observed: false, category: "google_recaptcha_or_security" };
    }
  }
  if ((hostname === "bat.bing.com" && /^\/action\//i.test(path)) ||
      (hostname === "ct.pinterest.com" && /^\/(?:ct(?:\.html)?|v3)(?:\/|$)/i.test(path))) {
    return { observed: true, category: "advertising_collection" };
  }
  const endpointPatterns: Array<[RegExp, string]> = [
    [/google-analytics\.com$/i, "analytics_collection"],
    [/doubleclick\.net$/i, "advertising_collection"],
    [/facebook\.com$/i, "advertising_collection"],
    [/clarity\.ms$/i, "session_replay_collection"],
    [/hotjar\.(?:com|io)$/i, "session_replay_collection"],
    [/fullstory\.com$/i, "session_replay_collection"],
    [/analytics\.tiktok\.com$/i, "advertising_collection"],
    [/px\.ads\.linkedin\.com$/i, "advertising_collection"],
    [/p\.tvpixel\.com$/i, "runtime_collection"],
    [/\.omtrdc\.net$/i, "analytics_collection"],
    [/\.2o7\.net$/i, "analytics_collection"],
    [/\.demdex\.net$/i, "analytics_collection"],
    [/\.amazon-adsystem\.com$/i, "advertising_collection"],
    [/\.adsrvr\.org$/i, "advertising_collection"],
    [/\.criteo\.(?:com|net)$/i, "advertising_collection"],
    [/\.rlcdn\.com$/i, "advertising_collection"],
    [/\.crwdcntrl\.net$/i, "advertising_collection"],
    [/\.pubmatic\.com$/i, "advertising_collection"],
    [/\.rubiconproject\.com$/i, "advertising_collection"],
    [/\.openx\.net$/i, "advertising_collection"],
    [/\.casalemedia\.com$/i, "advertising_collection"],
    [/\.quantserve\.com$/i, "advertising_collection"],
    [/\.amplitude\.com$/i, "analytics_collection"],
    [/\.mixpanel\.com$/i, "analytics_collection"],
    [/\.posthog\.com$/i, "analytics_collection"],
    [/\.px-cloud\.net$/i, "security_or_performance_support"],
    [/\.go-mpulse\.net$/i, "security_or_performance_support"],
    [/\.nr-data\.net$/i, "security_or_performance_support"],
    [/\.newrelic\.com$/i, "security_or_performance_support"],
    [/\.forter\.com$/i, "security_or_performance_support"],
    [/^(?:prod\d+-)?live-chat\.sprinklr\.com$/i, "customer_support"],
    [/\.tapad\.com$/i, "advertising_collection"],
    [/\.singular\.net$/i, "advertising_collection"],
    [/^pixel-config\.reddit\.com$/i, "advertising_collection"],
  ];
  const pathPatterns: Array<[RegExp, string]> = [
    [/\/(?:g\/)?collect\b/i, "analytics_collection"],
    [/\/j\/collect\b/i, "analytics_collection"],
    [/\/tr\b/i, "advertising_collection"],
    [/\/events?\b/i, "advertising_collection"],
    [/\/pagead\//i, "advertising_collection"],
    [/\/activityi\b/i, "advertising_collection"],
    [/\/rec\//i, "session_replay_collection"],
  ];
  for (const [pattern, category] of [...endpointPatterns, ...pathPatterns]) {
    const target = endpointPatterns.some(([item]) => item === pattern) ? hostname : path;
    if (pattern.test(target)) {
      return { observed: true, category };
    }
  }
  if (resourceType && ["xhr", "fetch", "beacon"].includes(resourceType) && /collect|event|pixel/i.test(url)) {
    return { observed: true, category: "runtime_collection" };
  }
  return { observed: false };
}

/** Only a collection role can qualify a vendor-resolved advertising request.
 * Consent/measurement support and configuration contacts stay review evidence.
 * NPA/cookieless flags alone do not prove either sale/sharing or its absence. */
export function isCanonicalAdvertisingCollectionCandidate(url: string, resourceType?: string): boolean {
  const result = classifyCanonicalCollectionEndpoint(url, resourceType);
  return result.observed && !["google_consent_or_tag_support", "advertising_measurement_support",
    "security_or_performance_support", "customer_support"].includes(result.category ?? "");
}
