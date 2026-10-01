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

/** Build once per verified graph, rather than scanning every node/edge per row. */
export function createInventoryRelationshipCounter(graph: ApiRuntimeEvidenceGraph) {
  const nodeIds = new Set(graph.nodes.map(node => node.id));
  const endpoints = new Map<string, string[]>();
  const products = new Map<string, string[]>();
  const children = new Map<string, Set<string>>();
  const normalizeProduct = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  const endpoint = (host: string | null, path: string | null, method: string | null | undefined) =>
    JSON.stringify([host?.trim().toLowerCase().replace(/^www\./, ""), path, method, method === undefined]);
  const add = (index: Map<string, string[]>, key: string, id: string) => {
    const ids = index.get(key) ?? []; ids.push(id); index.set(key, ids);
  };
  for (const node of graph.nodes) {
    if (node.kind !== "request" || !node.url) continue;
    const url = new URL(node.url);
    add(endpoints, endpoint(url.hostname, url.pathname, node.method), node.id);
    if (node.classification?.basis === "canonical_registry" && typeof node.classification.product === "string") {
      add(products, normalizeProduct(node.classification.product), node.id);
    }
  }
  for (const edge of graph.edges) {
    const targets = children.get(edge.from) ?? new Set<string>();
    targets.add(edge.to); children.set(edge.from, targets);
  }
  return (identity: InventoryResourceIdentity) => {
    const matches = new Set([...(identity.nodeRefs ?? []), ...identity.cookieRefs].filter(id => nodeIds.has(id)));
    for (const request of identity.requests) {
      for (const id of endpoints.get(endpoint(request.hostname, request.path, request.method)) ?? []) matches.add(id);
    }
    if (!identity.requests.length) for (const product of identity.products ?? []) {
      const key = normalizeProduct(product);
      if (key) for (const id of products.get(key) ?? []) matches.add(id);
    }
    const targets = new Set<string>();
    for (const id of matches) for (const target of children.get(id) ?? []) targets.add(target);
    return targets.size;
  };
}
