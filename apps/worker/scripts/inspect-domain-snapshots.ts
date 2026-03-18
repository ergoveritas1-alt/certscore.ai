import { createAdminClient } from "@website-signal-risk-scanner/db";

async function main() {
  const hostname = process.argv[2]?.trim();
  const limit = Number.parseInt(process.argv[3] ?? "5", 10);

  if (!hostname) {
    throw new Error("Usage: inspect-domain-snapshots.ts <hostname> [limit]");
  }

  const supabase = createAdminClient();
  const { data: domain, error: domainError } = await supabase
    .from("domains")
    .select("id, hostname")
    .eq("hostname", hostname)
    .maybeSingle();

  if (domainError) {
    throw new Error(`Failed to load domain: ${domainError.message}`);
  }

  if (!domain) {
    throw new Error(`Domain not found: ${hostname}`);
  }

  const { data: scans, error: scansError } = await supabase
    .from("scans")
    .select("id, created_at, completed_at, status")
    .eq("domain_id", domain.id)
    .order("created_at", { ascending: false })
    .limit(Number.isFinite(limit) ? limit : 5);

  if (scansError) {
    throw new Error(`Failed to load scans: ${scansError.message}`);
  }

  const scanIds = (scans ?? []).map((scan) => scan.id);
  const { data: snapshots, error: snapshotsError } = await supabase
    .from("scan_snapshots")
    .select(
      [
        "scan_id",
        "free_trial_detected",
        "refund_policy_present",
        "cookie_policy_present",
        "legal_coverage_score",
        "subscription_terms_present",
        "auto_renew_disclosure_present"
      ].join(", ")
    )
    .in("scan_id", scanIds);

  if (snapshotsError) {
    throw new Error(`Failed to load snapshots: ${snapshotsError.message}`);
  }

  console.log(
    JSON.stringify(
      {
        domain,
        scans,
        snapshots
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
