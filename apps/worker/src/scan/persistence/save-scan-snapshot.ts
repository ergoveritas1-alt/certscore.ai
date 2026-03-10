import { createAdminClient } from "@website-signal-risk-scanner/db";
import type { DerivedSnapshotInsert } from "../signals/derive-scan-signals";

export async function saveScanSnapshot(snapshot: DerivedSnapshotInsert) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("scan_snapshots").upsert(snapshot, {
    onConflict: "scan_id"
  });

  if (error) {
    throw new Error(`Failed to persist scan snapshot: ${error.message}`);
  }
}
