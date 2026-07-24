import "server-only";

import { unstable_cache } from "next/cache";
import {
  loadAdminScanFilterOptions,
  loadAdminScanOverviewCounts
} from "./repository";

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
