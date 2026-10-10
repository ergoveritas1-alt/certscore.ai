"use client";

import React, { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { FullSiteReportResponse } from "../../server/scans/full-site-report";
import { getGdprEprivacyPostureTone } from "../../lib/scans/regulatory-coverage-score";
import { ScanLiveValue } from "./scan-live-value";

export function buildSiteAssessmentSummary(priorities: ReadonlyArray<{ title: string; summary?: string }>, scannedPages: number | null) {
  if (!priorities.length) return "No priority issues were identified in the assessed evidence.";

  const count = priorities.length.toLocaleString("en-US");
  const pageScope = scannedPages !== null && scannedPages > 0
    ? ` across ${scannedPages.toLocaleString("en-US")} ${scannedPages === 1 ? "page" : "pages"}` : "";
  const lead = `The scan identified ${count} priority ${priorities.length === 1 ? "issue" : "issues"}${pageScope}.`;
  const first = priorities[0]!;
  const title = first.title.trim().replace(/[.!?]$/, "");
  const topFinding = title && title.length <= 120
    ? ` ${priorities.length === 1 ? "The finding" : "The leading finding"} is “${title}”.` : "";
  const summary = first.summary?.trim().split(/(?<=[.!?])\s+(?=[A-Z])/)[0]?.trim();
  const detail = summary && summary.length <= 200 && summary.toLowerCase() !== title.toLowerCase()
    ? ` ${summary}${/[.!?]$/.test(summary) ? "" : "."}` : "";
  const otherTitles = priorities.slice(1, 3).map(finding => finding.title.trim().replace(/[.!?]$/, ""));
  const otherIssues = topFinding && otherTitles.length && otherTitles.every(value => value && value.length <= 80) && otherTitles.join("; ").length <= 140
    ? ` Other issues include ${otherTitles.map(value => `“${value}”`).join(" and ")}.` : "";
  const more = priorities.length > 3 || !topFinding || (priorities.length > 1 && !otherIssues)
    ? " See Regulatory Risk Review for the full list." : "";
  return `${lead}${topFinding}${detail}${otherIssues}${more}`;
}

export function FullSiteExecutiveSummary({ score, pending, loadingSavedResult = false, scannedPages, statusLabel, actions, snapshot, homepageVerdict, inventorySummary }: {
  score?: (Pick<NonNullable<FullSiteReportResponse["score"]>, "value" | "priorityReview" | "scoredPages"> & { limitedPages?: number }) | null;
  pending: boolean;
  loadingSavedResult?: boolean;
  statusLabel?: string;
  actions?: ReactNode;
  scannedPages: number | null;
  snapshot?: ReactNode;
  inventorySummary?: ReactNode;
  homepageVerdict?: string;
}) {
  const panesRef = useRef<HTMLDivElement>(null);
  const [collapsedHeight, setCollapsedHeight] = useState(0);
  useEffect(() => {
    const grid = panesRef.current;
    if (!grid) return;
    // Keep the collapsed baseline when a disclosure opens so the opposite pane stays put.
    const measure = () => {
      if (!window.matchMedia("(min-width: 768px)").matches) { setCollapsedHeight(0); return; }
      if (grid.querySelector("details[open]")) return;
      const heights = Array.from(grid.children, pane => {
        const children = Array.from(pane.children);
        return children.reduce((sum, child) => sum + child.getBoundingClientRect().height, 0)
          + parseFloat(getComputedStyle(pane).rowGap) * Math.max(0, children.length - 1);
      });
      setCollapsedHeight(Math.ceil(Math.max(...heights)));
    };
    const observer = new ResizeObserver(measure);
    for (const pane of grid.children) for (const child of pane.children) observer.observe(child);
    grid.addEventListener("toggle", measure, true);
    window.addEventListener("resize", measure);
    measure();
    return () => { observer.disconnect(); grid.removeEventListener("toggle", measure, true); window.removeEventListener("resize", measure); };
  }, []);
  const value = score?.value ?? null;
  const color = getGdprEprivacyPostureTone(value).ringColor;
  const priorities = score?.priorityReview;
  const singlePage = scannedPages === 1;
  const scoreLabel = singlePage ? "Page score" : "Site score";
  return <section aria-label="Executive overview" className="my-4 rounded-xl border border-zinc-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-semibold tracking-tight text-zinc-950">Executive overview</h2>{actions}</div>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{pending ? statusLabel ?? "Scan in progress" : statusLabel ? `Site assessment · ${statusLabel}` : scannedPages !== null ? `${scannedPages} ${singlePage ? "page" : "pages"} assessed` : "Site assessment"}</span>
    </div>
    <div ref={panesRef} style={{ "--overview-height": `${collapsedHeight}px` } as CSSProperties} className="grid items-start gap-6 p-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)] lg:p-5 lg:gap-8">
      <div className="flex min-w-0 flex-col justify-between gap-5 md:min-h-[var(--overview-height)]">
        <div data-overview-block>
        <div className="flex items-center gap-3 lg:gap-4">
          <div role="img" aria-label={value === null ? (loadingSavedResult ? `${scoreLabel} loading saved result` : pending ? `${scoreLabel} awaiting scored evidence` : `${scoreLabel} unavailable`) : `${scoreLabel} ${value} out of 100`} className="flex h-24 w-24 shrink-0 lg:h-28 lg:w-28 items-center justify-center rounded-full p-2" style={{background: value === null ? "#e4e4e7" : `conic-gradient(${color} 0 ${value}%, #e4e4e7 ${value}% 100%)`}}>
            <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white">
              <strong className="text-3xl font-semibold tabular-nums text-zinc-950"><ScanLiveValue value={value} active={pending} /></strong>
              <span className="mt-1 text-xs text-zinc-500">/ 100</span>
            </div>
          </div>
          <div className="min-w-0 border-l border-zinc-200 pl-3 lg:pl-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{scoreLabel}</p>
            <p className="mt-2 text-lg font-semibold text-zinc-950">{priorities ? `${priorities.length} priority ${priorities.length === 1 ? "issue" : "issues"}` : loadingSavedResult ? "Loading saved assessment" : pending ? "Assessment in progress" : "Assessment unavailable"}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{scannedPages === null ? loadingSavedResult ? "Loading sitewide page totals" : "Waiting for page outcomes" : `${scannedPages} ${scannedPages === 1 ? "page" : "pages"} scanned`}</p>
          </div>
        </div>
        {!score ? <p className="mt-2 text-xs text-zinc-500">{loadingSavedResult ? "The sitewide score will appear when the saved result loads." : pending ? `${singlePage ? "The page score" : "The site-wide score"} will appear when the assessment is ready.` : `${singlePage ? "Page scoring" : "Site-wide scoring"} is unavailable for this scan.`}</p> : null}
        {score?.limitedPages ? <p className="mt-1 text-xs text-amber-800">{score.limitedPages} {score.limitedPages === 1 ? "page has" : "pages have"} limited scoring coverage.</p> : null}
        </div>
        <div data-overview-block>{snapshot ?? <p className="py-3 text-sm text-zinc-500">The signal snapshot will appear when the starting-page assessment is ready.</p>}</div>
      </div>
      <div className="flex min-w-0 flex-col justify-between gap-4 md:min-h-[var(--overview-height)]">
        <div data-overview-block>
        <h3 className="text-sm font-bold tracking-tight text-zinc-900">Assessment highlights</h3>
        {singlePage ? <p className="mt-2 text-sm leading-6 text-zinc-600">{homepageVerdict ?? "The single page assessment will appear when ready."}</p>
          : priorities ? <p className="mt-2 text-sm leading-5 text-zinc-700">{buildSiteAssessmentSummary(priorities, scannedPages ?? score?.scoredPages ?? null)}</p>
          : <p className="mt-2 text-sm leading-6 text-zinc-500">{loadingSavedResult ? "Loading the saved site assessment." : pending ? "Page evidence is still being assessed. The site-scan assessment will appear when ready." : "Site assessment is unavailable."}</p>}
        </div>
        {inventorySummary ? <div>{inventorySummary}</div> : null}
      </div>
    </div>
  </section>;
}
