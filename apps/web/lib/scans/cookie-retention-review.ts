export const COOKIE_RETENTION_THRESHOLDS = {
  contextDays: 90,
  moderateReviewDays: 180,
  mainReviewDays: 365,
  euPracticeReferenceDays: 395,
  severeReviewDays: 730
} as const;

export type CookieRetentionReviewSeverity = "high" | "medium" | "low";
export type CookieRetentionReviewConfidence = "strong" | "good" | "moderate";
export type CookieRetentionReviewDisposition = "eligible" | "audit_only" | "suppress";

export type CookieRetentionEvidence = {
  category: "tracking" | "analytics" | "unknown" | "essential" | "session" | "other";
  classification: string | null;
  domain: string;
  durationDays: number | null;
  maxAgeSeconds: number | null;
  name: string;
  pageUrl: string;
  party: "first_party" | "third_party" | "unknown";
  sourceRequestUrl: string | null;
  thresholdBasis: string;
  vendor: string | null;
};

export type CookieRetentionReviewEvaluation = {
  confidence: CookieRetentionReviewConfidence;
  disposition: CookieRetentionReviewDisposition;
  evidence: CookieRetentionEvidence[];
  label: string;
  negativeEvidenceFlags: string[];
  severity: CookieRetentionReviewSeverity;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function getNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
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

function getBoolean(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
}

function getRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const record = asRecord(entry);
    if (record) {
      return [record];
    }
    if (typeof entry !== "string" || entry.trim().length === 0) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(entry);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
      }
      const parsedRecord = asRecord(parsed);
      return parsedRecord ? [parsedRecord] : [];
    } catch {
      return [];
    }
  });
}

function getEvidenceRows(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return [];
  }
  return [
    ...getRows(rawEvidence.longLivedCookieEvidence),
    ...getRows(rawEvidence.long_lived_cookie_evidence),
    ...getRows(rawEvidence.cookieRetentionEvidence),
    ...getRows(rawEvidence.cookie_retention_evidence),
    ...getRows(rawEvidence.runtimeCookieEvidence),
    ...getRows(rawEvidence.runtime_cookie_evidence),
    ...getRows(rawEvidence.cookieInventory),
    ...getRows(rawEvidence.cookie_inventory),
    ...getRows(rawEvidence.cookies),
    ...(Array.isArray(rawEvidence.signalValue) ? getRows(rawEvidence.signalValue) : [])
  ];
}

function getDurationDays(row: Record<string, unknown>) {
  const explicit = getNumber(row, ["durationDays", "duration_days", "lifetimeDays", "lifetime_days", "retentionDays", "retention_days"]);
  if (explicit !== null) {
    return explicit;
  }
  const maxAgeSeconds = getNumber(row, ["maxAge", "max_age", "maxAgeSeconds", "max_age_seconds"]);
  if (maxAgeSeconds !== null && maxAgeSeconds > 0) {
    return maxAgeSeconds / 86400;
  }
  return null;
}

function getMaxAgeSeconds(row: Record<string, unknown>) {
  const value = getNumber(row, ["maxAge", "max_age", "maxAgeSeconds", "max_age_seconds"]);
  return value !== null && value > 0 ? value : null;
}

function normalizeCategory(classification: string | null, name: string) {
  const haystack = `${classification ?? ""} ${name}`.toLowerCase();
  if (/session\b/.test(haystack)) {
    return "session" as const;
  }
  if (/essential|strictly necessary|necessary|functional|security|authentication/.test(haystack)) {
    return "essential" as const;
  }
  if (/advert|marketing|retarget|targeting|adtech|identity|pixel|cross[-\s]?context|tracking/.test(haystack)) {
    return "tracking" as const;
  }
  if (/analytics|measurement|statistics|performance/.test(haystack)) {
    return "analytics" as const;
  }
  if (/unknown|unclassified|uncategorized|unmapped/.test(haystack)) {
    return "unknown" as const;
  }
  if (/^(_fbp|_fbc|gcl_|fr$|bcookie|li_sugr|muid|demdex|uuid2|ttclid|ttp)/i.test(name)) {
    return "tracking" as const;
  }
  if (/^(_ga|_gid|_gat|ga_|clck|clsk)/i.test(name)) {
    return "analytics" as const;
  }
  return "other" as const;
}

function normalizeParty(value: string | null, thirdParty: boolean | null): CookieRetentionEvidence["party"] {
  if (thirdParty === true || /third/i.test(value ?? "")) {
    return "third_party";
  }
  if (thirdParty === false || /first/i.test(value ?? "")) {
    return "first_party";
  }
  return "unknown";
}

export function getCookieRetentionEvidence(rawEvidence: Record<string, unknown> | null | undefined): CookieRetentionEvidence[] {
  return getEvidenceRows(rawEvidence).flatMap((row) => {
    const name = getString(row, ["name", "cookieName", "cookie_name", "key"]);
    const domain = getString(row, ["domain", "cookieDomain", "cookie_domain", "host", "hostname"]);
    const pageUrl = getString(row, ["pageUrl", "page_url", "scanUrl", "scan_url", "sourcePageUrl", "source_page_url"]);
    const durationDays = getDurationDays(row);
    const maxAgeSeconds = getMaxAgeSeconds(row);
    const classification = getString(row, ["classification", "category", "purpose", "vendorCategory", "vendor_category", "cookieCategory", "cookie_category"]);
    const vendor = getString(row, ["vendor", "vendorName", "vendor_name", "provider"]);
    const sourceRequestUrl = getString(row, ["sourceRequestUrl", "source_request_url", "requestUrl", "request_url"]);
    const thresholdBasis = getString(row, ["thresholdBasis", "threshold_basis", "basis"]) ??
      (durationDays !== null ? `${Math.round(durationDays)} days observed against CertScore cookie-retention review thresholds.` : "");
    const category = normalizeCategory(classification, name ?? "");
    const party = normalizeParty(getString(row, ["party", "firstPartyStatus", "first_party_status"]), getBoolean(row, ["thirdParty", "third_party"]));

    if (!name || !domain || !pageUrl || durationDays === null || !classification || thresholdBasis.length === 0) {
      return [];
    }

    return [{
      category,
      classification,
      domain,
      durationDays,
      maxAgeSeconds,
      name,
      pageUrl,
      party,
      sourceRequestUrl,
      thresholdBasis,
      vendor,
    }];
  });
}

export function evaluateCookieRetentionReview(rawEvidence: Record<string, unknown> | null | undefined): CookieRetentionReviewEvaluation {
  const concreteEvidence = getCookieRetentionEvidence(rawEvidence);
  const eligibleEvidence = concreteEvidence.filter((cookie) =>
    cookie.durationDays !== null &&
    cookie.durationDays >= COOKIE_RETENTION_THRESHOLDS.moderateReviewDays &&
    cookie.category !== "essential" &&
    cookie.category !== "session"
  );
  const mainThresholdEvidence = eligibleEvidence.filter((cookie) => cookie.durationDays !== null && cookie.durationDays >= COOKIE_RETENTION_THRESHOLDS.mainReviewDays);
  const trackingEvidence = eligibleEvidence.filter((cookie) => cookie.category === "tracking");
  const analyticsEvidence = eligibleEvidence.filter((cookie) => cookie.category === "analytics");
  const unknownEvidence = eligibleEvidence.filter((cookie) => cookie.category === "unknown" || cookie.category === "other");
  const severeTrackingEvidence = trackingEvidence.filter((cookie) => cookie.durationDays !== null && cookie.durationDays >= COOKIE_RETENTION_THRESHOLDS.severeReviewDays);
  const moderateTrackingReviewEvidence = trackingEvidence.filter((cookie) =>
    (cookie.durationDays ?? 0) >= COOKIE_RETENTION_THRESHOLDS.moderateReviewDays &&
    (cookie.durationDays ?? 0) < COOKIE_RETENTION_THRESHOLDS.mainReviewDays
  );
  const moderateTrackingReviewQualifies =
    moderateTrackingReviewEvidence.length >= 2 ||
    moderateTrackingReviewEvidence.some((cookie) => Boolean(cookie.vendor || cookie.sourceRequestUrl));

  if (concreteEvidence.length === 0) {
    return {
      confidence: "moderate",
      disposition: "suppress",
      evidence: [],
      label: "Long-lived cookie retention review",
      negativeEvidenceFlags: ["missing_cookie_duration"],
      severity: "low"
    };
  }

  if (eligibleEvidence.length === 0) {
    return {
      confidence: "moderate",
      disposition: "suppress",
      evidence: [],
      label: "Long-lived cookie retention review",
      negativeEvidenceFlags: [],
      severity: "low"
    };
  }

  const severity: CookieRetentionReviewSeverity =
    severeTrackingEvidence.length > 0 ||
    trackingEvidence.some((cookie) => (cookie.durationDays ?? 0) >= COOKIE_RETENTION_THRESHOLDS.mainReviewDays) ||
    trackingEvidence.filter((cookie) => (cookie.durationDays ?? 0) >= COOKIE_RETENTION_THRESHOLDS.mainReviewDays).length >= 2
      ? "high"
      : mainThresholdEvidence.length > 0 || moderateTrackingReviewQualifies
        ? "medium"
        : "low";
  const disposition: CookieRetentionReviewDisposition =
    severity === "low" || (mainThresholdEvidence.length === 0 && !moderateTrackingReviewQualifies) ? "audit_only" : "eligible";
  const confidence: CookieRetentionReviewConfidence =
    trackingEvidence.some((cookie) => (cookie.durationDays ?? 0) >= COOKIE_RETENTION_THRESHOLDS.mainReviewDays && Boolean(cookie.vendor || cookie.sourceRequestUrl))
      ? "strong"
      : mainThresholdEvidence.some((cookie) => cookie.category === "tracking" || cookie.category === "analytics")
        ? "good"
        : "moderate";
  const label =
    trackingEvidence.length > 0 && unknownEvidence.length > 0
      ? "Long-lived tracking and unclassified cookies observed"
      : trackingEvidence.length > 0 || analyticsEvidence.length > 0
        ? "Long-lived tracking cookies observed"
        : unknownEvidence.length > 0
          ? "Long-lived unclassified cookies observed"
          : "Long-lived cookie retention review";

  return {
    confidence,
    disposition,
    evidence: eligibleEvidence,
    label,
    negativeEvidenceFlags: [],
    severity
  };
}

export function hasConcreteCookieRetentionReviewEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return evaluateCookieRetentionReview(rawEvidence).disposition === "eligible";
}
