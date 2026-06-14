import type {
  CoverageLimitation,
  DirectVsInferred,
  DisplaySafeEvidenceExcerpt,
} from "@certscore/contracts";
import { projectionSanitizationWarnings } from "./cli/sanitization";
import type {
  V2ConfidenceBand,
  V2ProjectionStatus,
  V2ReportProjectionDraft,
  V2ReportProjectionRow,
  V2SafeVendorRef,
  V2Wc01CompatibleAssessmentStatus,
} from "./index";

export const WC01_V2_SHADOW_PROJECTION_CONTRACT_VERSION =
  "wc01.v2_shadow_projection.1";

export type Wc01V2ShadowCategory =
  | "runtime"
  | "policy_surface"
  | "consent_flow"
  | "unknown";

export type Wc01V2ShadowStatus =
  | "observed"
  | "review_signal"
  | "checked"
  | "not_observed"
  | "not_testable"
  | "coverage_limitation"
  | "assisted_candidate";

export type Wc01V2ShadowProjection = {
  contractVersion: typeof WC01_V2_SHADOW_PROJECTION_CONTRACT_VERSION;
  source: {
    scanId: string;
    reviewId?: string;
    url: string;
    projectionVersion: string;
  };
  rows: Wc01V2ShadowRow[];
  limitations: Wc01V2ShadowLimitation[];
  sanitizerWarnings: string[];
  productionEligible: false;
};

export type Wc01V2ShadowRow = {
  rowId: string;
  sourceFindingKey: string;
  category: Wc01V2ShadowCategory;
  status: Wc01V2ShadowStatus;
  wc01AssessmentStatus: V2Wc01CompatibleAssessmentStatus;
  topFindingEligible: false;
  gapEligible: false;
  evidence: {
    excerptIds: string[];
    sourceRefIds: string[];
    displaySafeExcerpts: Wc01V2ShadowDisplaySafeExcerpt[];
    capped: boolean;
    omittedCount: number;
  };
  vendors: Wc01V2ShadowVendorRef[];
  confidence: {
    score?: number;
    band?: V2ConfidenceBand;
    directVsInferred?: DirectVsInferred;
  };
  policy: {
    reviewOnlyReasons: string[];
    matchedCriteria: string[];
    missingCorroborators: string[];
    demotionReasons: string[];
  };
};

export type Wc01V2ShadowDisplaySafeExcerpt = Pick<
  DisplaySafeEvidenceExcerpt,
  | "excerptId"
  | "sourceEventId"
  | "sourceEventType"
  | "sourceScanner"
  | "scenario"
  | "consentStateAtTime"
  | "pagePhase"
  | "observedAtMs"
  | "evidenceKind"
  | "displayLabel"
  | "displayValueRedacted"
  | "hostname"
  | "path"
  | "queryParamNames"
  | "cookieNames"
  | "headerNames"
  | "vendorRef"
  | "sensitivity"
  | "redactionReason"
  | "confidence"
  | "directVsInferred"
>;

export type Wc01V2ShadowVendorRef = Pick<
  V2SafeVendorRef,
  | "observationId"
  | "entity"
  | "vendor"
  | "product"
  | "purpose"
  | "confidence"
  | "basis"
  | "regulatoryRelevance"
>;

export type Wc01V2ShadowLimitation = Pick<
  CoverageLimitation,
  | "limitationKey"
  | "description"
  | "affectedFindingKeys"
  | "sourceModulesRequired"
  | "sourceModulesPresent"
>;

const ALLOWED_SHADOW_STATUSES = new Set<string>([
  "observed",
  "review_signal",
  "checked",
  "not_observed",
  "not_testable",
  "coverage_limitation",
  "assisted_candidate",
]);

const ALLOWED_CATEGORIES = new Set<string>([
  "runtime",
  "policy_surface",
  "consent_flow",
]);

const REVIEW_ONLY_FINDING_KEY_PATTERNS = [
  /unresolved.*endpoint/i,
  /policy.*runtime.*alignment/i,
  /runtime.*vendor.*alignment/i,
  /accept_reject_runtime_delta/i,
  /tracking_after_refusal/i,
  /reject_did_not_reduce/i,
  /vendors?_persist/i,
  /vendors?_appear_only_after_accept/i,
  /cookies?_persist/i,
];

const NON_TRACKER_PURPOSES = new Set([
  "security",
  "performance_monitoring",
  "customer_support",
  "consent_management",
  "tag_management",
  "infrastructure",
  "unknown",
]);

const NON_TRACKER_TEXT_PATTERNS = [
  /\bcdn\b/i,
  /\bstatic\b/i,
  /\bsite[-_ ]owned\b/i,
  /\bfirst[-_ ]party\b/i,
  /\bfraud[-_ ]?prevention\b/i,
  /\bbot[-_ ]?defen[cs]e\b/i,
  /\brum\b/i,
  /\breal user monitoring\b/i,
  /\blive[-_ ]?chat\b/i,
];

const LEGAL_CONCLUSION_PATTERN =
  /\b(violation|violates|illegal|unlawful|noncompliant|non-compliant)\b/i;

const BLOCKED_FIELD_PATTERN =
  /\b(requestBody|responseBody|setCookieHeaders|cookieValue|rawCookie|bodySizeBytes|rawNanoReasoning|fullDomText|fullPolicyText)\b/i;

const CLICK_ID_PARAM_PATTERN =
  /\b(gclid|fbclid|msclkid|dclid|wbraid|gbraid)=([^&#\s]+)/gi;

const LONG_OPAQUE_TOKEN_PATTERN = /[A-Za-z0-9_-]{48,}/g;

export function projectV2ToWc01ShadowProjection(
  projection: V2ReportProjectionDraft,
): Wc01V2ShadowProjection {
  return {
    contractVersion: WC01_V2_SHADOW_PROJECTION_CONTRACT_VERSION,
    source: {
      scanId: projection.scanId,
      reviewId: projection.sourceReviewId,
      url: sanitizeDisplayString(projection.url),
      projectionVersion: projection.projectionVersion,
    },
    rows: projection.rows.map(projectRow),
    limitations: projection.coverageLimitations.map(sanitizeLimitation),
    sanitizerWarnings: projectionSanitizationWarnings(projection).map(sanitizeWarningString),
    productionEligible: false,
  };
}

function projectRow(row: V2ReportProjectionRow): Wc01V2ShadowRow {
  const status = shadowStatusForRow(row);
  const reviewOnlyReasons = reviewOnlyReasonsForRow(row, status);
  const displaySafeExcerpts = row.evidencePacket.displaySafeExcerpts.map(sanitizeDisplaySafeExcerpt);
  const retainedExcerptIds = uniqueStrings(displaySafeExcerpts.map((excerpt) => sanitizeKey(excerpt.excerptId)));
  const retainedSourceEventIds = new Set(
    displaySafeExcerpts
      .map((excerpt) => excerpt.sourceEventId)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
  const retainedSourceRefIds = uniqueStrings(
    row.evidencePacket.sourceEvidenceRefs
      .filter((ref) => typeof ref.eventId === "string" && retainedSourceEventIds.has(ref.eventId))
      .map((ref) => sanitizeKey(ref.refId)),
  );

  return {
    rowId: rowIdForRow(row),
    sourceFindingKey: sanitizeKey(row.findingKey),
    category: ALLOWED_CATEGORIES.has(row.category) ? row.category : "unknown",
    status,
    wc01AssessmentStatus: wc01AssessmentStatusForShadowStatus(status),
    topFindingEligible: false,
    gapEligible: false,
    evidence: {
      excerptIds: retainedExcerptIds,
      sourceRefIds: retainedSourceRefIds,
      displaySafeExcerpts,
      capped: Boolean(row.evidencePacket.displaySafeExcerptStats.capped),
      omittedCount: Math.max(0, Math.trunc(row.evidencePacket.displaySafeExcerptStats.omittedCount)),
    },
    vendors: row.relatedVendors.map(sanitizeVendorRef),
    confidence: {
      score: Number.isFinite(row.confidence) ? row.confidence : undefined,
      band: row.confidenceBand,
      directVsInferred: row.directVsInferred,
    },
    policy: {
      reviewOnlyReasons,
      matchedCriteria: sanitizeDiagnosticStrings(row.matchedCriteria),
      missingCorroborators: sanitizeDiagnosticStrings(row.missingCorroborators),
      demotionReasons: sanitizeDiagnosticStrings(row.demotionReasons),
    },
  };
}

function shadowStatusForRow(row: V2ReportProjectionRow): Wc01V2ShadowStatus {
  const rawStatus = row.status as string;
  if (!ALLOWED_SHADOW_STATUSES.has(rawStatus)) {
    return "coverage_limitation";
  }
  if (hasCoverageLimitation(row) || hasMissingOrFailedModule(row)) {
    return rawStatus === "not_testable" ? "not_testable" : "coverage_limitation";
  }
  if (isReviewOnlyRow(row) && rawStatus !== "coverage_limitation") {
    return "review_signal";
  }
  return rawStatus as Wc01V2ShadowStatus;
}

function wc01AssessmentStatusForShadowStatus(
  status: Wc01V2ShadowStatus,
): V2Wc01CompatibleAssessmentStatus {
  switch (status) {
    case "review_signal":
    case "assisted_candidate":
      return "review_signal";
    case "coverage_limitation":
    case "not_testable":
      return "coverage_limitation";
    case "not_observed":
      return "not_applicable";
    case "observed":
    case "checked":
    default:
      return "checked";
  }
}

function reviewOnlyReasonsForRow(
  row: V2ReportProjectionRow,
  status: Wc01V2ShadowStatus,
) {
  const reasons = [
    "shadow_projection_only",
    status === "assisted_candidate" ? "assisted_candidate_review_only" : null,
    isReviewOnlyRow(row) ? "review_only_finding_key" : null,
    hasCoverageLimitation(row) ? "coverage_limitation_present" : null,
    hasMissingOrFailedModule(row) ? "source_module_missing_or_incomplete" : null,
    row.relatedVendors.some(isNonTrackerVendor) ? "non_tracker_purpose_diagnostic_only" : null,
    hasLegalConclusionLanguage(row) ? "unsafe_legal_conclusion_language_withheld" : null,
    rowContainsBlockedFieldName(row) ? "unsafe_raw_field_withheld" : null,
  ];
  return uniqueStrings(reasons);
}

function rowIdForRow(row: V2ReportProjectionRow) {
  return sanitizeKey(
    row.findingKey
      .replace(/_review_signal$/i, "_review")
      .replace(/_observed_or_not_observed$/i, "_availability"),
  );
}

function isReviewOnlyRow(row: V2ReportProjectionRow) {
  if (row.status === "assisted_candidate") {
    return true;
  }
  return REVIEW_ONLY_FINDING_KEY_PATTERNS.some((pattern) => pattern.test(row.findingKey));
}

function hasCoverageLimitation(row: V2ReportProjectionRow) {
  return row.coverageLimitations.length > 0 || row.status === "coverage_limitation";
}

function hasMissingOrFailedModule(row: V2ReportProjectionRow) {
  const missingRequiredModule = row.sourceModulesRequired.some(
    (moduleName) => !row.sourceModulesPresent.includes(moduleName),
  );
  const failedRequiredModule = row.evidencePacket.moduleRunContext.some((moduleRun) =>
    row.sourceModulesRequired.includes(moduleRun.moduleName) &&
    (
      moduleRun.status === "failed" ||
      moduleRun.status === "partial" ||
      moduleRun.status === "skipped_budget" ||
      moduleRun.status === "not_testable"
    ),
  );
  return missingRequiredModule || failedRequiredModule;
}

function hasLegalConclusionLanguage(row: V2ReportProjectionRow) {
  return LEGAL_CONCLUSION_PATTERN.test(JSON.stringify([
    row.title,
    row.statusLabel,
    row.matchedCriteria,
    row.missingCorroborators,
    row.demotionReasons,
    row.coverageLimitations.map((limitation) => limitation.description),
  ]));
}

function rowContainsBlockedFieldName(row: V2ReportProjectionRow) {
  return BLOCKED_FIELD_PATTERN.test(JSON.stringify(row));
}

function sanitizeDisplaySafeExcerpt(
  excerpt: DisplaySafeEvidenceExcerpt,
): Wc01V2ShadowDisplaySafeExcerpt {
  return {
    excerptId: sanitizeKey(excerpt.excerptId),
    sourceEventId: sanitizeOptionalKey(excerpt.sourceEventId),
    sourceEventType: sanitizeOptionalKey(excerpt.sourceEventType),
    sourceScanner: sanitizeOptionalKey(excerpt.sourceScanner),
    scenario: sanitizeOptionalKey(excerpt.scenario),
    consentStateAtTime: excerpt.consentStateAtTime,
    pagePhase: excerpt.pagePhase,
    observedAtMs: Number.isFinite(excerpt.observedAtMs) ? excerpt.observedAtMs : 0,
    evidenceKind: excerpt.evidenceKind,
    displayLabel: sanitizeDisplayString(excerpt.displayLabel),
    displayValueRedacted: sanitizeDisplayString(excerpt.displayValueRedacted ?? ""),
    hostname: sanitizeOptionalDisplayString(excerpt.hostname),
    path: sanitizeOptionalDisplayString(excerpt.path),
    queryParamNames: excerpt.queryParamNames.map(sanitizeKey),
    cookieNames: excerpt.cookieNames.map(sanitizeKey),
    headerNames: excerpt.headerNames.map(sanitizeKey),
    vendorRef: sanitizeOptionalKey(excerpt.vendorRef),
    sensitivity: excerpt.sensitivity,
    redactionReason: sanitizeOptionalDisplayString(excerpt.redactionReason),
    confidence: excerpt.confidence,
    directVsInferred: excerpt.directVsInferred,
  };
}

function sanitizeVendorRef(vendor: V2SafeVendorRef): Wc01V2ShadowVendorRef {
  const safeVendor = {
    observationId: sanitizeKey(vendor.observationId),
    entity: sanitizeDisplayString(vendor.entity),
    vendor: sanitizeDisplayString(vendor.vendor),
    product: sanitizeOptionalDisplayString(vendor.product),
    purpose: vendor.purpose,
    confidence: vendor.confidence,
    basis: sanitizeDiagnosticStrings(vendor.basis),
    regulatoryRelevance: sanitizeDiagnosticStrings(vendor.regulatoryRelevance),
  };
  if (isNonTrackerVendor(vendor)) {
    return {
      ...safeVendor,
      regulatoryRelevance: [],
      basis: uniqueStrings([...safeVendor.basis, "diagnostic_non_tracker_purpose_only"]),
    };
  }
  return safeVendor;
}

function isNonTrackerVendor(vendor: V2SafeVendorRef) {
  const searchable = [
    vendor.purpose,
    vendor.entity,
    vendor.vendor,
    vendor.product,
    ...vendor.basis,
    ...vendor.regulatoryRelevance,
  ].filter((value): value is string => typeof value === "string").join(" ");

  return NON_TRACKER_PURPOSES.has(vendor.purpose) ||
    NON_TRACKER_TEXT_PATTERNS.some((pattern) => pattern.test(searchable));
}

function sanitizeLimitation(
  limitation: CoverageLimitation,
): Wc01V2ShadowLimitation {
  return {
    limitationKey: sanitizeKey(limitation.limitationKey),
    description: sanitizeDisplayString(limitation.description),
    affectedFindingKeys: limitation.affectedFindingKeys.map(sanitizeKey),
    sourceModulesRequired: limitation.sourceModulesRequired.map(sanitizeKey),
    sourceModulesPresent: limitation.sourceModulesPresent.map(sanitizeKey),
  };
}

function sanitizeDiagnosticStrings(values: string[]) {
  return uniqueStrings(values.map(sanitizeDiagnosticString));
}

function sanitizeDiagnosticString(value: string) {
  if (LEGAL_CONCLUSION_PATTERN.test(value)) {
    return "withheld_unsafe_legal_conclusion_language";
  }
  if (BLOCKED_FIELD_PATTERN.test(value)) {
    return "withheld_unsafe_raw_field_reference";
  }
  return sanitizeKey(value);
}

function sanitizeWarningString(value: string) {
  return value
    .replace(/gap_observed/gi, "disallowed_gap_status")
    .replace(/[^\w:.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 180);
}

function sanitizeOptionalKey(value: string | undefined) {
  return value ? sanitizeKey(value) : undefined;
}

function sanitizeKey(value: string) {
  return sanitizeDisplayString(value)
    .replace(/[^\w:.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 180);
}

function sanitizeOptionalDisplayString(value: string | undefined) {
  return value ? sanitizeDisplayString(value) : undefined;
}

function sanitizeDisplayString(value: string) {
  return value
    .replace(CLICK_ID_PARAM_PATTERN, "$1=<redacted>")
    .replace(LONG_OPAQUE_TOKEN_PATTERN, "<redacted>")
    .replace(LEGAL_CONCLUSION_PATTERN, "withheld_review_language")
    .replace(BLOCKED_FIELD_PATTERN, "withheld_raw_field")
    .slice(0, 1200);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
