import { hostname as getHostname } from "node:os";
import { createBrowserCleanupScheduler } from "./browser-cleanup";
import { getWorkerEnv } from "./env";
import { startValidationDispatcher } from "./validation/dispatcher";
import { recordValidationWorkerHeartbeat } from "./validation/repository";

const HEARTBEAT_INTERVAL_MS = 30_000;

function bootstrapValidationWorker() {
  const env = getWorkerEnv();
  const startedAt = new Date();
  const host = getHostname();
  const browserCleanup =
    env.WORKER_BROWSER_REAPER_ENABLED
      ? createBrowserCleanupScheduler({
          intervalMs: env.WORKER_BROWSER_REAPER_INTERVAL_MINUTES * 60 * 1000,
          logger: console,
          staleAgeMs: env.WORKER_BROWSER_REAPER_STALE_MINUTES * 60 * 1000
        })
      : null;

  console.info("[validation-worker] started", {
    buildGitRef: process.env.BUILD_GIT_REF ?? null,
    buildGitSha: process.env.BUILD_GIT_SHA ?? null,
    buildImageTag: process.env.BUILD_IMAGE_TAG ?? null,
    buildRuntimeTarget: process.env.BUILD_RUNTIME_TARGET ?? null,
    concurrency: env.WORKER_CONCURRENCY,
    stages: [
      "validation_collect",
      "validation_rank",
      ...(env.LLM_ENRICHMENT_ENABLED ? ["validation_verdict"] : [])
    ],
    llmEnrichmentEnabled: env.LLM_ENRICHMENT_ENABLED
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
  void startValidationDispatcher({
    browserCleanup,
    concurrency: env.WORKER_CONCURRENCY
  }).catch((error) => {
    console.error("[validation-worker] dispatcher fatal error", {
      error: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  });

  const interval = setInterval(() => {
    void recordValidationWorkerHeartbeat({
      host
    })
      .then(() => {
        console.info("[validation-worker] heartbeat", {
          host
        });
      })
      .catch((error) => {
        console.error("[validation-worker] failed to record heartbeat", {
          error: error instanceof Error ? error.message : String(error)
        });
      });
    void browserCleanup?.schedule("heartbeat");
  }, HEARTBEAT_INTERVAL_MS);

  interval.unref();
}

bootstrapValidationWorker();
