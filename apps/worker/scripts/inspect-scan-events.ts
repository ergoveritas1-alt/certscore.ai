import { createAdminClient } from "@website-signal-risk-scanner/db";

async function main() {
  const scanId = process.argv[2]?.trim();
  const eventType = process.argv[3]?.trim() || null;

  if (!scanId) {
    throw new Error("Usage: inspect-scan-events.ts <scan-id> [event-type]");
  }

  const supabase = createAdminClient();
  let query = supabase
    .from("scan_events")
    .select("event_type, message, metadata_json, created_at")
    .eq("scan_id", scanId)
    .order("created_at", { ascending: true });

  if (eventType) {
    query = query.eq("event_type", eventType);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load scan events: ${error.message}`);
  }

  console.log(JSON.stringify(data ?? [], null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
