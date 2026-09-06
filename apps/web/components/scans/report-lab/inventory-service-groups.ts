import type { ShadowReportData } from "./shadow-report-data";

type Row = ShadowReportData["inventory"][number];

export function consolidateInventoryServices(rows: Row[]): Row[] {
  return groupInventoryServices(rows).map(group => {
    if (group.length === 1) return group[0]!;
    // Keep the existing request classification; embed evidence does not upgrade
    // or dilute it. Supporting observations remain inspectable and exportable.
    const primary = group.find(row => row.type === "Tracker / request")!;
    return { ...primary, evidenceJson: { ...primary.evidenceJson,
      supportingObservations: group.filter(row => row !== primary),
    } };
  });
}

// Presentation grouping only: never infer a request/iframe initiator edge.
export function groupInventoryServices(rows: Row[]): Row[][] {
  const candidates = new Map<string, Row[]>();
  const key = (row: Row) => JSON.stringify([row.vendor, row.controllingEntity, row.name]);
  for (const row of rows) {
    const matches = candidates.get(key(row)) ?? [];
    matches.push(row);
    candidates.set(key(row), matches);
  }
  const emitted = new Set<string>();
  return rows.flatMap(row => {
    const id = key(row);
    const matches = candidates.get(id)!;
    const groupable = row.name !== "Not retained" && row.vendor !== "Unknown"
      && matches.some(item => item.type === "Embed / iframe")
      && matches.some(item => item.type === "Tracker / request")
      && matches.every(item => item.type === "Embed / iframe" || item.type === "Tracker / request");
    if (!groupable) return [[row]];
    if (emitted.has(id)) return [];
    emitted.add(id);
    return [matches];
  });
}
