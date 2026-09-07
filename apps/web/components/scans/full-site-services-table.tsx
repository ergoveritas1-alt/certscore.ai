"use client";

import { InventoryResourceProvider } from "./inventory-resource-details";
import { ExpandRowsButton, ServiceResourceRows } from "./service-resource-rows";
import type { ComponentProps } from "react";
import type { ApiRuntimeEvidenceGraph } from "@certscore/api-contracts";
import { Fragment, useId, useState } from "react";
import type { FullSiteReportResponse } from "../../server/scans/full-site-report";
import { PageCountDisclosure, PolicyDisclosure, DataTransferDisclosure, destinationLabel } from "./full-site-resource-context";
import { VendorBrandIcon } from "./vendor-brand-chip";
import { InventoryEvidenceIcon } from "./inventory-evidence-icon";
import { observationTime } from "./runtime-evidence-graph-model";
import { InventoryPriorityHelp } from "./inventory-priority-help";
import { InventoryTypeIcon } from "./inventory-type-icon";
import { InventoryPurposeList } from "./inventory-cell-formatting";

import { inventoryPurposeGroups } from "../../lib/scans/inventory-purpose-presentation";

type Service = FullSiteReportResponse["services"][number];
type SortKey = "name" | "priority" | "time" | "purpose" | "policy" | "transfer" | "resources" | "pages";
const columns: Array<[SortKey | null, string]> = [["resources", "Count"], [null, "Type"], ["name", "Name"], ["priority", "Priority"], ["purpose", "Purpose"], ["policy", "Policy disclosure"], ["transfer", "Location"], ["time", "First seen"], [null, "Domain"], [null, "Site relationship"], ["pages", "Page"], [null, "JSON"]];
const sortValue = (row: Service, key: SortKey) => {
  switch (key) {
    case "name": return row.name;
    case "priority": { const priority = summarizeService(row.resources).priority; return priority ? priorityOrder.indexOf(priority) : priorityOrder.length; }
    case "time": return summarizeService(row.resources).firstSeen ?? Number.POSITIVE_INFINITY;
    case "purpose": return row.purposes.join(", ");
    case "policy": return row.context.policy.status;
    case "transfer": return destinationLabel(row.resources.flatMap(resource => resource.destinations ?? []));
    case "resources": return row.resources.length;
    case "pages": return row.pageIds.length;
  }
};

const priorityOrder = ["Non-essential", "Review", "Contextual", "Essential"];
export function summarizeService(resources: Service["resources"]) {
  const priority = priorityOrder.find(value => resources.some(row => row.inventoryEvidence === value));
  const times = resources.map(row => row.occurrence.firstSeenMs).filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const domains = [...new Set(resources.map(row => row.occurrence.domain?.trim()).filter((value): value is string => Boolean(value)))].sort();
  const relationships = new Set(resources.flatMap(row => row.relationships));
  const first = relationships.has("first_party"), third = relationships.has("third_party");
  const limited = resources.some(row => !row.relationships.length || row.relationships.some(value => value !== "first_party" && value !== "third_party"));
  return { priority, priorityCount: priority ? resources.filter(row => row.inventoryEvidence === priority).length : 0,
    firstSeen: times.length ? Math.min(...times) : undefined, domains,
    relationship: first && third ? "Mixed" : first ? "1st party" : third ? "3rd party" : undefined,
    relationshipHint: limited ? "Based on classified resources; some site relationships are not available." : "Retained site relationships across member resources." };
}
function ServiceDomains({ domains }: { domains: string[] }) {
  const id = useId();
  if (!domains.length) return <span title="Not available">—</span>;
  return <div className="flex max-w-40 items-center gap-1"><span className="truncate" title={domains[0]}>{domains[0]}</span>{domains.length > 1 ? <><button type="button" popoverTarget={id} aria-label={`Show all ${domains.length} domains`} className="shrink-0 rounded border border-slate-200 px-1.5 py-1 text-[10px] text-sky-700 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">+{domains.length - 1}</button><div id={id} popover="auto" role="dialog" aria-label="Service domains" className="m-auto max-h-[70vh] w-80 overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl"><div className="mb-3 flex justify-between"><strong>Service domains</strong><button type="button" popoverTarget={id} popoverTargetAction="hide">Close</button></div><ul className="space-y-2 text-xs">{domains.map(domain => <li className="break-all" key={domain}>{domain}</li>)}</ul></div></> : null}</div>;
}

export function FullSiteServices({ services, pageName, pageChoices, homepageGraph, scenario = "pre_consent" }: { scenario?: ApiRuntimeEvidenceGraph["scenario"]; services: Service[]; pageName: (id: string) => string; pageChoices: FullSiteReportResponse["pageChoices"]; homepageGraph?: ComponentProps<typeof InventoryResourceProvider>["projection"] }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "name", desc: false });
  const rows = [...services].sort((a, b) => {
    const left = sortValue(a, sort.key), right = sortValue(b, sort.key);
    const comparison = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
    return (sort.desc ? -comparison : comparison) || a.key.localeCompare(b.key);
  });
  return <section aria-label="Services inventory" className="min-w-0 bg-white">
    <div>
      <table className="w-full min-w-[1000px] text-left text-xs">
        <caption className="sr-only">Services and their member resources</caption>
        <thead className="sticky top-0 z-10 h-10 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500"><tr>
          {columns.map(([key, label]) => <th key={label} scope="col" className={`h-10 whitespace-nowrap border-b ${key === "resources" ? "w-14 px-2 text-center" : "px-3"} ${label === "JSON" ? "sticky right-0 bg-zinc-50" : ""}`} aria-sort={key && sort.key === key ? sort.desc ? "descending" : "ascending" : undefined}><div className={`flex items-center gap-1 ${key === "resources" ? "justify-center" : ""}`}>{key ? <button type="button" className="flex items-center gap-1 rounded uppercase tracking-wider hover:text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500" onClick={() => setSort(current => ({ key, desc: current.key === key && !current.desc }))}>{label}<span aria-hidden="true">{sort.key === key ? sort.desc ? "↓" : "↑" : "↕"}</span></button> : label === "JSON" ? <span className="sr-only">JSON evidence</span> : label}{label === "Priority" ? <InventoryPriorityHelp service/> : null}</div></th>)}
        </tr></thead>
        <tbody>{rows.map((service) => {
          const open = expanded.has(service.key);
          const summary = summarizeService(service.resources);
          const toggle = () => setExpanded(current => { const next = new Set(current); if (next.has(service.key)) next.delete(service.key); else next.add(service.key); return next; });
          return <Fragment key={service.key}>
            <tr className={`h-14 border-b border-zinc-100 ${open ? "bg-sky-50/60" : "hover:bg-zinc-50"}`}>
              <td className="w-14 px-2 text-center" title="Resources in this service"><span className="font-medium tabular-nums text-slate-600">{service.resources.length}</span></td>
              <td className="px-3 text-center" title="Service"><InventoryTypeIcon kind="service"/></td>
              <th scope="row" className="px-3 font-normal"><div className="flex items-center gap-2"><ExpandRowsButton label={`${open ? "Collapse" : "Expand"} ${service.name}`} open={open} onClick={toggle} /><span className="inline-flex max-w-64 items-center gap-2 rounded-full border border-zinc-200 bg-white px-2 py-1 text-slate-800"><VendorBrandIcon label={service.context.identity?.vendor ?? service.name} /><span title={service.name} className="line-clamp-2 break-words">{service.name}</span></span></div></th>
              <td className="px-3 text-center">{summary.priority ? <InventoryEvidenceIcon evidence={summary.priority} description={`Highest resource priority · ${summary.priorityCount} ${summary.priority.toLowerCase()} ${summary.priorityCount === 1 ? "resource" : "resources"}`}/> : <span title="Not available">—</span>}</td>
              <td className="px-3"><InventoryPurposeList purposes={[...new Set(service.resources.flatMap(resource => inventoryPurposeGroups(resource.purposes, resource.relationships)))]}/></td>
              <td className="px-3"><PolicyDisclosure context={service.context} label={service.name} /></td>
              <td className="px-3"><DataTransferDisclosure location requestUrls={service.resources.filter(resource => resource.kind === "request").map(resource => resource.name)} context={service.context} serviceSummary label={service.name}
                destinations={service.resources.flatMap(resource => resource.destinations ?? [])}
                coverage={{ assessed: service.resources.reduce((total, row) => total + (row.destinationAssessedCount ?? 0), 0),
                  total: service.resources.filter(row => row.kind === "request").reduce((total, row) => total + row.eventCount, 0),
                  missing: service.resources.reduce((total, row) => total + (row.destinationMissingCount ?? 0), 0),
                  truncated: service.resources.some(row => row.destinationsTruncated) }} /></td>
              <td className="whitespace-nowrap px-3 tabular-nums" title={summary.firstSeen === undefined ? "Not available" : "Earliest recorded time relative to a page’s scan start"}>{summary.firstSeen === undefined ? "—" : observationTime(summary.firstSeen)}</td><td className="px-3"><ServiceDomains domains={summary.domains}/></td><td className="whitespace-nowrap px-3" title={summary.relationship ? summary.relationshipHint : "Not available"}>{summary.relationship ?? "—"}</td>
              <td className="px-3"><PageCountDisclosure numberOnly pages={service.pageIds.map(pageName)} /></td>
              <td/>
            </tr>
            {open ? service.resources.map(row => {
              const page = pageChoices.find(page => page.id === row.pageIds[0]);
              return <InventoryResourceProvider preload key={row.key} source={page?.source === "homepage" ? undefined : page?.graphSource} projection={page?.source === "homepage" ? homepageGraph : undefined}><ServiceResourceRows row={row} serviceContext={service.context} nested scenario={scenario} pageName={pageName}/></InventoryResourceProvider>;
            }) : null}
          </Fragment>;
        })}</tbody>
      </table>
      {!rows.length ? <p className="p-5 text-sm text-slate-500">No services match the current filters.</p> : null}
    </div>
  </section>;
}
