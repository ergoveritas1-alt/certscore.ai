"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import type { FullSiteReportResponse } from "../../server/scans/full-site-report";

// Keep the last unfiltered response through the homepage-ready server refresh.
// This lives only in the mounted scan route; it is never shared across visitors.
const ReportContinuity = createContext<{ scanId: string; cacheScope: string; data: FullSiteReportResponse | null } | null>(null);

export function FullSiteReportContinuity({ scanId, cacheScope, children }: { scanId: string; cacheScope: string; children: ReactNode }) {
  const snapshot = useRef({ scanId, cacheScope, data: null as FullSiteReportResponse | null });
  if (snapshot.current.scanId !== scanId || snapshot.current.cacheScope !== cacheScope) snapshot.current = { scanId, cacheScope, data: null };
  return <ReportContinuity.Provider value={snapshot.current}>{children}</ReportContinuity.Provider>;
}

export function useFullSiteReportContinuity() {
  return useContext(ReportContinuity);
}
