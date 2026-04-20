import {
  claimNextNanoSignalScanLease,
  claimNextValidationRunLease,
  getValidationPipelineState,
  releaseNanoSignalScanLease,
  releaseValidationRunLease,
  type NanoSignalScanLease,
  type ValidationRunLease
} from "./repository";
import {
  processNanoSignalEnrichmentJob,
  processValidationCollectJob,
  processValidationRankJob,
  processValidationVerdictJob
} from "./pipeline";

const IDLE_POLL_MS = 3_000;

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
  await processNanoSignalEnrichmentJob({
    pollCount: 0,
    scanId: lease.scanId
  });
}

export async function startValidationDispatcher(options: {
  browserCleanup?: { schedule(reason: string): Promise<unknown> | unknown } | null;
  concurrency: number;
}) {
  const slots = Math.max(1, options.concurrency);

  await Promise.all(
    Array.from({ length: slots }, (_, index) => runDispatchLoop(index + 1, options.browserCleanup ?? null))
  );
}

async function runDispatchLoop(slot: number, browserCleanup: { schedule(reason: string): Promise<unknown> | unknown } | null) {
  for (;;) {
    try {
      const { state } = await getValidationPipelineState();
      if (state !== "running") {
        await sleep(IDLE_POLL_MS);
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

      const scanLease = await claimNextNanoSignalScanLease();
      if (!scanLease) {
        await sleep(IDLE_POLL_MS);
        continue;
      }

      try {
        console.info("[validation-worker] nano signal scan claimed", {
          scanId: scanLease.scanId,
          slot
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
        void browserCleanup?.schedule("scan_failed");
      } finally {
        await releaseNanoSignalScanLease(scanLease);
      }
    } catch (error) {
      console.error("[validation-worker] dispatch loop error", {
        error: error instanceof Error ? error.message : String(error),
        slot
      });
      await sleep(IDLE_POLL_MS);
    }
  }
}
