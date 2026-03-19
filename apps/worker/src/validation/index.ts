import { getWorkerEnv } from "../env";
import { createValidationWorkers } from "./workers";

function bootstrapValidationWorker() {
  const env = getWorkerEnv();
  if (!env.VALIDATION_REDIS_URL) {
    throw new Error("VALIDATION_REDIS_URL is not configured.");
  }

  const workers = createValidationWorkers();
  workers.forEach((worker) => {
    worker.on("completed", (job) => {
      console.info("[validation-worker] job completed", {
        jobId: job.id,
        jobName: job.name,
        validationRunId: "validationRunId" in job.data ? job.data.validationRunId : null
      });
    });

    worker.on("failed", (job, error) => {
      console.error("[validation-worker] job failed", {
        error: error.message,
        jobId: job?.id ?? null,
        jobName: job?.name ?? null,
        validationRunId: job && "validationRunId" in job.data ? job.data.validationRunId : null
      });
    });
  });

  console.info("[validation-worker] worker service started", {
    concurrency: env.WORKER_CONCURRENCY,
    queues: ["validation.collect", "validation.rank", "validation.verdict"]
  });
}

bootstrapValidationWorker();
