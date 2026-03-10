import { createAdminClient } from "@website-signal-risk-scanner/db";

async function main() {
  const scanId = process.argv[2]?.trim();

  if (!scanId) {
    throw new Error("Usage: inspect-robots-summary.ts <scan-id>");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_snapshots")
    .select(
      [
        "scan_id",
        "robots_fetch_status",
        "robots_fetch_http_status",
        "robots_txt_hash",
        "robots_crawl_delay_ms",
        "robots_rules_loaded",
        "robots_group_count",
        "robots_directive_count",
        "robots_has_allow_rules",
        "robots_has_disallow_rules",
        "robots_txt_fetched_at",
        "robots_txt_url"
      ].join(", ")
    )
    .eq("scan_id", scanId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load robots summary: ${error.message}`);
  }

  console.log(JSON.stringify(data, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
