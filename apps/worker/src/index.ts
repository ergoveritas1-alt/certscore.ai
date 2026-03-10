import { QUEUE_JOB_NAMES } from "@website-signal-risk-scanner/shared";
import { getWorkerEnv } from "./env";
import { createQueueWorkers } from "./queue/workers";

function bootstrapWorker() {
  const env = getWorkerEnv();
  const redisUrl = env.REDIS_URL ?? env.UPSTASH_REDIS_URL;

  if (!redisUrl) {
    throw new Error("REDIS_URL is not configured.");
  }

  const redisHost = new URL(redisUrl).host;

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
}

bootstrapWorker();
