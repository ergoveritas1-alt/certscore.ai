import { createAdminClient } from "@website-signal-risk-scanner/db";
import { SCAN_EVENT_TYPES, getPlanDefinition } from "@website-signal-risk-scanner/shared";
import { getDueDomains } from "./get-due-domains";

async function insertEvent(input: {
  domainId: string | null;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
  organizationId: string | null;
  scanId?: string | null;
}) {
  const supabase = createAdminClient();
  await supabase.from("scan_events").insert({
    scan_id: input.scanId ?? null,
    domain_id: input.domainId,
    organization_id: input.organizationId,
    event_type: input.eventType,
    message: input.message,
    metadata_json: input.metadata ?? null
  });
}

export async function enqueueScheduledScans(now = new Date()) {
  const supabase = createAdminClient();
  const dueDomains = await getDueDomains(now);
  let createdCount = 0;
  let skippedCount = 0;

  console.info("[scanner-scheduler] sweep started", {
    dueCount: dueDomains.length,
    timestamp: now.toISOString()
  });

  for (const domain of dueDomains) {
    try {
      const { data: activeScan } = await supabase
        .from("scans")
        .select("id")
        .eq("organization_id", domain.organizationId)
        .eq("domain_id", domain.domainId)
        .in("scan_type", ["full", "scheduled"])
        .in("status", ["queued", "running"])
        .limit(1)
        .maybeSingle();

      if (activeScan) {
        skippedCount += 1;
        await insertEvent({
          domainId: domain.domainId,
          eventType: SCAN_EVENT_TYPES.scheduledScanSkippedExistingActiveScan,
          message: "Scheduled scan skipped because an active full or scheduled scan already exists.",
          metadata: {
            activeScanId: activeScan.id,
            frequency: domain.effectiveFrequency
          },
          organizationId: domain.organizationId
        });
        continue;
      }

      const plan = getPlanDefinition(domain.organizationPlan);
      const pagesRequested = domain.maxPagesOverride ?? plan.maxPagesPerScan;
      const scanConfig = {
        processor: "scheduled-full-scan-v2",
        profile: plan.scanProfile,
        maxPages: pagesRequested,
        source: "scheduled-monitoring",
        frequency: domain.effectiveFrequency
      };

      const { data: scan, error } = await supabase
        .from("scans")
        .insert({
          organization_id: domain.organizationId,
          domain_id: domain.domainId,
          submitted_by_user_id: null,
          scan_type: "scheduled",
          status: "queued",
          pages_requested: pagesRequested,
          pages_scanned: 0,
          scan_config_json: scanConfig
        })
        .select("id")
        .single();

      if (error || !scan) {
        skippedCount += 1;
        await insertEvent({
          domainId: domain.domainId,
          eventType: SCAN_EVENT_TYPES.scheduleSweepFailed,
          message: "Scheduled scan creation failed for a due domain.",
          metadata: {
            error: error?.message ?? "Unknown error",
            hostname: domain.hostname
          },
          organizationId: domain.organizationId
        });
        continue;
      }

      await supabase
        .from("domains")
        .update({
          latest_scan_id: scan.id
        })
        .eq("id", domain.domainId)
        .eq("organization_id", domain.organizationId);

      await insertEvent({
        domainId: domain.domainId,
        eventType: SCAN_EVENT_TYPES.scheduledScanEnqueued,
        message: "Scheduled monitoring queued a new scan for scanner pickup.",
        metadata: {
          frequency: domain.effectiveFrequency,
          pagesRequested
        },
        organizationId: domain.organizationId,
        scanId: scan.id
      });

      createdCount += 1;
    } catch (error) {
      skippedCount += 1;
      await insertEvent({
        domainId: domain.domainId,
        eventType: SCAN_EVENT_TYPES.scheduleSweepFailed,
        message: "Scheduled scan sweep encountered a domain-level failure.",
        metadata: {
          error: error instanceof Error ? error.message : "Unknown scheduling error",
          hostname: domain.hostname
        },
        organizationId: domain.organizationId
      });
    }
  }

  return {
    createdCount,
    dueCount: dueDomains.length,
    skippedCount
  };
}
