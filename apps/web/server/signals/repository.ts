"use server";

import { createDatabaseClient } from "@website-signal-risk-scanner/db";

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
  const db = createDatabaseClient();
  const [{ data: domains, error: domainsError }, { data: scans, error: scansError }] = await Promise.all([
    db.from("domains").select("id, hostname").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    db
      .from("scans")
      .select("id, domain_id, status, created_at, completed_at")
      .eq("organization_id", organizationId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
  ]);

  if (domainsError) {
    throw new Error(`Failed to load domains for signal overview: ${domainsError.message}`);
  }

  if (scansError) {
    throw new Error(`Failed to load completed scans for signal overview: ${scansError.message}`);
  }

  return {
    domains: (domains ?? []) as SignalOverviewDomainRow[],
    scans: (scans ?? []) as SignalOverviewScanRow[]
  };
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

  const db = createDatabaseClient();
  const [{ data: snapshots, error: snapshotsError }, { data: signals, error: signalsError }] = await Promise.all([
    db.from("scan_snapshots").select("scan_id, total_signals").in("scan_id", scanIds),
    db
      .from("scan_signals")
      .select("scan_id, category, signal_key, signal_label, signal_value_json")
      .eq("population_source", "scanner")
      .in("scan_id", scanIds)
      .order("category", { ascending: true })
      .order("signal_key", { ascending: true })
  ]);

  if (snapshotsError) {
    throw new Error(`Failed to load signal overview snapshots: ${snapshotsError.message}`);
  }

  if (signalsError) {
    throw new Error(`Failed to load signal overview signals: ${signalsError.message}`);
  }

  return {
    signals: (signals ?? []) as SignalOverviewSignalRow[],
    snapshots: (snapshots ?? []) as SignalOverviewSnapshotRow[]
  };
}
