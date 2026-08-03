import type {
  GdprEprivacyCoverageChecklistItem,
  GdprEprivacyCoverageChecklistStatus
} from "./gdpr-eprivacy-coverage-checklist";

export const ADMIN_EVIDENCE_MATRIX_VERSION = "admin_evidence_matrix.v1" as const;

export type AdminEvidenceStatus =
  | "observed"
  | "gap_observed"
  | "review_signal"
  | "not_observed"
  | "not_confirmed"
  | "not_testable"
  | "insufficient_evidence"
  | "out_of_scope";

export type AdminEvidenceResult = {
  descriptor: string;
  status: AdminEvidenceStatus;
};

export type AdminEvidenceAggregate = {
  concern: number;
  observed: number;
  projected: number;
  review: number;
  total: number;
  unresolved: number;
};

export type AdminPolicyEvidenceStage =
  | "topic_evidence_projected"
  | "topic_evidence_limited"
  | "projection_unavailable"
  | "text_not_retained"
  | "unsupported_language"
  | "language_unknown"
  | "retrieval_limited"
  | "content_limited"
  | "processing_error"
  | "unknown";

export type AdminPolicyEvidenceDiagnostic = {
  detectedLanguage: string | null;
  extractionFailureReason: string | null;
  extractionStatus: string | null;
  gdprTransparencyLanguageSupported: boolean | null;
  projectionStatus: string | null;
  stage: AdminPolicyEvidenceStage;
  topicResults: {
    ambiguous: number;
    disclosureObserved: number;
    extractionIncomplete: number;
    notEvaluated: number;
    notLocatedAutomatically: number;
  };
};

export function adminPolicyEvidenceStageLabel(stage: AdminPolicyEvidenceStage) {
  return ({
    topic_evidence_projected: "Topics projected",
    topic_evidence_limited: "Topic evidence limited",
    projection_unavailable: "Projection unavailable",
    text_not_retained: "Policy text not retained",
    unsupported_language: "Language unsupported",
    language_unknown: "Language unknown",
    retrieval_limited: "Policy retrieval limited",
    content_limited: "Policy content limited",
    processing_error: "Policy processing error",
    unknown: "Policy evidence unknown"
  } satisfies Record<AdminPolicyEvidenceStage, string>)[stage];
}

export function adminPolicyEvidenceDiagnosticTitle(diagnostic: AdminPolicyEvidenceDiagnostic) {
  const topicResults = diagnostic.topicResults;
  return [
    adminPolicyEvidenceStageLabel(diagnostic.stage),
    diagnostic.extractionStatus ? `extraction ${diagnostic.extractionStatus.replaceAll("_", " ")}` : null,
    diagnostic.projectionStatus ? `projection ${diagnostic.projectionStatus.replaceAll("_", " ")}` : null,
    diagnostic.detectedLanguage ? `language ${diagnostic.detectedLanguage}` : null,
    diagnostic.gdprTransparencyLanguageSupported === false ? "GDPR Transparency language unsupported" : null,
    topicResults.disclosureObserved > 0 ? `${topicResults.disclosureObserved} topic disclosures retained` : null,
    topicResults.ambiguous > 0 ? `${topicResults.ambiguous} ambiguous` : null,
    topicResults.notLocatedAutomatically > 0 ? `${topicResults.notLocatedAutomatically} not located automatically` : null,
    topicResults.extractionIncomplete > 0 ? `${topicResults.extractionIncomplete} extraction-limited` : null,
    diagnostic.extractionFailureReason?.replaceAll("_", " ") ?? null
  ].filter((value): value is string => Boolean(value)).join(" · ");
}

const TRANSPARENCY_ROWS = {
  CC: "controller_contact_disclosure",
  LB: "legal_basis_disclosure_observed",
  DR: "retention_disclosure_observed",
  PP: "processing_purposes_disclosure",
  RC: "recipients_vendor_categories_disclosure",
  DS: "data_subject_rights_disclosure",
  IT: "international_transfers_disclosure",
  PC: "dpo_contact_point_disclosure",
  SA: "supervisory_authority_complaint_disclosure",
  AD: "automated_decision_making_profiling_disclosure"
} as const;

const TRANSPORT_ROWS = {
  HD: "transport_security_https_delivery",
  HR: "transport_security_http_redirect",
  MC: "transport_security_mixed_content",
  TC: "transport_security_tls_certificate",
  FT: "transport_security_form_transport"
} as const;

const RUNTIME_ROWS = {
  FP: "device_identification_fingerprinting_signal_observed",
  SR: "session_replay_fingerprinting_review",
  IF: "third_party_iframe_pre_consent",
  SM: "social_media_embed_pre_consent",
  "3P": "embedded_content_pre_consent"
} as const;

const PRIVACY_CONSENT_ROWS = {
  privacyNotice: "privacy_notice_availability",
  mechanism: "consent_surface_observed",
  cmp: "cmp_framework_signal_observed",
  accept: "accept_consent_control",
  reject: "reject_all_path_availability",
  options: "options_settings_preferences_control"
} as const;

type ResultMap<T extends Record<string, string>> = { [K in keyof T]: AdminEvidenceResult | null };

export type AdminEvidenceMatrix = {
  generatedAt: string;
  policyEvidence?: AdminPolicyEvidenceDiagnostic | null;
  privacyConsent: ResultMap<typeof PRIVACY_CONSENT_ROWS> & { cmpVendorName: string | null };
  runtime: { aggregate: AdminEvidenceAggregate; results: ResultMap<typeof RUNTIME_ROWS> };
  sourceProjectionVersion: string | null;
  transparency: { aggregate: AdminEvidenceAggregate; results: ResultMap<typeof TRANSPARENCY_ROWS> };
  transport: { aggregate: AdminEvidenceAggregate; results: ResultMap<typeof TRANSPORT_ROWS> };
  version: typeof ADMIN_EVIDENCE_MATRIX_VERSION;
};

const STATUS_MAP: Record<GdprEprivacyCoverageChecklistStatus, AdminEvidenceStatus> = {
  "Observed": "observed",
  "Gap observed": "gap_observed",
  "Review signal": "review_signal",
  "Not observed": "not_observed",
  "Not confirmed": "not_confirmed",
  "Not testable": "not_testable",
  "Insufficient evidence": "insufficient_evidence",
  "Out of scope": "out_of_scope"
};

const VALID_STATUSES = new Set<AdminEvidenceStatus>(Object.values(STATUS_MAP));
const VALID_POLICY_EVIDENCE_STAGES = new Set<AdminPolicyEvidenceStage>([
  "topic_evidence_projected",
  "topic_evidence_limited",
  "projection_unavailable",
  "text_not_retained",
  "unsupported_language",
  "language_unknown",
  "retrieval_limited",
  "content_limited",
  "processing_error",
  "unknown"
]);

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function policyEvidenceHealth(row: GdprEprivacyCoverageChecklistItem | undefined) {
  const retained = record(row?.criticalEvidence?.retainedEvidence);
  const summary = record(retained?.policySurfaceSummary) ?? record(retained?.policy_surface_summary);
  return record(retained?.policyTextExtractionHealth) ??
    record(retained?.policy_text_extraction_health) ??
    record(summary?.policyTextExtractionHealth) ??
    record(summary?.policy_text_extraction_health);
}

function policyEvidenceStage(input: {
  extractionStatus: string | null;
  projectionStatus: string | null;
  topicResults: AdminPolicyEvidenceDiagnostic["topicResults"];
}): AdminPolicyEvidenceStage {
  if (input.projectionStatus === "unavailable" || ["projection_unavailable", "artifact_unavailable"].includes(input.extractionStatus ?? "")) {
    return "projection_unavailable";
  }
  if (input.extractionStatus === "unsupported_language") return "unsupported_language";
  if (input.extractionStatus === "language_unknown") return "language_unknown";
  if (["empty_policy_text", "thin"].includes(input.extractionStatus ?? "")) return "text_not_retained";
  if (["not_attempted", "blocked", "low_quality_access_challenge"].includes(input.extractionStatus ?? "")) return "retrieval_limited";
  if (["partial", "truncated", "malformed", "low_quality_extracted_code_or_config", "low_quality_non_policy_text"].includes(input.extractionStatus ?? "")) return "content_limited";
  if (input.extractionStatus === "errored") return "processing_error";
  if (input.extractionStatus === "ok") {
    return input.topicResults.ambiguous > 0 || input.topicResults.extractionIncomplete > 0 || input.topicResults.notLocatedAutomatically > 0
      ? "topic_evidence_limited"
      : "topic_evidence_projected";
  }
  return "unknown";
}

function projectPolicyEvidenceDiagnostic(
  checklistRows: GdprEprivacyCoverageChecklistItem[],
  byId: Map<string, GdprEprivacyCoverageChecklistItem>
): AdminPolicyEvidenceDiagnostic | null {
  const extractionRow = byId.get("policy_text_extraction");
  const fallbackRow = Object.values(TRANSPARENCY_ROWS).map((id) => byId.get(id)).find(Boolean);
  const health = policyEvidenceHealth(extractionRow ?? fallbackRow);
  const topicResults = {
    ambiguous: 0,
    disclosureObserved: 0,
    extractionIncomplete: 0,
    notEvaluated: 0,
    notLocatedAutomatically: 0
  };
  for (const rowId of Object.values(TRANSPARENCY_ROWS)) {
    const retained = record(byId.get(rowId)?.criticalEvidence?.retainedEvidence);
    const assessment = record(retained?.policyEvidenceAssessment) ?? record(retained?.policy_evidence_assessment);
    const result = stringValue(assessment?.result);
    if (result === "ambiguous") topicResults.ambiguous += 1;
    if (result === "disclosure_observed") topicResults.disclosureObserved += 1;
    if (result === "extraction_incomplete") topicResults.extractionIncomplete += 1;
    if (result === "not_evaluated") topicResults.notEvaluated += 1;
    if (result === "not_located_automatically") topicResults.notLocatedAutomatically += 1;
  }
  if (!health && checklistRows.length === 0 && Object.values(topicResults).every((count) => count === 0)) {
    return null;
  }
  const extractionStatus = stringValue(health?.policyTextExtractionStatus ?? health?.policy_text_extraction_status);
  const projectionStatus = stringValue(health?.policyTextEvidenceProjectionStatus ?? health?.policy_text_evidence_projection_status);
  return {
    detectedLanguage: stringValue(health?.detectedPolicyLanguage ?? health?.detected_policy_language),
    extractionFailureReason: stringValue(health?.extractionFailureReason ?? health?.extraction_failure_reason),
    extractionStatus,
    gdprTransparencyLanguageSupported:
      typeof (health?.gdprTransparencyLanguageSupported ?? health?.gdpr_transparency_language_supported) === "boolean"
        ? (health?.gdprTransparencyLanguageSupported ?? health?.gdpr_transparency_language_supported) as boolean
        : null,
    projectionStatus,
    stage: policyEvidenceStage({ extractionStatus, projectionStatus, topicResults }),
    topicResults
  };
}

function boundedDescriptor(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= 220 ? normalized : `${normalized.slice(0, 217).trimEnd()}…`;
}

function projectResult(row: GdprEprivacyCoverageChecklistItem | undefined): AdminEvidenceResult | null {
  if (!row) return null;
  return {
    descriptor: boundedDescriptor(row.note || row.explanation || row.label),
    status: STATUS_MAP[row.status]
  };
}

function projectResults<T extends Record<string, string>>(
  definitions: T,
  byId: Map<string, GdprEprivacyCoverageChecklistItem>
): ResultMap<T> {
  return Object.fromEntries(
    Object.entries(definitions).map(([code, rowId]) => [code, projectResult(byId.get(rowId))])
  ) as ResultMap<T>;
}

function aggregate(results: Record<string, AdminEvidenceResult | null>, total: number): AdminEvidenceAggregate {
  const projected = Object.values(results).filter((result): result is AdminEvidenceResult => result !== null);
  return {
    concern: projected.filter((result) => result.status === "gap_observed").length,
    observed: projected.filter((result) => result.status === "observed").length,
    projected: projected.length,
    review: projected.filter((result) => result.status === "review_signal").length,
    total,
    unresolved: projected.filter((result) => ["not_confirmed", "not_testable", "insufficient_evidence"].includes(result.status)).length
  };
}

export function projectAdminEvidenceMatrix(input: {
  checklistRows: GdprEprivacyCoverageChecklistItem[];
  cmpVendorName: string | null;
  generatedAt?: string;
  sourceProjectionVersion: string | null;
}): AdminEvidenceMatrix {
  const byId = new Map(input.checklistRows.map((row) => [row.id, row]));
  const transparency = projectResults(TRANSPARENCY_ROWS, byId);
  const transport = projectResults(TRANSPORT_ROWS, byId);
  const runtime = projectResults(RUNTIME_ROWS, byId);
  return {
    version: ADMIN_EVIDENCE_MATRIX_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    policyEvidence: projectPolicyEvidenceDiagnostic(input.checklistRows, byId),
    sourceProjectionVersion: input.sourceProjectionVersion,
    privacyConsent: {
      ...projectResults(PRIVACY_CONSENT_ROWS, byId),
      cmpVendorName: input.cmpVendorName
    },
    transparency: { aggregate: aggregate(transparency, 10), results: transparency },
    transport: { aggregate: aggregate(transport, 5), results: transport },
    runtime: { aggregate: aggregate(runtime, 5), results: runtime }
  };
}

function isResult(value: unknown): value is AdminEvidenceResult | null {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.descriptor === "string" && record.descriptor.length <= 220 &&
    typeof record.status === "string" && VALID_STATUSES.has(record.status as AdminEvidenceStatus);
}

function hasResultKeys(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return keys.every((key) => isResult(record[key]));
}

function isAggregate(value: unknown, total: number): value is AdminEvidenceAggregate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.total === total && ["concern", "observed", "projected", "review", "unresolved"].every((key) =>
    typeof record[key] === "number" && Number.isInteger(record[key]) && (record[key] as number) >= 0 && (record[key] as number) <= total
  );
}

function isBoundedNullableString(value: unknown) {
  return value === null || (typeof value === "string" && value.length <= 160);
}

function isPolicyEvidenceDiagnostic(value: unknown): value is AdminPolicyEvidenceDiagnostic | null | undefined {
  if (value === null || value === undefined) return true;
  const diagnostic = record(value);
  const topicResults = record(diagnostic?.topicResults);
  return Boolean(
    diagnostic &&
    typeof diagnostic.stage === "string" &&
    VALID_POLICY_EVIDENCE_STAGES.has(diagnostic.stage as AdminPolicyEvidenceStage) &&
    isBoundedNullableString(diagnostic.detectedLanguage) &&
    isBoundedNullableString(diagnostic.extractionFailureReason) &&
    isBoundedNullableString(diagnostic.extractionStatus) &&
    isBoundedNullableString(diagnostic.projectionStatus) &&
    (diagnostic.gdprTransparencyLanguageSupported === null || typeof diagnostic.gdprTransparencyLanguageSupported === "boolean") &&
    topicResults &&
    ["ambiguous", "disclosureObserved", "extractionIncomplete", "notEvaluated", "notLocatedAutomatically"].every((key) =>
      typeof topicResults[key] === "number" && Number.isInteger(topicResults[key]) && (topicResults[key] as number) >= 0 && (topicResults[key] as number) <= 10
    )
  );
}

export function parseAdminEvidenceMatrix(value: unknown): AdminEvidenceMatrix | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const matrix = value as Record<string, unknown>;
  if (matrix.version !== ADMIN_EVIDENCE_MATRIX_VERSION || typeof matrix.generatedAt !== "string" || matrix.generatedAt.length > 64) return null;
  if (matrix.sourceProjectionVersion !== null && typeof matrix.sourceProjectionVersion !== "string") return null;
  if (!isPolicyEvidenceDiagnostic(matrix.policyEvidence)) return null;
  const privacyConsent = matrix.privacyConsent as Record<string, unknown> | null;
  const transparency = matrix.transparency as Record<string, unknown> | null;
  const transport = matrix.transport as Record<string, unknown> | null;
  const runtime = matrix.runtime as Record<string, unknown> | null;
  if (!hasResultKeys(privacyConsent, Object.keys(PRIVACY_CONSENT_ROWS)) ||
      !hasResultKeys(transparency?.results, Object.keys(TRANSPARENCY_ROWS)) ||
      !hasResultKeys(transport?.results, Object.keys(TRANSPORT_ROWS)) ||
      !hasResultKeys(runtime?.results, Object.keys(RUNTIME_ROWS))) return null;
  if (!isAggregate(transparency?.aggregate, 10) || !isAggregate(transport?.aggregate, 5) || !isAggregate(runtime?.aggregate, 5)) return null;
  if (privacyConsent?.cmpVendorName !== null && (typeof privacyConsent?.cmpVendorName !== "string" || privacyConsent.cmpVendorName.length > 160)) return null;
  return value as AdminEvidenceMatrix;
}
