import { createAdminClient } from "@website-signal-risk-scanner/db";

async function main() {
  const scanId = process.argv[2]?.trim();

  if (!scanId) {
    throw new Error("Usage: inspect-tracker-timing.ts <scan-id>");
  }

  const supabase = createAdminClient();
  const [{ data: snapshot, error: snapshotError }, { data: trackers, error: trackersError }] = await Promise.all([
    supabase
      .from("scan_snapshots")
      .select(
        "scan_id, tracker_adoption_change_detected, request_domain_set_changed, script_domain_set_changed, security_header_posture_changed, infrastructure_change_detected"
      )
      .eq("scan_id", scanId)
      .maybeSingle(),
    supabase
      .from("scan_tracker_vendors")
      .select("vendor_name, detection_source, before_consent, script_host")
      .eq("scan_id", scanId)
      .order("vendor_name", { ascending: true })
  ]);

  if (snapshotError) {
    throw new Error(`Failed to load snapshot: ${snapshotError.message}`);
  }

  if (trackersError) {
    throw new Error(`Failed to load trackers: ${trackersError.message}`);
  }

  console.log(JSON.stringify({ snapshot, trackers }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
