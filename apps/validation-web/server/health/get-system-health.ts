import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import { createAdminSupabaseClient } from "../../lib/supabase/admin";
import { getQueueAvailability, isGoogleAuthEnabled } from "../../lib/env";
import { getSupabaseHealth } from "./get-supabase-health";

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
  const queue = getQueueAvailability();
  const googleEnabled = isGoogleAuthEnabled();
  const bucketNames = {
    artifacts: process.env.SUPABASE_STORAGE_BUCKET_ARTIFACTS ?? "scan-artifacts"
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

  const admin = createAdminSupabaseClient();
  const [{ data: buckets, error: bucketError }, { data: workerEvent, error: workerError }] = await Promise.all([
    admin.storage.listBuckets(),
    admin
      .from("scan_events")
      .select("event_type, created_at")
      .in("event_type", [
        SCAN_EVENT_TYPES.fullStarted,
        SCAN_EVENT_TYPES.fullCompleted,
        SCAN_EVENT_TYPES.signalsPersisted,
        SCAN_EVENT_TYPES.scheduleSweepCompleted
      ])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const existingBuckets = new Set((buckets ?? []).map((bucket) => bucket.name));
  const bucketState = {
    artifacts: { name: bucketNames.artifacts, exists: existingBuckets.has(bucketNames.artifacts) }
  };

  const lastActivityAt = workerError ? null : ((workerEvent?.created_at as string | null | undefined) ?? null);
  const lastEventType = workerError ? null : ((workerEvent?.event_type as string | null | undefined) ?? null);

  if (bucketError) {
    bucketState.artifacts.exists = false;
  }

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
