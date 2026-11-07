import "server-only";
import {loadGpcResourceInventory} from "./gpc-resource-inventory";
import { isRuntimeVisitCaptureAssessment, projectExternalScanNoGo } from "@website-signal-risk-scanner/shared";
import type { NoGoReportData } from "../../components/scans/report-lab/shadow-report-data";
import { buildTimelineReportModel } from "../../components/scans/report-lab/timeline-report-model";
import { loadReviewedPoliciesFromProjection } from "./full-site-reviewed-policies";
import type { ScanDetailResponse } from "./get-scan-by-id";
import type { ScanStatusProjection } from "./scan-status-projection";

/** A terminal capture decision has a status snapshot but no scored report. */
export function buildTerminalRuntimeVisitReport(projection: Pick<ScanStatusProjection,
  "id" | "status" | "publicationRequestStatus" | "scanNoGoAssessment" | "domainHostname" | "pageUrl" |
  "createdAt" | "startedAt" | "completedAt" | "scanFrom"
>): NoGoReportData | null {
  if (projection.status !== "failed" || projection.publicationRequestStatus === "terminal_failure" ||
      !isRuntimeVisitCaptureAssessment(projection.scanNoGoAssessment)) return null;
  const noGo = projectExternalScanNoGo({ scan_no_go_assessment: projection.scanNoGoAssessment });
  if (!noGo) return null;
  return {
    ...noGo,
    score: { label: "Not scored", value: null },
    scan: {
      id: projection.id,
      host: projection.domainHostname ?? "Public website",
      url: projection.pageUrl ?? "",
      reportUrl: `/scan/${encodeURIComponent(projection.id)}`,
      benchmark: "Unavailable",
      createdAt: projection.createdAt,
      createdAtIso: projection.createdAt,
      startedAt: projection.startedAt ?? undefined,
      completedAt: projection.completedAt ?? undefined,
      duration: "Unavailable",
      observedWindow: "Starting-page capture",
      origin: projection.scanFrom ?? "Unavailable",
      originCode: projection.scanFrom ?? "",
    },
  };
}

/** Policy text stays server-side; the report receives only matched excerpts and provenance. */
export async function buildVerifiedTimelineReportModel(record: ScanDetailResponse, options: {includeGpcInventory?: boolean} = {}) {
  const documents = await loadReviewedPoliciesFromProjection(record).catch(() => []);
  const model = buildTimelineReportModel(record, documents);
  return options.includeGpcInventory && "findings" in model ? {...model,gpcResourceInventory:await loadGpcResourceInventory(record)} : model;
}
