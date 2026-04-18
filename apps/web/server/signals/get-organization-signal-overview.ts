"use server";

import { getPrimaryCategoryLabel, mapSignalKeyToTaxonomy } from "../../lib/scans/signal-taxonomy";
import {
  loadSignalOverviewDomainsAndLatestCompletedScans,
  loadSignalOverviewSnapshotsAndSignals,
  type SignalOverviewScanRow,
  type SignalOverviewSignalRow
} from "./repository";

export type DomainSignalOverview = {
  domainId: string;
  hostname: string;
  latestCompletedAt: string | null;
  totalSignals: number | null;
      signals: Array<{
        category: string;
        categoryLabel: string;
        key: string;
        label: string;
        value: boolean | number | string | string[];
  }>;
};

export async function getOrganizationSignalOverview(organizationId: string): Promise<DomainSignalOverview[]> {
  const { domains, scans } = await loadSignalOverviewDomainsAndLatestCompletedScans(organizationId);

  const latestScanByDomain = new Map<string, SignalOverviewScanRow>();

  for (const scan of scans) {
    if (!scan.domain_id || latestScanByDomain.has(scan.domain_id)) {
      continue;
    }

    latestScanByDomain.set(scan.domain_id, scan);
  }

  const latestScanIds = [...latestScanByDomain.values()].map((scan) => scan.id);
  const { snapshots, signals } = await loadSignalOverviewSnapshotsAndSignals(latestScanIds);

  const snapshotMap = new Map(snapshots.map((snapshot) => [snapshot.scan_id, snapshot]));
  const signalMap = new Map<string, SignalOverviewSignalRow[]>();

  for (const signal of signals) {
    const bucket = signalMap.get(signal.scan_id) ?? [];
    bucket.push(signal);
    signalMap.set(signal.scan_id, bucket);
  }

  return domains.map((domain) => {
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
            .map((signal) => {
              const taxonomy = mapSignalKeyToTaxonomy({
                category: signal.category,
                key: signal.signal_key,
                label: signal.signal_label
              });

              return {
                category: taxonomy.primaryCategory,
                categoryLabel: getPrimaryCategoryLabel(taxonomy.primaryCategory),
                key: signal.signal_key,
                label: signal.signal_label,
                value: signal.signal_value_json
              };
            })
        : []
    };
  });
}
