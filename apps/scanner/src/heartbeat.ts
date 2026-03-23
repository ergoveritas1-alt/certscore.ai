import { createAdminClient } from "@website-signal-risk-scanner/db";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";

export const SCANNER_WORKER_TYPE = "scanner";

export async function recordScannerHeartbeat(input: {
  heartbeatAt?: Date;
  host?: string;
  startedAt?: Date;
}) {
  const supabase = createAdminClient();
  const heartbeatAt = (input.heartbeatAt ?? new Date()).toISOString();
  const { error: heartbeatError } = await supabase.from("worker_heartbeats").upsert(
    {
      worker_type: SCANNER_WORKER_TYPE,
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
    event_type: SCAN_EVENT_TYPES.scannerHeartbeat,
    message: "Scanner service heartbeat recorded.",
    metadata_json: {
      heartbeatAt,
      host: input.host ?? null,
      startedAt: input.startedAt?.toISOString() ?? null,
      workerType: SCANNER_WORKER_TYPE
    }
  });

  if (heartbeatError && eventError) {
    throw new Error(`Failed to record scanner heartbeat: ${heartbeatError.message}; event fallback also failed: ${eventError.message}`);
  }

  if (heartbeatError) {
    console.warn("[scanner] worker_heartbeats write failed; retained event heartbeat", {
      error: heartbeatError.message
    });
  }

  if (eventError) {
    console.warn("[scanner] failed to append scanner heartbeat event", {
      error: eventError.message
    });
  }
}
