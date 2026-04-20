import { CERT_SCORE_FINDING_REGISTRY, type CertScoreFinding, type CertScoreFindingSection } from "./finding-registry";
import { getHybridRuntimeEvidence } from "./hybrid-runtime-evidence";
import type { ScanValidationFinding } from "./validation-review-linking";

type MinimalScanRecord = {
  events?: Array<{
    eventType?: string | null;
    metadataJson?: unknown;
  }> | null;
  runtimeArtifacts: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
  validationFindings?: ScanValidationFinding[] | null;
  scan: {
    completedAt: string | null;
    createdAt: string;
    domainHostname?: string | null;
  };
  trackerVendors?: Array<Record<string, unknown>> | null;
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

const FINANCIAL_VALIDATION_RULE_TO_FINDING_ID = {
  "section_review.guaranteed_outcome_claim_detected": "guaranteed_outcome_claim_detected",
  "section_review.earnings_claim_without_adjacent_disclosure": "earnings_claim_without_adjacent_disclosure",
  "section_review.simulated_performance_without_disclosure": "simulated_performance_without_disclosure",
  "section_review.unqualified_superlative_claim_detected": "unqualified_superlative_claim_detected",
  "section_review.financial_urgency_pressure_tactic_detected": "financial_urgency_pressure_tactic_detected",
  "section_review.pricing_or_fee_transparency_unclear": "pricing_or_fee_transparency_unclear"
} as const satisfies Record<string, keyof typeof CERT_SCORE_FINDING_REGISTRY>;

function getValidationFindingSeverity(
  severity: string | null | undefined
): CertScoreFinding["severity"] {
  switch ((severity ?? "").toLowerCase()) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    default:
      return "low";
  }
}

function getValidationFindingConfidence(
  band: ScanValidationFinding["systemConfidenceBand"]
): CertScoreFinding["confidence"] {
  switch (band) {
    case "very_high":
    case "high":
      return "strong";
    case "moderate":
      return "good";
    default:
      return "moderate";
  }
}

function getValidationFindingDirectness(
  evidence: ScanValidationFinding["evidence"]
): CertScoreFinding["directVsInferred"] {
  const claimText = getString(evidence?.claimText) ?? getString(evidence?.claim_text);
  return claimText ? "direct" : "mixed";
}

function getValidationFindingEvidencePreview(finding: ScanValidationFinding) {
  const evidence = finding.evidence;
  return uniqueStrings([
    getString(evidence?.claimText) ?? getString(evidence?.claim_text),
    getString(evidence?.matchedText) ?? getString(evidence?.matched_text),
    getString(evidence?.adjacentDisclosureText) ?? getString(evidence?.adjacent_disclosure_text),
    finding.description,
    finding.pageUrl
  ]).slice(0, 3);
}

function getValidationFindingEvidenceRefs(finding: ScanValidationFinding) {
  return uniqueStrings([
    finding.ruleKey,
    finding.pageUrl ? "validation.page_url" : null,
    finding.evidence ? "validation.evidence" : null
  ]);
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
  return /(adnxs|appnexus|infolinks|rtmark|media\.net|doubleclick|taboola|outbrain|criteo|pubmatic|rubicon|adsrvr|google-analytics|googletagmanager|plausible|cloudflareinsights)/i.test(
    host
  );
}

function classifyCookieName(name: string, domain: string | null) {
  const normalized = `${name} ${domain ?? ""}`.toLowerCase();
  if (/(cf_clearance|__cf|recaptcha|akamai|datadome|perimeterx)/i.test(normalized)) {
    return "security";
  }
  if (/(uuid2|xandr|adnxs|anusercookie|rtmark|infolinks|doubleclick|criteo|media\.net|(^|\\s)id($|\\s))/i.test(normalized)) {
    return "adtech";
  }
  if (/(^_ga|goog|gtm|plausible|analytics)/i.test(normalized)) {
    return "analytics";
  }
  return "other";
}

function buildFinding(
  id: keyof typeof CERT_SCORE_FINDING_REGISTRY,
  overrides: Omit<CertScoreFinding, keyof typeof CERT_SCORE_FINDING_REGISTRY[typeof id] | "id" | "label" | "section" | "defaultSurfacePriority" | "whyItMatters" | "remediation">
): CertScoreFinding {
  const definition = CERT_SCORE_FINDING_REGISTRY[id]!;
  return {
    id: definition.id,
    label: definition.label,
    section: definition.section,
    defaultSurfacePriority: definition.defaultSurfacePriority,
    whyItMatters: definition.whyItMatters,
    remediation: definition.remediation,
    ...overrides
  };
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
      if (/cloudflare|fonts\.googleapis|fonts\.gstatic|google/.test(label)) {
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

function getPosture(findings: CertScoreFinding[]) {
  if (findings.some((finding) => finding.severity === "critical" || finding.severity === "high")) {
    return "Action Needed" as const;
  }
  if (findings.some((finding) => finding.severity === "medium")) {
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
      if (category !== "session_replay") {
        return [];
      }
      const vendor = getString(row.vendor);
      const hostname = getString(row.hostname);
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
      return cookieName ? [cookieName] : [];
    })
  );
  const thirdPartyCookieNamesSeen = uniqueStrings(
    cookieWriteObservations.flatMap((row) => {
      const cookieName = getString(row.cookieName) ?? getString(row.cookie_name);
      const isThirdParty =
        row.thirdParty === true ||
        getString(row.cookiePartyType) === "third_party" ||
        getString(row.cookie_party_type) === "third_party";
      return cookieName && isThirdParty ? [cookieName] : [];
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
    effectiveCookiesBeforeConsentCount > 0 ? uniqueStrings([...cookieNamesSeen, ...legacyInitialCookieNames]) : [];
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

  if (canAssertConsentTiming && effectivePreConsentRequestCount > 0) {
    findings.push(
      buildFinding("pre_consent_tracking_detected", {
        confidence: "strong",
        directVsInferred: "direct",
        evidencePreview: [
          `${effectivePreConsentRequestCount} request${effectivePreConsentRequestCount === 1 ? "" : "s"} before consent`,
          effectivePreConsentThirdPartyRequestCount > 0
            ? `${effectivePreConsentThirdPartyRequestCount} third-party before consent`
            : "No third-party count captured"
        ],
        evidenceRefs: ["network_summary.pre_consent_request_count", "consent_summary.requests_before_any_consent_action"],
        severity: effectivePreConsentThirdPartyRequestCount > 0 ? "critical" : "high",
        shortSummary:
          effectivePreConsentThirdPartyRequestCount > 0
            ? `${effectivePreConsentThirdPartyRequestCount} third-party request${effectivePreConsentThirdPartyRequestCount === 1 ? "" : "s"} fired before any consent action.`
            : `${effectivePreConsentRequestCount} request${effectivePreConsentRequestCount === 1 ? "" : "s"} fired before consent was established.`
      })
    );
  }

  if (canAssertConsentTiming && effectivePreConsentThirdPartyRequestCount > 0) {
    findings.push(
      buildFinding("third_party_tracking_pre_consent", {
        confidence: "strong",
        directVsInferred: "direct",
        evidencePreview: [
          `${effectivePreConsentThirdPartyRequestCount} third-party request${effectivePreConsentThirdPartyRequestCount === 1 ? "" : "s"} before consent`,
          `${effectivePreConsentVendorCount} pre-consent vendor${effectivePreConsentVendorCount === 1 ? "" : "s"}`
        ],
        evidenceRefs: ["network_summary.pre_consent_third_party_request_count", "request_to_vendor_observations"],
        severity: "critical",
        shortSummary: `${effectivePreConsentThirdPartyRequestCount} third-party request${effectivePreConsentThirdPartyRequestCount === 1 ? "" : "s"} were observed before consent.`
      })
    );
  }

  if (canAssertConsentTiming && storageSummary?.storageWrittenBeforeConsent === true) {
    findings.push(
      buildFinding("storage_before_consent", {
        confidence: "strong",
        directVsInferred: "direct",
        evidencePreview: [
          `cookies before consent: ${getNumber(storageSummary?.cookiesBeforeConsentCount) ?? 0}`,
          `identifier-like storage keys: ${getNumber(storageSummary?.identifierLikeStorageKeyCount) ?? 0}`
        ],
        evidenceRefs: ["storage_summary.storage_written_before_consent", "timeline_markers.first_storage_write_ms"],
        severity: "high",
        shortSummary: "Client-side storage was written before consent."
      })
    );
  }

  if (canAssertConsentTiming && effectiveThirdPartyCookieBeforeConsentCount > 0) {
    findings.push(
      buildFinding("third_party_cookie_pre_consent", {
        confidence: "strong",
        directVsInferred: "direct",
        evidencePreview: [
          `${effectiveThirdPartyCookieBeforeConsentCount} third-party cookie${effectiveThirdPartyCookieBeforeConsentCount === 1 ? "" : "s"} before consent`
        ],
        evidenceRefs: ["storage_summary.third_party_cookie_before_consent_count", "cookie_write_observations"],
        severity: "high",
        shortSummary: `${effectiveThirdPartyCookieBeforeConsentCount} third-party cookie${effectiveThirdPartyCookieBeforeConsentCount === 1 ? "" : "s"} were set before consent.`
      })
    );
  }

  if (canAssertConsentTiming && effectiveAnalyticsCookieNames.length > 0 && effectiveCookiesBeforeConsentCount > 0) {
    findings.push(
      buildFinding("analytics_cookie_pre_consent", {
        confidence: "strong",
        directVsInferred: "direct",
        evidencePreview: effectiveAnalyticsCookieNames.slice(0, 4),
        evidenceRefs: ["cookie_write_observations", "storage_summary.cookies_before_consent_count"],
        severity: "high",
        shortSummary: `${effectiveAnalyticsCookieNames.length} analytics cookie${effectiveAnalyticsCookieNames.length === 1 ? "" : "s"} were observed before consent.`
      })
    );
  }

  if (
    canAssertConsentTiming &&
    effectiveAdtechCookieNames.length > 0 &&
    (effectiveThirdPartyCookieBeforeConsentCount > 0 || effectiveCookiesBeforeConsentCount > 0 || legacyInitialCookieCount > 0)
  ) {
    findings.push(
      buildFinding("adtech_cookie_pre_consent", {
        confidence: "strong",
        directVsInferred: "direct",
        evidencePreview: effectiveAdtechCookieNames.slice(0, 4),
        evidenceRefs: ["cookie_write_observations", "storage_summary.third_party_cookie_before_consent_count"],
        severity: "high",
        shortSummary: `${effectiveAdtechCookieNames.length} advertising or exchange cookie${effectiveAdtechCookieNames.length === 1 ? "" : "s"} were observed before consent.`
      })
    );
  }

  if (
    consentSurfaceObserved === true &&
    consentSummary?.bannerPresent === true &&
    (consentSummary?.rejectPresent === false || consentSummary?.rejectDepthClass === "absent" || consentVisual?.rejectHidden === true)
  ) {
    findings.push(
      buildFinding("reject_option_missing_or_hidden", {
        confidence: "good",
        directVsInferred: "mixed",
        evidencePreview: [
          `reject present: ${consentSummary?.rejectPresent === true ? "yes" : "no"}`,
          `reject hidden: ${consentVisual?.rejectHidden === true ? "yes" : "no"}`
        ],
        evidenceRefs: ["consent_summary.reject_present", "consent_visual.reject_hidden", "consent_summary.reject_depth_class"],
        severity: "high",
        shortSummary: "The consent UI did not present a clear reject path."
      })
    );
  }

  if (
    consentSurfaceObserved === true &&
    (
      consentVisual?.ctaImbalanceDetected === true ||
      consentVisual?.acceptProminence === "high" ||
      consentVisual?.rejectProminence === "none" ||
      consentVisual?.rejectProminence === "low" ||
      consentVisual?.contrastAsymmetryDetected === true
    )
  ) {
    findings.push(
      buildFinding("asymmetric_consent_ui", {
        confidence: "good",
        directVsInferred: "inferred",
        evidencePreview: [
          `accept prominence: ${getString(consentVisual?.acceptProminence) ?? "unknown"}`,
          `reject prominence: ${getString(consentVisual?.rejectProminence) ?? "unknown"}`
        ],
        evidenceRefs: ["consent_visual.accept_prominence", "consent_visual.reject_prominence", "consent_visual.cta_imbalance_detected"],
        severity: "high",
        shortSummary: "Accept appears more prominent than reject or settings."
      })
    );
  }

  if (
    consentSurfaceObserved === true &&
    (consentSummary?.cookieWallDetected === true || consentSummary?.pageInteractionBlocked === true || uiSummary?.forcedActionRequired === true)
  ) {
    findings.push(
      buildFinding("forced_consent_interaction", {
        confidence: "good",
        directVsInferred: "mixed",
        evidencePreview: [
          `interaction blocked: ${consentSummary?.pageInteractionBlocked === true ? "yes" : "no"}`,
          `forced action required: ${uiSummary?.forcedActionRequired === true ? "yes" : "no"}`
        ],
        evidenceRefs: ["consent_summary.page_interaction_blocked", "ui_summary.forced_action_required"],
        severity: "high",
        shortSummary: "The page appears to require action before normal use."
      })
    );
  }

  const overlayLikelyBlocking =
    consentSurfaceObserved === true &&
    (consentSummary?.contentObstructed === true ||
      uiSummary?.fullScreenTakeover === true ||
      (uiSummary?.overlayDetected === true &&
        (consentSummary?.pageInteractionBlocked === true || uiSummary?.forcedActionRequired === true || consentSummary?.cookieWallDetected === true)));

  if (overlayLikelyBlocking) {
    findings.push(
      buildFinding("content_obstructed_by_overlay", {
        confidence: "strong",
        directVsInferred: "direct",
        evidencePreview: [
          `overlay detected: ${uiSummary?.overlayDetected === true ? "yes" : "no"}`,
          `full-screen takeover: ${uiSummary?.fullScreenTakeover === true ? "yes" : "no"}`
        ],
        evidenceRefs: ["consent_summary.content_obstructed", "ui_summary.overlay_detected", "ui_summary.full_screen_takeover"],
        severity: "medium",
        shortSummary: "An overlay or modal blocked page content."
      })
    );
  }

  if (uiSummary?.repeatedResurfacing === true) {
    findings.push(
      buildFinding("repeated_consent_prompt", {
        confidence: "moderate",
        directVsInferred: "inferred",
        evidencePreview: ["repeated resurfacing observed"],
        evidenceRefs: ["ui_summary.repeated_resurfacing"],
        severity: "medium",
        shortSummary: "The consent prompt appears to re-open or persist aggressively."
      })
    );
  }

  if (normalizedVendors.length >= 3 || (getNumber(vendorSummary?.preConsentVendorCount) ?? 0) >= 2) {
    findings.push(
      buildFinding("multi_vendor_tracking_detected", {
        confidence: "strong",
        directVsInferred: "direct",
        evidencePreview: uniqueStrings([...normalizedVendors.slice(0, 4), `${thirdPartyDomainCount} third-party domains`]),
        evidenceRefs: ["vendor_summary.normalized_vendors", "vendor_summary.vendor_category_counts"],
        severity: normalizedVendors.length >= 5 ? "high" : "medium",
        shortSummary: `${normalizedVendors.length || thirdPartyDomainCount} vendor${(normalizedVendors.length || thirdPartyDomainCount) === 1 ? "" : "s"} were observed during the scan.`
      })
    );
  }

  if (sessionReplayDetected) {
    findings.push(
      buildFinding("session_recording_services_detected", {
        confidence: sessionReplayVendorNames.length > 0 ? "strong" : "good",
        directVsInferred: sessionReplayVendorNames.length > 0 ? "direct" : "mixed",
        evidencePreview: uniqueStrings([
          ...sessionReplayVendorNames.slice(0, 4),
          `${sessionReplayVendorCount} session replay vendor${sessionReplayVendorCount === 1 ? "" : "s"}`
        ]),
        evidenceRefs: uniqueStrings([
          sessionReplayVendorNames.length > 0 ? "request_to_vendor_observations" : null,
          getNumber(scanRecord.snapshot?.session_replay_tracker_count) !== null ? "snapshot.session_replay_tracker_count" : null,
          scanRecord.snapshot?.session_replay_tool_detected === true ? "snapshot.session_replay_tool_detected" : null
        ]),
        severity: "high",
        shortSummary:
          sessionReplayVendorNames.length > 0
            ? `${sessionReplayVendorNames.join(", ")} ${sessionReplayVendorNames.length === 1 ? "was" : "were"} observed as session replay tooling during the scan.`
            : `Session replay tooling was observed during the scan.`
      })
    );
  }

  if (keyloggingRisk === "likely" || keyloggingRisk === "possible") {
    findings.push(
      buildFinding("pre_submit_text_capture_detected", {
        confidence: keyloggingRisk === "likely" ? "strong" : "good",
        directVsInferred: keyloggingRisk === "likely" ? "direct" : "mixed",
        evidencePreview: uniqueStrings([
          `${requestsDuringTyping} request${requestsDuringTyping === 1 ? "" : "s"} during typing probe`,
          thirdPartyRequestsDuringTyping > 0
            ? `${thirdPartyRequestsDuringTyping} third-party request${thirdPartyRequestsDuringTyping === 1 ? "" : "s"} during typing`
            : null,
          inputListenerRegistrationCount > 0
            ? `${inputListenerRegistrationCount} input listener registration${inputListenerRegistrationCount === 1 ? "" : "s"}`
            : null,
          ...typingVendors.slice(0, 3)
        ]),
        evidenceRefs: ["keylogging_summary", "browser_collector", "request_observations"],
        severity: keyloggingRisk === "likely" ? "critical" : "high",
        shortSummary:
          typingVendors.length > 0
            ? `Typing activity triggered request behavior associated with ${typingVendors.join(", ")} before form submission.`
            : "Typing activity appeared to trigger request behavior before form submission."
      })
    );
  }

  if (concreteIdentifierTransmissionEvidenceCount > 0) {
    const identifierEvidenceRefs = uniqueStrings([
      "request_observations",
      sensitivePayloadViolations.length > 0 ? "sensitive_payload_violations" : null
    ]);
    const identifierEvidencePreview = uniqueStrings([
      `${concreteIdentifierLikeRequests.length} strong identifier-like request${concreteIdentifierLikeRequests.length === 1 ? "" : "s"}`,
      `${concreteThirdPartyIdentifierLikeRequests.length} third-party strong identifier request${concreteThirdPartyIdentifierLikeRequests.length === 1 ? "" : "s"}`,
      sensitivePayloadViolations.length > 0
        ? `${sensitivePayloadViolations.length} sensitive payload violation${sensitivePayloadViolations.length === 1 ? "" : "s"}`
        : null
    ]);

    findings.push(
      buildFinding("identifier_transmission_detected", {
        confidence: "good",
        directVsInferred: "mixed",
        evidencePreview: identifierEvidencePreview,
        evidenceRefs: identifierEvidenceRefs,
        severity: concreteThirdPartyIdentifierLikeRequests.length > 0 || sensitivePayloadViolations.length > 0 ? "high" : "medium",
        shortSummary: "Requests included identifier-like fields or values."
      })
    );
  }

  if (
    concreteThirdPartyIdentifierLikeRequests.length > 0 &&
    (deviceDataLikeRequestCount > 0 || rawAdtechHosts.length > 0 || securityCookieNames.length > 0)
  ) {
    findings.push(
      buildFinding("telemetry_rich_identification_observed", {
        confidence: "good",
        directVsInferred: "mixed",
        evidencePreview: uniqueStrings([
          `${concreteThirdPartyIdentifierLikeRequests.length} third-party strong identifier request${concreteThirdPartyIdentifierLikeRequests.length === 1 ? "" : "s"}`,
          deviceDataLikeRequestCount > 0 ? `${deviceDataLikeRequestCount} device-data-like request${deviceDataLikeRequestCount === 1 ? "" : "s"}` : null,
          ...rawAdtechHosts.slice(0, 2)
        ]),
        evidenceRefs: [
          "network_summary.third_party_identifier_like_request_count",
          "network_summary.device_data_like_request_count",
          "request_observations"
        ],
        severity: "medium",
        shortSummary: "Requests included rich browser, device, or identifier metadata consistent with client identification behavior."
      })
    );
  }

  if (deviceDataLikeRequestCount >= 3 || attributeCategoryCount >= 2) {
    findings.push(
      buildFinding("device_data_collection_detected", {
        confidence: "good",
        directVsInferred: "mixed",
        evidencePreview: [
          `${deviceDataLikeRequestCount} device-data-like request${deviceDataLikeRequestCount === 1 ? "" : "s"}`,
          `${attributeCategoryCount} fingerprint attribute categor${attributeCategoryCount === 1 ? "y" : "ies"}`
        ],
        evidenceRefs: ["network_summary.device_data_like_request_count", "fingerprint_summary.attribute_category_count"],
        severity: attributeCategoryCount >= 4 ? "high" : "medium",
        shortSummary: "The page accessed multiple device or browser attribute categories."
      })
    );
  }

  if ((fingerprintTier ?? 0) >= 2) {
    findings.push(
      buildFinding("probable_fingerprinting", {
        confidence:
          fingerprintConfidence === "high" ? "strong" : fingerprintConfidence === "medium" ? "good" : "moderate",
        directVsInferred: "mixed",
        evidencePreview: fingerprintReasons.slice(0, 3),
        evidenceRefs: ["fingerprint_summary.tier", "fingerprint_summary.reasons", "fingerprint_api_event_samples"],
        severity: (fingerprintTier ?? 0) >= 3 ? "high" : "medium",
        shortSummary: getString(fingerprintSummary?.summary) ?? "Multi-signal collection patterns were consistent with fingerprinting."
      })
    );
  }

  if (
    storageSummary?.localStorageWriteDetected === true ||
    storageSummary?.sessionStorageWriteDetected === true ||
    (getNumber(storageSummary?.identifierLikeStorageKeyCount) ?? 0) > 0
  ) {
    findings.push(
      buildFinding("non_cookie_tracking_detected", {
        confidence: "good",
        directVsInferred: "mixed",
        evidencePreview: [
          `local storage: ${storageSummary?.localStorageWriteDetected === true ? "yes" : "no"}`,
          `session storage: ${storageSummary?.sessionStorageWriteDetected === true ? "yes" : "no"}`
        ],
        evidenceRefs: ["storage_summary.local_storage_write_detected", "storage_summary.session_storage_write_detected", "storage_summary.identifier_like_storage_key_count"],
        severity: "medium",
        shortSummary: "Persistence or identifier behavior was observed outside standard cookies."
      })
    );
  }

  if (requestBurstScore === "high" || requestCount >= 40) {
    findings.push(
      buildFinding("high_request_density", {
        confidence: "good",
        directVsInferred: "direct",
        evidencePreview: [`${requestCount} total requests`, `burst score: ${requestBurstScore ?? "unknown"}`],
        evidenceRefs: ["network_summary.total_request_count", "network_summary.request_burst_score"],
        severity: "medium",
        shortSummary: "The page generated a dense burst of network activity."
      })
    );
  }

  if (thirdPartyDomainCount >= 5 || (getNumber(networkSummary?.thirdPartyScriptCount) ?? 0) >= 4) {
    findings.push(
      buildFinding("large_third_party_footprint", {
        confidence: "strong",
        directVsInferred: "direct",
        evidencePreview: [
          `${thirdPartyDomainCount} third-party domain${thirdPartyDomainCount === 1 ? "" : "s"}`,
          `${getNumber(networkSummary?.thirdPartyScriptCount) ?? 0} third-party script${(getNumber(networkSummary?.thirdPartyScriptCount) ?? 0) === 1 ? "" : "s"}`
        ],
        evidenceRefs: ["network_summary.third_party_domain_count", "network_summary.third_party_script_count", "vendor_summary.raw_third_party_domains"],
        severity: thirdPartyDomainCount >= 10 ? "high" : "medium",
        shortSummary: "The page loaded a broad set of third-party domains or scripts."
      })
    );
  }

  if (collectionEndpointCount > 0) {
    findings.push(
      buildFinding("collection_endpoints_detected", {
        confidence: "good",
        directVsInferred: "mixed",
        evidencePreview: [`${collectionEndpointCount} collection endpoint${collectionEndpointCount === 1 ? "" : "s"}`],
        evidenceRefs: ["network_summary.collection_endpoint_count", "request_observations"],
        severity: "medium",
        shortSummary: "Requests matched collection-oriented endpoint patterns."
      })
    );
  }

  const normalizedInitialHost = normalizeComparableHost(getString(navigationSummary?.initialUrl)) ?? normalizeComparableHost(requestedHost);
  const normalizedFinalHost = normalizeComparableHost(getString(navigationSummary?.finalUrl)) ?? normalizeComparableHost(finalHost);
  const redirectLooksCrossSite =
    Boolean(normalizedInitialHost && normalizedFinalHost && normalizedInitialHost !== normalizedFinalHost);

  if (
    navigationSummary?.affiliateOrTrackerRedirectDetected === true ||
    (((getNumber(navigationSummary?.redirectHopCount) ?? 0) >= 2 && (getNumber(navigationSummary?.crossDomainHopCount) ?? 0) > 0) && redirectLooksCrossSite)
  ) {
    const redirectHopCount = getNumber(navigationSummary?.redirectHopCount) ?? 0;
    findings.push(
      buildFinding("tracking_redirect_chain", {
        confidence: "good",
        directVsInferred: "mixed",
        evidencePreview: [
          `${redirectHopCount} redirect hop${redirectHopCount === 1 ? "" : "s"}`,
          `${getNumber(navigationSummary?.crossDomainHopCount) ?? 0} cross-domain hop${(getNumber(navigationSummary?.crossDomainHopCount) ?? 0) === 1 ? "" : "s"}`
        ],
        evidenceRefs: ["navigation_summary.redirect_hop_count", "navigation_summary.affiliate_or_tracker_redirect_detected", "navigation_summary.cross_domain_hop_count"],
        severity: "medium",
        shortSummary: "Redirect behavior appeared consistent with tracking or routing."
      })
    );
  }

  if (mediaSummary?.autoplayBeforeConsent === true) {
    findings.push(
      buildFinding("autoplay_before_consent", {
        confidence: "strong",
        directVsInferred: "direct",
        evidencePreview: [
          `video autoplay: ${mediaSummary?.autoplayVideoObserved === true ? "yes" : "no"}`,
          `audio autoplay: ${mediaSummary?.autoplayAudioObserved === true ? "yes" : "no"}`
        ],
        evidenceRefs: ["media_summary.autoplay_before_consent", "media_summary.autoplay_video_observed", "media_summary.autoplay_audio_observed"],
        severity: "medium",
        shortSummary: "Media autoplay occurred before consent was established."
      })
    );
  }

  if ((getNumber(uiSummary?.popupCount) ?? 0) > 0 || uiSummary?.modalDetected === true) {
    const popupCount = getNumber(uiSummary?.popupCount) ?? 0;
    findings.push(
      buildFinding("popup_or_modal_present", {
        confidence: "strong",
        directVsInferred: "direct",
        evidencePreview: [popupCount > 0 ? `${popupCount} popup${popupCount === 1 ? "" : "s"}` : "modal detected"],
        evidenceRefs: ["ui_summary.popup_count", "ui_summary.modal_detected"],
        severity: "low",
        shortSummary: "A popup or modal was observed during the scan."
      })
    );
  }

  if (uiSummary?.interstitialDetected === true) {
    findings.push(
      buildFinding("interstitial_detected", {
        confidence: "strong",
        directVsInferred: "direct",
        evidencePreview: [
          `interstitial: yes`,
          `full-screen takeover: ${uiSummary?.fullScreenTakeover === true ? "yes" : "no"}`
        ],
        evidenceRefs: ["ui_summary.interstitial_detected", "ui_summary.full_screen_takeover"],
        severity: "medium",
        shortSummary: "An interstitial or full-screen interruption was observed."
      })
    );
  }

  const financialValidationFindings = (scanRecord.validationFindings ?? []).filter((finding) => {
    if (!(finding.ruleKey in FINANCIAL_VALIDATION_RULE_TO_FINDING_ID)) {
      return false;
    }

    return finding.verdict !== "not_supported";
  });

  for (const validationFinding of financialValidationFindings) {
    const findingId =
      FINANCIAL_VALIDATION_RULE_TO_FINDING_ID[
        validationFinding.ruleKey as keyof typeof FINANCIAL_VALIDATION_RULE_TO_FINDING_ID
      ];

    findings.push(
      buildFinding(findingId, {
        confidence: getValidationFindingConfidence(validationFinding.systemConfidenceBand),
        directVsInferred: getValidationFindingDirectness(validationFinding.evidence),
        evidencePreview: getValidationFindingEvidencePreview(validationFinding),
        evidenceRefs: getValidationFindingEvidenceRefs(validationFinding),
        severity: getValidationFindingSeverity(validationFinding.severity),
        shortSummary: validationFinding.description ?? validationFinding.title
      })
    );
  }

  const dedupedFindings = findings;

  const groupedEntries = new Map<CertScoreFindingSection, CertScoreFinding[]>();
  for (const finding of dedupedFindings) {
    const existing = groupedEntries.get(finding.section) ?? [];
    existing.push(finding);
    groupedEntries.set(finding.section, existing);
  }

  const groupedFindings = [...groupedEntries.entries()].map(([section, entries]) => ({
    section,
    findings: entries
  }));

  const lastScannedAt = scanRecord.scan.completedAt ?? scanRecord.scan.createdAt;
  const score = getNumber(scanRecord.snapshot?.certscore_overall) ?? null;

  return {
    findings: dedupedFindings,
    groupedFindings,
    posture: getPosture(findings),
    score,
    lastScannedAt,
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
