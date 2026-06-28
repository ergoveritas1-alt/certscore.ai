import "server-only";

import { query, queryOne } from "@website-signal-risk-scanner/db";
import type { ValidationRunMode } from "@website-signal-risk-scanner/shared";
import { enqueueValidationCollectJob, getValidationQueueAvailability } from "../queue/validation-queue";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown database error.";
}

export async function ensureValidationRunForManualScan(input: {
  domainId: string;
  hostname: string;
  normalizedUrl: string;
  organizationId: string | null;
  scanId: string;
  submittedByUserId: string | null;
  triggerMode?: ValidationRunMode;
}) {
  const availability = getValidationQueueAvailability();
  if (!availability.enabled) {
    return null;
  }

  let settings: { pipeline_enabled: boolean } | null;
  try {
    settings = await queryOne<{ pipeline_enabled: boolean }>(
      `
        select pipeline_enabled
        from validation_settings
        where singleton_key = 'default'
      `,
      [],
      { readOnly: true }
    );
  } catch (error) {
    throw new Error(`Failed to load validation pipeline state: ${getErrorMessage(error)}`);
  }

  if (process.env.VALIDATION_PIPELINE_ENABLED === "0" || !settings?.pipeline_enabled) {
    return null;
  }

  let existingRun: { id: string } | null;
  try {
    existingRun = await queryOne<{ id: string }>(
      `
        select id
        from validation_runs
        where scan_id = $1
        order by created_at desc
        limit 1
      `,
      [input.scanId],
      { readOnly: true }
    );
  } catch (error) {
    throw new Error(`Failed to check validation run for manual scan ${input.scanId}: ${getErrorMessage(error)}`);
  }

  if (existingRun) {
    return existingRun.id;
  }

  let previousRun: { tranco_rank: number | null; rank_band: string | null } | null;
  try {
    previousRun = await queryOne<{ tranco_rank: number | null; rank_band: string | null }>(
      `
        select tranco_rank, rank_band
        from validation_runs
        where domain_id = $1
        order by created_at desc
        limit 1
      `,
      [input.domainId],
      { readOnly: true }
    );
  } catch (error) {
    throw new Error(`Failed to load previous validation run for manual scan ${input.scanId}: ${getErrorMessage(error)}`);
  }

  const insertBase = {
    domain_id: input.domainId,
    hostname: input.hostname,
    normalized_url: input.normalizedUrl,
    rank_band: previousRun?.rank_band ?? null,
    scan_id: input.scanId,
    tranco_rank: previousRun?.tranco_rank ?? null,
    trigger_mode: input.triggerMode ?? "manual",
    triggered_by_user_id: input.submittedByUserId
  };

  let run: { id: string } | null = null;
  let runError: { message?: string } | null = null;

  try {
    run = await queryOne<{ id: string }>(
      `
        insert into validation_runs (
          domain_id,
          hostname,
          normalized_url,
          rank_band,
          scan_id,
          tranco_rank,
          trigger_mode,
          triggered_by_user_id,
          status
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, 'waiting_for_scan')
        returning id
      `,
      [
        insertBase.domain_id,
        insertBase.hostname,
        insertBase.normalized_url,
        insertBase.rank_band,
        insertBase.scan_id,
        insertBase.tranco_rank,
        insertBase.trigger_mode,
        insertBase.triggered_by_user_id
      ]
    );
  } catch (error) {
    runError = { message: getErrorMessage(error) };
  }

  const statusConstraintRejectedWaitingForScan =
    !run &&
    typeof runError?.message === "string" &&
    runError.message.includes("validation_runs_status_check");

  if (statusConstraintRejectedWaitingForScan) {
    try {
      run = await queryOne<{ id: string }>(
        `
          insert into validation_runs (
            domain_id,
            hostname,
            normalized_url,
            rank_band,
            scan_id,
            tranco_rank,
            trigger_mode,
            triggered_by_user_id,
            status
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, 'queued')
          returning id
        `,
        [
          insertBase.domain_id,
          insertBase.hostname,
          insertBase.normalized_url,
          insertBase.rank_band,
          insertBase.scan_id,
          insertBase.tranco_rank,
          insertBase.trigger_mode,
          insertBase.triggered_by_user_id
        ]
      );
      runError = null;
    } catch (error) {
      runError = { message: getErrorMessage(error) };
    }
  }

  if (runError || !run) {
    throw new Error(`Failed to create validation run for manual scan ${input.scanId}: ${runError?.message ?? "Unknown error"}`);
  }

  await query(
    `
      insert into validation_audit_events (actor_user_id, event_type, metadata_json)
      values ($1, $2, $3)
    `,
    [
      input.submittedByUserId,
      "validation.manual_run_queued",
      {
        domainId: input.domainId,
        hostname: input.hostname,
        reason: input.triggerMode === "automatic" ? "scheduled_scan_created" : "manual_scan_created",
        scanId: input.scanId,
        validationRunId: run.id
      }
    ]
  );

  try {
    await enqueueValidationCollectJob(run.id);
  } catch (error) {
    console.error("[validation] failed to enqueue collect job for scan validation run", {
      error: getErrorMessage(error),
      scanId: input.scanId,
      validationRunId: run.id
    });
  }

  return run.id;
}
