import type { CertScoreFinding, CertScoreFindingSection } from "./finding-registry";
import { getHybridRuntimeEvidence } from "./hybrid-runtime-evidence";
import {
  classifyRuntimeCookieCategory,
  isFunctionalCookieExcludedFromTrackingEvidence
} from "./runtime-cookie-evidence";
import type { ScanValidationFinding } from "./validation-review-linking";

type MinimalScanRecord = {
  events?: Array<{
    eventType?: string | null;
    metadataJson?: unknown;
  }> | null;
  runtimeArtifacts: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
  scan: {
    completedAt: string | null;
    createdAt: string;
    domainHostname?: string | null;
  };
  trackerVendors?: Array<Record<string, unknown>> | null;
  validationFindings?: ScanValidationFinding[] | null;
};

type DerivedPresentationSummary = {
  findings: CertScoreFinding[];
  groupedFindings: Array<{ section: CertScoreFindingSection; findings: CertScoreFinding[] }>;
  posture: "Clear" | "Watch" | "Action Needed";
  score: number | null;
  lastScannedAt: string;
  requestedHost: string | null;
  finalHost: string | null;
  landedOnDifferentHost: boolean;
  vendorCount: number;
  thirdPartyRequestCount: number;
  thirdPartyDomainCount: number;
  vendorCategoryCounts: Record<string, number>;
  trackerSummary: string;
  fingerprintLabel: string;
  fingerprintNarrative: string;
  rawAdtechHosts: string[];
  analyticsCookieNames: string[];
  adtechCookieNames: string[];
  securityCookieNames: string[];
  cookieNamesBeforeConsent: string[];
  thirdPartyCookieNamesSeen: string[];
  thirdPartyCookieNamesBeforeConsent: string[];
  resolvedVendorNames: string[];
  unresolvedVendorHosts: string[];
  preConsentVendorNames: string[];
  sessionReplayVendorNames: string[];
  topObservedEntities: Array<{ label: string; category: string; requestCount: number }>;
};

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function deriveEventFinalHost(
  events: MinimalScanRecord["events"],
  requestedHost: string | null
) {
  if (!Array.isArray(events) || events.length === 0) {
    return null;
  }

  for (const event of [...events].reverse()) {
    const metadata = getRecord(event.metadataJson);
    if (!metadata) {
      continue;
    }

    const candidateHost =
      deriveHostname(getString(metadata.currentUrl)) ??
      deriveHostname(getString(metadata.finalUrl)) ??
      deriveHostname(getString(metadata.resolvedHostname)) ??
      deriveHostname(getString(metadata.canonicalHost));

    if (!candidateHost) {
      continue;
    }

    if (!requestedHost || candidateHost !== requestedHost) {
      return candidateHost;
    }
  }

  return null;
}

function getObservedConsentSurface(input: {
  consentSummary: Record<string, unknown> | null;
  runtimeArtifacts: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
}) {
  const explicitBannerPresent = getBoolean(input.consentSummary?.bannerPresent);
  if (explicitBannerPresent !== null) {
    return explicitBannerPresent;
  }

  for (const value of [
    input.runtimeArtifacts?.consent_surface_observed,
    input.runtimeArtifacts?.consentSurfaceObserved,
    input.runtimeArtifacts?.cookie_banner_present,
    input.runtimeArtifacts?.cookieBannerPresent,
    input.runtimeArtifacts?.consentBannerPresent,
    input.snapshot?.consent_surface_observed,
    input.snapshot?.consentSurfaceObserved,
    input.snapshot?.cookie_banner_present,
    input.snapshot?.cookieBannerPresent
  ]) {
    const parsed = getBoolean(value);
    if (parsed !== null) {
      return parsed;
    }
  }

  const surfacedControls = [
    input.consentSummary?.acceptPresent,
    input.consentSummary?.rejectPresent,
    input.consentSummary?.managePresent,
    input.consentSummary?.closePresent
  ].some((value) => value === true);

  return surfacedControls ? true : null;
}

function getObservedConsentActionableChoice(input: {
  runtimeArtifacts: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
}) {
  for (const value of [
    input.runtimeArtifacts?.consent_actionable_choice_observed,
    input.runtimeArtifacts?.consentActionableChoiceObserved,
    input.runtimeArtifacts?.consent_reject_interaction_succeeded,
    input.runtimeArtifacts?.consentRejectInteractionSucceeded,
    input.runtimeArtifacts?.consent_accept_interaction_succeeded,
    input.runtimeArtifacts?.consentAcceptInteractionSucceeded,
    input.snapshot?.consent_actionable_choice_observed,
    input.snapshot?.consentActionableChoiceObserved
  ]) {
    const parsed = getBoolean(value);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

const GENERIC_IDENTIFIER_QUERY_KEYS = new Set([
  "id",
  "client_id",
  "container_id",
  "measurement_id",
  "gtm",
  "gtg_health",
  "cx",
  "cas",
  "bs",
  "has_opted_out_fedcm",
  "is_itp"
]);

const STRONG_IDENTIFIER_QUERY_KEY_PATTERN =
  /(^|_|-)(uid|uuid|guid|visitor|device|fingerprint|session|token|anon|account|property|pixel|cid|sid|distinct|member|customer|subscriber|email|mail|phone|user)(_|-|$)|\b(user_id|visitor_id|device_id|session_id|account_id|member_id|customer_id|subscriber_id|email_hash|phone_hash|distinct_id)\b/i;

function getObjectArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function hasOwnRecordValue(record: unknown, key: string) {
  return Boolean(record && typeof record === "object" && !Array.isArray(record) && Object.prototype.hasOwnProperty.call(record, key));
}

function getTrackerVendorNames(rows: Array<Record<string, unknown>> | null | undefined) {
  return uniqueStrings(
    (rows ?? []).flatMap((row) => {
      const vendorName =
        getString(row.vendorName) ??
        getString(row.vendor_name) ??
        getString(row.name) ??
        getString(row.label);
      return vendorName ? [vendorName] : [];
    })
  );
}

function deriveHostname(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.hostname || null;
  } catch {
    return value.includes("/") ? null : value;
  }
}

function normalizeComparableHost(value: string | null | undefined) {
  const host = deriveHostname(value);
  return host ? host.toLowerCase().replace(/^www\./, "") : null;
}

function looksLikeAdtechHost(host: string) {
  return /(adnxs|appnexus|infolinks|rtmark|media\.net|doubleclick|taboola|outbrain|criteo|pubmatic|rubicon|adsrvr|google-analytics|googletagmanager|plausible|cloudflareinsights|casalemedia|gumgum|3lift|bidswitch|id5-sync|openx|tapad|mathtag|scorecardresearch|quantserve|crwdcntrl)/i.test(
    host
  );
}

function looksLikeSessionReplayObservation(category: string | null, vendor: string | null, hostname: string | null) {
  return /session_replay|session replay|behavioral_analytics|behavioral analytics|session_intercept|siteintercept/i.test(category ?? "") ||
    /qualtrics|siteintercept|hotjar|fullstory|clarity|contentsquare|mouseflow/i.test(`${vendor ?? ""} ${hostname ?? ""}`);
}

function isConsentMechanismCookieName(name: string) {
  return /^(optanonconsent|optanonalertboxclosed|cookieconsent|euconsent-v2|tcfv2|cmapi_cookie_privacy|notice_preferences|notice_gdpr_prefs|cookieyes-consent|didomi_token)$/i.test(
    name
  ) || /^_sp_/i.test(name);
}

function classifyCookieName(name: string, domain: string | null) {
  if (isConsentMechanismCookieName(name)) {
    return "consent";
  }
  if (isFunctionalCookieExcludedFromTrackingEvidence(name, domain)) {
    return "security";
  }
  const runtimeCategory = classifyRuntimeCookieCategory(name, domain);
  if (runtimeCategory === "dmp" || runtimeCategory === "advertising" || runtimeCategory === "session_replay") {
    return "adtech";
  }
  if (runtimeCategory === "analytics") {
    return "analytics";
  }
  const normalized = `${name} ${domain ?? ""}`.toLowerCase();
  if (/(cf_clearance|__cf|recaptcha|akamai|datadome|perimeterx)/i.test(normalized)) {
    return "security";
  }
  if (/(uuid2|xandr|adnxs|anusercookie|rtmark|infolinks|doubleclick|criteo|cto_bundle|media\.net|pubmatic|krtbcookie|pugt|bidswitch|tuuid|id5|casalemedia|cmid|cmps|cmpro|gumgum|3lift|tluid|tapad|adsrvr|tdid|rubiconproject|openx|scorecardresearch|quantserve|crwdcntrl|panoramaid|_pubcid|(^|\\s)id($|\\s))/i.test(normalized)) {
    return "adtech";
  }
  if (/(^_ga|goog|gtm|plausible|analytics)/i.test(normalized)) {
    return "analytics";
  }
  return "other";
}

function getFingerprintLabel(tier: number | null) {
  if (tier === null || tier <= 0) {
    return "None detected";
  }
  if (tier === 1) {
    return "Light signals";
  }
  if (tier === 2) {
    return "Possible";
  }
  return "Probable";
}

function getFingerprintNarrative(input: {
  attributeCategoryCount: number;
  concreteThirdPartyIdentifierLikeRequestCount: number;
  deviceDataLikeRequestCount: number;
  rawAdtechHosts: string[];
  tier: number | null;
}) {
  if ((input.tier ?? 0) >= 2) {
    return getFingerprintLabel(input.tier);
  }
  if (
    input.concreteThirdPartyIdentifierLikeRequestCount > 0 &&
    (input.deviceDataLikeRequestCount > 0 || input.rawAdtechHosts.length > 0 || input.attributeCategoryCount >= 2)
  ) {
    return "Identity-rich telemetry observed";
  }
  return getFingerprintLabel(input.tier);
}

function deriveTopObservedEntities(input: {
  normalizedVendors: string[];
  rawHosts: string[];
  requestObservations: Record<string, unknown>[];
  vendorCategoryCounts: Record<string, number>;
}) {
  const hostCounts = new Map<string, number>();
  for (const row of input.requestObservations) {
    const domain = getString(row.domain);
    if (!domain) {
      continue;
    }
    hostCounts.set(domain, (hostCounts.get(domain) ?? 0) + 1);
  }

  return [...hostCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([label, requestCount]) => {
      let category = "unknown";
      if (/(cookielaw\.org|onetrust\.(?:com|io)|optanon|trustarc\.com|truste\.com|cookiebot\.com|cookieinformation\.com|privacy-mgmt\.com|consensu\.org|usercentrics|termly|fundingchoicesmessages\.google\.com)/i.test(label)) {
        category = "cmp";
      } else if (/cloudflare|fonts\.googleapis|fonts\.gstatic|google/.test(label)) {
        category = "functional";
      }
      if (/media\.net|adnxs|xandr/.test(label)) {
        category = "advertising";
      }
      if (/plausible|analytics/.test(label)) {
        category = "analytics";
      }
      return { category, label, requestCount };
    });
}

function deriveSummaryPosture(score: number | null) {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return "Clear" as const;
  }
  if (score < 50) {
    return "Action Needed" as const;
  }
  if (score < 72) {
    return "Watch" as const;
  }
  return "Clear" as const;
}

function getConcreteIdentifierLikeRequests(requestObservations: Record<string, unknown>[]) {
  return requestObservations.filter((row) => {
    if (row.identifierLike !== true) {
      return false;
    }

    const queryKeys = getStringArray(row.queryKeysSample);
    if (queryKeys.length === 0) {
      return false;
    }

    return queryKeys.some((key) => {
      const normalized = key.trim().toLowerCase();
      return !GENERIC_IDENTIFIER_QUERY_KEYS.has(normalized) && STRONG_IDENTIFIER_QUERY_KEY_PATTERN.test(normalized);
    });
  });
}

export function deriveCertScoreFindings(scanRecord: MinimalScanRecord): DerivedPresentationSummary {
  const hybrid = getHybridRuntimeEvidence(scanRecord.runtimeArtifacts);
  const networkSummary = getRecord(hybrid?.networkSummary);
  const vendorSummary = getRecord(hybrid?.vendorSummary);
  const consentSummary = getRecord(hybrid?.consentSummary);
  const consentVisual = getRecord(hybrid?.consentVisual);
  const uiSummary = getRecord(hybrid?.uiSummary);
  const storageSummary = getRecord(hybrid?.storageSummary);
  const fingerprintSummary = getRecord(hybrid?.fingerprintSummary);
  const mediaSummary = getRecord(hybrid?.mediaSummary);
  const navigationSummary = getRecord(hybrid?.navigationSummary);
  const keyloggingSummary = getRecord(hybrid?.keyloggingSummary);
  const requestToVendorObservations = getObjectArray(hybrid?.requestToVendorObservations);
  const requestObservations = getObjectArray(hybrid?.requestObservations);
  const cookieWriteObservations = getObjectArray(hybrid?.cookieWriteObservations);
  const sensitivePayloadViolations = getObjectArray(
    scanRecord.runtimeArtifacts?.sensitive_payload_violations ?? scanRecord.runtimeArtifacts?.sensitivePayloadViolations
  );
  const domainVendorRegistry = getObjectArray(scanRecord.runtimeArtifacts?.domainVendorRegistry ?? scanRecord.runtimeArtifacts?.domain_vendor_registry);
  const findings: CertScoreFinding[] = [];
  const legacyInitialCookieNames = getStringArray(scanRecord.runtimeArtifacts?.initial_cookie_names ?? scanRecord.runtimeArtifacts?.initialCookieNames);
  const legacyInitialCookieCount = getNumber(scanRecord.runtimeArtifacts?.initial_cookie_count ?? scanRecord.runtimeArtifacts?.initialCookieCount) ?? 0;

  const normalizedVendors = getStringArray(vendorSummary?.normalizedVendors);
  const rawThirdPartyDomains = getStringArray(vendorSummary?.rawThirdPartyDomains);
  const rawRequestHosts = uniqueStrings(
    requestObservations
      .filter((row) => row.thirdParty === true)
      .flatMap((row) => (typeof row.domain === "string" ? [row.domain] : []))
  );
  const rawAdtechHosts = uniqueStrings([...rawThirdPartyDomains, ...rawRequestHosts].filter(looksLikeAdtechHost));
  const preConsentRequestCount = getNumber(networkSummary?.preConsentRequestCount) ?? 0;
  const preConsentThirdPartyRequestCount = getNumber(networkSummary?.preConsentThirdPartyRequestCount) ?? 0;
  const requestsBeforeAnyConsentAction = getBoolean(consentSummary?.requestsBeforeAnyConsentAction);
  const hasExplicitPreConsentRuntimeEvidence =
    hasOwnRecordValue(networkSummary, "preConsentRequestCount") ||
    hasOwnRecordValue(networkSummary, "preConsentThirdPartyRequestCount") ||
    hasOwnRecordValue(consentSummary, "requestsBeforeAnyConsentAction");
  const persistedPreConsentViolationCount =
    getNumber(
      scanRecord.runtimeArtifacts?.consent_preconsent_violation_count ?? scanRecord.runtimeArtifacts?.consentPreconsentViolationCount
    ) ?? 0;
  const requestCount = getNumber(networkSummary?.totalRequestCount) ?? 0;
  const thirdPartyDomainCount = getNumber(networkSummary?.thirdPartyDomainCount) ?? rawThirdPartyDomains.length;
  const thirdPartyRequestCount = getNumber(networkSummary?.thirdPartyRequestCount) ?? 0;
  const vendorCategoryCountsRecord = getRecord(vendorSummary?.vendorCategoryCounts);
  const vendorCategoryCounts = Object.fromEntries(
    Object.entries(vendorCategoryCountsRecord ?? {}).filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value > 0)
  ) as Record<string, number>;
  const sessionReplayCategoryCount = getNumber(vendorCategoryCountsRecord?.session_replay) ?? 0;
  const collectionEndpointCount = getNumber(networkSummary?.collectionEndpointCount) ?? 0;
  const identifierLikeRequestCount = getNumber(networkSummary?.identifierLikeRequestCount) ?? 0;
  const thirdPartyIdentifierLikeRequestCount = getNumber(networkSummary?.thirdPartyIdentifierLikeRequestCount) ?? 0;
  const concreteIdentifierLikeRequests = getConcreteIdentifierLikeRequests(requestObservations);
  const concreteThirdPartyIdentifierLikeRequests = concreteIdentifierLikeRequests.filter((row) => row.thirdParty === true);
  const concreteIdentifierTransmissionEvidenceCount = concreteIdentifierLikeRequests.length + sensitivePayloadViolations.length;
  const deviceDataLikeRequestCount = getNumber(networkSummary?.deviceDataLikeRequestCount) ?? 0;
  const requestBurstScore = getString(networkSummary?.requestBurstScore);
  const fingerprintTier = getNumber(fingerprintSummary?.tier);
  const fingerprintConfidence = getString(fingerprintSummary?.confidence);
  const fingerprintReasons = getStringArray(fingerprintSummary?.reasons);
  const attributeCategoryCount = getNumber(fingerprintSummary?.attributeCategoryCount) ?? 0;
  const requestedHost = deriveHostname(scanRecord.scan.domainHostname);
  const eventFinalHost = deriveEventFinalHost(scanRecord.events, requestedHost);
  const finalHost =
    eventFinalHost ??
    deriveHostname(getString(navigationSummary?.finalUrl)) ??
    deriveHostname(getString(scanRecord.snapshot?.final_url)) ??
    deriveHostname(getString(scanRecord.snapshot?.finalUrl));
  const landedOnDifferentHost = Boolean(
    requestedHost &&
    finalHost &&
    normalizeComparableHost(requestedHost) !== normalizeComparableHost(finalHost)
  );
  const cookieBuckets = cookieWriteObservations.reduce<{
    adtech: string[];
    analytics: string[];
    security: string[];
  }>(
    (acc, row) => {
      const name = getString(row.cookieName) ?? getString(row.cookie_name);
      const domain = getString(row.domain);
      if (!name) {
        return acc;
      }
      const bucket = classifyCookieName(name, domain);
      if (bucket === "analytics") {
        acc.analytics.push(name);
      } else if (bucket === "adtech") {
        acc.adtech.push(name);
      } else if (bucket === "security") {
        acc.security.push(name);
      }
      return acc;
    },
    { adtech: [], analytics: [], security: [] }
  );
  const analyticsCookieNames = uniqueStrings(cookieBuckets.analytics);
  const adtechCookieNames = uniqueStrings(cookieBuckets.adtech);
  const securityCookieNames = uniqueStrings(cookieBuckets.security);
  const trackerVendorNames = getTrackerVendorNames(scanRecord.trackerVendors);
  const resolvedRequestVendors = uniqueStrings(
    requestToVendorObservations.flatMap((row) => {
      const vendor = getString(row.vendor);
      return vendor && vendor !== "unresolved" ? [vendor] : [];
    })
  );
  const unresolvedVendorHosts = uniqueStrings([
    ...requestToVendorObservations.flatMap((row) => {
      const vendor = getString(row.vendor);
      const hostname = getString(row.hostname);
      return (!vendor || vendor === "unresolved") && hostname ? [hostname] : [];
    }),
    ...domainVendorRegistry.flatMap((row) => {
      const vendor = getString(row.vendorName) ?? getString(row.vendor_name);
      const host = getString(row.endpointHostname) ?? getString(row.endpoint_hostname);
      return !vendor && host ? [host] : [];
    })
  ]);
  const resolvedVendorNames = uniqueStrings([...trackerVendorNames, ...normalizedVendors, ...resolvedRequestVendors]);
  const snapshotTrackerVendorCount = Math.max(
    getNumber(scanRecord.snapshot?.tracker_vendor_count) ?? 0,
    getNumber(scanRecord.snapshot?.trackerVendorCount) ?? 0
  );
  const effectiveVendorCount = Math.max(resolvedVendorNames.length, normalizedVendors.length, trackerVendorNames.length, snapshotTrackerVendorCount);
  const preConsentVendorNames = uniqueStrings(
    requestToVendorObservations.flatMap((row) => {
      const preConsent = row.preConsent === true || row.pre_consent === true;
      if (!preConsent) {
        return [];
      }
      const vendor = getString(row.vendor);
      const hostname = getString(row.hostname);
      return vendor && vendor !== "unresolved" ? [vendor] : hostname ? [hostname] : [];
    })
  );
  const sessionReplayVendorNames = uniqueStrings(
    requestToVendorObservations.flatMap((row) => {
      const category = getString(row.category);
      const vendor = getString(row.vendor);
      const hostname = getString(row.hostname);
      if (!looksLikeSessionReplayObservation(category, vendor, hostname)) {
        return [];
      }
      return vendor && vendor !== "unresolved" ? [vendor] : hostname ? [hostname] : [];
    })
  );
  const sessionReplayVendorCount =
    sessionReplayVendorNames.length > 0
      ? sessionReplayVendorNames.length
      : Math.max(
          sessionReplayCategoryCount,
          getNumber(scanRecord.snapshot?.session_replay_tracker_count) ?? 0
        );
  const highRiskFinancialPromotionDetected = [
    getBoolean(scanRecord.snapshot?.leverageLanguagePresent),
    getBoolean(scanRecord.snapshot?.leverage_language_present),
    getBoolean(scanRecord.snapshot?.marginTradingLanguagePresent),
    getBoolean(scanRecord.snapshot?.margin_trading_language_present),
    getBoolean(scanRecord.snapshot?.optionsOrFuturesLanguagePresent),
    getBoolean(scanRecord.snapshot?.options_or_futures_language_present),
    getBoolean(scanRecord.snapshot?.perpetualsOrDerivativesLanguagePresent),
    getBoolean(scanRecord.snapshot?.perpetuals_or_derivatives_language_present),
    getBoolean(scanRecord.snapshot?.stakingApyLanguagePresent),
    getBoolean(scanRecord.snapshot?.staking_apy_language_present),
    getBoolean(scanRecord.snapshot?.copyTradingLanguagePresent),
    getBoolean(scanRecord.snapshot?.copy_trading_language_present),
    getBoolean(scanRecord.snapshot?.aiTradingLanguagePresent),
    getBoolean(scanRecord.snapshot?.ai_trading_or_automated_trading_language_present)
  ].some((value) => value === true);
  const sessionReplayDetected =
    sessionReplayVendorCount > 0 ||
    scanRecord.snapshot?.session_replay_tool_detected === true ||
    scanRecord.snapshot?.session_replay_without_disclosure_detected === true;
  const keyloggingRisk = getString(keyloggingSummary?.keyloggingRisk);
  const requestsDuringTyping = getNumber(keyloggingSummary?.requestCountDuringTyping) ?? 0;
  const thirdPartyRequestsDuringTyping = getNumber(keyloggingSummary?.thirdPartyRequestCountDuringTyping) ?? 0;
  const inputListenerRegistrationCount = getNumber(keyloggingSummary?.inputListenerRegistrationCount) ?? 0;
  const typingVendors = getStringArray(keyloggingSummary?.vendorNamesDuringTyping);
  const consentSurfaceObserved = getObservedConsentSurface({
    consentSummary,
    runtimeArtifacts: scanRecord.runtimeArtifacts,
    snapshot: scanRecord.snapshot
  });
  const consentActionableChoiceObserved = getObservedConsentActionableChoice({
    runtimeArtifacts: scanRecord.runtimeArtifacts,
    snapshot: scanRecord.snapshot
  });
  const canAssertConsentTiming = consentSurfaceObserved === true || consentActionableChoiceObserved === true;
  const snapshotPreconsentTracking =
    scanRecord.snapshot?.preconsent_tracking_detected === true || scanRecord.snapshot?.tracking_before_consent_detected === true;
  const snapshotFirstPartyCookieBeforeConsent = scanRecord.snapshot?.first_party_cookie_set_before_consent === true;
  const snapshotThirdPartyCookieBeforeConsent = scanRecord.snapshot?.third_party_cookie_set_before_consent === true;
  const explicitPreConsentVendorCount = getNumber(vendorSummary?.preConsentVendorCount) ?? 0;
  const effectivePreConsentVendorCount = Math.max(explicitPreConsentVendorCount, preConsentVendorNames.length);
  const corroboratedPreConsentVendorCount =
    preConsentVendorNames.length > 0 ? Math.max(explicitPreConsentVendorCount, preConsentVendorNames.length) : 0;
  const hasCorroboratedPreConsentRuntimeEvidence =
    preConsentRequestCount > 0 ||
    preConsentThirdPartyRequestCount > 0 ||
    requestsBeforeAnyConsentAction === true ||
    preConsentVendorNames.length > 0 ||
    persistedPreConsentViolationCount > 0;
  const shouldTrustExplicitPreConsentRuntimeNo =
    hasExplicitPreConsentRuntimeEvidence && !hasCorroboratedPreConsentRuntimeEvidence;
  const snapshotPreConsentFallbackCount =
    !shouldTrustExplicitPreConsentRuntimeNo && snapshotPreconsentTracking && canAssertConsentTiming
      ? effectivePreConsentVendorCount > 0
        ? effectivePreConsentVendorCount
        : 1
      : 0;
  const effectivePreConsentThirdPartyRequestCount = Math.max(
    preConsentThirdPartyRequestCount,
    corroboratedPreConsentVendorCount,
    persistedPreConsentViolationCount,
    snapshotPreconsentTracking && !shouldTrustExplicitPreConsentRuntimeNo && canAssertConsentTiming ? effectivePreConsentVendorCount : 0
  );
  const effectivePreConsentRequestCount = Math.max(
    preConsentRequestCount,
    effectivePreConsentThirdPartyRequestCount,
    snapshotPreConsentFallbackCount
  );
  const cookieNamesSeen = uniqueStrings(
    cookieWriteObservations.flatMap((row) => {
      const cookieName = getString(row.cookieName) ?? getString(row.cookie_name);
      const domain = getString(row.domain) ?? getString(row.cookieDomain) ?? getString(row.cookie_domain);
      return cookieName && !isFunctionalCookieExcludedFromTrackingEvidence(cookieName, domain) ? [cookieName] : [];
    })
  );
  const thirdPartyCookieNamesSeen = uniqueStrings(
    cookieWriteObservations.flatMap((row) => {
      const cookieName = getString(row.cookieName) ?? getString(row.cookie_name);
      const domain = getString(row.domain) ?? getString(row.cookieDomain) ?? getString(row.cookie_domain);
      const isThirdParty =
        row.thirdParty === true ||
        getString(row.cookiePartyType) === "third_party" ||
        getString(row.cookie_party_type) === "third_party";
      return cookieName && isThirdParty && !isFunctionalCookieExcludedFromTrackingEvidence(cookieName, domain) ? [cookieName] : [];
    })
  );
  const explicitCookiesBeforeConsentCount = getNumber(storageSummary?.cookiesBeforeConsentCount) ?? 0;
  const explicitThirdPartyCookieBeforeConsentCount = getNumber(storageSummary?.thirdPartyCookieBeforeConsentCount) ?? 0;
  const hasExplicitCookieTimingEvidence =
    hasOwnRecordValue(storageSummary, "cookiesBeforeConsentCount") ||
    hasOwnRecordValue(storageSummary, "thirdPartyCookieBeforeConsentCount") ||
    cookieWriteObservations.some((row) => typeof row.beforeConsent === "boolean");
  const effectiveThirdPartyCookieBeforeConsentCount = Math.max(
    explicitThirdPartyCookieBeforeConsentCount,
    snapshotThirdPartyCookieBeforeConsent && !hasExplicitCookieTimingEvidence && canAssertConsentTiming
      ? Math.max(thirdPartyCookieNamesSeen.length, 1)
      : 0
  );
  const effectiveCookiesBeforeConsentCount = Math.max(
    explicitCookiesBeforeConsentCount,
    effectiveThirdPartyCookieBeforeConsentCount,
    (snapshotFirstPartyCookieBeforeConsent || snapshotThirdPartyCookieBeforeConsent) &&
      !hasExplicitCookieTimingEvidence &&
      canAssertConsentTiming
      ? Math.max(cookieNamesSeen.length, 1)
      : 0
  );
  const cookieNamesBeforeConsent =
    effectiveCookiesBeforeConsentCount > 0
      ? uniqueStrings([...cookieNamesSeen, ...legacyInitialCookieNames.filter((name) => !isFunctionalCookieExcludedFromTrackingEvidence(name))])
      : [];
  const thirdPartyCookieNamesBeforeConsent =
    effectiveThirdPartyCookieBeforeConsentCount > 0 ? uniqueStrings(thirdPartyCookieNamesSeen) : [];
  const effectiveAnalyticsCookieNames =
    analyticsCookieNames.length > 0 ? analyticsCookieNames : legacyInitialCookieNames.filter((name) => classifyCookieName(name, null) === "analytics");
  const effectiveAdtechCookieNames =
    adtechCookieNames.length > 0 ? adtechCookieNames : legacyInitialCookieNames.filter((name) => classifyCookieName(name, null) === "adtech");
  const effectiveSecurityCookieNames =
    securityCookieNames.length > 0 ? securityCookieNames : legacyInitialCookieNames.filter((name) => classifyCookieName(name, null) === "security");
  const topObservedEntities = deriveTopObservedEntities({
    normalizedVendors,
    rawHosts: rawThirdPartyDomains,
    requestObservations,
    vendorCategoryCounts
  });

  const derivedLastScannedAt = scanRecord.scan.completedAt ?? scanRecord.scan.createdAt;
  const derivedScore = getNumber(scanRecord.snapshot?.certscore_overall) ?? null;

  return {
    findings: [],
    groupedFindings: [],
    posture: deriveSummaryPosture(derivedScore),
    score: derivedScore,
    lastScannedAt: derivedLastScannedAt,
    requestedHost,
    finalHost,
    landedOnDifferentHost,
    vendorCount: effectiveVendorCount,
    thirdPartyRequestCount,
    thirdPartyDomainCount,
    vendorCategoryCounts,
    trackerSummary:
      effectiveVendorCount > 0
        ? effectiveVendorCount > resolvedVendorNames.length && resolvedVendorNames.length > 0
          ? `${effectiveVendorCount} vendor${effectiveVendorCount === 1 ? "" : "s"} observed, ${resolvedVendorNames.length} named across ${thirdPartyDomainCount} third-party domain${thirdPartyDomainCount === 1 ? "" : "s"}`
          : `${effectiveVendorCount} vendor${effectiveVendorCount === 1 ? "" : "s"} across ${thirdPartyDomainCount} third-party domain${thirdPartyDomainCount === 1 ? "" : "s"}`
        : thirdPartyDomainCount > 0
          ? `${thirdPartyDomainCount} third-party domain${thirdPartyDomainCount === 1 ? "" : "s"} observed`
          : "No meaningful third-party footprint observed",
    fingerprintLabel: getFingerprintLabel(fingerprintTier),
    fingerprintNarrative: getFingerprintNarrative({
      attributeCategoryCount,
      concreteThirdPartyIdentifierLikeRequestCount: concreteThirdPartyIdentifierLikeRequests.length,
      deviceDataLikeRequestCount,
      rawAdtechHosts,
      tier: fingerprintTier
    }),
    rawAdtechHosts,
    analyticsCookieNames: effectiveAnalyticsCookieNames,
    adtechCookieNames: effectiveAdtechCookieNames,
    securityCookieNames: effectiveSecurityCookieNames,
    cookieNamesBeforeConsent,
    thirdPartyCookieNamesSeen,
    thirdPartyCookieNamesBeforeConsent,
    resolvedVendorNames,
    unresolvedVendorHosts,
    preConsentVendorNames,
    sessionReplayVendorNames,
    topObservedEntities
  };

}
