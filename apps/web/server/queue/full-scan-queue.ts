import { loadScannerHeartbeatSources, type WorkerHeartbeatRow } from "./repository";

const SCANNER_HEARTBEAT_WINDOW_MS = 90_000;

type ScannerServiceHeartbeatSnapshot = {
  errorMessage: string | null;
  host: string | null;
  lastHeartbeatAt: string | null;
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
      reason:
        "Scanning is unavailable because no healthy scanner service heartbeat was detected. Ensure the scanner service is running, or run `pnpm dev:scanner:local` locally."
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

export async function getLastScannerServiceHeartbeat(): Promise<ScannerServiceHeartbeatSnapshot> {
  const { eventErrorMessage, eventRow, heartbeatErrorMessage, heartbeatRows } = await loadScannerHeartbeatSources();
  const eventHeartbeatAt =
    eventRow && typeof eventRow.created_at === "string" ? String(eventRow.created_at) : null;
  const eventHost = getLegacyHeartbeatHost(eventRow?.metadata_json);

  if (eventHeartbeatAt) {
    return resolveScannerServiceHeartbeatSnapshot({
      heartbeatErrorMessage: null,
      eventErrorMessage,
      eventHeartbeatAt,
      eventHost,
      tableHeartbeatAt: null,
      tableHost: null
    });
  }

  const newestHeartbeatRow = [...(heartbeatRows as WorkerHeartbeatRow[])]
    .filter((row) => typeof row.last_heartbeat_at === "string")
    .sort((left, right) => getHeartbeatTimestamp(right.last_heartbeat_at) - getHeartbeatTimestamp(left.last_heartbeat_at))[0];
  const tableHeartbeatAt = newestHeartbeatRow?.last_heartbeat_at ?? null;
  const tableHost = newestHeartbeatRow?.host ?? null;

  return resolveScannerServiceHeartbeatSnapshot({
    heartbeatErrorMessage,
    eventErrorMessage,
    eventHeartbeatAt,
    eventHost,
    tableHeartbeatAt,
    tableHost
  });
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
