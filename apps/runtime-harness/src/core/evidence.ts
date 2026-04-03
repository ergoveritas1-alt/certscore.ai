import { resolveCname } from "node:dns/promises";
import type {
  BrowserObservationCollectorSnapshot,
  CnameCandidate,
  CnameCloakRecord,
  CnameObservation,
  ClassificationSummary,
  ConsentSummary,
  ConsentUiSummary,
  ConsentSignalTimingSummary,
  ConsentVisualSummary,
  CookieDetectionRecord,
  CookieDiffRecord,
  CookieRiskSummaryRecord,
  CookieWriteObservation,
  CookieSnapshot,
  DomainVendorRegistryRecord,
  FingerprintingAttributeCategory,
  FingerprintingCollectorSnapshot,
  FingerprintingSummary,
  KeyloggingSummary,
  LeakMapRecord,
  MediaSummary,
  NavigationSummary,
  NetworkSummary,
  PageSnapshotSummary,
  PreConsentVendorSummary,
  PreConsentRequestRecord,
  RedirectRecord,
  RequestObservation,
  RequestToVendorObservation,
  RequestRecord,
  ResponseRecord,
  RunQualitySummary,
  StorageSummary,
  RuntimeMetadata,
  TimingSummary,
  UiSummary,
  VendorLeaderboardSummary,
  VendorCategory,
  VendorSummaryExtended
} from "./types";
import { matchUrlToVendor } from "./classify";

const FINGERPRINTING_BURST_WINDOW_MS = 1_500;
const FINGERPRINTING_NETWORK_WINDOW_MS = 2_000;
const FINGERPRINTING_IDENTIFIER_HINTS = /(?:^|[_-])(fp|fingerprint|visitor|device|browser|entropy|canvas|audio|webgl|screen|tz|timezone)(?:[_-]|$)|\b(fp|fingerprint|visitor|device|browser|entropy)\b/i;
const IDENTIFIER_HINTS = /(^|_|-)(id|uid|uuid|guid|visitor|device|fingerprint|session|token|anon|client|account|property|pixel|cid|sid)(_|-|$)|\b(id|uid|uuid|guid|visitor|device|fingerprint|token|clientid|measurement_id|container_id)\b/i;
const DEVICE_DATA_HINTS =
  /\b(screen|width|height|viewport|color|pixel|lang|locale|tz|timezone|platform|ua|useragent|device|memory|hardware|audio|canvas|webgl|font|battery|touch|media|plugins?|sr|ul|uaa|uab|uafvl|uamb|uam|uap|uapv|uaw|dt|de)\b/i;
const COLLECTION_ENDPOINT_HINTS = /\b(collect|events?|track|beacon|analytics|measure|pixel|capture|ingest|telemetry|log)\b/i;
const AD_VIDEO_HINTS = /\b(ad|vast|ima|preroll|midroll|doubleclick|adsystem)\b/i;
const POPUP_SAMPLE_CAP = 20;
const REQUEST_SAMPLE_CAP = 20;
const VENDOR_SAMPLE_CAP = 20;
const COOKIE_SAMPLE_CAP = 20;
const KEY_SAMPLE_CAP = 10;
const KNOWN_BOT_REQUEST_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "cloudflare_bot_management",
    pattern: /cdn-cgi\/challenge-platform|cdn-cgi\/rum|cloudflareinsights\.com\/beacon\.min\.js|challenges\.cloudflare\.com|turnstile|cf_chl/i
  },
  {
    label: "perimeterx",
    pattern: /perimeterx|px-cloud|px-client/i
  },
  {
    label: "datadome",
    pattern: /datadome/i
  },
  {
    label: "arkoselabs",
    pattern: /arkoselabs|funcaptcha/i
  },
  {
    label: "human_security",
    pattern: /human-security|humansecurity/i
  },
  {
    label: "fingerprint_botd",
    pattern: /fingerprint\.com\/botd/i
  }
];
const KNOWN_FINGERPRINT_REQUEST_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "fingerprintjs",
    pattern: /fingerprintjs|fingerprint2|fpjs/i
  },
  {
    label: "clientjs",
    pattern: /clientjs/i
  },
  {
    label: "deviceatlas",
    pattern: /deviceatlas/i
  }
];

const HIGH_SIGNAL_VENDORS = new Set([
  "Amplitude",
  "AppLovin",
  "DoubleClick / Floodlight",
  "Google Analytics",
  "Google Tag Manager",
  "LinkedIn Insight",
  "Reddit Ads",
  "Riskified",
  "TikTok",
  "Twitter / X"
]);

const COOKIE_RISK_RULES: Array<{
  cookieNames: string[];
  id: string;
  match: (cookie: CookieDetectionRecord) => boolean;
  severity: CookieRiskSummaryRecord["severity"];
  title: string;
  vendorNames: string[];
}> = [
  {
    cookieNames: ["_gcl_au"],
    id: "cookie_google_ads_conversion_linker",
    match: (cookie) => cookie.cookieName === "_gcl_au",
    severity: "high",
    title: "Google Ads conversion linker cookie observed during passive scan",
    vendorNames: ["Google"]
  },
  {
    cookieNames: ["_ga", "_ga_*"],
    id: "cookie_google_analytics",
    match: (cookie) => cookie.cookieName === "_ga" || cookie.cookieName.startsWith("_ga_"),
    severity: "high",
    title: "Google Analytics cookie observed during passive scan",
    vendorNames: ["Google Analytics", "Google"]
  },
  {
    cookieNames: ["_fbp"],
    id: "cookie_meta_pixel",
    match: (cookie) => cookie.cookieName === "_fbp",
    severity: "critical",
    title: "Meta Pixel cookie observed during passive scan",
    vendorNames: ["Meta Pixel"]
  },
  {
    cookieNames: ["IDE"],
    id: "cookie_doubleclick",
    match: (cookie) => cookie.cookieName === "IDE",
    severity: "critical",
    title: "DoubleClick retargeting cookie observed during passive scan",
    vendorNames: ["DoubleClick / Floodlight"]
  },
  {
    cookieNames: ["_rdt_uuid"],
    id: "cookie_reddit_ads",
    match: (cookie) => cookie.cookieName === "_rdt_uuid",
    severity: "high",
    title: "Reddit Ads cookie observed during passive scan",
    vendorNames: ["Reddit Ads"]
  },
  {
    cookieNames: ["_ttp", "_tt_enable_cookie", "ttcsid*"],
    id: "cookie_tiktok",
    match: (cookie) => cookie.cookieName === "_ttp" || cookie.cookieName === "_tt_enable_cookie" || cookie.cookieName.startsWith("ttcsid"),
    severity: "high",
    title: "TikTok tracking cookie observed during passive scan",
    vendorNames: ["TikTok"]
  }
];

function hostnameFromUrl(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isThirdPartyHost(requestedUrl: string, candidateUrl: string) {
  const requestedHost = hostnameFromUrl(requestedUrl);
  const candidateHost = hostnameFromUrl(candidateUrl);
  if (!requestedHost || !candidateHost) {
    return null;
  }
  return candidateHost !== requestedHost && !candidateHost.endsWith(`.${requestedHost}`);
}

function cappedUnique(values: Array<string | null | undefined>, limit = KEY_SAMPLE_CAP) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))].slice(0, limit);
}

function getQueryKeys(value: string) {
  const parsed = parseUrl(value);
  if (!parsed) {
    return [];
  }
  return cappedUnique([...parsed.searchParams.keys()]);
}

function requestLooksIdentifierLike(value: string) {
  const parsed = parseUrl(value);
  if (!parsed) {
    return false;
  }
  if (IDENTIFIER_HINTS.test(parsed.pathname)) {
    return true;
  }
  return [...parsed.searchParams.keys()].some((key) => IDENTIFIER_HINTS.test(key));
}

function requestLooksDeviceDataLike(value: string) {
  const parsed = parseUrl(value);
  if (!parsed) {
    return false;
  }
  return [...parsed.searchParams.keys()].some((key) => DEVICE_DATA_HINTS.test(key));
}

function collectionEndpointLike(value: string) {
  const parsed = parseUrl(value);
  return parsed ? COLLECTION_ENDPOINT_HINTS.test(parsed.pathname) : false;
}

function responseLookup(input: { requests: RequestRecord[]; responses: ResponseRecord[] }) {
  const byUrl = new Map<string, ResponseRecord[]>();
  for (const response of input.responses) {
    const list = byUrl.get(response.url) ?? [];
    list.push(response);
    byUrl.set(response.url, list);
  }
  for (const list of byUrl.values()) {
    list.sort((left, right) => left.timestampMs - right.timestampMs);
  }
  return (request: RequestRecord) => (byUrl.get(request.url) ?? []).find((response) => response.timestampMs >= request.timestampMs) ?? null;
}

function inferVendorCategory(record: { category?: VendorCategory; endpointHostname?: string; vendorName?: string | null }): keyof VendorSummaryExtended["vendorCategoryCounts"] {
  if (record.category === "analytics") return "analytics";
  if (record.category === "advertising") return "ads";
  const hostname = record.endpointHostname ?? "";
  const vendorName = record.vendorName ?? "";
  const haystack = `${hostname} ${vendorName}`.toLowerCase();
  if (/replay|hotjar|fullstory|logrocket/.test(haystack)) return "session_replay";
  if (/cloudflare|akamai|perimeterx|human|riskified|captcha|datadome|waf/.test(haystack)) return "fraud_security";
  if (/cdn|cloudfront|fastly|gstatic|googleapis|jsdelivr|unpkg/.test(haystack)) return "cdn_infra";
  if (/identity|auth|login|okta|auth0/.test(haystack)) return "identity";
  if (/personaliz|recommend|optimiz|segment/.test(haystack)) return "personalization";
  if (/facebook|meta|linkedin|reddit|twitter|tiktok|pinterest|snap/.test(haystack)) return "social";
  return record.category === "functional" ? "cdn_infra" : "unknown";
}

function isFingerprintingCategory(value: string): value is FingerprintingAttributeCategory {
  return [
    "audio",
    "canvas_webgl",
    "fonts_plugins",
    "hardware",
    "input_touch",
    "media_devices",
    "network_device_state",
    "screen_viewport",
    "storage",
    "timezone_locale"
  ].includes(value);
}

function summarizeFingerprintingCollector(collector: FingerprintingCollectorSnapshot | null) {
  const attributeCategories = (collector?.categories ?? [])
    .filter(
      (category): category is { firstSeenMs: number; hits: number; name: FingerprintingAttributeCategory } =>
        isFingerprintingCategory(category.name) && typeof category.firstSeenMs === "number"
    )
    .map((category) => ({
      firstSeenMs: category.firstSeenMs,
      hits: Math.max(1, Math.min(category.hits, 3)),
      name: category.name
    }))
    .sort((left, right) => left.firstSeenMs - right.firstSeenMs || left.name.localeCompare(right.name));

  const firstSeen = attributeCategories.map((category) => category.firstSeenMs);
  const burstDetected =
    firstSeen.length >= 3 &&
    firstSeen.some((startMs, index) => {
      const window = firstSeen.slice(index).filter((value) => value - startMs <= FINGERPRINTING_BURST_WINDOW_MS);
      return window.length >= 3;
    });

  const firstCollectionTimestampMs = firstSeen[0] ?? null;

  return {
    attributeCategories,
    attributeCategoryCount: attributeCategories.length,
    burstDetected,
    firstCollectionTimestampMs,
    identifierShapingDetected: collector?.identifierShapingDetected === true
  };
}

function hasPostCollectionRequest(input: {
  afterMs: number | null;
  requestedUrl: string;
  requests: RequestRecord[];
}) {
  const requestedHost = hostnameFromUrl(input.requestedUrl);
  if (!requestedHost || input.afterMs === null) {
    return {
      networkAfterCollection: false,
      thirdPartyAfterCollection: false
    };
  }

  let networkAfterCollection = false;
  let thirdPartyAfterCollection = false;

  for (const request of input.requests) {
    if (request.timestampMs < input.afterMs || request.timestampMs > input.afterMs + FINGERPRINTING_NETWORK_WINDOW_MS) {
      continue;
    }
    const requestHost = hostnameFromUrl(request.url);
    if (!requestHost) {
      continue;
    }
    networkAfterCollection = true;
    if (requestHost !== requestedHost && !requestHost.endsWith(`.${requestedHost}`)) {
      thirdPartyAfterCollection = true;
      break;
    }
  }

  return {
    networkAfterCollection,
    thirdPartyAfterCollection
  };
}

function inferIdentifierShaping(input: {
  collectorIdentifierShapingDetected: boolean;
  requests: RequestRecord[];
}) {
  if (input.collectorIdentifierShapingDetected) {
    return true;
  }

  return input.requests.some((request) => {
    try {
      const url = new URL(request.url);
      return [...url.searchParams.keys()].some((key) => FINGERPRINTING_IDENTIFIER_HINTS.test(key));
    } catch {
      return false;
    }
  });
}

function inferKnownRequestMatch(input: {
  requests: RequestRecord[];
  patterns: Array<{ label: string; pattern: RegExp }>;
}) {
  for (const request of input.requests) {
    for (const pattern of input.patterns) {
      if (pattern.pattern.test(request.url)) {
        return pattern.label;
      }
    }
  }
  return null;
}

function summarizeRequestFingerprintHints(input: {
  requestedUrl: string;
  requests: RequestRecord[];
}) {
  let deviceDataLikeRequestCount = 0;
  let identifierLikeRequestCount = 0;
  let thirdPartyIdentifierLikeRequestCount = 0;

  for (const request of input.requests) {
    const identifierLike = requestLooksIdentifierLike(request.url);
    const deviceDataLike = requestLooksDeviceDataLike(request.url);

    if (identifierLike) {
      identifierLikeRequestCount += 1;
      if (isThirdPartyHost(input.requestedUrl, request.url) === true) {
        thirdPartyIdentifierLikeRequestCount += 1;
      }
    }

    if (deviceDataLike) {
      deviceDataLikeRequestCount += 1;
    }
  }

  return {
    deviceDataLikeRequestCount,
    identifierLikeRequestCount,
    thirdPartyIdentifierLikeRequestCount
  };
}

export function buildFingerprintingSummary(input: {
  collector: FingerprintingCollectorSnapshot | null;
  consentUi: ConsentUiSummary;
  requestedUrl: string;
  requests: RequestRecord[];
}): FingerprintingSummary {
  const collectorSummary = summarizeFingerprintingCollector(input.collector);
  const firstCollectionTimestampMs = collectorSummary.firstCollectionTimestampMs;
  const { networkAfterCollection, thirdPartyAfterCollection } = hasPostCollectionRequest({
    afterMs: firstCollectionTimestampMs,
    requestedUrl: input.requestedUrl,
    requests: input.requests
  });
  const identifierShapingDetected = inferIdentifierShaping({
    collectorIdentifierShapingDetected: collectorSummary.identifierShapingDetected,
    requests: input.requests
  });
  const requestFingerprintHints = summarizeRequestFingerprintHints({
    requestedUrl: input.requestedUrl,
    requests: input.requests
  });
  const knownBotLibraryMatch =
    input.collector?.knownBotLibraryMatch ??
    inferKnownRequestMatch({
      requests: input.requests,
      patterns: KNOWN_BOT_REQUEST_PATTERNS
    });
  const knownFingerprintLibraryMatch =
    input.collector?.knownFingerprintLibraryMatch ??
    inferKnownRequestMatch({
      requests: input.requests,
      patterns: KNOWN_FINGERPRINT_REQUEST_PATTERNS
    });
  const preConsent: FingerprintingSummary["signals"]["preConsent"] =
    firstCollectionTimestampMs === null || input.consentUi.firstDetectedTimestampMs === null
      ? "unknown"
      : firstCollectionTimestampMs < input.consentUi.firstDetectedTimestampMs
        ? "true"
        : "false";

  const signals = {
    attributeCategories: collectorSummary.attributeCategories,
    attributeCategoryCount: collectorSummary.attributeCategoryCount,
    burstDetected: collectorSummary.burstDetected,
    collectionPattern:
      collectorSummary.attributeCategoryCount >= 3 && (identifierShapingDetected || networkAfterCollection)
        ? "multi_stage"
        : collectorSummary.burstDetected
          ? "multi_category_burst"
          : "isolated",
    firstPartyInvolved: collectorSummary.attributeCategoryCount > 0 ? true : null,
    identifierShapingDetected,
    knownBotLibraryMatch,
    knownFingerprintLibraryMatch,
    networkAfterCollection,
    preConsent,
    thirdPartyInvolved: thirdPartyAfterCollection || networkAfterCollection ? true : null,
    thirdPartyAfterCollection
  } as const;

  const reasons: string[] = [];
  if (signals.attributeCategoryCount > 0) {
    reasons.push(`Observed ${signals.attributeCategoryCount} fingerprint-relevant attribute categories.`);
  }
  if (signals.burstDetected) {
    reasons.push("Multiple attribute categories were accessed in a short window.");
  }
  if (signals.identifierShapingDetected) {
    reasons.push("Observed identifier-like structuring or shaping behavior.");
  }
  if (requestFingerprintHints.deviceDataLikeRequestCount > 0) {
    reasons.push(`Observed ${requestFingerprintHints.deviceDataLikeRequestCount} requests carrying device or browser attribute hints.`);
  }
  if (requestFingerprintHints.identifierLikeRequestCount > 0) {
    reasons.push(`Observed ${requestFingerprintHints.identifierLikeRequestCount} identifier-like requests.`);
  }
  if (signals.knownFingerprintLibraryMatch) {
    reasons.push(`Matched known fingerprint library pattern: ${signals.knownFingerprintLibraryMatch}.`);
  }
  if (signals.knownBotLibraryMatch) {
    reasons.push(`Matched known anti-bot or bot-detection pattern: ${signals.knownBotLibraryMatch}.`);
  }
  if (signals.networkAfterCollection) {
    reasons.push(signals.thirdPartyAfterCollection ? "Observed outbound third-party requests after collection." : "Observed outbound requests after collection.");
  }
  if (signals.preConsent === "true") {
    reasons.push("Collection started before consent UI was observed.");
  }

  let tier: FingerprintingSummary["tier"] = 0;
  if (signals.attributeCategoryCount >= 3 && signals.identifierShapingDetected && signals.networkAfterCollection) {
    tier = 3;
  } else if (
    signals.attributeCategoryCount >= 3 &&
    (signals.burstDetected || signals.networkAfterCollection || signals.identifierShapingDetected)
  ) {
    tier = 2;
  } else if (signals.attributeCategoryCount >= 2) {
    tier = 1;
  } else if (
    (signals.knownBotLibraryMatch || signals.knownFingerprintLibraryMatch) &&
    (requestFingerprintHints.identifierLikeRequestCount > 0 || requestFingerprintHints.deviceDataLikeRequestCount > 0)
  ) {
    tier = 1;
  }

  let confidence: FingerprintingSummary["confidence"] = "low";
  if (tier === 3 || (tier === 2 && signals.thirdPartyAfterCollection)) {
    confidence = "high";
  } else if (tier >= 2 || (tier === 1 && signals.networkAfterCollection)) {
    confidence = "medium";
  } else if (
    tier === 1 &&
    (signals.knownBotLibraryMatch || signals.knownFingerprintLibraryMatch) &&
    requestFingerprintHints.identifierLikeRequestCount > 0 &&
    requestFingerprintHints.deviceDataLikeRequestCount > 0
  ) {
    confidence = "medium";
  }

  const summary =
    tier === 0
      ? "No meaningful multi-signal fingerprinting pattern was observed during this scan."
      : tier === 1
        ? signals.attributeCategoryCount > 0
          ? "The page accessed a small number of fingerprint-relevant categories, but the observed pattern remained closer to basic telemetry than likely fingerprinting."
          : "The page loaded known anti-bot or fingerprint-related tooling and emitted identifier or device-oriented telemetry, which is suspicious but not enough to confirm active fingerprinting."
        : tier === 2
          ? "The page showed multi-signal device and browser data collection consistent with potential fingerprinting."
          : "The page showed multi-signal device and browser data collection, identifier-like shaping, and subsequent network activity consistent with likely fingerprinting.";

  return {
    confidence,
    reasons,
    signals,
    summary,
    tier
  };
}

export function buildFingerprintApiEventSamples(collector: FingerprintingCollectorSnapshot | null) {
  return (collector?.eventSamples ?? []).slice(0, 10).sort((left, right) => left.tsMs - right.tsMs);
}

export function buildNetworkSummary(input: {
  consentUi: ConsentUiSummary;
  requestedUrl: string;
  requests: RequestRecord[];
  responses: ResponseRecord[];
}): NetworkSummary {
  const requestedHost = hostnameFromUrl(input.requestedUrl);
  const thirdPartyDomains = new Set<string>();
  const requestTypeCounts: NetworkSummary["requestTypeCounts"] = {
    beacon: 0,
    document: 0,
    fetch: 0,
    iframe: 0,
    image: 0,
    other: 0,
    script: 0,
    xhr: 0
  };
  let firstPartyRequestCount = 0;
  let thirdPartyRequestCount = 0;
  let preConsentRequestCount = 0;
  let preConsentThirdPartyRequestCount = 0;
  let thirdPartyScriptCount = 0;
  let identifierLikeRequestCount = 0;
  let thirdPartyIdentifierLikeRequestCount = 0;
  let deviceDataLikeRequestCount = 0;
  let suspiciousQueryKeyCount = 0;
  let collectionEndpointCount = 0;
  const requestTimes = input.requests.map((request) => request.timestampMs).sort((left, right) => left - right);

  for (const request of input.requests) {
    const resourceType = (request.resourceType ?? "").toLowerCase();
    const requestType =
      resourceType === "script" || resourceType === "xhr" || resourceType === "fetch" || resourceType === "beacon" || resourceType === "image" || resourceType === "iframe" || resourceType === "document"
        ? (resourceType as keyof NetworkSummary["requestTypeCounts"])
        : "other";
    requestTypeCounts[requestType] += 1;

    const thirdParty = requestedHost ? isThirdPartyHost(input.requestedUrl, request.url) === true : false;
    if (thirdParty) {
      thirdPartyRequestCount += 1;
      const host = hostnameFromUrl(request.url);
      if (host) thirdPartyDomains.add(host);
      if (resourceType === "script") {
        thirdPartyScriptCount += 1;
      }
    } else {
      firstPartyRequestCount += 1;
    }

    if (input.consentUi.firstDetectedTimestampMs !== null && request.timestampMs < input.consentUi.firstDetectedTimestampMs) {
      preConsentRequestCount += 1;
      if (thirdParty) {
        preConsentThirdPartyRequestCount += 1;
      }
    }

    const identifierLike = requestLooksIdentifierLike(request.url);
    const deviceDataLike = requestLooksDeviceDataLike(request.url);
    if (identifierLike) {
      identifierLikeRequestCount += 1;
      if (thirdParty) {
        thirdPartyIdentifierLikeRequestCount += 1;
      }
    }
    if (deviceDataLike) {
      deviceDataLikeRequestCount += 1;
    }
    suspiciousQueryKeyCount += getQueryKeys(request.url).filter((key) => IDENTIFIER_HINTS.test(key) || DEVICE_DATA_HINTS.test(key)).length;
    if (collectionEndpointLike(request.url)) {
      collectionEndpointCount += 1;
    }
  }

  let maxWindowCount = 0;
  for (let index = 0; index < requestTimes.length; index += 1) {
    const start = requestTimes[index] ?? 0;
    const count = requestTimes.slice(index).filter((ts) => ts - start <= 1_000).length;
    maxWindowCount = Math.max(maxWindowCount, count);
  }

  return {
    collectionEndpointCount,
    deviceDataLikeRequestCount,
    firstPartyRequestCount,
    identifierLikeRequestCount,
    preConsentRequestCount,
    preConsentThirdPartyRequestCount,
    redirectCount: input.responses.filter((response) => typeof response.status === "number" && response.status >= 300 && response.status < 400).length,
    requestBurstScore: maxWindowCount >= 20 ? "high" : maxWindowCount >= 8 ? "medium" : "low",
    requestTypeCounts,
    suspiciousQueryKeyCount,
    thirdPartyDomainCount: thirdPartyDomains.size,
    thirdPartyIdentifierLikeRequestCount,
    thirdPartyRequestCount,
    thirdPartyScriptCount,
    totalRequestCount: input.requests.length
  };
}

export function buildRequestObservations(input: {
  requestedUrl: string;
  requests: RequestRecord[];
  responses: ResponseRecord[];
}): RequestObservation[] {
  const getResponse = responseLookup(input);
  return input.requests
    .filter((request) => isThirdPartyHost(input.requestedUrl, request.url) === true || requestLooksIdentifierLike(request.url) || requestLooksDeviceDataLike(request.url))
    .slice(0, REQUEST_SAMPLE_CAP)
    .map((request) => {
      const response = getResponse(request);
      const parsed = parseUrl(request.url);
      return {
        deviceDataLike: requestLooksDeviceDataLike(request.url),
        domain: hostnameFromUrl(request.url) ?? "unknown",
        frameContext: request.frameUrl && request.frameUrl !== input.requestedUrl ? "iframe" : request.frameUrl ? "top_frame" : "unknown",
        identifierLike: requestLooksIdentifierLike(request.url),
        loadTimeMs: null,
        mimeType: response?.headers?.["content-type"] ?? response?.headers?.["Content-Type"] ?? null,
        pathSample: parsed?.pathname ?? "/",
        queryKeysSample: getQueryKeys(request.url),
        requestSizeBytes: null,
        resourceType: request.resourceType,
        responseSizeBytes: Number(response?.headers?.["content-length"] ?? response?.headers?.["Content-Length"]) || null,
        responseTimeMs: response ? Math.max(response.timestampMs - request.timestampMs, 0) : null,
        scriptInitiator: request.initiatorUrl,
        statusCode: response?.status ?? null,
        thirdParty: isThirdPartyHost(input.requestedUrl, request.url) === true,
        tsMs: request.timestampMs
      };
    });
}

export function buildKeyloggingSummary(input: {
  browserCollector: BrowserObservationCollectorSnapshot | null;
  requestObservations: RequestObservation[];
  requestToVendorObservations: RequestToVendorObservation[];
}) : KeyloggingSummary {
  const probeRuns = input.browserCollector?.inputProbeRuns ?? [];
  const textInputEventSamples = input.browserCollector?.textInputEventSamples ?? [];
  const inputListenerRegistrations = input.browserCollector?.inputListenerRegistrations ?? [];

  const requestsDuringTyping = input.requestObservations.filter((request) =>
    probeRuns.some((probe) => {
      const probeEnd = probe.endMs ?? probe.startMs;
      return request.tsMs >= probe.startMs && request.tsMs <= probeEnd + 1_500;
    })
  );
  const thirdPartyRequestCountDuringTyping = requestsDuringTyping.filter((request) => request.thirdParty).length;
  const vendorNamesDuringTyping = cappedUnique(
    requestsDuringTyping.flatMap((request) => {
      const matched = input.requestToVendorObservations.find((row) => row.hostname === request.domain && row.vendor !== "unresolved");
      return matched?.vendor ? [matched.vendor] : [];
    }),
    12
  );

  let keyloggingRisk: KeyloggingSummary["keyloggingRisk"] = "none";
  if (probeRuns.length > 0 && textInputEventSamples.length > 0 && thirdPartyRequestCountDuringTyping > 0) {
    keyloggingRisk = "likely";
  } else if (probeRuns.length > 0 && (requestsDuringTyping.length > 0 || inputListenerRegistrations.length >= 3)) {
    keyloggingRisk = "possible";
  }

  return {
    inputListenerRegistrationCount: inputListenerRegistrations.length,
    keyloggingRisk,
    probeRunCount: probeRuns.length,
    requestCountDuringTyping: requestsDuringTyping.length,
    thirdPartyRequestCountDuringTyping,
    totalTextInputEventCount: textInputEventSamples.length,
    vendorNamesDuringTyping
  };
}

export function buildVendorSummaryExtended(input: {
  browserCollector: BrowserObservationCollectorSnapshot | null;
  consentUi: ConsentUiSummary;
  domainVendorRegistry: DomainVendorRegistryRecord[];
  requestedUrl: string;
}): VendorSummaryExtended {
  const counts: VendorSummaryExtended["vendorCategoryCounts"] = {
    ads: 0,
    analytics: 0,
    cdn_infra: 0,
    fraud_security: 0,
    identity: 0,
    personalization: 0,
    session_replay: 0,
    social: 0,
    unknown: 0
  };
  const normalizedVendors = cappedUnique(input.domainVendorRegistry.map((row) => row.vendorName), 50);
  let preConsentVendorCount = 0;
  let postInteractionOnlyVendorCount = 0;
  let ambiguousVendorCount = 0;
  for (const row of input.domainVendorRegistry) {
    const category = inferVendorCategory(row);
    counts[category] += 1;
    if (row.beforeConsentUiRequestCount > 0) {
      preConsentVendorCount += 1;
    }
    if (!row.vendorName) {
      ambiguousVendorCount += 1;
    }
    const firstInteractionMs = input.browserCollector?.firstInteractionMs ?? null;
    if (firstInteractionMs !== null && row.firstSeenTimestampMs > firstInteractionMs) {
      postInteractionOnlyVendorCount += 1;
    }
  }
  return {
    ambiguousVendorCount,
    normalizedVendors,
    postInteractionOnlyVendorCount,
    preConsentVendorCount,
    rawThirdPartyDomains: input.domainVendorRegistry.map((row) => row.endpointHostname).slice(0, 50),
    vendorCategoryCounts: counts
  };
}

export function buildRequestToVendorObservations(input: {
  consentUi: ConsentUiSummary;
  domainVendorRegistry: DomainVendorRegistryRecord[];
}): RequestToVendorObservation[] {
  return input.domainVendorRegistry.slice(0, VENDOR_SAMPLE_CAP).map((row) => ({
    category: inferVendorCategory(row),
    confidence: row.vendorName ? (row.isHighSignalVendor || row.requestCount >= 3 ? "high" : "medium") : "low",
    evidenceSource: row.vendorName ? "hostname" : row.sampleUrls.some((value) => COLLECTION_ENDPOINT_HINTS.test(value)) ? "path" : "signature",
    hostname: row.endpointHostname,
    preConsent: input.consentUi.firstDetectedTimestampMs === null ? null : row.beforeConsentUiRequestCount > 0,
    vendor: row.vendorName ?? "unresolved"
  }));
}

export function buildConsentSummary(input: {
  browserCollector: BrowserObservationCollectorSnapshot | null;
  consentUi: ConsentUiSummary;
  pageSnapshotSummary: PageSnapshotSummary | null;
}): ConsentSummary {
  const pageConsent = input.pageSnapshotSummary?.consent;
  const bannerPresent = pageConsent?.bannerPresent ?? input.consentUi.detected;
  const rejectPresent = pageConsent?.rejectPresent ?? input.consentUi.rejectPresent;
  const managePresent = pageConsent?.managePresent ?? input.consentUi.managePresent;
  const clicksToAccept = pageConsent?.clicksToAccept ?? (input.consentUi.acceptPresent ? 1 : null);
  const clicksToReject =
    pageConsent?.clicksToReject ??
    (input.consentUi.rejectPresent ? 1 : input.consentUi.managePresent ? 2 : null);
  return {
    acceptPresent: pageConsent?.acceptPresent ?? input.consentUi.acceptPresent,
    bannerDisappearedWithoutChoice: input.browserCollector ? input.browserCollector.consentDismissedWithoutChoice : null,
    bannerPresent,
    clicksToAccept,
    clicksToReject,
    closePresent: pageConsent?.closePresent ?? null,
    cmpDetected: pageConsent?.cmpDetected ?? bannerPresent,
    contentObstructed: pageConsent?.contentObstructed ?? null,
    cookieWallDetected: pageConsent?.cookieWallDetected ?? null,
    firstVisibleMs: pageConsent?.firstVisibleMs ?? input.consentUi.firstDetectedTimestampMs,
    managePresent,
    pageInteractionBlocked: pageConsent?.pageInteractionBlocked ?? null,
    precheckedCategoryCount: pageConsent?.precheckedCategoryCount ?? null,
    precheckedCategoryLabels: pageConsent?.precheckedCategoryLabels ?? [],
    rejectDepthClass: rejectPresent ? "same_layer" : managePresent ? "deeper_layer" : "absent",
    rejectPresent,
    rejectRequiresMoreClicks:
      pageConsent?.rejectRequiresMoreClicks ?? (clicksToAccept !== null && clicksToReject !== null ? clicksToReject > clicksToAccept : null),
    requestsBeforeAnyConsentAction: null,
    secondLayerPresent: pageConsent?.secondLayerPresent ?? managePresent,
    surfaceType: pageConsent?.surfaceType ?? (input.consentUi.selectorHint === "dialog" ? "modal" : bannerPresent ? "banner" : "unknown")
  };
}

export function buildConsentVisualSummary(input: {
  consentSummary: ConsentSummary;
  pageSnapshotSummary: PageSnapshotSummary | null;
}): ConsentVisualSummary {
  const visual = input.pageSnapshotSummary?.consentVisual;
  return {
    acceptOnly: visual?.acceptOnly ?? (input.consentSummary.acceptPresent && !input.consentSummary.rejectPresent ? true : null),
    acceptContrastRatio: visual?.acceptContrastRatio ?? null,
    acceptProminence: visual?.acceptProminence ?? (input.consentSummary.acceptPresent ? "medium" : "unknown"),
    contrastAsymmetryDetected:
      visual?.contrastAsymmetryDetected ??
      (visual?.acceptContrastRatio !== null &&
      visual?.acceptContrastRatio !== undefined &&
      visual?.rejectContrastRatio !== null &&
      visual?.rejectContrastRatio !== undefined
        ? visual.acceptContrastRatio - visual.rejectContrastRatio >= 1.5
        : null),
    ctaImbalanceDetected: visual?.ctaImbalanceDetected ?? (!input.consentSummary.rejectPresent && input.consentSummary.acceptPresent ? true : null),
    rejectHidden: visual?.rejectHidden ?? (input.consentSummary.rejectDepthClass === "deeper_layer" ? true : null),
    rejectContrastRatio: visual?.rejectContrastRatio ?? null,
    rejectLowContrast:
      visual?.rejectLowContrast ??
      (visual?.rejectContrastRatio !== null && visual?.rejectContrastRatio !== undefined ? visual.rejectContrastRatio < 4.5 : null),
    rejectProminence: visual?.rejectProminence ?? (input.consentSummary.rejectPresent ? "medium" : "none")
  };
}

export function buildUiSummary(input: {
  browserCollector: BrowserObservationCollectorSnapshot | null;
  consentSummary: ConsentSummary;
  pageSnapshotSummary: PageSnapshotSummary | null;
}): UiSummary {
  const pageUi = input.pageSnapshotSummary?.ui;
  return {
    dismissalPresent: pageUi?.dismissalPresent ?? input.consentSummary.closePresent,
    forcedActionRequired: pageUi?.forcedActionRequired ?? input.consentSummary.pageInteractionBlocked,
    fullScreenTakeover: pageUi?.fullScreenTakeover ?? null,
    interstitialDetected: pageUi?.interstitialDetected ?? false,
    modalDetected: pageUi?.modalDetected ?? input.consentSummary.surfaceType === "modal",
    overlayDetected: pageUi?.overlayDetected ?? input.consentSummary.bannerPresent,
    popupCount: Math.min(input.browserCollector?.popupCount ?? 0, POPUP_SAMPLE_CAP),
    repeatedResurfacing: pageUi?.repeatedResurfacing ?? null,
    scrollLocked: pageUi?.scrollLocked ?? input.consentSummary.pageInteractionBlocked,
    stickyTakeoverDetected: pageUi?.stickyTakeoverDetected ?? null
  };
}

export function buildStorageSummary(input: {
  browserCollector: BrowserObservationCollectorSnapshot | null;
  consentUi: ConsentUiSummary;
  cookieSnapshots: CookieSnapshot[];
  requestedUrl: string;
  responses: ResponseRecord[];
}): StorageSummary {
  const cookies = buildCookieDetections(input.cookieSnapshots);
  const requestedHost = hostnameFromUrl(input.requestedUrl);
  const thirdPartyCookieCount = cookies.filter((cookie) => {
    if (!cookie.cookieDomain || !requestedHost) return false;
    const domain = cookie.cookieDomain.replace(/^\./, "").toLowerCase();
    return domain !== requestedHost && !domain.endsWith(`.${requestedHost}`);
  }).length;
  const localWrites = input.browserCollector?.localStorageWrites ?? [];
  const sessionWrites = input.browserCollector?.sessionStorageWrites ?? [];
  const firstStorageWriteMs = [...localWrites, ...sessionWrites].map((entry) => entry.tsMs).sort((left, right) => left - right)[0] ?? null;
  return {
    cookiesBeforeConsentCount:
      input.consentUi.firstDetectedTimestampMs === null ? 0 : cookies.filter((cookie) => cookie.firstSeenTimestampMs < input.consentUi.firstDetectedTimestampMs!).length,
    cookiesSeenCount: cookies.length,
    identifierLikeStorageKeyCount:
      [...(input.browserCollector?.localStorageKeys ?? []), ...(input.browserCollector?.sessionStorageKeys ?? [])].filter((key) => IDENTIFIER_HINTS.test(key)).length,
    indexeddbUsed: input.browserCollector?.indexedDbUsed ?? false,
    localStorageKeySample: cappedUnique(input.browserCollector?.localStorageKeys ?? []),
    localStorageWriteDetected: localWrites.length > 0,
    sessionStorageKeySample: cappedUnique(input.browserCollector?.sessionStorageKeys ?? []),
    sessionStorageWriteDetected: sessionWrites.length > 0,
    setCookieResponseCount: input.responses.reduce((count, response) => count + (response.setCookieHeaders?.length ?? 0), 0),
    storageWrittenBeforeConsent:
      firstStorageWriteMs === null || input.consentUi.firstDetectedTimestampMs === null
        ? null
        : firstStorageWriteMs < input.consentUi.firstDetectedTimestampMs,
    thirdPartyCookieBeforeConsentCount:
      input.consentUi.firstDetectedTimestampMs === null
        ? 0
        : cookies.filter((cookie) => {
            if (!cookie.cookieDomain || !requestedHost) return false;
            const domain = cookie.cookieDomain.replace(/^\./, "").toLowerCase();
            const thirdParty = domain !== requestedHost && !domain.endsWith(`.${requestedHost}`);
            return thirdParty && cookie.firstSeenTimestampMs < input.consentUi.firstDetectedTimestampMs!;
          }).length,
    thirdPartyCookieCount,
    vendorLinkedStorageWriteCount: [...localWrites, ...sessionWrites].filter((entry) => /ga|fb|tt|pixel|visitor|device/i.test(entry.key)).length
  };
}

export function buildCookieWriteObservations(input: {
  browserCollector: BrowserObservationCollectorSnapshot | null;
  consentUi: ConsentUiSummary;
  cookieSnapshots: CookieSnapshot[];
  requestedUrl: string;
  responses: ResponseRecord[];
}): CookieWriteObservation[] {
  const requestedHost = hostnameFromUrl(input.requestedUrl);
  const detections = buildCookieDetections(input.cookieSnapshots);
  const jsCookieMap = new Map((input.browserCollector?.jsCookieWrites ?? []).map((entry) => [entry.cookieName, entry]));
  return detections.slice(0, COOKIE_SAMPLE_CAP).map((cookie) => {
    const domain = (cookie.cookieDomain ?? "").replace(/^\./, "").toLowerCase();
    const thirdParty = requestedHost ? domain !== requestedHost && !domain.endsWith(`.${requestedHost}`) : false;
    const jsWrite = jsCookieMap.get(cookie.cookieName);
    const matchingCookie = input.cookieSnapshots.flatMap((snapshot) => snapshot.cookies).find((entry) => entry.name === cookie.cookieName && entry.domain === cookie.cookieDomain);
    return {
      beforeConsent:
        input.consentUi.firstDetectedTimestampMs === null ? null : cookie.firstSeenTimestampMs < input.consentUi.firstDetectedTimestampMs,
      cookieChangedDuringOnPageAction: null,
      cookieChangedDuringPageLoad: true,
      cookieDuration: matchingCookie?.expires && matchingCookie.expires > 0 ? matchingCookie.expires : null,
      cookieExpirationDate: matchingCookie?.expires ? new Date(matchingCookie.expires * 1_000).toISOString() : null,
      cookieExpirationType: matchingCookie?.expires ? "persistent" : "session",
      cookieHttpInitiatorCount: input.responses.some((response) => (response.setCookieHeaders?.length ?? 0) > 0) ? 1 : 0,
      cookieHttpOnly: matchingCookie?.httpOnly ?? null,
      cookieInitiatorDomain: jsWrite ? requestedHost : matchingCookie?.domain ?? null,
      cookieInitiatorType: jsWrite ? "js" : "http",
      cookieInitiatorVendor: jsWrite ? null : matchUrlToVendor(`https://${matchingCookie?.domain ?? ""}`)?.name ?? null,
      cookieInstanceCount: 1,
      cookieJsInitiatorCount: jsWrite ? 1 : 0,
      cookieName: cookie.cookieName,
      cookiePartyType: thirdParty ? "third_party" : "first_party",
      cookiePath: matchingCookie?.path ?? null,
      cookieSameSite: matchingCookie?.sameSite ?? null,
      cookieSecure: matchingCookie?.secure ?? null,
      cookieSetMethod: jsWrite ? "javascript" : "http_header",
      cookieSizeBytes: cookie.valuePreview.length,
      cookieTagInitiatorCount: 0,
      domain: cookie.cookieDomain ?? "",
      setAtMs: jsWrite?.tsMs ?? cookie.firstSeenTimestampMs,
      thirdParty
    };
  });
}

export function buildMediaSummary(input: {
  browserCollector: BrowserObservationCollectorSnapshot | null;
  consentUi: ConsentUiSummary;
  pageSnapshotSummary: PageSnapshotSummary | null;
}): MediaSummary {
  const media = input.pageSnapshotSummary?.media;
  return {
    adVideoUnitDetected: media?.adVideoUnitDetected ?? null,
    audioPresent: media?.audioPresent ?? false,
    autoplayAttrAudioCount: media?.autoplayAttrAudioCount ?? 0,
    autoplayAttrVideoCount: media?.autoplayAttrVideoCount ?? 0,
    autoplayAudioObserved: media?.autoplayAudioObserved ?? false,
    autoplayBeforeConsent:
      media?.firstAutoplayMs === null || media?.firstAutoplayMs === undefined || input.consentUi.firstDetectedTimestampMs === null
        ? null
        : media.firstAutoplayMs < input.consentUi.firstDetectedTimestampMs,
    autoplayVideoObserved: media?.autoplayVideoObserved ?? false,
    mutedAutoplayVideo: media?.mutedAutoplayVideo ?? null,
    thirdPartyEmbedCount: media?.thirdPartyEmbedCount ?? 0,
    videoPresent: media?.videoPresent ?? false
  };
}

export function buildNavigationSummary(input: {
  browserCollector: BrowserObservationCollectorSnapshot | null;
  finalUrl: string | null;
  pageSnapshotSummary: PageSnapshotSummary | null;
  redirectChain: ResponseRecord[] | RedirectRecord[];
  requestedUrl: string;
}): NavigationSummary {
  const finalUrl = input.finalUrl;
  const requestedHost = hostnameFromUrl(input.requestedUrl);
  const finalHost = finalUrl ? hostnameFromUrl(finalUrl) : null;
  const redirectHopCount = input.redirectChain.length;
  return {
    affiliateOrTrackerRedirectDetected:
      redirectHopCount > 0
        ? input.redirectChain.some((row) => /(click|track|redirect|affiliate|adnxs|doubleclick|linksynergy|impact)/i.test("from" in row ? `${row.from} ${row.to}` : ""))
        : null,
    autoRedirect: finalUrl ? finalUrl !== input.requestedUrl : null,
    clientRedirectCount: input.browserCollector?.jsNavigationDetected ? 1 : 0,
    consentRelatedRedirectDetected:
      redirectHopCount > 0
        ? input.redirectChain.some((row) => /consent|privacy|cmp/.test(("from" in row ? `${row.from} ${row.to}` : "").toLowerCase()))
        : null,
    crossDomainHopCount: requestedHost && finalHost && requestedHost !== finalHost ? 1 : 0,
    finalUrl,
    initialUrl: input.requestedUrl,
    jsNavigationDetected: input.browserCollector?.jsNavigationDetected ?? false,
    metaRefreshDetected: input.pageSnapshotSummary?.navigation.metaRefreshDetected ?? false,
    redirectDelayMs: redirectHopCount > 0 && "timestampMs" in input.redirectChain[0]! ? input.redirectChain[0]!.timestampMs : null,
    redirectHopCount,
    serverRedirectCount: redirectHopCount
  };
}

export function buildPreConsentTimeline(input: {
  consentUi: ConsentUiSummary;
  requests: RequestRecord[];
  requestedUrl: string;
}) {
  const requestedHost = hostnameFromUrl(input.requestedUrl);
  const rows: PreConsentRequestRecord[] = [];

  for (const request of input.requests) {
    const host = hostnameFromUrl(request.url);
    if (!host || !requestedHost) {
      continue;
    }
    if (host === requestedHost || host.endsWith(`.${requestedHost}`)) {
      continue;
    }
    const matched = matchUrlToVendor(request.url);
    rows.push({
      beforeConsentUi:
        input.consentUi.firstDetectedTimestampMs === null ? null : request.timestampMs < input.consentUi.firstDetectedTimestampMs,
      category: matched?.category ?? "unknown",
      resourceType: request.resourceType,
      timestampMs: request.timestampMs,
      url: request.url,
      vendorName: matched?.name ?? null
    });
  }

  return rows.sort((left, right) => left.timestampMs - right.timestampMs);
}

export function buildPreConsentVendorSummary(rows: PreConsentRequestRecord[]): PreConsentVendorSummary {
  const categories: Record<VendorCategory, number> = {
    advertising: 0,
    analytics: 0,
    functional: 0,
    unknown: 0
  };
  const vendorCounts = new Map<string, number>();

  for (const row of rows) {
    categories[row.category] += 1;
    if (row.vendorName) {
      vendorCounts.set(row.vendorName, (vendorCounts.get(row.vendorName) ?? 0) + 1);
    }
  }

  return {
    categories,
    normalizedVendors: [...vendorCounts.keys()].sort(),
    vendorCounts: Object.fromEntries([...vendorCounts.entries()].sort((left, right) => left[0].localeCompare(right[0])))
  };
}

export function buildCookieDetections(snapshots: CookieSnapshot[]): CookieDetectionRecord[] {
  const firstSeen = new Map<string, CookieDetectionRecord>();

  for (const snapshot of snapshots) {
    for (const cookie of snapshot.cookies) {
      const key = `${cookie.domain ?? ""}:${cookie.name}`;
      if (firstSeen.has(key)) {
        continue;
      }
      firstSeen.set(key, {
        cookieDomain: cookie.domain,
        cookieName: cookie.name,
        firstSeenTimestampMs: snapshot.timestampMs,
        valuePreview: cookie.valuePreview
      });
    }
  }

  return [...firstSeen.values()].sort((left, right) => left.firstSeenTimestampMs - right.firstSeenTimestampMs);
}

export function buildCookieDiffs(snapshots: CookieSnapshot[]): CookieDiffRecord[] {
  const diffs: CookieDiffRecord[] = [];
  let previous = new Set<string>();
  let previousLabel: CookieSnapshot["label"] | "start" = "start";

  for (const snapshot of snapshots) {
    const current = new Set(snapshot.cookies.map((cookie) => `${cookie.domain ?? ""}:${cookie.name}`));
    const appeared = snapshot.cookies
      .filter((cookie) => !previous.has(`${cookie.domain ?? ""}:${cookie.name}`))
      .map((cookie) => ({
        cookieDomain: cookie.domain,
        cookieName: cookie.name,
        firstSeenTimestampMs: snapshot.timestampMs
      }));

    diffs.push({
      appeared,
      fromLabel: previousLabel,
      toLabel: snapshot.label
    });

    previous = current;
    previousLabel = snapshot.label;
  }

  return diffs;
}

export function buildLeakMap(input: { requestedUrl: string; requests: RequestRecord[] }): LeakMapRecord[] {
  const requestedHost = hostnameFromUrl(input.requestedUrl);
  const rows = new Map<string, LeakMapRecord>();

  for (const request of input.requests) {
    const host = hostnameFromUrl(request.url);
    if (!host || !requestedHost) {
      continue;
    }
    if (host === requestedHost || host.endsWith(`.${requestedHost}`)) {
      continue;
    }
    const matched = matchUrlToVendor(request.url);
    const existing = rows.get(host);
    if (existing) {
      existing.requestCount += 1;
      continue;
    }
    rows.set(host, {
      category: matched?.category ?? "unknown",
      endpointHostname: host,
      firstSeenTimestampMs: request.timestampMs,
      requestCount: 1,
      vendorName: matched?.name ?? null
    });
  }

  return [...rows.values()].sort((left, right) => left.firstSeenTimestampMs - right.firstSeenTimestampMs);
}

export function buildDomainVendorRegistry(input: {
  cnameCloaking: CnameCloakRecord[];
  consentUi: ConsentUiSummary;
  requestedUrl: string;
  requests: RequestRecord[];
  responses: ResponseRecord[];
}): DomainVendorRegistryRecord[] {
  const requestedHost = hostnameFromUrl(input.requestedUrl);
  const rows = new Map<string, DomainVendorRegistryRecord>();
  const cloakedHosts = new Map(input.cnameCloaking.map((record) => [record.cloakedHost, record] as const));

  const getOrCreate = (host: string, timestampMs: number, url: string) => {
    const existing = rows.get(host);
    if (existing) {
      if (timestampMs < existing.firstSeenTimestampMs) {
        existing.firstSeenTimestampMs = timestampMs;
      }
      if (existing.sampleUrls.length < 3 && !existing.sampleUrls.includes(url)) {
        existing.sampleUrls.push(url);
      }
      return existing;
    }

    const matched = matchUrlToVendor(url);
    const cloaked = cloakedHosts.get(host) ?? null;
    const record: DomainVendorRegistryRecord = {
      beforeConsentUiRequestCount: 0,
      beforeConsentUiSetCookieResponseCount: 0,
      category: matched?.category ?? "unknown",
      cnameChain: cloaked?.chain ?? null,
      cnameMatchedTrackerHost: cloaked?.matchedTrackerHost ?? null,
      cnameMatchedVendor: cloaked?.vendorName ?? null,
      endpointHostname: host,
      firstSeenTimestampMs: timestampMs,
      initiatorTypes: [],
      isCnameCloaked: Boolean(cloaked),
      isHighSignalVendor: matched?.name ? HIGH_SIGNAL_VENDORS.has(matched.name) : false,
      requestCount: 0,
      responseCount: 0,
      resourceTypes: [],
      sampleUrls: [url],
      setCookieResponseCount: 0,
      vendorName: matched?.name ?? null
    };
    rows.set(host, record);
    return record;
  };

  for (const request of input.requests) {
    const host = hostnameFromUrl(request.url);
    if (!host || !requestedHost) {
      continue;
    }
    if (host === requestedHost || host.endsWith(`.${requestedHost}`)) {
      continue;
    }
    const record = getOrCreate(host, request.timestampMs, request.url);
    record.requestCount += 1;
    if (input.consentUi.firstDetectedTimestampMs !== null && request.timestampMs < input.consentUi.firstDetectedTimestampMs) {
      record.beforeConsentUiRequestCount += 1;
    }
    if (request.resourceType && !record.resourceTypes.includes(request.resourceType)) {
      record.resourceTypes.push(request.resourceType);
    }
    if (request.initiatorType && !record.initiatorTypes.includes(request.initiatorType)) {
      record.initiatorTypes.push(request.initiatorType);
    }
  }

  for (const response of input.responses) {
    const host = hostnameFromUrl(response.url);
    if (!host || !requestedHost) {
      continue;
    }
    if (host === requestedHost || host.endsWith(`.${requestedHost}`)) {
      continue;
    }
    const record = getOrCreate(host, response.timestampMs, response.url);
    record.responseCount += 1;
    if (response.resourceType && !record.resourceTypes.includes(response.resourceType)) {
      record.resourceTypes.push(response.resourceType);
    }
    if ((response.setCookieHeaders?.length ?? 0) > 0) {
      record.setCookieResponseCount += 1;
      if (input.consentUi.firstDetectedTimestampMs !== null && response.timestampMs < input.consentUi.firstDetectedTimestampMs) {
        record.beforeConsentUiSetCookieResponseCount += 1;
      }
    }
  }

  for (const record of rows.values()) {
    record.initiatorTypes.sort();
    record.resourceTypes.sort();
    record.sampleUrls.sort();
  }

  return [...rows.values()].sort((left, right) => left.firstSeenTimestampMs - right.firstSeenTimestampMs);
}

function compareToConsentUi(firstSeenTimestampMs: number | null, consentUi: ConsentUiSummary): CookieRiskSummaryRecord["beforeConsentUi"] {
  if (firstSeenTimestampMs === null) {
    return "inconclusive";
  }
  if (consentUi.firstDetectedTimestampMs === null) {
    return "inconclusive";
  }
  return firstSeenTimestampMs < consentUi.firstDetectedTimestampMs ? "yes" : "no";
}

export function buildConsentSignalTimingSummary(input: {
  consentUi: ConsentUiSummary;
  timings: TimingSummary;
}): ConsentSignalTimingSummary {
  const candidates = [
    input.timings.firstThirdPartyRequestTimestampMs,
    input.timings.firstCookieTimestampMs,
    input.timings.firstHighSignalCookieTimestampMs
  ].filter((value): value is number => value !== null);
  const earliestSignalTimestampMs = candidates.length > 0 ? Math.min(...candidates) : null;

  let signalsPrecededConsentUi: ConsentSignalTimingSummary["signalsPrecededConsentUi"] = "inconclusive";
  if (earliestSignalTimestampMs !== null && input.consentUi.firstDetectedTimestampMs !== null) {
    signalsPrecededConsentUi = earliestSignalTimestampMs < input.consentUi.firstDetectedTimestampMs ? "yes" : "no";
  }

  return {
    earliestSignalTimestampMs,
    firstConsentUiTimestampMs: input.timings.firstConsentUiTimestampMs,
    firstCookieTimestampMs: input.timings.firstCookieTimestampMs,
    firstHighSignalCookieTimestampMs: input.timings.firstHighSignalCookieTimestampMs,
    firstThirdPartyRequestTimestampMs: input.timings.firstThirdPartyRequestTimestampMs,
    signalsPrecededConsentUi
  };
}

export function buildCookieRiskSummary(input: {
  consentUi: ConsentUiSummary;
  cookies: CookieDetectionRecord[];
  timings: TimingSummary;
}): CookieRiskSummaryRecord[] {
  return COOKIE_RISK_RULES.map((rule) => {
    const matches = input.cookies.filter(rule.match);
    const firstSeenTimestampMs = matches[0]?.firstSeenTimestampMs ?? null;
    return {
      beforeConsentUi: compareToConsentUi(firstSeenTimestampMs, input.consentUi),
      confidence: matches.length > 0 ? (input.consentUi.firstDetectedTimestampMs === null ? 0.9 : 0.98) : input.timings.firstCookieTimestampMs !== null ? 0.75 : 0.55,
      cookieDomains: [...new Set(matches.map((cookie) => cookie.cookieDomain).filter((value): value is string => Boolean(value)))].sort(),
      cookieNames: matches.map((cookie) => cookie.cookieName),
      firstSeenTimestampMs,
      id: rule.id,
      observed: matches.length > 0,
      severity: rule.severity,
      title: rule.title,
      vendorNames: rule.vendorNames
    };
  });
}

export function buildRunQualitySummary(input: {
  classification: ClassificationSummary;
  cookieRiskSummary: CookieRiskSummaryRecord[];
  domainVendorRegistry: DomainVendorRegistryRecord[];
  runtimeMetadata: RuntimeMetadata;
  stopReason: string;
  timings: TimingSummary;
}): RunQualitySummary {
  const rationale: string[] = [];
  const highSignalCookieObserved = input.cookieRiskSummary.some((item) => item.observed);
  const blockerInterference =
    input.classification.blockerSummary.outcome === "hard_block" ||
    input.classification.blockerSummary.outcome === "challenge_wall";

  let evidenceDepth: RunQualitySummary["evidenceDepth"] = "thin";
  if (input.classification.classification === "full_runtime" && input.domainVendorRegistry.length >= 10 && highSignalCookieObserved) {
    evidenceDepth = "full";
  } else if (input.classification.classification === "full_runtime" || input.domainVendorRegistry.length >= 5) {
    evidenceDepth = "moderate";
  }

  if (input.classification.classification === "full_runtime") {
    rationale.push("Run reached full runtime classification.");
  } else {
    rationale.push(`Run classified as ${input.classification.classification}.`);
  }
  if (highSignalCookieObserved) {
    rationale.push("At least one high-signal cookie was observed.");
  } else {
    rationale.push("No high-signal cookie was observed in this run.");
  }
  if (blockerInterference) {
    rationale.push(`Blocker summary indicates ${input.classification.blockerSummary.outcome}.`);
  } else if (input.classification.blockerSummary.outcome === "challenge_markers_runtime_reached") {
    rationale.push("Challenge markers were present, but runtime still reached third-party signals.");
  }
  rationale.push(`Stop reason: ${input.stopReason}`);

  const likelySufficientForFindings =
    input.classification.classification === "full_runtime" &&
    !blockerInterference &&
    (highSignalCookieObserved || input.domainVendorRegistry.length >= 10);

  let overallConfidence = 0.55;
  if (likelySufficientForFindings) {
    overallConfidence = highSignalCookieObserved ? 0.9 : 0.8;
  } else if (input.classification.classification === "full_runtime") {
    overallConfidence = 0.7;
  }
  if (input.runtimeMetadata.autoEscalated) {
    overallConfidence = Math.min(overallConfidence + 0.05, 0.95);
  }
  if (blockerInterference) {
    overallConfidence = Math.max(overallConfidence - 0.2, 0.3);
  }
  if (input.timings.firstHighSignalCookieTimestampMs === null && input.timings.observationEndedTimestampMs < 8_000) {
    overallConfidence = Math.max(overallConfidence - 0.05, 0.3);
  }

  return {
    blockerInterference,
    evidenceDepth,
    likelySufficientForFindings,
    overallConfidence,
    rationale,
    usedEscalation: input.runtimeMetadata.autoEscalated
  };
}

export function buildVendorLeaderboard(input: {
  domainVendorRegistry: DomainVendorRegistryRecord[];
  preConsentVendorSummary: PreConsentVendorSummary;
}): VendorLeaderboardSummary {
  const topDomains = [...input.domainVendorRegistry]
    .sort((left, right) => right.requestCount - left.requestCount || left.endpointHostname.localeCompare(right.endpointHostname))
    .slice(0, 10)
    .map((row) => ({
      category: row.category,
      endpointHostname: row.endpointHostname,
      requestCount: row.requestCount,
      vendorName: row.vendorName
    }));

  const topCookieSettingHosts = [...input.domainVendorRegistry]
    .filter((row) => row.setCookieResponseCount > 0)
    .sort(
      (left, right) =>
        right.setCookieResponseCount - left.setCookieResponseCount || right.requestCount - left.requestCount || left.endpointHostname.localeCompare(right.endpointHostname)
    )
    .slice(0, 10)
    .map((row) => ({
      endpointHostname: row.endpointHostname,
      requestCount: row.requestCount,
      setCookieResponseCount: row.setCookieResponseCount,
      vendorName: row.vendorName
    }));

  const topHighSignalVendors = [...input.domainVendorRegistry]
    .filter((row) => row.isHighSignalVendor && row.vendorName)
    .sort((left, right) => right.requestCount - left.requestCount || left.endpointHostname.localeCompare(right.endpointHostname))
    .slice(0, 10)
    .map((row) => ({
      requestCount: row.requestCount,
      vendorName: row.vendorName as string
    }));

  const vendorCategories = new Map<string, Set<VendorCategory>>();
  for (const row of input.domainVendorRegistry) {
    if (!row.vendorName) continue;
    const set = vendorCategories.get(row.vendorName) ?? new Set<VendorCategory>();
    set.add(row.category);
    vendorCategories.set(row.vendorName, set);
  }

  const topVendors = Object.entries(input.preConsentVendorSummary.vendorCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 10)
    .map(([vendorName, requestCount]) => {
      const categories = vendorCategories.get(vendorName);
      const singleCategory = categories && categories.size === 1 ? [...categories][0] ?? "mixed" : "mixed";
      const category: VendorLeaderboardSummary["topVendors"][number]["category"] =
        !categories || categories.size === 0 ? "mixed" : categories.size === 1 ? singleCategory : "mixed";
      return {
        category,
        requestCount,
        vendorName
      };
    });

  return {
    byCategory: input.preConsentVendorSummary.categories,
    topCookieSettingHosts,
    topDomains,
    topHighSignalVendors,
    topVendors
  };
}

const KNOWN_CLOAK_TARGETS = [
  "adobedc.net",
  "doubleclick.net",
  "googletagmanager.com",
  "google-analytics.com",
  "segment.com",
  "branch.io",
  "riskified.com"
];

function matchCloakTarget(host: string) {
  return KNOWN_CLOAK_TARGETS.find((domain) => host === domain || host.endsWith(`.${domain}`)) ?? null;
}

export async function detectCnameCloaking(input: { requestedUrl: string; requests: RequestRecord[] }): Promise<CnameCloakRecord[]> {
  const requestedHost = hostnameFromUrl(input.requestedUrl);
  if (!requestedHost) {
    return [];
  }

  const candidateHosts = [...new Set(
    input.requests
      .map((request) => hostnameFromUrl(request.url))
      .filter((host): host is string => Boolean(host && (host === requestedHost || host.endsWith(`.${requestedHost}`)) && host !== requestedHost))
  )];

  const results: CnameCloakRecord[] = [];
  for (const host of candidateHosts) {
    try {
      const chain = await resolveCname(host);
      if (chain.length === 0) {
        continue;
      }
      const terminal = chain.at(-1)?.toLowerCase() ?? null;
      const matchedTrackerHost = terminal ? matchCloakTarget(terminal) : null;
      const vendorName = terminal ? matchUrlToVendor(`https://${terminal}`)?.name ?? null : null;
      if (!matchedTrackerHost && !vendorName) {
        continue;
      }
      results.push({
        chain: [host, ...chain.map((item) => item.toLowerCase())],
        cloakedHost: host,
        matchedTrackerHost,
        vendorName
      });
    } catch {
      continue;
    }
  }

  return results;
}

export function buildCnameCandidates(input: { requestedUrl: string; requests: RequestRecord[] }): CnameCandidate[] {
  const requestedHost = hostnameFromUrl(input.requestedUrl);
  if (!requestedHost) {
    return [];
  }

  const candidates = new Map<
    string,
    {
      firstSeenMs: number | null;
      requestCount: number;
      sampleUrls: string[];
    }
  >();

  for (const request of input.requests) {
    const host = hostnameFromUrl(request.url);
    if (!host || host === requestedHost || !host.endsWith(`.${requestedHost}`)) {
      continue;
    }
    const current = candidates.get(host) ?? {
      firstSeenMs: null,
      requestCount: 0,
      sampleUrls: []
    };
    current.firstSeenMs = current.firstSeenMs === null ? request.timestampMs : Math.min(current.firstSeenMs, request.timestampMs);
    current.requestCount += 1;
    if (current.sampleUrls.length < 5 && !current.sampleUrls.includes(request.url)) {
      current.sampleUrls.push(request.url);
    }
    candidates.set(host, current);
  }

  return [...candidates.entries()]
    .map(([subdomain, value]) => ({
      appearsFirstParty: true,
      firstSeenMs: value.firstSeenMs,
      requestCount: value.requestCount,
      sampleUrls: value.sampleUrls,
      subdomain
    }))
    .sort((left, right) => (left.firstSeenMs ?? Number.MAX_SAFE_INTEGER) - (right.firstSeenMs ?? Number.MAX_SAFE_INTEGER) || right.requestCount - left.requestCount);
}

export function buildCnameObservations(records: CnameCloakRecord[]): CnameObservation[] {
  return records.map((record) => ({
    cnameChain: record.chain.slice(1),
    matchedTracker: record.matchedTrackerHost,
    subdomain: record.cloakedHost,
    terminalHost: record.chain.at(-1) ?? null,
    vendor: record.vendorName
  }));
}

export function getPersistedVendorsAfterReject(input: {
  preRejectRequests: RequestRecord[];
  postRejectRequests: RequestRecord[];
  requestedUrl: string;
}) {
  const before = new Set(
    buildPreConsentTimeline({
      consentUi: {
        acceptPresent: false,
        detected: false,
        firstDetectedTimestampMs: null,
        managePresent: false,
        rejectPresent: false,
        selectorHint: null,
        textSnippet: null
      },
      requests: input.preRejectRequests,
      requestedUrl: input.requestedUrl
    })
      .map((row) => row.vendorName)
      .filter((value): value is string => Boolean(value))
  );

  const after = new Set(
    buildPreConsentTimeline({
      consentUi: {
        acceptPresent: false,
        detected: false,
        firstDetectedTimestampMs: null,
        managePresent: false,
        rejectPresent: false,
        selectorHint: null,
        textSnippet: null
      },
      requests: input.postRejectRequests,
      requestedUrl: input.requestedUrl
    })
      .map((row) => row.vendorName)
      .filter((value): value is string => Boolean(value))
  );

  return [...after].filter((vendor) => before.has(vendor)).sort();
}

export function categoryLabel(category: VendorCategory) {
  return category;
}
