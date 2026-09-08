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

import { buildServiceHierarchy, type ServiceBranch } from "../../lib/scans/service-hierarchy";

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
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "priority", desc: false });
  const compare = (a: ServiceBranch, b: ServiceBranch) => {
    const left = sortValue(a.service, sort.key), right = sortValue(b.service, sort.key);
    const comparison = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
    return (sort.desc ? -comparison : comparison) || a.service.key.localeCompare(b.service.key);
  };
  const unattributedHelpId = useId();
  const [unattributedOpen, setUnattributedOpen] = useState(false);
  const hierarchy = buildServiceHierarchy(services);
  const rows = hierarchy.filter(branch => !branch.collection).sort(compare);
  const unattributed = hierarchy.find(branch => branch.collection);

  const renderBranch = (branch: ServiceBranch, path: string[] = [], unattributed = false) => {
          const service = branch.service;
          const branchKey = JSON.stringify([...path, service.key, branch.directSite ? "site" : "service"]);
          const open = expanded.has(branchKey);
          const summary = summarizeService(service.resources);
          const toggle = () => setExpanded(current => { const next = new Set(current); if (next.has(branchKey)) next.delete(branchKey); else next.add(branchKey); return next; });
          return <Fragment key={branchKey}>
            <tr className={`h-14 border-b border-zinc-100 ${open ? "bg-sky-50/60" : "hover:bg-zinc-50"}`}>
              <td className="w-14 px-2 text-center" title="Distinct resources in this integration and its linked services"><span className="font-medium tabular-nums text-slate-600">{service.resources.length}</span></td>
              <td className="px-3 text-center" title="Service"><InventoryTypeIcon kind="service"/></td>
              <th scope="row" className="px-3 font-normal"><div style={{ paddingLeft: path.length * 24 }} className="flex items-center gap-2">{path.length ? <span aria-hidden="true" className="text-slate-400">↳</span> : null}<ExpandRowsButton label={`${open ? "Collapse" : "Expand"} ${service.name}`} open={open} onClick={toggle} /><span className="inline-flex max-w-64 items-center gap-2 rounded-full border border-zinc-200 bg-white px-2 py-1 text-slate-800">{!branch.collection ? <VendorBrandIcon label={service.context.identity?.vendor ?? service.name} /> : null}<span className="min-w-0"><span title={service.name} className="block truncate">{service.name}</span>{branch.directSite || unattributed || path.length || branch.residual ? <span className="block truncate text-[10px] text-slate-500">{branch.directSite ? "Loaded directly by site" : unattributed || branch.residual ? "Origin not fully attributed" : branch.inferred ? "Loaded through parent · inferred" : "Loaded through parent"}</span> : null}</span></span></div></th>
              <td className="px-3 text-center">{summary.priority ? <InventoryEvidenceIcon evidence={summary.priority} description={`Highest branch priority · ${summary.priorityCount} ${summary.priority.toLowerCase()} ${summary.priorityCount === 1 ? "resource" : "resources"}`}/> : <span title="Not available">—</span>}</td>
              <td className="px-3"><InventoryPurposeList purposes={[...new Set(service.resources.flatMap(resource => inventoryPurposeGroups(resource.purposes, resource.relationships)))]}/></td>
              <td className="px-3">{branch.collection ? <span title="See individual services">—</span> : <PolicyDisclosure context={service.context} label={service.name} />}</td>
              <td className="px-3">{branch.collection ? <span title="See individual services for headquarters and destinations">—</span> : <DataTransferDisclosure location requestUrls={service.resources.filter(resource => resource.kind === "request").map(resource => resource.name)} context={service.context} serviceSummary label={service.name}
                destinations={service.resources.flatMap(resource => resource.destinations ?? [])}
                coverage={{ assessed: service.resources.reduce((total, row) => total + (row.destinationAssessedCount ?? 0), 0),
                  total: service.resources.filter(row => row.kind === "request").reduce((total, row) => total + row.eventCount, 0),
                  missing: service.resources.reduce((total, row) => total + (row.destinationMissingCount ?? 0), 0),
                  truncated: service.resources.some(row => row.destinationsTruncated) }} />}</td>
              <td className="whitespace-nowrap px-3 tabular-nums" title={summary.firstSeen === undefined ? "Not available" : "Earliest recorded time relative to a page’s scan start"}>{summary.firstSeen === undefined ? "—" : observationTime(summary.firstSeen)}</td><td className="px-3"><ServiceDomains domains={summary.domains}/></td><td className="whitespace-nowrap px-3" title={summary.relationship ? summary.relationshipHint : "Not available"}>{summary.relationship ?? "—"}</td>
              <td className="px-3"><PageCountDisclosure numberOnly pages={service.pageIds.map(pageName)} /></td>
              <td/>
            </tr>
            {open ? [...branch.children].sort(compare).map(child => renderBranch(child, [...path, service.key], Boolean(branch.collection))) : null}
            {open ? branch.ownResources.map(row => {
              const page = pageChoices.find(page => page.id === row.pageIds[0]);
              return <InventoryResourceProvider preload key={row.key} source={page?.source === "homepage" ? undefined : page?.graphSource} projection={page?.source === "homepage" ? homepageGraph : undefined}><ServiceResourceRows row={row} serviceContext={row.context ?? service.context} nested nestingDepth={path.length + 1} scenario={scenario} pageName={pageName}/></InventoryResourceProvider>;
            }) : null}
          </Fragment>;
  };
  const tableHead = (
        <thead className="sticky top-0 z-10 h-10 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500"><tr>
          {columns.map(([key, label]) => <th key={label} scope="col" className={`h-10 whitespace-nowrap border-b ${key === "resources" ? "w-14 px-2 text-center" : "px-3"} ${label === "JSON" ? "sticky right-0 bg-zinc-50" : ""}`} aria-sort={key && sort.key === key ? sort.desc ? "descending" : "ascending" : undefined}><div className={`flex items-center gap-1 ${key === "resources" ? "justify-center" : ""}`}>{key ? <button type="button" className="flex items-center gap-1 rounded uppercase tracking-wider hover:text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500" onClick={() => setSort(current => ({ key, desc: current.key === key && !current.desc }))}>{label}<span aria-hidden="true">{sort.key === key ? sort.desc ? "↓" : "↑" : "↕"}</span></button> : label === "JSON" ? <span className="sr-only">JSON evidence</span> : label}{label === "Priority" ? <InventoryPriorityHelp service/> : null}</div></th>)}
        </tr></thead>
  );
  return <section aria-label="Services inventory" className="min-w-0 bg-white">
    <div>
      <table className="w-full min-w-[1000px] text-left text-xs">
        <caption className="sr-only">Services and their member resources</caption>
        {tableHead}
        <tbody>{rows.map(branch => renderBranch(branch))}</tbody>
      </table>
      {!rows.length ? <p className="p-5 text-sm text-slate-500">{unattributed ? "Loading origins could not be verified. Resources are available below." : "No services match the current filters."}</p> : null}
      {unattributed ? <details className="border-t border-zinc-100" onToggle={event => setUnattributedOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer px-3 py-3 text-xs text-slate-500 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">Unattributed resources ({unattributed.service.resources.length})<button type="button" popoverTarget={unattributedHelpId} onClick={event => event.stopPropagation()} aria-label="Explain unattributed resources" title="About unattributed resources" className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded align-middle text-slate-500 hover:bg-sky-100 hover:text-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v5M10 6v.01"/></svg></button></summary>
        {unattributedOpen ? <>
          <p className="px-3 pb-3 text-xs text-slate-500">Grouped by service; loading origins are not fully verified.</p>
          <table className="w-full min-w-[1000px] text-left text-xs">
            <caption className="sr-only">Resources with unverified loading origins, grouped by service</caption>
            {tableHead}
            <tbody>{[...unattributed.children].sort(compare).map(branch => renderBranch(branch, [], true))}</tbody>
          </table>
        </> : null}
      </details> : null}
      <div id={unattributedHelpId} popover="auto" role="dialog" aria-label="About unattributed resources" className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-semibold text-slate-900">Unattributed resources</h3><button type="button" popoverTarget={unattributedHelpId} popoverTargetAction="hide" aria-label="Close unattributed resources explanation" className="rounded px-2 py-1 hover:bg-slate-100">Close</button></div>
        <p className="leading-5">These resources were observed during the scan, but the retained evidence does not fully establish which integration loaded them. A service may be identifiable even when its loading origin is not.</p>
        <p className="mt-2 leading-5">They are grouped here for review, not as a parent–child relationship. This uncertainty does not itself indicate a risk or change their priority.</p>
      </div>
    </div>
  </section>;
}
