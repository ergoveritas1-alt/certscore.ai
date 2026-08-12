import {
  appendScanWorkflowEvent,
  claimNanoSignalScanLeaseById,
  claimNextNanoSignalScanLease,
  claimNextQueuedNanoSignalScanLease,
  claimNextValidationRunLease,
  getValidationPipelineState,
  releaseNanoSignalScanLease,
  releaseValidationRunLease,
  type NanoSignalScanLease,
  type ValidationRunLease
} from "./repository";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import {
  NANO_SIGNAL_BROAD_RECONCILIATION_SWEEP_MS,
  NANO_SIGNAL_DURABLE_RECOVERY_SWEEP_MS,
  NanoSignalWakeupQueue,
  startNanoSignalWakeupListener
} from "./nano-signal-wakeup";
import {
  processNanoSignalEnrichmentJob,
  processValidationCollectJob,
  processValidationRankJob,
  processValidationVerdictJob
} from "./pipeline";

export const VALIDATION_DISPATCH_IDLE_POLL_MS = 1_000;
const MAX_NANO_SIGNAL_DISPATCH_ATTEMPTS = 3;
const NANO_SIGNAL_DISPATCH_RETRY_BASE_MS = 1_000;
const NANO_SIGNAL_DISPATCH_RETRY_MAX_MS = 30_000;

export function buildNanoSignalDispatchFailureEvent(input: {
  error: unknown;
  pollCount: number;
  recoveryMode: NanoSignalScanLease["recoveryMode"];
}) {
  const attemptCount = Math.max(0, input.pollCount) + 1;
  const error = (input.error instanceof Error ? input.error.message : String(input.error)).slice(0, 500);
  const terminal = attemptCount >= MAX_NANO_SIGNAL_DISPATCH_ATTEMPTS;
  const retryDelayMs = Math.min(
    NANO_SIGNAL_DISPATCH_RETRY_MAX_MS,
    NANO_SIGNAL_DISPATCH_RETRY_BASE_MS * 2 ** Math.max(0, attemptCount - 1)
  );

  if (terminal) {
    return {
      delayMs: retryDelayMs,
      eventType: SCAN_EVENT_TYPES.nanoSignalEnrichmentFailed,
      message: "Nano document signal enrichment failed after bounded dispatcher retries.",
      metadataJson: {
        attemptCount,
        error,
        ...(input.recoveryMode ? { recoveryMode: input.recoveryMode } : {}),
        reason: "dispatcher_error",
        stage: "nano_doc_signals"
      },
      terminal
    } as const;
  }

  const recheckAt = new Date(Date.now() + retryDelayMs);
  return {
    delayMs: retryDelayMs,
    eventType: SCAN_EVENT_TYPES.nanoSignalEnrichmentQueued,
    message: "Nano document signal enrichment retry scheduled after dispatcher failure.",
    metadataJson: {
      error,
      pollCount: attemptCount,
      recheckAfter: recheckAt.toISOString(),
      recheckAfterEpochMs: recheckAt.getTime(),
      recheckDelayMs: retryDelayMs,
      ...(input.recoveryMode ? { recoveryMode: input.recoveryMode } : {}),
      reason: "dispatcher_error",
      stage: "nano_doc_signals"
    },
    terminal
  } as const;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDispatchStage(status: ValidationRunLease["run"]["status"]) {
  switch (status) {
    case "queued":
    case "waiting_for_scan":
    case "collecting":
      return "collect";
    case "ranking":
      return "rank";
    case "validating":
      return "verdict";
    default:
      return null;
  }
}

async function dispatchValidationRun(lease: ValidationRunLease) {
  const stage = getDispatchStage(lease.run.status);
  if (!stage) {
    return;
  }

  if (stage === "collect") {
    await processValidationCollectJob(lease.run.id);
    return;
  }

  if (stage === "rank") {
    await processValidationRankJob(lease.run.id);
    return;
  }

  await processValidationVerdictJob(lease.run.id);
}

async function dispatchNanoSignalScan(lease: NanoSignalScanLease) {
  if (lease.recovered) {
    await appendScanWorkflowEvent({
      eventType: SCAN_EVENT_TYPES.nanoSignalEnrichmentQueued,
      message: "Nano document signal enrichment requested.",
      metadataJson: {
        recoveryMode: lease.recoveryMode ?? "completed_scan_backfill",
        stage: "nano_doc_signals"
      },
      scanId: lease.scanId
    }).catch(() => undefined);
  }

  await processNanoSignalEnrichmentJob({
    pollCount: lease.pollCount,
    recoveryMode: lease.recoveryMode,
    scanId: lease.scanId
  });
}

type NanoDispatchCoordinator = {
  nextBroadReconciliationAt: number;
  nextDurableRecoveryAt: number;
  wakeups: NanoSignalWakeupQueue;
};

async function claimAvailableNanoSignalLease(coordinator: NanoDispatchCoordinator) {
  for (;;) {
    const notifiedScanId = coordinator.wakeups.take();
    if (!notifiedScanId) {
      break;
    }

    const notifiedLease = await claimNanoSignalScanLeaseById(notifiedScanId);
    if (notifiedLease) {
      return notifiedLease;
    }
  }

  const now = Date.now();
  if (now >= coordinator.nextDurableRecoveryAt) {
    coordinator.nextDurableRecoveryAt = now + NANO_SIGNAL_DURABLE_RECOVERY_SWEEP_MS;
    const queuedLease = await claimNextQueuedNanoSignalScanLease();
    if (queuedLease) {
      return queuedLease;
    }
  }

  if (now >= coordinator.nextBroadReconciliationAt) {
    coordinator.nextBroadReconciliationAt = now + NANO_SIGNAL_BROAD_RECONCILIATION_SWEEP_MS;
    return claimNextNanoSignalScanLease();
  }

  return null;
}

export async function startValidationDispatcher(options: {
  browserCleanup?: { schedule(reason: string): Promise<unknown> | unknown } | null;
  concurrency: number;
}) {
  const slots = Math.max(1, options.concurrency);
  const wakeups = new NanoSignalWakeupQueue();
  const coordinator: NanoDispatchCoordinator = {
    nextBroadReconciliationAt: 0,
    nextDurableRecoveryAt: 0,
    wakeups
  };
  startNanoSignalWakeupListener({
    onWakeup: (payload) => wakeups.enqueue(payload)
  });

  await Promise.all(
    Array.from({ length: slots }, (_, index) => runDispatchLoop(index + 1, options.browserCleanup ?? null, coordinator))
  );
}

async function runDispatchLoop(
  slot: number,
  browserCleanup: { schedule(reason: string): Promise<unknown> | unknown } | null,
  coordinator: NanoDispatchCoordinator
) {
  for (;;) {
    try {
      const { state } = await getValidationPipelineState();
      if (state !== "running") {
        await sleep(VALIDATION_DISPATCH_IDLE_POLL_MS);
        continue;
      }

      const scanLease = await claimAvailableNanoSignalLease(coordinator);
      if (scanLease) {
        try {
          console.info("[validation-worker] nano signal scan claimed", {
            pollCount: scanLease.pollCount,
            recovered: scanLease.recovered,
            recoveryMode: scanLease.recoveryMode,
            scanId: scanLease.scanId,
            slot,
          });
          await dispatchNanoSignalScan(scanLease);
          console.info("[validation-worker] nano signal scan processed", {
            scanId: scanLease.scanId,
            slot
          });
          void browserCleanup?.schedule("scan_processed");
        } catch (error) {
          console.error("[validation-worker] nano signal scan failed", {
            error: error instanceof Error ? error.message : String(error),
            scanId: scanLease.scanId,
            slot
          });
          const failureEvent = buildNanoSignalDispatchFailureEvent({
            error,
            pollCount: scanLease.pollCount,
            recoveryMode: scanLease.recoveryMode
          });
          await appendScanWorkflowEvent({
            eventType: failureEvent.eventType,
            message: failureEvent.message,
            metadataJson: failureEvent.metadataJson,
            scanId: scanLease.scanId
          }).catch((eventError) => {
            console.error("[validation-worker] nano signal failure event persistence failed", {
              error: eventError instanceof Error ? eventError.message : String(eventError),
              scanId: scanLease.scanId,
              slot
            });
          });
          await sleep(failureEvent.delayMs);
          void browserCleanup?.schedule("scan_failed");
        } finally {
          await releaseNanoSignalScanLease(scanLease);
        }

        continue;
      }

      const lease = await claimNextValidationRunLease();
      if (lease) {
        try {
          console.info("[validation-worker] run claimed", {
            slot,
            status: lease.run.status,
            validationRunId: lease.run.id
          });
          await dispatchValidationRun(lease);
          console.info("[validation-worker] run processed", {
            slot,
            status: lease.run.status,
            validationRunId: lease.run.id
          });
          void browserCleanup?.schedule("run_processed");
        } catch (error) {
          console.error("[validation-worker] run failed", {
            error: error instanceof Error ? error.message : String(error),
            slot,
            status: lease.run.status,
            validationRunId: lease.run.id
          });
          void browserCleanup?.schedule("run_failed");
        } finally {
          await releaseValidationRunLease(lease);
        }

        continue;
      }

      await coordinator.wakeups.wait(VALIDATION_DISPATCH_IDLE_POLL_MS);
    } catch (error) {
      console.error("[validation-worker] dispatch loop error", {
        error: error instanceof Error ? error.message : String(error),
        slot
      });
      await coordinator.wakeups.wait(VALIDATION_DISPATCH_IDLE_POLL_MS);
    }
  }
}
