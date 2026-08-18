import { createHash } from "node:crypto";
import type { ScanDetailResponse } from "./get-scan-by-id";
import type { PersistedCanonicalReportProjection } from "./persisted-canonical-report-projection";

export const SCAN_REPORT_PROJECTION_VERSION = "scan-report-projection-v18";
export const REPORT_PROJECTION_READY_WARNING_MS = 15_000;
export const MAX_SCAN_REPORT_PROJECTION_BYTES = 6 * 1024 * 1024;

export class ScanReportProjectionTooLargeError extends Error {
  readonly maxBytes: number;
  readonly scanId: string;
  readonly sizeBytes: number;

  constructor(input: { maxBytes: number; scanId: string; sizeBytes: number }) {
    super(
      `Report projection for scan ${input.scanId} is ${input.sizeBytes} bytes; maximum is ${input.maxBytes}.`
    );
    this.name = "ScanReportProjectionTooLargeError";
    this.maxBytes = input.maxBytes;
    this.scanId = input.scanId;
    this.sizeBytes = input.sizeBytes;
  }
}

export type ScanReportProjectionReadiness = {
  report_projection_computed_at?: unknown;
  report_projection_status?: unknown;
  report_projection_version?: unknown;
};

export function isCurrentScanReportProjectionReady(
  projection: ScanReportProjectionReadiness | null | undefined
) {
  return Boolean(
    projection &&
    projection.report_projection_status === "ready" &&
    projection.report_projection_version === SCAN_REPORT_PROJECTION_VERSION &&
    (
      (
        typeof projection.report_projection_computed_at === "string" &&
        projection.report_projection_computed_at.trim().length > 0
      ) ||
      projection.report_projection_computed_at instanceof Date
    )
  );
}

export function completionToReportProjectionMs(
  completedAt: string | null | undefined,
  projectedAtMs = Date.now()
) {
  if (!completedAt) return null;
  const completedAtMs = Date.parse(completedAt);
  return Number.isFinite(completedAtMs)
    ? Math.max(0, projectedAtMs - completedAtMs)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

const RUNTIME_ARTIFACT_CANONICAL_ALIASES = [
  ["hybrid_runtime_evidence", "hybridRuntimeEvidence"],
  ["cookie_write_observations", "cookieWriteObservations"],
  ["policy_disclosure_summary", "policyDisclosureSummary"],
  ["request_purpose_classification_confidence", "requestPurposeClassificationConfidence"]
] as const;

function stripReportProjectionFields(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !key.startsWith("report_projection_"))
  );
}

function equivalentForPersistence(left: unknown, right: unknown) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function canonicalizeRuntimeArtifactAliases(runtimeArtifacts: Record<string, unknown>) {
  const canonical = { ...runtimeArtifacts };
  for (const [canonicalKey, aliasKey] of RUNTIME_ARTIFACT_CANONICAL_ALIASES) {
    if (!(aliasKey in canonical)) continue;
    if (!(canonicalKey in canonical)) {
      canonical[canonicalKey] = canonical[aliasKey];
      delete canonical[aliasKey];
      continue;
    }
    if (equivalentForPersistence(canonical[canonicalKey], canonical[aliasKey])) {
      delete canonical[aliasKey];
    }
  }
  return canonical;
}

function normalizeProjectionJson(value: unknown) {
  const transported = JSON.stringify(sanitizeJsonbValue(value));
  if (transported === undefined) {
    throw new Error("Scan report projection is not JSON serializable.");
  }
  return canonicalize(JSON.parse(transported) as unknown);
}

/**
 * PostgreSQL jsonb rejects U+0000 even when it is validly escaped as `\\u0000`
 * by JSON.stringify. Retained browser evidence can contain this character in
 * copied text or script payloads, so sanitize it at the JSONB boundary while
 * preserving the rest of the evidence unchanged.
 */
export function sanitizeJsonbValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replaceAll("\u0000", "\uFFFD");
  }
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeJsonbValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [sanitizeJsonbValue(key), sanitizeJsonbValue(entry)])
    );
  }
  return value;
}

function serializeProjection(value: unknown) {
  return JSON.stringify(normalizeProjectionJson(value));
}

export function buildPersistedScanReportProjection(
  scanRecord: ScanDetailResponse,
  options: { canonicalReportProjection?: PersistedCanonicalReportProjection } = {},
) {
  const snapshot = isRecord(scanRecord.snapshot)
    ? stripReportProjectionFields(scanRecord.snapshot)
    : null;
  const previousSnapshot = isRecord(scanRecord.previousSnapshot)
    ? stripReportProjectionFields(scanRecord.previousSnapshot)
    : null;
  const runtimeArtifacts = isRecord(scanRecord.runtimeArtifacts)
    ? canonicalizeRuntimeArtifactAliases(scanRecord.runtimeArtifacts)
    : null;
  const payload = {
    ...scanRecord,
    ...(options.canonicalReportProjection
      ? { canonicalReportProjection: options.canonicalReportProjection }
      : {}),
    previousSnapshot,
    runtimeArtifacts,
    snapshot
  } satisfies ScanDetailResponse;
  const normalizedPayload = normalizeProjectionJson(payload) as ScanDetailResponse;
  const serialized = JSON.stringify(normalizedPayload);
  const sizeBytes = Buffer.byteLength(serialized);
  if (sizeBytes > MAX_SCAN_REPORT_PROJECTION_BYTES) {
    throw new ScanReportProjectionTooLargeError({
      maxBytes: MAX_SCAN_REPORT_PROJECTION_BYTES,
      scanId: scanRecord.scan.id,
      sizeBytes,
    });
  }
  return {
    payload: normalizedPayload,
    serialized,
    sha256: createHash("sha256").update(serialized).digest("hex"),
    sizeBytes
  };
}

export function readPersistedScanReportProjection(
  scanRecord: Pick<ScanDetailResponse, "scan" | "snapshot">
): ScanDetailResponse | null {
  if (!isCurrentScanReportProjectionReady(scanRecord.snapshot) || !isRecord(scanRecord.snapshot)) {
    return null;
  }
  const payload = scanRecord.snapshot.report_projection_payload;
  const expectedSha256 = scanRecord.snapshot.report_projection_payload_sha256;
  const expectedSizeBytes = scanRecord.snapshot.report_projection_payload_size_bytes;
  if (
    !isRecord(payload) ||
    typeof expectedSha256 !== "string" ||
    !/^[a-f0-9]{64}$/i.test(expectedSha256) ||
    typeof expectedSizeBytes !== "number" ||
    !Number.isSafeInteger(expectedSizeBytes) ||
    expectedSizeBytes < 1 ||
    expectedSizeBytes > MAX_SCAN_REPORT_PROJECTION_BYTES
  ) {
    return null;
  }
  const serialized = serializeProjection(payload);
  if (
    Buffer.byteLength(serialized) !== expectedSizeBytes ||
    createHash("sha256").update(serialized).digest("hex") !== expectedSha256
  ) {
    return null;
  }
  const projectedScan = isRecord(payload.scan) ? payload.scan : null;
  if (
    projectedScan?.id !== scanRecord.scan.id ||
    projectedScan.status !== "completed"
  ) {
    return null;
  }
  return payload as ScanDetailResponse;
}
