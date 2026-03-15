import { createAdminClient } from "@website-signal-risk-scanner/db";
import { FULL_SCAN_EVENT_TYPES, FULL_SCAN_JOB } from "@website-signal-risk-scanner/shared";
import { createFullScanQueue } from "../src/queue/queues";

type OrganizationRow = {
  id: string;
};

type DomainRow = {
  hostname: string;
  id: string;
  max_pages_override: number | null;
  normalized_url: string;
  organization_id: string | null;
};

async function resolveDomain(hostname: string) {
  const supabase = createAdminClient();
  const normalizedHostname = hostname.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");

  const { data: existingDomain, error } = await supabase
    .from("domains")
    .select("id, organization_id, hostname, normalized_url, max_pages_override")
    .eq("hostname", normalizedHostname)
    .not("organization_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load requested domain ${normalizedHostname}: ${error.message}`);
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
    throw new Error(`Failed to load organization for ${normalizedHostname}: ${orgError.message}`);
  }

  if (!organization) {
    throw new Error(`No organization found. Cannot create domain ${normalizedHostname}.`);
  }

  const { data: insertedDomain, error: insertError } = await supabase
    .from("domains")
    .insert({
      organization_id: (organization as OrganizationRow).id,
      hostname: normalizedHostname,
      normalized_url: `https://${normalizedHostname}/`,
      scan_frequency: "manual"
    })
    .select("id, organization_id, hostname, normalized_url, max_pages_override")
    .single();

  if (insertError || !insertedDomain) {
    throw new Error(`Failed to create domain ${normalizedHostname}: ${insertError?.message ?? "unknown error"}`);
  }

  return insertedDomain as DomainRow;
}

async function main() {
  const hostname = process.argv[2]?.trim();

  if (!hostname) {
    throw new Error("Usage: enqueue-full-scan.ts <hostname>");
  }

  const supabase = createAdminClient();
  const domain = await resolveDomain(hostname);

  if (!domain.organization_id) {
    throw new Error(`Domain ${domain.hostname} is missing organization_id.`);
  }

  const pagesRequested = domain.max_pages_override ?? 3;
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
        processor: "queued-full-scan-v1",
        profile: "smoke",
        maxPages: pagesRequested,
        source: "codex-production-diagnostic"
      }
    })
    .select("id")
    .single();

  if (scanError || !scan) {
    throw new Error(`Failed to create full scan: ${scanError?.message ?? "unknown error"}`);
  }

  const { error: eventError } = await supabase.from("scan_events").insert({
    scan_id: scan.id,
    domain_id: domain.id,
    organization_id: domain.organization_id,
    event_type: FULL_SCAN_EVENT_TYPES.queued,
    message: "Scan queued and awaiting worker processing.",
    metadata_json: {
      pagesRequested,
      profile: "smoke"
    }
  });

  if (eventError) {
    throw new Error(`Failed to create queue event: ${eventError.message}`);
  }

  const { error: latestScanError } = await supabase
    .from("domains")
    .update({ latest_scan_id: scan.id })
    .eq("id", domain.id)
    .eq("organization_id", domain.organization_id);

  if (latestScanError) {
    throw new Error(`Failed to update domain latest scan id: ${latestScanError.message}`);
  }

  await createFullScanQueue().add(
    FULL_SCAN_JOB,
    { scanId: scan.id },
    {
      attempts: 3,
      removeOnComplete: 100,
      removeOnFail: 100
    }
  );

  console.log(
    JSON.stringify(
      {
        domain: domain.hostname,
        scanId: scan.id
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
