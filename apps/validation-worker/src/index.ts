import { QUEUE_NAMES } from "@website-signal-risk-scanner/shared";
import { hostname as getHostname } from "node:os";
import { getConfiguredValidationRedisUrl, getWorkerEnv } from "./env";
import { createValidationWorkers } from "./validation/workers";
import { recordValidationWorkerHeartbeat } from "./validation/repository";

const HEARTBEAT_INTERVAL_MS = 30_000;

function bootstrapValidationWorker() {
  const env = getWorkerEnv();
  const redisUrl = getConfiguredValidationRedisUrl();

  if (!redisUrl) {
    throw new Error("Validation Redis is not configured.");
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

  console.info("[validation-worker] started", {
    concurrency: env.WORKER_CONCURRENCY,
    jobs: [QUEUE_NAMES.validationCollect, QUEUE_NAMES.nanoDocRetrieval, QUEUE_NAMES.nanoSignalEnrichment, QUEUE_NAMES.validationRank, QUEUE_NAMES.validationVerdict],
    redisHost: new URL(redisUrl).host
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
