export type PromotionGradePreconsentRequest = {
  scannedPageUrl?: string | null;
  requestUrl: string;
  hostname: string;
  registrableDomain: string;
  vendorName: string;
  vendorCategory: string;
  vendorAttributionBasis: string | null;
  firstSeenMs: number | null;
  consentActionMs: number | null;
  noConsentActionObserved: boolean;
  consentSurfaceObserved: boolean | null;
  consentInteractionRecorded: boolean;
  confidence: number | string | null;
  runtimePhase: string | null;
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

function getBoolean(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
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

  return Boolean(
    requestUrl &&
      /^https?:\/\//i.test(requestUrl) &&
      hostname &&
      vendor &&
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
    const vendorName = getString(row, ["vendorName", "vendor_name", "vendor", "matchedVendorName", "matched_vendor_name", "name"]);
    const vendorCategory = getCategory(row);
    if (!requestUrl || !hostname || !vendorName || !vendorCategory) {
      continue;
    }
    const key = `${requestUrl.toLowerCase()}|${vendorName.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    requests.push({
      scannedPageUrl: input.scannedPageUrl ?? null,
      requestUrl,
      hostname,
      registrableDomain: getUrlRegistrableDomain(hostname) ?? hostname,
      vendorName,
      vendorCategory,
      vendorAttributionBasis: getString(row, [
        "vendorAttributionBasis",
        "vendor_attribution_basis",
        "classificationBasis",
        "classification_basis",
        "evidenceSource",
        "evidence_source",
        "matchedSignatureId",
        "matched_signature_id"
      ]),
      firstSeenMs: getNumber(row, ["firstSeenMs", "first_seen_ms", "firstObservedMs", "first_observed_ms", "timestampMs", "timestamp_ms", "ms"]),
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
