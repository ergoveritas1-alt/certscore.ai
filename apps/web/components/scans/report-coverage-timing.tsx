import type { ReactNode } from "react";

/** Shared disclosure; callers supply retained coverage and timing facts. */
export function ReportCoverageTiming({ duration, technology, groups, started, completed }: {
  duration: string;
  technology: { platform: string; version: string };
  groups: { title: string; rows: (readonly [string, ReactNode] | ReactNode[])[] }[];
  started: string;
  completed: string;
}) {
  return <details className="text-xs text-zinc-600 sm:relative">
    <summary className="cursor-pointer font-medium">Coverage & timing · {duration}</summary>
    <div className="absolute left-4 right-4 z-20 mt-2 max-h-[70vh] overflow-y-auto rounded-lg border border-zinc-200 bg-white p-3 shadow-lg sm:left-0 sm:right-auto sm:top-full sm:w-[min(38rem,85vw)]">
      <dl className="mb-3 grid gap-2 border-b border-zinc-200 pb-3 text-xs sm:grid-cols-2">
        <div className="flex items-baseline justify-between gap-3"><dt className="text-zinc-500">CMS / generator</dt><dd className="text-right font-medium text-zinc-800">{technology.platform}</dd></div>
        <div className="flex items-baseline justify-between gap-3"><dt className="text-zinc-500">Declared version</dt><dd className="text-right font-medium tabular-nums text-zinc-800">{technology.version === "Unknown" ? "Not available" : technology.version}</dd></div>
      </dl>
      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map(group => <div key={group.title}>
          <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{group.title}</h3>
          <dl className="divide-y divide-zinc-100">{group.rows.map(([label, value]) => <div key={String(label)} className="flex items-baseline justify-between gap-3 py-1.5 text-xs leading-4">
            <dt className="text-zinc-500">{label}</dt><dd className="text-right font-medium tabular-nums text-zinc-800" title={value === "Unavailable" ? "Unavailable" : undefined}>{value === "Unavailable" ? "-" : value}</dd>
          </div>)}</dl>
        </div>)}
      </div>
      <dl className="mt-2 border-t border-zinc-200 pt-2 text-[11px] leading-4">{[["Started", started], ["Completed", completed]].map(([label, value]) => <div key={label} className="flex justify-between gap-3 py-0.5"><dt className="text-zinc-500">{label}</dt><dd className="text-right tabular-nums text-zinc-600">{value}</dd></div>)}</dl>
    </div>
  </details>;
}
