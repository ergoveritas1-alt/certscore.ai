import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ShadowScanReport } from "../../../components/scans/report-lab/shadow-scan-report";
import { buildTimelineReportModel } from "../../../components/scans/report-lab/timeline-report-model";
import type { ScanDetailResponse } from "../../../server/scans/get-scan-by-id";

export const dynamic = "force-dynamic";

/** Local canonical replay. Creates no scan and changes no saved result. */
export default async function AccessibilityReportPreview({ searchParams }: { searchParams: Promise<{ focus?: string; reviewFocus?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const file = path.resolve(process.cwd(), "../../artifacts/accessibility-report-review-2026-10-10/aspca-scoring-preview.json");
  const retained = JSON.parse(await readFile(file, "utf8")) as ScanDetailResponse;
  const report = buildTimelineReportModel(retained);
  // Serve the already-available retained image through its public production endpoint.
  // Keep the canonical artifact selection and availability checks in the report model.
  if (report.scan.visualEvidenceHref) {
    report.scan.visualEvidenceHref = new URL(report.scan.visualEvidenceHref, "https://certscore.ai").href;
  }
  const params = await searchParams;
  return <><aside className="bg-amber-50 px-6 py-2 text-sm text-amber-950">Local preview · retained ASPCA scan · production unchanged</aside>
    <ShadowScanReport report={report} variant="timeline" reviewFocus={params.reviewFocus ?? params.focus ?? "ccpa_cpra"} />
  </>;
}
