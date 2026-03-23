import { createAdminClient } from "@website-signal-risk-scanner/db";
import { Queue, type ConnectionOptions } from "bullmq";
import { QUEUE_NAMES, SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import { getWorkerEnv } from "./env";
import { updateValidationRun, updateValidationTargetAfterRun } from "./validation/repository";

const STALE_SCAN_THRESHOLD_MS = 60 * 60 * 1000;
const STALE_VALIDATION_THRESHOLD_MS = 15 * 60 * 1000;

type ActiveScanRow = {
  created_at: string;
  domain_id: string | null;
  id: string;
  organization_id: string | null;
  scan_type: "full" | "preview" | "scheduled";
  started_at: string | null;
  status: "queued" | "running";
};

type ActiveValidationRunRow = {
  created_at: string;
  hostname: string;
  id: string;
  started_at: string | null;
  status: "waiting_for_scan" | "queued" | "collecting" | "ranking" | "validating";
  tranco_rank: number | null;
};

function createRedisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);

  return {
    enableReadyCheck: false,
    host: url.hostname,
    maxRetriesPerRequest: null,
    password: password.length > 0 ? password : undefined,
    port: Number(url.port || 6379),
    tls: url.protocol === "rediss:" ? {} : undefined,
    username: username.length > 0 ? username : undefined
  };
}

function getRowAgeMs(createdAt: string, startedAt: string | null, nowMs: number) {
  return nowMs - new Date(startedAt ?? createdAt).getTime();
}

export async function reconcileStaleQueueState(now = new Date()) {
  const env = getWorkerEnv();
  const supabase = createAdminClient();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const repairedScans: string[] = [];
  const repairedValidationRuns: string[] = [];

  const scanQueues =
    env.REDIS_URL
      ? {
          full: new Queue<{ scanId: string }>(QUEUE_NAMES.fullScan, {
            connection: createRedisConnection(env.REDIS_URL)
          }),
          preview: new Queue<{ scanId: string }>(QUEUE_NAMES.previewScan, {
            connection: createRedisConnection(env.REDIS_URL)
          })
        }
      : null;

  const validationQueues =
    env.VALIDATION_REDIS_URL
      ? {
          collect: new Queue<{ validationRunId: string }>(QUEUE_NAMES.validationCollect, {
            connection: createRedisConnection(env.VALIDATION_REDIS_URL)
          }),
          rank: new Queue<{ validationRunId: string }>(QUEUE_NAMES.validationRank, {
            connection: createRedisConnection(env.VALIDATION_REDIS_URL)
          })
        }
      : null;

  try {
    const [{ data: scans, error: scansError }, { data: validationRuns, error: runsError }] = await Promise.all([
      supabase
        .from("scans")
        .select("id, domain_id, organization_id, scan_type, status, created_at, started_at")
        .in("status", ["queued", "running"]),
      supabase
        .from("validation_runs")
        .select("id, hostname, status, created_at, started_at, tranco_rank")
        .in("status", ["waiting_for_scan", "queued", "collecting", "ranking", "validating"])
    ]);

    if (scansError) {
      throw new Error(`Failed to load active scans for reconciliation: ${scansError.message}`);
    }
    if (runsError) {
      throw new Error(`Failed to load active validation runs for reconciliation: ${runsError.message}`);
    }

    const fullQueueJobs = scanQueues
      ? await scanQueues.full.getJobs(["waiting", "active", "delayed", "paused", "prioritized"])
      : [];
    const previewQueueJobs = scanQueues
      ? await scanQueues.preview.getJobs(["waiting", "active", "delayed", "paused", "prioritized"])
      : [];
    const collectQueueJobs = validationQueues
      ? await validationQueues.collect.getJobs(["waiting", "active", "delayed", "paused", "prioritized"])
      : [];
    const rankQueueJobs = validationQueues
      ? await validationQueues.rank.getJobs(["waiting", "active", "delayed", "paused", "prioritized"])
      : [];

    const activeFullScanIds = new Set(fullQueueJobs.map((job) => job.data?.scanId).filter((value): value is string => typeof value === "string"));
    const activePreviewScanIds = new Set(
      previewQueueJobs.map((job) => job.data?.scanId).filter((value): value is string => typeof value === "string")
    );
    const activeValidationRunIds = new Set(
      [...collectQueueJobs, ...rankQueueJobs]
        .map((job) => job.data?.validationRunId)
        .filter((value): value is string => typeof value === "string")
    );

    for (const row of (scans ?? []) as ActiveScanRow[]) {
      const ageMs = getRowAgeMs(row.created_at, row.started_at, nowMs);
      if (ageMs < STALE_SCAN_THRESHOLD_MS) {
        continue;
      }

      const stillQueued =
        row.scan_type === "preview" ? activePreviewScanIds.has(row.id) : activeFullScanIds.has(row.id);
      if (stillQueued) {
        continue;
      }

      const errorMessage = "Marked failed during automatic queue reconciliation after stale queued/running state with no active Redis job.";
      const { error: updateError } = await supabase
        .from("scans")
        .update({
          error_message: errorMessage,
          status: "failed"
        })
        .eq("id", row.id)
        .in("status", ["queued", "running"]);

      if (updateError) {
        throw new Error(`Failed to reconcile scan ${row.id}: ${updateError.message}`);
      }

      const eventType = row.scan_type === "preview" ? SCAN_EVENT_TYPES.previewFailed : SCAN_EVENT_TYPES.fullFailed;
      const message = row.scan_type === "preview" ? "Live preview scan failed." : "Structured snapshot scan failed.";
      const { error: eventError } = await supabase.from("scan_events").insert({
        domain_id: row.domain_id,
        event_type: eventType,
        message,
        metadata_json: {
          error: errorMessage,
          failureCategory: "automatic_orphaned_job_reconciliation",
          reconciledAt: nowIso
        },
        organization_id: row.organization_id,
        scan_id: row.id
      });

      if (eventError) {
        throw new Error(`Failed to record reconciliation event for scan ${row.id}: ${eventError.message}`);
      }

      repairedScans.push(row.id);
    }

    for (const row of (validationRuns ?? []) as ActiveValidationRunRow[]) {
      const ageMs = getRowAgeMs(row.created_at, row.started_at, nowMs);
      if (ageMs < STALE_VALIDATION_THRESHOLD_MS) {
        continue;
      }
      if (activeValidationRunIds.has(row.id)) {
        continue;
      }

      const errorMessage = "Marked failed during automatic queue reconciliation after orphaned validation run with no active Redis job.";
      await updateValidationRun(row.id, {
        completed_at: nowIso,
        error_message: errorMessage,
        status: "failed"
      });
      await updateValidationTargetAfterRun({
        errorMessage,
        hostname: row.hostname,
        lastStatus: "failed",
        trancoRank: row.tranco_rank
      });
      repairedValidationRuns.push(row.id);
    }

    return {
      repairedScans,
      repairedValidationRuns
    };
  } finally {
    await Promise.all([
      scanQueues?.full.close(),
      scanQueues?.preview.close(),
      validationQueues?.collect.close(),
      validationQueues?.rank.close()
    ]);
  }
}
