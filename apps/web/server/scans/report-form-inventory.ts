import type { CanonicalReportExport } from "./report-export";
import type { CollectionSurfaceTableRow } from "../../lib/scans/collection-surface-table-row";

/** Reads only exported canonical inventory. Historical exports retain their
 * initial-page scope; missing later evidence never becomes zero later forms. */
export function reportFormInventory(report: CanonicalReportExport) {
  const initial = report.appendix.dataCollectionSurfaces;
  const retained = initial.reportInventory;
  const rows: CollectionSurfaceTableRow[] = retained?.rows ?? (initial.forms ?? []).map(form => ({ id: form.formRef, form, capturedAt: "", snapshot: { status: "unavailable", reason: "not_retained_in_export" } }));
  return { rows, totalForms: retained ? rows.length : initial.summary.totalForms, totalFields: retained ? rows.reduce((total, row) => total + row.form.fields.length, 0) : initial.summary.totalFields,
    initialForms: retained ? retained.passiveObserved : ["unavailable", "insufficient_evidence", "not_testable"].includes(initial.assessmentStatus) ? null : initial.summary.totalForms,
    afterAcceptForms: retained?.summary?.afterAcceptObserved ?? null,
    limited: retained ? retained.summary?.countStatus === "limited" || retained.afterAcceptLimited === true || retained.passiveLimited === true : !["observed", "not_observed"].includes(initial.assessmentStatus),
    hasCombinedInventory: Boolean(retained), summary: retained?.summary ?? null };
}

export function reportFormScopeNote(report: CanonicalReportExport) {
  return report.appendix.dataCollectionSurfaces.reportInventory
    ? "This inventory combines retained page observations and eligible forms observed after the Accept click. Each row identifies its capture phase. Counts describe observations across captures, not deduplicated forms across sessions. No form was submitted and no field values are included."
    : report.appendix.dataCollectionSurfaces.scopeNote;
}
