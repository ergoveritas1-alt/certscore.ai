"use server";

import { query } from "@website-signal-risk-scanner/db";

export type TrackerInventoryCompletedScanRow = {
  completed_at: string | Date;
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
  try {
    const result = await query<TrackerInventoryCompletedScanRow>(
      `select id, domain_id, completed_at
         from scans
        where organization_id = $1
          and status = 'completed'
          and completed_at is not null
        order by completed_at desc
        limit 500`,
      [organizationId],
      { readOnly: true }
    );

    return result.rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load tracker inventory scans: ${message}`);
  }
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
  try {
    const [domainsResult, trackersResult, runtimeArtifactsResult, preconsentViolationsResult] = await Promise.all([
      input.domainIds.length
        ? query<TrackerInventoryDomainRow>(
            `select id, hostname
               from domains
              where organization_id = $1
                and id = any($2::uuid[])`,
            [input.organizationId, input.domainIds],
            { readOnly: true }
          )
        : Promise.resolve({ rows: [] as TrackerInventoryDomainRow[] }),
      input.scanIds.length
        ? query<TrackerInventoryTrackerRow>(
            `select scan_id, vendor_name, vendor_category, confidence, first_party_or_third_party,
                    collection_endpoint_type, before_consent, script_host
               from scan_tracker_vendors
              where scan_id = any($1::uuid[])`,
            [input.scanIds],
            { readOnly: true }
          )
        : Promise.resolve({ rows: [] as TrackerInventoryTrackerRow[] }),
      input.scanIds.length
        ? query<TrackerInventoryRuntimeArtifactRow>(
            `select scan_id, consent_preconsent_violation_count
               from scan_runtime_artifacts
              where scan_id = any($1::uuid[])`,
            [input.scanIds],
            { readOnly: true }
          )
        : Promise.resolve({ rows: [] as TrackerInventoryRuntimeArtifactRow[] }),
      input.scanIds.length
        ? query<TrackerInventoryPreconsentViolationRow>(
            `select scan_id, vendor_name, vendor_category
               from scan_preconsent_violations
              where scan_id = any($1::uuid[])`,
            [input.scanIds],
            { readOnly: true }
          )
        : Promise.resolve({ rows: [] as TrackerInventoryPreconsentViolationRow[] })
    ]);

    return {
      domains: domainsResult.rows,
      preconsentViolations: preconsentViolationsResult.rows,
      runtimeArtifacts: runtimeArtifactsResult.rows,
      trackers: trackersResult.rows
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load tracker inventory data: ${message}`);
  }
}
