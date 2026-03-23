import { createAdminClient } from "@website-signal-risk-scanner/db";
import { Queue, type ConnectionOptions } from "bullmq";
import { FULL_SCAN_JOB, QUEUE_NAMES, SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import { getConfiguredRedisUrl, getWebServerEnv } from "../../lib/env";

const FULL_SCAN_WORKER_TYPE = "full_scan";
const FULL_SCAN_WORKER_HEARTBEAT_WINDOW_MS = 90_000;

let connection: ConnectionOptions | null = null;
let fullScanQueue: Queue<{ scanId: string }> | null = null;

function createRedisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: username.length > 0 ? username : undefined,
    password: password.length > 0 ? password : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: url.protocol === "rediss:" ? {} : undefined
  };
}

function getRedisConnection() {
  if (connection) {
    return connection;
  }

  const env = getWebServerEnv();
  const redisUrl = env.REDIS_URL;

  if (!redisUrl) {
    throw new Error("REDIS_URL is not configured.");
  }

  connection = createRedisConnection(redisUrl);
  return connection;
}

function getFullScanQueue() {
  if (fullScanQueue) {
    return fullScanQueue;
  }

  fullScanQueue = new Queue<{ scanId: string }>(QUEUE_NAMES.fullScan, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 100
    }
  });

  return fullScanQueue;
}

export async function enqueueFullScanJob(scanId: string) {
  await getFullScanQueue().add(
    FULL_SCAN_JOB,
    { scanId },
    {
      attempts: 3
    }
  );
}

export function getFullScanQueueAvailabilityFromHeartbeat(lastHeartbeatAt: string | null, nowMs = Date.now()) {
  const heartbeatAgeMs = lastHeartbeatAt ? nowMs - new Date(lastHeartbeatAt).getTime() : null;
  const workerHealthy = typeof heartbeatAgeMs === "number" && Number.isFinite(heartbeatAgeMs) && heartbeatAgeMs <= FULL_SCAN_WORKER_HEARTBEAT_WINDOW_MS;

  if (!workerHealthy) {
    return {
      enabled: false as const,
      reason:
        "Full scan queueing is unavailable because no healthy full-scan worker heartbeat was detected. Ensure the `certscore-worker` service is running in production, or run `pnpm dev:certscore:worker` locally."
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

export async function getFullScanQueueAvailability() {
  const redisUrl = getConfiguredRedisUrl();

  if (!redisUrl) {
    return {
      enabled: false as const,
      reason: "Queueing is unavailable until REDIS_URL is configured."
    };
  }

  const supabase = createAdminClient();
  const { data: heartbeatRow, error: heartbeatError } = await supabase
    .from("worker_heartbeats")
    .select("last_heartbeat_at")
    .eq("worker_type", FULL_SCAN_WORKER_TYPE)
    .maybeSingle();

  const tableHeartbeatAt =
    heartbeatRow && typeof (heartbeatRow as { last_heartbeat_at?: unknown }).last_heartbeat_at === "string"
      ? String((heartbeatRow as { last_heartbeat_at: string }).last_heartbeat_at)
      : null;

  const { data, error } = await supabase
    .from("scan_events")
    .select("created_at")
    .is("scan_id", null)
    .eq("event_type", SCAN_EVENT_TYPES.fullWorkerHeartbeat)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      enabled: false as const,
      reason: `Full scan worker health check failed: ${(heartbeatError ?? error).message}`
    };
  }

  const legacyHeartbeatAt =
    data && typeof (data as { created_at?: unknown }).created_at === "string"
      ? String((data as { created_at: string }).created_at)
      : null;
  const lastHeartbeatAt = getNewestHeartbeat(tableHeartbeatAt, legacyHeartbeatAt);

  if (!lastHeartbeatAt && heartbeatError) {
    return {
      enabled: false as const,
      reason: `Full scan worker health check failed: ${heartbeatError.message}`
    };
  }

  return getFullScanQueueAvailabilityFromHeartbeat(lastHeartbeatAt);
}
