import "server-only";

import { unstable_cache } from "next/cache";
import {
  loadAdminScanFilterOptions,
  loadAdminScanOperationalSnapshot,
  loadAdminScanOverviewCounts,
  type AdminScanOperationalSnapshotPeriod,
} from "./repository";

export const loadCachedAdminScanOperationalSnapshot = unstable_cache(
  async (period: AdminScanOperationalSnapshotPeriod, includeCanary: boolean, excludeMacMiniScanBot: boolean) =>
    loadAdminScanOperationalSnapshot(period, includeCanary, excludeMacMiniScanBot),
  ["admin-scan-operational-snapshot-v2"],
  { revalidate: 30 }
);

export const loadCachedAdminScanOverviewCounts = unstable_cache(
  async () => loadAdminScanOverviewCounts(),
  ["admin-scan-overview-counts"],
  { revalidate: 30 }
);

export const loadCachedAdminScanFilterOptions = unstable_cache(
  async () => loadAdminScanFilterOptions(),
  ["admin-scan-filter-options"],
  { revalidate: 60 }
);
