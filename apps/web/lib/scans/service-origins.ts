import type { ApiRuntimeEvidenceGraph } from "@certscore/api-contracts";
import { resolveCanonicalVendor } from "@certscore/vendor-resolver";
import { crawlOccurrenceGraphIdentity, matchInventoryResources } from "./inventory-resource-relationships";
export type ServiceOrigin = { key: string; name: string; inferred: boolean; nodeId: string; edgeIds: string[]; kind?: "site" };
const ancestry = new Set(["belongs_to_document", "belongs_to_frame", "frame_parent", "worker_request", "initiated_by", "parser_loaded", "async_ancestor", "loaded_resource"]);
export function buildServiceOriginLookup(graph: ApiRuntimeEvidenceGraph, pageUrl?: string) {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const incoming = new Map<string, typeof graph.edges>();
  for (const edge of graph.edges) if (ancestry.has(edge.relation)) incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge]);
  const identities = new Map(graph.nodes.map(node => {
    const match = node.url ? resolveCanonicalVendor({type: "request", url: node.url, hostname: new URL(node.url).hostname, matchSource: "network_request"}).observation : null;
    return [node.id, match ? { key: JSON.stringify([match.entity, match.vendor, match.product]), name: match.product ?? match.vendor } : null];
  }));
  return (occurrence: Parameters<typeof crawlOccurrenceGraphIdentity>[0]): ServiceOrigin[] => {
    const identity = crawlOccurrenceGraphIdentity(occurrence);
    const exact = (identity.nodeRefs ?? []).filter(id => nodes.has(id));
    const matches = exact.length ? exact : matchInventoryResources(graph, identity).map(node => node.id);
    // Endpoint aliases alone must not choose between multiple retained requests.
    if (!exact.length && matches.length !== 1) return [];
    const result = new Map<string, ServiceOrigin>();
    for (const start of matches) {
      const own = identities.get(start)?.key;
      const queue = [{id:start, inferred:false, edges:[] as string[], path:new Set([start])}];
      let visited = 0;
      while (queue.length && visited++ < 256) {
        const current = queue.shift()!;
        if (current.edges.length >= 12) continue;
        for (const edge of incoming.get(current.id) ?? []) {
          if (current.path.has(edge.from)) continue;
          const inferred = current.inferred || edge.directness === "inferred";
          const edgeIds = [...current.edges, edge.id];
          const parent = identities.get(edge.from);
          if (parent && parent.key !== own) {
            const prior = result.get(parent.key);
            if (!prior || (prior.inferred && !inferred)) result.set(parent.key, {...parent, inferred, nodeId:edge.from, edgeIds});
          } else queue.push({id:edge.from, inferred, edges:edgeIds, path:new Set([...current.path, edge.from])});
        }
      }
    }
    // Membership edges describe context, not causation. Site attribution requires
    // an actual loading chain from every matched node to the exact page document.
    const loading = new Set(["parser_loaded", "initiated_by", "async_ancestor", "loaded_resource"]);
    const normalize = (url?: string) => { try { const value = new URL(url!); value.hash = ""; return value.href; } catch { return undefined; } };
    const target = normalize(pageUrl);
    const siteDocuments = graph.nodes.filter(node => target && node.kind === "document" && normalize(node.url) === target);
    if (siteDocuments.length === 1 && matches.length && exact.length === (identity.nodeRefs ?? []).length) {
      const document = siteDocuments[0]!;
      const frames = graph.edges.filter(edge => edge.to === document.id && edge.relation === "belongs_to_frame").map(edge => edge.from);
      const nested = frames.some(frame => graph.edges.some(edge => edge.to === frame && edge.relation === "frame_parent"));
      const proofs: string[][] = [];
      for (const start of matches) {
        const own = identities.get(start)?.key;
        const queue = [{id:start, path:[] as string[], visited:new Set([start])}];
        let budget = 256;
        let proof: string[] | undefined;
        while (!nested && queue.length && budget-- > 0) {
          const current = queue.shift()!;
          if (current.path.length >= 12) continue;
          for (const edge of incoming.get(current.id) ?? []) {
            if (!loading.has(edge.relation) || edge.directness !== "direct" || current.visited.has(edge.from)) continue;
            const path = [...current.path, edge.id];
            if (edge.from === document.id) { proof = path; break; }
            const parent = identities.get(edge.from);
            if (!parent || parent.key === own) queue.push({id:edge.from, path, visited:new Set([...current.visited,edge.from])});
          }
          if (proof) break;
        }
        if (proof) proofs.push(proof);
      }
      if (proofs.length === matches.length) result.set("site:document", {kind:"site",key:"site:document",name:"Site document",inferred:false,nodeId:document.id,edgeIds:[...new Set(proofs.flat())]});
    }
    return [...result.values()];
  };
}
