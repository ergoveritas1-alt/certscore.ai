"use client";

import React, { Children, cloneElement, createContext, useContext, useEffect, useId, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { apiRuntimeEvidenceGraphProjectionSchema, type ApiRuntimeEvidenceGraphProjection, type ApiRuntimeEvidenceGraph } from "@certscore/api-contracts";
import { RetainedEvidenceFields } from "./retained-evidence-fields";
import { nodeDomain, nodeTitle, observationTime, RELATIONS, SCENARIOS, type GraphNode } from "./runtime-evidence-graph-model";
import { VendorBrandIcon } from "./vendor-brand-chip";
import { InventoryEvidenceIcon } from "./inventory-evidence-icon";
import { InventoryNameDisclosure } from "./inventory-name-disclosure";
import { InventoryConfidenceDots, InventoryPurposeChip } from "./inventory-cell-formatting";
import { CopyJsonButton } from "./copy-json-button";

function ResourceKindIcon({ kind }: { kind: string }) {
  const path = kind === "request" ? "M4 12h16m-6-6 6 6-6 6" : kind === "response" ? "M20 12H4m6-6-6 6 6 6" : kind === "script" ? "m8 7-5 5 5 5m8-10 5 5-5 5m-3-12-2 14" : kind === "cookie" ? "M20 13a8 8 0 1 1-9-9 4 4 0 0 0 5 5 4 4 0 0 0 4 4ZM8 9h.01M8 15h.01M13 14h.01" : "M5 3h9l5 5v13H5ZM14 3v6h5M8 13h8M8 17h5";
  return <span title={kind} aria-label={kind} className="inline-flex text-slate-500"><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"><path d={path}/></svg></span>;
}

export type InventoryResourceIdentity = {
  nodeRefs?: string[];
  cookieRefs: string[];
  products?: string[];
  requests: Array<{ hostname: string | null; path: string | null; method: string | null }>;
};
const EvidenceContext = createContext<{ projection?: ApiRuntimeEvidenceGraphProjection; load: () => void; error?: string; sourceAvailable?: boolean }>({ load() {} });
const button = "rounded-md px-2 py-1.5 text-xs text-sky-700 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500";

function InspectButton({ open, onClick, controls, name = "resource" }: { open: boolean; onClick: () => void; controls?: string; name?: string }) {
  const label = `${open ? "Close" : "Inspect"} ${name} details`;
  return <button type="button" aria-label={label} title={label} aria-expanded={open} aria-controls={controls} onClick={onClick} className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 ${open ? "bg-sky-100 text-sky-800" : "text-sky-700 hover:bg-sky-100"}`}><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5M8 10.5h5M10.5 8v5"/></svg></button>;
}

function RelationshipButton({ count, open, onClick, deferred = false, unavailable = false }: { count: number; open: boolean; onClick: () => void; deferred?: boolean; unavailable?: boolean }) {
  const label = unavailable ? "Explain unavailable relationship evidence" : deferred ? "Load retained relationship links" : `${open ? "Hide" : "Show"} ${count} immediate ${count === 1 ? "link" : "links"}; descendants expand separately`;
  return <button type="button" aria-label={label} title={label} aria-expanded={open} onClick={onClick} className="inline-flex h-7 shrink-0 items-center gap-1 rounded px-1 text-[11px] tabular-nums text-sky-700 hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 6v11h10M6 10h10"/><circle cx="6" cy="4" r="2"/><circle cx="18" cy="10" r="2"/><circle cx="18" cy="17" r="2"/></svg><span>{unavailable ? "—" : deferred ? "…" : count}</span><svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" className={open ? "rotate-90" : ""}><path d="m4 2 4 4-4 4"/></svg></button>;
}

function resourceDisplayName(node: GraphNode) {
  if (node.cookie || node.kind === "storage") return nodeTitle(node);
  try { const url = new URL(node.url!); return url.pathname === "/" ? url.hostname : url.pathname.split("/").filter(Boolean).at(-1)!; } catch { return nodeTitle(node); }
}

export type InventoryGraphSource = { href: string; scanId: string; sha256: string };
const pageGraphReads = new Map<string, Promise<ApiRuntimeEvidenceGraphProjection>>();
function readPageGraph(source: InventoryGraphSource) {
  const key = `${source.href}:${source.scanId}:${source.sha256}`;
  let read = pageGraphReads.get(key);
  if (!read) {
    read = (async () => {
      const response = await fetch(source.href, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(response.status === 429 ? "Read limit reached. Retry after the indicated cooldown." : "Page relationship evidence could not be loaded.");
      const projection = apiRuntimeEvidenceGraphProjectionSchema.parse(await response.json());
      if (projection.scanId !== source.scanId || projection.sourceBundle?.sha256 !== source.sha256 || projection.details) throw new Error("Page relationship evidence did not verify.");
      return projection;
    })();
    pageGraphReads.set(key, read);
    if (pageGraphReads.size > 32) pageGraphReads.delete(pageGraphReads.keys().next().value!);
    void read.catch(() => { if (pageGraphReads.get(key) === read) pageGraphReads.delete(key); });
  }
  return read;
}

/** One deferred read for the whole inventory. Expanding rows never creates additional scans. */
export function InventoryResourceProvider({ projection: initial, source, preload = false, children }: { projection?: ApiRuntimeEvidenceGraphProjection; source?: InventoryGraphSource; preload?: boolean; children: ReactNode }) {
  const [requested, setRequested] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string>();
  const [loaded, setLoaded] = useState<{ key: string; projection: ApiRuntimeEvidenceGraphProjection }>();
  const key = source ? `${source.href}:${source.scanId}:${source.sha256}` : `${initial?.scanId}:${initial?.details?.sha256}:${initial?.sourceBundle?.sha256}`;
  useEffect(() => {
    if ((!requested && !preload) || (!initial?.details && !source) || loaded?.key === key) return;
    const abort = new AbortController(); setError(undefined);
    void (async () => {
      try {
        if (source) {
          const projection = await readPageGraph(source);
          if (!abort.signal.aborted) setLoaded({ key, projection });
          return;
        }
        const response = await fetch(initial!.details!.href, { credentials: "same-origin", cache: "no-store", signal: abort.signal });
        if (!response.ok) throw new Error(response.status === 429 ? `Read limit reached. Wait ${response.headers.get("Retry-After") ?? "the indicated number of"} seconds before retrying.` : "Resource evidence could not be loaded. Retry without rescanning.");
        const parsed = apiRuntimeEvidenceGraphProjectionSchema.safeParse(await response.json());
        if (!parsed.success || parsed.data.scanId !== initial!.scanId || parsed.data.sourceBundle?.sha256 !== initial!.sourceBundle?.sha256 || parsed.data.details) throw new Error("The retained relationship evidence did not verify.");
        setLoaded({ key, projection: parsed.data });
      } catch (failure) { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : "Evidence unavailable."); }
    })();
    return () => abort.abort();
  }, [requested, preload, key, initial, source, loaded?.key, attempt]);
  return <EvidenceContext.Provider value={{ projection: loaded?.key === key ? loaded.projection : initial, sourceAvailable: Boolean(source), error, load: () => { setRequested(true); if (error) setAttempt(value => value + 1); } }}>{children}</EvidenceContext.Provider>;
}

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

/** Companion row remains attached to its owner when the existing table is sorted. */
export function InventoryResourceRow({ children, identity, facts, inspect = false, relationships = true, positiveRelationshipsOnly = false, existingDetails, evidence }: { children: ReactElement<{ children?: ReactNode; "data-resource-owner"?: string }>; identity: InventoryResourceIdentity; facts: Record<string, unknown>; inspect?: boolean; relationships?: boolean; positiveRelationshipsOnly?: boolean; existingDetails?: ReactNode; evidence?: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const id = useId();
  // Server-rendered cells may arrive as a lazy RSC element on streamed real reports.
  const resolvedRow = Children.toArray(children)[0] as typeof children;
  const { projection, load, error, sourceAvailable } = useContext(EvidenceContext);
  const graph = projection?.graphs.find(item => item.scenario === "pre_consent");
  const matches = graph ? matchInventoryResources(graph, identity) : [];
  const sources = graph ? new Set(graph.edges.filter(edge => matches.some(node => node.id === edge.to)).map(edge => edge.from)).size : 0;
  const childEdges = [...new Map((graph?.edges.filter(edge => matches.some(node => node.id === edge.from)) ?? []).map(edge => [edge.to, edge])).values()];
  const toggleDetails = () => { setOpen(!open); if (!open) load(); };
  const control = <td key="details" className={inspect ? "bg-white px-2 py-1 md:sticky md:left-0 md:z-10" : "sticky right-0 bg-white px-2 py-1.5 align-middle border-l border-slate-100"}>{inspect ? <span className="inline-flex items-center gap-1"><InspectButton open={open} controls={id} name={typeof facts.name === "string" ? facts.name : undefined} onClick={toggleDetails} /><InventoryEvidenceIcon evidence={typeof facts.evidence === "string" ? facts.evidence : undefined} /></span> : <button type="button" className={button} aria-expanded={open} aria-controls={id} onClick={toggleDetails}>{`${open ? "−" : "+"} ${sources ? `${sources} ${sources === 1 ? "source" : "sources"}` : "Details"}`}</button>}</td>;
  const cells = Children.toArray(resolvedRow.props.children);
  const showRelationships = relationships && (!positiveRelationshipsOnly || childEdges.length > 0);
  const vendorCell = inspect && (relationships || positiveRelationshipsOnly) && React.isValidElement<{ children?: ReactNode }>(cells[2]) ? cloneElement(cells[2], {}, <div className="flex min-w-0 items-center gap-1 whitespace-nowrap"><span className="inline-flex w-16 shrink-0">{showRelationships ? <RelationshipButton count={childEdges.length} open={treeOpen} unavailable={!graph && !projection?.details && !sourceAvailable} deferred={Boolean(projection?.details || (sourceAvailable && !graph))} onClick={() => { setTreeOpen(!treeOpen); load(); }} /> : null}</span><div className="min-w-0 truncate">{cells[2].props.children}</div></div>) : cells[2];
  const row = cloneElement(resolvedRow, { "data-resource-owner": id }, ...(inspect ? [control, cells[1], vendorCell, ...cells.slice(3)] : [...cells, control]));
  return <>{row}<tr hidden={!open} data-resource-detail={id}><td colSpan={cells.length + (inspect ? 0 : 1)} className="bg-slate-50/60 px-5 py-4"><div id={id} className="w-[calc(100vw-7rem)] max-w-5xl">{open ? <ResourceDetails identity={identity} facts={facts} summary={existingDetails} evidence={evidence} /> : null}</div></td></tr>
    {inspect && treeOpen && (error || !childEdges.length) ? <tr data-relationship-status={id} data-resource-detail={id}><td colSpan={cells.length} className="bg-sky-50/40 px-5 py-3 text-xs text-slate-600"><p role="status">{error ?? (projection?.details || (sourceAvailable && !graph) ? "Loading retained relationship evidence…" : !graph ? "No relationship graph was retained for this scan’s pre-consent session. Resource identities alone cannot establish parent/child links." : !matches.length ? "No unambiguous graph resource match was retained for this row." : "No outgoing links were retained for this resource. This does not prove there were no children.")}</p>{error ? <button type="button" className={button} onClick={load}>Retry loading evidence</button> : null}</td></tr> : null}
    {inspect && treeOpen && graph ? childEdges.slice(0, 30).map(edge => <MainRelationshipRow key={edge.id} graph={graph} edge={edge} path={[edge.from]} depth={1} evidencePage={typeof facts.evidencePage === "string" ? facts.evidencePage : undefined} />) : null}{inspect && treeOpen && childEdges.length > 30 ? <tr><td colSpan={cells.length} className="px-5 py-2 text-xs text-slate-500">Showing 30 connected resources. Inspect retains all links and searchable fields.</td></tr> : null}</>;
}

export function InventoryResourceMobile({ identity, facts }: { identity: InventoryResourceIdentity; facts: Record<string, unknown> }) {
  const { load } = useContext(EvidenceContext); const [open, setOpen] = useState(false);
  return <details className="mt-2 border-t border-slate-100" onToggle={event => { if (event.target !== event.currentTarget) return; setOpen(event.currentTarget.open); if (event.currentTarget.open) load(); }}><summary className="cursor-pointer py-2 text-xs text-sky-700">Relationships &amp; resource details</summary>{open ? <ResourceDetails identity={identity} facts={facts} /> : null}</details>;
}

/** Retained graph resources use the same ten columns as the production inventory. */
function MainRelationshipRow({ graph, edge, path, depth, evidencePage }: { evidencePage?: string; graph: ApiRuntimeEvidenceGraph; edge: ApiRuntimeEvidenceGraph["edges"][number]; path: string[]; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState(false);
  const node = graph.nodes.find(item => item.id === edge.to);
  if (!node) return null;
  const children = graph.edges.filter(item => item.from === node.id);
  const cyclic = path.includes(node.id);
  const cell = "px-3 py-2 text-xs text-slate-600";
  const indent = Math.min(depth, 3) * 12;
  return <><tr data-main-relationship={node.id} className="border-b border-slate-100 bg-sky-50/40">
    <td className="px-2 py-1"><span className="inline-flex items-center gap-1"><InspectButton name={resourceDisplayName(node)} open={details} onClick={() => setDetails(!details)} /><InventoryEvidenceIcon /></span></td>
    <td className={cell}><ResourceKindIcon kind={node.kind}/></td>
    <td className={cell}><div className="flex min-w-0 items-center gap-1" style={{ paddingLeft: indent }}><span className="inline-flex w-16 shrink-0 items-center border-l border-sky-200" ><span aria-hidden="true" className="text-sky-400">↳</span>{children.length > 0 && !cyclic ? <RelationshipButton count={children.length} open={expanded} onClick={() => setExpanded(!expanded)} /> : null}</span><span className="flex min-w-0 items-center gap-2"><VendorBrandIcon label={node.classification?.vendor ?? "Unknown"}/><span className="truncate">{node.classification?.vendor ?? "Unknown"}</span></span></div></td>
    <td className={cell}><div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: indent }}><div className="min-w-0"><InventoryNameDisclosure compact fullName={resourceDisplayName(node)}/></div><span className={`shrink-0 text-[10px] ${edge.directness === "direct" ? "text-slate-500" : "text-amber-700"}`} title={`${RELATIONS[edge.relation]} · ${edge.directness}`}>{edge.directness}</span>{cyclic ? <span title="This resource already appears in this chain" className="text-[10px]">Cycle</span> : null}</div></td>
    <td className={cell}><InventoryPurposeChip purpose={node.classification?.purpose ?? "Not retained"} /></td>
    <td className={`${cell} whitespace-nowrap tabular-nums`}>{observationTime(node.observedAtMs)}</td>
    {evidencePage ? <td className={cell}><span className="block max-w-[30ch] truncate" title={evidencePage}>{evidencePage}</span></td> : null}
    <td className={`${cell} break-all`}>{nodeDomain(node)}</td>
    <td className={cell}><span className="sr-only">Site/entity relationship not supplied</span></td>{!evidencePage ? <><td className={cell}><InventoryConfidenceDots confidence={node.classification?.confidence ?? "Not retained"} description={node.classification ? `Vendor match confidence: ${Math.round(node.classification.confidence * 100)}%` : "Vendor match confidence: Not retained"} /></td><td className={cell}>—</td></> : null}
  </tr>{details ? <tr data-main-relationship-detail><td colSpan={evidencePage ? 9 : 10} className="bg-sky-50/30 px-5 py-3"><p className="text-xs text-slate-500">Linked evidence occurrence, not an additional inventory count or finding. Site/entity relationship was not supplied for this resource; vendor identity and parent-child links are separate evidence.</p><RetainedEvidenceFields value={{ node, incoming: graph.edges.filter(item => item.to === node.id), outgoing: children, stack: graph.stacks.find(item => item.id === node.stackId) }} /></td></tr> : null}
  {expanded && !cyclic ? children.slice(0, 30).map(child => <MainRelationshipRow key={child.id} graph={graph} edge={child} path={[...path, node.id]} depth={depth + 1} evidencePage={evidencePage} />) : null}{expanded && children.length > 30 ? <tr><td colSpan={evidencePage ? 9 : 10} className={cell}>Showing 30 children; all links remain available through Inspect.</td></tr> : null}</>;
}

export function ResourceDetails({ identity, facts, summary, evidence }: { identity: InventoryResourceIdentity; facts: Record<string, unknown>; summary?: ReactNode; evidence?: Record<string, unknown> }) {
  const { projection, error, load, sourceAvailable } = useContext(EvidenceContext);
  const [scenario, setScenario] = useState<ApiRuntimeEvidenceGraph["scenario"]>("pre_consent");
  const graph = projection?.graphs.find(item => item.scenario === scenario);
  // Cookie IDs belong to a capture. Do not reuse them to assert cross-session identity.
  const matches = useMemo(() => graph ? matchInventoryResources(graph, scenario === "pre_consent" ? identity : { ...identity, cookieRefs: [], nodeRefs: [] }) : [], [graph, identity, scenario]);
  const hasGraphs = Boolean(projection?.graphs.length || projection?.details || sourceAvailable);
  const exportEvidence = { inventory: facts, ...(evidence ? { observations: evidence } : {}), ...(projection ? { relationships: projection } : {}) };
  const summaryFields = [["Evidence page", facts.evidencePage], ["Service", facts.name ?? facts.products ?? facts.names ?? facts.vendor], ["Purpose", facts.purpose], ["Priority", facts.evidence ?? facts.classification], ["First observed", facts.observed ?? (typeof facts.firstSeenMs === "number" ? observationTime(facts.firstSeenMs) : undefined)], ["Domains", facts.domains], ["Site relationship", facts.relationship ?? facts.siteRelationship]];
  return <div className="min-w-0 max-w-full space-y-3 text-xs text-slate-600">
    {summary ?? <><h4 className="text-sm font-semibold text-slate-900">Resource summary</h4><dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{summaryFields.map(([label, value]) => typeof value === "string" || Array.isArray(value) ? <div key={String(label)}><dt className="text-slate-500">{String(label)}</dt><dd className="mt-1 break-words">{Array.isArray(value) ? value.join(", ") : value}</dd></div> : null)}</dl></>}
    {hasGraphs ? <div className="space-y-3 border-t border-slate-200 pt-3"><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-semibold text-slate-800">Relationships</h4><label className="flex items-center gap-2">Evidence scenario<select aria-label="Resource evidence scenario" className="rounded-md border border-slate-200 bg-white px-2 py-1.5" value={scenario} onChange={event => setScenario(event.target.value as typeof scenario)}>{SCENARIOS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
      {error ? <p role="status">{error} <button className={button} onClick={load} type="button">Retry loading evidence</button></p> : projection?.details || (sourceAvailable && !projection) ? <p role="status">Loading verified resource evidence…</p> : !graph ? <p>No relationship graph retained for this scenario; absence of relationships is not established.</p> : matches.length ? <ResourceEvidenceTable graph={graph} nodes={matches} /> : <p>No unambiguous resource match retained for this row.</p>}
    </div> : <p className="text-slate-500">Relationship coverage: no graph retained; this does not establish that no relationships exist.</p>}
    <details className="border-t border-slate-200 pt-1" data-inventory-technical-evidence>
      <summary className="cursor-pointer py-2 font-medium text-sky-700">Technical evidence</summary>
      <div className="space-y-3 pb-2">
        <div className="flex items-center justify-between gap-3"><p>Retained request details, supporting observations, and provenance.</p><CopyJsonButton label="Copy resource evidence JSON" payload={JSON.stringify(exportEvidence, null, 2)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:text-slate-950" /></div>
        <pre className="max-h-64 overflow-auto rounded-md bg-zinc-950 p-3 text-[0.68rem] leading-5 text-zinc-100">{JSON.stringify(exportEvidence, null, 2)}</pre>
        {graph ? <details><summary className="cursor-pointer py-2 font-medium">All captured resources in this scenario ({graph.nodes.length})</summary><ResourceEvidenceTable graph={graph} nodes={graph.nodes} /></details> : null}
      </div>
    </details>
  </div>;
}

function ResourceEvidenceTable({ graph, nodes }: { graph: ApiRuntimeEvidenceGraph; nodes: GraphNode[] }) {
  const [limit, setLimit] = useState(20);
  const filtered = nodes;
  return <div className="min-w-0 max-w-full space-y-2"><div className="overflow-auto rounded-lg border border-slate-200 bg-white"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr>{["Resource", "Type / outcome", "Observed", "Sources / children"].map(label => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{filtered.slice(0, limit).map(node => <EvidenceNodeRow key={node.id} node={node} graph={graph} path={[]} />)}</tbody></table></div>{limit < filtered.length ? <button type="button" className={button} onClick={() => setLimit(limit + 20)}>Show next resources ({filtered.length - limit} remaining)</button> : null}{!filtered.length ? <p>No retained resources.</p> : null}</div>;
}

function EvidenceNodeRow({ node, graph, path }: { node: GraphNode; graph: ApiRuntimeEvidenceGraph; path: string[] }) {
  const [open, setOpen] = useState(false); const [childrenOpen, setChildrenOpen] = useState(false); const [limit, setLimit] = useState(10);
  const sources = graph.edges.filter(edge => edge.to === node.id); const edges = graph.edges.filter(edge => edge.from === node.id);
  const byId = new Map(graph.nodes.map(item => [item.id, item]));
  return <><tr className="border-t border-slate-100 hover:bg-sky-50/40"><td className="px-3 py-2" style={{ paddingLeft: 12 + Math.min(path.length, 5) * 14 }}><button type="button" className="flex items-center gap-2 text-left font-medium text-slate-800" aria-expanded={open} onClick={() => setOpen(!open)}><span aria-hidden="true">{path.length ? "↳" : ""}{open ? "−" : "+"}</span><VendorBrandIcon label={node.classification?.vendor ?? "Unknown"} /><span>{nodeTitle(node)}<span className="block max-w-80 truncate text-[11px] font-normal text-slate-500">{nodeDomain(node)}</span></span></button></td><td className="px-3 py-2">{node.kind}<span className="block text-[11px] text-slate-500">{node.outcome?.replaceAll("_", " ") ?? "—"}</span></td><td className="whitespace-nowrap px-3 py-2 tabular-nums">{observationTime(node.observedAtMs)}</td><td className="px-3 py-2"><button className={button} type="button" onClick={() => setOpen(!open)}>{sources.length} {sources.length === 1 ? "source" : "sources"}</button>{edges.length ? <button className={button} type="button" aria-expanded={childrenOpen} onClick={() => setChildrenOpen(!childrenOpen)}>{childrenOpen ? "−" : "+"} {edges.length} {edges.length === 1 ? "child" : "children"}</button> : null}</td></tr>
    {open ? <tr className="border-t border-slate-100 bg-sky-50/30"><td colSpan={4} className="px-5 py-3"><div className="grid gap-4 md:grid-cols-2"><div><h5 className="font-semibold">Parents &amp; sources</h5>{sources.length ? sources.map(edge => <p key={edge.id} className="mt-1 break-words">{nodeTitle(byId.get(edge.from)!)} · {RELATIONS[edge.relation]} · {edge.directness}</p>) : <p>No source retained; not proof of no parent.</p>}</div><div><h5 className="font-semibold">Timing &amp; activity</h5><p>{observationTime(node.observedAtMs)} after capture start{node.method ? ` · ${node.method}` : ""}{node.status !== undefined ? ` · HTTP ${node.status}` : ""}</p>{graph.action ? <p>{graph.action.status === "confirmed" && graph.action.registeredAtMs !== undefined ? `${node.observedAtMs < graph.action.registeredAtMs ? "Before" : "After"} confirmed registration (timing only)` : "Action unconfirmed"}</p> : null}<p>{node.classification ? `${node.classification.vendor} · ${node.classification.purpose} · policy: ${node.classification.disclosure}` : "Vendor / policy classification not retained"}</p></div></div><RetainedEvidenceFields value={{ node, sources, children: edges, stack: graph.stacks.find(stack => stack.id === node.stackId) }} /></td></tr> : null}
    {childrenOpen ? edges.slice(0, limit).map(edge => path.includes(edge.to) || edge.to === node.id ? <tr key={edge.id}><td colSpan={4} className="px-5 py-2 text-slate-500">↳ {RELATIONS[edge.relation]} · cycle back to {nodeTitle(byId.get(edge.to)!)} (not expanded)</td></tr> : <EvidenceNodeRow key={edge.id} node={byId.get(edge.to)!} graph={graph} path={[...path, node.id]} />) : null}
    {childrenOpen && limit < edges.length ? <tr><td colSpan={4}><button type="button" className={button} onClick={() => setLimit(limit + 10)}>Show next children</button></td></tr> : null}
  </>;
}
