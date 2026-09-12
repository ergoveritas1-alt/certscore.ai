"use client";
import { createContext, useContext, type ReactNode } from "react";
import { sitewideEvidenceGroups, type SitewideEvidencePage } from "../../lib/scans/sitewide-evidence-index";
import { CopyJsonButton } from "./copy-json-button";
import { DisclosureChevron } from "./report-finding-row";

export const SitewideEvidenceContext = createContext<{pages: SitewideEvidencePage[]; limitedPages: number} | null>(null);
export function SitewideEvidenceCard({group, children}: {group: keyof typeof sitewideEvidenceGroups; children?: ReactNode}) {
  const evidence = useContext(SitewideEvidenceContext);
  const title = group === "tracking" ? "Tracking & embedded content" : "Storage & tracking techniques";
  const ids = new Set<string>(sitewideEvidenceGroups[group]);
  const pages = evidence?.pages.map(page => ({...page, rows: page.rows.filter(row => ids.has(row.id))})) ?? [];
  const checks = [...ids].map(id => {
    const observations = pages.flatMap(page => page.rows.filter(row => row.id === id).map(row => ({...row, pageId: page.pageId, url: page.url, sourceHash: page.sourceHash})));
    const statusOrder = ["Gap observed", "Review signal", "Needs review", "Insufficient evidence", "Not testable", "Not confirmed", "No match found", "Not observed", "Observed"];
    const rank = (status: string) => { const index = statusOrder.indexOf(status); return index < 0 ? statusOrder.length : index; };
    observations.sort((a, b) => rank(a.status) - rank(b.status));
    const statuses = new Map<string, number>();
    const summaries = new Map<string, number>();
    for (const row of observations) {
      const status = row.status === "Review signal" ? "Needs review" : row.status;
      statuses.set(status, (statuses.get(status) ?? 0) + 1);
      summaries.set(row.summary, (summaries.get(row.summary) ?? 0) + 1);
    }
    return {id, title: observations[0]?.title ?? id, observations, statuses: [...statuses], summaries: [...summaries],
      needsReview: observations.some(row => ["gap_observed", "review_signal"].includes(row.assessmentStatus))};
  }).filter(check => check.observations.length);
  const count = checks.filter(check => check.needsReview).length;
  return <details className="group/sitewide border-b border-r border-zinc-200 p-5">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
      <div><p className="text-xs font-semibold uppercase text-zinc-500">{title} · Sitewide</p><h3 className="mt-1 text-sm font-semibold">{evidence ? `${count} ${count === 1 ? "check needs" : "checks need"} review · ${pages.length} assessed ${pages.length === 1 ? "page" : "pages"}` : "Sitewide assessment unavailable"}</h3></div>
      <DisclosureChevron className="text-zinc-400 group-open/sitewide:rotate-180"/>
    </summary>
    {evidence ? <div className="mt-3 divide-y border-t">
      {evidence.limitedPages ? <p className="py-2 text-xs text-amber-800">{evidence.limitedPages} page(s) have unavailable or limited coverage.</p> : null}
      {checks.map(check => <details key={check.id} className="group/check py-3">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span><span className="block text-sm font-semibold">{check.title}</span>
          <span className="mt-1 block text-xs text-zinc-500">{check.statuses.map(([status, count]) => `${status}: ${count} ${count === 1 ? "page" : "pages"}`).join(" · ")}</span></span>
          <DisclosureChevron className="mt-1 text-zinc-400 group-open/check:rotate-180"/>
        </summary>
        <div className="mt-2 space-y-2">
          {check.summaries.map(([summary, count]) => <p key={summary} className="text-xs text-zinc-600">{summary} <span className="text-zinc-400">({count} {count === 1 ? "page" : "pages"})</span></p>)}
          <div className="flex items-center justify-end gap-2 text-xs text-zinc-500">Evidence and source references
            <CopyJsonButton label="Copy aggregated check evidence and page provenance" payload={JSON.stringify(check.observations, null, 2)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sky-700 hover:bg-sky-50"/>
          </div>
        </div>
      </details>)}
    </div> : <p className="mt-2 text-xs text-zinc-500">Verified sitewide evidence is not available yet.</p>}
  </details>;
}
