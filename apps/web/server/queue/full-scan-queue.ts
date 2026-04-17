import { createAdminClient } from "@website-signal-risk-scanner/db";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";

const SCANNER_WORKER_TYPE = "scanner";
const LEGACY_FULL_SCAN_WORKER_TYPE = "full_scan";
const SCANNER_HEARTBEAT_WINDOW_MS = 90_000;

type ScannerServiceHeartbeatSnapshot = {
  errorMessage: string | null;
  host: string | null;
  lastHeartbeatAt: string | null;
};

type WorkerHeartbeatRow = {
  host: string | null;
  last_heartbeat_at: string | null;
  worker_type: string;
};

export async function enqueueFullScanJob(_scanId: string) {
  return;
}

export function getFullScanQueueAvailabilityFromHeartbeat(lastHeartbeatAt: string | null, nowMs = Date.now()) {
  const heartbeatAgeMs = lastHeartbeatAt ? nowMs - new Date(lastHeartbeatAt).getTime() : null;
  const workerHealthy = typeof heartbeatAgeMs === "number" && Number.isFinite(heartbeatAgeMs) && heartbeatAgeMs <= SCANNER_HEARTBEAT_WINDOW_MS;

  if (!workerHealthy) {
    return {
      enabled: false as const,
      reason: "Scanning is unavailable because no healthy scanner service heartbeat was detected. Ensure the scanner service is running, or run `pnpm dev:scanner` locally."
    };
  }

  return {
    enabled: true as const,
    reason: null as string | null
  };
}

function getNewestHeartbeat(...heartbeatCandidates: Array<string | null>) {
  let newestHeartbeat: string | null = null;
  let newestHeartbeatMs = Number.NEGATIVE_INFINITY;

  for (const candidate of heartbeatCandidates) {
    if (!candidate) {
      continue;
    }

    const candidateMs = new Date(candidate).getTime();
    if (!Number.isFinite(candidateMs) || candidateMs <= newestHeartbeatMs) {
      continue;
    }

    newestHeartbeat = candidate;
    newestHeartbeatMs = candidateMs;
  }

  return newestHeartbeat;
}

function getHeartbeatTimestamp(value: string | null) {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function getLegacyHeartbeatHost(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const host = (metadata as { host?: unknown }).host;
  return typeof host === "string" && host.trim().length > 0 ? host : null;
}

export function resolveScannerServiceHeartbeatSnapshot(input: {
  heartbeatErrorMessage?: string | null;
  eventErrorMessage?: string | null;
  eventHeartbeatAt: string | null;
  eventHost: string | null;
  tableHeartbeatAt: string | null;
  tableHost: string | null;
}): ScannerServiceHeartbeatSnapshot {
  const tableHeartbeatMs = getHeartbeatTimestamp(input.tableHeartbeatAt);
  const eventHeartbeatMs = getHeartbeatTimestamp(input.eventHeartbeatAt);
  const lastHeartbeatAt = getNewestHeartbeat(input.eventHeartbeatAt, input.tableHeartbeatAt);
  const host =
    eventHeartbeatMs >= tableHeartbeatMs
      ? input.eventHost
      : tableHeartbeatMs > Number.NEGATIVE_INFINITY
        ? input.tableHost
        : input.eventHost;

  if (lastHeartbeatAt) {
    return {
      errorMessage: null,
      host,
      lastHeartbeatAt
    };
  }

  if (input.heartbeatErrorMessage && input.eventErrorMessage) {
    return {
      errorMessage: `Scanner health check failed: ${input.eventErrorMessage}; table fallback also failed: ${input.heartbeatErrorMessage}`,
      host: null,
      lastHeartbeatAt: null
    };
  }

  return {
    errorMessage: null,
    host: null,
    lastHeartbeatAt: null
  };
}

export async function getLastScannerServiceHeartbeat(
  db = createAdminClient()
): Promise<ScannerServiceHeartbeatSnapshot> {
  const { data: eventRow, error: eventError } = await db
    .from("scan_events")
    .select("created_at, metadata_json")
    .is("scan_id", null)
    .in("event_type", [SCAN_EVENT_TYPES.scannerHeartbeat, SCAN_EVENT_TYPES.fullWorkerHeartbeat])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const eventHeartbeatAt =
    eventRow && typeof (eventRow as { created_at?: unknown }).created_at === "string"
      ? String((eventRow as { created_at: string }).created_at)
      : null;
  const eventHost = getLegacyHeartbeatHost((eventRow as { metadata_json?: unknown } | null)?.metadata_json);

  if (eventHeartbeatAt) {
    return resolveFullScanWorkerHeartbeatSnapshot({
      heartbeatErrorMessage: null,
      eventErrorMessage: eventError?.message ?? null,
      eventHeartbeatAt,
      eventHost,
      tableHeartbeatAt: null,
      tableHost: null
    });
  }

  const { data: heartbeatRows, error: heartbeatError } = await db
    .from("worker_heartbeats")
    .select("worker_type, last_heartbeat_at, host")
    .in("worker_type", [SCANNER_WORKER_TYPE, LEGACY_FULL_SCAN_WORKER_TYPE]);

  const newestHeartbeatRow = [...(((heartbeatRows as WorkerHeartbeatRow[] | null) ?? []))]
    .filter((row) => typeof row.last_heartbeat_at === "string")
    .sort((left, right) => getHeartbeatTimestamp(right.last_heartbeat_at) - getHeartbeatTimestamp(left.last_heartbeat_at))[0];
  const tableHeartbeatAt = newestHeartbeatRow?.last_heartbeat_at ?? null;
  const tableHost = newestHeartbeatRow?.host ?? null;

  return resolveScannerServiceHeartbeatSnapshot({
    heartbeatErrorMessage: heartbeatError?.message ?? null,
    eventErrorMessage: eventError?.message ?? null,
    eventHeartbeatAt,
    eventHost,
    tableHeartbeatAt,
    tableHost
  });
}

/** @deprecated Use getLastScannerServiceHeartbeat instead. */
export async function getLastFullScanWorkerHeartbeat(
  db = createAdminClient()
): Promise<ScannerServiceHeartbeatSnapshot> {
  return getLastScannerServiceHeartbeat(db);
}

/** @deprecated Use resolveScannerServiceHeartbeatSnapshot instead. */
export function resolveFullScanWorkerHeartbeatSnapshot(input: {
  heartbeatErrorMessage?: string | null;
  eventErrorMessage?: string | null;
  eventHeartbeatAt: string | null;
  eventHost: string | null;
  tableHeartbeatAt: string | null;
  tableHost: string | null;
}): ScannerServiceHeartbeatSnapshot {
  return resolveScannerServiceHeartbeatSnapshot(input);
}

export async function getFullScanQueueAvailability() {
  const heartbeat = await getLastScannerServiceHeartbeat();

  if (heartbeat.errorMessage) {
    return {
      enabled: false as const,
      reason: heartbeat.errorMessage
    };
  }

  return getFullScanQueueAvailabilityFromHeartbeat(heartbeat.lastHeartbeatAt);
}
