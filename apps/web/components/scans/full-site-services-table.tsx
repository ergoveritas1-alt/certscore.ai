"use client";

import { InventoryResourceProvider } from "./inventory-resource-details";
import { ExpandRowsButton, ServiceResourceRows } from "./service-resource-rows";
import type { ComponentProps } from "react";
import type { ApiRuntimeEvidenceGraph } from "@certscore/api-contracts";
import { Fragment, useState } from "react";
import type { FullSiteReportResponse } from "../../server/scans/full-site-report";
import { PageCountDisclosure, PolicyDisclosure, DataTransferDisclosure, destinationLabel } from "./full-site-resource-context";
import { ProviderHeadquarters } from "./full-site-resource-context";
import { VendorBrandIcon } from "./vendor-brand-chip";
import { InventoryTypeIcon } from "./inventory-type-icon";
import { InventoryPurposeChip } from "./inventory-cell-formatting";

import { inventoryPurposeGroups } from "../../lib/scans/inventory-purpose-presentation";

type Service = FullSiteReportResponse["services"][number];
type SortKey = "name" | "headquarters" | "purpose" | "policy" | "transfer" | "resources" | "pages";
const columns: Array<[SortKey | null, string]> = [["resources", "Count"], [null, "Type"], ["name", "Name"], [null, "Evidence"], ["purpose", "Purpose"], ["policy", "Policy disclosure"], ["transfer", "Data transfer"], ["headquarters", "Provider headquarters"], [null, "First seen"], [null, "Domain"], [null, "Site relationship"], ["pages", "Page"], [null, "JSON"]];
const sortValue = (row: Service, key: SortKey) => {
  switch (key) {
    case "name": return row.name;
    case "headquarters": return row.context.headquarters ?? "Unknown";
    case "purpose": return row.purposes.join(", ");
    case "policy": return row.context.policy.status;
    case "transfer": return destinationLabel(row.resources.flatMap(resource => resource.destinations ?? []));
    case "resources": return row.resources.length;
    case "pages": return row.pageIds.length;
  }
};

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
        <thead className="sticky top-0 z-10 h-10 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500"><tr><th scope="col" className="w-10 border-b px-2"><span className="sr-only">Expand relationships</span></th>
          {columns.map(([key, label]) => <th key={label} scope="col" className={`h-10 whitespace-nowrap border-b ${key === "resources" ? "w-14 px-1" : "px-3"}`} aria-sort={key && sort.key === key ? sort.desc ? "descending" : "ascending" : undefined}>{key ? <button type="button" className="flex items-center gap-1 uppercase tracking-wider hover:text-sky-700" onClick={() => setSort(current => ({ key, desc: current.key === key && !current.desc }))}>{label}<span aria-hidden="true">{sort.key === key ? sort.desc ? "↓" : "↑" : "↕"}</span></button> : label === "JSON" ? <span className="sr-only">JSON evidence</span> : label}</th>)}
        </tr></thead>
        <tbody>{rows.map((service) => {
          const open = expanded.has(service.key);
          const toggle = () => setExpanded(current => { const next = new Set(current); if (next.has(service.key)) next.delete(service.key); else next.add(service.key); return next; });
          return <Fragment key={service.key}>
            <tr className={`h-14 border-b border-zinc-100 ${open ? "bg-sky-50/60" : "hover:bg-zinc-50"}`}>
              <td className="px-2"><ExpandRowsButton label={`${open ? "Collapse" : "Expand"} ${service.name}`} open={open} onClick={toggle} /></td>
              <td className="w-14 px-1" title="Resources in this service"><span className="tabular-nums text-slate-600">{service.resources.length}</span></td>
              <td className="px-3 text-center" title="Service"><InventoryTypeIcon kind="service"/></td>
              <th scope="row" className="px-3 font-normal"><span className="inline-flex max-w-64 items-center gap-2 rounded-full border border-zinc-200 bg-white px-2 py-1 text-slate-800"><VendorBrandIcon label={service.context.identity?.vendor ?? service.name} /><span>{service.name}</span></span></th>
              <td className="px-3 text-slate-400" title="Classification is shown on individual resource rows">—</td>
              <td className="px-3"><div className="flex max-w-48 flex-wrap gap-1">{[...new Set(service.resources.flatMap(resource => inventoryPurposeGroups(resource.purposes, resource.relationships)))].map(purpose => <InventoryPurposeChip key={purpose} purpose={purpose.replaceAll("_", " ")} />)}</div></td>
              <td className="px-3"><PolicyDisclosure context={service.context} label={service.name} /></td>
              <td className="px-3"><DataTransferDisclosure requestUrls={service.resources.filter(resource => resource.kind === "request").map(resource => resource.name)} context={service.context} serviceSummary label={service.name}
                destinations={service.resources.flatMap(resource => resource.destinations ?? [])}
                coverage={{ assessed: service.resources.reduce((total, row) => total + (row.destinationAssessedCount ?? 0), 0),
                  total: service.resources.filter(row => row.kind === "request").reduce((total, row) => total + row.eventCount, 0),
                  missing: service.resources.reduce((total, row) => total + (row.destinationMissingCount ?? 0), 0),
                  truncated: service.resources.some(row => row.destinationsTruncated) }} /></td>
              <td className="whitespace-nowrap px-3"><ProviderHeadquarters context={service.context} /></td>
              <td className="px-3 text-slate-400">—</td><td className="px-3 text-slate-400">—</td><td className="px-3 text-slate-400">—</td>
              <td className="px-3"><PageCountDisclosure numberOnly pages={service.pageIds.map(pageName)} /></td>
              <td/>
            </tr>
            {open ? service.resources.map(row => {
              const page = pageChoices.find(page => page.id === row.pageIds[0]);
              return <InventoryResourceProvider key={row.key} source={page?.source === "homepage" ? undefined : page?.graphSource} projection={page?.source === "homepage" ? homepageGraph : undefined}><ServiceResourceRows row={row} serviceContext={service.context} nested scenario={scenario} pageName={pageName}/></InventoryResourceProvider>;
            }) : null}
          </Fragment>;
        })}</tbody>
      </table>
      {!rows.length ? <p className="p-5 text-sm text-slate-500">No services match the current filters.</p> : null}
    </div>
  </section>;
}
