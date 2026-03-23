import { createAdminClient } from "@website-signal-risk-scanner/db";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";

export async function recordWorkerHeartbeat(input: {
  heartbeatAt?: Date;
  host?: string;
  startedAt?: Date;
  workerType: string;
}) {
  const supabase = createAdminClient();
  const heartbeatAt = (input.heartbeatAt ?? new Date()).toISOString();
  const { error: heartbeatError } = await supabase.from("worker_heartbeats").upsert(
    {
      worker_type: input.workerType,
      last_heartbeat_at: heartbeatAt,
      started_at: input.startedAt?.toISOString() ?? null,
      host: input.host ?? null
    },
    { onConflict: "worker_type" }
  );

  const { error: eventError } = await supabase.from("scan_events").insert({
    scan_id: null,
    domain_id: null,
    organization_id: null,
    event_type: SCAN_EVENT_TYPES.fullWorkerHeartbeat,
    message: "Full-scan worker heartbeat recorded.",
    metadata_json: {
      heartbeatAt,
      host: input.host ?? null,
      startedAt: input.startedAt?.toISOString() ?? null,
      workerType: input.workerType
    }
  });

  if (heartbeatError && eventError) {
    throw new Error(
      `Failed to record ${input.workerType} worker heartbeat: ${heartbeatError.message}; legacy event fallback also failed: ${eventError.message}`
    );
  }

  if (heartbeatError) {
    console.warn("[worker] worker_heartbeats write failed; retained legacy heartbeat event", {
      error: heartbeatError.message,
      workerType: input.workerType
    });
    return;
  }

  if (eventError) {
    console.warn("[worker] failed to append legacy heartbeat event", {
      error: eventError.message,
      workerType: input.workerType
    });
  }
}
