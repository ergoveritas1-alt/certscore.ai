import type {
  V2ProjectionStatus,
  V2ReportProjectionDraft,
} from "../index";

export const ALLOWED_PROJECTION_STATUSES = new Set<V2ProjectionStatus>([
  "observed",
  "review_signal",
  "checked",
  "not_observed",
  "not_testable",
  "coverage_limitation",
  "assisted_candidate",
]);

const LONG_OPAQUE_TOKEN_PATTERN = /[A-Za-z0-9_-]{48,}/g;

const INTERNAL_DIAGNOSTIC_FIELD_NAMES = new Set([
  "demotionReasons",
  "missingCorroborators",
  "reasons",
  "limitationKey",
  "matchedCriteria",
  "coverageLimitationKeys",
  "findingKey",
  "sourceFindingKey",
  "affectedFindingKeys",
]);

export function projectionSanitizationWarnings(projection: V2ReportProjectionDraft) {
  const serialized = JSON.stringify(projection);
  const warnings = new Set<string>();
  if (serialized.includes("gap_observed")) {
    warnings.add("contains_gap_observed");
  }
  const adapterAuthoredText = [
    ...projection.notes,
    ...projection.rows.flatMap((row) => [
      row.title,
      row.status,
      row.statusLabel,
      ...row.coverageLimitations.map((limitation) => limitation.description),
      ...row.missingCorroborators,
      ...row.demotionReasons,
    ]),
  ].join(" ");
  if (/\b(violation|violates|illegal|unlawful|noncompliant|non-compliant)\b/i.test(adapterAuthoredText)) {
    warnings.add("contains_legal_conclusion_language");
  }
  if (/\b(requestBody|responseBody|setCookieHeaders|cookieValue|rawCookie|bodySizeBytes)\b/.test(serialized)) {
    warnings.add("contains_raw_runtime_or_cookie_fields");
  }
  const sourceRefUrlValues = projection.rows.flatMap((row) =>
    row.sourceEvidenceRefs.flatMap((ref) =>
      [ref.url, ref.label, ref.path].filter((value): value is string => Boolean(value)),
    ),
  );
  if (sourceRefUrlValues.some((value) => hasUnredactedUrlLikeValue(value))) {
    warnings.add("contains_unredacted_query_value");
  }
  if (/\b(gclid|fbclid|msclkid|dclid|wbraid|gbraid)\b(?![^"]*redacted)/i.test(serialized)) {
    warnings.add("contains_unredacted_click_id_name");
  }
  if (projectionContainsUnsafeLongOpaqueValue(projection)) {
    warnings.add("contains_long_opaque_value_without_redaction_context");
  }
  for (const row of projection.rows) {
    if (!ALLOWED_PROJECTION_STATUSES.has(row.status)) {
      warnings.add("contains_disallowed_status");
    }
    if (row.evidencePacket.displaySafeExcerpts.some((excerpt) =>
      (excerpt.displayValueRedacted?.length ?? 0) > 1200,
    )) {
      warnings.add("contains_long_display_excerpt");
    }
  }
  return Array.from(warnings).sort();
}

function projectionContainsUnsafeLongOpaqueValue(projection: V2ReportProjectionDraft) {
  let unsafe = false;
  walkProjectionStrings(projection, [], (value, path) => {
    for (const token of value.matchAll(LONG_OPAQUE_TOKEN_PATTERN)) {
      if (!isSafeInternalDiagnosticToken(token[0], path)) {
        unsafe = true;
        return;
      }
    }
  });
  return unsafe;
}

function walkProjectionStrings(
  value: unknown,
  path: string[],
  visit: (value: string, path: string[]) => void,
) {
  if (typeof value === "string") {
    visit(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkProjectionStrings(entry, [...path, String(index)], visit));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      walkProjectionStrings(entry, [...path, key], visit);
    }
  }
}

function isSafeInternalDiagnosticToken(token: string, path: string[]) {
  const fieldName = [...path].reverse().find((segment) => !/^\d+$/.test(segment));
  if (!fieldName || (!INTERNAL_DIAGNOSTIC_FIELD_NAMES.has(fieldName) && !isRelatedVendorBasisPath(path))) {
    return false;
  }
  if (!/^[a-z][a-z0-9_]{31,119}$/.test(token) || !token.includes("_")) {
    return false;
  }
  if (/[A-Z./:?&=%-]/.test(token)) {
    return false;
  }
  const digitCount = token.replace(/\D/g, "").length;
  if (digitCount / token.length > 0.2) {
    return false;
  }
  if (/^(?:cookie|session|token|auth|bearer|jwt|value|id)_/.test(token)) {
    return false;
  }
  return true;
}

function isRelatedVendorBasisPath(path: string[]) {
  return path.includes("relatedVendors") && path.includes("basis");
}

function hasUnredactedUrlLikeValue(value: string) {
  try {
    const url = new URL(value);
    for (const paramValue of url.searchParams.values()) {
      if (isUnsafeIdentifierValue(paramValue)) {
        return true;
      }
    }
    return hasUnredactedPathParameterValue(url.pathname);
  } catch {
    return hasUnredactedPathParameterValue(value);
  }
}

function hasUnredactedPathParameterValue(value: string) {
  for (const match of value.matchAll(/[:;&/][A-Za-z0-9_.-]{2,}=([^:;&/?#]*)/g)) {
    const paramValue = match[1] ?? "";
    if (isUnsafeIdentifierValue(paramValue)) {
      return true;
    }
  }
  return false;
}

function isUnsafeIdentifierValue(value: string) {
  if (value.length === 0) {
    return false;
  }
  return !/^(?:%3Credacted%3E|<redacted>|redacted)$/i.test(value);
}
