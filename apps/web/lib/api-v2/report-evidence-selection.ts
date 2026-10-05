import type { ReportEvidenceSection } from "@certscore/api-contracts";

// Select existing display projections only. Never classify findings or infer observations.
const CONTEXT_FIELDS = ["scan", "score", "verdict", "findings", "nextStep", "coverage"] as const;
const SECTION_FIELDS: Record<ReportEvidenceSection, readonly string[]> = {
  consent: ["controls", "consentVendor", "consentRows", "acceptPath", "rejectPath", "choicePathComparison"],
  gpc: ["gpcResponse", "gpcLaneStatus"],
  policy: ["gdprTransparencyRows", "policySurfaceCoverage"],
  tracking: ["preConsentRuntimeRows", "trackingExternalRows", "inventory", "inventorySummary", "resourceInventory", "trackerVendors", "fullSiteReport"],
  transport: ["transportRows"],
  forms: ["collectionFields", "collectionLimitations", "collectionStatus", "collectionSurfaces", "collectionTableRows", "fullSiteReport"],
};

export function selectReportEvidenceSection(report: Record<string, unknown>, section: ReportEvidenceSection) {
  const requested = [...CONTEXT_FIELDS, ...SECTION_FIELDS[section]];
  const fields = requested.filter(key => Object.hasOwn(report, key) && report[key] !== undefined);
  return {
    report: Object.fromEntries(fields.map(key => [key, report[key]])),
    selection: {
      version: "certscore.report-evidence-selection.v1" as const,
      fields,
      notReturnedFields: requested.filter(key => !fields.includes(key)),
      interpretation: "Only the selected retained report sections and shared scan, score, findings and coverage context are returned. Associated full-site context is included for forms and tracking when retained. Not returned does not mean absent or compliant. Preserve each section's evidence limitations; no finding, confidence or score was changed.",
    },
  };
}
