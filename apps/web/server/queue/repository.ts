import { query, queryOne } from "@website-signal-risk-scanner/db";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";

const SCANNER_WORKER_TYPE = "scanner";

export type ScannerHeartbeatEventRow = {
  created_at?: string | null;
  metadata_json?: unknown;
};

export type WorkerHeartbeatRow = {
  host: string | null;
  last_heartbeat_at: string | null;
  worker_type: string;
};

export async function loadScannerHeartbeatSources() {
  const [eventResult, heartbeatResult] = await Promise.allSettled([
    queryOne<ScannerHeartbeatEventRow>(
      `select created_at, metadata_json
         from scan_events
        where scan_id is null
          and event_type = $1
        order by created_at desc
        limit 1`,
      [SCAN_EVENT_TYPES.scannerHeartbeat],
      { readOnly: true }
    ),
    query<WorkerHeartbeatRow>(
      `select worker_type, last_heartbeat_at, host
         from worker_heartbeats
        where worker_type = $1`,
      [SCANNER_WORKER_TYPE],
      { readOnly: true }
    )
  ]);

  return {
    eventErrorMessage:
      eventResult.status === "rejected"
        ? eventResult.reason instanceof Error
          ? eventResult.reason.message
          : "Unknown database error."
        : null,
    eventRow: eventResult.status === "fulfilled" ? eventResult.value : null,
    heartbeatErrorMessage:
      heartbeatResult.status === "rejected"
        ? heartbeatResult.reason instanceof Error
          ? heartbeatResult.reason.message
          : "Unknown database error."
        : null,
    heartbeatRows: heartbeatResult.status === "fulfilled" ? heartbeatResult.value.rows : []
  };
}
