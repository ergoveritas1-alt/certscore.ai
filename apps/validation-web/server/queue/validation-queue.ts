"use server";

import { Queue, type ConnectionOptions } from "bullmq";
import { NANO_DOC_RETRIEVAL_JOB, QUEUE_NAMES, VALIDATION_COLLECT_JOB } from "@website-signal-risk-scanner/shared";
import { getWebServerEnv } from "../../lib/env";

let connection: ConnectionOptions | null = null;
let collectQueue: Queue<{ validationRunId: string }> | null = null;
let nanoDocQueue: Queue<{ pollCount?: number; scanId: string }> | null = null;
let nanoSignalQueue: Queue<{ pollCount?: number; scanId: string }> | null = null;

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

function getValidationRedisConnection() {
  if (connection) {
    return connection;
  }

  const env = getWebServerEnv();
  const redisUrl = env.VALIDATION_REDIS_URL;

  if (!redisUrl) {
    throw new Error("VALIDATION_REDIS_URL is not configured.");
  }

  connection = createRedisConnection(redisUrl);
  return connection;
}

function getValidationCollectQueue() {
  if (collectQueue) {
    return collectQueue;
  }

  collectQueue = new Queue<{ validationRunId: string }>(QUEUE_NAMES.validationCollect, {
    connection: getValidationRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 100
    }
  });

  return collectQueue;
}

function getNanoSignalQueue() {
  if (nanoSignalQueue) {
    return nanoSignalQueue;
  }

  nanoSignalQueue = new Queue<{ pollCount?: number; scanId: string }>(QUEUE_NAMES.nanoSignalEnrichment, {
    connection: getValidationRedisConnection(),
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
    connection: getValidationRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 100
    }
  });

  return nanoDocQueue;
}

export async function enqueueValidationCollectJob(validationRunId: string) {
  await getValidationCollectQueue().add(
    VALIDATION_COLLECT_JOB,
    { validationRunId },
    {
      attempts: 2
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
