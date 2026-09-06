"use client";

import React, { useId, useState, type ReactNode } from "react";
import { VendorBrandChip } from "./vendor-brand-chip";
import { reportEyebrow, reportSectionTitle } from "./report-typography";

const monoClass = "font-mono tabular-nums";

function DisclosureChevron({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${className}`} fill="none" viewBox="0 0 20 20">
      <path d="m6 8 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
    </svg>
  );
}

export type RuntimeObservationTimelineEvent = {
  at: string;
  atMs: number;
  detail: string;
  label: string;
  tone: "concern" | "neutral" | "positive";
  vendor?: string;
};

export type RuntimeInventoryMixRow = {
  evidence: string;
  purpose: string;
  recordCount: number;
  relationship: string;
};

export function buildRuntimeInventoryPurposeCounts(
  inventory: Array<Pick<RuntimeInventoryMixRow, "purpose" | "recordCount">>,
) {
  const counts = new Map<string, { label: string; value: number }>();
  for (const row of inventory) {
    const label = row.purpose.trim().replace(/\s+/g, " ") || "Unknown";
    const key = label.toLocaleLowerCase("en-US");
    const current = counts.get(key);
    counts.set(key, {
      label: current?.label ?? label,
      value: (current?.value ?? 0) + row.recordCount,
    });
  }
  return [...counts.values()].sort(
    (left, right) => right.value - left.value || left.label.localeCompare(right.label),
  );
}

export function RuntimeObservationTimeline({
  dominant = false,
  events,
}: {
  dominant?: boolean;
  events: RuntimeObservationTimelineEvent[];
}) {
  const consentEvent = events.find((event) => /consent/i.test(event.label));
  const firstConcern = events.find((event) => event.tone === "concern");
  const leadMs = consentEvent && firstConcern && consentEvent.atMs > firstConcern.atMs
    ? consentEvent.atMs - firstConcern.atMs
    : null;

  return (
    <div className="overflow-x-auto pb-0" data-density="compact">
      <div className={`${dominant ? "min-w-[58rem]" : "min-w-[48rem]"} relative pt-6`}>
        <div className="absolute left-0 right-0 top-[2.55rem] h-px bg-zinc-300" />
        <div
          className="relative grid gap-4"
          style={{ gridTemplateColumns: `repeat(${Math.max(events.length, 2)}, minmax(0, 1fr))` }}
        >
          {events.map((event) => (
            <div className="relative min-w-0" key={`${event.at}-${event.label}-${event.vendor ?? "unknown"}`}>
              <span
                className={`absolute top-[0.72rem] h-3 w-3 rounded-full border-2 border-white ring-1 ${
                  event.tone === "concern"
                    ? "bg-rose-500 ring-rose-500"
                    : event.tone === "positive"
                      ? "bg-emerald-600 ring-emerald-600"
                      : "bg-zinc-500 ring-zinc-500"
                }`}
              />
              {/consent/i.test(event.label) ? (
                <span
                  aria-hidden="true"
                  className="absolute left-[0.31rem] top-[1.45rem] h-6 border-l-2 border-dashed border-emerald-500"
                />
              ) : null}
              <p className={`${monoClass} text-[11px] font-semibold ${event.tone === "concern" ? "text-rose-700" : "text-zinc-600"}`}>
                {event.at}
              </p>
              <div className="mt-4 flex min-h-5 items-start gap-2">
                <p className={`${dominant ? "text-base" : "text-sm"} font-semibold text-zinc-950`}>{event.label}</p>
                {event.vendor ? (
                  <VendorBrandChip
                    className="!h-7 !w-7 [&>span]:!h-4 [&>span]:!w-4"
                    hideLabel
                    label={event.vendor}
                    showMeta={false}
                  />
                ) : null}
              </div>
              <p className="mt-0.5 max-w-[11rem] overflow-hidden text-[11px] leading-4 text-zinc-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                {event.detail}
              </p>
              {event === firstConcern && leadMs !== null ? (
                <span className="absolute -top-10 left-0 whitespace-nowrap rounded-md bg-rose-50 px-2 py-1 text-[0.65rem] font-semibold text-rose-800">
                  {Math.round(leadMs / 10) / 100}s before consent surface
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type InventoryMixItem = {
  color: string;
  label: string;
  value: number;
};

function CompactInventoryMixPanel({
  collapsibleOverflow = false,
  compact = false,
  items,
  legendColumns = 2,
  title,
}: {
  collapsibleOverflow?: boolean;
  compact?: boolean;
  items: InventoryMixItem[];
  legendColumns?: 1 | 2;
  title: string;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const hasOverflow = collapsibleOverflow && items.length > 4;
  const visibleItems = hasOverflow
    ? items.filter((item) => item.label.toLowerCase() !== "unknown").slice(0, 3)
    : items;
  const visibleLabels = new Set(visibleItems.map((item) => item.label));
  const overflowItems = hasOverflow ? items.filter((item) => !visibleLabels.has(item.label)) : [];
  let cursor = 0;
  const segments = items
    .filter((item) => item.value > 0)
    .map((item) => {
      const start = cursor;
      cursor += (item.value / Math.max(total, 1)) * 100;
      return `${item.color} ${start}% ${cursor}%`;
    });

  return (
    <div className="min-w-0 px-2 first:pl-0 last:pr-0 sm:px-3">
      <p className="text-center text-[0.62rem] font-semibold uppercase leading-4 text-zinc-500 md:text-left">{title}</p>
      <div className={`${compact ? "mt-1" : "mt-2"} flex items-start justify-center gap-3 md:justify-start`}>
        <span
          aria-label={`${title}: ${items.map((item) => `${item.label} ${item.value}`).join(", ")}`}
          className={`relative inline-flex shrink-0 self-start items-center justify-center rounded-full ${compact ? "h-[50px] w-[50px]" : "h-[60px] w-[60px]"}`}
          role="img"
          style={{ background: segments.length > 0 ? `conic-gradient(${segments.join(", ")})` : "#e4e4e7" }}
        >
          <span className={`${monoClass} inline-flex items-center justify-center rounded-full bg-white text-xs font-semibold text-zinc-900 ${compact ? "h-[30px] w-[30px]" : "h-[35px] w-[35px]"}`}>
            {total}
          </span>
        </span>
        <div className={`hidden min-w-0 flex-1 gap-x-3 gap-y-1 md:grid ${legendColumns === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {visibleItems.map((item) => (
            <div className="flex min-w-0 items-center justify-between gap-2" key={item.label}>
              <span className="flex min-w-0 items-center gap-1.5 text-[0.65rem] text-zinc-500">
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="truncate">{item.label}</span>
              </span>
              <span className={`${monoClass} text-[0.65rem] font-semibold text-zinc-800`}>{item.value}</span>
            </div>
          ))}
          {hasOverflow ? (
            <details className="group/mix col-span-full text-[0.65rem] text-zinc-500">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium [&::-webkit-details-marker]:hidden">
                <span>More…</span>
                <DisclosureChevron className="text-zinc-400 group-open/mix:rotate-180" />
              </summary>
              <div className="mt-1 grid gap-1">
                {overflowItems.map((item) => (
                  <div className="flex min-w-0 items-center justify-between gap-2" key={item.label}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span className={`${monoClass} font-semibold text-zinc-800`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function RuntimeInventoryMix({ compact = false, inventory }: { compact?: boolean; inventory: RuntimeInventoryMixRow[] }) {
  const countBy = (key: "evidence" | "purpose" | "relationship", value: string) =>
    inventory.reduce(
      (total, row) => total + (row[key].toLowerCase() === value.toLowerCase() ? row.recordCount : 0),
      0,
    );
  const purposeCounts = buildRuntimeInventoryPurposeCounts(inventory);

  return (
    <div className={`${compact ? "mt-2 pt-2" : "mt-4 pt-3"} grid grid-cols-3 divide-x divide-zinc-200 border-t border-zinc-200`}>
      <CompactInventoryMixPanel
        compact={compact}
        items={[
          { color: "#f43f5e", label: "Non-essential", value: countBy("evidence", "Non-essential") },
          { color: "#f59e0b", label: "Review", value: countBy("evidence", "Review") },
          { color: "#3b82f6", label: "Essential", value: countBy("evidence", "Essential") },
          { color: "#0ea5e9", label: "Contextual", value: countBy("evidence", "Contextual") },
        ]}
        title="Evidence mix"
      />
      <CompactInventoryMixPanel
        collapsibleOverflow
        compact={compact}
        items={purposeCounts.map((purpose, index) => ({
          color: ["#d97706", "#f59e0b", "#fbbf24", "#0ea5e9", "#94a3b8", "#8b5cf6"][index] ?? "#64748b",
          label: purpose.label,
          value: purpose.value,
        }))}
        legendColumns={1}
        title="Purpose mix"
      />
      <CompactInventoryMixPanel
        compact={compact}
        items={[
          { color: "#3b82f6", label: "Same-site", value: countBy("relationship", "Same-site") },
          { color: "#8b5cf6", label: "Cross-site", value: countBy("relationship", "Cross-site") },
          { color: "#f59e0b", label: "Mixed", value: countBy("relationship", "Mixed") },
          { color: "#94a3b8", label: "Unknown", value: countBy("relationship", "Unknown") },
        ]}
        title="Site relationship"
      />
    </div>
  );
}

export function RuntimeInventorySummaryCard({
  action,
  children,
  compact = false,
  description,
  detailsHint,
  detailsLabel,
  eyebrow,
  heading,
  initiallyOpen = false,
  inventory,
  note,
  summary,
}: {
  action?: ReactNode;
  children: ReactNode;
  compact?: boolean;
  description?: string;
  detailsHint?: ReactNode;
  detailsLabel?: string;
  eyebrow: string;
  heading: string;
  initiallyOpen?: boolean;
  inventory: RuntimeInventoryMixRow[];
  note?: string;
  summary?: string;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const detailsId = useId();
  return (
    <div className={compact ? "mt-4" : "mt-6"} data-density={compact ? "compact" : "comfortable"}>
      <section aria-label={eyebrow} className={`border-t border-zinc-200 bg-white ${compact ? "py-3" : "py-4"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div>
            <p className={reportEyebrow}>{eyebrow}</p>
            <h2 className={`mt-2 ${reportSectionTitle}`}>{heading}</h2>
          </div>
          <span className="flex shrink-0 flex-wrap items-center gap-3 text-xs font-semibold text-zinc-700">
            {summary ? <span className={monoClass}>{summary}</span> : null}
            {detailsLabel ? <button type="button" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(!open)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
              {open ? "Hide details" : "Show details"}
              <DisclosureChevron className={`h-4 w-4 ${open ? "rotate-180" : ""}`} />
            </button> : null}
            {!detailsLabel ? action : null}
          </span>
        </div>
        <RuntimeInventoryMix compact={compact} inventory={inventory} />
      </section>
      {detailsLabel ? (
        <section id={detailsId} aria-label={detailsLabel} hidden={!open} className="border-t border-zinc-200 bg-white">
          <div className="flex items-center justify-between gap-4 py-4">
            <div className="min-w-0">
              <h2 className={reportSectionTitle}>{detailsLabel}</h2>
              {detailsHint ? <div className="mt-2 text-xs leading-5 text-zinc-600">{detailsHint}</div> : null}
            </div>
            {action ? <span className="shrink-0">{action}</span> : null}
          </div>
          {description ? (
            <p className="mb-4 max-w-3xl border-t border-zinc-200 pt-4 text-xs leading-5 text-zinc-500">
              {description}
            </p>
          ) : null}
          {children}
        </section>
      ) : (
        <div className="border-t border-zinc-200">{children}</div>
      )}
      {note ? <p className="border-t border-zinc-200 px-4 py-3 text-xs leading-5 text-zinc-500">{note}</p> : null}
    </div>
  );
}
