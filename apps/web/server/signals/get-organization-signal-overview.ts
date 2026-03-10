"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";

export type DomainSignalOverview = {
  domainId: string;
  hostname: string;
  latestCompletedAt: string | null;
  totalSignals: number | null;
  signals: Array<{
    category: string;
    key: string;
    label: string;
    value: boolean | number | string | string[];
  }>;
};

type DomainRow = {
  hostname: string;
  id: string;
};

type ScanRow = {
  completed_at: string | null;
  created_at: string;
  domain_id: string | null;
  id: string;
  status: string;
};

type SnapshotRow = {
  scan_id: string;
  total_signals: number;
};

type SignalRow = {
  category: string;
  scan_id: string;
  signal_key: string;
  signal_label: string;
  signal_value_json: boolean | number | string | string[];
};

export async function getOrganizationSignalOverview(organizationId: string): Promise<DomainSignalOverview[]> {
  const supabase = createAdminClient();
  const [{ data: domains, error: domainsError }, { data: scans, error: scansError }] = await Promise.all([
    supabase.from("domains").select("id, hostname").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    supabase
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

  const latestScanByDomain = new Map<string, ScanRow>();

  for (const scan of (scans ?? []) as ScanRow[]) {
    if (!scan.domain_id || latestScanByDomain.has(scan.domain_id)) {
      continue;
    }

    latestScanByDomain.set(scan.domain_id, scan);
  }

  const latestScanIds = [...latestScanByDomain.values()].map((scan) => scan.id);
  const [{ data: snapshots }, { data: signals }] = await Promise.all([
    latestScanIds.length
      ? supabase.from("scan_snapshots").select("scan_id, total_signals").in("scan_id", latestScanIds)
      : Promise.resolve({ data: [] as SnapshotRow[] }),
    latestScanIds.length
      ? supabase
          .from("scan_signals")
          .select("scan_id, category, signal_key, signal_label, signal_value_json")
          .in("scan_id", latestScanIds)
          .order("category", { ascending: true })
          .order("signal_key", { ascending: true })
      : Promise.resolve({ data: [] as SignalRow[] })
  ]);

  const snapshotMap = new Map(((snapshots ?? []) as SnapshotRow[]).map((snapshot) => [snapshot.scan_id, snapshot]));
  const signalMap = new Map<string, SignalRow[]>();

  for (const signal of (signals ?? []) as SignalRow[]) {
    const bucket = signalMap.get(signal.scan_id) ?? [];
    bucket.push(signal);
    signalMap.set(signal.scan_id, bucket);
  }

  return ((domains ?? []) as DomainRow[]).map((domain) => {
    const latestScan = latestScanByDomain.get(domain.id);

    return {
      domainId: domain.id,
      hostname: domain.hostname,
      latestCompletedAt: latestScan?.completed_at ?? null,
      totalSignals: latestScan ? snapshotMap.get(latestScan.id)?.total_signals ?? null : null,
      signals: latestScan
        ? (signalMap.get(latestScan.id) ?? [])
            .filter((signal) => {
              const value = signal.signal_value_json;
              return typeof value === "boolean" ? value : typeof value === "number" ? value > 0 : Array.isArray(value) ? value.length > 0 : value.length > 0;
            })
            .slice(0, 8)
            .map((signal) => ({
              category: signal.category,
              key: signal.signal_key,
              label: signal.signal_label,
              value: signal.signal_value_json
            }))
        : []
    };
  });
}
