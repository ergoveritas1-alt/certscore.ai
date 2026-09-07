import { ScanLiveValue } from "./scan-live-value";
import type { FullSiteReportResponse } from "../../server/scans/full-site-report";

import { inventoryPurposeTitle } from "../../lib/scans/inventory-purpose-presentation";

const colors = ["#0ea5e9", "#f59e0b", "#8b5cf6", "#f43f5e", "#10b981", "#64748b"];
function Mix({ title, rows, updating }: { updating: boolean; title: string; rows: Array<{ label: string; count: number }> }) {
  const evidenceOrder = ["Non-essential", "Review", "Essential", "Contextual"];
  if (title === "Evidence mix") rows = [...rows].sort((a, b) => evidenceOrder.indexOf(a.label) - evidenceOrder.indexOf(b.label));
  const color = (label: string, index: number) => title === "Evidence mix"
    ? ({ "Non-essential": "#f43f5e", Review: "#f59e0b", Essential: "#3b82f6", Contextual: "#0ea5e9" }[label] ?? "#94a3b8")
    : label === "Unknown – 1st" ? "#94a3b8" : label === "Unknown – 3rd" ? "#64748b" : label.toLowerCase() === "unknown" ? "#cbd5e1" : colors[index % colors.length];
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  let angle = 0;
  const stops = rows.map((row, index) => {
    const start = angle;
    angle += total ? row.count / total * 360 : 0;
    return `${color(row.label, index)} ${start}deg ${angle}deg`;
  });
  return <section className="min-w-0 bg-white px-3 py-4">
    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
    <div className="mt-3 flex flex-col items-center gap-3">
      <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full" style={{ background: total ? `conic-gradient(${stops.join(",")})` : "#e4e4e7" }}>
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-base font-semibold tabular-nums"><ScanLiveValue value={total} active={updating} /></span>
      </div>
      <ul className="max-h-56 w-full min-w-0 space-y-1.5 overflow-auto text-[11px] leading-4" aria-label={`${title}: ${total} resource identities`}>
        {rows.map((row, index) => <li key={row.label} className="flex items-start gap-1.5"><span aria-hidden="true" className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: color(row.label, index) }} /><span title={title === "Purpose mix" ? inventoryPurposeTitle(row.label) : undefined} className="min-w-0 flex-1 capitalize">{row.label.replaceAll("_", " ")}</span><strong className="shrink-0 tabular-nums"><ScanLiveValue value={row.count} active={updating} /></strong></li>)}
        {!total ? <li>No retained resources</li> : null}
      </ul>
    </div>
  </section>;
}
export function SitewideInventorySummary({ mix, updating = false }: { updating?: boolean; mix: FullSiteReportResponse["inventoryMix"] }) {
  return <section aria-label="Sitewide resource inventory" className="my-4 border-y border-zinc-200 bg-white">
    <div className="border-b border-zinc-200 py-4"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Resource inventory</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Cookies, storage, requests, and embeds</h2><p className="mt-1 text-xs text-zinc-500">Distinct resource identities across all scanned pages, including retained partial observations. Repeated events count once; service groupings and script duplicates are excluded.</p></div>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-px bg-zinc-200">{mix.type ? <Mix updating={updating} title="Type mix" rows={mix.type} /> : null}<Mix updating={updating} title="Evidence mix" rows={mix.evidence} /><Mix updating={updating} title="Purpose mix" rows={mix.purpose} /><Mix updating={updating} title="Site relationship" rows={mix.relationship} /></div>
  </section>;
}
