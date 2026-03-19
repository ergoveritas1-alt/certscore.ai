import { getWorkerEnv } from "../env";
import { hostname as getHostname } from "node:os";
import { createValidationWorkers } from "./workers";
import { recordValidationWorkerHeartbeat } from "./repository";

const HEARTBEAT_INTERVAL_MS = 30_000;

function bootstrapValidationWorker() {
  const env = getWorkerEnv();
  if (!env.VALIDATION_REDIS_URL) {
    throw new Error("VALIDATION_REDIS_URL is not configured.");
  }

  const startedAt = new Date();
  const host = getHostname();

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
    queues: ["validation.collect", "validation.rank"]
  });

  void recordValidationWorkerHeartbeat({
    host,
    startedAt
  }).catch((error) => {
    console.error("[validation-worker] failed to record startup heartbeat", {
      error: error instanceof Error ? error.message : String(error)
    });
  });

  const interval = setInterval(() => {
    void recordValidationWorkerHeartbeat({
      host
    }).catch((error) => {
      console.error("[validation-worker] failed to record heartbeat", {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }, HEARTBEAT_INTERVAL_MS);

  interval.unref();
}

bootstrapValidationWorker();
