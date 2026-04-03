export function getPolicyPageType(record: Record<string, unknown> | null | undefined) {
  const value = record?.pageType ?? record?.page_type;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getPrimaryPolicyEnrichmentRow(rows: Array<Record<string, unknown>>) {
  return rows.find((row) => getPolicyPageType(row) === "privacy_policy") ?? rows[0] ?? null;
}
