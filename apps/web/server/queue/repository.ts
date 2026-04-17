import { createDatabaseClient } from "@website-signal-risk-scanner/db";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";

const SCANNER_WORKER_TYPE = "scanner";
const LEGACY_FULL_SCAN_WORKER_TYPE = "full_scan";

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
  const db = createDatabaseClient();
  const { data: eventRow, error: eventError } = await db
    .from("scan_events")
    .select("created_at, metadata_json")
    .is("scan_id", null)
    .in("event_type", [SCAN_EVENT_TYPES.scannerHeartbeat, SCAN_EVENT_TYPES.fullWorkerHeartbeat])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: heartbeatRows, error: heartbeatError } = await db
    .from("worker_heartbeats")
    .select("worker_type, last_heartbeat_at, host")
    .in("worker_type", [SCANNER_WORKER_TYPE, LEGACY_FULL_SCAN_WORKER_TYPE]);

  return {
    eventErrorMessage: eventError?.message ?? null,
    eventRow: (eventRow as ScannerHeartbeatEventRow | null) ?? null,
    heartbeatErrorMessage: heartbeatError?.message ?? null,
    heartbeatRows: ((heartbeatRows as WorkerHeartbeatRow[] | null) ?? [])
  };
}
