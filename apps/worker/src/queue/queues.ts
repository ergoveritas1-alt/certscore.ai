import { Queue } from "bullmq";
import { QUEUE_NAMES } from "@website-signal-risk-scanner/shared";
import { getSharedRedisConnection } from "./connection";

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
