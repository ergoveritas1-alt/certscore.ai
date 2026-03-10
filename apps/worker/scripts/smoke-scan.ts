import { createAdminClient } from "@website-signal-risk-scanner/db";
import { runFullScanJob } from "../src/scan/run-full-scan";

type OrganizationRow = {
  id: string;
};

type DomainRow = {
  hostname: string;
  id: string;
  normalized_url: string;
  organization_id: string | null;
};

async function resolveDomain() {
  const supabase = createAdminClient();
  const requestedHostname = process.argv[2]?.trim().toLowerCase() ?? "";
  const requestedNormalizedUrl =
    requestedHostname.length > 0
      ? `https://${requestedHostname.replace(/^https?:\/\//, "").replace(/\/+$/, "")}/`
      : null;

  if (requestedHostname.length > 0) {
    const { data: matchedDomain, error } = await supabase
      .from("domains")
      .select("id, organization_id, hostname, normalized_url")
      .eq("hostname", requestedHostname)
      .not("organization_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load requested domain ${requestedHostname}: ${error.message}`);
    }

    if (matchedDomain) {
      return matchedDomain as DomainRow;
    }
  }

  const { data: existingDomain, error: domainError } = await supabase
    .from("domains")
    .select("id, organization_id, hostname, normalized_url")
    .not("organization_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (domainError) {
    throw new Error(`Failed to load an existing domain: ${domainError.message}`);
  }

  if (existingDomain) {
    return existingDomain as DomainRow;
  }

  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (orgError) {
    throw new Error(`Failed to load an organization for smoke scan setup: ${orgError.message}`);
  }

  if (!organization) {
    throw new Error("No organization found. Cannot create a smoke-scan domain.");
  }

  const { data: insertedDomain, error: insertError } = await supabase
    .from("domains")
    .insert({
      organization_id: (organization as OrganizationRow).id,
      hostname: requestedHostname.length > 0 ? requestedHostname : "example.com",
      normalized_url: requestedNormalizedUrl ?? "https://example.com/",
      scan_frequency: "manual"
    })
    .select("id, organization_id, hostname, normalized_url")
    .single();

  if (insertError || !insertedDomain) {
    throw new Error(`Failed to create smoke-scan domain: ${insertError?.message ?? "unknown error"}`);
  }

  return insertedDomain as DomainRow;
}

async function main() {
  const supabase = createAdminClient();
  const domain = await resolveDomain();

  if (!domain.organization_id) {
    throw new Error(`Resolved domain ${domain.hostname} is missing organization_id.`);
  }

  const pagesRequested = 3;
  const { data: scan, error: scanError } = await supabase
    .from("scans")
    .insert({
      organization_id: domain.organization_id,
      domain_id: domain.id,
      scan_type: "full",
      status: "queued",
      pages_requested: pagesRequested,
      pages_scanned: 0,
      scan_config_json: {
        processor: "smoke-scan-v1",
        profile: "smoke",
        maxPages: pagesRequested,
        source: "codex-smoke"
      }
    })
    .select("id")
    .single();

  if (scanError || !scan) {
    throw new Error(`Failed to create smoke scan: ${scanError?.message ?? "unknown error"}`);
  }

  await supabase.from("domains").update({ latest_scan_id: scan.id }).eq("id", domain.id);
  await runFullScanJob(scan.id);

  const { data: snapshot, error: snapshotError } = await supabase
    .from("scan_snapshots")
    .select(
      [
        "scan_id",
        "domain",
        "total_signals",
        "certscore_overall",
        "privacy_score",
        "consent_score",
        "tracker_risk_score",
        "accessibility_score",
        "legal_coverage_score",
        "compliance_maturity_tier",
        "privacy_policy_word_count",
        "cookie_count_total",
        "third_party_cookie_count",
        "csp_header_present",
        "dnssec_enabled",
        "tls_version_min_supported",
        "scanner_schema_version",
        "detection_engine_version"
      ].join(", ")
    )
    .eq("scan_id", scan.id)
    .maybeSingle();

  if (snapshotError) {
    throw new Error(`Scan ran but snapshot lookup failed: ${snapshotError.message}`);
  }

  console.log(
    JSON.stringify(
      {
        domain: domain.hostname,
        organizationId: domain.organization_id,
        scanId: scan.id,
        snapshot
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
