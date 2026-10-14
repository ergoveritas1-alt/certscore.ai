"use client";

import { INVENTORY_CLASSIFICATION_ORDER } from "../../lib/scans/inventory-resource-semantics";
import { useRef, useState } from "react";
import { TableScrollHint } from "./compact-scroll-hint";
import { matchesInventoryResource } from "../../lib/scans/inventory-search";
import type { SinglePageResourceInventory as Inventory } from "../../lib/scans/single-page-resource-inventory";
import type { ShadowReportData } from "./report-lab/shadow-report-data";
import { useReportInventoryNavigation } from "./report-inventory-navigation";
import { SitewideInventorySummary } from "./sitewide-inventory-summary";
import { FullSiteServices } from "./full-site-services-table";
import { ServiceResourceRows } from "./service-resource-rows";
import { InventoryResourceProvider } from "./inventory-resource-details";
import { CopyJsonButton } from "./copy-json-button";
import { InventoryPriorityHelp } from "./inventory-priority-help";
import { buildServiceHierarchy, countHierarchyServices } from "../../lib/scans/service-hierarchy";

export function SinglePageResourceInventory({ inventory, report }: { inventory: Inventory; report: ShadowReportData }) {
  const [localView, setLocalView] = useState<"services" | "resources">("services");
  const navigation = useReportInventoryNavigation();
  const view = navigation?.view ?? localView;
  const setView = navigation?.setView ?? setLocalView;
  const [sort, setSort] = useState<{key: "priority" | "name"; descending: boolean}>({key: "priority", descending: false});
  const [collapseVersion, setCollapseVersion] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);
  const priorities: readonly string[] = INVENTORY_CLASSIFICATION_ORDER;
  const rank = (value: string) => { const index = priorities.indexOf(value); return index < 0 ? priorities.length : index; };
  const kind = navigation?.kind ?? "all";
  const search = { query: "", purpose: "", kind };
  const filtered = kind !== "all";
  const serviceNames = new Map(inventory.services.flatMap(service => service.resources.map(row => [row.key, service.name] as const)));
  const resources = inventory.resources.filter(row => matchesInventoryResource(row, search, serviceNames.get(row.key))).sort((a, b) => {
    const difference = sort.key === "name" ? a.name.localeCompare(b.name) : rank(a.inventoryEvidence) - rank(b.inventoryEvidence);
    return (sort.descending ? -difference : difference) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
  });
  const matchedKeys = new Set(resources.map(row => row.key));
  const services = filtered ? inventory.services.map(service => ({ ...service, resources: service.resources.filter(row => matchedKeys.has(row.key)) })).filter(service => service.resources.length) : inventory.services;
  const serviceCount = countHierarchyServices(buildServiceHierarchy(services));
  const toggleSort = (key: "priority" | "name") => setSort(current => ({key, descending: current.key === key ? !current.descending : false}));
  const pageName = () => report.scan.url;
  return <section id="report-resource-inventory" aria-label="Resources and services" className="my-5 rounded-xl border border-zinc-200 bg-white p-4 lg:p-5">
    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pre-consent supporting evidence</p>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold tracking-tight text-zinc-950">Services & Resources</h2><div className="flex shrink-0 gap-1" role="group" aria-label="Inventory view">{(["services", "resources"] as const).map(value => <button key={value} type="button" aria-pressed={view === value} onClick={() => { setView(value); }} className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${view === value ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>{value}</button>)}</div></div>
    <div className="my-2 flex items-start justify-between gap-3">
      <details className="min-w-0 flex-1"><summary className="w-fit cursor-pointer rounded px-1 py-1.5 text-xs font-medium leading-5 text-zinc-600 hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600">Resource breakdowns</summary><div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 [&>section]:my-0 [&>section]:border-0"><SitewideInventorySummary mix={inventory.mix}/></div></details>
      <div className="flex shrink-0 items-center gap-2"><button type="button" className="h-8 rounded px-2 text-xs text-sky-700 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600" onClick={() => setCollapseVersion(value => value + 1)}>Collapse all</button><CopyJsonButton label="Copy entire resource table as JSON" payload={JSON.stringify({resources: inventory.resources, services: inventory.services}, null, 2)} className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-200 text-sky-700"/></div>
    </div>
    <div className="group/scroll">
    <div ref={tableRef} className="max-h-[376px] overflow-auto rounded border border-zinc-200" role="region" aria-label="Scrollable resource inventory" tabIndex={0}>
      {view === "services" ? <FullSiteServices collapseVersion={collapseVersion} services={services} pageName={pageName} pageChoices={[{ id: report.scan.id, url: report.scan.url, source: "homepage", status: "completed", limitation: null, httpStatus: null, graphSource: undefined }]} homepageGraph={report.runtimeEvidenceGraph}/>
        : <InventoryResourceProvider projection={report.runtimeEvidenceGraph}><table className="w-full text-left text-xs"><caption className="sr-only">Retained pre-consent resources</caption><thead className="sticky top-0 z-10 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500"><tr>{["Observations", "Type", "Name", "Priority", "Purpose", "Policy disclosure", "Location", "First seen", "Domain", "Site relationship", "Page", "JSON"].map(label => <th key={label} className="h-10 whitespace-nowrap border-b px-3" aria-sort={(label === "Name" && sort.key === "name") || (label === "Priority" && sort.key === "priority") ? sort.descending ? "descending" : "ascending" : undefined}><div className="flex items-center gap-1">{label === "Name" || label === "Priority" ? <button type="button" className="flex items-center gap-1 rounded uppercase tracking-wider hover:text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500" onClick={() => toggleSort(label === "Name" ? "name" : "priority")}>{label}<span aria-hidden="true">{sort.key === label.toLowerCase() ? sort.descending ? "↓" : "↑" : "↕"}</span></button> : label}{label === "Priority" ? <InventoryPriorityHelp/> : null}</div></th>)}</tr></thead><tbody>{!resources.length ? <tr><td colSpan={12} className="px-4 py-6 text-center text-slate-500">{filtered ? "No resources of this type observed." : "No resources observed."}</td></tr> : null}{resources.map(row => <ServiceResourceRows key={row.key} row={row} serviceContext={row.context} pageName={pageName} collapseVersion={collapseVersion}/>)}</tbody></table></InventoryResourceProvider>}
    </div><div className="flex flex-wrap items-center justify-between gap-x-3"><TableScrollHint scrollRef={tableRef} noun={view} /><p className="mt-0.5 text-[11px] leading-4 text-zinc-500">{view === "services" ? `${serviceCount} distinct ${serviceCount === 1 ? "service" : "services"}, including child services and unattributed resources` : `${resources.length} distinct ${resources.length === 1 ? "resource" : "resources"}`}</p></div>
    </div>
  </section>;
}
