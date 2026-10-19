import { REPORT_PUBLICATION_INVARIANTS, boundedPublicationSchemaIssues } from "./report-publication-invariant";

type MaterializationFailureDisposition = {
  code: "publication_invariant_failed" | "contract_validation_failed" | "materialization_failed_transient" | "materialization_not_ready" | "projection_too_large";
  diagnostic: string;
  retryAfterSeconds?: number;
  retryable: boolean;
  details?: {
    version: "report-publication-failure.v1";
    phase: string;
    invariant?: string;
    issues: ReturnType<typeof boundedPublicationSchemaIssues>;
  };
};

const MATERIALIZATION_NOT_READY_RETRY_SECONDS = 1;

function errorChain(error: unknown) {
  const chain: unknown[] = [];
  let current = error;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    chain.push(current);
    current = current instanceof Error
      ? current.cause
      : null;
  }
  return chain;
}

function isSchemaValidationError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  return (
    record.name === "ZodError" ||
    Array.isArray(record.issues)
  );
}

function isProjectionTooLargeError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  return (
    record.name === "ScanReportProjectionTooLargeError" &&
    typeof record.scanId === "string" &&
    typeof record.sizeBytes === "number" &&
    typeof record.maxBytes === "number" &&
    Number.isSafeInteger(record.sizeBytes) &&
    Number.isSafeInteger(record.maxBytes) &&
    record.sizeBytes > record.maxBytes
  );
}

function lifecyclePhase(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const match = /^Score lifecycle ([a-z0-9-]{1,80}) failed(?:[:.]|$)/i.exec(message);
  return match?.[1] ?? null;
}

function projectionNotReadyReason(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  if (record.name !== "CanonicalScanReportProjectionNotReadyError") return null;
  const reason = typeof record.reason === "string" ? record.reason.trim() : "";
  return /^[a-z0-9_:-]{1,120}$/i.test(reason) ? reason : "unspecified";
}

function isStaleProjectionSourceError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  return (error as Record<string, unknown>).name === "StaleScanReportProjectionSourceError";
}

export function classifyScoreMaterializationFailure(error: unknown): MaterializationFailureDisposition {
  const chain = errorChain(error);
  const invariantError = chain.find(value => {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    return candidate.name === "ReportPublicationInvariantError" &&
      REPORT_PUBLICATION_INVARIANTS.some(invariant => invariant === candidate.invariant) &&
      (candidate.phase === "consent_assessment" || candidate.phase === "artifact_verification");
  }) as {invariant:string;phase:string;issues:unknown[]} | undefined;
  if (invariantError) return {
    code: "publication_invariant_failed",
    diagnostic: `publication_invariant_failed:${invariantError.invariant}`,
    retryable: false,
    details: {version:"report-publication-failure.v1",phase:invariantError.phase,invariant:invariantError.invariant,
      issues: boundedPublicationSchemaIssues(Array.isArray(invariantError.issues) ? invariantError.issues : [])},
  };
  if (chain.some(isProjectionTooLargeError)) {
    return {
      code: "projection_too_large",
      diagnostic: "projection_too_large",
      retryable: false,
    };
  }
  const notReadyReason = chain.map(projectionNotReadyReason).find((value) => value !== null);
  if (notReadyReason) {
    return {
      code: "materialization_not_ready",
      diagnostic: `materialization_not_ready:${notReadyReason}`,
      retryAfterSeconds: MATERIALIZATION_NOT_READY_RETRY_SECONDS,
      retryable: true,
    };
  }
  if (chain.some(isStaleProjectionSourceError)) {
    return {
      code: "materialization_not_ready",
      diagnostic: "materialization_not_ready:stale_projection_source",
      retryAfterSeconds: MATERIALIZATION_NOT_READY_RETRY_SECONDS,
      retryable: true,
    };
  }
  const phase = chain.map(lifecyclePhase).find((value) => value !== null);
  const schemaError = chain.find(isSchemaValidationError) as {issues?: {code?:unknown;path?:unknown}[]} | undefined;
  if (schemaError) {
    return {
      code: "contract_validation_failed",
      diagnostic: phase
        ? `contract_validation_failed:${phase}`
        : "contract_validation_failed",
      retryable: false,
      details: {version:"report-publication-failure.v1",phase:phase ?? "schema_validation",
        issues: boundedPublicationSchemaIssues(schemaError.issues ?? [])},
    };
  }
  return {
    code: "materialization_failed_transient",
    diagnostic: phase
      ? `materialization_failed_transient:${phase}`
      : "materialization_failed_transient",
    retryable: true,
  };
}

/** Stored in the existing bounded last_error field; no evidence or raw errors. */
export function serializeScoreMaterializationFailure(disposition: MaterializationFailureDisposition) {
  if (!disposition.details) return disposition.diagnostic;
  const diagnostic = {code:disposition.code,...disposition.details,issues:[...disposition.details.issues]};
  while (JSON.stringify(diagnostic).length > 500 && diagnostic.issues.length) diagnostic.issues.pop();
  return JSON.stringify(diagnostic);
}
