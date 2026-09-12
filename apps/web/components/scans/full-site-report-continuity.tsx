"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import type { FullSiteReportResponse } from "../../server/scans/full-site-report";

// Keep the last unfiltered response through the homepage-ready server refresh.
// This lives only in the mounted scan route; it is never shared across visitors.
const ReportContinuity = createContext<{ scanId: string; data: FullSiteReportResponse | null } | null>(null);

export function FullSiteReportContinuity({ scanId, children }: { scanId: string; children: ReactNode }) {
  const snapshot = useRef({ scanId, data: null as FullSiteReportResponse | null });
  if (snapshot.current.scanId !== scanId) snapshot.current = { scanId, data: null };
  return <ReportContinuity.Provider value={snapshot.current}>{children}</ReportContinuity.Provider>;
}

export function useFullSiteReportContinuity() {
  return useContext(ReportContinuity);
}
