import { setTimeout as sleep } from "node:timers/promises";
import { VALIDATION_COLLECT_JOB } from "@website-signal-risk-scanner/shared";
import { getWorkerEnv } from "../env";
import { createValidationCollectQueue } from "../queue/queues";
import { buildNextDueAt } from "./repository";
import {
  createValidationRun,
  ensureValidationSettings,
  getActiveValidationRunCount,
  getEligibleTargetForAutomaticRun,
  getValidationPipelineState,
  insertValidationAuditEvent,
  markValidationTargetRunQueued,
  setValidationScheduleState
} from "./repository";
import { syncTrancoTargetsIfDue } from "./tranco";

async function failValidationQueueHandoff(input: {
  hostname: string;
  message: string;
  trancoRank: number | null;
  validationRunId: string;
}) {
  const { updateValidationRun, updateValidationTargetAfterRun, insertValidationAuditEvent } = await import("./repository");

  await updateValidationRun(input.validationRunId, {
    completed_at: new Date().toISOString(),
    error_message: input.message,
    status: "failed"
  });
  await updateValidationTargetAfterRun({
    errorMessage: input.message,
    hostname: input.hostname,
    lastStatus: "failed",
    trancoRank: input.trancoRank
  });
  await insertValidationAuditEvent({
    eventType: "validation.run_scheduled",
    metadata: {
      error: input.message,
      hostname: input.hostname,
      triggerMode: "automatic",
      validationRunId: input.validationRunId
    }
  });
}

export async function runValidationSchedulerTick(now = new Date()) {
  const pipelineState = await getValidationPipelineState();
  const settings = await ensureValidationSettings();
  if (pipelineState !== "running" || settings.runMode !== "automatic") {
    return {
      pipelineState,
      queuedRunId: null,
      skipped: true
    };
  }

  if ((settings.nextDueAt && new Date(settings.nextDueAt).getTime() > now.getTime()) || (await getActiveValidationRunCount()) > 0) {
    return {
      pipelineState,
      queuedRunId: null,
      skipped: true
    };
  }

  await syncTrancoTargetsIfDue(now);

  const target = await getEligibleTargetForAutomaticRun(now);
  const nextDueAt = buildNextDueAt(settings.automaticIntervalMinutes, now);
  await setValidationScheduleState({
    lastScheduledAt: now,
    nextDueAt
  });

  if (!target) {
    return {
      pipelineState,
      queuedRunId: null,
      skipped: true
    };
  }

  const validationRunId = await createValidationRun({
    hostname: target.hostname,
    normalizedUrl: target.normalizedUrl,
    targetId: target.id,
    trancoRank: target.trancoRank,
    triggerMode: "automatic"
  });
  await markValidationTargetRunQueued(target.hostname);

  try {
    await createValidationCollectQueue().add(
      VALIDATION_COLLECT_JOB,
      { validationRunId },
      {
        attempts: 2,
        jobId: `${validationRunId}--collect`
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown validation queue handoff error";
    await failValidationQueueHandoff({
      hostname: target.hostname,
      message: `Validation collect queue handoff failed: ${message}`,
      trancoRank: target.trancoRank,
      validationRunId
    });
    throw error;
  }

  await insertValidationAuditEvent({
    eventType: "validation.run_scheduled",
    metadata: {
      hostname: target.hostname,
      nextDueAt: nextDueAt.toISOString(),
      triggerMode: "automatic",
      validationRunId
    }
  });

  return {
    pipelineState,
    queuedRunId: validationRunId,
    skipped: false
  };
}

export async function runValidationSchedulerLoop() {
  const env = getWorkerEnv();
  while (true) {
    await runValidationSchedulerTick().catch((error) => {
      console.error("[validation-scheduler] tick failed", {
        error: error instanceof Error ? error.message : "Unknown validation scheduler error"
      });
    });

    await sleep(env.VALIDATION_SCHEDULER_POLL_MINUTES * 60_000);
  }
}
