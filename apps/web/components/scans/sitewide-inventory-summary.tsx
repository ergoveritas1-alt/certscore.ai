"use client";
import { useId, useState } from "react";
import { ScanLiveValue } from "./scan-live-value";
import type { FullSiteReportResponse } from "../../server/scans/full-site-report";

import { inventoryPurposeTitle } from "../../lib/scans/inventory-purpose-presentation";

const colors = ["#0ea5e9", "#f59e0b", "#8b5cf6", "#f43f5e", "#10b981", "#64748b"];
function Mix({ title, rows, updating }: { updating: boolean; title: string; rows: Array<{ label: string; count: number }> }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  if (title === "Purpose mix") {
    const grouped = new Map<string, number>();
    for (const row of rows) {
      const label = row.label.toLowerCase().startsWith("unknown") ? "Unknown purpose" : row.label;
      grouped.set(label, (grouped.get(label) ?? 0) + row.count);
    }
    rows = [...grouped].map(([label, count]) => ({ label, count }));
  }
  const evidenceOrder = ["Non-essential", "Review", "Essential", "Contextual"];
  if (title === "Evidence mix") rows = [...rows].sort((a, b) => evidenceOrder.indexOf(a.label) - evidenceOrder.indexOf(b.label));
  const color = (label: string, index: number) => title === "Evidence mix"
    ? ({ "Non-essential": "#f43f5e", Review: "#f59e0b", Essential: "#3b82f6", Contextual: "#0ea5e9" }[label] ?? "#94a3b8")
    : label === "Unknown – 1st party" ? "#94a3b8" : label === "Unknown – 3rd party" ? "#64748b" : label.toLowerCase() === "unknown" ? "#cbd5e1" : colors[index % colors.length];
  const ordered = rows.map((row, index) => ({ ...row, color: color(row.label, index) }));
  if (title === "Purpose mix") ordered.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const canExpand = title === "Purpose mix" && ordered.length > 3;
  const visible = canExpand && !expanded ? ordered.slice(0, 3) : ordered;
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return <section className="min-w-0 bg-white px-3 py-2">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      <span className="shrink-0 text-sm font-semibold tabular-nums"><ScanLiveValue value={total} active={updating} /></span>
    </div>
    <div aria-hidden="true" className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-zinc-200">
      {ordered.map(row => <span key={row.label} className="h-full" style={{ width: `${total ? row.count / total * 100 : 0}%`, background: row.color }} />)}
    </div>
    <ul id={listId} className="mt-1 max-h-44 w-full min-w-0 space-y-0 overflow-auto text-[11px] leading-[14px]" aria-label={`${title}: ${total} resource identities`}>
      {visible.map(row => <li key={row.label} className="flex items-start gap-1.5"><span aria-hidden="true" className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: row.color }} /><span title={title === "Purpose mix" ? inventoryPurposeTitle(row.label) : undefined} className="min-w-0 flex-1 capitalize">{row.label === "Review" ? "Needs review" : row.label === "request" ? "Network requests" : row.label === "embed" ? "Embedded content" : row.label === "storage" ? "Browser storage" : row.label === "first_party" ? "1st Party" : row.label === "third_party" ? "3rd Party" : row.label.replaceAll("_", " ")}</span><strong className="shrink-0 tabular-nums"><ScanLiveValue value={row.count} active={updating} /></strong></li>)}
      {!total ? <li>No retained resources</li> : null}
    </ul>
    {canExpand ? <button type="button" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(!expanded)} className="mt-1 rounded text-[11px] font-medium text-sky-700 hover:text-sky-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">{expanded ? "Show less" : `… Show all (${ordered.length})`}</button> : null}
  </section>;
}
export function SitewideInventorySummary({ mix, updating = false }: { updating?: boolean; mix: FullSiteReportResponse["inventoryMix"] }) {
  return <section aria-label="Sitewide resource inventory" className="my-3 border-y border-zinc-200 bg-white">
    <p className="px-3 pt-2 text-[10px] text-zinc-500">Distinct resources · Repeated observations count once; services group related resources.</p>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-px bg-zinc-200">{mix.type ? <Mix updating={updating} title="Type mix" rows={mix.type} /> : null}<Mix updating={updating} title="Evidence mix" rows={mix.evidence} /><Mix updating={updating} title="Purpose mix" rows={mix.purpose} /><Mix updating={updating} title="Site relationship" rows={mix.relationship} /></div>
  </section>;
}
