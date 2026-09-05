import { randomBytes } from "node:crypto";
import type { CDPSession, Page } from "playwright";
import type { RuntimeEvidenceGraph } from "@certscore/contracts";
import { RuntimeEvidenceGraphBuilder } from "./runtime-evidence-graph.js";

export type RuntimeGraphCaptureInput = {
  scanId: string; captureId: string; scenario: RuntimeEvidenceGraph["scenario"];
  mode: RuntimeEvidenceGraph["mode"]; startedAt: string;
};
type Wire = { send(method: string, params?: Record<string, unknown>): Promise<any> };
const EVENTS = [
  "Page.frameNavigated", "Runtime.executionContextCreated", "Runtime.executionContextDestroyed", "Runtime.executionContextsCleared",
  "Network.requestWillBeSent", "Network.requestWillBeSentExtraInfo", "Network.responseReceived", "Network.responseReceivedExtraInfo",
  "Network.loadingFailed", "Network.loadingFinished", "Network.webSocketCreated", "Network.webSocketFrameSent", "Network.webSocketFrameReceived", "Network.webTransportCreated",
] as const;

/** Additive passive capture only: no requests, interception, target pausing, cache changes or extended observation window. */
export async function installRuntimeGraphCapture(page: Page, input: RuntimeGraphCaptureInput) {
  const started = performance.now();
  const builder = new RuntimeEvidenceGraphBuilder({ ...input, browserVersion: page.context().browser()?.version().slice(0, 100) ?? "unknown" });
  const nonce = randomBytes(24).toString("hex");
  const binding = `__certscore_graph_${randomBytes(8).toString("hex")}`;
  // tsx fixture runs preserve function names with this inert helper; tsc production output does not need it.
  const source = `(() => { const __name = (fn) => fn; return (${installPageProbe.toString()})(${JSON.stringify({ binding, nonce })}); })()`;
  const tasks = new Set<Promise<unknown>>();
  const children = new Map<string, Wire>();
  const contexts = new Map<string, { session: string; wire: Wire; contextId: number }>();
  const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
  const cleanups: Array<() => void> = [];
  let root: CDPSession | undefined;
  let commandId = 0;
  let frozen = false;
  let setupMs = 0;
  let setupExpired = false;
  let final: RuntimeEvidenceGraph | undefined;
  const track = (task: Promise<unknown>) => {
    const tracked = task.catch(() => { builder.limit("target_capture_unavailable"); }).finally(() => tasks.delete(tracked));
    tasks.add(tracked); return tracked;
  };
  const guard = (fn: () => void) => {
    if (frozen) return;
    try { fn(); } catch { builder.limit("protocol_event_invalid"); }
  };

  const receive = (session: string, wire: Wire, method: string, params: any) => guard(() => {
    if (method === "Runtime.bindingCalled") {
      if (params.name !== binding || typeof params.payload !== "string" || params.payload.length > 8192) return;
      const value = JSON.parse(params.payload);
      if (value?.nonce !== nonce) { builder.limit("untrusted_probe_rejected"); return; }
      builder.probe(session, params.executionContextId, value);
    } else if (method === "Target.attachedToTarget") {
      const childId = String(params.sessionId);
      if (children.size >= 32) { builder.limit("target_limit"); return; }
      const child: Wire = {
        send: (method, params) => {
          if (frozen || pending.size >= 128) return Promise.reject(new Error("graph_capture_closed_or_bounded"));
          const id = ++commandId;
          return new Promise((resolve, reject) => {
            pending.set(`${childId}:${id}`, { resolve, reject });
            void wire.send("Target.sendMessageToTarget", { sessionId: childId, message: JSON.stringify({ id, method, params }) }).catch(() => {
              pending.delete(`${childId}:${id}`); reject(new Error("graph_target_command_failed"));
            });
          });
        },
      };
      children.set(childId, child);
      builder.target(childId, String(params.targetInfo?.type ?? "unknown"), String(params.targetInfo?.url ?? ""));
      // Targets are never paused. Early worker activity may precede attachment, explicitly limited.
      builder.capability("related_targets", "partial"); builder.limit("related_target_early_activity_not_guaranteed");
      track(enable(childId, child, params.targetInfo?.type === "iframe"));
    } else if (method === "Target.receivedMessageFromTarget") {
      if (typeof params.message !== "string") return;
      const message = JSON.parse(params.message); const childId = String(params.sessionId);
      if (typeof message.id === "number") {
        const key = `${childId}:${message.id}`; const waiter = pending.get(key);
        pending.delete(key);
        if (message.error) waiter?.reject(new Error("graph_target_protocol_error")); else waiter?.resolve(message.result);
      } else {
        const child = children.get(childId);
        if (child) receive(childId, child, String(message.method), message.params ?? {});
      }
    } else if (method === "Target.detachedFromTarget") {
      const childId = String(params.sessionId); children.delete(childId);
      for (const key of contexts.keys()) if (key.startsWith(`${childId}:`)) contexts.delete(key);
      for (const [key, waiter] of pending) if (key.startsWith(`${childId}:`)) { pending.delete(key); waiter.reject(new Error("graph_target_detached")); }
      builder.handle(childId, "Runtime.executionContextsCleared", {});
    } else if ((EVENTS as readonly string[]).includes(method)) {
      if (method === "Runtime.executionContextCreated" && params.context?.auxData?.isDefault === true && contexts.size < 32)
        contexts.set(`${session}:${params.context.id}`, { session, wire, contextId: params.context.id });
      if (method === "Runtime.executionContextDestroyed") contexts.delete(`${session}:${params.executionContextId}`);
      if (method === "Runtime.executionContextsCleared") for (const key of contexts.keys()) if (key.startsWith(`${session}:`)) contexts.delete(key);
      builder.handle(session, method, params);
    }
  });

  async function enable(session: string, wire: Wire, documentTarget: boolean) {
    await Promise.all([
      wire.send("Network.enable", { maxTotalBufferSize: 0, maxResourceBufferSize: 0, maxPostDataSize: 0 }),
      wire.send("Runtime.enable"),
      // No Debugger.enable or deep asynchronous stack recording; Network initiators supply bounded stacks.
      wire.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: false }).catch(() => builder.limit("related_target_attachment_unavailable")),
      ...(documentTarget ? [wire.send("Page.enable"), wire.send("Runtime.addBinding", { name: binding })] : []),
    ]);
    if (documentTarget && !frozen && !setupExpired) {
      await wire.send("Page.addScriptToEvaluateOnNewDocument", { source });
      if (session !== "main") builder.limit("oopif_probe_may_start_late");
    }
  }

  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const setup = (async () => {
    root = await page.context().newCDPSession(page);
    if (setupExpired) { void root.detach().catch(() => undefined); return; }
    const wire: Wire = { send: (method, params) => root!.send(method as any, params as any) };
    for (const method of [...EVENTS, "Runtime.bindingCalled", "Target.attachedToTarget", "Target.receivedMessageFromTarget", "Target.detachedFromTarget"]) {
      const listener = (params: unknown) => receive("main", wire, method, params);
      root.on(method as any, listener); cleanups.push(() => root?.off(method as any, listener));
    }
    await enable("main", wire, true);
    builder.capability("network_identity", "observed"); builder.capability("network_cookie_outcomes", "supported");
    builder.capability("related_targets", "partial"); builder.limit("unrelated_service_worker_targets_not_attached");
    })();
    try {
      await Promise.race([setup, new Promise<never>((_, reject) => { timer = setTimeout(() => { setupExpired = true; reject(new Error("graph_setup_budget")); }, 250); })]);
    } finally { if (timer) clearTimeout(timer); }
  } catch {
    setupExpired = true;
    for (const cleanup of cleanups) cleanup();
    void root?.detach().catch(() => undefined);
    builder.capability("network_identity", "unavailable"); builder.limit("graph_setup_unavailable");
  }
  setupMs = performance.now() - started;

  return {
    confirmAction: (at: number) => builder.confirmAction(at),
    /** Reuse raw in-memory browser snapshots already captured by the owning lane. */
    cookies: (cookies: unknown[]) => guard(() => builder.snapshot(cookies.map((raw) => {
      if (!raw || typeof raw !== "object") return raw;
      const row = raw as Record<string, unknown>;
      // Playwright exposes the partition's top-level site string, but not always its ancestor bit.
      return typeof row.partitionKey === "string" ? { ...row, partitionKey: { topLevelSite: row.partitionKey } } : row;
    }))),
    /** Runs during the existing capture window, never as a late report-enrichment task. */
    snapshotStorage: () => track(Promise.all([...contexts.values()].map(async ({ session, wire, contextId }) => {
      try {
        // Return bounded metadata over CDP. Never give the page a second opportunity to intercept the probe nonce.
        const result = await wire.send("Runtime.evaluate", { expression: `(() => { const __name = (fn) => fn; return (${snapshotPageStorage.toString()})(); })()`, contextId, returnByValue: true, awaitPromise: true, timeout: 100 });
        if (result.exceptionDetails || !Array.isArray(result.result?.value)) { builder.limit("storage_snapshot_unavailable"); return; }
        for (const row of result.result.value.slice(0, 320)) guard(() => builder.probe(session, contextId, row));
      } catch { builder.limit("storage_snapshot_unavailable"); }
    }))),
    finish: (reason?: string): RuntimeEvidenceGraph => {
      if (final) return final;
      if (reason) builder.limit(reason);
      for (const cleanup of cleanups) cleanup();
      try {
        final = builder.finish({ setupMs, pendingTasks: tasks.size });
      } catch {
        const limited = new RuntimeEvidenceGraphBuilder(builder.input);
        limited.capability("network_identity", "unavailable"); limited.limit("graph_integrity_validation_failed");
        final = limited.finish({ setupMs });
      }
      frozen = true;
      for (const waiter of pending.values()) waiter.reject(new Error("graph_capture_finalized"));
      pending.clear(); children.clear(); contexts.clear();
      // Detach this observer only. Never close a lane's browser or another observer's session.
      void root?.detach().catch(() => undefined);
      return final;
    },
  };
}

/** Serializes into the page: only data primitives are inspected, native coercions are never repeated. */
function installPageProbe({ binding, nonce }: { binding: string; nonce: string }) {
  const root = globalThis as any;
  const sink = root[binding];
  if (typeof sink !== "function") return;
  const stringify = JSON.stringify;
  const nativeApply = Reflect.apply;
  const NativeError = Error;
  const NativeString = String;
  const ownDescriptor = Object.getOwnPropertyDescriptor;
  const create = Object.create;
  const keys = Object.keys;
  const setPrototypeOf = Object.setPrototypeOf;
  const isArray = Array.isArray;
  const nativeSlice = String.prototype.slice;
  const nativeIndexOf = String.prototype.indexOf;
  const nativeTrim = String.prototype.trim;
  const nativeLower = String.prototype.toLowerCase;
  const nativeExec = RegExp.prototype.exec;
  const slice = (value: string, start: number, end?: number): string => nativeApply(nativeSlice, value, [start, end]);
  const indexOf = (value: string, search: string, start = 0): number => nativeApply(nativeIndexOf, value, [search, start]);
  const trim = (value: string): string => nativeApply(nativeTrim, value, []);
  let localStorageObject: unknown, sessionStorageObject: unknown;
  try { localStorageObject = root.localStorage; sessionStorageObject = root.sessionStorage; } catch { /* Restricted frame. */ }
  // JSON.stringify normally invokes inherited toJSON hooks. The nonce must never reach page hooks.
  const inert = (value: any, depth = 0): any => {
    if (value === null || typeof value !== "object") return value;
    if (depth > 4) return undefined;
    if (isArray(value)) {
      const result: any[] = []; setPrototypeOf(result, null);
      for (let index = 0; index < value.length && index < 16; index++) result[index] = inert(value[index], depth + 1);
      return result;
    }
    const result = create(null); const names = keys(value);
    for (let index = 0; index < names.length && index < 24; index++) {
      const name = names[index]!;
      if (name !== "toJSON") result[name] = inert(value[name], depth + 1);
    }
    return result;
  };
  let count = 0;
  const emit = (row: Record<string, unknown>) => {
    try {
      if (++count > 200) { if (count === 201) sink(stringify(inert({ nonce, operation: "overflow" }))); return; }
      sink(stringify(inert({ ...row, nonce })));
    } catch { /* Page behavior unaffected. */ }
  };
  const stack = () => {
    if (ownDescriptor(NativeError, "prepareStackTrace")) { emit({ operation: "stack_unavailable" }); return []; }
    try {
      const text = NativeString(new NativeError().stack ?? ""); const urls: string[] = [];
      let start = 0;
      for (let line = 0; line < 14 && start < text.length; line++) {
        const end = indexOf(text, "\n", start); const segment = slice(text, start, end < 0 ? text.length : end);
        if (line >= 2) { const match = nativeApply(nativeExec, /(https?:\/\/[^\s)]+):\d+:\d+/, [segment]); if (match?.[1]) urls[urls.length] = match[1]; }
        if (end < 0) break; start = end + 1;
      }
      return urls;
    } catch { return []; }
  };
  const cookieMetadata = (value: unknown) => {
    try {
    if (typeof value !== "string") return {};
    const firstSemicolon = indexOf(value, ";"); const pair = slice(value, 0, firstSemicolon < 0 ? value.length : firstSemicolon); const eq = indexOf(pair, "=");
    const rawName = eq < 0 ? "unknown" : trim(slice(pair, 0, eq));
    const name = rawName.length > 240 ? "_redacted_" : rawName;
    let cookieLine = `${name}=;`; let start = firstSemicolon < 0 ? value.length : firstSemicolon + 1;
    if (value.length > 8192) return { name }; // Never parse an unbounded header or invent a truncated scope.
    while (start < value.length) {
      const end = indexOf(value, ";", start); const part = trim(slice(value, start, end < 0 ? value.length : end));
      const separator = indexOf(part, "="); const key = nativeApply(nativeLower, slice(part, 0, separator < 0 ? part.length : separator), []);
      if (key === "domain" || key === "path" || key === "secure" || key === "httponly" || key === "samesite" || key === "expires" || key === "max-age" || key === "partitioned") {
        if (part.length > 240 || cookieLine.length + part.length + 1 > 1000) return { name };
        cookieLine += `${part};`;
      }
      if (end < 0) break; start = end + 1;
    }
    return { name, cookieLine };
    } catch { return {}; }
  };
  let installed = false;
  let cookieStoreInstalled = false;
  try {
    const descriptor = ownDescriptor(Document.prototype, "cookie");
    if (descriptor?.set && descriptor.configurable) {
      const setter = descriptor.set;
      Object.defineProperty(Document.prototype, "cookie", { ...descriptor, set: function(value: unknown) {
        if (count >= 200) { emit({ operation: "overflow" }); return nativeApply(setter, this, [value]); }
        const caller = stack();
        try {
          const result = nativeApply(setter, this, [value]);
          emit({ operation: "js_set", ...cookieMetadata(value), success: true, stack: caller }); return result;
        } catch (error) { emit({ operation: "js_set", ...cookieMetadata(value), success: false, stack: caller }); throw error; }
      } });
    }
    for (const operation of ["setItem", "removeItem", "clear"] as const) {
      const descriptor = ownDescriptor(Storage.prototype, operation);
      if (!descriptor || typeof descriptor.value !== "function" || !descriptor.configurable) continue;
      const original = descriptor.value;
      Object.defineProperty(Storage.prototype, operation, { ...descriptor, value: function(...args: unknown[]) {
        if (count >= 200) { emit({ operation: "overflow" }); return nativeApply(original, this, args); }
        const caller = stack();
        let storageType: string | undefined;
        storageType = this === localStorageObject ? "localStorage" : this === sessionStorageObject ? "sessionStorage" : undefined;
        let name = "unknown";
        try { if (typeof args[0] === "string") name = args[0].length > 240 ? "_redacted_" : args[0]; } catch { /* Metadata must not affect native behavior. */ }
        const metadata = { operation, storageType, name, valueSize: typeof args[1] === "string" ? args[1].length : undefined, stack: caller };
        try { const result = nativeApply(original, this, args); emit({ ...metadata, success: true }); return result; }
        catch (error) { emit({ ...metadata, success: false }); throw error; }
      } });
    }
    if (root.cookieStore) {
      const prototype = Object.getPrototypeOf(root.cookieStore);
      const descriptor = ownDescriptor(prototype, "set");
      if (descriptor?.configurable && typeof descriptor.value === "function") {
        const original = descriptor.value;
        Object.defineProperty(prototype, "set", { ...descriptor, value: function(...args: unknown[]) {
          if (count >= 200) { emit({ operation: "overflow" }); return nativeApply(original, this, args); }
          const caller = stack();
          let metadata: Record<string, unknown> = {};
          if (typeof args[0] === "string" && typeof args[1] === "string") metadata = cookieMetadata(`${args[0]}=; Path=/`);
          // Dictionary overloads may be Proxies. Even descriptor reads can execute traps;
          // leave their identity unresolved rather than add observable property accesses.
          try {
            const result = nativeApply(original, this, args);
            // Do not attach a rejection handler: that would change unhandledrejection behavior.
            // A returned promise is a call outcome, not confirmation that storage succeeded.
            emit({ operation: "cookie_store_set", ...metadata, success: true, stack: caller });
            return result;
          } catch (error) { emit({ operation: "cookie_store_set", ...metadata, success: false, stack: caller }); throw error; }
        } });
        cookieStoreInstalled = true;
      }
    }
    installed = true;
  } catch { /* Unsupported probes remain coverage limitations. */ }
  emit({ operation: "coverage", installed, cookieStoreInstalled });
}

async function snapshotPageStorage() {
  const root = globalThis as any;
  const rows: Record<string, unknown>[] = [];
  const send = (row: Record<string, unknown>) => { if (rows.length < 320) rows.push(row); };
  for (const storageType of ["localStorage", "sessionStorage"]) {
    try {
      const storage = root[storageType] as Storage;
      for (let i = 0; i < Math.min(storage.length, 100); i++) {
        const name = storage.key(i); if (name === null) continue;
        send({ operation: "snapshot", storageType, name: name.length > 240 ? "_redacted_" : name, valueSize: storage.getItem(name)?.length, success: true });
      }
      if (storage.length > 100) send({ operation: "overflow" });
    } catch { send({ operation: "coverage", installed: false }); }
  }
  // Metadata only. No database opening or enumeration of records/cache response bodies.
  await Promise.allSettled([root.indexedDB?.databases?.().then((databases: Array<{ name?: string }>) => {
    for (const database of databases.slice(0, 50)) send({ operation: "database_metadata", storageType: "indexedDB", name: database.name && database.name.length > 240 ? "_redacted_" : database.name, success: true });
  }), root.caches?.keys?.().then((keys: string[]) => {
    for (const name of keys.slice(0, 50)) send({ operation: "cache_metadata", storageType: "cacheStorage", name: name.length > 240 ? "_redacted_" : name, success: true });
  })]);
  return rows;
}
