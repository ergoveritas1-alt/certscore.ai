"use client";

import { useEffect, useState } from "react";

type SortKey = "type" | "vendor" | "purpose" | "priority" | "firstSeen";

const SORT_EVENT = "certscore:inventory-sort";

export function InventorySortButton({ tableId, sortKey, label }: { tableId: string; sortKey: SortKey; label: string }) {
  const [direction, setDirection] = useState<"asc" | "desc" | null>(null);

  useEffect(() => {
    const onSort = (event: Event) => {
      const detail = (event as CustomEvent<{ tableId: string; sortKey: SortKey; direction: "asc" | "desc" }>).detail;
      if (detail.tableId !== tableId) return;
      setDirection(detail.sortKey === sortKey ? detail.direction : null);
    };
    window.addEventListener(SORT_EVENT, onSort);
    return () => window.removeEventListener(SORT_EVENT, onSort);
  }, [sortKey, tableId]);

  return (
    <button
      type="button"
      className="group/sort inline-flex w-full items-center justify-start gap-1 rounded px-0.5 py-0.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] leading-none text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400 focus-visible:ring-offset-0"
      aria-label={`Sort by ${label}`}
      title={direction ? `${label}: ${direction === "asc" ? "ascending" : "descending"}` : `Sort by ${label}`}
      aria-pressed={direction !== null}
      onClick={() => {
        const nextDirection = direction === "asc" ? "desc" : "asc";
        window.dispatchEvent(new CustomEvent(SORT_EVENT, { detail: { tableId, sortKey, direction: nextDirection } }));
      }}
    >
      <span>{label}</span>
      <svg aria-hidden="true" className={`h-3 w-2.5 shrink-0 ${direction ? "text-sky-600" : "text-slate-400 group-hover/sort:text-slate-600"}`} fill="none" viewBox="0 0 10 12">
        <path className={direction === "asc" ? "opacity-100" : "opacity-45"} d="M5 1 1.8 4.4h6.4L5 1Z" fill="currentColor" />
        <path className={direction === "desc" ? "opacity-100" : "opacity-45"} d="m5 11 3.2-3.4H1.8L5 11Z" fill="currentColor" />
      </svg>
    </button>
  );
}

export function InventorySortRuntime({ tableId }: { tableId: string }) {
  useEffect(() => {
    const onSort = (event: Event) => {
      const detail = (event as CustomEvent<{ tableId: string; sortKey: SortKey; direction: "asc" | "desc" }>).detail;
      if (detail.tableId !== tableId) return;
      const table = document.getElementById(tableId);
      const body = table?.querySelector("tbody");
      if (!body) return;
      const rows = Array.from(body.querySelectorAll<HTMLElement>("[data-inventory-row]"));
      const priorityRank: Record<string, number> = { high: 0, review_needed: 1, medium: 2, contextual: 3 };
      rows.sort((a, b) => {
        const aValue = detail.sortKey === "firstSeen" ? Number(a.dataset.firstSeen || Infinity)
          : detail.sortKey === "type" ? a.dataset.type ?? ""
          : detail.sortKey === "vendor" ? a.dataset.vendor ?? ""
          : detail.sortKey === "purpose" ? a.dataset.purpose ?? ""
          : priorityRank[a.dataset.priority ?? ""] ?? 4;
        const bValue = detail.sortKey === "firstSeen" ? Number(b.dataset.firstSeen || Infinity)
          : detail.sortKey === "type" ? b.dataset.type ?? ""
          : detail.sortKey === "vendor" ? b.dataset.vendor ?? ""
          : detail.sortKey === "purpose" ? b.dataset.purpose ?? ""
          : priorityRank[b.dataset.priority ?? ""] ?? 4;
        const compared = typeof aValue === "number" && typeof bValue === "number" ? aValue - bValue : String(aValue).localeCompare(String(bValue));
        return detail.direction === "asc" ? compared : -compared;
      });
      rows.forEach((row) => body.appendChild(row));
    };
    window.addEventListener(SORT_EVENT, onSort);
    return () => window.removeEventListener(SORT_EVENT, onSort);
  }, [tableId]);

  return null;
}
