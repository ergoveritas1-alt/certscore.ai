import { createHash } from "node:crypto";
import type { ScanDetailResponse } from "./get-scan-by-id";

export const SCAN_REPORT_PROJECTION_VERSION = "scan-report-projection-v10";
export const REPORT_PROJECTION_READY_WARNING_MS = 15_000;
export const MAX_SCAN_REPORT_PROJECTION_BYTES = 6 * 1024 * 1024;

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

function normalizeProjectionJson(value: unknown) {
  const transported = JSON.stringify(value);
  if (transported === undefined) {
    throw new Error("Scan report projection is not JSON serializable.");
  }
  return canonicalize(JSON.parse(transported) as unknown);
}

function serializeProjection(value: unknown) {
  return JSON.stringify(normalizeProjectionJson(value));
}

export function buildPersistedScanReportProjection(scanRecord: ScanDetailResponse) {
  const snapshot = isRecord(scanRecord.snapshot)
    ? Object.fromEntries(
        Object.entries(scanRecord.snapshot).filter(([key]) =>
          !key.startsWith("report_projection_")
        )
      )
    : null;
  const payload = {
    ...scanRecord,
    snapshot
  } satisfies ScanDetailResponse;
  const normalizedPayload = normalizeProjectionJson(payload) as ScanDetailResponse;
  const serialized = JSON.stringify(normalizedPayload);
  const sizeBytes = Buffer.byteLength(serialized);
  if (sizeBytes > MAX_SCAN_REPORT_PROJECTION_BYTES) {
    throw new Error(
      `Report projection for scan ${scanRecord.scan.id} is ${sizeBytes} bytes; maximum is ${MAX_SCAN_REPORT_PROJECTION_BYTES}.`
    );
  }
  return {
    payload: normalizedPayload,
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
