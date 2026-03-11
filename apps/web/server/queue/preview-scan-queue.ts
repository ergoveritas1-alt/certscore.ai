"use server";

import { Queue, type ConnectionOptions } from "bullmq";
import { PREVIEW_SCAN_JOB, QUEUE_NAMES } from "@website-signal-risk-scanner/shared";
import { getConfiguredRedisUrl, getWebServerEnv } from "../../lib/env";

let connection: ConnectionOptions | null = null;
let previewScanQueue: Queue<{ scanId: string }> | null = null;

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

function getPreviewScanQueue() {
  if (previewScanQueue) {
    return previewScanQueue;
  }

  previewScanQueue = new Queue<{ scanId: string }>(QUEUE_NAMES.previewScan, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 100
    }
  });

  return previewScanQueue;
}

export async function enqueuePreviewScanJob(scanId: string) {
  await getPreviewScanQueue().add(
    PREVIEW_SCAN_JOB,
    { scanId },
    {
      attempts: 2
    }
  );
}
