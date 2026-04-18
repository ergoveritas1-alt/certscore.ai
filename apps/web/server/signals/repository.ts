"use server";

import { query } from "@website-signal-risk-scanner/db";

export type SignalOverviewDomainRow = {
  hostname: string;
  id: string;
};

export type SignalOverviewScanRow = {
  completed_at: string | null;
  created_at: string;
  domain_id: string | null;
  id: string;
  status: string;
};

export type SignalOverviewSnapshotRow = {
  scan_id: string;
  total_signals: number;
};

export type SignalOverviewSignalRow = {
  category: string;
  scan_id: string;
  signal_key: string;
  signal_label: string;
  signal_value_json: boolean | number | string | string[];
};

export async function loadSignalOverviewDomainsAndLatestCompletedScans(organizationId: string): Promise<{
  domains: SignalOverviewDomainRow[];
  scans: SignalOverviewScanRow[];
}> {
  try {
    const [domainsResult, scansResult] = await Promise.all([
      query<SignalOverviewDomainRow>(
        `select id, hostname
           from domains
          where organization_id = $1
          order by created_at desc`,
        [organizationId],
        { readOnly: true }
      ),
      query<SignalOverviewScanRow>(
        `select id, domain_id, status, created_at, completed_at
           from scans
          where organization_id = $1
            and status = 'completed'
          order by created_at desc`,
        [organizationId],
        { readOnly: true }
      )
    ]);

    return {
      domains: domainsResult.rows,
      scans: scansResult.rows
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load signal overview data: ${message}`);
  }
}

export async function loadSignalOverviewSnapshotsAndSignals(scanIds: string[]): Promise<{
  signals: SignalOverviewSignalRow[];
  snapshots: SignalOverviewSnapshotRow[];
}> {
  if (!scanIds.length) {
    return {
      signals: [],
      snapshots: []
    };
  }

  try {
    const [snapshotsResult, signalsResult] = await Promise.all([
      query<SignalOverviewSnapshotRow>(
        `select scan_id, total_signals
           from scan_snapshots
          where scan_id = any($1::uuid[])`,
        [scanIds],
        { readOnly: true }
      ),
      query<SignalOverviewSignalRow>(
        `select scan_id, category, signal_key, signal_label, signal_value_json
           from scan_signals
          where population_source = 'scanner'
            and scan_id = any($1::uuid[])
          order by category asc, signal_key asc`,
        [scanIds],
        { readOnly: true }
      )
    ]);

    return {
      signals: signalsResult.rows,
      snapshots: snapshotsResult.rows
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load signal overview data: ${message}`);
  }
}
