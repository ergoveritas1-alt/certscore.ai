import { Queue } from "bullmq";
import { QUEUE_NAMES } from "@website-signal-risk-scanner/shared";
import { getValidationRedisConnection } from "./connection";

export function createNanoSignalEnrichmentQueue() {
  return new Queue<{ pollCount?: number; scanId: string }>(QUEUE_NAMES.nanoSignalEnrichment, {
    connection: getValidationRedisConnection()
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
