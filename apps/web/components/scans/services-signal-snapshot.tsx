"use client";
import { createContext, useContext } from "react";
import { DisclosureChevron } from "./report-finding-row";
import { VendorBrandIcon } from "./vendor-brand-chip";
import { useReportInventoryNavigation } from "./report-inventory-navigation";
import { InventoryTileHeading, inventoryTileDisclosure } from "./inventory-tile-heading";
import type { NetworkInventoryOverview } from "../../lib/scans/network-inventory-overview";

export const ServicesSnapshotContext = createContext<{ overview?: NetworkInventoryOverview; navigate: () => void } | null>(null);

export function ServicesSignalSnapshot({ overview, card = false }: { overview?: NetworkInventoryOverview; card?: boolean }) {
  const site = useContext(ServicesSnapshotContext);
  const navigation = useReportInventoryNavigation();
  const inventory = site ? site.overview : overview;
  const names = inventory?.identifiedServiceNames ?? [];
  return <details className={card ? "group/services min-w-0" : "group/services border-b border-zinc-200 py-2"}>
    <summary title={inventory ? undefined : "Service count unavailable; this is not a verified zero."} className={card ? inventoryTileDisclosure : "flex items-center justify-between gap-3 cursor-pointer list-none text-xs leading-4 [&::-webkit-details-marker]:hidden"}>
      {card ? <InventoryTileHeading label="Services" value={inventory?.identifiedServices ?? "—"} chevron={<DisclosureChevron className="group-open/services:rotate-180" />} /> : <>
      <span className={card ? "text-slate-500" : "font-medium text-zinc-500"}>Services {!card ? <span className="text-[10px] font-normal text-zinc-400">{site ? "Scanned pages" : "Starting page"}</span> : null}</span>
      <span className={`flex items-center gap-2 font-semibold tabular-nums ${card ? "text-xl text-slate-950" : "text-zinc-800"}`}>{inventory?.identifiedServices ?? "Unavailable"}<DisclosureChevron className="text-zinc-400 group-open/services:rotate-180" /></span>
      </>}
    </summary>
    <div className={card ? "border-t border-slate-100 px-3 pb-3 sm:px-4" : undefined}>
    <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto" aria-label="Identified services">{names.map(name => <li key={name} className="flex items-center gap-2 text-xs text-slate-700"><VendorBrandIcon label={name} /><span>{name}</span></li>)}</ul>
    {site || navigation ? <button type="button" className="mt-3 text-xs text-sky-700 hover:underline" onClick={() => site ? site.navigate() : navigation?.navigate("services", "all")}>View services ↗</button> : null}
    </div>
  </details>;
}
