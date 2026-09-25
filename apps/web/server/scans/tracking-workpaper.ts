import type { CanonicalReportExport } from "./report-export";

export function buildTrackingWorkpaper(report: CanonicalReportExport) {
  return {
    contractVersion: "certscore.tracking-workpaper.v1",
    reviewFocus: report.reviewFocus,
    scan: report.scan,
    scope: "Starting-page retained inventory. Additional-page evidence, where available, remains in the full-site report export.",
    reviewScope: report.reviewScope,
    completeness: report.appendix.cookieAndTrackerInventory.summary,
    inventoryCoverage: report.appendix.cookieAndTrackerInventory.presentationMessage,
    privacyChoicesAndNotices: report.privacyAuditEvidence,
    gpc: report.gpcResponse,
    ...(report.postAcceptObservation ? { postAcceptObservation: report.postAcceptObservation } : {}),
    ...(report.postRefusalObservation ? { postRefusalObservation: report.postRefusalObservation } : {}),
    rows: report.appendix.cookieAndTrackerInventory.rows.map(row => ({
      ...row,
      saleAssessment: "not_assessed" as const,
      shareAssessment: "not_assessed" as const,
      vendorGpcHonoring: "not_assessed" as const,
    })),
    notice: report.notice,
  };
}

function csvCell(value: unknown) {
  const text = Array.isArray(value) ? value.join("; ") : value == null ? "" : String(value);
  // Spreadsheet formulas are executable content, including after whitespace.
  const safe = /^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function renderTrackingWorkpaperCsv(report: CanonicalReportExport) {
  const inventory = report.appendix.cookieAndTrackerInventory;
  const headers = ["row_kind", "scan_id", "review_focus", "scan_origin", "captured_at", "scope", "retained_rows", "included_rows", "omitted_rows", "inventory_coverage", "scan_gpc_response", "scan_gpc_delivery", "scan_gpc_comparable", "scan_california_gpc_deduction", "vendor", "product", "resource_type", "resource_name", "purpose", "party", "domains", "first_seen_ms", "before_consent", "classification", "confidence", "sale_assessment", "share_assessment", "vendor_gpc_honoring", "evidence_refs", "evidence_url"];
  const scope = "Starting page only; same retained scan; GPC comparisons are scan-level, not vendor legal conclusions.";
  const common = [report.scan.id, report.reviewFocus, report.scan.scanFrom, report.scan.completedAt, scope,
    inventory.summary.totalRows, inventory.summary.includedRows, inventory.summary.omittedRows, inventory.presentationMessage,
    report.gpcResponse?.status ?? "unavailable", report.gpcResponse?.comparison.delivery?.status ?? "unknown",
    report.gpcResponse?.comparison.comparable ?? "unknown", report.gpcResponse?.californiaPolicy.deductionPoints ?? "unknown"];
  const evidenceUrl = `https://certscore.ai/scan/${encodeURIComponent(report.scan.id)}?reviewFocus=${report.reviewFocus}`;
  // Always retain a manifest, even for zero-row or coverage-limited captures.
  const manifest = ["manifest", ...common, ...Array(15).fill(""), evidenceUrl];
  const rows = inventory.rows.map(row => ["inventory", ...common, row.vendor, row.products, row.type, row.resourceNames,
    row.purpose, row.relationship.party, row.domains, row.firstSeenMs, row.preConsent, row.evidenceClassification,
    row.confidence, "not_assessed", "not_assessed", "not_assessed", row.evidenceRefs, evidenceUrl]);
  return [headers, manifest, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
