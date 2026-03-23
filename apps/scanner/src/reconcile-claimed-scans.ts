import { createAdminClient } from "@website-signal-risk-scanner/db";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";

type ActiveScanRow = {
  created_at: string;
  domain_id: string | null;
  id: string;
  organization_id: string | null;
  scan_type: "full" | "preview" | "scheduled";
  started_at: string | null;
  status: "running";
};

function getRowAgeMs(createdAt: string, startedAt: string | null, nowMs: number) {
  return nowMs - new Date(startedAt ?? createdAt).getTime();
}

export async function reconcileStaleClaimedScans(input: { now?: Date; staleThresholdMs: number }) {
  const supabase = createAdminClient();
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const repairedScans: string[] = [];

  const { data: scans, error } = await supabase
    .from("scans")
    .select("id, domain_id, organization_id, scan_type, status, created_at, started_at")
    .eq("status", "running")
    .in("scan_type", ["preview", "full", "scheduled"]);

  if (error) {
    throw new Error(`Failed to load running scans for scanner reconciliation: ${error.message}`);
  }

  for (const row of (scans ?? []) as ActiveScanRow[]) {
    const ageMs = getRowAgeMs(row.created_at, row.started_at, nowMs);
    if (ageMs < input.staleThresholdMs) {
      continue;
    }

    const errorMessage = "Marked failed during scanner startup reconciliation after stale claimed running state.";
    const { error: updateError } = await supabase
      .from("scans")
      .update({
        error_message: errorMessage,
        status: "failed"
      })
      .eq("id", row.id)
      .eq("status", "running");

    if (updateError) {
      throw new Error(`Failed to reconcile scan ${row.id}: ${updateError.message}`);
    }

    const eventType = row.scan_type === "preview" ? SCAN_EVENT_TYPES.previewFailed : SCAN_EVENT_TYPES.fullFailed;
    const message = row.scan_type === "preview" ? "Live preview scan failed." : "Structured snapshot scan failed.";
    const { error: eventError } = await supabase.from("scan_events").insert({
      scan_id: row.id,
      domain_id: row.domain_id,
      organization_id: row.organization_id,
      event_type: eventType,
      message,
      metadata_json: {
        error: errorMessage,
        failureCategory: "scanner_stale_claim_reconciliation",
        reconciledAt: nowIso
      }
    });

    if (eventError) {
      throw new Error(`Failed to record reconciliation event for scan ${row.id}: ${eventError.message}`);
    }

    repairedScans.push(row.id);
  }

  return { repairedScans };
}
