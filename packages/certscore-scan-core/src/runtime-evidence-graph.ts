import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  RUNTIME_EVIDENCE_GRAPH_LIMITS as LIMITS, RUNTIME_EVIDENCE_GRAPH_VERSION,
  runtimeEvidenceGraphSchema, runtimeGraphHashInput, sanitizeRuntimeGraphName as safeName,
  sanitizeRuntimeGraphUrl as safeUrl,
  type RuntimeEvidenceGraph, type RuntimeGraphNode, type RuntimeGraphEdge, type RuntimeGraphStack,
} from "@certscore/contracts";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const string = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
export const graphIdentity = (...parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);

type RequestState = {
  id: string; responseId?: string; url: string; frameId?: string; documentId?: string;
  extraExpected?: boolean; responseExtra?: RecordValue; requestExtra?: RecordValue;
  headerAttempts: HeaderAttempt[]; hasInitiator: boolean;
};
type HeaderAttempt = { line: string; hash: string; valueHash?: string };
type RequestChain = { hops: RequestState[]; requestExtras: RecordValue[]; responseExtras: RecordValue[] };
type GraphCaptureIdentity = {
  scanId: string; captureId: string; scenario: RuntimeEvidenceGraph["scenario"];
  mode: RuntimeEvidenceGraph["mode"]; startedAt: string; browserVersion: string;
};

/** Pure bounded event correlator. Browser IDs are scoped to a protocol target/session. */
export class RuntimeEvidenceGraphBuilder {
  private readonly nodes = new Map<string, RuntimeGraphNode>();
  private readonly edges = new Map<string, RuntimeGraphEdge>();
  private readonly stacks = new Map<string, RuntimeGraphStack>();
  private readonly chains = new Map<string, RequestChain>();
  private readonly contexts = new Map<string, { frameId?: string; documentId?: string }>();
  private readonly documents = new Map<string, string>();
  private readonly reasons = new Set<string>();
  private readonly capabilities = new Map<string, RuntimeEvidenceGraph["coverage"]["capabilities"][number]["status"]>();
  private readonly valueKey = randomBytes(32);
  private readonly workers = new Map<string, string>();
  private readonly sourceCandidates: Array<{ nodeId: string; url: string; documentId: string; at: number }> = [];
  private droppedNodes = 0;
  private droppedEdges = 0;
  private frozen = false;
  private sequence = 0;
  private bytes = 0;
  private firstTimestamp?: number;
  private clockOffsetMs?: number;
  private final?: RuntimeEvidenceGraph;
  private action?: RuntimeEvidenceGraph["action"];

  readonly input: Readonly<GraphCaptureIdentity>;

  constructor(input: GraphCaptureIdentity) {
    // TypeScript structural types do not remove transport fields at runtime.
    // Copy only graph-owned identity, never dispatch contractVersion/profile or caller extras.
    this.input = Object.freeze({ scanId: input.scanId, captureId: input.captureId,
      scenario: input.scenario, mode: input.mode, startedAt: input.startedAt, browserVersion: input.browserVersion });
    if (input.scenario === "post_accept" || input.scenario === "post_reject") this.action = { status: "unconfirmed" };
  }

  confirmAction(registeredAt: number) {
    if (!this.frozen && this.action && Number.isFinite(registeredAt) && registeredAt >= Date.parse(this.input.startedAt))
      this.action = { status: "confirmed", registeredAtMs: registeredAt - Date.parse(this.input.startedAt) };
  }

  target(session: string, type: string, url: string) {
    if (this.frozen) return;
    if (type.includes("worker")) {
      const id = this.add({ id: graphIdentity(session, "worker"), kind: "worker", sessionId: session, observedAtMs: this.time(), url: safeUrl(url), resourceType: type.slice(0, 50) });
      if (id) this.workers.set(session, id);
    }
  }

  capability(name: string, status: RuntimeEvidenceGraph["coverage"]["capabilities"][number]["status"]) {
    if (!this.frozen && (this.capabilities.has(name) || this.capabilities.size < 16)) this.capabilities.set(name, status);
  }

  limit(reason: string) { if (!this.frozen && this.reasons.size < LIMITS.reasons) this.reasons.add(reason.slice(0, 100)); }

  private time(value?: unknown): number {
    const timestamp = number(value);
    if (timestamp !== undefined) {
      this.firstTimestamp ??= timestamp;
      if (this.clockOffsetMs !== undefined) return Math.max(0, Math.round(timestamp * 1000 + this.clockOffsetMs));
      return Math.max(0, Math.round((timestamp - this.firstTimestamp) * 1_000));
    }
    return Math.max(0, Date.now() - Date.parse(this.input.startedAt));
  }

  private add(node: RuntimeGraphNode): string | undefined {
    if (this.frozen) return undefined;
    const old = this.nodes.get(node.id);
    const next = old ? { ...old, ...node } : node;
    const delta = Buffer.byteLength(JSON.stringify(next)) - (old ? Buffer.byteLength(JSON.stringify(old)) : 0);
    if ((!old && this.nodes.size >= LIMITS.nodes) || this.bytes + delta > LIMITS.bytes - 12_000) {
      this.droppedNodes += 1; this.limit("graph_node_or_byte_limit"); return undefined;
    }
    this.bytes += delta;
    this.nodes.set(node.id, next);
    return node.id;
  }

  private link(from: string | undefined, to: string | undefined, relation: RuntimeGraphEdge["relation"], basis: RuntimeGraphEdge["basis"] = "cdp", directness: RuntimeGraphEdge["directness"] = "direct") {
    if (this.frozen || !from || !to || from === to) return;
    if (!this.nodes.has(from) || !this.nodes.has(to)) { this.droppedEdges += 1; return; }
    const edge = { id: graphIdentity(from, to, relation), from, to, relation, basis, directness };
    if (this.edges.has(edge.id)) return;
    const bytes = Buffer.byteLength(JSON.stringify(edge));
    if (this.edges.size >= LIMITS.edges || this.bytes + bytes > LIMITS.bytes - 12_000) {
      this.droppedEdges += 1; this.limit("graph_edge_or_byte_limit"); return;
    }
    this.bytes += bytes; this.edges.set(edge.id, edge);
  }

  private frame(session: string, frameId: string, loaderId?: string, url?: string, parentId?: string) {
    const id = this.add({ id: graphIdentity(session, "frame", frameId), kind: "frame", sessionId: session, frameId, observedAtMs: this.time(), url: safeUrl(url) });
    if (parentId) this.link(this.frame(session, parentId).id, id, "frame_parent");
    let documentId = this.documents.get(`${session}:${frameId}`);
    if (loaderId) {
      documentId = graphIdentity(session, "document", frameId, loaderId);
      this.add({ id: documentId, kind: "document", sessionId: session, frameId, documentId: loaderId, observedAtMs: this.time(), url: safeUrl(url) });
      this.documents.set(`${session}:${frameId}`, documentId);
      this.link(id, documentId, "belongs_to_frame");
    }
    return { id, documentId };
  }

  private stack(session: string, initiator: RecordValue, at: number) {
    const frames: RuntimeGraphStack["frames"] = [];
    let stack = record(initiator.stack);
    let depth = 0;
    let directScript: string | undefined;
    let truncated = false;
    while (Object.keys(stack).length && depth < 4) {
      for (const raw of (Array.isArray(stack.callFrames) ? stack.callFrames : [])) {
        if (frames.length >= LIMITS.stackFrames) { truncated = true; break; }
        const call = record(raw);
        const url = safeUrl(call.url);
        const scriptId = string(call.scriptId).slice(0, 160) || undefined;
        frames.push({ url, scriptId, line: nonnegativeInteger(call.lineNumber), column: nonnegativeInteger(call.columnNumber), async: depth > 0 });
        if (!directScript && depth === 0 && frames.length === 1 && (scriptId || url)) {
          directScript = this.add({ id: graphIdentity(session, "script", scriptId || url), kind: "script", sessionId: session, observedAtMs: at, url, name: url ? undefined : "Inline or dynamic script" });
        }
      }
      if (stack.parentId) { truncated = true; this.limit("async_stack_reference_not_expanded"); }
      stack = record(stack.parent); depth += 1;
    }
    if (Object.keys(stack).length) truncated = true;
    if (!frames.length) return { directScript };
    const id = graphIdentity(session, frames);
    if (!this.stacks.has(id)) {
      const value = { id, frames, truncated };
      const size = Buffer.byteLength(JSON.stringify(value));
      if (this.stacks.size >= LIMITS.stacks || this.bytes + size > LIMITS.bytes - 12_000) {
        this.limit("stack_limit"); return { directScript };
      }
      this.bytes += size; this.stacks.set(id, value);
    }
    return { directScript, stackId: id };
  }

  handle(session: string, method: string, raw: unknown) {
    if (this.frozen) return;
    const event = record(raw);
    if (number(event.wallTime) !== undefined && number(event.timestamp) !== undefined) {
      this.clockOffsetMs ??= Number(event.wallTime) * 1000 - Number(event.timestamp) * 1000 - Date.parse(this.input.startedAt);
    }
    const at = this.time(event.timestamp);
    if (method === "Page.frameNavigated") {
      const frame = record(event.frame);
      if (frame.id) this.frame(session, string(frame.id), string(frame.loaderId), string(frame.url), string(frame.parentId));
      return;
    }
    if (method === "Runtime.executionContextCreated") {
      const context = record(event.context); const aux = record(context.auxData);
      if (aux.isDefault === true && aux.frameId && this.contexts.size < LIMITS.nodes) {
        const frameId = string(aux.frameId);
        this.contexts.set(`${session}:${context.id}`, { frameId, documentId: this.documents.get(`${session}:${frameId}`) });
      }
      return;
    }
    if (method === "Runtime.executionContextDestroyed") { this.contexts.delete(`${session}:${event.executionContextId}`); return; }
    if (method === "Runtime.executionContextsCleared") {
      for (const key of this.contexts.keys()) if (key.startsWith(`${session}:`)) this.contexts.delete(key);
      return;
    }
    if (method === "Network.webSocketCreated" || method === "Network.webTransportCreated") {
      const requestId = string(event.requestId || event.transportId);
      const trace = this.stack(session, record(event.initiator), at);
      const node = this.add({ id: graphIdentity(session, "connection", requestId), kind: "connection", sessionId: session, requestId, observedAtMs: at, url: safeUrl(string(event.url).replace(/^wss:/, "https:").replace(/^ws:/, "http:")), resourceType: method.includes("webSocket") ? "WebSocket" : "WebTransport", stackId: trace.stackId, messageCount: 0 });
      this.link(trace.directScript, node, "initiated_by"); return;
    }
    if (method === "Network.webSocketFrameSent" || method === "Network.webSocketFrameReceived") {
      const id = graphIdentity(session, "connection", event.requestId);
      const node = this.nodes.get(id);
      if (node) this.add({ ...node, messageCount: (node.messageCount ?? 0) + 1 });
      return; // Payload bytes never enter retained nodes.
    }
    const requestId = string(event.requestId);
    if (!requestId) return;
    const key = `${session}:${requestId}`;
    let chain = this.chains.get(key);
    if (!chain) {
      if (this.chains.size >= LIMITS.nodes) { this.limit("request_correlation_limit"); return; }
      chain = { hops: [], requestExtras: [], responseExtras: [] }; this.chains.set(key, chain);
    }
    if (method === "Network.requestWillBeSentExtraInfo" || method === "Network.responseReceivedExtraInfo") {
      const extras = method === "Network.requestWillBeSentExtraInfo" ? chain.requestExtras : chain.responseExtras;
      // Sanitize before buffering. Never keep cookie values or full headers in the graph.
      if (extras.length < 24) extras.push(this.sanitizeExtra(event, method));
      else this.limit("extra_info_limit");
      return;
    }
    if (method === "Network.requestWillBeSent") {
      if (chain.hops.length >= 24) { this.limit("redirect_hop_limit"); return; }
      const previous = chain.hops.at(-1);
      if (event.redirectResponse && previous) {
        previous.extraExpected = event.redirectHasExtraInfo === true;
        this.response(session, previous, record(event.redirectResponse), at);
      }
      const request = record(event.request);
      const url = string(request.url);
      const frameId = string(event.frameId) || undefined;
      const frame = frameId ? this.frame(session, frameId, string(event.loaderId) || undefined, string(event.documentURL)) : undefined;
      const initiator = record(event.initiator);
      const trace = this.stack(session, initiator, at);
      const validTypes = ["parser", "script", "preload", "SignedExchange", "preflight", "FedCM", "other"];
      const initiatorType = validTypes.includes(string(initiator.type)) ? initiator.type as RuntimeGraphNode["initiatorType"] : "other";
      const nodeId = graphIdentity(session, "request", requestId, chain.hops.length);
      const parserBound = initiatorType === "parser" && Boolean(initiator.url) && string(initiator.url) === string(event.documentURL) && Boolean(frame?.documentId);
      const state: RequestState = { id: nodeId, url, frameId, documentId: frame?.documentId, headerAttempts: [], hasInitiator: Boolean(trace.directScript) || parserBound || Boolean(this.workers.get(session)) || event.type === "Document" };
      chain.hops.push(state);
      const node = this.add({ id: nodeId, kind: "request", sessionId: session, requestId, redirectHop: chain.hops.length - 1, observedAtMs: at, url: safeUrl(url), hostname: hostname(url), frameId, documentId: frame?.documentId, method: string(request.method).slice(0, 24), resourceType: string(event.type).slice(0, 50), initiatorType, stackId: trace.stackId });
      this.link(frame?.documentId, node, "belongs_to_document");
      this.link(trace.directScript, node, "initiated_by");
      this.link(this.workers.get(session), node, "worker_request");
      // A parser source URL may be a stylesheet; do not assert the document loaded it without that proof.
      if (parserBound) this.link(frame?.documentId, node, "parser_loaded");
      else if (initiatorType === "parser" && safeUrl(initiator.url)) {
        const source = this.add({ id: graphIdentity(nodeId, "parser_source"), kind: "resource", observedAtMs: at, url: safeUrl(initiator.url), sessionId: session, frameId, documentId: frame?.documentId, resourceType: "ParserSource" });
        this.link(source, node, "parser_loaded");
        if (source && frame?.documentId && this.sourceCandidates.length < LIMITS.nodes) this.sourceCandidates.push({ nodeId: source, url: string(initiator.url), documentId: frame.documentId, at });
        state.hasInitiator = Boolean(source);
      }
      if (trace.directScript && frame?.documentId && this.sourceCandidates.length < LIMITS.nodes) {
        const calls = record(initiator.stack).callFrames;
        const callerUrl = Array.isArray(calls) ? string(record(calls[0]).url) : "";
        if (callerUrl) this.sourceCandidates.push({ nodeId: trace.directScript, url: callerUrl, documentId: frame.documentId, at });
      }
      if (previous && event.redirectResponse) this.link(previous.id, node, "redirected_from");
      return;
    }
    const state = chain.hops.at(-1);
    if (!state) { this.limit("response_without_request"); return; }
    if (method === "Network.responseReceived") {
      state.extraExpected = typeof event.hasExtraInfo === "boolean" ? event.hasExtraInfo : undefined;
      this.response(session, state, record(event.response), at);
    }
    if (method === "Network.loadingFailed") {
      // CORS failures can still have ExtraInfo without responseReceived. Do not guess redirect ownership.
      const node = this.nodes.get(state.id);
      const blockedReason = string(event.blockedReason).trim();
      // Cancellation, DNS and transport failure do not establish browser blocking.
      if (node) this.add({ ...node, outcome: blockedReason ? "blocked" : "unknown", reasons: [safeName(blockedReason || event.errorText || "request_failed").slice(0, 100)] });
    }
  }

  private response(session: string, state: RequestState, response: RecordValue, at: number) {
    state.responseId = graphIdentity(state.id, "response");
    const node = this.add({ id: state.responseId, kind: "response", sessionId: session, observedAtMs: at, url: safeUrl(response.url || state.url), status: number(response.status), fromCache: response.fromDiskCache === true || response.fromPrefetchCache === true, fromServiceWorker: response.fromServiceWorker === true });
    this.link(state.id, node, "response_to");
    const headers = record(response.headers);
    const header = Object.entries(headers).find(([key]) => key.toLowerCase() === "set-cookie")?.[1];
    for (const line of string(header).split("\n").filter(Boolean).slice(0, 32)) state.headerAttempts.push(this.headerAttempt(line));
  }

  private headerAttempt(line: string): HeaderAttempt {
    const semicolon = line.indexOf(";"); const pair = semicolon < 0 ? line : line.slice(0, semicolon); const eq = pair.indexOf("=");
    // Only approved attributes survive buffering; no raw value, unknown attribute, or plain digest of a value.
    const attributes = semicolon < 0 ? [] : line.slice(semicolon + 1).split(";").flatMap(part => {
      const [rawKey, ...parts] = part.trim().split("="); const key = rawKey?.toLowerCase(); const value = parts.join("=");
      if (key === "expires") { const date = Date.parse(value); return Number.isFinite(date) ? [`expires=${new Date(date).toUTCString()}`] : []; }
      if (key === "max-age") return /^-?\d{1,12}$/.test(value) ? [`max-age=${value}`] : [];
      return key && ["domain", "path", "secure", "httponly", "samesite", "partitioned", "priority"].includes(key) ? [safeName(part.trim())] : [];
    });
    return { line: `${safeName(eq < 0 ? pair : pair.slice(0, eq))}=;${attributes.join(";")}`, hash: createHmac("sha256", this.valueKey).update(line).digest("hex"),
      valueHash: eq < 0 ? undefined : createHmac("sha256", this.valueKey).update(pair.slice(eq + 1)).digest("hex") };
  }

  private sanitizeExtra(event: RecordValue, method: string): RecordValue {
    if (method === "Network.requestWillBeSentExtraInfo") return {
      cookies: (Array.isArray(event.associatedCookies) ? event.associatedCookies : []).slice(0, 96).map((raw) => {
        const row = record(raw); return { cookie: this.browserCookie(record(row.cookie)), blocked: Array.isArray(row.blockedReasons) ? row.blockedReasons.map(safeName).slice(0, 12) : [] };
      }),
    };
    const headers = record(event.headers);
    const header = Object.entries(headers).find(([key]) => key.toLowerCase() === "set-cookie")?.[1];
    const blocked = (Array.isArray(event.blockedCookies) ? event.blockedCookies : []).slice(0, 96).map((raw) => {
      const row = record(raw); return { lineHash: createHmac("sha256", this.valueKey).update(string(row.cookieLine)).digest("hex"), reasons: Array.isArray(row.blockedReasons) ? row.blockedReasons.map(safeName).slice(0, 12) : [] };
    });
    return { lines: string(header).split("\n").filter(Boolean).slice(0, 32).map((line) => this.headerAttempt(line)), blocked, status: number(event.statusCode),
      partitionKey: safePartition(record(event.cookiePartitionKey)), partitionOpaque: event.cookiePartitionKeyOpaque === true };
  }

  private browserCookie(cookie: RecordValue): Pick<RuntimeGraphNode, "cookie" | "cookieAttributes" | "valueHash"> {
    const partition = record(cookie.partitionKey);
    const topLevelSite = safeUrl(partition.topLevelSite);
    const domain = string(cookie.domain).toLowerCase().replace(/^\./, "");
    const name = string(cookie.name); const path = string(cookie.path || "/");
    return {
      cookie: { name: safeName(name), domain: safeName(domain), path: safeName(path), identityRedacted: safeName(name) !== name || safeName(path) !== path || safeName(domain) !== domain,
        // Chromium preserves domain-cookie scope with a leading dot (including in Playwright snapshots).
        ...(domain ? { hostOnly: typeof cookie.hostOnly === "boolean" ? cookie.hostOnly : !string(cookie.domain).startsWith(".") } : {}),
        ...(topLevelSite ? { partitionKey: { topLevelSite, ...(typeof partition.hasCrossSiteAncestor === "boolean" ? { hasCrossSiteAncestor: partition.hasCrossSiteAncestor } : {}) } } : {}),
        ...(cookie.partitionKeyOpaque === true ? { partitionOpaque: true } : {}),
      },
      cookieAttributes: { secure: cookie.secure === true, httpOnly: cookie.httpOnly === true, sameSite: string(cookie.sameSite).slice(0, 24) || undefined, expires: number(cookie.expires), session: typeof cookie.session === "boolean" ? cookie.session : undefined, priority: string(cookie.priority).slice(0, 24) || undefined, sourceScheme: string(cookie.sourceScheme).slice(0, 24) || undefined, sourcePort: number(cookie.sourcePort), size: number(cookie.size) },
      valueHash: typeof cookie.value === "string" ? createHmac("sha256", this.valueKey).update(cookie.value).digest("hex") : undefined,
    };
  }

  snapshot(cookies: unknown[]) {
    if (this.frozen) return;
    this.capability("cookie_snapshot", "observed");
    for (const cookie of cookies.slice(0, LIMITS.probeEvents)) {
      const metadata = this.browserCookie(record(cookie));
      const id = graphIdentity(this.input.captureId, "cookie_snapshot", this.cookieIdentity(record(cookie)));
      this.add({ id, kind: "cookie", captureBasis: "cdp", observedAtMs: this.time(), ...metadata, operation: "snapshot", outcome: "stored" });
    }
    if (cookies.length > LIMITS.probeEvents) this.limit("cookie_snapshot_limit");
  }

  private cookieIdentity(cookie: RecordValue) {
    return createHmac("sha256", this.valueKey).update(JSON.stringify([cookie.name, string(cookie.domain), cookie.hostOnly, cookie.path, cookie.partitionKey, cookie.partitionKeyOpaque])).digest("hex");
  }

  probe(session: string, executionContextId: number, raw: unknown) {
    if (this.frozen) return;
    const row = record(raw); const context = this.contexts.get(`${session}:${executionContextId}`);
    if (!context) { this.limit("probe_context_unresolved"); return; }
    if (++this.sequence > LIMITS.probeEvents * 8) { this.limit("probe_event_limit"); return; }
    const at = this.time();
    const operation = string(row.operation);
    if (operation === "metadata_unavailable") { this.limit("page_intrinsics_modified"); return; }
    if (operation === "stack_unavailable") { this.limit("page_stack_formatter_untrusted"); return; }
    if (operation === "coverage") {
      this.capability("storage_writes", row.installed === true ? "partial" : "unavailable");
      if (typeof row.cookieStoreInstalled === "boolean") this.capability("cookie_store", row.cookieStoreInstalled ? "supported" : "unavailable");
      this.limit("storage_property_writes_not_attributed"); return;
    }
    if (operation === "overflow") { this.limit("page_probe_limit"); return; }
    const storageType = ["localStorage", "sessionStorage", "indexedDB", "cacheStorage"].includes(string(row.storageType)) ? row.storageType as RuntimeGraphNode["storageType"] : undefined;
    const cookieOperation = operation === "js_set" || operation === "cookie_store_set";
    if (!cookieOperation && !["setItem", "removeItem", "clear", "snapshot", "database_metadata", "cache_metadata"].includes(operation)) return;
    const documentUrl = context.documentId ? this.nodes.get(context.documentId)?.url : undefined;
    const scope = cookieOperation && typeof row.cookieLine === "string" ? parseGraphSetCookie(row.cookieLine, documentUrl ?? "") : undefined;
    if (cookieOperation && !scope) this.limit("script_cookie_identity_unresolved");
    const pageSnapshot = ["snapshot", "database_metadata", "cache_metadata"].includes(operation);
    if (pageSnapshot) this.limit("page_realm_storage_metadata_not_browser_verified");
    const node = this.add({ id: graphIdentity(session, executionContextId, "probe", this.sequence), kind: cookieOperation ? "cookie" : "storage", observedAtMs: at, ...scope,
      captureBasis: pageSnapshot ? "page_realm_snapshot" : "instrumented_call",
      frameId: context.frameId, documentId: context.documentId, url: documentUrl ? safeUrl(new URL(documentUrl).origin) : undefined, name: safeName(row.name),
      storageType, operation: operation as RuntimeGraphNode["operation"],
      outcome: row.success === true ? "native_call_returned" : row.success === false ? "native_call_failed" : "attempted",
      valueSize: nonnegativeInteger(row.valueSize),
    });
    this.link(context.documentId, node, cookieOperation ? "belongs_to_document" : "storage_operation", "instrumented_call", "inferred");
    const urls = Array.isArray(row.stack) ? row.stack.slice(0, LIMITS.stackFrames).map(safeUrl).filter((url): url is string => Boolean(url)) : [];
    if (urls[0]) {
      // Error stacks provide a caller URL, not an exact script execution ID.
      const script = this.add({ id: graphIdentity(session, executionContextId, "probe_script", urls[0]), kind: "script", observedAtMs: at, url: urls[0], frameId: context.frameId, documentId: context.documentId });
      this.link(script, node, cookieOperation ? "script_cookie_attempt" : "script_storage_operation", "instrumented_call", "inferred");
    }
  }

  finish(options: { setupMs: number; pendingTasks?: number } = { setupMs: 0 }): RuntimeEvidenceGraph {
    if (this.final) return this.final;
    const started = performance.now();
    let unresolvedRequests = 0;
    for (const chain of this.chains.values()) {
      const expected = chain.hops.filter((hop) => hop.extraExpected === true);
      const extraComplete = expected.length === chain.requestExtras.length && expected.length === chain.responseExtras.length && chain.hops.every((hop) => hop.extraExpected !== undefined);
      if (!extraComplete && (chain.requestExtras.length || chain.responseExtras.length || expected.length)) this.limit("extra_info_pairing_incomplete");
      if (extraComplete) expected.forEach((hop, index) => { hop.requestExtra = chain.requestExtras[index]; hop.responseExtra = chain.responseExtras[index]; });
      // Without redirects, the protocol request ID is unambiguous even when one ExtraInfo side is absent.
      if (chain.hops.length === 1) {
        if (chain.requestExtras.length === 1) chain.hops[0]!.requestExtra = chain.requestExtras[0];
        if (chain.responseExtras.length === 1) chain.hops[0]!.responseExtra = chain.responseExtras[0];
      }
      for (const hop of chain.hops) {
        if (!hop.hasInitiator) unresolvedRequests += 1;
        const request = this.nodes.get(hop.id);
        const blocked = (hop.responseExtra?.blocked ?? []) as Array<{ lineHash: string; reasons: string[] }>;
        if (hop.responseExtra && !hop.responseId) this.response(request?.sessionId || "unknown", hop, { status: hop.responseExtra.status }, request?.observedAtMs ?? 0);
        const lines = hop.responseExtra ? (hop.responseExtra.lines as HeaderAttempt[]) : hop.headerAttempts;
        for (const [index, row] of lines.entries()) {
          const cookie = parseGraphSetCookie(row.line, hop.url);
          if (!cookie || !hop.responseId) continue;
          if (cookie.cookie?.partitionOpaque && hop.responseExtra?.partitionKey) {
            cookie.cookie.partitionKey = hop.responseExtra.partitionKey as NonNullable<RuntimeGraphNode["cookie"]>["partitionKey"];
            cookie.cookie.partitionOpaque = hop.responseExtra.partitionOpaque === true;
          }
          const rejection = blocked.find((item) => item.lineHash === row.hash);
          const node = this.add({ id: graphIdentity(hop.responseId, "set-cookie", index), kind: "cookie", observedAtMs: this.nodes.get(hop.responseId)?.observedAtMs ?? request?.observedAtMs ?? 0, ...cookie,
            valueHash: row.valueHash, operation: "http_set", outcome: rejection ? "blocked" : "attempted", reasons: rejection?.reasons.map((reason) => reason.slice(0, 100)) });
          this.link(hop.responseId, node, "response_cookie_attempt");
        }
        for (const [index, rawCookie] of ((hop.requestExtra?.cookies ?? []) as Array<RecordValue>).entries()) {
          const metadata = rawCookie.cookie as Pick<RuntimeGraphNode, "cookie" | "cookieAttributes" | "valueHash">;
          const reasons = (rawCookie.blocked as string[]).map((reason) => reason.slice(0, 100));
          const node = this.add({ id: graphIdentity(hop.id, "associated-cookie", index), kind: "cookie", observedAtMs: request?.observedAtMs ?? 0, ...metadata, outcome: reasons.length ? "blocked" : "sent", reasons });
          this.link(node, hop.id, reasons.length ? "cookie_blocked" : "cookie_included");
        }
      }
    }
    const loadedSources = new Map<string, RequestState[]>();
    for (const chain of this.chains.values()) for (const hop of chain.hops) {
      const key = JSON.stringify([hop.documentId, hop.url]);
      const existing = loadedSources.get(key) ?? []; existing.push(hop); loadedSources.set(key, existing);
    }
    for (const source of this.sourceCandidates) {
      const matches = (loadedSources.get(JSON.stringify([source.documentId, source.url])) ?? []).filter(hop => (this.nodes.get(hop.id)?.observedAtMs ?? Infinity) <= source.at);
      // This is a constrained loaded-source association, not a claimed browser execution ID match.
      if (matches.length === 1) this.link(matches[0]!.id, source.nodeId, "loaded_resource", "unique_scope_time_match", "inferred");
      else if (matches.length > 1) this.limit("loaded_source_request_ambiguous");
    }
    // Snapshot presence can corroborate a single matching attempt, never prove which of several writes won.
    for (const snapshot of this.nodes.values()) {
      if (snapshot.operation !== "snapshot" || !snapshot.cookie || snapshot.cookie.identityRedacted || snapshot.cookie.partitionOpaque || !snapshot.valueHash) continue;
      const snapshotCookie = snapshot.cookie;
      const candidates = [...this.nodes.values()].filter((node) => node.operation === "http_set" && node.outcome === "attempted" && node.cookie && !node.cookie.identityRedacted && !node.cookie.partitionOpaque &&
        !isDeletionAttempt(node, Date.parse(this.input.startedAt) + node.observedAtMs) &&
        node.valueHash === snapshot.valueHash && node.observedAtMs <= snapshot.observedAtMs && scopeIdentity(node.cookie) === scopeIdentity(snapshotCookie));
      if (candidates.length === 1) this.link(candidates[0]!.id, snapshot.id, "snapshot_confirms", "unique_scope_time_match", "inferred");
    }
    if (unresolvedRequests) this.limit("request_initiator_unresolved");
    if (options.pendingTasks) this.limit("capture_tasks_incomplete");
    const graph: RuntimeEvidenceGraph = {
      contractVersion: RUNTIME_EVIDENCE_GRAPH_VERSION, ...this.input, action: this.action, completedAt: new Date().toISOString(),
      nodes: [...this.nodes.values()], edges: [...this.edges.values()], stacks: [...this.stacks.values()],
      coverage: { status: this.reasons.size || this.droppedNodes || this.droppedEdges ? "partial" : "complete", capabilities: [...this.capabilities].map(([name, status]) => ({ name, status })), reasons: [...this.reasons], droppedNodes: this.droppedNodes, droppedEdges: this.droppedEdges, unresolvedRequests, pendingTasks: options.pendingTasks ?? 0 },
      timing: { setupMs: options.setupMs, finalizeMs: Math.max(0, performance.now() - started) }, valuesRedacted: true, sourceHash: "0".repeat(64),
    };
    graph.sourceHash = createHash("sha256").update(runtimeGraphHashInput(graph)).digest("hex");
    this.final = runtimeEvidenceGraphSchema.parse(graph);
    this.frozen = true;
    this.chains.clear(); this.contexts.clear(); this.documents.clear(); this.sourceCandidates.length = 0; this.valueKey.fill(0);
    return this.final;
  }
}

function hostname(url: string) { try { return new URL(url).hostname.slice(0, 240); } catch { return undefined; } }
function nonnegativeInteger(value: unknown) { const result = number(value); return result !== undefined && Number.isInteger(result) && result >= 0 ? result : undefined; }
function safePartition(value: RecordValue) {
  const topLevelSite = safeUrl(value.topLevelSite);
  return topLevelSite ? { topLevelSite, ...(typeof value.hasCrossSiteAncestor === "boolean" ? { hasCrossSiteAncestor: value.hasCrossSiteAncestor } : {}) } : undefined;
}
function scopeIdentity(cookie: NonNullable<RuntimeGraphNode["cookie"]>) { return JSON.stringify([cookie.name, cookie.domain, cookie.hostOnly, cookie.path, cookie.partitionKey?.topLevelSite, cookie.partitionKey?.hasCrossSiteAncestor]); }
function isDeletionAttempt(node: RuntimeGraphNode, atEpochMs: number) {
  const attributes = node.cookieAttributes;
  return attributes?.maxAge !== undefined ? attributes.maxAge <= 0 : attributes?.expires !== undefined && attributes.expires * 1000 <= atEpochMs;
}

export function parseGraphSetCookie(line: string, responseUrl: string): Pick<RuntimeGraphNode, "cookie" | "cookieAttributes"> | undefined {
  try {
    const response = new URL(responseUrl);
    const parts = line.split(";"); const pair = parts.shift() ?? ""; const eq = pair.indexOf("=");
    if (eq < 1) return undefined;
    const attributes = new Map(parts.map((part) => { const [key, ...value] = part.trim().split("="); return [key?.toLowerCase() ?? "", value.join("=")] as const; }));
    const domain = attributes.get("domain")?.toLowerCase().replace(/^\./, "") || response.hostname;
    if (response.hostname !== domain && !response.hostname.endsWith(`.${domain}`)) return undefined;
    const defaultPath = response.pathname.slice(0, response.pathname.lastIndexOf("/")) || "/";
    const suppliedPath = attributes.get("path");
    const expires = attributes.get("expires") ? Date.parse(attributes.get("expires")!) / 1_000 : undefined;
    const maxAgeText = attributes.get("max-age");
    const maxAge = maxAgeText && /^-?\d+$/.test(maxAgeText) ? Number(maxAgeText) : undefined;
    return {
      cookie: { name: safeName(pair.slice(0, eq).trim()), domain: safeName(domain), path: safeName(suppliedPath?.startsWith("/") ? suppliedPath : defaultPath), hostOnly: !attributes.has("domain"), ...(attributes.has("partitioned") ? { partitionOpaque: true } : {}),
        identityRedacted: pair.slice(0, eq).includes("_redacted_") || (suppliedPath ?? "").includes("_redacted_") || safeName(pair.slice(0, eq).trim()) !== pair.slice(0, eq).trim() || safeName(suppliedPath?.startsWith("/") ? suppliedPath : defaultPath) !== (suppliedPath?.startsWith("/") ? suppliedPath : defaultPath) },
      cookieAttributes: { secure: attributes.has("secure"), httpOnly: attributes.has("httponly"), sameSite: attributes.has("samesite") ? safeName(attributes.get("samesite")).slice(0, 24) : undefined, ...(Number.isFinite(expires) ? { expires } : {}), ...(Number.isFinite(maxAge) ? { maxAge } : {}) },
    };
  } catch { return undefined; }
}
