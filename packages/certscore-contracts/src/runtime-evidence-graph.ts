import { z } from "zod";

export const RUNTIME_EVIDENCE_GRAPH_VERSION = "certscore.runtime-evidence-graph.v1";
export const RUNTIME_EVIDENCE_GRAPH_LIMITS = Object.freeze({
  nodes: 1_000, edges: 2_000, stacks: 128, stackFrames: 12, bytes: 128 * 1024,
  graphs: 4, reasons: 32, probeEvents: 200,
});
export const runtimeEvidenceGraphModeSchema = z.enum(["off", "capture_only", "project"]);
export type RuntimeEvidenceGraphMode = z.infer<typeof runtimeEvidenceGraphModeSchema>;
export const runtimeGraphDispatchSchema = z.object({
  contractVersion: z.literal("certscore.runtime-graph-dispatch.v1"),
  scanId: z.string().min(1).max(160), mode: z.enum(["capture_only", "project"]),
  profile: z.literal("bounded_passive_v1"),
}).strict();
export type RuntimeGraphDispatch = z.infer<typeof runtimeGraphDispatchSchema>;

export const runtimeGraphSelectionSchema = z.object({
  contractVersion: z.literal("certscore.runtime-graph-selection.v1"),
  scanId: z.string().min(1).max(160), dispatch: runtimeGraphDispatchSchema.nullable(),
}).strict();

/** Read only a server-persisted scan-row decision, never a client override.
 * Missing/invalid historical decisions stay disabled; publisher env is irrelevant.
 */
export function readPersistedRuntimeGraphDispatch(scanId: string, intent: Record<string, unknown>): RuntimeGraphDispatch | undefined {
  if (intent.orchestrationMode !== "sharded") return undefined;
  const parsed = runtimeGraphSelectionSchema.safeParse(intent.runtimeGraphSelection);
  return parsed.success && parsed.data.scanId === scanId && parsed.data.dispatch?.scanId === scanId ? parsed.data.dispatch : undefined;
}

/** Server-owned rollout only. Never pass an HTTP request's config/debug object as the environment. */
export function selectRuntimeGraphDispatch(scanId: string, environment: Record<string, string | undefined>, targetUrl?: string): RuntimeGraphDispatch | undefined {
  const mode = environment.CERTSCORE_RUNTIME_GRAPH_MODE;
  if (mode !== "capture_only" && mode !== "project") return undefined;
  const percentage = Number(environment.CERTSCORE_RUNTIME_GRAPH_PERCENT ?? "0");
  if (![0, 5, 25, 100].includes(percentage)) return undefined;
  const canaries = (environment.CERTSCORE_RUNTIME_GRAPH_CANARY_SCAN_IDS ?? "").split(",").map(value => value.trim()).filter(Boolean).slice(0, 240);
  // Exact deployment-controlled targets make owned canaries selectable before
  // a scan UUID exists. This grants no scan-creation or consent-action authority.
  let canaryTarget = false;
  try {
    const targets: unknown = JSON.parse(environment.CERTSCORE_RUNTIME_GRAPH_CANARY_TARGET_URLS ?? "[]");
    canaryTarget = Array.isArray(targets) && targets.length <= 20 && typeof targetUrl === "string" && targets.includes(targetUrl);
  } catch { /* Malformed optional canary configuration enables no target. */ }
  let hash = 2166136261;
  for (const char of `runtime-graph-v1:${scanId}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  if (!canaryTarget && !canaries.includes(scanId) && hash % 10_000 >= percentage * 100) return undefined;
  const result = runtimeGraphDispatchSchema.safeParse({ contractVersion: "certscore.runtime-graph-dispatch.v1", scanId, mode, profile: "bounded_passive_v1" });
  return result.success ? result.data : undefined;
}
export const runtimeEvidenceGraphScenarioSchema = z.enum(["pre_consent", "gpc", "post_accept", "post_reject"]);
export const runtimeGraphVerificationDiagnosticSchema = z.object({
  scenario: runtimeEvidenceGraphScenarioSchema,
  reason: z.enum(["unavailable", "ambiguous", "malformed", "unsupported_version", "identity_mismatch", "hash_mismatch", "capture_identity_mismatch", "unexpected_capture"]),
}).strict();
export type RuntimeGraphVerificationDiagnostic = z.infer<typeof runtimeGraphVerificationDiagnosticSchema>;
const id = z.string().min(1).max(160);
const text = z.string().max(240);
const safeUrl = z.string().max(600).refine((value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}, "Graph URLs must be bounded HTTP(S) URLs without credentials, query, or fragment");

export const runtimeGraphCookieScopeSchema = z.object({
  name: text, domain: text, path: text, hostOnly: z.boolean().optional(),
  identityRedacted: z.boolean().optional(),
  partitionKey: z.object({ topLevelSite: safeUrl, hasCrossSiteAncestor: z.boolean().optional() }).strict().optional(),
  partitionOpaque: z.boolean().optional(),
}).strict();

export const runtimeGraphNodeSchema = z.object({
  id,
  kind: z.enum(["document", "frame", "worker", "script", "resource", "request", "response", "cookie", "storage", "connection"]),
  observedAtMs: z.number().finite().nonnegative(),
  captureBasis: z.enum(["cdp", "instrumented_call", "page_realm_snapshot"]).optional(),
  url: safeUrl.optional(), hostname: text.optional(), name: text.optional(),
  sessionId: id.optional(), requestId: id.optional(), redirectHop: z.number().int().nonnegative().optional(),
  frameId: id.optional(), documentId: id.optional(),
  resourceType: z.string().max(50).optional(), method: z.string().max(24).optional(),
  initiatorType: z.enum(["parser", "script", "preload", "SignedExchange", "preflight", "FedCM", "other"]).optional(),
  stackId: id.optional(), status: z.number().int().min(0).max(999).optional(),
  fromServiceWorker: z.boolean().optional(), fromCache: z.boolean().optional(),
  cookie: runtimeGraphCookieScopeSchema.optional(),
  cookieAttributes: z.object({
    secure: z.boolean().optional(), httpOnly: z.boolean().optional(), sameSite: z.string().max(24).optional(),
    expires: z.number().finite().optional(), maxAge: z.number().finite().optional(),
    session: z.boolean().optional(), priority: z.string().max(24).optional(),
    sourceScheme: z.string().max(24).optional(), sourcePort: z.number().int().optional(), size: z.number().int().nonnegative().optional(),
  }).strict().optional(),
  operation: z.enum(["http_set", "js_set", "cookie_store_set", "snapshot", "setItem", "removeItem", "clear", "database_metadata", "cache_metadata"]).optional(),
  outcome: z.enum(["attempted", "native_call_returned", "native_call_failed", "stored", "blocked", "sent", "unknown"]).optional(),
  reasons: z.array(z.string().max(100)).max(12).optional(),
  storageType: z.enum(["localStorage", "sessionStorage", "indexedDB", "cacheStorage"]).optional(),
  valueSize: z.number().int().nonnegative().optional(), valueHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  messageCount: z.number().int().nonnegative().optional(), bytes: z.number().int().nonnegative().optional(),
}).strict();

export const runtimeGraphRelationSchema = z.enum([
  "belongs_to_document", "belongs_to_frame", "frame_parent", "worker_request", "initiated_by",
  "parser_loaded", "async_ancestor", "response_to", "redirected_from", "response_cookie_attempt",
  "script_cookie_attempt", "cookie_included", "cookie_blocked", "snapshot_confirms",
  "storage_operation", "script_storage_operation", "handled_by_service_worker", "loaded_resource",
]);
const edgeSchema = z.object({
  id, from: id, to: id, relation: runtimeGraphRelationSchema,
  basis: z.enum(["cdp", "browser_snapshot", "instrumented_call", "unique_scope_time_match"]),
  directness: z.enum(["direct", "inferred"]),
}).strict();
const stackSchema = z.object({
  id, frames: z.array(z.object({
    url: safeUrl.optional(), scriptId: id.optional(), line: z.number().int().nonnegative().optional(),
    column: z.number().int().nonnegative().optional(), async: z.boolean(),
  }).strict()).max(RUNTIME_EVIDENCE_GRAPH_LIMITS.stackFrames), truncated: z.boolean(),
}).strict();

const runtimeEvidenceGraphShape = z.object({
  contractVersion: z.literal(RUNTIME_EVIDENCE_GRAPH_VERSION),
  scanId: id, captureId: id, scenario: runtimeEvidenceGraphScenarioSchema,
  // Action captures include the pre-action interval too. No event is implicitly post-action.
  action: z.object({ status: z.enum(["unconfirmed", "confirmed"]), registeredAtMs: z.number().finite().nonnegative().optional() }).strict().optional(),
  mode: z.enum(["capture_only", "project"]),
  startedAt: z.string().datetime(), completedAt: z.string().datetime(),
  browserVersion: z.string().max(100),
  nodes: z.array(runtimeGraphNodeSchema).max(RUNTIME_EVIDENCE_GRAPH_LIMITS.nodes),
  edges: z.array(edgeSchema).max(RUNTIME_EVIDENCE_GRAPH_LIMITS.edges),
  stacks: z.array(stackSchema).max(RUNTIME_EVIDENCE_GRAPH_LIMITS.stacks),
  coverage: z.object({
    status: z.enum(["complete", "partial", "unavailable"]),
    capabilities: z.array(z.object({ name: z.string().max(64), status: z.enum(["observed", "supported", "partial", "unavailable"]) }).strict()).max(16),
    reasons: z.array(z.string().max(100)).max(RUNTIME_EVIDENCE_GRAPH_LIMITS.reasons),
    droppedNodes: z.number().int().nonnegative(), droppedEdges: z.number().int().nonnegative(),
    unresolvedRequests: z.number().int().nonnegative(), pendingTasks: z.number().int().nonnegative(),
  }).strict(),
  timing: z.object({ setupMs: z.number().nonnegative(), finalizeMs: z.number().nonnegative() }).strict(),
  valuesRedacted: z.literal(true), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type RuntimeEvidenceGraph = z.infer<typeof runtimeEvidenceGraphShape>;
export const runtimeEvidenceGraphSchema: z.ZodType<RuntimeEvidenceGraph> = runtimeEvidenceGraphShape.superRefine((graph, context) => {
  const fail = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  if (nodes.size !== graph.nodes.length) fail("Duplicate graph node identity");
  if (new Set(graph.edges.map((edge) => edge.id)).size !== graph.edges.length) fail("Duplicate graph edge identity");
  const stacks = new Set(graph.stacks.map((stack) => stack.id));
  if (stacks.size !== graph.stacks.length) fail("Duplicate stack identity");
  for (const node of graph.nodes) if (node.stackId && !stacks.has(node.stackId)) fail("Dangling stack reference");
  for (const edge of graph.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to) || edge.from === edge.to) fail("Invalid graph edge endpoints");
    if (edge.relation === "response_cookie_attempt" &&
      (nodes.get(edge.from)?.kind !== "response" || nodes.get(edge.to)?.kind !== "cookie")) fail("HTTP cookie setter must be a response");
    if (edge.relation === "script_cookie_attempt" &&
      (nodes.get(edge.from)?.kind !== "script" || nodes.get(edge.to)?.kind !== "cookie")) fail("JS cookie setter must be a script");
  }
  const actionScenario = graph.scenario === "post_accept" || graph.scenario === "post_reject";
  if (actionScenario !== Boolean(graph.action)) fail("Action scenario must retain its registration status");
  if (graph.action && ((graph.action.status === "confirmed") !== (graph.action.registeredAtMs !== undefined))) fail("Confirmed action requires its registration anchor");
  if (graph.coverage.status === "complete" && (graph.coverage.reasons.length || graph.coverage.droppedNodes || graph.coverage.droppedEdges || graph.coverage.unresolvedRequests || graph.coverage.pendingTasks)) fail("Incomplete capture cannot claim complete coverage");
  if (Date.parse(graph.completedAt) < Date.parse(graph.startedAt)) fail("Invalid graph time interval");
  if (new TextEncoder().encode(JSON.stringify(graph)).byteLength > RUNTIME_EVIDENCE_GRAPH_LIMITS.bytes) fail("Graph exceeds byte limit");
});

/** An optional inventory extension must not invalidate independent legacy evidence.
 * Reject a whole ambiguous scenario (including valid + malformed duplicates), not
 * merely the malformed row. Never change the strict standalone graph validator.
 * These diagnostics describe discarded input, not observations or findings.
 */
export function withRuntimeGraphCompatibility<S extends z.ZodTypeAny>(schema: S, scenario?: RuntimeEvidenceGraph["scenario"]): z.ZodType<z.output<S>, z.ZodTypeDef, z.input<S>> {
  return z.preprocess(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const source = value as Record<string, unknown>;
    const key = scenario ? "runtimeEvidenceGraph" : "runtimeEvidenceGraphs";
    if (source[key] === undefined && source.runtimeEvidenceGraphDiagnostics === undefined) return value;
    const result = { ...source };
    delete result[key];
    const diagnostics = new Map<RuntimeEvidenceGraph["scenario"], RuntimeGraphVerificationDiagnostic>();
    const scenarios = scenario ? [scenario] : runtimeEvidenceGraphScenarioSchema.options;
    const fail = (reason: RuntimeGraphVerificationDiagnostic["reason"], scope = scenarios) => {
      for (const item of scope) diagnostics.set(item, { scenario: item, reason });
    };
    if (source.runtimeEvidenceGraphDiagnostics !== undefined) {
      const retained = z.array(runtimeGraphVerificationDiagnosticSchema).max(scenario ? 1 : 4).safeParse(source.runtimeEvidenceGraphDiagnostics);
      if (retained.success) for (const row of retained.data) {
        if (scenarios.includes(row.scenario)) diagnostics.set(row.scenario, row);
        else fail("malformed");
      }
      else fail("malformed");
    }
    const candidates = source[key] === undefined ? [] : scenario ? [source[key]] : source[key];
    const graphs: RuntimeEvidenceGraph[] = [];
    if (!Array.isArray(candidates) || candidates.length > RUNTIME_EVIDENCE_GRAPH_LIMITS.graphs) fail("malformed");
    else {
      const grouped = new Map<RuntimeEvidenceGraph["scenario"], unknown[]>();
      for (const candidate of candidates) {
        const parsedScenario = runtimeEvidenceGraphScenarioSchema.safeParse(candidate && typeof candidate === "object" ? (candidate as Record<string, unknown>).scenario : undefined);
        if (!parsedScenario.success) { fail("malformed"); continue; }
        if (scenario && parsedScenario.data !== scenario) { fail("identity_mismatch"); continue; }
        grouped.set(parsedScenario.data, [...(grouped.get(parsedScenario.data) ?? []), candidate]);
      }
      for (const [item, rows] of grouped) {
        if (rows.length !== 1) { fail("ambiguous", [item]); continue; }
        const parsed = runtimeEvidenceGraphSchema.safeParse(rows[0]);
        if (!parsed.success) {
          const version = (rows[0] as Record<string, unknown>).contractVersion;
          fail(typeof version === "string" && version !== RUNTIME_EVIDENCE_GRAPH_VERSION ? "unsupported_version" : "malformed", [item]);
        } else graphs.push(parsed.data);
      }
    }
    const eligible = graphs.filter(graph => !diagnostics.has(graph.scenario));
    if (eligible.length) result[key] = scenario ? eligible[0] : eligible;
    if (diagnostics.size) result.runtimeEvidenceGraphDiagnostics = [...diagnostics.values()];
    else delete result.runtimeEvidenceGraphDiagnostics;
    return result;
  }, schema) as z.ZodType<z.output<S>, z.ZodTypeDef, z.input<S>>;
}

export type RuntimeGraphNode = z.infer<typeof runtimeGraphNodeSchema>;
export type RuntimeGraphEdge = z.infer<typeof edgeSchema>;
export type RuntimeGraphStack = z.infer<typeof stackSchema>;
export type RuntimeGraphCookieScope = z.infer<typeof runtimeGraphCookieScopeSchema>;

/** Strip query/fragment and redact identifier-like path segments before retention. */
export function sanitizeRuntimeGraphUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    const path = url.pathname.split("/").map((part) => {
      let decoded: string;
      try { decoded = decodeURIComponent(part); } catch { return "_redacted_"; }
      return /@|[\u0000-\u001f]|\d{6,}/.test(decoded) || decoded.length > 80 ||
        /^[a-f0-9-]{24,}$/i.test(decoded) ? "_redacted_" : part;
    }).join("/");
    return `${url.origin}${path}`.slice(0, 600);
  } catch { return undefined; }
}

export function sanitizeRuntimeGraphName(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  try {
    const decoded = decodeURIComponent(value);
    if (decoded !== value && /@|[\u0000-\u001f\u007f]|\d{6,}|[a-f0-9-]{24,}/i.test(decoded)) return "_redacted_";
  } catch { return "_redacted_"; }
  return value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[^\s/;]*@[^\s/;]*/g, "_redacted_")
    .replace(/[a-f0-9-]{24,}|\d{6,}|[A-Za-z0-9_+=-]{80,}/gi, "_redacted_").slice(0, 240);
}

/** Fixed ordering for scanner hashing and server verification; excludes only the digest. */
export function runtimeGraphHashInput(graph: RuntimeEvidenceGraph): string {
  const { sourceHash: _sourceHash, ...unsigned } = runtimeEvidenceGraphSchema.parse(graph);
  return JSON.stringify(unsigned);
}

export function verifyRuntimeEvidenceGraph(value: unknown, expected: {
  scanId: string; scenario: RuntimeEvidenceGraph["scenario"]; mode?: RuntimeEvidenceGraph["mode"];
  sha256: (canonicalInput: string) => string;
}): { graph?: RuntimeEvidenceGraph; reason?: "unavailable" | "malformed" | "identity_mismatch" | "hash_mismatch" } {
  if (value === undefined) return { reason: "unavailable" };
  const parsed = runtimeEvidenceGraphSchema.safeParse(value);
  if (!parsed.success) return { reason: "malformed" };
  const graph = parsed.data;
  if (graph.scanId !== expected.scanId || graph.scenario !== expected.scenario || (expected.mode && graph.mode !== expected.mode)) return { reason: "identity_mismatch" };
  if (expected.sha256(runtimeGraphHashInput(graph)) !== graph.sourceHash) return { reason: "hash_mismatch" };
  return { graph };
}
