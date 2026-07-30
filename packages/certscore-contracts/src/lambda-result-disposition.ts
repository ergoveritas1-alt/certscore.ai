export const V2_DAG_LAMBDA_RESULT_PURPOSES = [
  "persisted_scan",
  "synthetic_verification",
] as const;

export type V2DagLambdaResultPurpose = (typeof V2_DAG_LAMBDA_RESULT_PURPOSES)[number];

export type V2DagLambdaResultDisposition =
  | {
      kind: "persisted_scan";
      reason: "typed_purpose" | "legacy_uuid";
      scanId: string;
    }
  | {
      kind: "synthetic_verification";
      reason: "typed_purpose" | "legacy_prefix";
      scanId: string;
    }
  | {
      kind: "invalid";
      reason:
        | "invalid_json"
        | "invalid_result_purpose"
        | "missing_scan_id"
        | "persisted_scan_id_not_uuid"
        | "untyped_scan_id_not_uuid";
      scanId: string | null;
    };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_SYNTHETIC_SCAN_ID_PREFIXES = [
  "manual-",
  "postdeploy-",
  "aro-gate-",
  "local-lambda-parity-",
  "regional-vpc-parity-",
  "regional-parity-",
  "regional-parity-retry-",
  "sprnt-diag-",
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function boundedScanId(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, 160)
    : null;
}

export function isPersistedScanId(value: string) {
  return UUID_PATTERN.test(value);
}

export function classifyV2DagLambdaResultDisposition(
  rawMessage: unknown,
): V2DagLambdaResultDisposition {
  let record: Record<string, unknown>;
  try {
    record = asRecord(typeof rawMessage === "string" ? JSON.parse(rawMessage) : rawMessage);
  } catch {
    return { kind: "invalid", reason: "invalid_json", scanId: null };
  }

  const scanId = boundedScanId(record.scanId);
  if (!scanId) {
    return { kind: "invalid", reason: "missing_scan_id", scanId: null };
  }

  if (record.resultPurpose === "synthetic_verification") {
    return { kind: "synthetic_verification", reason: "typed_purpose", scanId };
  }
  if (record.resultPurpose === "persisted_scan") {
    return isPersistedScanId(scanId)
      ? { kind: "persisted_scan", reason: "typed_purpose", scanId }
      : { kind: "invalid", reason: "persisted_scan_id_not_uuid", scanId };
  }
  if (record.resultPurpose !== undefined && record.resultPurpose !== null) {
    return { kind: "invalid", reason: "invalid_result_purpose", scanId };
  }

  if (isPersistedScanId(scanId)) {
    return { kind: "persisted_scan", reason: "legacy_uuid", scanId };
  }
  if (LEGACY_SYNTHETIC_SCAN_ID_PREFIXES.some((prefix) => scanId.startsWith(prefix))) {
    return { kind: "synthetic_verification", reason: "legacy_prefix", scanId };
  }
  return { kind: "invalid", reason: "untyped_scan_id_not_uuid", scanId };
}
