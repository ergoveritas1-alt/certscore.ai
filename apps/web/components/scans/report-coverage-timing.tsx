import type { ReactNode } from "react";

/** Shared disclosure; callers supply retained coverage and timing facts. */
export function ReportCoverageTiming({ scanId, duration, showDurationInSummary = true, groups, started, completed, pagesCsvHref }: {
  scanId: string;
  duration: string;
  showDurationInSummary?: boolean;
  groups: { title: string; rows: (readonly [string, ReactNode] | ReactNode[])[] }[];
  started: string;
  completed: string;
  pagesCsvHref?: string;
}) {
  return <details className="text-xs text-zinc-600 sm:relative">
    <summary className="cursor-pointer font-medium">Coverage{showDurationInSummary ? ` · ${duration}` : null}</summary>
    <div className="absolute left-4 right-4 z-20 mt-2 max-h-[70vh] overflow-y-auto rounded-lg border border-zinc-200 bg-white p-3 shadow-lg sm:left-0 sm:right-auto sm:top-full sm:w-[min(38rem,85vw)]">
      {pagesCsvHref ? <div className="mb-3 border-b border-zinc-200 pb-3">
        <a href={pagesCsvHref} download className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">Download covered pages CSV</a>
        <p className="mt-1.5 text-[11px] text-zinc-500">All discovered URLs, including unscanned pages, with capture status and reasons. In-progress scans export the current state.</p>
      </div> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map(group => <div key={group.title}>
          <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{group.title}</h3>
          <dl className="divide-y divide-zinc-100">{group.rows.map(([label, value]) => <div key={String(label)} className="flex items-baseline justify-between gap-3 py-1.5 text-xs leading-4">
            <dt className="text-zinc-500">{label}</dt><dd className="text-right font-medium tabular-nums text-zinc-800" title={value === "Unavailable" ? "Unavailable" : undefined}>{value === "Unavailable" ? "-" : value}</dd>
          </div>)}</dl>
        </div>)}
      </div>
      <div className="mt-3 border-t border-zinc-200 pt-2 text-[11px] leading-4">
        <p className="text-zinc-500">scan_id</p>
        <p className="mt-1 select-all break-all font-mono text-zinc-700">{scanId}</p>
      </div>
      <dl className="mt-2 border-t border-zinc-200 pt-2 text-[11px] leading-4">{[["Started", started], ["Completed", completed]].map(([label, value]) => <div key={label} className="flex justify-between gap-3 py-0.5"><dt className="text-zinc-500">{label}</dt><dd className="text-right tabular-nums text-zinc-600">{value}</dd></div>)}</dl>
    </div>
  </details>;
}
