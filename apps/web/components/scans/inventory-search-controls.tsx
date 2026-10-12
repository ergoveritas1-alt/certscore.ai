"use client";
import { useId } from "react";
import type { InventorySearch } from "../../lib/scans/inventory-search";
import { inventoryPurposeOptions } from "../../lib/scans/inventory-search";

export function InventorySearchControls({ value, purposes, onChange, onClear, result }: {
  value: InventorySearch; purposes: readonly string[]; onChange: (patch: Partial<InventorySearch>) => void;
  onClear: () => void; result: string;
}) {
  const id = useId();
  const control = "h-8 min-w-0 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600";
  const active = Boolean(value.query || value.purpose || value.kind !== "all");
  return <div className="mb-2 flex flex-wrap items-center gap-2" role="search" aria-label="Inventory search and filters">
    <label className="min-w-40 flex-1"><span className="sr-only">Search services and resources</span><input type="search" className={`${control} w-full`} placeholder="Search service, resource or domain" value={value.query} maxLength={200} onChange={event => onChange({ query: event.target.value })}/></label>
    <label htmlFor={`${id}-purpose`} className="sr-only">Filter by purpose</label>
    <select id={`${id}-purpose`} className={`${control} max-w-48`} value={value.purpose} onChange={event => onChange({ purpose: event.target.value })}><option value="">All purposes</option>{inventoryPurposeOptions([...purposes, ...(value.purpose ? [value.purpose] : [])]).map(purpose => <option key={purpose} value={purpose}>{purpose === "mixed" ? "Multiple purposes" : purpose.replaceAll("_", " ").replace(/^./, value => value.toUpperCase())}</option>)}</select>
    <label htmlFor={`${id}-kind`} className="sr-only">Filter by resource type</label>
    <select id={`${id}-kind`} className={control} value={value.kind} onChange={event => onChange({ kind: event.target.value })}><option value="all">All types</option><option value="request">Requests</option><option value="cookie">Cookies & storage</option><option value="embed">Embeds</option></select>
    {active ? <button type="button" className="h-8 rounded px-2 text-xs font-medium text-sky-700 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600" onClick={onClear}>Clear filters</button> : null}
    <span role="status" className="text-[11px] text-zinc-500">{result}</span>
  </div>;
}
