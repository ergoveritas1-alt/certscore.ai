import { resolveVendorObservations } from "@certscore/vendor-resolver";

export type PromotionGradePreconsentRequest = {
  scannedPageUrl?: string | null;
  requestUrl: string;
  hostname: string;
  registrableDomain: string;
  vendorName: string;
  vendorCategory: string;
  rawObservedVendor: string | null;
  rawObservedVendorCategory: string | null;
  resolvedEndpointVendor: string | null;
  resolvedEndpointVendorCategory: string | null;
  vendorAttributionBasis: string | null;
  relatedOrInitiatingVendor: string | null;
  projectionWarnings: string[];
  frameUrl: string | null;
  finalUrl: string | null;
  initiatorHost: string | null;
  initiatorType: string | null;
  initiatorUrl: string | null;
  redirectChain: string[];
  resourceType: string | null;
  classificationBasis: string | null;
  collectionEndpointType: string | null;
  firstPartyOrThirdParty: string | null;
  matchedSignatureId: string | null;
  firstSeenMs: number | null;
  consentActionMs: number | null;
  noConsentActionObserved: boolean;
  consentSurfaceObserved: boolean | null;
  consentInteractionRecorded: boolean;
  confidence: number | string | null;
  runtimePhase: string | null;
};

export type DirectEndpointVendorMatch = {
  vendorName: string;
  vendorCategory: string;
  basis: string;
};

const PROMOTION_TRACKING_CATEGORIES = new Set([
  "advertising",
  "advertising_measurement",
  "analytics",
  "dmp",
  "identity",
  "identity_resolution",
  "marketing_automation",
  "retargeting",
  "sale_share",
  "session_replay",
  "tag_manager",
  "tag_management",
  "tracking"
]);

const SERVICE_CLASSIFICATIONS = new Set([
  "cdn",
  "cmp",
  "consent",
  "functional",
  "infrastructure",
  "library",
  "necessary",
  "service",
  "service_classified",
  "static_asset",
  "unknown"
]);

const SERVICE_HOST_PATTERN =
  /(?:^|\.)cdn\.cookielaw\.org$|(?:^|\.)geolocation\.onetrust\.com$|(?:^|\.)ajax\.googleapis\.com$|(?:^|\.)cdn\.jwplayer\.com$|(?:^|\.)assets\.adobedtm\.com$/i;

const GENERIC_VENDOR_LABELS = new Set([
  "advertising",
  "analytics",
  "marketing",
  "tracker",
  "tracking",
  "unknown"
]);

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function getNumber(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

const MAX_RUNTIME_ELAPSED_MS = 10 * 60 * 1000;

function normalizeRuntimeElapsedMs(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value >= 0 && value <= MAX_RUNTIME_ELAPSED_MS ? value : null;
}

function getRuntimeElapsedMs(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    const parsed = typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : null;
    const normalized = normalizeRuntimeElapsedMs(parsed);
    if (normalized !== null) {
      return normalized;
    }
  }
  return null;
}

function getBoolean(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
}

function getStringArray(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
    }
  }
  return [];
}

function getUrlHostname(value: string | null | undefined) {
  if (!value || !/^https?:\/\//i.test(value)) {
    return null;
  }
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function hostMatches(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function safeEvidenceUrl(value: string) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    if (url.search) {
      url.search = "?redacted=1";
    }
    url.hash = "";
    return url.toString();
  } catch {
    return value.replace(/[?#].*$/, "").slice(0, 500);
  }
}

const HOST_BOUND_VENDOR_DOMAINS: Array<{ pattern: RegExp; domains: string[] }> = [
  { pattern: /^(?:google\s+fonts)$/i, domains: ["fonts.googleapis.com", "fonts.gstatic.com"] },
  { pattern: /^(?:google\s+tag\s+manager|gtm)$/i, domains: ["googletagmanager.com"] },
  { pattern: /^google\s+analytics$/i, domains: ["google-analytics.com", "analytics.google.com", "googletagmanager.com"] },
  { pattern: /^google\s+static\s+assets$/i, domains: ["gstatic.com"] },
  { pattern: /^microsoft\s+clarity$/i, domains: ["clarity.ms"] },
  { pattern: /^hotjar$/i, domains: ["hotjar.com", "hotjar.io"] },
  { pattern: /^google\s+sign-?in$/i, domains: ["accounts.google.com", "google.com", "gstatic.com"] },
  { pattern: /^google\s+publisher\s+tag$/i, domains: ["googletagservices.com", "securepubads.g.doubleclick.net", "pubads.g.doubleclick.net"] },
  { pattern: /^jsdelivr(?:\s+cdn)?$/i, domains: ["jsdelivr.net"] },
  { pattern: /^cdnjs(?:\s+cdn)?$/i, domains: ["cdnjs.cloudflare.com"] },
  { pattern: /^unpkg(?:\s+cdn)?$/i, domains: ["unpkg.com"] },
  { pattern: /^hubspot\s+scripts$/i, domains: ["hubspot.com", "hs-scripts.com", "hs-analytics.net", "hs-banner.com", "hscollectedforms.net", "hsforms.com"] },
  { pattern: /^amazon\s+ads$/i, domains: ["amazon-adsystem.com"] }
];

function isHostBoundVendorBorrowed(hostname: string, vendorName: string | null | undefined) {
  if (!vendorName) {
    return false;
  }
  const normalizedHost = hostname.replace(/^www\./i, "").toLowerCase();
  const rule = HOST_BOUND_VENDOR_DOMAINS.find((candidate) => candidate.pattern.test(vendorName.trim()));
  return Boolean(rule && !rule.domains.some((domain) => hostMatches(normalizedHost, domain)));
}

function canonicalPurposeToEvidenceCategory(purpose: string | null | undefined) {
  if (!purpose) {
    return null;
  }
  const normalized = purpose.toLowerCase();
  if (normalized === "consent_management") {
    return "cmp";
  }
  if (normalized === "tag_management") {
    return "tag_management";
  }
  if (normalized === "performance_monitoring") {
    return "performance_monitoring";
  }
  if (normalized === "customer_support") {
    return "customer_support";
  }
  if (normalized === "session_replay") {
    return "session_replay";
  }
  if (normalized === "infrastructure") {
    return "infrastructure";
  }
  if (normalized === "security") {
    return "security";
  }
  if (normalized === "analytics") {
    return "analytics";
  }
  if (normalized === "advertising") {
    return "advertising";
  }
  return normalized;
}

function inferCanonicalEndpointVendorFromUrl(url: string | null | undefined): DirectEndpointVendorMatch | null {
  const hostname = getUrlHostname(url);
  if (!url || !hostname) {
    return null;
  }
  const observation = resolveVendorObservations([{
    type: "request",
    url,
    hostname,
    sourceEventType: "network_request",
    matchSource: "network_request"
  }])[0];
  const vendorCategory = canonicalPurposeToEvidenceCategory(observation?.purpose);
  if (!observation || !vendorCategory) {
    return null;
  }
  return {
    vendorName: observation.product || observation.vendor,
    vendorCategory,
    basis: "canonical_vendor_resolver"
  };
}

export function inferDirectEndpointVendorFromUrl(url: string | null | undefined): DirectEndpointVendorMatch | null {
  const hostname = getUrlHostname(url);
  if (!hostname) {
    return null;
  }
  const canonicalMatch = inferCanonicalEndpointVendorFromUrl(url);
  if (canonicalMatch) {
    return canonicalMatch;
  }

  const directHostMatches: Array<{ domain: string; vendorName: string; vendorCategory: string; basis: string }> = [
    { domain: "googletagmanager.com", vendorName: "Google Tag Manager", vendorCategory: "tag_manager", basis: "hostname_signature:googletagmanager.com" },
    { domain: "googleadservices.com", vendorName: "Google Ads", vendorCategory: "advertising_measurement", basis: "hostname_signature:googleadservices.com" },
    { domain: "doubleclick.net", vendorName: "Google Ads", vendorCategory: "advertising_measurement", basis: "hostname_signature:doubleclick.net" },
    { domain: "googlesyndication.com", vendorName: "Google Ads", vendorCategory: "advertising_measurement", basis: "hostname_signature:googlesyndication.com" },
    { domain: "criteo.com", vendorName: "Criteo", vendorCategory: "advertising", basis: "hostname_signature:criteo.com" },
    { domain: "amazon-adsystem.com", vendorName: "Amazon Ads", vendorCategory: "advertising", basis: "hostname_signature:amazon-adsystem.com" },
    { domain: "rubiconproject.com", vendorName: "Rubicon Project", vendorCategory: "advertising", basis: "hostname_signature:rubiconproject.com" },
    { domain: "doubleverify.com", vendorName: "DoubleVerify", vendorCategory: "advertising_measurement", basis: "hostname_signature:doubleverify.com" },
    { domain: "adobedtm.com", vendorName: "Adobe Launch", vendorCategory: "tag_manager", basis: "hostname_signature:adobedtm.com" },
    { domain: "clarity.ms", vendorName: "Microsoft Clarity", vendorCategory: "session_replay", basis: "hostname_signature:clarity.ms" },
    { domain: "bing.com", vendorName: "Microsoft Advertising / Bing UET", vendorCategory: "advertising_measurement", basis: "hostname_signature:bing.com" },
    { domain: "rlcdn.com", vendorName: "LiveRamp", vendorCategory: "advertising", basis: "hostname_signature:rlcdn.com" },
    { domain: "adnxs.com", vendorName: "AppNexus / Xandr", vendorCategory: "advertising", basis: "hostname_signature:adnxs.com" },
    { domain: "adsrvr.org", vendorName: "The Trade Desk", vendorCategory: "advertising", basis: "hostname_signature:adsrvr.org" }
  ];

  return directHostMatches.find((match) => hostMatches(hostname, match.domain)) ?? null;
}

export function getUrlRegistrableDomain(value: string | null | undefined) {
  const hostname = getUrlHostname(value) ?? (value && !/^https?:\/\//i.test(value) ? value.replace(/^www\./i, "").toLowerCase() : null);
  if (!hostname) {
    return null;
  }
  const parts = hostname.split(".").filter(Boolean);
  return parts.length <= 2 ? hostname : parts.slice(-2).join(".");
}

function normalizeToken(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? null;
}

function isGenericVendorLabel(value: string | null | undefined) {
  const normalized = normalizeToken(value);
  return Boolean(normalized && GENERIC_VENDOR_LABELS.has(normalized));
}

function confidenceValue(row: Record<string, unknown>) {
  const numeric = getNumber(row, ["confidence", "classificationConfidence", "classification_confidence"]);
  if (numeric !== null) {
    return numeric;
  }
  return getString(row, ["confidence", "classificationConfidence", "classification_confidence"]);
}

function isHighEnoughConfidence(value: number | string | null) {
  if (typeof value === "number") {
    return value >= 0.7;
  }
  if (!value) {
    return true;
  }
  return /^(?:high|strong|direct|0\.[7-9]|1(?:\.0+)?)$/i.test(value);
}

function isNonEssential(row: Record<string, unknown>) {
  const essentiality = normalizeToken(getString(row, ["essentiality", "classificationEssentiality", "classification_essentiality"]));
  const classification = normalizeToken(getString(row, ["classification", "purpose"]));
  return essentiality === "non_essential" || classification === "non_essential";
}

function isPreconsent(row: Record<string, unknown>) {
  const phase = normalizeToken(getString(row, ["runtimePhase", "runtime_phase", "phase", "timingStatus", "timing_status", "timingEvidence", "timing_evidence"]));
  return !phase || phase === "pre_consent" || phase === "before_consent" || phase === "before_consent_request";
}

function getCategory(row: Record<string, unknown>) {
  return normalizeToken(getString(row, ["vendorCategory", "vendor_category", "category", "purposeCategory", "purpose_category"])) ??
    normalizeToken(getString(row, ["classification", "purpose"]));
}

export function isPromotionGradePreconsentRequestRow(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }
  const requestUrl = getString(value, ["requestUrl", "request_url", "url", "representativeUrl", "representative_url", "urlSample", "url_sample"]);
  const hostname = getString(value, ["hostname", "host", "domain"]) ?? getUrlHostname(requestUrl);
  const vendor = getString(value, ["vendorName", "vendor_name", "vendor", "matchedVendorName", "matched_vendor_name", "name"]);
  const category = getCategory(value);
  const classification = normalizeToken(getString(value, ["classification", "serviceClass", "service_class", "requestClass", "request_class"]));
  const endpointVendor = inferDirectEndpointVendorFromUrl(requestUrl);
  const hasPromotionGradeVendor = Boolean(endpointVendor || (vendor && !isGenericVendorLabel(vendor)));

  return Boolean(
    requestUrl &&
      /^https?:\/\//i.test(requestUrl) &&
      hostname &&
      hasPromotionGradeVendor &&
      category &&
      PROMOTION_TRACKING_CATEGORIES.has(category) &&
      isNonEssential(value) &&
      isPreconsent(value) &&
      isHighEnoughConfidence(confidenceValue(value)) &&
      !SERVICE_CLASSIFICATIONS.has(classification ?? "") &&
      !SERVICE_HOST_PATTERN.test(hostname)
  );
}

export function buildPromotionGradePreconsentRequests(input: {
  rows: unknown[];
  scannedPageUrl?: string | null;
  consentSurfaceObserved?: boolean | null;
  consentTimeline?: Record<string, unknown> | null;
  maxItems?: number;
}) {
  const seen = new Set<string>();
  const consentActionMs =
    input.consentTimeline ? getNumber(input.consentTimeline, ["firstConsentActionMs", "first_consent_action_ms", "consentActionMs", "consent_action_ms"]) : null;
  const consentSurfaceObserved =
    typeof input.consentSurfaceObserved === "boolean"
      ? input.consentSurfaceObserved
      : input.consentTimeline
      ? (getNumber(input.consentTimeline, ["firstCmpVisibleMs", "first_cmp_visible_ms"]) !== null ||
          getBoolean(input.consentTimeline, ["consentSurfaceObserved", "consent_surface_observed"]))
      : null;

  const requests: PromotionGradePreconsentRequest[] = [];
  for (const row of input.rows) {
    if (!isPromotionGradePreconsentRequestRow(row) || !isRecord(row)) {
      continue;
    }
    const requestUrl = getString(row, ["requestUrl", "request_url", "url", "representativeUrl", "representative_url", "urlSample", "url_sample"]);
    const hostname = getString(row, ["hostname", "host", "domain"]) ?? getUrlHostname(requestUrl);
    const endpointVendor = inferDirectEndpointVendorFromUrl(requestUrl);
    const rowVendorName = getString(row, ["vendorName", "vendor_name", "vendor", "matchedVendorName", "matched_vendor_name", "name"]);
    const rowVendorCategory = getCategory(row);
    const rowVendorLooksBorrowed = Boolean(hostname && !endpointVendor && isHostBoundVendorBorrowed(hostname, rowVendorName));
    const vendorName = endpointVendor?.vendorName ?? (rowVendorLooksBorrowed ? hostname : rowVendorName);
    const vendorCategory = endpointVendor?.vendorCategory ?? (rowVendorLooksBorrowed ? "unknown" : rowVendorCategory);
    if (!requestUrl || !hostname || !vendorName || !vendorCategory) {
      continue;
    }
    const projectionWarnings = uniqueStrings([
      endpointVendor && rowVendorName && endpointVendor.vendorName !== rowVendorName
        ? "canonical_endpoint_vendor_replaced_raw_vendor"
        : null,
      rowVendorLooksBorrowed ? "borrowed_host_bound_vendor_suppressed" : null
    ]);
    const key = `${requestUrl.toLowerCase()}|${vendorName.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const scannedPageUrl = getString(row, ["scannedPageUrl", "scanned_page_url", "pageUrl", "page_url"]) ?? input.scannedPageUrl ?? null;
    requests.push({
      scannedPageUrl: scannedPageUrl ? safeEvidenceUrl(scannedPageUrl) : null,
      requestUrl: safeEvidenceUrl(requestUrl),
      hostname,
      registrableDomain: getUrlRegistrableDomain(hostname) ?? hostname,
      vendorName,
      vendorCategory,
      rawObservedVendor: rowVendorName,
      rawObservedVendorCategory: rowVendorCategory,
      resolvedEndpointVendor: endpointVendor?.vendorName ?? null,
      resolvedEndpointVendorCategory: endpointVendor?.vendorCategory ?? null,
      vendorAttributionBasis: endpointVendor && rowVendorName && endpointVendor.vendorName !== rowVendorName
        ? `${getString(row, [
            "vendorAttributionBasis",
            "vendor_attribution_basis",
            "classificationBasis",
            "classification_basis",
            "evidenceSource",
            "evidence_source",
            "matchedSignatureId",
            "matched_signature_id"
          ]) ?? "request_row_vendor"}:${endpointVendor.basis}`
        : rowVendorLooksBorrowed
        ? `${getString(row, [
            "vendorAttributionBasis",
            "vendor_attribution_basis",
            "classificationBasis",
            "classification_basis",
            "evidenceSource",
            "evidence_source",
            "matchedSignatureId",
            "matched_signature_id"
          ]) ?? "request_row_vendor"}:borrowed_host_bound_vendor_suppressed`
        : getString(row, [
            "vendorAttributionBasis",
            "vendor_attribution_basis",
            "classificationBasis",
            "classification_basis",
            "evidenceSource",
            "evidence_source",
            "matchedSignatureId",
            "matched_signature_id"
          ]),
      relatedOrInitiatingVendor: (endpointVendor && rowVendorName && endpointVendor.vendorName !== rowVendorName) || rowVendorLooksBorrowed ? rowVendorName : null,
      projectionWarnings,
      frameUrl: getString(row, ["frameUrl", "frame_url"]) ? safeEvidenceUrl(getString(row, ["frameUrl", "frame_url"]) ?? "") : null,
      finalUrl: getString(row, ["finalUrl", "final_url"]) ? safeEvidenceUrl(getString(row, ["finalUrl", "final_url"]) ?? "") : null,
      initiatorHost: getString(row, ["initiatorHost", "initiator_host"]),
      initiatorType: getString(row, ["initiatorType", "initiator_type", "initiator"]),
      initiatorUrl: getString(row, ["initiatorUrl", "initiator_url"]) ? safeEvidenceUrl(getString(row, ["initiatorUrl", "initiator_url"]) ?? "") : null,
      redirectChain: getStringArray(row, ["redirectChain", "redirect_chain"]).slice(0, 8).map(safeEvidenceUrl),
      resourceType: getString(row, ["resourceType", "resource_type"]),
      classificationBasis: getString(row, ["classificationBasis", "classification_basis", "evidenceSource", "evidence_source"]),
      collectionEndpointType: getString(row, ["collectionEndpointType", "collection_endpoint_type"]),
      firstPartyOrThirdParty: getString(row, ["firstPartyOrThirdParty", "first_party_or_third_party", "party"]),
      matchedSignatureId: getString(row, ["matchedSignatureId", "matched_signature_id"]),
      firstSeenMs: getRuntimeElapsedMs(row, ["firstSeenMs", "first_seen_ms", "firstObservedMs", "first_observed_ms", "ms"]) ??
        getRuntimeElapsedMs(row, ["timestampMs", "timestamp_ms"]),
      consentActionMs,
      noConsentActionObserved: consentActionMs === null,
      consentSurfaceObserved,
      consentInteractionRecorded: consentActionMs !== null,
      confidence: confidenceValue(row),
      runtimePhase: getString(row, ["runtimePhase", "runtime_phase", "phase", "timingStatus", "timing_status", "timingEvidence", "timing_evidence"])
    });
  }

  return requests
    .sort((left, right) => (left.firstSeenMs ?? Number.MAX_SAFE_INTEGER) - (right.firstSeenMs ?? Number.MAX_SAFE_INTEGER))
    .slice(0, input.maxItems ?? 8);
}
