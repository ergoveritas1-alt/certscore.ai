import { createAdminClient } from "@website-signal-risk-scanner/db";
import type { ScanRuntimeArtifact, ScanSnapshot, ScanTrackerVendor } from "@website-signal-risk-scanner/shared";
import { snakeToCamelRecord } from "../snapshot/case";

type SnapshotBundleLookup = {
  runtimeArtifacts: ScanRuntimeArtifact | null;
  snapshot: ScanSnapshot;
  trackers: ScanTrackerVendor[];
};

function stripMeta(record: Record<string, unknown>) {
  const clone = { ...record };
  delete clone.id;
  delete clone.createdAt;
  delete clone.updatedAt;
  return clone;
}

export async function getSnapshotBundle(scanId: string): Promise<SnapshotBundleLookup | null> {
  const supabase = createAdminClient();
  const [{ data: snapshot, error: snapshotError }, { data: trackers, error: trackersError }, { data: runtimeArtifacts, error: runtimeArtifactsError }] = await Promise.all([
    supabase.from("scan_snapshots").select("*").eq("scan_id", scanId).maybeSingle(),
    supabase.from("scan_tracker_vendors").select("*").eq("scan_id", scanId),
    supabase.from("scan_runtime_artifacts").select("*").eq("scan_id", scanId).maybeSingle()
  ]);

  if (snapshotError) {
    throw new Error(`Failed to load scan snapshot: ${snapshotError.message}`);
  }

  if (trackersError) {
    throw new Error(`Failed to load scan tracker vendors: ${trackersError.message}`);
  }

  if (runtimeArtifactsError) {
    throw new Error(`Failed to load scan runtime artifacts: ${runtimeArtifactsError.message}`);
  }

  if (!snapshot) {
    return null;
  }

  return {
    runtimeArtifacts: runtimeArtifacts
      ? (stripMeta(snakeToCamelRecord(runtimeArtifacts as Record<string, unknown>)) as unknown as ScanRuntimeArtifact)
      : null,
    snapshot: stripMeta(snakeToCamelRecord(snapshot as Record<string, unknown>)) as unknown as ScanSnapshot,
    trackers: ((trackers ?? []) as Array<Record<string, unknown>>).map(
      (tracker) => stripMeta(snakeToCamelRecord(tracker)) as unknown as ScanTrackerVendor
    )
  };
}
