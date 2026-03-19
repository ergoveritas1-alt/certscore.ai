import { Worker } from "bullmq";
import {
  QUEUE_NAMES,
  VALIDATION_COLLECT_JOB,
  VALIDATION_RANK_JOB,
  VALIDATION_VERDICT_JOB
} from "@website-signal-risk-scanner/shared";
import { getWorkerEnv } from "../env";
import { getValidationRedisConnection } from "../queue/connection";
import {
  processValidationCollectJob,
  processValidationRankJob,
  processValidationVerdictJob
} from "./pipeline";

export function createValidationWorkers() {
  const { WORKER_CONCURRENCY: concurrency } = getWorkerEnv();

  const collectWorker = new Worker<{ validationRunId: string }>(
    QUEUE_NAMES.validationCollect,
    async (job) => {
      if (job.name !== VALIDATION_COLLECT_JOB) {
        throw new Error(`Unsupported validation collect job: ${job.name}`);
      }

      await processValidationCollectJob(job.data.validationRunId);
    },
    {
      connection: getValidationRedisConnection(),
      concurrency: 1
    }
  );

  const rankWorker = new Worker<{ validationRunId: string }>(
    QUEUE_NAMES.validationRank,
    async (job) => {
      if (job.name !== VALIDATION_RANK_JOB) {
        throw new Error(`Unsupported validation rank job: ${job.name}`);
      }

      await processValidationRankJob(job.data.validationRunId);
    },
    {
      connection: getValidationRedisConnection(),
      concurrency: Math.max(1, concurrency)
    }
  );

  const verdictWorker = new Worker<{ validationRunId: string }>(
    QUEUE_NAMES.validationVerdict,
    async (job) => {
      if (job.name !== VALIDATION_VERDICT_JOB) {
        throw new Error(`Unsupported validation verdict job: ${job.name}`);
      }

      await processValidationVerdictJob(job.data.validationRunId);
    },
    {
      connection: getValidationRedisConnection(),
      concurrency: 1
    }
  );

  return [collectWorker, rankWorker, verdictWorker];
}
