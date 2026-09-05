"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { apiRuntimeEvidenceGraphProjectionSchema, type ApiRuntimeEvidenceGraph, type ApiRuntimeEvidenceGraphProjection } from "@certscore/api-contracts";
import { RetainedEvidenceFields } from "./retained-evidence-fields";
import { VendorBrandIcon } from "./vendor-brand-chip";
import { buildRelationshipForest, nodeTitle, nodeDomain, nodeEvidenceClass, observationTime, type GraphNode, type InventoryEvidenceContext, type EvidenceClass } from "./runtime-evidence-graph-model";
import styles from "./runtime-evidence-graph-styles";

const SCENARIOS = { pre_consent: "Pre-consent", post_accept: "After accept", post_reject: "After reject", gpc: "GPC enabled" };
const RELATIONS: Record<ApiRuntimeEvidenceGraph["edges"][number]["relation"], string> = {
  belongs_to_document: "Document context", belongs_to_frame: "Frame context", frame_parent: "Parent frame", worker_request: "Worker request",
  initiated_by: "Initiating script", parser_loaded: "Parser source", async_ancestor: "Asynchronous ancestor", response_to: "Request / response",
  redirected_from: "Redirect", response_cookie_attempt: "HTTP response setter attempt", script_cookie_attempt: "Script setter attempt",
  cookie_included: "Cookie sent", cookie_blocked: "Cookie blocked", snapshot_confirms: "Unique scope/value snapshot match",
  storage_operation: "Storage context", script_storage_operation: "Storage caller", handled_by_service_worker: "Handled by service worker",
  loaded_resource: "Loaded source association",
};
const BUTTON = "rounded-md border border-slate-300 px-2.5 py-1.5 text-left text-xs text-slate-800 hover:bg-slate-100 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

export function RuntimeEvidenceGraphExplorer({ projection: initialProjection, inventory, inventoryContext = [], initiallyOpen = !initialProjection?.details }: { projection?: ApiRuntimeEvidenceGraphProjection; inventory?: ReactNode; inventoryContext?: InventoryEvidenceContext[]; initiallyOpen?: boolean }) {
  const [loaded, setLoaded] = useState<{ key: string; projection: ApiRuntimeEvidenceGraphProjection }>();
  const [open, setOpen] = useState(initiallyOpen);
  const [view, setView] = useState(initialProjection?.status === "unavailable" && inventory ? "inventory" : "relationships");
  const [loadError, setLoadError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const loadKey = initialProjection?.details ? `${initialProjection.scanId}:${initialProjection.details.sha256}` : undefined;
  const scanId = initialProjection?.scanId;
  const bundleHash = initialProjection?.sourceBundle?.sha256;
  const projection = loaded && loadKey && loaded.key === loadKey ? loaded.projection : initialProjection;
  useEffect(() => {
    if (!open || view !== "relationships" || !loadKey || !scanId || loaded?.key === loadKey) return;
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
  }, [open, view, loadKey, scanId, bundleHash, loaded?.key, attempt]);
  const [scenario, setScenario] = useState<ApiRuntimeEvidenceGraph["scenario"]>("pre_consent");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string>();
  const graph = projection?.graphs.find(item => item.scenario === scenario);
  const forest = useMemo(() => graph ? buildRelationshipForest(graph) : undefined, [graph]);
  const nodesById = useMemo(() => new Map(graph?.nodes.map(node => [node.id, node]) ?? []), [graph]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? (graph?.nodes ?? []).filter(node => [node.label, node.kind, node.cookie?.domain, node.classification?.vendor, node.url].some(value => value?.toLowerCase().includes(term))) : forest?.roots ?? [];
  }, [graph, forest, query]);
  const selected = selectedId ? nodesById.get(selectedId) : undefined;
  // Undefined is a disabled/absent feature; only explicit unavailable evidence
  // renders that state. Keep every hook above this guard for live suppression.
  if (!initialProjection) return inventory ?? null;
  return <details open={open} className={`${styles.explorer} rounded-xl border border-slate-200 bg-white`} data-testid="runtime-evidence-graph" onToggle={event => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open); }}>
    <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold text-slate-900">Explore cookies &amp; trackers <span className="ml-2 text-xs font-normal text-slate-500">{projection?.details?.scenarioCount ?? projection?.graphs.length} captured scenarios</span></summary>
    <div className="px-4">
      <div className={styles.toolbar}>
        <div className={styles.tabs} aria-label="Evidence view"><button type="button" className={styles.tab} aria-pressed={view === "relationships"} onClick={() => setView("relationships")}>Relationships</button>{inventory ? <button type="button" className={styles.tab} aria-pressed={view === "inventory"} onClick={() => setView("inventory")}>Inventory</button> : null}</div>
        {view === "relationships" ? <label className={styles.scenario}>Scenario<select aria-label="Scenario" value={scenario} onChange={event => { setScenario(event.target.value as ApiRuntimeEvidenceGraph["scenario"]); setSelectedId(undefined); setPage(0); }}>{Object.entries(SCENARIOS).map(([key, label]) => <option key={key} value={key}>{label}{projection?.graphs.some(item => item.scenario === key) ? "" : " · unavailable"}</option>)}</select></label> : <span className="text-xs text-slate-500">Pre-consent inventory · full existing detail</span>}
      </div>
      <div hidden={view !== "inventory"}>{inventory}</div>
    </div>
    <div hidden={view !== "relationships"}>
    {!graph ? <div className="px-4 pb-4 text-sm text-slate-600" role="status">{projection?.details ? loadError ? <><p>{loadError}</p><button type="button" className={`${BUTTON} mt-2`} onClick={() => setAttempt(value => value + 1)}>Retry loading evidence</button></> : <p>Loading verified relationship details…</p> : <p>{projection?.graphs.length ? "This scenario has no retained relationship graph. Choose another scenario or inspect the Inventory tab. Missing evidence does not establish absence." : "This scan has no verified, publishable relationship graph. Existing observations remain available. Missing graph evidence does not establish absence."}</p>}</div> : <div className="space-y-4 border-t border-slate-100 p-4">
      <details className="text-xs leading-relaxed text-slate-500"><summary className="cursor-pointer">How to read this view</summary><p className="mt-2">Items can have multiple parents. HTTP responses set server cookies; initiating scripts are separate ancestors. Context links are not proof of causation. Write attempts and stored snapshots are distinct. Inferred links are labelled. Necessity markers require matching inventory evidence; unknown items remain review. This view does not change findings or scores.</p></details>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-48 flex-1 gap-1 text-xs font-medium text-slate-600">Find an item<input className="rounded-md border border-slate-300 px-3 py-2 text-sm" type="search" placeholder="Cookie, domain, vendor or type" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
        <span className="text-xs text-slate-600" role="status">{graph.nodes.length} resources · {graph.edges.length} links</span>
      </div>
      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <p>Coverage: {graph.coverage.status}. {graph.coverage.unresolvedRequests} unresolved request initiators. {graph.coverage.droppedNodes + graph.coverage.droppedEdges} nodes/links exceeded capture limits.</p>
        {graph.action ? <p className="mt-1">Action registration: {graph.action.status}{graph.action.status !== "confirmed" || graph.action.registeredAtMs === undefined ? ". Post-action behavior is not established." : ` at ${seconds(graph.action.registeredAtMs)}. Earlier events are pre-action.`}</p> : null}
        <details className="mt-2"><summary className="cursor-pointer">Coverage and source details</summary><ul className="mt-2 list-inside list-disc space-y-1">{graph.coverage.reasons.map(reason => <li key={reason}>{reason.replaceAll("_", " ")}</li>)}</ul><p className="mt-2 break-all font-mono">Source graph SHA-256: {graph.sourceHash}</p><p className="mt-2">Sensitive values and query strings are excluded. Endpoint locations elsewhere in the inventory may describe CDN edges.</p></details>
      </div>
      <div className={styles.legend}>{(["Non-essential", "Review", "Essential", "Contextual"] as EvidenceClass[]).map(value => <span key={value}><ClassificationIcon value={value} />{value === "Review" ? "Unknown / review" : value}</span>)}</div>
      <div className={styles.layout}><div className={styles.list}>
        <ul aria-label="Captured evidence nodes">
          {filtered.slice(page * 40, (page + 1) * 40).map(node => <ResourceBranch key={`${graph.captureId}:${node.id}:${Boolean(query)}`} node={node} forest={forest!} selectedId={selectedId} onSelect={setSelectedId} scenario={scenario} contexts={inventoryContext} flat={Boolean(query.trim())} />)}
          {!filtered.length ? <li className="p-2 text-xs text-slate-500">No matching retained nodes.</li> : null}
        </ul>
        {filtered.length > 40 ? <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500"><button className={BUTTON} type="button" disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))}>Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(filtered.length / 40))}</span><button className={BUTTON} type="button" disabled={(page + 1) * 40 >= filtered.length} onClick={() => setPage(value => value + 1)}>Next</button></div> : null}
      </div><aside className={styles.inspector} aria-label="Selected evidence and relationships" aria-live="polite">
        {!selected ? <p className="text-sm text-slate-500">Select an item to inspect its evidence, parents and dependents.</p> : <>
          <p className={styles.eyebrow}>Resource detail</p><h4 className={styles.title}>{nodeTitle(selected)}</h4><p className={styles.subtitle}>{nodeDomain(selected)}</p>
          <p className="mt-1 text-xs text-slate-500">{selected.kind} · {seconds(selected.observedAtMs)}{graph.action?.status !== "confirmed" || graph.action.registeredAtMs === undefined ? "" : selected.observedAtMs < graph.action.registeredAtMs ? " · Before registration" : " · After confirmed registration (timing only)"}</p>
          <details className={styles.group}><summary>Classification &amp; policy</summary><p className="text-xs text-slate-600">Necessity: {nodeEvidenceClass(selected, scenario, inventoryContext) === "Review" ? "Unknown / review — no unambiguous matching necessity evidence" : `${nodeEvidenceClass(selected, scenario, inventoryContext)} — matching pre-consent inventory evidence`}. This is not a legal conclusion.</p>{selected.classification ? <p className="mt-2 text-xs text-slate-600">{selected.classification.product ?? selected.classification.vendor} · {selected.classification.purpose.replaceAll("_", " ")} (canonical registry). Policy mention: {selected.classification.disclosure.replaceAll("_", " ")}{selected.classification.disclosureScope ? ` at ${selected.classification.disclosureScope} level` : ""}. A literal mention does not establish disclosure sufficiency.</p> : <p className="mt-2 text-xs text-slate-500">No canonical vendor/policy classification retained for this resource. Broader inventory context is available in the Inventory tab.</p>}</details>
          <details className={styles.group}><summary>Timing &amp; activity</summary><dl className={styles.fields}>{Object.entries({ "Observed after capture start": seconds(selected.observedAtMs), "Capture duration": seconds(Date.parse(graph.completedAt) - Date.parse(graph.startedAt)), "Action registration": graph.action?.registeredAtMs === undefined ? "Not established" : seconds(graph.action.registeredAtMs), Operation: selected.operation, Outcome: selected.outcome, "HTTP method": selected.method, "HTTP status": selected.status, "Value size (bytes)": selected.valueSize }).filter(([, value]) => value !== undefined).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></details>
          {selected.cookie ? <details className={styles.group}><summary>Cookie attributes &amp; scope</summary><dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-600"><dt>Domain</dt><dd className="break-all">{selected.cookie.domain}</dd><dt>Path</dt><dd className="break-all">{selected.cookie.path}</dd><dt>Host only</dt><dd>{flag(selected.cookie.hostOnly)}</dd><dt>Partition</dt><dd className="break-all">{selected.cookie.partitionKey?.topLevelSite ?? (selected.cookie.partitionOpaque ? "Opaque / unresolved" : "No partition key reported")}</dd><dt>Secure / HTTP-only</dt><dd>{flag(selected.cookieAttributes?.secure)} / {flag(selected.cookieAttributes?.httpOnly)}</dd><dt>SameSite</dt><dd>{selected.cookieAttributes?.sameSite ?? "Not reported"}</dd></dl></details> : null}
          <Relationships title="Parents and sources" edges={graph.edges.filter(edge => edge.to === selected.id)} lookup={nodesById} direction="from" onSelect={setSelectedId} />
          <Relationships title="Dependents and outcomes" edges={graph.edges.filter(edge => edge.from === selected.id)} lookup={nodesById} direction="to" onSelect={setSelectedId} />
          {selected.scopeMatchKey ? <details className={styles.group}><summary>Across scenarios</summary><p className="text-xs text-slate-500">Matches use exact cookie name/domain/path/partition or storage origin/type/key. They do not establish equal values, persistence, active use, blocking, or consent effectiveness. Unobserved items remain unknown.</p><ul className="mt-2 space-y-1 text-xs">{projection?.graphs.map(other => {
            const matches = other.nodes.filter(node => node.scopeMatchKey === selected.scopeMatchKey);
            const confirmed = other.action?.status === "confirmed" && other.action.registeredAtMs !== undefined;
            const after = confirmed ? matches.filter(node => node.observedAtMs >= other.action!.registeredAtMs!).length : 0;
            return <li key={other.captureId}>{SCENARIOS[other.scenario]}: {matches.length ? `${matches.length} retained observation(s)` : "Unknown — no matching observation"}{other.action ? confirmed ? `; ${after} after registration (timing only)` : "; action unconfirmed" : ""}. Coverage: {other.coverage.status}.</li>;
          })}</ul></details> : null}
          <RetainedEvidenceFields key={`${graph.captureId}:${selected.id}`} value={{ node: selected, relationships: graph.edges.filter(edge => edge.to === selected.id || edge.from === selected.id), stack: graph.stacks.find(stack => stack.id === selected.stackId), capture: { captureId: graph.captureId, scenario: graph.scenario, startedAt: graph.startedAt, completedAt: graph.completedAt, action: graph.action, coverage: graph.coverage, sourceHash: graph.sourceHash }, registryVersion: projection?.registryVersion, sourceBundle: projection?.sourceBundle }} />
        </>}
      </aside></div>
    </div>}
    {projection && !projection.details ? <div className="px-4 pb-3"><RetainedEvidenceFields value={projection} label="All scan relationship fields" /></div> : null}
    </div>
  </details>;
}

function Relationships({ title, edges, lookup, direction, onSelect }: {
  title: string; edges: ApiRuntimeEvidenceGraph["edges"]; lookup: Map<string, ApiRuntimeEvidenceGraph["nodes"][number]>;
  direction: "from" | "to"; onSelect: (id: string) => void;
}) {
  return <details className={styles.group}><summary>{title} <span className="text-slate-400">{edges.length}</span></summary>
    {!edges.length ? <p className="mt-1 text-xs text-slate-500">No relationship retained; this does not establish absence.</p> : <ul className="mt-2 max-h-56 space-y-1 overflow-auto">{edges.map(edge => <li key={edge.id}><button type="button" className={`${BUTTON} w-full break-all`} onClick={() => onSelect(edge[direction])}><span className="block font-medium">{lookup.get(edge[direction])?.label ?? "Unavailable evidence"}</span><span className="block text-slate-500">{RELATIONS[edge.relation]} · {edge.directness} · {edge.basis.replaceAll("_", " ")}</span></button></li>)}</ul>}
  </details>;
}
function seconds(value: number) { return observationTime(value); }
function flag(value: boolean | undefined) { return value === undefined ? "Unknown" : value ? "Yes" : "No"; }

function ClassificationIcon({ value }: { value: EvidenceClass }) {
  const color = { "Non-essential": "#dc2626", Essential: "#2563eb", Contextual: "#0284c7", Review: "#d97706" }[value];
  return <svg role="img" aria-label={value === "Review" ? "Unknown / review" : value} width="16" height="16" viewBox="0 0 20 20" style={{ color }}><title>{value === "Review" ? "Unknown or insufficient necessity evidence; review details" : value}</title>{value === "Non-essential" ? <><path d="M10 2 19 18H1Z" fill="currentColor" /><path d="M10 7v5m0 2v1" stroke="white" strokeWidth="2" /></> : <><circle cx="10" cy="10" r="8" fill="currentColor" opacity=".12" /><text x="10" y="14" textAnchor="middle" fill="currentColor" fontSize="12" fontWeight="700">{value === "Essential" ? "✓" : value === "Contextual" ? "i" : "?"}</text></>}</svg>;
}

function ResourceBranch({ node, forest, selectedId, onSelect, scenario, contexts, flat = false, depth = 0 }: {
  node: GraphNode; forest: ReturnType<typeof buildRelationshipForest>; selectedId?: string; onSelect: (id: string) => void;
  scenario: ApiRuntimeEvidenceGraph["scenario"]; contexts: InventoryEvidenceContext[]; flat?: boolean; depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth === 0 && (forest.children.get(node.id)?.length ?? 0) <= 5);
  const [limit, setLimit] = useState(20);
  const children = flat ? [] : forest.children.get(node.id) ?? [];
  const edge = forest.parent.get(node.id);
  return <li className={styles.node}>
    {depth > 0 && edge ? <p className={styles.edge}>{RELATIONS[edge.relation]}{edge.directness === "inferred" ? " · inferred" : ""}</p> : null}
    <button type="button" data-node-id={node.id} className={styles.card} aria-pressed={selectedId === node.id} onClick={() => onSelect(node.id)}>
      <span className={styles.brand}><VendorBrandIcon label={node.classification?.vendor ?? "Unknown"} /></span><span className={styles.name} title={node.label}>{nodeTitle(node)}</span><span className={styles.time}>{seconds(node.observedAtMs)}</span><ClassificationIcon value={nodeEvidenceClass(node, scenario, contexts)} />
      <span className={styles.meta}>{nodeDomain(node)} · {node.kind}{node.outcome ? ` · ${node.outcome.replaceAll("_", " ")}` : ""}{(forest.incoming.get(node.id)?.length ?? 0) > 1 ? ` · ${forest.incoming.get(node.id)!.length} sources` : ""}</span>
    </button>
    {children.length ? <><button type="button" className={styles.expand} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "−" : "+"} {children.length} connected {children.length === 1 ? "resource" : "resources"}</button>{expanded ? <ul className={depth < 5 ? styles.children : undefined}>{children.slice(0, limit).map(child => <ResourceBranch key={child.id} node={child} forest={forest} selectedId={selectedId} onSelect={onSelect} scenario={scenario} contexts={contexts} depth={depth + 1} />)}{limit < children.length ? <li><button className={styles.expand} type="button" onClick={() => setLimit(limit + 20)}>Show next connected resources</button></li> : null}</ul> : null}</> : null}
  </li>;
}
