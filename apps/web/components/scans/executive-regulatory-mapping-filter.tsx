"use client";

import React from "react";
import { ScanReportDisclosureIcon } from "./scan-report-disclosure-icon";

export type RegulatoryMappingFilterId = "gdpr" | "ftc" | "ada";

const REGULATORY_MAPPING_FILTERS: Array<{
  id: RegulatoryMappingFilterId;
  label: string;
}> = [
  { id: "gdpr", label: "GDPR / ePrivacy" },
  { id: "ftc", label: "FTC" },
  { id: "ada", label: "ADA / accessibility" }
];

function formatRegulatoryMappingFilterLabel(selectedFilters: RegulatoryMappingFilterId[]) {
  if (selectedFilters.length === 0) {
    return "All";
  }
  if (selectedFilters.length === 1) {
    return REGULATORY_MAPPING_FILTERS.find((filter) => filter.id === selectedFilters[0])?.label ?? "1 selected";
  }
  if (selectedFilters.length === 2) {
    return selectedFilters
      .map((id) => REGULATORY_MAPPING_FILTERS.find((filter) => filter.id === id)?.label.split(" / ")[0] ?? id.toUpperCase())
      .join(" + ");
  }
  return `${selectedFilters.length} selected`;
}

export function RegulatoryMappingFilterControl(input: { targetListId: string }) {
  const [selectedFilters, setSelectedFilters] = React.useState<RegulatoryMappingFilterId[]>([]);
  const selected = new Set(selectedFilters);

  React.useEffect(() => {
    const list = document.getElementById(input.targetListId);
    if (!list) {
      return;
    }

    const selectedSet = new Set(selectedFilters);
    const items = Array.from(list.querySelectorAll<HTMLElement>("[data-regulatory-mapping-ids]"));
    let visibleCount = 0;

    for (const item of items) {
      const mappingIds = (item.dataset.regulatoryMappingIds ?? "").split(/\s+/).filter(Boolean);
      const visible = selectedSet.size === 0 || mappingIds.some((id) => selectedSet.has(id as RegulatoryMappingFilterId));
      item.hidden = !visible;
      if (visible) {
        visibleCount += 1;
      }
    }

    const emptyState = list.querySelector<HTMLElement>("[data-regulatory-filter-empty-state]");
    if (emptyState) {
      emptyState.hidden = selectedSet.size === 0 || visibleCount > 0;
    }
  }, [input.targetListId, selectedFilters]);

  const toggleFilter = (filterId: RegulatoryMappingFilterId) => {
    const next = new Set(selected);
    if (next.has(filterId)) {
      next.delete(filterId);
    } else {
      next.add(filterId);
    }
    setSelectedFilters(REGULATORY_MAPPING_FILTERS.map((filter) => filter.id).filter((id) => next.has(id)));
  };

  return (
    <details className="group/filter relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="text-slate-500">Regulatory mapping</span>
        <span className="text-slate-900">{formatRegulatoryMappingFilterLabel(selectedFilters)}</span>
        <ScanReportDisclosureIcon className="h-4 w-4 group-open/filter:-rotate-90" />
      </summary>
      <div className="absolute bottom-[calc(100%+0.25rem)] right-0 z-20 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white py-2 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)]">
        <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium text-slate-900">
          <span>All</span>
          <span className="relative inline-flex h-6 w-10 items-center">
            <input
              type="checkbox"
              aria-label="Show all regulatory mappings"
              className="peer sr-only"
              checked={selectedFilters.length === 0}
              onChange={() => setSelectedFilters([])}
            />
            <span className="absolute inset-0 rounded-full bg-slate-200 transition peer-checked:bg-sky-600" />
            <span className="absolute left-1 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" />
          </span>
        </label>
        <div className="my-1 border-t border-slate-100" />
        {REGULATORY_MAPPING_FILTERS.map((filter) => (
          <label
            key={filter.id}
            className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm text-slate-800"
          >
            <span>{filter.label}</span>
            <span className="relative inline-flex h-6 w-10 items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={selected.has(filter.id)}
                onChange={() => toggleFilter(filter.id)}
              />
              <span className="absolute inset-0 rounded-full bg-slate-200 transition peer-checked:bg-sky-600" />
              <span className="absolute left-1 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" />
            </span>
          </label>
        ))}
      </div>
    </details>
  );
}
