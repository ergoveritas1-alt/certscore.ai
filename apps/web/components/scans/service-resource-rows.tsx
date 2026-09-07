"use client";

import { useId, useState } from "react";
import type { ApiRuntimeEvidenceGraph } from "@certscore/api-contracts";
import type { FullSiteReportResponse } from "../../server/scans/full-site-report";
import { crawlOccurrenceGraphIdentity, matchInventoryResources } from "../../lib/scans/inventory-resource-relationships";
import { useInventoryResourceEvidence } from "./inventory-resource-details";
import { InventoryNameDisclosure } from "./inventory-name-disclosure";
import { InventoryEvidenceIcon } from "./inventory-evidence-icon";
import { InventoryTypeIcon } from "./inventory-type-icon";
import { InventoryPurposeChip, InventoryPurposeList } from "./inventory-cell-formatting";
import { VendorBrandIcon } from "./vendor-brand-chip";
import { PolicyDisclosure, DataTransferDisclosure, PageUrlDisclosure } from "./full-site-resource-context";
import { CopyJsonButton } from "./copy-json-button";
import { RELATIONS, nodeDomain, observationTime, type GraphNode, type GraphEdge } from "./runtime-evidence-graph-model";

type ResourceContext = FullSiteReportResponse["resources"]["rows"][number];
type Resource = FullSiteReportResponse["services"][number]["resources"][number];
type Link = { node: GraphNode; edge: GraphEdge; direction: "Parent" | "Child" };
const control = "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded px-1 text-sky-700 hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500";
const cell = "px-3 py-2 text-xs";

/** Edges retain their observed direction and relation; duplicate targets are displayed once per direction. */
export function serviceResourceLinks(graph: ApiRuntimeEvidenceGraph, ids: string[]): Link[] {
  const roots = new Set(ids);
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const links = new Map<string, Link>();
  for (const edge of graph.edges) {
    const direction = roots.has(edge.from) ? "Child" : roots.has(edge.to) ? "Parent" : undefined;
    if (!direction) continue;
    const node = nodes.get(direction === "Child" ? edge.to : edge.from);
    if (node && !roots.has(node.id)) {
      const key = `${direction}:${node.id}`;
      if (!links.has(key)) links.set(key, { node, edge, direction });
    }
  }
  return [...links.values()].sort((a, b) => a.direction.localeCompare(b.direction) || a.node.observedAtMs - b.node.observedAtMs || a.node.id.localeCompare(b.node.id));
}

export function ExpandRowsButton({ label, open, count, controls, countHint, onClick }: { label: string; open: boolean; count?: number; controls?: string; countHint?: string; onClick: () => void }) {
  return <button type="button" className={`${control} shrink-0 cursor-pointer border shadow-sm ${open ? "border-sky-300 bg-sky-100" : "border-slate-200 bg-slate-50 hover:border-sky-300"}`} onClick={onClick} aria-expanded={open} aria-controls={controls} aria-label={label} title={countHint ?? (count === undefined ? label : `${label}: ${count} linked resources`)}>
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={`transition-transform ${open ? "rotate-90" : ""}`}><path d="m7 4 6 6-6 6"/></svg>
  </button>;
}
function RelationshipControl({ name, open, count, countHint, onClick }: { name: string; open: boolean; count?: number; countHint?: string; onClick: () => void }) {
  return <button type="button" className={`${control} shrink-0 cursor-pointer gap-1.5 border !px-2 shadow-sm ${open ? "border-sky-300 bg-sky-100" : "border-slate-200 bg-slate-50 hover:border-sky-300"}`} aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} related resources for ${name}`} title={countHint ?? `${open ? "Hide" : "Show"} related resources${count === undefined ? "" : ` (${count})`}`} onClick={onClick}>
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 6v8h8M5 10h8"/><circle cx="5" cy="4" r="2"/><circle cx="15" cy="10" r="2"/><circle cx="15" cy="15" r="2"/></svg>
    <svg aria-hidden="true" width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}><path d="m7 4 6 6-6 6"/></svg>
  </button>;
}

function JsonEvidence({ name, value, onOpen }: { name: string; value: unknown; onOpen?: () => void }) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const json = shown ? JSON.stringify(value, null, 2) : "";
  return <><button type="button" popoverTarget={id} onClick={() => { setShown(true); onOpen?.(); }} className={`${control} font-mono !text-slate-500 hover:!text-sky-700`} title="Technical evidence (JSON)" aria-label={`View JSON evidence for ${name}`}><span aria-hidden="true">{"{}"}</span></button>
    <div id={id} popover="auto" role="dialog" aria-label={`JSON evidence for ${name}`} onToggle={event => setShown(event.newState === "open")} className="m-auto max-h-[80vh] w-[min(48rem,calc(100vw-2rem))] overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-semibold">Technical evidence · JSON</h3><div className="flex items-center gap-3"><CopyJsonButton payload={json} className="inline-flex p-1 text-sky-700"/><button type="button" popoverTarget={id} popoverTargetAction="hide" aria-label="Close JSON evidence">Close</button></div></div>
      <p className="mb-3 break-all text-xs text-slate-600">{name}</p><pre className="whitespace-pre-wrap break-all rounded bg-slate-50 p-3 text-xs">{json}</pre>
    </div></>;
}

export function ServiceResourceRows({ row, pageName, scenario = "pre_consent", collapseVersion = 0, resourceContext, serviceContext, nested = false }: { nested?: boolean; serviceContext?: ResourceContext["context"]; resourceContext?: ResourceContext; collapseVersion?: number; row: Resource; pageName: (id: string) => string; scenario?: ApiRuntimeEvidenceGraph["scenario"] }) {
  const [openVersion, setOpenVersion] = useState<number>();
  const open = openVersion === collapseVersion;
  const context = resourceContext?.context ?? serviceContext;
  const { projection, load, error, sourceAvailable } = useInventoryResourceEvidence();
  const graph = projection?.graphs.find(item => item.scenario === scenario);
  const matches = graph ? matchInventoryResources(graph, crawlOccurrenceGraphIdentity(row.occurrence)) : [];
  const links = graph ? serviceResourceLinks(graph, matches.map(node => node.id)) : [];
  const pages = row.pageIds.map(pageName);
  const occurrence = row.occurrence;
  const colSpan = 12;
  const pending = Boolean(projection?.details || (sourceAvailable && !projection));
  const status = error ?? (pending ? "Loading retained relationship evidence…" : !graph ? "No relationship graph was retained for this scenario." : !matches.length ? "No unambiguous graph resource match was retained for this row." : !links.length ? "No links were retained for this resource." : undefined);
  return <><tr className={`h-14 border-b border-zinc-100 ${open ? "bg-sky-50/40" : "hover:bg-zinc-50"}`}>

    <td className="w-14 px-2 text-center text-xs font-medium tabular-nums text-slate-600" title="Retained events for this resource">{row.eventCount}</td>
    <td className={`${cell} w-12 text-center`}><InventoryTypeIcon kind={row.kind}/></td>
    <th scope="row" className={`${cell} font-normal`}><div className={`flex max-w-72 items-center gap-2 ${nested ? "ml-3 border-l border-slate-200 pl-3" : ""}`}>{open || !graph || links.length ? <RelationshipControl name={row.name} open={open} count={graph && matches.length ? links.length : resourceContext?.relationshipCount} countHint={!graph && resourceContext?.relationshipCount !== undefined ? `${resourceContext.relationshipCount} retained children; expand to load parents and children` : undefined} onClick={() => { setOpenVersion(open ? undefined : collapseVersion); if (!open) load(); }}/> : <span className="w-[50px] shrink-0" aria-hidden="true"/>}<VendorBrandIcon label={occurrence.vendor ?? occurrence.domain ?? row.name}/><div className="min-w-0">{occurrence.vendor ? <span title={occurrence.vendor} className="block truncate text-xs font-medium text-slate-800">{occurrence.vendor}</span> : null}<InventoryNameDisclosure compact fullName={row.name} className={occurrence.vendor ? "text-[11px]" : ""}/></div></div></th>
    <td className={`${cell} w-12 text-center`}><InventoryEvidenceIcon evidence={row.inventoryEvidence}/></td>
    <td className={cell}><InventoryPurposeList purposes={row.purposes} relationships={row.relationships}/></td>
    {context ? <><td className={cell}><PolicyDisclosure context={context} label={row.name}/></td><td className={cell}><DataTransferDisclosure location requestUrls={row.kind === "request" ? [row.name] : []} context={context} destinations={resourceContext?.destinations ?? row.destinations} resourceKind={row.kind} coverage={{ assessed: row.destinationAssessedCount, total: row.eventCount, missing: row.destinationMissingCount, truncated: row.destinationsTruncated }} label={row.name}/></td></> : <><td className={cell}>—</td><td className={cell}>—</td></>}
    <td className={`${cell} whitespace-nowrap`}>{occurrence.firstSeenMs == null ? "Unavailable" : observationTime(occurrence.firstSeenMs)}</td>
    <td className={cell}><span className="block max-w-40 truncate" title={occurrence.domain ?? undefined}>{occurrence.domain ?? "Unknown"}</span></td>
    <td className={`${cell} whitespace-nowrap capitalize`}>{row.relationships.map(value => value.replaceAll("_", " ")).join(", ") || "Unknown"}</td>
    <td className={cell}><PageUrlDisclosure pages={pages}/></td>
    <td className={`${cell} sticky right-0 bg-white/95`}><JsonEvidence name={row.name} onOpen={load} value={{ occurrence, inventoryEvidence: row.inventoryEvidence, siteRelationship: row.relationships, capturedOnPages: pages, context, destinations: resourceContext?.destinations ?? row.destinations, scenario, relationshipEvidence: graph ? { coverage: graph.coverage, resources: matches, edges: graph.edges.filter(edge => matches.some(node => node.id === edge.from || node.id === edge.to)), stacks: graph.stacks.filter(stack => matches.some(node => node.stackId === stack.id)) } : { status: error ?? (pending ? "Not loaded" : "Not retained") } }} /></td>
  </tr>{open ? <>
    {status ? <tr className="border-t border-slate-100 bg-slate-50/50"><td colSpan={colSpan} className="px-3 py-2 text-xs text-slate-500"><span role="status">{status}</span>{error ? <button type="button" onClick={load} className="ml-3 text-sky-700 underline">Retry loading evidence</button> : null}</td></tr> : null}
    {graph ? <LinkedRows key={scenario} graph={graph} links={links} path={matches.map(node => node.id)} depth={1} indentBase={nested ? 40 : 24} pages={pages}/> : null}
  </> : null}</>;
}

function LinkedRows({ graph, links, path, depth, pages, indentBase }: { indentBase: number; graph: ApiRuntimeEvidenceGraph; links: Link[]; path: string[]; depth: number; pages: string[] }) {
  const [limit, setLimit] = useState(30);
  return <>{links.slice(0, limit).map(link => <LinkedRow key={`${link.direction}:${link.node.id}`} graph={graph} link={link} path={path} depth={depth} indentBase={indentBase} pages={pages}/>)}{links.length > limit ? <tr><td colSpan={12} className={cell}><button type="button" className="text-sky-700 underline" onClick={() => setLimit(value => value + 30)}>Show more linked resources ({links.length - limit} remaining)</button></td></tr> : null}</>;
}

function RelationshipDirectionIcon({ direction, edge }: { direction: Link["direction"]; edge: GraphEdge }) {
  const label = `${direction} resource · ${RELATIONS[edge.relation]} · ${edge.directness}`;
  return <span role="img" aria-label={label} title={label} tabIndex={0} className="inline-flex shrink-0 rounded text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={direction === "Parent" ? "M16 16h-5a5 5 0 0 1-5-5V3m-4 4 4-4 4 4" : "M4 4h5a5 5 0 0 1 5 5v8m-4-4 4 4 4-4"}/>
    </svg>
  </span>;
}

function LinkedRow({ graph, link, path, depth, pages, indentBase }: { indentBase: number; graph: ApiRuntimeEvidenceGraph; link: Link; path: string[]; depth: number; pages: string[] }) {
  const [open, setOpen] = useState(false);
  const { node, edge, direction } = link;
  const cyclic = path.includes(node.id);
  const links = serviceResourceLinks(graph, [node.id]).filter(next => next.node.id !== path.at(-1));
  const name = node.url ?? node.cookie?.name ?? node.label;
  return <><tr data-service-relationship={node.id} className="h-11 border-t border-slate-100 bg-slate-50/50 hover:bg-sky-50/50">

    <td className="w-14 px-2 text-center text-xs text-slate-400" title="Linked occurrence; not an additional inventory count">—</td>
    <td className={`${cell} w-12 text-center`}><InventoryTypeIcon kind={node.kind}/></td>
    <th scope="row" className={`${cell} font-normal`}><div className="max-w-64 border-l border-slate-200 pl-2" style={{ marginLeft: indentBase + Math.min(depth, 4) * 12 }}><div className="mb-0.5 flex items-center gap-1 whitespace-nowrap text-[10px] text-slate-500"><RelationshipDirectionIcon direction={direction} edge={edge}/>{edge.directness === "inferred" ? <span>Inferred</span> : null}{cyclic ? <span>· Cycle</span> : depth >= 8 ? <span>· Depth limit</span> : null}</div><div className="flex items-center gap-2">{links.length > 0 && !cyclic && depth < 8 ? <RelationshipControl name={name} open={open} count={links.length} onClick={() => setOpen(!open)}/> : null}<InventoryNameDisclosure compact fullName={name}/></div></div></th>
    <td className={`${cell} text-slate-500`} title="Linked evidence occurrence; no inventory finding classification supplied">—</td>
    <td className={cell}>{node.classification?.purpose ? <InventoryPurposeChip purpose={node.classification.purpose.replaceAll("_", " ")}/> : <span className="text-slate-400" title="Purpose not retained">—</span>}</td>
    <><td className={cell} title="Policy disclosure is not supplied for this linked occurrence">—</td><td className={cell} title="Transfer context is not supplied for this linked occurrence">—</td></>
    <td className={`${cell} whitespace-nowrap`}>{observationTime(node.observedAtMs)}</td>
    <td className={cell}><span className="block max-w-40 truncate" title={nodeDomain(node)}>{nodeDomain(node)}</span></td>
    <td className={cell} title="Site relationship is not supplied for this linked evidence occurrence"><span className="text-slate-400">—</span></td>
    <td className={cell}><PageUrlDisclosure pages={pages}/></td>
    <td className={`${cell} sticky right-0 bg-white/95`}><JsonEvidence name={name} value={{ node, scenario: graph.scenario, incoming: graph.edges.filter(item => item.to === node.id), outgoing: graph.edges.filter(item => item.from === node.id), stack: graph.stacks.find(item => item.id === node.stackId) }}/></td>
  </tr>{open && !cyclic && depth < 8 ? <LinkedRows graph={graph} links={links} path={[...path, node.id]} depth={depth + 1} indentBase={indentBase} pages={pages}/> : null}</>;
}
