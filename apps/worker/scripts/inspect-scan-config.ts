import { createAdminClient } from "@website-signal-risk-scanner/db";

async function main() {
  const scanId = process.argv[2]?.trim();

  if (!scanId) {
    throw new Error("Usage: inspect-scan-config.ts <scan-id>");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scans")
    .select("id, status, scan_config_json")
    .eq("id", scanId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load scan ${scanId}: ${error.message}`);
  }

  console.log(JSON.stringify(data, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
