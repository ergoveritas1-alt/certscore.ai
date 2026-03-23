import { Worker } from "bullmq";
import { runFullScanJob } from "@website-signal-risk-scanner/scan-core";
import { FULL_SCAN_JOB, PREVIEW_SCAN_JOB, QUEUE_NAMES, SCHEDULED_SCAN_JOB, SCAN_EVENT_TYPES, VALIDATION_RANK_JOB } from "@website-signal-risk-scanner/shared";
import { createAdminClient } from "@website-signal-risk-scanner/db";
import { getWorkerEnv } from "../env";
import { enqueueScheduledScans } from "../scheduling/enqueue-scheduled-scans";
import { createValidationRankQueue } from "./queues";
import { getSharedRedisConnection } from "./connection";
import { ensureValidationRunForCompletedManualScan, getValidationPipelineState, insertValidationScanEvent, updateValidationRun } from "../validation/repository";

async function insertSchedulerEvent(eventType: string, message: string, metadata?: Record<string, unknown>) {
  const supabase = createAdminClient();
  await supabase.from("scan_events").insert({
    scan_id: null,
    domain_id: null,
    organization_id: null,
    event_type: eventType,
    message,
    metadata_json: metadata ?? null
  });
}

export function createQueueWorkers() {
  const { WORKER_CONCURRENCY: concurrency } = getWorkerEnv();
  const fullScanWorker = new Worker<{ scanId: string }>(
    QUEUE_NAMES.fullScan,
    async (job) => {
      if (job.name !== FULL_SCAN_JOB) {
        throw new Error(`Unsupported full scan job name: ${job.name}`);
      }

      await runFullScanJob(job.data.scanId);

      if ((await getValidationPipelineState()) !== "running") {
        return;
      }

      const validationRunId = await ensureValidationRunForCompletedManualScan({
        scanId: job.data.scanId
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
          scanId: job.data.scanId
        });
        throw error;
      }
    },
    {
      connection: getSharedRedisConnection(),
      concurrency
    }
  );

  const previewScanWorker = new Worker<{ scanId: string }>(
    QUEUE_NAMES.previewScan,
    async (job) => {
      if (job.name !== PREVIEW_SCAN_JOB) {
        throw new Error(`Unsupported preview scan job name: ${job.name}`);
      }

      await runFullScanJob(job.data.scanId);
    },
    {
      connection: getSharedRedisConnection(),
      concurrency
    }
  );

  const scheduledScanWorker = new Worker<{ trigger?: string }>(
    QUEUE_NAMES.scheduledScan,
    async (job) => {
      if (job.name !== SCHEDULED_SCAN_JOB) {
        throw new Error(`Unsupported scheduled scan job name: ${job.name}`);
      }

      await insertSchedulerEvent(SCAN_EVENT_TYPES.scheduleSweepStarted, "Scheduled scan sweep started.", {
        trigger: job.data.trigger ?? "queue"
      });

      try {
        const result = await enqueueScheduledScans();
        await insertSchedulerEvent(SCAN_EVENT_TYPES.scheduleSweepCompleted, "Scheduled scan sweep completed.", result);
      } catch (error) {
        await insertSchedulerEvent(SCAN_EVENT_TYPES.scheduleSweepFailed, "Scheduled scan sweep failed.", {
          error: error instanceof Error ? error.message : "Unknown schedule sweep error"
        });
        throw error;
      }
    },
    {
      connection: getSharedRedisConnection(),
      concurrency: 1
    }
  );

  return [previewScanWorker, fullScanWorker, scheduledScanWorker];
}
