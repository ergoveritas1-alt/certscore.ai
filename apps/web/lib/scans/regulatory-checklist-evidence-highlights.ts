import { formatReportSeconds } from "./report-time";
import { projectPreconsentTrackingTiming, describePreconsentTrackingTiming } from "./preconsent-tracking-timing";
import { canonicalEvidenceVendorName as normalizeEvidenceVendor } from "./canonical-evidence-vendor-name";
import type { CertScoreFindingEvidenceDetails } from "./finding-registry";
import { inferDirectEndpointVendorFromUrl } from "./preconsent-public-evidence";

type ExecutiveEvidenceFinding = {
  evidenceDetails?: CertScoreFindingEvidenceDetails;
  evidencePreview?: string[];
  id: string;
  label: string;
};

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asRecordRows(value: unknown) {
  return Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
}

function getFirstStringValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function getFirstNumberValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

const MAX_RUNTIME_ELAPSED_MS = 10 * 60 * 1000;

function formatElapsedSeconds(value: number) {
  return formatReportSeconds(Math.max(0, value));
}

function normalizeRuntimeElapsedMs(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value >= 0 && value <= MAX_RUNTIME_ELAPSED_MS ? value : null;
}

function getFirstRuntimeElapsedMs(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
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

function getFirstRuntimeElapsedMsFromRecords(records: Array<Record<string, unknown> | null>, keys: string[]) {
  for (const record of records) {
    const value = getFirstRuntimeElapsedMs(record, keys);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function getFirstBooleanValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
}

function quote(value: string) {
  return JSON.stringify(value);
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}


function formatList(values: string[]) {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function normalizeVendorCategory(input: {
  category: string | null;
  name: string;
  url: string | null;
}) {
  const endpointMatch = inferDirectEndpointVendorFromUrl(input.url);
  if (endpointMatch) {
    return endpointMatch.vendorCategory;
  }

  const identity = `${input.name} ${input.url ?? ""}`;
  if (/google\s+analytics|google-analytics|analytics\.google|google-analytics\.com|googleanalytics/i.test(identity)) {
    return "analytics";
  }
  if (/google\s+tag\s+manager|googletagmanager\.com|gtm\.js|\bgtm\b/i.test(identity)) {
    return "tag_manager";
  }
  if (/microsoft\s+clarity|clarity\.ms|\bclarity\b/i.test(identity)) {
    return "session_replay";
  }
  if (/appnexus|xandr|adnxs/i.test(identity)) {
    return "advertising";
  }
  if (/doubleclick|googleads\.g\.doubleclick|googleadservices|google\s+ads|googlesyndication|gads/i.test(identity)) {
    return "advertising_measurement";
  }
  if (/linkedin\s+insight|linkedin\.com\/insight|px\.ads\.linkedin/i.test(identity)) {
    return "advertising_measurement";
  }
  if (/meta\s+pixel|facebook\s+pixel|connect\.facebook\.net|facebook\.com\/tr/i.test(identity)) {
    return "advertising_measurement";
  }
  if (/tiktok\s+pixel|analytics\.tiktok|business-api\.tiktok/i.test(identity)) {
    return "advertising_measurement";
  }
  if (/microsoft\s+advertising|bing\s+uet|bat\.bing\.com|bingads|uet/i.test(identity)) {
    return "advertising_measurement";
  }
  return input.category;
}

function formatPrimitiveEvidence(record: Record<string, unknown>, nameKeys: string[], extraKeys: string[]) {
  const name = getFirstStringValue(record, nameKeys);
  if (!name) {
    return null;
  }

  const parts = [quote(name)];
  const url = getFirstStringValue(record, ["representativeUrl", "representative_url", "requestUrl", "request_url", "url"]);
  for (const key of extraKeys) {
    const value = record[key];
    if (key === "category") {
      const category = normalizeVendorCategory({
        category: typeof value === "string" && value.trim().length > 0 ? value.trim() : null,
        name,
        url
      });
      if (category) {
        parts.push(`${quote(key)}: ${quote(category)}`);
      }
    } else if (typeof value === "string" && value.trim().length > 0) {
      parts.push(`${quote(key)}: ${quote(value.trim())}`);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      parts.push(`${quote(key)}: ${Math.round(value)}`);
    } else if (typeof value === "boolean") {
      parts.push(`${quote(key)}: ${value}`);
    }
  }

  return parts.join(", ");
}

function buildPreConsentTrackingHighlights(finding: ExecutiveEvidenceFinding) {
  const details = finding.evidenceDetails;
  const trackingEvidence = getRecord(details?.trackingEvidence);
  const timing = projectPreconsentTrackingTiming([
    ...asRecordRows(details?.vendors),
    ...asRecordRows(details?.runtimeVendors),
    ...asRecordRows(trackingEvidence?.vendors),
    ...asRecordRows(trackingEvidence?.representativeRequests),
    ...asRecordRows(details?.representativeRequests)
  ]);
  if (!timing.requests.length) return [];
  return [describePreconsentTrackingTiming(timing), ...timing.requests.slice(0, 2).map(request =>
    JSON.stringify({ vendor: request.vendorName, requestUrl: request.requestUrl, category: request.vendorCategory,
      runtimePhase: request.runtimePhase, firstSeenMs: request.firstSeenMs, evidenceRefs: request.evidenceRefs }))];
}

function buildPreConsentCookieStorageHighlights(finding: ExecutiveEvidenceFinding) {
  const details = finding.evidenceDetails;
  const cookieEvidence = getRecord(details?.cookieEvidence);
  const timingCandidates = [
    getRecord((details as Record<string, unknown> | undefined)?.timing),
    getRecord(details?.timingAnalysis),
    getRecord((details as Record<string, unknown> | undefined)?.consentTimeline),
    getRecord(cookieEvidence?.consentTimeline),
    getRecord(cookieEvidence?.consent_timeline)
  ];
  const firstStorageMs = getFirstRuntimeElapsedMsFromRecords(timingCandidates, [
    "firstTrackingCookieSeenMs",
    "first_tracking_cookie_seen_ms",
    "firstTrackingCookieSetMs",
    "first_tracking_cookie_set_ms",
    "firstCookieSeenMs",
    "first_cookie_seen_ms",
    "firstCookieSetMs",
    "first_cookie_set_ms"
  ]);
  const firstNonEssentialRequestMs = getFirstRuntimeElapsedMsFromRecords(timingCandidates, [
    "firstNonEssentialRequestMs",
    "first_non_essential_request_ms",
    "firstThirdPartyTrackingRequestMs",
    "first_third_party_tracking_request_ms",
    "firstThirdPartyRequestMs",
    "first_third_party_request_ms"
  ]);
  const rows = [
    ...asRecordRows(details?.preConsentCookieExamples),
    ...asRecordRows(cookieEvidence?.cookieWriteEvidence),
    ...asRecordRows(cookieEvidence?.cookies),
    ...asRecordRows(cookieEvidence?.examples),
    ...asRecordRows(cookieEvidence?.storageEvidence)
  ].sort((left, right) => {
    const leftPreConsent = getFirstBooleanValue(left, ["preConsent", "pre_consent", "beforeConsent", "before_consent"]);
    const rightPreConsent = getFirstBooleanValue(right, ["preConsent", "pre_consent", "beforeConsent", "before_consent"]);
    return Number(rightPreConsent === true) - Number(leftPreConsent === true);
  });
  const highlights: string[] = [];
  const storageVendors = uniqueStrings(rows.flatMap((row) => {
    const name = getFirstStringValue(row, ["name", "vendor", "label", "cookieName", "cookie_name", "storageKey", "storage_key"]);
    const normalized = normalizeEvidenceVendor(name ?? "");
    return normalized ? [normalized] : [];
  })).slice(0, 4);
  const domains = uniqueStrings(rows.flatMap((row) => {
    const domain = getFirstStringValue(row, ["domain", "hostname", "host"]);
    return domain ? [domain] : [];
  })).slice(0, 3);
  if (storageVendors.length > 0 || domains.length > 0) {
    const timingSuffix = firstStorageMs !== null
      ? ` First storage signal at ~${formatElapsedSeconds(firstStorageMs)}.`
      : firstNonEssentialRequestMs !== null
        ? ` First non-essential request at ~${formatElapsedSeconds(firstNonEssentialRequestMs)}.`
        : "";
    highlights.push(
      `Storage observed before consent${storageVendors.length > 0 ? `: ${formatList(storageVendors)}` : ""}${domains.length > 0 ? ` on ${formatList(domains)}` : ""}.${timingSuffix}`
    );
  }

  for (const row of rows) {
    const preConsent = getFirstBooleanValue(row, ["preConsent", "pre_consent", "beforeConsent", "before_consent"]);
    if (preConsent === false && rows.some((candidate) =>
      getFirstBooleanValue(candidate, ["preConsent", "pre_consent", "beforeConsent", "before_consent"]) === true
    )) {
      continue;
    }
    const name = getFirstStringValue(row, ["name", "vendor", "label", "cookieName", "cookie_name", "storageKey", "storage_key"]);
    if (!name) {
      continue;
    }
    const firstSeenMs = getFirstRuntimeElapsedMs(row, [
      "firstSeenMs",
      "first_seen_ms",
      "firstObservedMs",
      "first_observed_ms",
      "setAtMs",
      "set_at_ms",
      "sourceRequestFirstSeenMs",
      "source_request_first_seen_ms"
    ]);
    const retainedCategory = getFirstStringValue(row, ["category", "vendorCategory", "vendor_category", "cookieCategory", "cookie_category"]);
    const domain = getFirstStringValue(row, ["domain", "hostname", "host"]);
    const url = getFirstStringValue(row, ["representativeUrl", "representative_url", "requestUrl", "request_url", "url"]);
    const category = normalizeVendorCategory({ category: retainedCategory, name, url: url ?? domain });
    const normalizedName = normalizeEvidenceVendor(name) ?? name;
    highlights.push([
      quote(normalizedName),
      `${quote("preConsent")}: ${preConsent ?? true}`,
      typeof firstSeenMs === "number" ? `${quote("firstSeenMs")}: ${Math.round(firstSeenMs)}` : null,
      category ? `${quote("category")}: ${quote(category)}` : null,
      domain ? `${quote("domain")}: ${quote(domain)}` : null
    ].filter((value): value is string => Boolean(value)).join(", "));
    if (highlights.length >= 3) {
      break;
    }
  }

  return highlights;
}

function buildGenericEvidenceHighlights(finding: ExecutiveEvidenceFinding) {
  const details = finding.evidenceDetails;
  const rowSources = [
    details?.vendors,
    details?.runtimeVendors,
    getRecord(details?.trackingEvidence)?.vendors,
    getRecord(details?.trackingEvidence)?.representativeRequests,
    getRecord(details?.cookieEvidence)?.cookies,
    getRecord(details?.cookieEvidence)?.examples,
    getRecord(details?.accessibilityEvidence)?.examples,
    getRecord(details?.telemetryEvidence)?.categories,
    getRecord(details?.runtimeVendorDisclosure)?.unmatchedVendors
  ];
  const highlights: string[] = [];

  for (const source of rowSources) {
    for (const row of asRecordRows(source)) {
      const highlight = formatPrimitiveEvidence(row, ["name", "vendor", "label", "cookieName", "cookie_name", "rule", "ruleId", "ruleCode"], [
        "category",
        "preConsent",
        "firstSeenMs",
        "domain",
        "durationDays",
        "impact",
        "count"
      ]);
      if (highlight) {
        highlights.push(highlight);
      }
      if (highlights.length >= 3) {
        return highlights;
      }
    }
  }

  const policyRuntimeConflict = details?.policyRuntimeConflict;
  if (policyRuntimeConflict) {
    const vendors = policyRuntimeConflict.runtimeAnchor.vendors.slice(0, 2);
    const host = policyRuntimeConflict.runtimeAnchor.host;
    const firstSeenMs = policyRuntimeConflict.runtimeAnchor.firstSeenMs;
    for (const vendor of vendors.length > 0 ? vendors : host ? [host] : []) {
      highlights.push(`${quote(vendor)}, ${quote("phase")}: ${quote(policyRuntimeConflict.runtimeAnchor.phase ?? "runtime")}${typeof firstSeenMs === "number" ? `, ${quote("firstSeenMs")}: ${Math.round(firstSeenMs)}` : ""}`);
      if (highlights.length >= 3) {
        return highlights;
      }
    }
  }

  return highlights;
}

export function buildRegulatoryChecklistEvidenceHighlights(finding: ExecutiveEvidenceFinding) {
  if (["preconsent_tracking", "pre_consent_tracking_detected", "third_party_tracking_pre_consent"].includes(finding.id)) {
    return uniqueStrings(buildPreConsentTrackingHighlights(finding)).slice(0, 3);
  }
  const highlights = finding.id === "adtech_cookie_pre_consent" ||
          finding.id === "analytics_cookie_pre_consent" ||
          finding.id === "third_party_cookie_pre_consent"
        ? buildPreConsentCookieStorageHighlights(finding)
      : buildGenericEvidenceHighlights(finding);

  if (highlights.length > 0) {
    return uniqueStrings(highlights).slice(0, 3);
  }

  return uniqueStrings((finding.evidencePreview ?? [])
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim()))
    .slice(0, 3);
}
