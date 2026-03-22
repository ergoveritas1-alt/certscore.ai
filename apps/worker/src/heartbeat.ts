import { createAdminClient } from "@website-signal-risk-scanner/db";

export async function recordWorkerHeartbeat(input: {
  heartbeatAt?: Date;
  host?: string;
  startedAt?: Date;
  workerType: string;
}) {
  const supabase = createAdminClient();
  const heartbeatAt = (input.heartbeatAt ?? new Date()).toISOString();
  const startedAt = input.startedAt?.toISOString();
  const payload = startedAt
    ? {
        host: input.host ?? null,
        last_heartbeat_at: heartbeatAt,
        started_at: startedAt,
        worker_type: input.workerType
      }
    : {
        host: input.host ?? null,
        last_heartbeat_at: heartbeatAt,
        worker_type: input.workerType
      };
  const { error } = await supabase.from("worker_heartbeats").upsert(payload, {
    onConflict: "worker_type"
  });

  if (error) {
    throw new Error(`Failed to record ${input.workerType} worker heartbeat: ${error.message}`);
  }
}
