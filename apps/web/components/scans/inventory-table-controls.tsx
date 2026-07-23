"use client";

import { useEffect, useState } from "react";

type InventoryTableControlsProps = {
  tableId: string;
};

export function InventoryTableControls({ tableId }: InventoryTableControlsProps) {
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("all");
  const [category, setCategory] = useState("all");
  const [preConsentOnly, setPreConsentOnly] = useState(false);

  useEffect(() => {
    const table = document.getElementById(tableId);
    if (!table) return;
    const normalizedQuery = query.trim().toLowerCase();
    table.querySelectorAll<HTMLElement>("[data-inventory-row]").forEach((row) => {
      const matchesQuery = !normalizedQuery || (row.dataset.search ?? "").includes(normalizedQuery);
      const matchesPriority = priority === "all" || row.dataset.priority === priority;
      const matchesCategory = category === "all" || row.dataset.category === category;
      const matchesTiming = !preConsentOnly || row.dataset.preConsent === "true";
      row.hidden = !(matchesQuery && matchesPriority && matchesCategory && matchesTiming);
    });
  }, [category, preConsentOnly, priority, query, tableId]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2" aria-label="Filter cookies and trackers">
      <label className="sr-only" htmlFor={`${tableId}-search`}>Search cookies and trackers</label>
      <input
        id={`${tableId}-search`}
        className="h-8 min-w-[12rem] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
        placeholder="Search vendor, cookie, domain…"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <label className="sr-only" htmlFor={`${tableId}-priority`}>Filter by priority</label>
      <select id={`${tableId}-priority`} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" value={priority} onChange={(event) => setPriority(event.target.value)}>
        <option value="all">All priorities</option>
        <option value="high">High</option>
        <option value="review_needed">Review</option>
        <option value="medium">Medium</option>
        <option value="contextual">Contextual</option>
      </select>
      <label className="sr-only" htmlFor={`${tableId}-category`}>Filter by category</label>
      <select id={`${tableId}-category`} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" value={category} onChange={(event) => setCategory(event.target.value)}>
        <option value="all">All categories</option>
        <option value="Advertising">Advertising</option>
        <option value="Analytics">Analytics</option>
        <option value="Essential">Essential</option>
        <option value="Functional">Functional</option>
        <option value="Review">Review</option>
      </select>
      <label className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600">
        <input checked={preConsentOnly} className="accent-sky-600" type="checkbox" onChange={(event) => setPreConsentOnly(event.target.checked)} />
        Pre-consent only
      </label>
    </div>
  );
}
