import { Worker } from "bullmq";
import { VALIDATION_COLLECT_JOB, VALIDATION_RANK_JOB, VALIDATION_VERDICT_JOB, QUEUE_NAMES } from "@website-signal-risk-scanner/shared";
import { getWorkerEnv } from "../env";
import { getValidationRedisConnection } from "../queue/connection";
import { runValidationCollectJob, runValidationRankJob, runValidationVerdictJob } from "./pipeline";

export function createValidationWorkers() {
  const { WORKER_CONCURRENCY: concurrency } = getWorkerEnv();

  const collectWorker = new Worker<{ validationRunId: string }>(
    QUEUE_NAMES.validationCollect,
    async (job) => {
      if (job.name !== VALIDATION_COLLECT_JOB) {
        throw new Error(`Unsupported validation collect job name: ${job.name}`);
      }

      await runValidationCollectJob(job.data.validationRunId);
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
        throw new Error(`Unsupported validation rank job name: ${job.name}`);
      }

      await runValidationRankJob(job.data.validationRunId);
    },
    {
      connection: getValidationRedisConnection(),
      concurrency
    }
  );

  const verdictWorker = new Worker<{ validationRunId: string }>(
    QUEUE_NAMES.validationVerdict,
    async (job) => {
      if (job.name !== VALIDATION_VERDICT_JOB) {
        throw new Error(`Unsupported validation verdict job name: ${job.name}`);
      }

      await runValidationVerdictJob(job.data.validationRunId);
    },
    {
      connection: getValidationRedisConnection(),
      concurrency: 1
    }
  );

  return [collectWorker, rankWorker, verdictWorker];
}
