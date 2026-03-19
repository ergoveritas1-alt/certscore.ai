import { Queue } from "bullmq";
import { QUEUE_NAMES } from "@website-signal-risk-scanner/shared";
import { getSharedRedisConnection, getValidationRedisConnection } from "./connection";

export function createPreviewScanQueue() {
  return new Queue(QUEUE_NAMES.previewScan, {
    connection: getSharedRedisConnection()
  });
}

export function createFullScanQueue() {
  return new Queue<{ scanId: string }>(QUEUE_NAMES.fullScan, {
    connection: getSharedRedisConnection()
  });
}

export function createScheduledScanQueue() {
  return new Queue(QUEUE_NAMES.scheduledScan, {
    connection: getSharedRedisConnection()
  });
}

export function createValidationCollectQueue() {
  return new Queue<{ validationRunId: string }>(QUEUE_NAMES.validationCollect, {
    connection: getValidationRedisConnection()
  });
}

export function createValidationRankQueue() {
  return new Queue<{ validationRunId: string }>(QUEUE_NAMES.validationRank, {
    connection: getValidationRedisConnection()
  });
}

export function createValidationVerdictQueue() {
  return new Queue<{ validationRunId: string }>(QUEUE_NAMES.validationVerdict, {
    connection: getValidationRedisConnection()
  });
}
