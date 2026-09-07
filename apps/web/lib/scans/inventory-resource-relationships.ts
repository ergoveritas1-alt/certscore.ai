import type { ApiRuntimeEvidenceGraph } from "@certscore/api-contracts";

export type InventoryResourceIdentity = {
  nodeRefs?: string[];
  cookieRefs: string[];
  products?: string[];
  requests: Array<{ hostname: string | null; path: string | null; method: string | null }>;
};
export function matchInventoryResources(graph: ApiRuntimeEvidenceGraph, identity: InventoryResourceIdentity) {
  const products = new Set((identity.products ?? []).map(product => product.trim().replace(/\s+/g, " ").toLowerCase()).filter(Boolean));
  return graph.nodes.filter(node => {
    if (identity.nodeRefs?.includes(node.id)) return true;
    if (identity.cookieRefs.includes(node.id)) return true;
    if (node.kind !== "request" || !node.url) return false;
    // When the inventory retained no endpoint rows, an exact canonical-registry
    // product match can still bind product-owned request evidence. A vendor name
    // alone remains insufficient because one company may own several products.
    if (!identity.requests.length && node.classification?.basis === "canonical_registry" && typeof node.classification.product === "string" && products.has(node.classification.product.trim().replace(/\s+/g, " ").toLowerCase())) return true;
    const url = new URL(node.url);
    // Public inventory request evidence intentionally removes a leading `www.`
    // for display. Apply only that same canonical-host alias here; widening to
    // arbitrary subdomains could attach a row to unrelated retained evidence.
    const graphHostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return identity.requests.some(request => request.hostname?.trim().toLowerCase().replace(/^www\./, "") === graphHostname && request.path === url.pathname && request.method === node.method);
  });
}

export function countInventoryResourceChildren(graph: ApiRuntimeEvidenceGraph, identity: InventoryResourceIdentity) {
  const matches = new Set(matchInventoryResources(graph, identity).map(node => node.id));
  return new Set(graph.edges.filter(edge => matches.has(edge.from)).map(edge => edge.to)).size;
}

export function crawlOccurrenceGraphIdentity(occurrence: {
  graphNodeRefs?: string[]; evidenceRefs: string[]; kind: string; label: string;
  details: Record<string, unknown>;
}): InventoryResourceIdentity {
  const identity: InventoryResourceIdentity = { cookieRefs: [], nodeRefs: occurrence.graphNodeRefs ?? occurrence.evidenceRefs, requests: [] };
  if (occurrence.kind === "request") {
    try {
      const url = new URL(occurrence.label);
      identity.requests.push({ hostname: url.hostname, path: url.pathname, method: typeof occurrence.details.method === "string" ? occurrence.details.method : null });
    } catch { /* Invalid endpoints cannot establish a graph match. */ }
  }
  return identity;
}
