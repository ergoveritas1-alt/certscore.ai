"use client";
import { ScanLiveValue } from "./scan-live-value";

export type InventoryAssessmentCounts = { nonEssential: number; review: number; contextual: number; essential: number };
export type ReportInventoryMetric = { label: string; value: number | null | undefined; counts?: InventoryAssessmentCounts; note?: string };

/** Shared presentation only: counts and classifications are supplied by canonical projections. */
export function ReportInventorySummary({ metrics, updating = false }: { metrics: ReportInventoryMetric[]; updating?: boolean }) {
  return <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-3" aria-label="Inventory summary">
    {metrics.map(metric => <div key={metric.label} className="flex min-w-0 flex-col bg-white px-3 py-3">
      <span className="text-xs font-medium text-slate-500">{metric.label}</span>
      <strong className="my-1 block text-2xl font-semibold tracking-tight text-slate-950 tabular-nums"><ScanLiveValue value={metric.value} active={updating} /></strong>
      <dl className="space-y-0.5 text-xs leading-4 tabular-nums" aria-label="Inventory classifications">
        {([
          ["Non-essential", "nonEssential", "bg-rose-500"], ["Needs review", "review", "bg-amber-500"],
          ["Contextual", "contextual", "bg-sky-500"], ["Essential", "essential", "bg-blue-500"],
        ] as const).map(([label, key, color]) => <div key={key} className="flex items-center justify-between gap-2">
          <dt title={key === "contextual" ? "Classification of observed content; consent-related findings are assessed separately." : undefined} className="flex items-center gap-1.5 text-slate-600"><span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />{label}</dt>
          <dd className="font-medium text-slate-900"><ScanLiveValue value={metric.counts?.[key]} active={updating} /></dd>
        </div>)}
      </dl>
      {metric.note ? <p className="mt-1 text-[10px] text-amber-800">{metric.note}</p> : null}
    </div>)}
  </div>;
}
