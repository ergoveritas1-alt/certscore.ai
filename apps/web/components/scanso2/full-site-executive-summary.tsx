"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { FullSiteReportResponse } from "../../server/scans/full-site-report";
import { getGdprEprivacyPostureTone } from "../../lib/scans/regulatory-coverage-score";
import { ScanLiveValue } from "./scan-live-value";

export function FullSiteExecutiveSummary({ score, pending, scannedPages, statusLabel, actions, snapshot, homepageVerdict, inventorySummary }: {
  score?: FullSiteReportResponse["score"];
  pending: boolean;
  statusLabel?: string;
  actions?: ReactNode;
  scannedPages: number | null;
  snapshot?: ReactNode;
  inventorySummary?: ReactNode;
  homepageVerdict?: string;
}) {
  const layoutRef = useRef<HTMLDivElement>(null);
  const [collapsedHeight, setCollapsedHeight] = useState<number>();
  useLayoutEffect(() => {
    const root = layoutRef.current;
    if (!root) return;
    const measure = () => {
      const columns = Array.from(root.children) as HTMLElement[];
      if (getComputedStyle(root).gridTemplateColumns.split(" ").length < 2) {
        setCollapsedHeight(undefined);
        return;
      }
      const heights = columns.map(column => Array.from(column.children).reduce((height, child) => {
        const element = child as HTMLElement;
        let contentHeight = element.getBoundingClientRect().height;
        // Exclude disclosure bodies: opening a snapshot must not resize the other column.
        element.querySelectorAll<HTMLDetailsElement>("details[open]").forEach(details => {
          if (details.parentElement?.closest("details[open]")) return;
          const summary = details.querySelector(":scope > summary");
          if (!summary) return;
          const css = getComputedStyle(details);
          const closedHeight = summary.getBoundingClientRect().height + parseFloat(css.paddingTop) + parseFloat(css.paddingBottom) + parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth);
          contentHeight -= details.getBoundingClientRect().height - closedHeight;
        });
        return height + contentHeight;
      }, 20));
      setCollapsedHeight(Math.ceil(Math.max(...heights)));
    };
    const observer = new ResizeObserver(measure);
    root.querySelectorAll("[data-overview-block]").forEach(element => observer.observe(element));
    observer.observe(root);
    measure();
    return () => observer.disconnect();
  });
  const value = score?.value ?? null;
  const color = getGdprEprivacyPostureTone(value).ringColor;
  const priorities = score?.priorityReview;
  const singlePage = scannedPages === 1;
  return <section aria-label="Full site executive overview" className="my-4 rounded-xl border border-zinc-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-5 py-3">
      <div className="flex items-center gap-3"><h2 className="text-xl font-semibold tracking-tight text-zinc-950">Executive overview</h2>{actions}</div>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{statusLabel ? `Full site assessment · ${statusLabel}` : pending ? "Scan in progress" : "Full site assessment"}</span>
    </div>
    <div ref={layoutRef} className="grid items-start gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.65fr)] lg:gap-8">
      <div className="flex min-w-0 flex-col gap-5" style={{ minHeight: collapsedHeight }}>
        <div data-overview-block>
        <div className="flex items-center gap-4">
          <div role="img" aria-label={value === null ? (pending ? "Full site score awaiting scored evidence" : "Full site score unavailable") : `Full site score ${value} out of 100`} className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full p-2" style={{background: value === null ? "#e4e4e7" : `conic-gradient(${color} 0 ${value}%, #e4e4e7 ${value}% 100%)`}}>
            <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white">
              <strong className="text-3xl font-semibold tabular-nums text-zinc-950"><ScanLiveValue value={value} active={pending} /></strong>
              <span className="mt-1 text-xs text-zinc-500">/ 100</span>
            </div>
          </div>
          <div className="min-w-0 border-l border-zinc-200 pl-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Site score</p>
            <p className="mt-2 text-lg font-semibold text-zinc-950">{priorities ? `${priorities.length} priority ${priorities.length === 1 ? "issue" : "issues"}` : pending ? "Assessment in progress" : "Assessment unavailable"}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{scannedPages === null ? "Waiting for page outcomes" : `${scannedPages} ${scannedPages === 1 ? "page" : "pages"} scanned`}</p>
          </div>
        </div>
        {!score ? <p className="mt-2 text-xs text-zinc-500">{pending ? "The site-wide score will appear when the assessment is ready." : "Site-wide scoring is unavailable for this scan."}</p> : null}
        {score?.limitedPages ? <p className="mt-1 text-xs text-amber-800">{score.limitedPages} {score.limitedPages === 1 ? "page has" : "pages have"} limited scoring coverage.</p> : null}
        </div>
        <div data-overview-block className="mt-auto">
          {snapshot ?? <p className="py-3 text-sm text-zinc-500">The signal snapshot will appear when the homepage assessment is ready.</p>}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-5" style={{ minHeight: collapsedHeight }}>
        <div data-overview-block>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{singlePage ? "Single page assessment" : "Site assessment"}</p>
        {singlePage ? <p className="mt-2 text-sm leading-6 text-zinc-600">{homepageVerdict ?? "The single page assessment will appear when ready."}</p>
          : priorities ? <p className="mt-2 text-sm leading-6 text-zinc-700">{priorities.length ? `Across ${scannedPages ?? score?.scoredPages ?? 0} scanned pages, the assessment identifies ${priorities.length} priority issues. Review centers on ${priorities.slice(0, 3).map(finding => finding.title.toLowerCase()).join("; ")}. These findings combine the homepage audit with eligible evidence from additional pages; repeated evidence is counted once. Consent controls, policy transparency, and action-path checks reflect the homepage audit, while the wider scan captures resources and collection surfaces across the site.` : "No priority issues were identified in the assessed evidence."}</p>
          : <p className="mt-2 text-sm leading-6 text-zinc-500">{pending ? "Page evidence is still being assessed. The site-scan assessment will appear when ready." : "Site assessment is unavailable."}</p>}
        </div>
        <div data-overview-block className="mt-auto">{inventorySummary}</div>
      </div>
    </div>
  </section>;
}
