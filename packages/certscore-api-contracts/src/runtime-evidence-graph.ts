import { z } from "zod";

const id = z.string().min(1).max(160);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().max(240);
const url = z.string().max(600).refine(value => {
  try { const parsed = new URL(value); return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password && !parsed.search && !parsed.hash; } catch { return false; }
});
const node = z.object({
  id, kind: z.enum(["document", "frame", "worker", "script", "resource", "request", "response", "cookie", "storage", "connection"]),
  label: text, url: url.optional(), observedAtMs: z.number().finite().nonnegative(),
  scopeMatchKey: hash.optional(),
  captureBasis: z.enum(["cdp", "instrumented_call", "page_realm_snapshot"]).optional(),
  frameId: id.optional(), documentId: id.optional(), requestId: id.optional(), sessionId: id.optional(),
  redirectHop: z.number().int().nonnegative().optional(), resourceType: z.string().max(50).optional(),
  method: z.string().max(24).optional(), status: z.number().int().min(0).max(999).optional(),
  initiatorType: z.string().max(24).optional(), stackId: id.optional(),
  fromServiceWorker: z.boolean().optional(), fromCache: z.boolean().optional(),
  operation: z.enum(["http_set", "js_set", "cookie_store_set", "snapshot", "setItem", "removeItem", "clear", "database_metadata", "cache_metadata"]).optional(),
  outcome: z.enum(["attempted", "native_call_returned", "native_call_failed", "stored", "blocked", "sent", "unknown"]).optional(),
  storageType: z.enum(["localStorage", "sessionStorage", "indexedDB", "cacheStorage"]).optional(),
  cookie: z.object({ name: text, domain: text, path: text, hostOnly: z.boolean().optional(), identityRedacted: z.boolean().optional(),
    partitionKey: z.object({ topLevelSite: url, hasCrossSiteAncestor: z.boolean().optional() }).strict().optional(), partitionOpaque: z.boolean().optional(),
  }).strict().optional(),
  cookieAttributes: z.object({
    secure: z.boolean().optional(), httpOnly: z.boolean().optional(), sameSite: z.string().max(24).optional(),
    expires: z.number().finite().optional(), maxAge: z.number().finite().optional(), session: z.boolean().optional(),
    priority: z.string().max(24).optional(), sourceScheme: z.string().max(24).optional(), sourcePort: z.number().int().optional(), size: z.number().int().nonnegative().optional(),
  }).strict().optional(),
  valueSize: z.number().int().nonnegative().optional(), messageCount: z.number().int().nonnegative().optional(),
  reasons: z.array(z.string().max(100)).max(12).optional(),
  classification: z.object({ vendor: text, product: text.optional(), entity: text.optional(), purpose: z.string().max(80), confidence: z.number().min(0).max(1), basis: z.literal("canonical_registry"),
    disclosure: z.enum(["mentioned", "not_found_in_reviewed_surfaces", "unknown"]),
    disclosureScope: z.enum(["product", "vendor", "entity"]).optional(),
    policyEvidenceRefs: z.array(z.string().max(500)).max(8),
  }).strict().optional(),
}).strict();
const edge = z.object({
  id, from: id, to: id,
  relation: z.enum(["belongs_to_document", "belongs_to_frame", "frame_parent", "worker_request", "initiated_by", "parser_loaded", "async_ancestor", "response_to", "redirected_from", "response_cookie_attempt", "script_cookie_attempt", "cookie_included", "cookie_blocked", "snapshot_confirms", "storage_operation", "script_storage_operation", "handled_by_service_worker", "loaded_resource"]),
  basis: z.enum(["cdp", "browser_snapshot", "instrumented_call", "unique_scope_time_match"]), directness: z.enum(["direct", "inferred"]),
}).strict();
export const apiRuntimeEvidenceGraphSchema = z.object({
  captureId: id, scenario: z.enum(["pre_consent", "gpc", "post_accept", "post_reject"]), sourceHash: hash,
  startedAt: z.string().datetime(), completedAt: z.string().datetime(),
  action: z.object({ status: z.enum(["unconfirmed", "confirmed"]), registeredAtMs: z.number().finite().nonnegative().optional() }).strict().optional(),
  nodes: z.array(node).max(1000), edges: z.array(edge).max(2000),
  stacks: z.array(z.object({ id, frames: z.array(z.object({ url: url.optional(), scriptId: id.optional(), line: z.number().int().nonnegative().optional(), column: z.number().int().nonnegative().optional(), async: z.boolean() }).strict()).max(12), truncated: z.boolean() }).strict()).max(128),
  coverage: z.object({
    status: z.enum(["complete", "partial", "unavailable"]),
    capabilities: z.array(z.object({ name: z.string().max(64), status: z.enum(["observed", "supported", "partial", "unavailable"]) }).strict()).max(16),
    reasons: z.array(z.string().max(100)).max(32), droppedNodes: z.number().int().nonnegative(), droppedEdges: z.number().int().nonnegative(), unresolvedRequests: z.number().int().nonnegative(), pendingTasks: z.number().int().nonnegative(),
  }).strict(),
}).strict().superRefine((graph, context) => {
  const ids = new Set(graph.nodes.map(node => node.id));
  if (ids.size !== graph.nodes.length || graph.edges.some(edge => !ids.has(edge.from) || !ids.has(edge.to))) context.addIssue({ code: "custom", message: "Public graph must preserve complete endpoint identity" });
});
export const apiRuntimeEvidenceGraphProjectionSchema = z.object({
  contractVersion: z.literal("certscore.runtime-evidence-graph-projection.v1"), scanId: id,
  status: z.enum(["available", "limited", "unavailable"]),
  sourceBundle: z.object({ sha256: hash, sizeBytes: z.number().int().positive(), verified: z.literal(true) }).strict().optional(),
  registryVersion: z.string().max(600), graphs: z.array(apiRuntimeEvidenceGraphSchema).max(4),
  details: z.object({ href: z.string().regex(/^\/api\/scans\/[a-f0-9-]{36}\/runtime-evidence-graph$/i), sha256: hash, scenarioCount: z.number().int().min(1).max(4), nodeCount: z.number().int().nonnegative().max(4000), edgeCount: z.number().int().nonnegative().max(8000) }).strict().optional(),
  limitations: z.array(z.string().max(120)).max(16),
  findingOrScoreEffect: z.literal(false),
}).strict().superRefine((projection, context) => {
  if (projection.graphs.length && !projection.sourceBundle) context.addIssue({ code: "custom", message: "Graphs require verified retained provenance" });
  if (projection.details && (projection.graphs.length || !projection.sourceBundle || projection.details.href !== `/api/scans/${projection.scanId}/runtime-evidence-graph`)) context.addIssue({ code: "custom", message: "Deferred graph details must retain scan-bound provenance without duplicate inline graphs" });
  if (new TextEncoder().encode(JSON.stringify(projection)).byteLength > 768 * 1024) context.addIssue({ code: "custom", message: "Public graph projection exceeds budget" });
});
export type ApiRuntimeEvidenceGraphProjection = z.infer<typeof apiRuntimeEvidenceGraphProjectionSchema>;
export type ApiRuntimeEvidenceGraph = z.infer<typeof apiRuntimeEvidenceGraphSchema>;
