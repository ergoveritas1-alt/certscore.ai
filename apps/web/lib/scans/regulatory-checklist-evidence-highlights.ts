import type { CertScoreFindingEvidenceDetails } from "./finding-registry";

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
  return [...new Set(values)];
}

function formatPrimitiveEvidence(record: Record<string, unknown>, nameKeys: string[], extraKeys: string[]) {
  const name = getFirstStringValue(record, nameKeys);
  if (!name) {
    return null;
  }

  const parts = [quote(name)];
  for (const key of extraKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
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
  const timing = getRecord(details?.timingAnalysis) ?? getRecord((details as Record<string, unknown> | undefined)?.timing);
  const fallbackFirstSeenMs = getFirstNumberValue(timing, [
    "firstThirdPartyTrackingRequestMs",
    "firstThirdPartyRequestMs",
    "firstSeenMs",
    "first_seen_ms"
  ]);
  const rows = [
    ...asRecordRows(details?.vendors),
    ...asRecordRows(details?.runtimeVendors),
    ...asRecordRows(trackingEvidence?.vendors),
    ...asRecordRows(trackingEvidence?.representativeRequests),
    ...asRecordRows(details?.representativeRequests)
  ];
  const highlights: string[] = [];

  for (const row of rows) {
    const name = getFirstStringValue(row, ["name", "vendor", "label"]);
    if (!name) {
      continue;
    }
    const preConsent = getFirstBooleanValue(row, ["preConsent", "pre_consent", "beforeConsent", "before_consent"]) ?? true;
    const firstSeenMs = getFirstNumberValue(row, ["firstSeenMs", "first_seen_ms", "firstRequestMs", "first_request_ms", "timestampMs", "timestamp_ms"]) ?? fallbackFirstSeenMs;
    highlights.push(`${quote(name)}, ${quote("preConsent")}: ${preConsent}${typeof firstSeenMs === "number" ? `, ${quote("firstSeenMs")}: ${Math.round(firstSeenMs)}` : ""}`);
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
  const highlights =
    finding.id === "pre_consent_tracking_detected"
      ? buildPreConsentTrackingHighlights(finding)
      : buildGenericEvidenceHighlights(finding);

  if (highlights.length > 0) {
    return uniqueStrings(highlights).slice(0, 3);
  }

  return uniqueStrings((finding.evidencePreview ?? [])
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim()))
    .slice(0, 3);
}
