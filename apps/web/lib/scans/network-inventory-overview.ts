import { serviceIntegrationGroup } from "./service-integration-group";
export type InventoryClassificationCounts = { nonEssential: number; review: number; unclassified: number; contextual: number; essential: number };
export type NetworkInventoryOverview = {
  identifiedServices: number;
  identifiedServiceNames?: string[];
  /** Distinct network request identities, excluding storage and embeds. */
  distinctResources: number;
  unattributedResources: number;
  /** Same identity units as the resource table and inventory mix. */
  distinctStorage: number;
  distinctEmbeds: number;
  /** One classification per resource identity, never weighted by eventCount. */
  distinctClassifications?: { requests: InventoryClassificationCounts; storage: InventoryClassificationCounts; embeds: InventoryClassificationCounts };
};

/** Summarize existing service/resource identities, never findings or risk.
 * The unclassified catch-all is not an identified service. Event repetition
 * and page membership remain on the source resources, outside this summary. */
export function buildNetworkInventoryOverview(services: readonly {
  key: string;
  context: { identity: unknown };
  resources: readonly { key: string; kind: string; context: { identity: unknown }; inventoryEvidence?: string }[];
}[]): NetworkInventoryOverview {
  const identified = new Set<string>();
  const names = new Map<string, string>();
  const resources = new Set<string>();
  const unattributed = new Set<string>();
  const storage = new Set<string>();
  const embeds = new Set<string>();
  const distinctRows = new Map<string, { kind: string; inventoryEvidence?: string }>();
  for (const service of services) {
    for (const resource of service.resources) {
      distinctRows.set(resource.key, resource);
      if (resource.kind === "cookie" || resource.kind === "storage") storage.add(resource.key);
      if (resource.kind === "embed") embeds.add(resource.key);
    }
    const requests = service.resources.filter(resource => resource.kind === "request");
    if (service.resources.length && service.context.identity) {
      identified.add(service.key);
      names.set(service.key, serviceIntegrationGroup(service.context.identity as { entity?: string; vendor?: string; product?: string }).name);
    }
    for (const resource of requests) {
      resources.add(resource.key);
      if (!resource.context.identity) unattributed.add(resource.key);
    }
  }
  const emptyCounts = (): InventoryClassificationCounts => ({ nonEssential: 0, review: 0, unclassified: 0, contextual: 0, essential: 0 });
  const distinctClassifications = { requests: emptyCounts(), storage: emptyCounts(), embeds: emptyCounts() };
  const classificationKeys: Record<string, keyof InventoryClassificationCounts> = { "Non-essential": "nonEssential", Review: "review", Contextual: "contextual", Essential: "essential" };
  for (const row of distinctRows.values()) {
    const family = row.kind === "request" ? "requests" : row.kind === "embed" ? "embeds" : row.kind === "cookie" || row.kind === "storage" ? "storage" : null;
    if (!family) continue;
    const key = classificationKeys[row.inventoryEvidence ?? ""] ?? "unclassified";
    distinctClassifications[family][key] += 1;
  }
  return { identifiedServices: identified.size, identifiedServiceNames: [...names.values()].sort((a, b) => a.localeCompare(b)),  distinctResources: resources.size, unattributedResources: unattributed.size, distinctStorage: storage.size, distinctEmbeds: embeds.size, distinctClassifications };
}
