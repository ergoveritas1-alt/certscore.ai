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

export function parseAdminEvidenceMatrix(value: unknown): AdminEvidenceMatrix | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const matrix = value as Record<string, unknown>;
  if (matrix.version !== ADMIN_EVIDENCE_MATRIX_VERSION || typeof matrix.generatedAt !== "string" || matrix.generatedAt.length > 64) return null;
  if (matrix.sourceProjectionVersion !== null && typeof matrix.sourceProjectionVersion !== "string") return null;
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
