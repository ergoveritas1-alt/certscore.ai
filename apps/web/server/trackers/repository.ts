"use server";

import { createDatabaseClient } from "@website-signal-risk-scanner/db";

export type TrackerInventoryCompletedScanRow = {
  completed_at: string;
  domain_id: string | null;
  id: string;
};

export type TrackerInventoryDomainRow = {
  hostname: string;
  id: string;
};

export type TrackerInventoryTrackerRow = {
  before_consent: boolean | null;
  collection_endpoint_type: string | null;
  confidence: number | null;
  first_party_or_third_party: string;
  scan_id: string;
  script_host: string | null;
  vendor_category: string;
  vendor_name: string;
};

export type TrackerInventoryRuntimeArtifactRow = {
  consent_preconsent_violation_count: number | null;
  scan_id: string;
};

export type TrackerInventoryPreconsentViolationRow = {
  scan_id: string;
  vendor_category: string;
  vendor_name: string;
};

export async function loadTrackerInventoryCompletedScans(organizationId: string): Promise<TrackerInventoryCompletedScanRow[]> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("scans")
    .select("id, domain_id, completed_at")
    .eq("organization_id", organizationId)
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(`Failed to load tracker inventory scans: ${error.message}`);
  }

  return (data ?? []) as TrackerInventoryCompletedScanRow[];
}

export async function loadTrackerInventoryRelatedData(input: {
  domainIds: string[];
  organizationId: string;
  scanIds: string[];
}): Promise<{
  domains: TrackerInventoryDomainRow[];
  preconsentViolations: TrackerInventoryPreconsentViolationRow[];
  runtimeArtifacts: TrackerInventoryRuntimeArtifactRow[];
  trackers: TrackerInventoryTrackerRow[];
}> {
  const db = createDatabaseClient();
  const [
    { data: domains, error: domainsError },
    { data: trackers, error: trackersError },
    { data: runtimeArtifacts, error: runtimeArtifactsError },
    { data: preconsentViolations, error: preconsentViolationsError }
  ] = await Promise.all([
    input.domainIds.length
      ? db.from("domains").select("id, hostname").eq("organization_id", input.organizationId).in("id", input.domainIds)
      : Promise.resolve({ data: [] as TrackerInventoryDomainRow[], error: null }),
    input.scanIds.length
      ? db
          .from("scan_tracker_vendors")
          .select(
            "scan_id, vendor_name, vendor_category, confidence, first_party_or_third_party, collection_endpoint_type, before_consent, script_host"
          )
          .in("scan_id", input.scanIds)
      : Promise.resolve({ data: [] as TrackerInventoryTrackerRow[], error: null }),
    input.scanIds.length
      ? db
          .from("scan_runtime_artifacts")
          .select("scan_id, consent_preconsent_violation_count")
          .in("scan_id", input.scanIds)
      : Promise.resolve({ data: [] as TrackerInventoryRuntimeArtifactRow[], error: null }),
    input.scanIds.length
      ? db
          .from("scan_preconsent_violations")
          .select("scan_id, vendor_name, vendor_category")
          .in("scan_id", input.scanIds)
      : Promise.resolve({ data: [] as TrackerInventoryPreconsentViolationRow[], error: null })
  ]);

  if (domainsError) {
    throw new Error(`Failed to load tracker inventory domains: ${domainsError.message}`);
  }

  if (trackersError) {
    throw new Error(`Failed to load tracker inventory trackers: ${trackersError.message}`);
  }

  if (runtimeArtifactsError) {
    throw new Error(`Failed to load tracker inventory runtime artifacts: ${runtimeArtifactsError.message}`);
  }

  if (preconsentViolationsError) {
    throw new Error(`Failed to load tracker inventory pre-consent violations: ${preconsentViolationsError.message}`);
  }

  return {
    domains: (domains ?? []) as TrackerInventoryDomainRow[],
    preconsentViolations: (preconsentViolations ?? []) as TrackerInventoryPreconsentViolationRow[],
    runtimeArtifacts: (runtimeArtifacts ?? []) as TrackerInventoryRuntimeArtifactRow[],
    trackers: (trackers ?? []) as TrackerInventoryTrackerRow[]
  };
}
