import { QUEUE_JOB_NAMES } from "@website-signal-risk-scanner/shared";
import { hostname as getHostname } from "node:os";
import { getWorkerEnv } from "./env";
import { recordWorkerHeartbeat } from "./heartbeat";
import { createQueueWorkers } from "./queue/workers";

const HEARTBEAT_INTERVAL_MS = 30_000;

function bootstrapWorker() {
  const env = getWorkerEnv();
  const redisUrl = env.REDIS_URL;

  if (!redisUrl) {
    throw new Error("REDIS_URL is not configured.");
  }

  const redisHost = new URL(redisUrl).host;
  const host = getHostname();
  const startedAt = new Date();

  const workers = createQueueWorkers();

  workers.forEach((worker) => {
    worker.on("completed", (job) => {
      console.info("[worker] job completed", {
        jobId: job.id,
        jobName: job.name
      });
    });

    worker.on("failed", (job, error) => {
      console.error("[worker] job failed", {
        jobId: job?.id ?? null,
        jobName: job?.name ?? null,
        error: error.message
      });
    });
  });

  console.info("[worker] worker service started", {
    jobs: QUEUE_JOB_NAMES,
    concurrency: env.WORKER_CONCURRENCY,
    redisHost,
    playwrightBrowsersPath: env.PLAYWRIGHT_BROWSERS_PATH ?? "default cache"
  });

  void recordWorkerHeartbeat({
    host,
    startedAt,
    workerType: "full_scan"
  }).catch((error) => {
    console.error("[worker] failed to record startup heartbeat", {
      error: error instanceof Error ? error.message : String(error)
    });
  });

  const interval = setInterval(() => {
    void recordWorkerHeartbeat({
      host,
      workerType: "full_scan"
    }).catch((error) => {
      console.error("[worker] failed to record heartbeat", {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }, HEARTBEAT_INTERVAL_MS);

  interval.unref();
}

bootstrapWorker();
