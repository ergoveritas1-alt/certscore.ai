import { hostname as getHostname } from "node:os";
import { createBrowserCleanupScheduler } from "./browser-cleanup";
import { getWorkerEnv } from "./env";
import { startValidationDispatcher } from "./validation/dispatcher";
import {
  startLocalV2DagLambdaResultPoller,
  startPersistedCompletedResultFinalizationRecovery,
} from "./validation/local-v2-dag-lambda-results";
import { startLocalV2DagLambdaDispatchPublisher } from "./validation/local-v2-dag-lambda-dispatch";
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
  startLocalV2DagLambdaDispatchPublisher({
    enabled: env.CERTSCORE_V2_DAG_LAMBDA_DISPATCH_PUBLISH_ENABLED,
    pollMs: env.CERTSCORE_V2_DAG_LAMBDA_DISPATCH_PUBLISH_SECONDS * 1000,
    queueUrls: {
      "eu-central-1": env.CERTSCORE_V2_DAG_LAMBDA_EU_DE_DISPATCH_QUEUE_URL,
      "eu-west-1": env.CERTSCORE_V2_DAG_LAMBDA_EU_IE_DISPATCH_QUEUE_URL,
      "us-west-1": env.CERTSCORE_V2_DAG_LAMBDA_US_WEST_DISPATCH_QUEUE_URL,
    },
  });
  startLocalV2DagLambdaResultPoller({
    enabled: env.CERTSCORE_V2_DAG_LAMBDA_RESULT_POLL_ENABLED,
    pollMs: env.CERTSCORE_V2_DAG_LAMBDA_RESULT_POLL_SECONDS * 1000,
    queueUrl: env.CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL,
    queueUrls: [
      env.CERTSCORE_V2_DAG_LAMBDA_EU_DE_RESULT_QUEUE_URL,
      env.CERTSCORE_V2_DAG_LAMBDA_EU_IE_RESULT_QUEUE_URL,
      env.CERTSCORE_V2_DAG_LAMBDA_US_WEST_RESULT_QUEUE_URL
    ],
    webBaseUrl: env.CERTSCORE_WEB_BASE_URL,
    targetEnvironment: env.CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV
  });
  startPersistedCompletedResultFinalizationRecovery({
    webBaseUrl: env.CERTSCORE_WEB_BASE_URL,
  });
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
