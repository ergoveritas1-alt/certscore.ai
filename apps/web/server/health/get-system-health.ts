import { hasS3Env, queryOne } from "@website-signal-risk-scanner/db";
import { isGoogleAuthEnabled } from "../../lib/env";
import { getFullScanQueueAvailability } from "../queue/full-scan-queue";
import { getDatabaseHealth } from "./get-database-health";
import { getLambdaScannerFleetHealth } from "./lambda-scanner-health";
import { checkStorageBucketExists, getStorageBucketName } from "../storage/s3";

type BucketStatus = {
  exists: boolean;
  name: string;
};

export type SystemHealthStatus = {
  auth: {
    authSchemaReady: boolean;
    databaseConnected: boolean;
    googleEnabled: boolean;
    missingTables: string[];
  };
  queue: {
    enabled: boolean;
    reason: string | null;
  };
  scanners: Awaited<ReturnType<typeof getLambdaScannerFleetHealth>>;
  storage: {
    artifacts: BucketStatus;
  };
  database: Awaited<ReturnType<typeof getDatabaseHealth>>;
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
  const database = await getDatabaseHealth();
  const queue = await getFullScanQueueAvailability();
  const scanners = await getLambdaScannerFleetHealth();
  const googleEnabled = isGoogleAuthEnabled();
  const bucketNames = {
    artifacts: process.env.S3_BUCKET?.trim() || "scan-artifacts"
  };

  if (!database.checks.env) {
    return {
      auth: {
        authSchemaReady: false,
        databaseConnected: false,
        googleEnabled,
        missingTables: [...database.requiredTables.missing]
      },
      queue,
      scanners,
      storage: {
        artifacts: { name: bucketNames.artifacts, exists: false }
      },
      database,
      worker: {
        lastActivityAt: null,
        lastEventType: null,
        recentActivity: false
      }
    };
  }

  const [bucketExists, workerEvent] = await Promise.all([
    hasS3Env() ? checkStorageBucketExists(bucketNames.artifacts) : Promise.resolve(false),
    queryOne<{ activity_at: string | null; status: string | null }>(
      `
        select status, coalesce(completed_at, started_at, created_at) as activity_at
        from public.scans
        where status = any($1::text[])
        order by coalesce(completed_at, started_at, created_at) desc
        limit 1
      `,
      [["completed", "failed", "running"]],
      { readOnly: true }
    ).catch(() => null)
  ]);

  const bucketState = {
    artifacts: { name: bucketNames.artifacts, exists: bucketExists }
  };

  const lastActivityAt = workerEvent?.activity_at ?? null;
  const lastEventType = workerEvent?.status ? `full_scan.${workerEvent.status}` : null;

  return {
    auth: {
      authSchemaReady: database.checks.authSchema,
      databaseConnected: database.ok,
      googleEnabled,
      missingTables: [...database.requiredTables.missing]
    },
    queue,
    scanners,
    storage: bucketState,
    database,
    worker: {
      lastActivityAt,
      lastEventType,
      recentActivity: isRecent(lastActivityAt)
    }
  };
}
