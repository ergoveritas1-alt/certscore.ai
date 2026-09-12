"use client";

import { useState } from "react";
import type { SinglePageResourceInventory as Inventory } from "../../lib/scans/single-page-resource-inventory";
import type { ShadowReportData } from "./report-lab/shadow-report-data";
import { SitewideInventorySummary } from "./sitewide-inventory-summary";
import { FullSiteServices } from "./full-site-services-table";
import { ServiceResourceRows } from "./service-resource-rows";
import { InventoryResourceProvider } from "./inventory-resource-details";
import { CopyJsonButton } from "./copy-json-button";
import { InventoryPriorityHelp } from "./inventory-priority-help";

export function SinglePageResourceInventory({ inventory, report }: { inventory: Inventory; report: ShadowReportData }) {
  const [view, setView] = useState<"services" | "resources">("services");
  const [sort, setSort] = useState<{key: "priority" | "name"; descending: boolean}>({key: "priority", descending: false});
  const [collapseVersion, setCollapseVersion] = useState(0);
  const priorities = ["Non-essential", "Review", "Contextual", "Essential"];
  const rank = (value: string) => { const index = priorities.indexOf(value); return index < 0 ? priorities.length : index; };
  const resources = [...inventory.resources].sort((a, b) => {
    const difference = sort.key === "name" ? a.name.localeCompare(b.name) : rank(a.inventoryEvidence) - rank(b.inventoryEvidence);
    return (sort.descending ? -difference : difference) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
  });
  const services = inventory.services;
  const toggleSort = (key: "priority" | "name") => setSort(current => ({key, descending: current.key === key ? !current.descending : false}));
  const pageName = () => report.scan.url;
  return <section aria-label="Resources and services" className="mt-6 border-t border-zinc-200 pt-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Resource inventory</p>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">Resources & services</h2><div className="flex gap-2">{(["services", "resources"] as const).map(value => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)} className={`rounded border px-3 py-2 text-sm capitalize ${view === value ? "border-sky-300 bg-sky-50 text-sky-800" : "border-zinc-200"}`}>{value}</button>)}</div></div>
    <SitewideInventorySummary mix={inventory.mix}/>
    <div className="mb-3 flex items-center justify-end gap-3"><button type="button" className="text-xs text-sky-700" onClick={() => setCollapseVersion(value => value + 1)}>Collapse all</button><CopyJsonButton label="Copy entire resource table as JSON" payload={JSON.stringify({resources: inventory.resources, services: inventory.services}, null, 2)} className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-200 text-sky-700"/></div>
    <div className="max-h-[376px] overflow-auto rounded border border-zinc-200" role="region" aria-label="Scrollable resource inventory" tabIndex={0}>
      {view === "services" ? <FullSiteServices collapseVersion={collapseVersion} services={services} pageName={pageName} pageChoices={[{ id: report.scan.id, url: report.scan.url, source: "homepage", status: "completed", limitation: null, httpStatus: null, graphSource: undefined }]} homepageGraph={report.runtimeEvidenceGraph}/>
        : <InventoryResourceProvider projection={report.runtimeEvidenceGraph}><table className="w-full text-left text-xs"><caption className="sr-only">Retained pre-consent resources</caption><thead className="sticky top-0 z-10 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500"><tr>{["Count", "Type", "Name", "Priority", "Purpose", "Policy disclosure", "Location", "First seen", "Domain", "Site relationship", "Page", "JSON"].map(label => <th key={label} className="h-10 whitespace-nowrap border-b px-3" aria-sort={(label === "Name" && sort.key === "name") || (label === "Priority" && sort.key === "priority") ? sort.descending ? "descending" : "ascending" : undefined}><div className="flex items-center gap-1">{label === "Name" || label === "Priority" ? <button type="button" className="flex items-center gap-1 rounded uppercase tracking-wider hover:text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500" onClick={() => toggleSort(label === "Name" ? "name" : "priority")}>{label}<span aria-hidden="true">{sort.key === label.toLowerCase() ? sort.descending ? "↓" : "↑" : "↕"}</span></button> : label}{label === "Priority" ? <InventoryPriorityHelp/> : null}</div></th>)}</tr></thead><tbody>{resources.map(row => <ServiceResourceRows key={row.key} row={row} serviceContext={row.context} pageName={pageName} collapseVersion={collapseVersion}/>)}</tbody></table></InventoryResourceProvider>}
    </div><p className="mt-2 text-xs text-zinc-500">{view === "services" ? `${services.length} services · Expand a service to inspect its resources.` : `${resources.length} distinct resources · Scroll for more.`}</p>
  </section>;
}
