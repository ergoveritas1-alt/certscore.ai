import type { FullSiteReportResponse } from "../../server/scans/full-site-report";
import { apiFormSnapshotExport } from "./form-snapshot-export";

/** Export the same display-safe rows as the sitewide report, without its table pagination. */
export function fullSiteEvidenceExport(scanId: string, report: FullSiteReportResponse) {
  if (report.pages.rows.length !== report.pages.total || report.resources.rows.length !== report.resources.total) {
    throw new Error("Full-site export requires all retained page and resource rows.");
  }
  return {
    ...report,
    pages: { ...report.pages, offset: 0, limit: report.pages.rows.length },
    resources: { ...report.resources, offset: 0, limit: report.resources.rows.length },
    collectionSurfaces: {
      ...report.collectionSurfaces,
      rows: report.collectionSurfaces.rows.map(row => {
        if (row.snapshot.status !== "available") return row;
        return { ...row, snapshot: apiFormSnapshotExport(scanId, row.snapshot, { requirePage: true }) };
      }),
    },
  };
}
