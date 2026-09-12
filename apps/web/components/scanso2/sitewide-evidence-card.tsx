"use client";
import { createContext, useContext, type ReactNode } from "react";
import { sitewideEvidenceGroups, type SitewideEvidencePage } from "../../lib/scans/sitewide-evidence-index";
import { DisclosureChevron } from "./report-finding-row";

export const SitewideEvidenceContext = createContext<{pages: SitewideEvidencePage[]; limitedPages: number} | null>(null);
export function SitewideEvidenceCard({group, children}: {group: keyof typeof sitewideEvidenceGroups; children?: ReactNode}) {
  const evidence = useContext(SitewideEvidenceContext);
  const title = group === "tracking" ? "Tracking & external services" : "Pre-consent runtime";
  const ids = new Set<string>(sitewideEvidenceGroups[group]);
  const pages = evidence?.pages.map(page => ({...page, rows: page.rows.filter(row => ids.has(row.id))})) ?? [];
  const count = pages.reduce((sum,page) => sum + page.rows.filter(row => ["gap_observed","review_signal"].includes(row.assessmentStatus)).length,0);
  return <details className="group/sitewide border-b border-r border-zinc-200 p-5">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
      <div><p className="text-xs font-semibold uppercase text-zinc-500">{title} · Sitewide</p><h3 className="mt-1 text-sm font-semibold">{evidence ? `${count} checks requiring review · ${pages.length} assessed pages` : "Sitewide assessment unavailable"}</h3></div>
      <DisclosureChevron className="text-zinc-400 group-open/sitewide:rotate-180"/>
    </summary>
    {evidence ? <div className="mt-3 divide-y border-t">
      <p className="py-2 text-xs text-zinc-500">Homepage and verified additional-page checks. Repeated checks are shown per page; scoring remains deduplicated.{evidence.limitedPages ? ` ${evidence.limitedPages} page(s) have unavailable or limited coverage.` : ""}</p>
      {pages.map(page => <details key={page.pageId} className="py-2">
        <summary className="cursor-pointer break-all text-sm font-medium">{page.homepage ? "Homepage · " : ""}{page.url} · {page.rows.length} checks</summary>
        {page.homepage && children ? children : page.rows.map(row => <details key={row.id} className="ml-3 border-t py-2">
          <summary className="cursor-pointer text-xs font-medium">{row.title} · {row.status}</summary>
          <p className="mt-2 text-xs text-zinc-600">{row.summary}</p>
          {row.limitation ? <p className="mt-1 text-xs text-amber-800">{row.limitation}</p> : null}
          <p className="mt-2 break-all text-xs text-zinc-500">Evidence: {row.evidenceRefs.join(", ") || "No retained references"}<br/>Source hash: {page.sourceHash}</p>
        </details>)}
      </details>)}
    </div> : <p className="mt-2 text-xs text-zinc-500">Verified sitewide evidence is not available yet.</p>}
  </details>;
}
