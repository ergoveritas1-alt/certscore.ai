"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import { Queue, type ConnectionOptions } from "bullmq";
import { FULL_SCAN_JOB, QUEUE_NAMES } from "@website-signal-risk-scanner/shared";
import { getConfiguredRedisUrl, getWebServerEnv } from "../../lib/env";

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

const FULL_SCAN_WORKER_HEARTBEAT_WINDOW_MS = 90_000;

export function getFullScanQueueAvailabilityFromHeartbeat(lastHeartbeatAt: string | null, nowMs = Date.now()) {
  const heartbeatAgeMs = lastHeartbeatAt ? nowMs - new Date(lastHeartbeatAt).getTime() : null;
  const workerHealthy = typeof heartbeatAgeMs === "number" && Number.isFinite(heartbeatAgeMs) && heartbeatAgeMs <= FULL_SCAN_WORKER_HEARTBEAT_WINDOW_MS;

  if (!workerHealthy) {
    return {
      enabled: false as const,
      reason:
        "Full scan queueing is unavailable because no healthy full-scan worker heartbeat was detected. Start `pnpm dev:certscore:worker`."
    };
  }

  return {
    enabled: true as const,
    reason: null as string | null
  };
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
  const { data, error } = await supabase
    .from("worker_heartbeats")
    .select("last_heartbeat_at")
    .eq("worker_type", "full_scan")
    .maybeSingle();

  if (error) {
    return {
      enabled: false as const,
      reason: `Full scan worker health check failed: ${error.message}`
    };
  }

  const lastHeartbeatAt =
    data && typeof (data as { last_heartbeat_at?: unknown }).last_heartbeat_at === "string"
      ? String((data as { last_heartbeat_at: string }).last_heartbeat_at)
      : null;
  return getFullScanQueueAvailabilityFromHeartbeat(lastHeartbeatAt);
}
