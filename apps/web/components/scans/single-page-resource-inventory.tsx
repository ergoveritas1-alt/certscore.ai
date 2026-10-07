"use client";

import { INVENTORY_METRIC_LABELS, INVENTORY_CLASSIFICATION_ORDER } from "../../lib/scans/inventory-resource-semantics";
import { useState } from "react";
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
  const priorities: readonly string[] = INVENTORY_CLASSIFICATION_ORDER;
  const rank = (value: string) => { const index = priorities.indexOf(value); return index < 0 ? priorities.length : index; };
  const kind = navigation?.kind ?? "all";
  const resources = inventory.resources.filter(row => kind === "all" || (kind === "cookie" ? row.kind === "cookie" || row.kind === "storage" : row.kind === kind)).sort((a, b) => {
    const difference = sort.key === "name" ? a.name.localeCompare(b.name) : rank(a.inventoryEvidence) - rank(b.inventoryEvidence);
    return (sort.descending ? -difference : difference) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
  });
  const services = inventory.services;
  const toggleSort = (key: "priority" | "name") => setSort(current => ({key, descending: current.key === key ? !current.descending : false}));
  const pageName = () => report.scan.url;
  return <section id="report-resource-inventory" aria-label="Resources and services" className="my-5 rounded-xl border border-zinc-200 bg-white p-4 lg:p-5">
    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pre-consent supporting evidence</p>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold tracking-tight text-zinc-950">Services & Resources</h2><div className="flex gap-2">{(["services", "resources"] as const).map(value => <button key={value} type="button" aria-pressed={view === value} onClick={() => { setView(value); navigation?.setKind("all"); }} className={`rounded border px-3 py-2 text-sm capitalize ${view === value ? "border-slate-900 bg-slate-900 text-white" : "border-zinc-200"}`}>{value}</button>)}</div></div>
    <details className="my-3 rounded-lg border border-zinc-200"><summary className="cursor-pointer px-4 py-3 text-xs font-medium text-zinc-600">Resource breakdowns</summary><div className="border-t border-zinc-100 px-4 py-3 [&>section]:my-0 [&>section]:border-0"><SitewideInventorySummary mix={inventory.mix}/></div></details>
    {view === "resources" && kind !== "all" ? <div className="mb-3 flex items-center gap-3 text-xs"><span className="font-medium text-slate-600">{kind === "cookie" ? INVENTORY_METRIC_LABELS.storage : kind === "embed" ? INVENTORY_METRIC_LABELS.frames : INVENTORY_METRIC_LABELS.requests}</span><button type="button" className="rounded text-sky-700 hover:underline" onClick={() => navigation?.setKind("all")}>Show all resources</button></div> : null}
    <div className="mb-3 flex items-center justify-end gap-3"><button type="button" className="text-xs text-sky-700" onClick={() => setCollapseVersion(value => value + 1)}>Collapse all</button><CopyJsonButton label="Copy entire resource table as JSON" payload={JSON.stringify({resources: inventory.resources, services: inventory.services}, null, 2)} className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-200 text-sky-700"/></div>
    <div className="max-h-[376px] overflow-auto rounded border border-zinc-200" role="region" aria-label="Scrollable resource inventory" tabIndex={0}>
      {view === "services" ? <FullSiteServices collapseVersion={collapseVersion} services={services} pageName={pageName} pageChoices={[{ id: report.scan.id, url: report.scan.url, source: "homepage", status: "completed", limitation: null, httpStatus: null, graphSource: undefined }]} homepageGraph={report.runtimeEvidenceGraph}/>
        : <InventoryResourceProvider projection={report.runtimeEvidenceGraph}><table className="w-full text-left text-xs"><caption className="sr-only">Retained pre-consent resources</caption><thead className="sticky top-0 z-10 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500"><tr>{["Observations", "Type", "Name", "Priority", "Purpose", "Policy disclosure", "Location", "First seen", "Domain", "Site relationship", "Page", "JSON"].map(label => <th key={label} className="h-10 whitespace-nowrap border-b px-3" aria-sort={(label === "Name" && sort.key === "name") || (label === "Priority" && sort.key === "priority") ? sort.descending ? "descending" : "ascending" : undefined}><div className="flex items-center gap-1">{label === "Name" || label === "Priority" ? <button type="button" className="flex items-center gap-1 rounded uppercase tracking-wider hover:text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500" onClick={() => toggleSort(label === "Name" ? "name" : "priority")}>{label}<span aria-hidden="true">{sort.key === label.toLowerCase() ? sort.descending ? "↓" : "↑" : "↕"}</span></button> : label}{label === "Priority" ? <InventoryPriorityHelp/> : null}</div></th>)}</tr></thead><tbody>{!resources.length ? <tr><td colSpan={12} className="px-4 py-6 text-center text-slate-500">{kind === "cookie" ? "No cookies or browser storage observed." : kind === "embed" ? "No embedded frames observed." : "No resources observed."}</td></tr> : null}{resources.map(row => <ServiceResourceRows key={row.key} row={row} serviceContext={row.context} pageName={pageName} collapseVersion={collapseVersion}/>)}</tbody></table></InventoryResourceProvider>}
    </div><p className="mt-2 text-xs text-zinc-500">{view === "services" ? `${countHierarchyServices(buildServiceHierarchy(services))} distinct services, including child services and unattributed resources` : `${resources.length} distinct resources${resources.length > 8 ? " · Scroll for more." : ""}`}</p>
  </section>;
}
