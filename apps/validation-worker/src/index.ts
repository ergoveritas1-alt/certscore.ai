import { QUEUE_NAMES } from "@website-signal-risk-scanner/shared";
import { hostname as getHostname } from "node:os";
import { createBrowserCleanupScheduler } from "./browser-cleanup";
import { getConfiguredValidationRedisUrl, getWorkerEnv } from "./env";
import { createValidationWorkers } from "./validation/workers";
import { recordValidationWorkerHeartbeat } from "./validation/repository";

const HEARTBEAT_INTERVAL_MS = 30_000;

function bootstrapValidationWorker() {
  const env = getWorkerEnv();
  const redisUrl = getConfiguredValidationRedisUrl();

  if (!redisUrl) {
    throw new Error("Validation Redis is not configured. Set VALIDATION_REDIS_URL or REDIS_URL.");
  }

  const startedAt = new Date();
  const host = getHostname();
  const workers = createValidationWorkers();
  const browserCleanup =
    env.WORKER_BROWSER_REAPER_ENABLED
      ? createBrowserCleanupScheduler({
          intervalMs: env.WORKER_BROWSER_REAPER_INTERVAL_MINUTES * 60 * 1000,
          logger: console,
          staleAgeMs: env.WORKER_BROWSER_REAPER_STALE_MINUTES * 60 * 1000
        })
      : null;

  workers.forEach((worker) => {
    worker.on("completed", (job) => {
      console.info("[validation-worker] job completed", {
        jobId: job.id,
        jobName: job.name,
        validationRunId: "validationRunId" in job.data ? job.data.validationRunId : null
      });
      void browserCleanup?.schedule("job_completed");
    });

    worker.on("failed", (job, error) => {
      console.error("[validation-worker] job failed", {
        error: error.message,
        jobId: job?.id ?? null,
        jobName: job?.name ?? null,
        validationRunId: job && "validationRunId" in job.data ? job.data.validationRunId : null
      });
      void browserCleanup?.schedule("job_failed");
    });
  });

  console.info("[validation-worker] started", {
    concurrency: env.WORKER_CONCURRENCY,
    jobs: [
      QUEUE_NAMES.validationCollect,
      QUEUE_NAMES.nanoDocRetrieval,
      QUEUE_NAMES.nanoSignalEnrichment,
      QUEUE_NAMES.validationRank,
      ...(env.LLM_ENRICHMENT_ENABLED ? [QUEUE_NAMES.validationVerdict] : [])
    ],
    llmEnrichmentEnabled: env.LLM_ENRICHMENT_ENABLED,
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

  void browserCleanup?.runNow("worker_startup");

  const interval = setInterval(() => {
    void recordValidationWorkerHeartbeat({
      host
    }).catch((error) => {
      console.error("[validation-worker] failed to record heartbeat", {
        error: error instanceof Error ? error.message : String(error)
      });
    });
    void browserCleanup?.schedule("heartbeat");
  }, HEARTBEAT_INTERVAL_MS);

  interval.unref();
}

bootstrapValidationWorker();
