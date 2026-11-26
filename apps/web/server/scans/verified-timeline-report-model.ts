import "server-only";
import {loadGpcResourceInventory} from "./gpc-resource-inventory";
import { isTerminalPageCaptureAssessment } from "../../lib/scans/scan-report-disposition";
import { projectExternalScanNoGo } from "@website-signal-risk-scanner/shared";
import type { NoGoReportData, ReportPhaseInventories, TimelineReportData } from "../../components/scans/report-lab/shadow-report-data";
import { buildTimelineReportModel } from "../../components/scans/report-lab/timeline-report-model";
import type { ActionResourceInventory } from "../../lib/scans/action-resource-inventory";
import { attachInventoryPolicyDisclosure } from "../../lib/scans/single-page-resource-inventory";
import { withServerTiming } from "../performance/log-server-timing";
import { loadReviewedPoliciesFromProjection } from "./full-site-reviewed-policies";
import type { ScanDetailResponse } from "./get-scan-by-id";
import type { ScanStatusProjection } from "./scan-status-projection";

/** A terminal capture decision has a status snapshot but no scored report. */
export function buildTerminalRuntimeVisitReport(projection: Pick<ScanStatusProjection,
  "id" | "status" | "publicationRequestStatus" | "scanNoGoAssessment" | "domainHostname" | "pageUrl" |
  "createdAt" | "startedAt" | "completedAt" | "scanFrom" | "browserGuidance"
>): NoGoReportData | null {
  if (projection.status !== "failed" || projection.publicationRequestStatus === "terminal_failure" ||
      !isTerminalPageCaptureAssessment(projection.scanNoGoAssessment)) return null;
  const noGo = projectExternalScanNoGo({ scan_no_go_assessment: projection.scanNoGoAssessment });
  if (!noGo) return null;
  if (projection.scanFrom === "local_extension") {
    const blocked = ["access_denied_or_forbidden_page", "captcha_or_challenge"].includes(noGo.noGo.reasonCode);
    if (blocked) {
      noGo.noGo.title = "The site blocked the browser scan";
      noGo.noGo.recommendedNextAction = "Use a public page that opens directly, or ask the site owner about approved access.";
    }
    const signals = projection.scanNoGoAssessment?.supportingSignals as Record<string, unknown> | undefined;
    if (typeof signals?.mainDocumentStatus === "number") {
      noGo.noGo.evidenceExcerpt = `The main document returned HTTP ${signals.mainDocumentStatus} during the browser visit.`;
    }
  }
  return {
    ...noGo,
    browserGuidance: projection.browserGuidance,
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
      origin: projection.scanFrom === "local_extension" ? "Chrome extension" : projection.scanFrom ?? "Unavailable",
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

export function buildTimelineReportWithDeferredPolicyDisclosure(record: ScanDetailResponse): {
  report: TimelineReportData;
  phaseInventories?: Promise<ReportPhaseInventories>;
} {
  const report = buildTimelineReportModel(record);
  if (report.resultDisposition === "no_go") return { report };

  const { resourceInventory, actionInventories } = report;
  const phaseInventories: Promise<ReportPhaseInventories> = withServerTiming(
    "app.scan_detail.reviewed_policy_text",
    () => loadReviewedPoliciesFromProjection(record),
    { scanId: record.scan.id },
  ).then(documents => {
    const enrichAction = (action: ActionResourceInventory | null | undefined) => action && ({
      ...action,
      inventory: attachInventoryPolicyDisclosure(action.inventory, documents),
    });
    return {
      resourceInventory: resourceInventory && attachInventoryPolicyDisclosure(resourceInventory, documents),
      actionInventories: actionInventories && {
        accept: enrichAction(actionInventories.accept),
        reject: enrichAction(actionInventories.reject),
      },
    };
  }).catch(() => ({ resourceInventory, actionInventories }));
  return { report, phaseInventories };
}
