import type { ApiRuntimeEvidenceGraph } from "@certscore/api-contracts";

export type GraphNode = ApiRuntimeEvidenceGraph["nodes"][number];
export type GraphEdge = ApiRuntimeEvidenceGraph["edges"][number];
export type EvidenceClass = "Essential" | "Non-essential" | "Contextual" | "Review";
export const SCENARIOS = [
  ["pre_consent", "Pre-consent"], ["post_accept", "After accept"],
  ["post_reject", "After reject"], ["gpc", "GPC enabled"],
] as const;
export const RELATIONS: Record<GraphEdge["relation"], string> = {
  belongs_to_document: "Document context", belongs_to_frame: "Frame context", frame_parent: "Parent frame", worker_request: "Worker request",
  initiated_by: "Initiating script", parser_loaded: "Parser source", async_ancestor: "Asynchronous ancestor", response_to: "Request / response",
  redirected_from: "Redirect", response_cookie_attempt: "HTTP response setter attempt", script_cookie_attempt: "Script setter attempt",
  cookie_included: "Cookie sent", cookie_blocked: "Cookie blocked", snapshot_confirms: "Unique scope/value snapshot match",
  storage_operation: "Storage context", script_storage_operation: "Storage caller", handled_by_service_worker: "Handled by service worker",
  loaded_resource: "Loaded source association",
};
export function humanize(value: string) { return value.replaceAll("_", " "); }
export function observationTime(ms: number) { return `${Number((ms / 1000).toFixed(2))}s`; }
export function nodeDomain(node: GraphNode) {
  if (node.cookie) return node.cookie.domain;
  try { return node.url ? new URL(node.url).hostname : "Endpoint not retained"; } catch { return "Endpoint not retained"; }
}
export function nodeTitle(node: GraphNode) {
  if (node.cookie) return node.cookie.name;
  if (node.kind === "storage") return node.label;
  if (node.classification?.product || node.classification?.vendor) return node.classification.product ?? node.classification.vendor;
  if (node.label !== node.url) return node.label;
  try { const url = new URL(node.url!); return url.pathname === "/" ? url.hostname : url.pathname.split("/").filter(Boolean).at(-1) ?? url.hostname; } catch { return node.label; }
}

/** Already projected inventory information. This is never used to create findings. */
export type InventoryEvidenceContext = {
  vendor: string; purpose: string; classification: EvidenceClass;
  cookieDetails: Array<{ cookieName: string; domain: string | null; cookiePath?: string; partitionContext?: string; evidenceRefs?: string[]; essentiality?: "essential" | "non_essential" | "unknown" }>;
  requestDetails: Array<{ hostname: string | null; path: string | null; method: string | null; essentiality: "non_essential" | "unknown" }>;
};

/** Do not smear pre-consent classifications across sessions, domains, vendors or cookie scopes. */
export function nodeEvidenceClass(node: GraphNode, scenario: ApiRuntimeEvidenceGraph["scenario"], contexts: InventoryEvidenceContext[] = []): EvidenceClass {
  if (scenario !== "pre_consent") return "Review";
  if (node.cookie) {
    // Legacy cookies lack exact host-only/partition identity; require a direct evidence-ID binding.
    const matches = contexts.flatMap(row => row.cookieDetails).filter(cookie => cookie.evidenceRefs?.includes(node.id) &&
      cookie.cookieName === node.cookie!.name && cookie.domain === node.cookie!.domain && cookie.cookiePath === node.cookie!.path);
    if (!matches.length) return "Review";
    const classes = new Set(matches.map(cookie => cookie.essentiality));
    return classes.size === 1 && classes.has("non_essential") ? "Non-essential" : classes.size === 1 && classes.has("essential") ? "Essential" : "Review";
  }
  if (node.kind !== "request" || !node.url || !node.method) return "Review";
  const url = new URL(node.url);
  const matches = contexts.flatMap(row => row.requestDetails).filter(request => request.hostname === url.hostname && request.path === url.pathname && request.method === node.method);
  return matches.length > 0 && matches.every(request => request.essentiality === "non_essential") ? "Non-essential" : "Review";
}

/** A spanning display tree only. Secondary links remain in the inspector; cycles never hide nodes. */
export function buildRelationshipForest(graph: ApiRuntimeEvidenceGraph) {
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const incoming = new Map<string, GraphEdge[]>();
  const outgoing = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges) {
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge]);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
  }
  const parent = new Map<string, GraphEdge>();
  const contextRelations = new Set<GraphEdge["relation"]>(["belongs_to_document", "belongs_to_frame", "storage_operation"]);
  const ordered = [...graph.nodes].sort((a, b) => a.observedAtMs - b.observedAtMs || a.id.localeCompare(b.id));
  for (const node of ordered) {
    const candidates = [...(incoming.get(node.id) ?? [])].sort((a, b) => Number(contextRelations.has(a.relation)) - Number(contextRelations.has(b.relation)) || Number(a.directness === "inferred") - Number(b.directness === "inferred") || a.id.localeCompare(b.id));
    for (const edge of candidates) {
      if (!byId.has(edge.from) || edge.from === node.id) continue;
      const seen = new Set([node.id]); let cursor: string | undefined = edge.from;
      while (cursor && !seen.has(cursor)) { seen.add(cursor); cursor = parent.get(cursor)?.from; }
      if (cursor) continue;
      parent.set(node.id, edge); break;
    }
  }
  const children = new Map<string, GraphNode[]>();
  const roots: GraphNode[] = [];
  for (const node of ordered) {
    const edge = parent.get(node.id);
    if (edge) children.set(edge.from, [...(children.get(edge.from) ?? []), node]); else roots.push(node);
  }
  return { byId, incoming, outgoing, parent, children, roots, ordered };
}

export type RetainedField = { path: string; label: string; value: string; group: string };
export function friendlyField(path: string) {
  return path.replace(/\[(\d+)\]/g, " · $1").split(".").map(part => part.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ")).join(" › ");
}
/** Walk the public-safe projection, not raw scanner objects. Preserve false, zero, null and empty arrays. */
export function flattenRetainedFields(value: unknown, prefix = ""): RetainedField[] {
  if (value === undefined) return [];
  if (value === null || typeof value !== "object" || Object.keys(value).length === 0) return [{
    path: prefix || "record", label: friendlyField(prefix || "record"),
    value: value === null ? "Not retained (null)" : typeof value === "object" ? JSON.stringify(value) : String(value),
    group: prefix.split(/[.[]/)[0] || "record",
  }];
  return Object.entries(value).flatMap(([key, child]) => flattenRetainedFields(child, Array.isArray(value) ? `${prefix}[${key}]` : prefix ? `${prefix}.${key}` : key));
}
