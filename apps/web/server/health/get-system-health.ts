import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import { hasS3Env, queryOne } from "@website-signal-risk-scanner/db";
import { isGoogleAuthEnabled } from "../../lib/env";
import { getFullScanQueueAvailability } from "../queue/full-scan-queue";
import { getSupabaseHealth } from "./get-supabase-health";
import { checkStorageBucketExists, getStorageBucketName } from "../storage/s3";

type BucketStatus = {
  exists: boolean;
  name: string;
};

export type SystemHealthStatus = {
  auth: {
    googleEnabled: boolean;
    supabaseConnected: boolean;
  };
  queue: {
    enabled: boolean;
    reason: string | null;
  };
  storage: {
    artifacts: BucketStatus;
  };
  supabase: Awaited<ReturnType<typeof getSupabaseHealth>>;
  worker: {
    lastActivityAt: string | null;
    lastEventType: string | null;
    recentActivity: boolean;
  };
};

function isRecent(value: string | null, windowMs = 30 * 60 * 1000) {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= windowMs;
}

export async function getSystemHealth(): Promise<SystemHealthStatus> {
  const supabase = await getSupabaseHealth();
  const queue = await getFullScanQueueAvailability();
  const googleEnabled = isGoogleAuthEnabled();
  const bucketNames = {
    artifacts: process.env.S3_BUCKET?.trim() || "scan-artifacts"
  };

  if (!supabase.checks.adminEnv) {
    return {
      auth: {
        googleEnabled,
        supabaseConnected: false
      },
      queue,
      storage: {
        artifacts: { name: bucketNames.artifacts, exists: false }
      },
      supabase,
      worker: {
        lastActivityAt: null,
        lastEventType: null,
        recentActivity: false
      }
    };
  }

  const [bucketExists, workerEvent] = await Promise.all([
    hasS3Env() ? checkStorageBucketExists(bucketNames.artifacts) : Promise.resolve(false),
    queryOne<{ created_at: string | null; event_type: string | null }>(
      `
        select event_type, created_at
        from public.scan_events
        where event_type = any($1::text[])
        order by created_at desc
        limit 1
      `,
      [[
        SCAN_EVENT_TYPES.fullStarted,
        SCAN_EVENT_TYPES.fullCompleted,
        SCAN_EVENT_TYPES.signalsPersisted,
        SCAN_EVENT_TYPES.scheduleSweepCompleted
      ]],
      { readOnly: true }
    ).catch(() => null)
  ]);

  const bucketState = {
    artifacts: { name: bucketNames.artifacts, exists: bucketExists }
  };

  const lastActivityAt = workerEvent?.created_at ?? null;
  const lastEventType = workerEvent?.event_type ?? null;

  return {
    auth: {
      googleEnabled,
      supabaseConnected: supabase.ok
    },
    queue,
    storage: bucketState,
    supabase,
    worker: {
      lastActivityAt,
      lastEventType,
      recentActivity: isRecent(lastActivityAt)
    }
  };
}
