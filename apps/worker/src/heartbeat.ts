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
  const { error } = await supabase.from("scan_events").insert({
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

  if (error) {
    throw new Error(`Failed to record ${input.workerType} worker heartbeat: ${error.message}`);
  }
}
