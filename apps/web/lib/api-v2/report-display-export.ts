import { visibleFullSiteReport, visibleResourceInventory } from "./report-visible-fields";
import { apiFormSnapshotExport } from "./form-snapshot-export";
/** Report content only: omit diagnostic downloads and encode repeated records once. */
const REPORT_FIELDS = new Set([
  "scan", "score", "formsSummary", "scoreExplanation", "verdict", "executiveHeadline", "findings", "nextStep", "metrics",
  "coverage", "controls", "consentVendor", "consentRows", "gdprTransparencyRows",
  "preConsentRuntimeRows", "trackingExternalRows", "transportRows", "relatedRows",
  "policySurfaceCoverage", "gpcResponse", "gpcLaneStatus", "acceptPath", "rejectPath",
  "choicePathComparison", "timeline", "inventory", "inventorySummary", "resourceInventory",
  "trackerVendors", "collectionFields", "collectionLimitations", "collectionStatus",
  "collectionSurfaces", "collectionTableRows", "siteMetadata", "fullSiteReport",
]);
const DIAGNOSTICS = new Set(["canonicalEvidenceJson", "evidenceJson", "runtimeEvidenceGraph"]);
const pointer = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");

export function buildReportDisplayExport(report: Record<string, unknown>, options: { scanId?: string } = {}) {
  const scanId = options.scanId ?? (report.scan as { id?: string } | undefined)?.id;
  const formRows = (rows: unknown) => Array.isArray(rows) && scanId ? rows.map(row => {
    if (!row?.snapshot || row.snapshot.status !== "available") return row;
    return { ...row, snapshot: apiFormSnapshotExport(scanId, row.snapshot) };
  }) : rows;
  report = { ...report,
    ...(report.collectionTableRows ? { collectionTableRows: formRows(report.collectionTableRows) } : {}),
    ...(report.fullSiteReport ? { fullSiteReport: visibleFullSiteReport(report.fullSiteReport as Record<string, unknown>) } : {}),
    ...(report.resourceInventory ? { resourceInventory: visibleResourceInventory(report.resourceInventory as Record<string, unknown>) } : {}),
  };
  const seen = new Map<string, string>();
  function project(value: unknown, path: string): unknown {
    if (!value || typeof value !== "object") return value;
    // Compare complete projected inputs before replacing children with references.
    // Comparing afterwards prevents identical parent records from deduplicating.
    const encoded = JSON.stringify(value);
    if (encoded.length >= 512) {
      const previous = seen.get(encoded);
      if (previous) return { reportContentRef: previous };
      seen.set(encoded, path);
    }
    const projected: unknown = Array.isArray(value)
      ? value.map((child, i) => project(child, `${path}/${i}`))
      : Object.fromEntries(Object.entries(value).filter(([key]) => !DIAGNOSTICS.has(key))
        .map(([key, child]) => [key, project(child, `${path}/${pointer(key)}`)]));
    return projected;
  }
  return {
    exportContent: {
      scope: "report_display_content",
      exclusions: ["diagnostic_json_downloads", "internal_runtime_graph", "image_binary_bytes", "internal_page_state", "raw_resource_occurrences", "graph_json_viewers"],
      references: "reportContentRef is an RFC 6901 pointer into this exported document. Resolve it to retrieve an identical displayed record stored once. Form fields, inventory rows, coverage limitations and snapshot links are retained.",
    },
    ...Object.fromEntries(Object.entries(report).filter(([key]) => REPORT_FIELDS.has(key))
      .map(([key, value]) => [key, project(value, `/${pointer(key)}`)])),
  };
}
