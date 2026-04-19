import "server-only";

import { Queue, type ConnectionOptions } from "bullmq";
import { NANO_DOC_RETRIEVAL_JOB, VALIDATION_COLLECT_JOB, QUEUE_NAMES } from "@website-signal-risk-scanner/shared";
import { getConfiguredWebValidationRedisUrl } from "../../lib/env";

let connection: ConnectionOptions | null = null;
let collectQueue: Queue<{ validationRunId: string }> | null = null;
let nanoDocQueue: Queue<{ pollCount?: number; scanId: string }> | null = null;
let nanoSignalQueue: Queue<{ pollCount?: number; scanId: string }> | null = null;
let rankQueue: Queue<{ validationRunId: string }> | null = null;

function createRedisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);

  return {
    enableReadyCheck: false,
    host: url.hostname,
    maxRetriesPerRequest: null,
    password: password.length > 0 ? password : undefined,
    port: Number(url.port || 6379),
    tls: url.protocol === "rediss:" ? {} : undefined,
    username: username.length > 0 ? username : undefined
  };
}

function getRedisConnection() {
  if (connection) {
    return connection;
  }

  const redisUrl = getConfiguredWebValidationRedisUrl();
  if (!redisUrl) {
    throw new Error("Validation Redis is not configured. Set VALIDATION_REDIS_URL.");
  }

  connection = createRedisConnection(redisUrl);
  return connection;
}

function getCollectQueue() {
  if (collectQueue) {
    return collectQueue;
  }

  collectQueue = new Queue<{ validationRunId: string }>(QUEUE_NAMES.validationCollect, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 100
    }
  });

  return collectQueue;
}

function getRankQueue() {
  if (rankQueue) {
    return rankQueue;
  }

  rankQueue = new Queue<{ validationRunId: string }>(QUEUE_NAMES.validationRank, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 100
    }
  });

  return rankQueue;
}

function getNanoSignalQueue() {
  if (nanoSignalQueue) {
    return nanoSignalQueue;
  }

  nanoSignalQueue = new Queue<{ pollCount?: number; scanId: string }>(QUEUE_NAMES.nanoSignalEnrichment, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 100
    }
  });

  return nanoSignalQueue;
}

function getNanoDocQueue() {
  if (nanoDocQueue) {
    return nanoDocQueue;
  }

  nanoDocQueue = new Queue<{ pollCount?: number; scanId: string }>(QUEUE_NAMES.nanoDocRetrieval, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 100
    }
  });

  return nanoDocQueue;
}

export function getValidationQueueAvailability(env: NodeJS.ProcessEnv = process.env) {
  const redisUrl = getConfiguredWebValidationRedisUrl(env);
  if (!redisUrl) {
    return {
      enabled: false,
      reason: "Validation queueing is unavailable until VALIDATION_REDIS_URL is configured."
    } as const;
  }

  try {
    new URL(redisUrl);
  } catch {
    return {
      enabled: false,
      reason: "Validation queueing is unavailable because the configured validation Redis URL is invalid."
    } as const;
  }

  return {
    enabled: true,
    reason: null
  } as const;
}

export async function enqueueValidationCollectJob(validationRunId: string) {
  await getCollectQueue().add(
    VALIDATION_COLLECT_JOB,
    { validationRunId },
    {
      attempts: 2,
      jobId: `${validationRunId}--collect`
    }
  );
}

export async function enqueueNanoSignalEnrichmentJob(scanId: string) {
  await getNanoDocQueue().add(
    NANO_DOC_RETRIEVAL_JOB,
    { pollCount: 0, scanId },
    {
      attempts: 2,
      jobId: `${scanId}--nano-doc-retrieval--initial`
    }
  );
}

export async function getValidationQueueHealth() {
  const [collectCounts, nanoDocCounts, nanoSignalCounts, rankCounts] = await Promise.all([
    getCollectQueue().getJobCounts("waiting", "active", "failed", "delayed", "paused"),
    getNanoDocQueue().getJobCounts("waiting", "active", "failed", "delayed", "paused"),
    getNanoSignalQueue().getJobCounts("waiting", "active", "failed", "delayed", "paused"),
    getRankQueue().getJobCounts("waiting", "active", "failed", "delayed", "paused")
  ]);

  return {
    collect: collectCounts,
    nanoDocRetrieval: nanoDocCounts,
    nanoSignals: nanoSignalCounts,
    rank: rankCounts
  };
}
