"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRuntimeEvidenceGraphProjectionSchema, type ApiRuntimeEvidenceGraph, type ApiRuntimeEvidenceGraphProjection } from "@certscore/api-contracts";

const SCENARIOS = { pre_consent: "Before consent", gpc: "GPC enabled", post_accept: "Accept observation", post_reject: "Reject observation" };
const RELATIONS: Record<ApiRuntimeEvidenceGraph["edges"][number]["relation"], string> = {
  belongs_to_document: "Document context", belongs_to_frame: "Frame context", frame_parent: "Parent frame", worker_request: "Worker request",
  initiated_by: "Initiating script", parser_loaded: "Parser source", async_ancestor: "Asynchronous ancestor", response_to: "Request / response",
  redirected_from: "Redirect", response_cookie_attempt: "HTTP response setter attempt", script_cookie_attempt: "Script setter attempt",
  cookie_included: "Cookie sent", cookie_blocked: "Cookie blocked", snapshot_confirms: "Unique scope/value snapshot match",
  storage_operation: "Storage context", script_storage_operation: "Storage caller", handled_by_service_worker: "Handled by service worker",
  loaded_resource: "Loaded source association",
};
const BUTTON = "rounded-md border border-slate-300 px-2.5 py-1.5 text-left text-xs text-slate-800 hover:bg-slate-100 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

export function RuntimeEvidenceGraphExplorer({ projection: initialProjection }: { projection?: ApiRuntimeEvidenceGraphProjection }) {
  const [loaded, setLoaded] = useState<{ key: string; projection: ApiRuntimeEvidenceGraphProjection }>();
  const [open, setOpen] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const loadKey = initialProjection?.details?.sha256;
  const scanId = initialProjection?.scanId;
  const bundleHash = initialProjection?.sourceBundle?.sha256;
  const projection = loaded && loadKey && loaded.key === loadKey ? loaded.projection : initialProjection;
  useEffect(() => {
    if (!open || !loadKey || !scanId || loaded?.key === loadKey) return;
    const controller = new AbortController(); setLoadError(undefined);
    void (async () => {
      try {
        const response = await fetch(`/api/scans/${encodeURIComponent(scanId)}/runtime-evidence-graph`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 429 ? `Read limit reached. Wait ${response.headers.get("Retry-After") ?? "the indicated number of"} seconds before retrying.` : "Relationship evidence could not be loaded. You can retry without rescanning.");
        const parsed = apiRuntimeEvidenceGraphProjectionSchema.safeParse(await response.json());
        if (!parsed.success || parsed.data.scanId !== scanId || parsed.data.sourceBundle?.sha256 !== bundleHash || parsed.data.details) throw new Error("The retained relationship evidence did not verify.");
        setLoaded({ key: loadKey, projection: parsed.data });
      } catch (error) { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Relationship evidence is unavailable."); }
    })();
    return () => controller.abort();
  }, [open, loadKey, scanId, bundleHash, loaded?.key, attempt]);
  const [scenario, setScenario] = useState<ApiRuntimeEvidenceGraph["scenario"]>("pre_consent");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string>();
  const graph = projection?.graphs.find(item => item.scenario === scenario) ?? projection?.graphs[0];
  const nodesById = useMemo(() => new Map(graph?.nodes.map(node => [node.id, node]) ?? []), [graph]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (graph?.nodes ?? []).filter(node => !term || [node.label, node.kind, node.cookie?.domain, node.classification?.vendor, node.url].some(value => value?.toLowerCase().includes(term)));
  }, [graph, query]);
  const selected = selectedId ? nodesById.get(selectedId) : undefined;
  // Undefined is a disabled/absent feature; only explicit unavailable evidence
  // renders that state. Keep every hook above this guard for live suppression.
  if (!initialProjection) return null;
  return <details className="rounded-xl border border-slate-200 bg-white" data-testid="runtime-evidence-graph" onToggle={event => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open); }}>
    <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold text-slate-900">How these items were loaded <span className="ml-2 text-xs font-normal text-slate-500">{graph || projection?.details ? `${projection?.details?.scenarioCount ?? projection?.graphs.length} captured scenarios` : "Relationship evidence unavailable"}</span></summary>
    {!graph ? <div className="px-4 pb-4 text-sm text-slate-600" role="status">{projection?.details ? loadError ? <><p>{loadError}</p><button type="button" className={`${BUTTON} mt-2`} onClick={() => setAttempt(value => value + 1)}>Retry loading evidence</button></> : <p>Loading verified relationship details…</p> : <p>This scan has no verified, publishable relationship graph. Existing observations remain available. Missing graph evidence does not establish absence.</p>}</div> : <div className="space-y-4 border-t border-slate-100 p-4">
      <p className="text-xs leading-relaxed text-slate-600">Items can have multiple parents. HTTP responses set server cookies; initiating scripts are separate ancestors. Write attempts and stored snapshots are distinct. Inferred links are labelled. This view does not change findings or scores.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs font-medium text-slate-600">Scenario<select aria-label="Scenario" className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm" value={graph.scenario} onChange={event => { setScenario(event.target.value as ApiRuntimeEvidenceGraph["scenario"]); setSelectedId(undefined); setPage(0); }}>
          {projection?.graphs.map(item => <option key={item.captureId} value={item.scenario}>{SCENARIOS[item.scenario]}</option>)}
        </select></label>
        <label className="grid min-w-48 flex-1 gap-1 text-xs font-medium text-slate-600">Find an item<input className="rounded-md border border-slate-300 px-3 py-2 text-sm" type="search" placeholder="Cookie, domain, vendor or type" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
        <span className="text-xs text-slate-600" role="status">{filtered.length} nodes · {graph.edges.length} links</span>
      </div>
      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <p>Coverage: {graph.coverage.status}. {graph.coverage.unresolvedRequests} unresolved request initiators. {graph.coverage.droppedNodes + graph.coverage.droppedEdges} nodes/links exceeded capture limits.</p>
        {graph.action ? <p className="mt-1">Action registration: {graph.action.status}{graph.action.registeredAtMs === undefined ? ". Post-action behavior is not established." : ` at ${seconds(graph.action.registeredAtMs)}. Earlier events are pre-action.`}</p> : null}
        <details className="mt-2"><summary className="cursor-pointer">Coverage and source details</summary><ul className="mt-2 list-inside list-disc space-y-1">{graph.coverage.reasons.map(reason => <li key={reason}>{reason.replaceAll("_", " ")}</li>)}</ul><p className="mt-2 break-all font-mono">Source graph SHA-256: {graph.sourceHash}</p><p className="mt-2">Sensitive values and query strings are excluded. Endpoint locations elsewhere in the inventory may describe CDN edges.</p></details>
      </div>
      <div className="grid gap-4 lg:grid-cols-2"><div>
        <ul className="max-h-96 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2" aria-label="Captured evidence nodes">
          {filtered.slice(page * 40, (page + 1) * 40).map(node => <li key={node.id}><button type="button" className={`${BUTTON} w-full ${selected?.id === node.id ? "border-blue-500 bg-blue-50" : "border-transparent"}`} aria-pressed={selected?.id === node.id} onClick={() => setSelectedId(node.id)}><span className="block break-all font-medium">{node.label}</span><span className="mt-1 block text-slate-500">{node.kind} · {seconds(node.observedAtMs)}{node.outcome ? ` · ${node.outcome.replaceAll("_", " ")}` : ""}{node.classification ? ` · ${node.classification.vendor}` : ""}</span></button></li>)}
          {!filtered.length ? <li className="p-2 text-xs text-slate-500">No matching retained nodes.</li> : null}
        </ul>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500"><button className={BUTTON} type="button" disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))}>Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(filtered.length / 40))}</span><button className={BUTTON} type="button" disabled={(page + 1) * 40 >= filtered.length} onClick={() => setPage(value => value + 1)}>Next</button></div>
      </div><aside className="min-w-0 rounded-lg border border-slate-200 p-3" aria-label="Selected evidence and relationships" aria-live="polite">
        {!selected ? <p className="text-sm text-slate-500">Select an item to inspect its evidence, parents and dependents.</p> : <>
          <h4 className="break-all text-sm font-semibold text-slate-900">{selected.label}</h4>
          <p className="mt-1 text-xs text-slate-500">{selected.kind} · {seconds(selected.observedAtMs)}{graph.action?.registeredAtMs === undefined ? "" : selected.observedAtMs < graph.action.registeredAtMs ? " · Before registration" : " · After confirmed registration (timing only)"}</p>
          {selected.classification ? <p className="mt-2 text-xs text-slate-600">{selected.classification.product ?? selected.classification.vendor} · {selected.classification.purpose.replaceAll("_", " ")} (canonical registry). Policy mention: {selected.classification.disclosure.replaceAll("_", " ")}{selected.classification.disclosureScope ? ` at ${selected.classification.disclosureScope} level` : ""}. A literal mention does not establish disclosure sufficiency.</p> : null}
          {selected.cookie ? <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-600"><dt>Domain</dt><dd className="break-all">{selected.cookie.domain}</dd><dt>Path</dt><dd className="break-all">{selected.cookie.path}</dd><dt>Host only</dt><dd>{flag(selected.cookie.hostOnly)}</dd><dt>Partition</dt><dd className="break-all">{selected.cookie.partitionKey?.topLevelSite ?? (selected.cookie.partitionOpaque ? "Opaque / unresolved" : "No partition key reported")}</dd><dt>Secure / HTTP-only</dt><dd>{flag(selected.cookieAttributes?.secure)} / {flag(selected.cookieAttributes?.httpOnly)}</dd><dt>SameSite</dt><dd>{selected.cookieAttributes?.sameSite ?? "Not reported"}</dd></dl> : null}
          <Relationships title="Parents and sources" edges={graph.edges.filter(edge => edge.to === selected.id)} lookup={nodesById} direction="from" onSelect={setSelectedId} />
          <Relationships title="Dependents and outcomes" edges={graph.edges.filter(edge => edge.from === selected.id)} lookup={nodesById} direction="to" onSelect={setSelectedId} />
          {selected.scopeMatchKey ? <div className="mt-4 text-xs text-slate-600"><h5 className="font-semibold">Same scoped item across scenarios</h5><p className="mt-1">Matches use exact cookie name/domain/path/partition or storage origin/type/key. They do not establish equal values, persistence, active use, blocking, or consent effectiveness. Unobserved items remain unknown.</p><ul className="mt-2 space-y-1">{projection?.graphs.map(other => {
            const matches = other.nodes.filter(node => node.scopeMatchKey === selected.scopeMatchKey);
            const confirmed = other.action?.status === "confirmed" && other.action.registeredAtMs !== undefined;
            const after = confirmed ? matches.filter(node => node.observedAtMs >= other.action!.registeredAtMs!).length : 0;
            return <li key={other.captureId}>{SCENARIOS[other.scenario]}: {matches.length ? `${matches.length} retained observation(s)` : "Unknown — no matching observation"}{other.action ? confirmed ? `; ${after} after registration (timing only)` : "; action unconfirmed" : ""}. Coverage: {other.coverage.status}.</li>;
          })}</ul></div> : null}
          <details className="mt-3 text-xs"><summary className="cursor-pointer font-medium text-slate-700">Retained evidence fields</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 text-slate-600">{JSON.stringify({ ...selected, stack: graph.stacks.find(stack => stack.id === selected.stackId) }, null, 2)}</pre></details>
        </>}
      </aside></div>
    </div>}
  </details>;
}

function Relationships({ title, edges, lookup, direction, onSelect }: {
  title: string; edges: ApiRuntimeEvidenceGraph["edges"]; lookup: Map<string, ApiRuntimeEvidenceGraph["nodes"][number]>;
  direction: "from" | "to"; onSelect: (id: string) => void;
}) {
  return <div className="mt-4"><h5 className="text-xs font-semibold text-slate-700">{title} ({edges.length})</h5>
    {!edges.length ? <p className="mt-1 text-xs text-slate-500">No relationship retained; this does not establish absence.</p> : <ul className="mt-2 max-h-56 space-y-1 overflow-auto">{edges.map(edge => <li key={edge.id}><button type="button" className={`${BUTTON} w-full break-all`} onClick={() => onSelect(edge[direction])}><span className="block font-medium">{lookup.get(edge[direction])?.label ?? "Unavailable evidence"}</span><span className="block text-slate-500">{RELATIONS[edge.relation]} · {edge.directness} · {edge.basis.replaceAll("_", " ")}</span></button></li>)}</ul>}
  </div>;
}
function seconds(value: number) { return `${(value / 1000).toFixed(2)}s`; }
function flag(value: boolean | undefined) { return value === undefined ? "Unknown" : value ? "Yes" : "No"; }
