import type { ShadowReportData } from "./shadow-report-data";

function formatTableCell(value: string | number | null) {
  return String(value ?? "—").replace(/[\t\r\n]+/g, " ").trim() || "—";
}

export function buildRuntimeInventoryCopyPayload(inventory: ShadowReportData["inventory"]) {
  const rows: Array<Array<string | number | null>> = [
    ["Type", "Vendor", "Name", "Purpose", "Evidence mix", "First seen", "Domains", "Relationship", "Confidence", "Priority"],
    ...inventory.map((row) => [
      row.type,
      row.vendor,
      row.name,
      row.purpose,
      row.evidence,
      row.observed,
      row.domains,
      `${row.relationship} · entity ${row.entityRelationship.toLowerCase()}`,
      row.confidence,
      row.priority,
    ]),
  ];

  return rows.map((row) => row.map(formatTableCell).join("\t")).join("\n");
}
