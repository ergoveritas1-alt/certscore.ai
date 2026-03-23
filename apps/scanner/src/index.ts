import { SCAN_EVENT_TYPES, VALIDATION_RANK_JOB } from "@website-signal-risk-scanner/shared";
import { runFullScanJob } from "@website-signal-risk-scanner/scan-core";
import { hostname as getHostname } from "node:os";
import { getScannerEnv } from "./env";
import { recordScannerHeartbeat } from "./heartbeat";
import { claimNextQueuedScan } from "./repository";
import { reconcileStaleClaimedScans } from "./reconcile-claimed-scans";
import {
  ensureValidationRunForCompletedManualScan,
  getValidationPipelineState,
  insertValidationScanEvent,
  updateValidationRun
} from "../../worker/src/validation/repository";
import { createValidationRankQueue } from "../../validation-worker/src/queue/queues";

const HEARTBEAT_INTERVAL_MS = 30_000;

async function processClaimedScan(scanId: string, scanType: "preview" | "full" | "scheduled") {
  await runFullScanJob(scanId);

  if (scanType !== "full") {
    return;
  }

  if ((await getValidationPipelineState()) !== "running") {
    return;
  }

  const validationRunId = await ensureValidationRunForCompletedManualScan({
    scanId
  });

  if (!validationRunId) {
    return;
  }

  await updateValidationRun(validationRunId, {
    error_message: null,
    status: "queued"
  });

  try {
    await createValidationRankQueue().add(
      VALIDATION_RANK_JOB,
      { validationRunId },
      {
        attempts: 2,
        jobId: `${validationRunId}--rank`
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown validation rank queue handoff error";
    await updateValidationRun(validationRunId, {
      completed_at: new Date().toISOString(),
      error_message: message,
      status: "failed"
    });
    await insertValidationScanEvent({
      eventType: SCAN_EVENT_TYPES.validationRunFailed,
      message: "Validation rank queue handoff failed for completed manual scan.",
      metadata: {
        error: message,
        validationRunId
      },
      scanId
    });
    throw error;
  }
}

async function runScannerLoop(slot: number, pollIntervalMs: number) {
  while (true) {
    try {
      const claimedScan = await claimNextQueuedScan();
      if (!claimedScan) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        continue;
      }

      console.info("[scanner] claimed scan", {
        scanId: claimedScan.id,
        scanType: claimedScan.scanType,
        slot
      });

      await processClaimedScan(claimedScan.id, claimedScan.scanType);

      console.info("[scanner] completed scan", {
        scanId: claimedScan.id,
        scanType: claimedScan.scanType,
        slot
      });
    } catch (error) {
      console.error("[scanner] scan loop iteration failed", {
        error: error instanceof Error ? error.message : String(error),
        slot
      });
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }
}

async function bootstrapScanner() {
  const env = getScannerEnv();
  const startedAt = new Date();
  const host = getHostname();

  const reconciliation = await reconcileStaleClaimedScans({
    staleThresholdMs: env.SCANNER_STALE_SCAN_THRESHOLD_MS
  });

  if (reconciliation.repairedScans.length > 0) {
    console.info("[scanner] reconciled stale scans", reconciliation);
  }

  console.info("[scanner] started", {
    concurrency: env.WORKER_CONCURRENCY,
    crawlerName: env.SCANNER_CRAWLER_NAME,
    crawlerPublicUrl: env.SCANNER_CRAWLER_PUBLIC_URL,
    playwrightBrowsersPath: env.PLAYWRIGHT_BROWSERS_PATH ?? "default cache",
    pollIntervalMs: env.SCANNER_POLL_INTERVAL_MS
  });

  void recordScannerHeartbeat({
    host,
    startedAt
  }).catch((error) => {
    console.error("[scanner] failed to record startup heartbeat", {
      error: error instanceof Error ? error.message : String(error)
    });
  });

  const interval = setInterval(() => {
    void recordScannerHeartbeat({
      host
    }).catch((error) => {
      console.error("[scanner] failed to record heartbeat", {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }, HEARTBEAT_INTERVAL_MS);

  interval.unref();

  await Promise.all(
    Array.from({ length: env.WORKER_CONCURRENCY }, (_, index) => runScannerLoop(index + 1, env.SCANNER_POLL_INTERVAL_MS))
  );
}

void bootstrapScanner().catch((error) => {
  console.error("[scanner] failed", error);
  process.exitCode = 1;
});
