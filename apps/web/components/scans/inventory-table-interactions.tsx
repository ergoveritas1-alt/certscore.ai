"use client";

import { useEffect, useState } from "react";

type InventoryTableInteractionsProps = { tableId: string; totalRows: number };

export function InventoryTableInteractions({ tableId, totalRows }: InventoryTableInteractionsProps) {
  const [reviewOnly, setReviewOnly] = useState(false);
  const [sort, setSort] = useState("priority");
  const [visibleRows, setVisibleRows] = useState(totalRows);

  useEffect(() => {
    const table = document.getElementById(tableId);
    if (!table) return;
    const apply = (filter: string | null = reviewOnly ? "review" : null) => {
      const rows = Array.from(table.querySelectorAll<HTMLElement>("[data-inventory-row]"));
      rows.sort((a, b) => {
        if (sort === "vendor") return (a.dataset.vendor ?? "").localeCompare(b.dataset.vendor ?? "");
        if (sort === "first_seen") return Number(a.dataset.firstSeen || Infinity) - Number(b.dataset.firstSeen || Infinity);
        const rank = { high: 0, review_needed: 1, medium: 2, contextual: 3 } as Record<string, number>;
        return (rank[a.dataset.priority ?? "contextual"] ?? 4) - (rank[b.dataset.priority ?? "contextual"] ?? 4);
      });
      rows.forEach((row) => {
        const category = row.dataset.category?.toLowerCase() ?? "";
        const priority = row.dataset.priority ?? "";
        const matches = !filter || (
          filter === "non-essential" ? category === "advertising" || category === "analytics" || category === "marketing" || category === "personalization" || category === "review" :
          filter === "necessary" ? category === "essential" || category === "functional" :
          filter === "review" ? priority === "high" || category === "review" :
          filter === "high" ? priority === "high" :
          filter === "medium" ? priority === "medium" :
          filter === "contextual" ? priority === "contextual" :
          category === filter || (row.dataset.search ?? "").includes(filter)
        );
        row.hidden = !matches;
        table.querySelector("tbody")?.appendChild(row);
      });
      setVisibleRows(rows.filter((row) => !row.hidden).length);
    };
    apply();
    const onFilter = (event: Event) => {
      const target = event.target as HTMLElement;
      const filter = target.closest<HTMLElement>("[data-inventory-filter]")?.dataset.inventoryFilter ?? null;
      if (filter) {
        event.preventDefault();
        setReviewOnly(filter === "review");
        apply(filter === "all" ? null : filter);
      }
    };
    const onFilterKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target as HTMLElement;
      if (!target.closest<HTMLElement>("[data-inventory-filter]")) return;
      event.preventDefault();
      target.closest<HTMLElement>("[data-inventory-filter]")?.click();
    };
    document.addEventListener("click", onFilter);
    document.addEventListener("keydown", onFilterKeyDown);
    return () => {
      document.removeEventListener("click", onFilter);
      document.removeEventListener("keydown", onFilterKeyDown);
    };
  }, [reviewOnly, sort, tableId]);

  return (
    <div className="hidden flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 md:flex" aria-label="Inventory table controls">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Showing {visibleRows} of {totalRows}</span>
        <button className={`rounded-full border px-2.5 py-1 font-semibold transition ${reviewOnly ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`} data-inventory-filter={reviewOnly ? "all" : "review"} type="button" onClick={() => setReviewOnly((value) => !value)}>
          {reviewOnly ? "All rows" : "Review queue"}
        </button>
      </div>
      <label className="inline-flex items-center gap-1.5">
        Sort
        <select className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-600" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="priority">Priority</option>
          <option value="vendor">Vendor</option>
          <option value="first_seen">First seen</option>
        </select>
      </label>
    </div>
  );
}
