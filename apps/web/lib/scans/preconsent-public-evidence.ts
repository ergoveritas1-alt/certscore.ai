import { resolveCanonicalVendor } from "@certscore/vendor-resolver";

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
  method: string | null;
  pathSample: string | null;
  cookieHeaderPresent: boolean | null;
  cookieNamesSent: string[];
  identifierLikeParametersObserved: boolean | null;
  identifierParameterNames: string[];
  directVsInferred: string | null;
  evidenceRefs: string[];
  classificationBasis: string | null;
  collectionEndpointObserved: boolean;
  collectionEndpointType: string | null;
  siteRelationship: "same_site" | "cross_site" | "unknown";
  entityRelationship: "same_entity" | "affiliated_entity" | "external_entity" | "unknown";
  relationshipBasis: string | null;
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
  /(?:^|\.)cdn\.cookielaw\.org$|(?:^|\.)geolocation\.onetrust\.com$|(?:^|\.)transcend-cdn\.com$|(?:^|\.)privacy-center-api\.transcend\.io$|(?:^|\.)ajax\.googleapis\.com$|(?:^|\.)cdn\.jwplayer\.com$|(?:^|\.)assets\.adobedtm\.com$|(?:^|\.)m\.stripe\.network$|(?:^|\.)framerusercontent\.com$|(?:^|\.)sfdcstatic\.com$/i;

function isLibraryOrConfigurationConnection(requestUrl: string | null) {
  if (!requestUrl) return false;
  try {
    const parsed = new URL(requestUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    return (
      (hostname === "securepubads.g.doubleclick.net" && /\/tag\/js\/gpt\.js$/.test(pathname)) ||
      (hostname === "sr-client-cfg.amplitude.com" && /\/config(?:\/|$)/.test(pathname))
    );
  } catch {
    return false;
  }
}

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
  const observation = resolveCanonicalVendor({
    type: "request",
    url,
    hostname,
    sourceEventType: "network_request",
    matchSource: "network_request"
  }).observation;
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
  // Do not turn ambiguous or unrecognized canonical matches into host-only guesses.
  return inferCanonicalEndpointVendorFromUrl(url);
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

function sameScannedSite(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) return false;
  return getUrlRegistrableDomain(left) === getUrlRegistrableDomain(right);
}

function getSiteRelationship(row: Record<string, unknown>) {
  const explicit = normalizeToken(getString(row, ["siteRelationship", "site_relationship"]));
  if (explicit === "same_site" || explicit === "cross_site" || explicit === "unknown") {
    return explicit;
  }
  const legacy = normalizeToken(getString(row, ["firstPartyOrThirdParty", "first_party_or_third_party", "party"]));
  return legacy === "first_party" ? "same_site" : legacy === "third_party" ? "cross_site" : "unknown";
}

function getEntityRelationship(row: Record<string, unknown>) {
  const explicit = normalizeToken(getString(row, ["entityRelationship", "entity_relationship"]));
  return explicit === "same_entity" || explicit === "affiliated_entity" || explicit === "external_entity" || explicit === "unknown"
    ? explicit
    : "unknown";
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
  const phase = normalizeToken(getString(value, ["runtimePhase", "runtime_phase", "phase", "timingStatus", "timing_status", "timingEvidence", "timing_evidence"]));
  const endpointVendor = inferDirectEndpointVendorFromUrl(requestUrl);
  const classificationBasis = normalizeToken(getString(value, ["classificationBasis", "classification_basis", "evidenceSource", "evidence_source"]));
  const hasPromotionGradeVendor = Boolean(endpointVendor || (vendor && !isGenericVendorLabel(vendor)));
  const firstSeenMs = getRuntimeElapsedMs(value, ["firstSeenMs", "first_seen_ms", "firstObservedMs", "first_observed_ms", "tsMs", "ts_ms", "ms"]) ??
    getRuntimeElapsedMs(value, ["timestampMs", "timestamp_ms"]);
  const explicitPreconsentTrackingClassification =
    isNonEssential(value) &&
    (phase === "pre_consent" || phase === "before_consent" || phase === "before_consent_request") &&
    PROMOTION_TRACKING_CATEGORIES.has(category ?? "") &&
    (classificationBasis === "tracker_signature" || classificationBasis === "consent_audit_tracker_evidence_url");
  const identifierBearingEvidence =
    getBoolean(value, ["cookieHeaderPresent", "cookie_header_present"]) === true ||
    getBoolean(value, ["identifierLikeParametersObserved", "identifier_like_parameters_observed", "hasIdentifierLikeParameters"]) === true;
  const directCollectionEvidence =
    getBoolean(value, ["collectionEndpointObserved", "collection_endpoint_observed"]) === true;

  return Boolean(
    requestUrl &&
      /^https?:\/\//i.test(requestUrl) &&
      hostname &&
      hasPromotionGradeVendor &&
      category &&
      PROMOTION_TRACKING_CATEGORIES.has(category) &&
      isNonEssential(value) &&
      isPreconsent(value) &&
      firstSeenMs !== null &&
      isHighEnoughConfidence(confidenceValue(value)) &&
      (identifierBearingEvidence || directCollectionEvidence) &&
      (!isLibraryOrConfigurationConnection(requestUrl) || explicitPreconsentTrackingClassification) &&
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
    const retainedScannedPageUrl = getString(row, ["scannedPageUrl", "scanned_page_url", "pageUrl", "page_url"]);
    const scannedPageUrl = input.scannedPageUrl && retainedScannedPageUrl && !sameScannedSite(retainedScannedPageUrl, input.scannedPageUrl)
      ? input.scannedPageUrl
      : retainedScannedPageUrl ?? input.scannedPageUrl ?? null;
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
      method: getString(row, ["method", "requestMethod", "request_method"]),
      pathSample: getString(row, ["pathSample", "path_sample", "path"]),
      cookieHeaderPresent: getBoolean(row, ["cookieHeaderPresent", "cookie_header_present"]),
      cookieNamesSent: getStringArray(row, ["cookieNamesSent", "cookie_names_sent"]).slice(0, 24),
      identifierLikeParametersObserved: getBoolean(row, ["identifierLikeParametersObserved", "identifier_like_parameters_observed", "hasIdentifierLikeParameters"]),
      identifierParameterNames: getStringArray(row, ["identifierParameterNames", "identifier_parameter_names", "identifierParamNames"]).slice(0, 24),
      directVsInferred: getString(row, ["directVsInferred", "direct_vs_inferred"]),
      evidenceRefs: getStringArray(row, ["evidenceRefs", "evidence_refs"]).slice(0, 24),
      classificationBasis: getString(row, ["classificationBasis", "classification_basis", "evidenceSource", "evidence_source"]),
      collectionEndpointObserved: getBoolean(row, ["collectionEndpointObserved", "collection_endpoint_observed"]) === true,
      collectionEndpointType: getString(row, ["collectionEndpointType", "collection_endpoint_type"]),
      siteRelationship: getSiteRelationship(row),
      entityRelationship: getEntityRelationship(row),
      relationshipBasis: getString(row, ["relationshipBasis", "relationship_basis"]),
      firstPartyOrThirdParty: getString(row, ["firstPartyOrThirdParty", "first_party_or_third_party", "party"]),
      matchedSignatureId: getString(row, ["matchedSignatureId", "matched_signature_id"]),
      firstSeenMs: getRuntimeElapsedMs(row, ["firstSeenMs", "first_seen_ms", "firstObservedMs", "first_observed_ms", "tsMs", "ts_ms", "ms"]) ??
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
