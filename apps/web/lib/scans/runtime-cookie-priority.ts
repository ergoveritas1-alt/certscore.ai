import type { RuntimeCookieEvidenceRow } from "./runtime-cookie-evidence";

export type RuntimeCookieReviewPriority = "high" | "medium" | "review_needed" | "contextual";
export type RuntimeCookieInventoryConfidence = "high" | "medium" | "low";

export type RuntimeCookiePriorityGroupRow = {
  confidence: RuntimeCookieInventoryConfidence;
  domains: string[];
  firstSeenMs: number | null;
  party: "first_party" | "third_party" | "unknown" | "mixed";
  priority: RuntimeCookieReviewPriority;
  purpose: string;
  vendor: string;
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function normalizeInventoryLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normalizeRuntimeCookiePurpose(value: string | null | undefined) {
  return (value ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

export function getRuntimeCookieFirstSeenMs(row: RuntimeCookieEvidenceRow) {
  return row.firstObservedAtMs ?? row.setAtMs;
}

export function getRuntimeCookieBrandLabel(row: RuntimeCookieEvidenceRow) {
  if (/^(c_code|countrycode|statecode|geodata|geo_country|trp-country|trp-language)$/i.test(row.cookieName)) {
    return row.domain ?? row.cookieName;
  }

  const haystack = [
    row.cookieName,
    row.domain,
    row.initiatorVendor,
    row.initiatorDomain,
    row.initiatorUrl
  ].filter(Boolean).join(" ").toLowerCase();

  if (/(^|[^a-z0-9])(_ga|_gid|_gcl|_gads|_gpi|__gads|gcl_|google|googlesyndication|doubleclick|securepubads)/i.test(haystack)) {
    return "Google";
  }
  if (/(optanon|onetrust|cookielaw)/i.test(haystack)) {
    return "OneTrust";
  }
  if (/(__cf|cf_clearance|cf_chl|cloudflare)/i.test(haystack)) {
    return "Cloudflare";
  }
  if (/(ak_bmsc|bm_sz|bm_sv|bm_mi|_abck|akamai)/i.test(haystack)) {
    return "Akamai Bot Manager / Edge";
  }
  if (/(quantcast|quantserve|__qca|(?:^|[^a-z0-9])mc(?:[^a-z0-9]|$)|(?:^|[^a-z0-9])d(?:[^a-z0-9]|$))/i.test(haystack)) {
    return "Quantcast";
  }
  if (/(piano|tinypass|pnes_|pcid)/i.test(haystack)) {
    return "Piano";
  }
  if (/(optimizely|optimizelyenduserid)/i.test(haystack)) {
    return "Optimizely";
  }
  if (/(stripe|__stripe)/i.test(haystack)) {
    return "Stripe";
  }
  return row.initiatorVendor ?? row.initiatorDomain ?? row.domain ?? row.cookieName;
}

export function getRuntimeCookiePurposeLabel(row: RuntimeCookieEvidenceRow) {
  const vendorLabel = getRuntimeCookieBrandLabel(row);
  const fallbackCategory = row.category;
  if (fallbackCategory && /^[A-Z][A-Za-z /&-]+$/.test(fallbackCategory) && fallbackCategory !== "Unknown") {
    return fallbackCategory;
  }
  if (fallbackCategory && /^vendor$/i.test(fallbackCategory)) {
    return "Unknown";
  }

  const label = vendorLabel.toLowerCase();
  if (/google sign.?in|accounts\.google|gsi\/client/.test(label)) {
    return "Authentication";
  }
  if (/stripe/.test(label)) {
    return "Payment processors";
  }
  if (/cloudflare bot management|cf_chl|cf_clearance|__cf_bm|cloudflare/.test(label)) {
    return "Security";
  }
  if (/akamai bot manager|akamai/.test(label)) {
    return "Security";
  }
  if (/doubleclick floodlight|floodlight|fls\.doubleclick/.test(label)) {
    return "Advertising";
  }
  if (/google adsense|adsbygoogle|pagead2/.test(label)) {
    return "Advertising";
  }
  if (/google publisher tag|googletag|gpt\.js|securepubads/.test(label)) {
    return "Advertising";
  }
  if (/integral ad science|ias/.test(label)) {
    return "Advertising";
  }
  if (/jsdelivr|cdn\.jsdelivr\.net/.test(label)) {
    return "CDN";
  }
  if (/onetrust|cookielaw|optanon/.test(label)) {
    return "Cookie compliance";
  }
  if (/optimizely/.test(label)) {
    return "A/B Testing";
  }
  if (/piano|tinypass/.test(label)) {
    return "Personalisation";
  }
  if (/cxense/.test(label)) {
    return "Personalisation";
  }
  if (/quantcast/.test(label)) {
    return "Analytics";
  }
  if (/^geolocation$/i.test(fallbackCategory)) {
    return "Functional";
  }
  return normalizeInventoryLabel(fallbackCategory || "unknown");
}

export function getRuntimeCookieReviewPriority(row: RuntimeCookieEvidenceRow): RuntimeCookieReviewPriority {
  const purpose = normalizeRuntimeCookiePurpose(getRuntimeCookiePurposeLabel(row));
  const observedPreConsent = row.timingEvidence === "before_consent_cookie_write" || row.timingEvidence === "initial_cookie_snapshot";

  if (/^(advertising|retargeting|audience_measurement|session_replay|fingerprinting)$/.test(purpose) && observedPreConsent) {
    return "high";
  }
  if (/^(analytics|experimentation|personalization|personalisation|a_b_testing|tag_management|tag_manager|marketing_automation)$/.test(purpose) && observedPreConsent) {
    return "medium";
  }
  if (/^(security|necessary|payment|payment_processors|authentication|cookie_compliance|consent|consent_management)$/.test(purpose)) {
    return "contextual";
  }
  if (/^(cdn_static|cdn|functional)$/.test(purpose)) {
    return "contextual";
  }
  if (row.party === "third_party" || row.category === "unknown" || !row.domain) {
    return "review_needed";
  }
  return row.nonEssential ? "medium" : "contextual";
}

export function getRuntimeCookieInventoryConfidence(row: RuntimeCookieEvidenceRow): RuntimeCookieInventoryConfidence {
  if (row.evidenceGrade === "high" || (row.category !== "unknown" && (row.initiatorVendor || row.initiatorDomain))) {
    return "high";
  }
  if (row.category !== "unknown" || row.domain) {
    return "medium";
  }
  return "low";
}

export function runtimeCookiePriorityWeight(priority: RuntimeCookieReviewPriority) {
  return { contextual: 1, medium: 2, review_needed: 3, high: 4 }[priority];
}

export function runtimeCookieConfidenceWeight(confidence: RuntimeCookieInventoryConfidence) {
  return { low: 1, medium: 2, high: 3 }[confidence];
}

export function compareRuntimeCookiePriorityRows(left: RuntimeCookiePriorityGroupRow, right: RuntimeCookiePriorityGroupRow) {
  const priorityDelta = runtimeCookiePriorityWeight(right.priority) - runtimeCookiePriorityWeight(left.priority);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }
  if (left.firstSeenMs !== null || right.firstSeenMs !== null) {
    if (left.firstSeenMs === null) {
      return 1;
    }
    if (right.firstSeenMs === null) {
      return -1;
    }
    const firstSeenDelta = left.firstSeenMs - right.firstSeenMs;
    if (firstSeenDelta !== 0) {
      return firstSeenDelta;
    }
  }
  const confidenceDelta = runtimeCookieConfidenceWeight(right.confidence) - runtimeCookieConfidenceWeight(left.confidence);
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }
  return left.vendor.localeCompare(right.vendor);
}

function mergePartyValues<T extends string>(left: T, right: T): T | "mixed" {
  return left === right ? left : "mixed";
}

export function buildRuntimeCookiePriorityGroups(rows: RuntimeCookieEvidenceRow[]) {
  const grouped = new Map<string, RuntimeCookiePriorityGroupRow>();
  for (const row of rows) {
    const vendor = getRuntimeCookieBrandLabel(row);
    const purpose = getRuntimeCookiePurposeLabel(row);
    const key = `${vendor.toLowerCase()}\u0000${purpose.toLowerCase()}`;
    const candidate: RuntimeCookiePriorityGroupRow = {
      confidence: getRuntimeCookieInventoryConfidence(row),
      domains: row.domain ? [row.domain] : [],
      firstSeenMs: getRuntimeCookieFirstSeenMs(row),
      party: row.party,
      priority: getRuntimeCookieReviewPriority(row),
      purpose,
      vendor
    };
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, candidate);
      continue;
    }
    grouped.set(key, {
      ...existing,
      confidence:
        runtimeCookieConfidenceWeight(candidate.confidence) > runtimeCookieConfidenceWeight(existing.confidence)
          ? candidate.confidence
          : existing.confidence,
      domains: uniqueStrings([...existing.domains, ...candidate.domains]),
      firstSeenMs:
        existing.firstSeenMs !== null && candidate.firstSeenMs !== null
          ? Math.min(existing.firstSeenMs, candidate.firstSeenMs)
          : existing.firstSeenMs ?? candidate.firstSeenMs,
      party: mergePartyValues(existing.party, candidate.party),
      priority: runtimeCookiePriorityWeight(candidate.priority) > runtimeCookiePriorityWeight(existing.priority)
        ? candidate.priority
        : existing.priority
    });
  }
  return [...grouped.values()].sort(compareRuntimeCookiePriorityRows);
}
