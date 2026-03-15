import { createAdminClient } from "@website-signal-risk-scanner/db";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";

async function main() {
  const limit = Number.parseInt(process.argv[2] ?? "25", 10);
  const supabase = createAdminClient();

  const { data: scans, error: scansError } = await supabase
    .from("scans")
    .select("id, domain_id, status, error_message, completed_at, created_at, scan_config_json")
    .contains("scan_config_json", { profile: "batch-policy-llm" })
    .order("created_at", { ascending: false })
    .limit(Number.isFinite(limit) ? limit : 25);

  if (scansError) {
    throw new Error(`Failed to load recent scans: ${scansError.message}`);
  }

  const scanIds = (scans ?? []).map((row) => row.id);
  const domainIds = [...new Set((scans ?? []).map((row) => row.domain_id).filter(Boolean))];
  const [{ data: domains, error: domainsError }, { data: snapshots, error: snapshotsError }, { data: enrichments, error: enrichmentsError }, { data: events, error: eventsError }] =
    await Promise.all([
      supabase.from("domains").select("id, hostname").in("id", domainIds),
      supabase
        .from("scan_snapshots")
        .select("scan_id, privacy_policy_present, privacy_policy_word_count, homepage_fetch_status, blocked_flag, captcha_flag, partial_scan")
        .in("scan_id", scanIds),
      supabase
        .from("policy_enrichment")
        .select("scan_id, page_type, page_url, policy_ai_model, policy_ai_run_at, policy_actionable_flags, policy_semantic_confidence")
        .in("scan_id", scanIds)
        .order("created_at", { ascending: true }),
      supabase
        .from("scan_events")
        .select("scan_id, event_type, message, metadata_json")
        .in("scan_id", scanIds)
        .eq("event_type", SCAN_EVENT_TYPES.accessLimitationsDetected)
    ]);

  if (domainsError) {
    throw new Error(`Failed to load domains: ${domainsError.message}`);
  }

  if (snapshotsError) {
    throw new Error(`Failed to load snapshots: ${snapshotsError.message}`);
  }

  if (enrichmentsError) {
    throw new Error(`Failed to load enrichments: ${enrichmentsError.message}`);
  }

  if (eventsError) {
    throw new Error(`Failed to load events: ${eventsError.message}`);
  }

  const domainMap = new Map((domains ?? []).map((row) => [row.id, row.hostname]));
  const snapshotMap = new Map((snapshots ?? []).map((row) => [row.scan_id, row]));
  const enrichmentsByScan = new Map<string, Array<Record<string, unknown>>>();
  const accessEventsByScan = new Map<string, Array<Record<string, unknown>>>();

  for (const row of enrichments ?? []) {
    const list = enrichmentsByScan.get(row.scan_id) ?? [];
    list.push(row);
    enrichmentsByScan.set(row.scan_id, list);
  }

  for (const row of events ?? []) {
    const list = accessEventsByScan.get(row.scan_id) ?? [];
    list.push(row);
    accessEventsByScan.set(row.scan_id, list);
  }

  const summary = (scans ?? []).map((scan) => ({
    id: scan.id,
    hostname: scan.domain_id ? domainMap.get(scan.domain_id) ?? null : null,
    status: scan.status,
    created_at: scan.created_at,
    completed_at: scan.completed_at,
    error_message: scan.error_message,
    snapshot: snapshotMap.get(scan.id) ?? null,
    privacy_rows: (enrichmentsByScan.get(scan.id) ?? []).filter((row) => row.page_type === "privacy_policy"),
    access_events: accessEventsByScan.get(scan.id) ?? []
  }));

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
