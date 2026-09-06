import type { FullSiteReportResponse } from "../../server/scans/full-site-report";

const colors = ["#0ea5e9", "#f59e0b", "#8b5cf6", "#f43f5e", "#10b981", "#64748b"];
function Mix({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  let angle = 0;
  const stops = rows.map((row, index) => {
    const start = angle;
    angle += total ? row.count / total * 360 : 0;
    return `${colors[index % colors.length]} ${start}deg ${angle}deg`;
  });
  return <section className="min-w-0 p-4">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
    <div className="mt-4 flex items-center gap-4">
      <div aria-hidden="true" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full" style={{ background: total ? `conic-gradient(${stops.join(",")})` : "#e4e4e7" }}>
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-lg font-semibold tabular-nums">{total}</span>
      </div>
      <ul className="max-h-36 min-w-0 flex-1 space-y-2 overflow-auto text-xs" aria-label={`${title}: ${total} resource identities`}>
        {rows.map((row, index) => <li key={row.label} className="flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[index % colors.length] }} /><span className="flex-1 capitalize">{row.label.replaceAll("_", " ")}</span><strong className="tabular-nums">{row.count}</strong></li>)}
        {!total ? <li>No retained resources</li> : null}
      </ul>
    </div>
  </section>;
}
export function SitewideInventorySummary({ mix }: { mix: FullSiteReportResponse["inventoryMix"] }) {
  return <section aria-label="Sitewide resource inventory" className="my-4 rounded-xl border border-zinc-200 bg-white">
    <div className="border-b border-zinc-200 px-4 py-4"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Resource inventory</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Cookies, storage, requests, and embeds</h2><p className="mt-1 text-xs text-zinc-500">Distinct resource identities across all scanned pages, including retained partial observations. Repeated events count once; service groupings and script duplicates are excluded.</p></div>
    <div className="grid divide-y divide-zinc-200 lg:grid-cols-3 lg:divide-x lg:divide-y-0"><Mix title="Evidence mix" rows={mix.evidence} /><Mix title="Purpose mix" rows={mix.purpose} /><Mix title="Site relationship" rows={mix.relationship} /></div>
  </section>;
}
