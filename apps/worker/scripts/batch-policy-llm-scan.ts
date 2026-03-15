import { setTimeout as sleep } from "node:timers/promises";
import { createAdminClient } from "@website-signal-risk-scanner/db";
import { FULL_SCAN_EVENT_TYPES, FULL_SCAN_JOB, SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
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

type ScanRow = {
  id: string;
  status: string;
  error_message: string | null;
  completed_at: string | null;
};

type BatchItem = {
  domain: DomainRow;
  scanId: string;
};

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

async function resolveDomain(hostname: string) {
  const supabase = createAdminClient();
  const normalizedHostname = normalizeHostname(hostname);

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

async function enqueueFullScan(hostname: string): Promise<BatchItem> {
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
        profile: "batch-policy-llm",
        maxPages: pagesRequested,
        source: "codex-batch-policy-llm"
      }
    })
    .select("id")
    .single();

  if (scanError || !scan) {
    throw new Error(`Failed to create full scan for ${domain.hostname}: ${scanError?.message ?? "unknown error"}`);
  }

  const { error: eventError } = await supabase.from("scan_events").insert({
    scan_id: scan.id,
    domain_id: domain.id,
    organization_id: domain.organization_id,
    event_type: FULL_SCAN_EVENT_TYPES.queued,
    message: "Batch policy LLM scan queued and awaiting worker processing.",
    metadata_json: {
      pagesRequested,
      profile: "batch-policy-llm"
    }
  });

  if (eventError) {
    throw new Error(`Failed to create queue event for ${domain.hostname}: ${eventError.message}`);
  }

  const { error: latestScanError } = await supabase
    .from("domains")
    .update({ latest_scan_id: scan.id })
    .eq("id", domain.id)
    .eq("organization_id", domain.organization_id);

  if (latestScanError) {
    throw new Error(`Failed to update latest scan id for ${domain.hostname}: ${latestScanError.message}`);
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

  return { domain, scanId: scan.id };
}

async function waitForCompletion(scanIds: string[], timeoutMinutes: number) {
  const supabase = createAdminClient();
  const pending = new Set(scanIds);
  const deadline = Date.now() + timeoutMinutes * 60_000;

  while (pending.size > 0 && Date.now() < deadline) {
    const { data, error } = await supabase
      .from("scans")
      .select("id, status, error_message, completed_at")
      .in("id", [...pending]);

    if (error) {
      throw new Error(`Failed to poll scans: ${error.message}`);
    }

    for (const row of (data ?? []) as ScanRow[]) {
      if (row.status === "completed" || row.status === "failed") {
        pending.delete(row.id);
      }
    }

    if (pending.size > 0) {
      await sleep(15_000);
    }
  }

  return pending;
}

async function collectSummary(items: BatchItem[]) {
  const supabase = createAdminClient();
  const scanIds = items.map((item) => item.scanId);

  const [{ data: scans, error: scansError }, { data: snapshots, error: snapshotsError }, { data: enrichments, error: enrichmentsError }, { data: events, error: eventsError }] =
    await Promise.all([
      supabase.from("scans").select("id, status, error_message, completed_at").in("id", scanIds),
      supabase
        .from("scan_snapshots")
        .select("scan_id, privacy_policy_present, privacy_policy_word_count, homepage_fetch_status, blocked_flag, captcha_flag, partial_scan")
        .in("scan_id", scanIds),
      supabase
        .from("policy_enrichment")
        .select(
          [
            "scan_id",
            "page_type",
            "page_url",
            "policy_ai_model",
            "policy_ai_run_at",
            "policy_actionable_flags",
            "policy_semantic_confidence"
          ].join(",")
        )
        .in("scan_id", scanIds)
        .order("created_at", { ascending: true }),
      supabase
        .from("scan_events")
        .select("scan_id, event_type, message, metadata_json")
        .in("scan_id", scanIds)
        .in("event_type", [SCAN_EVENT_TYPES.accessLimitationsDetected])
    ]);

  if (scansError) {
    throw new Error(`Failed to fetch scans: ${scansError.message}`);
  }

  if (snapshotsError) {
    throw new Error(`Failed to fetch snapshots: ${snapshotsError.message}`);
  }

  if (enrichmentsError) {
    throw new Error(`Failed to fetch policy enrichment rows: ${enrichmentsError.message}`);
  }

  if (eventsError) {
    throw new Error(`Failed to fetch access events: ${eventsError.message}`);
  }

  const scanMap = new Map((scans ?? []).map((row) => [row.id, row]));
  const snapshotMap = new Map((snapshots ?? []).map((row) => [row.scan_id, row]));
  const enrichmentsByScan = new Map<string, Array<Record<string, unknown>>>();
  const accessEventByScan = new Map<string, Record<string, unknown>>();

  for (const row of (enrichments ?? []) as unknown as Array<Record<string, unknown> & { scan_id: string }>) {
    const list = enrichmentsByScan.get(row.scan_id) ?? [];
    list.push(row);
    enrichmentsByScan.set(row.scan_id, list);
  }

  for (const row of (events ?? []) as unknown as Array<Record<string, unknown> & { scan_id: string }>) {
    accessEventByScan.set(row.scan_id, row);
  }

  return items.map((item) => {
    const enrichmentsForScan = enrichmentsByScan.get(item.scanId) ?? [];
    const privacyRows = enrichmentsForScan.filter((row) => row.page_type === "privacy_policy");

    return {
      domain: item.domain.hostname,
      scanId: item.scanId,
      scan: scanMap.get(item.scanId) ?? null,
      snapshot: snapshotMap.get(item.scanId) ?? null,
      privacyPolicyRows: privacyRows,
      allPolicyRows: enrichmentsForScan,
      accessEvent: accessEventByScan.get(item.scanId) ?? null
    };
  });
}

async function main() {
  const args = process.argv.slice(2).map(normalizeHostname).filter(Boolean);

  if (args.length === 0) {
    throw new Error("Usage: batch-policy-llm-scan.ts <hostname> [hostname...]");
  }

  const timeoutMinutes = 45;
  const batchItems: BatchItem[] = [];

  for (const hostname of args) {
    const item = await enqueueFullScan(hostname);
    batchItems.push(item);
  }

  const pending = await waitForCompletion(
    batchItems.map((item) => item.scanId),
    timeoutMinutes
  );

  const summary = await collectSummary(batchItems);

  console.log(
    JSON.stringify(
      {
        enqueued: batchItems.map((item) => ({
          domain: item.domain.hostname,
          scanId: item.scanId
        })),
        pendingScanIds: [...pending],
        summary
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
