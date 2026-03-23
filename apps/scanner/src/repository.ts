import { createAdminClient } from "@website-signal-risk-scanner/db";

export type ClaimableScan = {
  createdAt: string;
  id: string;
  scanType: "preview" | "full" | "scheduled";
};

type ClaimableScanRow = {
  created_at: string;
  id: string;
  scan_type: "preview" | "full" | "scheduled";
};

export async function claimNextQueuedScan(): Promise<ClaimableScan | null> {
  const supabase = createAdminClient();
  const { data: queuedScan, error: loadError } = await supabase
    .from("scans")
    .select("id, scan_type, created_at")
    .eq("status", "queued")
    .in("scan_type", ["preview", "full", "scheduled"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Failed to load queued scan: ${loadError.message}`);
  }

  if (!queuedScan) {
    return null;
  }

  const { data: claimedScan, error: claimError } = await supabase
    .from("scans")
    .update({
      error_message: null,
      started_at: new Date().toISOString(),
      status: "running"
    })
    .eq("id", (queuedScan as ClaimableScanRow).id)
    .eq("status", "queued")
    .select("id, scan_type, created_at")
    .maybeSingle();

  if (claimError) {
    throw new Error(`Failed to claim queued scan ${(queuedScan as ClaimableScanRow).id}: ${claimError.message}`);
  }

  if (!claimedScan) {
    return null;
  }

  return {
    createdAt: (claimedScan as ClaimableScanRow).created_at,
    id: (claimedScan as ClaimableScanRow).id,
    scanType: (claimedScan as ClaimableScanRow).scan_type
  };
}
