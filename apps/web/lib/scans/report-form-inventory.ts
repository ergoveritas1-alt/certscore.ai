import type { ScanDetailResponse } from "../../server/scans/get-scan-by-id";
import { getPersistedCanonicalReportProjection } from "../../server/scans/persisted-canonical-report-projection";
import { projectScanFormsSummary } from "../api-v2/scan-report-summary";
import { projectPostAcceptForms } from "./post-accept-form-projection";
import type { CollectionSurfaceTableRow } from "./collection-surface-table-row";

/** The same retained, phase-labelled form observations for web and exports.
 * Post-Accept eligibility and reconciliation stay in the existing projector. */
export function projectReportFormInventory(scan: ScanDetailResponse, canonical = getPersistedCanonicalReportProjection(scan), site?: { rows: CollectionSurfaceTableRow[]; limitedPages: number; pagesWithoutInventory: number }) {
  const initial = canonical?.collectionSurfaceAssessment;
  const afterAccept = projectPostAcceptForms(scan);
  const initialRows: CollectionSurfaceTableRow[] = (initial?.forms ?? []).map(form => {
    const candidates = scan.runtimeArtifacts?.formSnapshots;
    const snapshot = Array.isArray(candidates) ? candidates.find(item => item?.formRef === form.formRef && item?.sourceInventoryHash === initial?.sourceHash && item?.pageUrl === form.pageUrl) : undefined;
    return { id: form.formRef, form, capturedAt: typeof snapshot?.capturedAt === "string" ? snapshot.capturedAt : "", snapshot: snapshot?.status === "available"
      ? { status: "available", url: `/api/scans/${encodeURIComponent(scan.scan.id)}/form-snapshot?formRef=${encodeURIComponent(form.formRef)}` }
      : { status: snapshot?.status === "withheld" ? "withheld" : "unavailable", ...(typeof snapshot?.reason === "string" ? { reason: snapshot.reason } : {}) } };
  });
  return { contractVersion: "certscore.report-form-inventory.v1" as const,
    scope: site ? "full_site" as const : "starting_page" as const,
    passiveObserved: site ? site.rows.length : !initial || initial.assessmentStatus === "not_testable" ? null : initialRows.length,
    passiveLimited: site ? site.limitedPages > 0 || site.pagesWithoutInventory > 0 : !initial || ["limited", "not_testable"].includes(initial.assessmentStatus),
    summary: projectScanFormsSummary(scan), rows: [...(site?.rows ?? initialRows), ...afterAccept.rows], afterAcceptLimited: afterAccept.limited };
}

export type ReportFormInventory = ReturnType<typeof projectReportFormInventory>;
export function reportFormPhaseLabel(row: CollectionSurfaceTableRow, site = false) {
  return row.capturePhase === "after_accept_click" ? "After Accept click" : row.capturePhase === "after_accept" ? "After Accept" : site ? "Page inventory" : "Initial page";
}
