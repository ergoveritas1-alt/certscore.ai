import { QUEUE_NAMES } from "@website-signal-risk-scanner/shared";
import { getWorkerEnv } from "../env";
import { createValidationWorkers } from "./workers";

function bootstrapValidationWorker() {
  const env = getWorkerEnv();
  const redisUrl = env.VALIDATION_REDIS_URL;

  if (!redisUrl) {
    throw new Error("VALIDATION_REDIS_URL is not configured.");
  }

  const workers = createValidationWorkers();

  workers.forEach((worker) => {
    worker.on("completed", (job) => {
      console.info("[validation-worker] job completed", {
        jobId: job.id,
        jobName: job.name
      });
    });

    worker.on("failed", (job, error) => {
      console.error("[validation-worker] job failed", {
        error: error.message,
        jobId: job?.id ?? null,
        jobName: job?.name ?? null
      });
    });
  });

  console.info("[validation-worker] started", {
    jobs: [QUEUE_NAMES.validationCollect, QUEUE_NAMES.validationRank, QUEUE_NAMES.validationVerdict],
    redisHost: new URL(redisUrl).host
  });
}

bootstrapValidationWorker();
