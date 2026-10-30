import type { CanonicalReportExport } from "./report-export";
import { isRegulatoryFindingRelevant } from "../../lib/scans/regulatory-review-catalog";
import { reportRowInFocus, reportSectionInFocus } from "../../lib/scans/report-framework-scope";

/** Lens-specific PDF view; the source canonical export remains a full workpaper. */
export function scopeCanonicalReportPdf(report: CanonicalReportExport): CanonicalReportExport {
  const eu = reportSectionInFocus("gdpr-transparency",report.reviewFocus);
  return {...report,
    gpcResponse:reportSectionInFocus("gpc",report.reviewFocus)?report.gpcResponse:null,
    privacyAuditEvidence:reportSectionInFocus("privacy",report.reviewFocus)?report.privacyAuditEvidence:null,
    gdprEprivacyReview:report.gdprEprivacyReview?{...report.gdprEprivacyReview,rows:report.gdprEprivacyReview.rows.filter(row=>reportRowInFocus(row.id,report.reviewFocus))}:null,
    appendix:{...report.appendix,gdprTransparency:eu?report.appendix.gdprTransparency:{...report.appendix.gdprTransparency,rows:[]},
      ...(report.appendix.evidenceDossier?{evidenceDossier:{...report.appendix.evidenceDossier,checklistDetails:(report.appendix.evidenceDossier.checklistDetails??[]).filter(row=>reportRowInFocus(row.id,report.reviewFocus))}}:{})},
  };
}

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Honor persisted presentation decisions; never reclassify the underlying finding. */
export function pdfNarrativeFindings(report: CanonicalReportExport): Array<Record<string, unknown>> {
  return (report.projection.unifiedFindings as Array<Record<string, unknown>>).filter(finding => {
    if (!isRegulatoryFindingRelevant(String(finding.unifiedFindingId ?? ""), report.reviewFocus)) return false;
    const presentation = object(finding.presentationDecision), surfacing = object(finding.surfacingDecision);
    return !["audit_only", "suppress"].includes(String(presentation.status)) && surfacing.reportable !== false &&
      !["support_only", "suppressed"].includes(String(surfacing.decisionState)) && surfacing.reportLane !== "suppressed";
  });
}

export function isStructuredPdfEvidence(value: string) {
  try { const parsed: unknown = JSON.parse(value); return parsed !== null && typeof parsed === "object"; }
  catch { return false; }
}

const locationLabels: Record<string, string> = { cookies: "Cookie", domains: "Domain", vendors: "Vendor", runtimeVendors: "Vendor", runtimeRequestUrls: "Request", observedRuntimeVendors: "Vendor", observedTrackingVendors: "Vendor", accessibilitySelectors: "Selector", cpraOptOutEvidenceUrls: "Choice URL", preconsent_cookie_names: "Cookie", preconsent_nonessential_cookie_names: "Cookie", preconsent_tracker_vendors: "Vendor", session_replay_runtime_vendors: "Vendor" };
export function pdfFindingLocations(entities: Record<string, unknown>) {
  return [...new Set(Object.entries(entities).filter(([key]) => locationLabels[key]).flatMap(([key, values]) =>
    (Array.isArray(values) ? values : []).filter((value): value is string => typeof value === "string" && !isStructuredPdfEvidence(value)).map(value => `${locationLabels[key]}: ${value}`)))];
}

/** Typed appendix tables carry the readable details; original structured packets stay linked in the workpaper. */
export function pdfFindingEntityRows(entities: Record<string, unknown>, label: (key: string) => string): string[][] {
  const rows: string[][] = [], structured: string[] = [];
  for (const [key, values] of Object.entries(entities)) {
    const items = (Array.isArray(values) ? values : []).filter((value): value is string => typeof value === "string");
    const readable = items.filter(value => !isStructuredPdfEvidence(value));
    if (readable.length) rows.push([label(key), readable.join(", ")]);
    const count = items.length - readable.length;
    if (count) structured.push(`${label(key)}: ${count} ${count === 1 ? "record" : "records"}`);
  }
  if (structured.length) rows.push(["Structured evidence in JSON workpaper", structured.join("; ")]);
  return rows;
}
