export const WC01_V2_SHADOW_PREVIEW_CONTRACT_VERSION = "wc01.v2_shadow_projection.1";

export type V2ShadowPreviewStatus =
  | "observed"
  | "review_signal"
  | "checked"
  | "not_observed"
  | "not_testable"
  | "coverage_limitation"
  | "assisted_candidate";

export type V2ShadowPreviewAssessmentStatus =
  | "checked"
  | "review_signal"
  | "coverage_limitation"
  | "not_applicable";

export type V2ShadowPreviewRow = {
  rowId: string;
  sourceFindingKey: string;
  category: string;
  status: V2ShadowPreviewStatus;
  wc01AssessmentStatus: V2ShadowPreviewAssessmentStatus;
  topFindingEligible: false;
  gapEligible: false;
  vendorLabels: string[];
  vendorPurposes: string[];
  coverageLimitationReasons: string[];
  matchedCriteria: string[];
  missingCorroborators: string[];
  demotionReasons: string[];
  capped: boolean;
  omittedCount: number;
};

export type V2ShadowPreviewModel = {
  artifactPath: string;
  contractVersion: typeof WC01_V2_SHADOW_PREVIEW_CONTRACT_VERSION;
  productionEligible: false;
  source: {
    projectionVersion: string;
    reviewId?: string;
    scanId: string;
    url: string;
  };
  rows: V2ShadowPreviewRow[];
  rowsByStatus: Record<string, number>;
  rowsByWc01AssessmentStatus: Record<string, number>;
  sanitizerWarnings: string[];
  guardrails: {
    forbiddenGapStatusTokenPresent: false;
    gapEligibleCount: 0;
    productionEligibleTrue: false;
    rawBlockedFieldsPresent: false;
    topFindingEligibleCount: 0;
  };
};

export type V2ShadowPreviewError = {
  code:
    | "artifact_path_not_allowed"
    | "artifact_read_failed"
    | "invalid_json"
    | "invalid_shape"
    | "unsupported_contract"
    | "production_eligible_true"
    | "top_finding_eligible_true"
    | "gap_eligible_true"
    | "forbidden_gap_status_token_present"
    | "raw_blocked_fields_present";
  message: string;
};

type RawShadowProjection = {
  contractVersion?: unknown;
  productionEligible?: unknown;
  source?: unknown;
  rows?: unknown;
  sanitizerWarnings?: unknown;
};

const BLOCKED_RAW_FIELD_PATTERN =
  /\b(requestBody|responseBody|setCookieHeaders|cookieValue|rawCookie|bodySizeBytes|rawNanoReasoning|fullDomText|fullPolicyText)\b/i;

const ALLOWED_STATUSES = new Set<V2ShadowPreviewStatus>([
  "observed",
  "review_signal",
  "checked",
  "not_observed",
  "not_testable",
  "coverage_limitation",
  "assisted_candidate",
]);

const ALLOWED_ASSESSMENT_STATUSES = new Set<V2ShadowPreviewAssessmentStatus>([
  "checked",
  "review_signal",
  "coverage_limitation",
  "not_applicable",
]);

export function isV2ShadowPreviewEnabled(
  env: Record<string, unknown> = process.env,
) {
  const value = env.CERTSCORE_V2_SHADOW_PREVIEW_ENABLED;
  return typeof value === "string" && value.trim() === "1";
}

export function parseV2ShadowPreviewArtifact(
  raw: string,
  artifactPath = "inline",
): V2ShadowPreviewModel {
  if (raw.includes("gap_observed")) {
    throw previewError(
      "forbidden_gap_status_token_present",
      "Forbidden gap status token appears in the shadow artifact.",
    );
  }
  if (BLOCKED_RAW_FIELD_PATTERN.test(raw)) {
    throw previewError(
      "raw_blocked_fields_present",
      "Raw blocked evidence field names appear in the shadow artifact.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw previewError("invalid_json", "Artifact is not valid JSON.");
  }
  if (!isRecord(parsed)) {
    throw previewError("invalid_shape", "Shadow artifact must be a JSON object.");
  }

  const projection = parsed as RawShadowProjection;
  if (projection.contractVersion !== WC01_V2_SHADOW_PREVIEW_CONTRACT_VERSION) {
    throw previewError(
      "unsupported_contract",
      "Unsupported WC01 v2 shadow contract version.",
    );
  }
  if (projection.productionEligible === true) {
    throw previewError(
      "production_eligible_true",
      "Shadow artifact is marked production eligible and cannot be previewed.",
    );
  }
  if (!Array.isArray(projection.rows)) {
    throw previewError("invalid_shape", "Shadow artifact rows must be an array.");
  }

  const topFindingEligibleCount = projection.rows.filter((row) =>
    isRecord(row) && row.topFindingEligible === true
  ).length;
  if (topFindingEligibleCount > 0) {
    throw previewError(
      "top_finding_eligible_true",
      "Shadow artifact contains top-finding eligible rows.",
    );
  }

  const gapEligibleCount = projection.rows.filter((row) =>
    isRecord(row) && row.gapEligible === true
  ).length;
  if (gapEligibleCount > 0) {
    throw previewError(
      "gap_eligible_true",
      "Shadow artifact contains gap-eligible rows.",
    );
  }

  const source = parseSource(projection.source);
  const rows = projection.rows.map(parseRow);

  return {
    artifactPath,
    contractVersion: WC01_V2_SHADOW_PREVIEW_CONTRACT_VERSION,
    productionEligible: false,
    source,
    rows,
    rowsByStatus: countBy(rows.map((row) => row.status)),
    rowsByWc01AssessmentStatus: countBy(rows.map((row) => row.wc01AssessmentStatus)),
    sanitizerWarnings: parseStringArray(projection.sanitizerWarnings),
    guardrails: {
      forbiddenGapStatusTokenPresent: false,
      gapEligibleCount: 0,
      productionEligibleTrue: false,
      rawBlockedFieldsPresent: false,
      topFindingEligibleCount: 0,
    },
  };
}

function parseSource(value: unknown): V2ShadowPreviewModel["source"] {
  if (!isRecord(value)) {
    throw previewError("invalid_shape", "Shadow artifact source must be an object.");
  }
  const scanId = stringValue(value.scanId);
  const url = stringValue(value.url);
  const projectionVersion = stringValue(value.projectionVersion);
  if (!scanId || !url || !projectionVersion) {
    throw previewError("invalid_shape", "Shadow artifact source is missing scanId, url, or projectionVersion.");
  }
  const reviewId = stringValue(value.reviewId);
  return reviewId ? { scanId, url, projectionVersion, reviewId } : { scanId, url, projectionVersion };
}

function parseRow(value: unknown): V2ShadowPreviewRow {
  if (!isRecord(value)) {
    throw previewError("invalid_shape", "Shadow artifact row must be an object.");
  }
  const status = stringValue(value.status);
  const wc01AssessmentStatus = stringValue(value.wc01AssessmentStatus);
  if (!status || !ALLOWED_STATUSES.has(status as V2ShadowPreviewStatus)) {
    throw previewError("invalid_shape", "Shadow artifact row has unsupported status.");
  }
  if (!wc01AssessmentStatus || !ALLOWED_ASSESSMENT_STATUSES.has(wc01AssessmentStatus as V2ShadowPreviewAssessmentStatus)) {
    throw previewError("invalid_shape", "Shadow artifact row has unsupported WC01 assessment status.");
  }

  const evidence = isRecord(value.evidence) ? value.evidence : {};
  const policy = isRecord(value.policy) ? value.policy : {};
  const vendors = Array.isArray(value.vendors) ? value.vendors.filter(isRecord) : [];

  return {
    rowId: stringValue(value.rowId) ?? "unknown_row",
    sourceFindingKey: stringValue(value.sourceFindingKey) ?? "unknown_finding",
    category: stringValue(value.category) ?? "unknown",
    status: status as V2ShadowPreviewStatus,
    wc01AssessmentStatus: wc01AssessmentStatus as V2ShadowPreviewAssessmentStatus,
    topFindingEligible: false,
    gapEligible: false,
    vendorLabels: uniqueStrings(vendors.flatMap((vendor) => [stringValue(vendor.vendor), stringValue(vendor.entity)])),
    vendorPurposes: uniqueStrings(vendors.map((vendor) => stringValue(vendor.purpose))),
    coverageLimitationReasons: parseStringArray(policy.reviewOnlyReasons).filter((reason) =>
      reason === "coverage_limitation_present" || reason === "source_module_missing_or_incomplete"
    ),
    matchedCriteria: parseStringArray(policy.matchedCriteria),
    missingCorroborators: parseStringArray(policy.missingCorroborators),
    demotionReasons: parseStringArray(policy.demotionReasons),
    capped: Boolean(evidence.capped),
    omittedCount: numberValue(evidence.omittedCount) ?? 0,
  };
}

function previewError(code: V2ShadowPreviewError["code"], message: string) {
  return { code, message } satisfies V2ShadowPreviewError;
}

export function isV2ShadowPreviewError(value: unknown): value is V2ShadowPreviewError {
  return isRecord(value) && typeof value.code === "string" && typeof value.message === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function countBy(values: string[]) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function uniqueStrings(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
