import type { CanonicalReportExport } from "./report-export";

/** Missing historical request inventory is unavailable, never a zero count. */
export function reportRequestInventory(report: CanonicalReportExport) {
  const retained = report.appendix.cookieAndTrackerInventory.requestInventory;
  return retained?.status === "retained" && retained.metric ? retained : null;
}
