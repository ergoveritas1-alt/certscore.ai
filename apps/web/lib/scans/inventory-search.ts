import { inventoryPurposeGroups } from "./inventory-purpose-presentation";

export type InventorySearch = { query: string; purpose: string; kind: string };
type SearchableResource = {
  name: string; kind: string; purposes: string[]; relationships: string[];
  occurrence: { vendor?: string | null; domain?: string | null };
};
const purposeKey = (value: string) => value.trim().toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ");

export function matchesInventoryPurpose(purposes: readonly string[], relationships: readonly string[], purpose: string) {
  if (!purpose) return true;
  const groups = inventoryPurposeGroups(purposes, relationships).map(purposeKey);
  return purpose === "mixed" ? new Set(groups).size > 1 : groups.includes(purposeKey(purpose));
}

export function inventoryPurposeOptions(purposes: readonly string[]) {
  return [...new Map(purposes.map(value => [purposeKey(value), value])).values()].sort((a, b) => a.localeCompare(b));
}

export function matchesInventoryResource(row: SearchableResource, filters: InventorySearch, serviceName = "") {
  const query = filters.query.trim().toLowerCase();
  return (filters.kind === "all" || (filters.kind === "cookie" ? ["cookie", "storage"].includes(row.kind) : row.kind === filters.kind))
    && matchesInventoryPurpose(row.purposes, row.relationships, filters.purpose)
    && (!query || [row.name, row.occurrence.vendor, row.occurrence.domain, serviceName].some(value => value?.toLowerCase().includes(query)));
}
