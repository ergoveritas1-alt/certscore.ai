"use client";

import { Children, createContext, useContext, useState, type ReactNode } from "react";
import { inventorySortIndices, type InventorySortKey, type InventorySortRow } from "./inventory-sort-model";

const SortContext = createContext({ key: "default" as InventorySortKey, descending: false, select: (_key: InventorySortKey) => {} });

export function InventorySortProvider({ children }: { children: ReactNode }) {
  const [sort, setSort] = useState({ key: "default" as InventorySortKey, descending: false });
  const select = (key: InventorySortKey) => setSort(current => ({ key, descending: current.key === key ? !current.descending : false }));
  return <SortContext.Provider value={{ ...sort, select }}>
    {children}
  </SortContext.Provider>;
}

export function InventorySortHeader({ label, className }: { label: string; className: string }) {
  const sort = useContext(SortContext);
  const keys: Record<string, InventorySortKey> = { Priority: "default", Type: "type", Vendor: "vendor", Name: "name", Purpose: "purpose", "First seen": "firstSeenMs" };
  const key = keys[label];
  return <th scope="col" className={className} aria-sort={key && sort.key === key ? sort.descending ? "descending" : "ascending" : undefined}>
    {key ? <button type="button" onClick={() => sort.select(key)} className="inline-flex items-center gap-1 text-left font-inherit uppercase hover:text-sky-700 focus-visible:outline focus-visible:outline-2" aria-label={`Sort by ${label}`}>
      {label}<span aria-hidden="true">{sort.key === key ? sort.descending ? "↓" : "↑" : "↕"}</span>
    </button> : label}
  </th>;
}

export function InventorySortedBody({ rows, children }: { rows: InventorySortRow[]; children: ReactNode }) {
  const sort = useContext(SortContext);
  const items = Children.toArray(children);
  return <tbody>{inventorySortIndices(rows, sort.key, sort.descending).map(index => items[index])}</tbody>;
}
