import { createAdminClient } from "@website-signal-risk-scanner/db";

async function main() {
  const scanId = process.argv[2]?.trim();

  if (!scanId) {
    throw new Error("Usage: inspect-change-events.ts <scan-id>");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("compliance_change_events")
    .select("event_type, field_name, old_value_text, new_value_text, severity, event_group, event_timestamp")
    .eq("scan_id_current", scanId)
    .order("event_timestamp", { ascending: false });

  if (error) {
    throw new Error(`Failed to load change events: ${error.message}`);
  }

  console.log(JSON.stringify(data, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
