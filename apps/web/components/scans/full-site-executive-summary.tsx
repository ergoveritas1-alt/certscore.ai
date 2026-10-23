"use client";

import { californiaAssessmentPresentation } from "../../lib/scans/california-assessment-presentation";
import { selectRegulatoryReview } from "../../lib/scans/regulatory-review-catalog";
import { REVIEW_FOCUS_LABELS } from "../../lib/scans/report-review-focus";
import type { ReportReviewFocus } from "@certscore/api-contracts";
import { AssessmentHighlightsText } from "./assessment-highlights-text";

import React, { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { FullSiteReportResponse } from "../../server/scans/full-site-report";
import { getGdprEprivacyPostureTone } from "../../lib/scans/regulatory-coverage-score";
import { ScanLiveValue } from "./scan-live-value";
import type { ScoreDeductions } from "./score-deductions";
import type { CaliforniaRegulatoryScore } from "../../lib/scans/california-regulatory-score";
import { buildAssessmentHighlights, buildAssessmentHighlightsPresentation, type AssessmentHighlightCopy, type AssessmentHighlightLink, type AssessmentHighlightFinding, type AssessmentContext } from "../../lib/scans/assessment-highlights";

export function buildSiteAssessmentSummary(priorities: ReadonlyArray<AssessmentHighlightFinding>, scannedPages: number | null, context: AssessmentContext = {}) {
  return buildAssessmentHighlights(priorities, { kind: "site", scannedPages }, context);
}

export function FullSiteExecutiveSummary({ score, californiaScore, pending, loadingSavedResult = false, scannedPages, statusLabel, actions, snapshot, homepageVerdict, homepageHighlightLinks, homepageHighlightExpansion, inventorySummary, reviewFocus }: {
  reviewFocus?: ReportReviewFocus;
  californiaScore?: CaliforniaRegulatoryScore | null;
  score?: (Pick<NonNullable<FullSiteReportResponse["score"]>, "value" | "priorityReview" | "scoredPages"> & { limitedPages?: number; deductions?: ScoreDeductions }) | null;
  pending: boolean;
  loadingSavedResult?: boolean;
  statusLabel?: string;
  actions?: ReactNode;
  scannedPages: number | null;
  snapshot?: ReactNode;
  inventorySummary?: ReactNode;
  homepageVerdict?: string;
  homepageHighlightLinks?: readonly AssessmentHighlightLink[];
  homepageHighlightExpansion?: AssessmentHighlightCopy;
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
  // The two policies interpret the same persisted evidence independently.
  const californiaReview = reviewFocus === "ccpa_cpra";
  const californiaPresentation = californiaAssessmentPresentation(californiaScore?.reviewCoverage);
  const value = californiaReview ? californiaScore?.score ?? null : score?.value ?? null;
  const color = getGdprEprivacyPostureTone(value).ringColor;
  const review = reviewFocus && score?.priorityReview ? selectRegulatoryReview(score.priorityReview, reviewFocus) : null;
  const priorities = review?.topIssues ?? score?.priorityReview;
  const singlePage = scannedPages === 1;
  const scoreLabel = californiaReview ? "California score" : singlePage ? "Score" : "Site score";
  const highlights = priorities && (!singlePage || reviewFocus) ? buildAssessmentHighlightsPresentation(priorities, singlePage ? { kind: "page" } : { kind: "site", scannedPages: scannedPages ?? score?.scoredPages ?? null }, { score: value, coverage: { state: score?.limitedPages ? "limited" : "unknown" } }) : null;
  return <section id="report-overview" aria-label="Executive overview" className="my-4 rounded-xl border border-zinc-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-semibold tracking-tight text-zinc-950">Executive overview</h2>{actions}</div>
      {pending || statusLabel ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{pending ? statusLabel ?? "Scan in progress" : `Site assessment · ${statusLabel}`}</span> : null}
    </div>
    <div ref={panesRef} style={{ "--overview-height": `${collapsedHeight}px` } as CSSProperties} className="grid items-start gap-6 p-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)] lg:p-5 lg:gap-8">
      <div className="flex min-w-0 flex-col justify-between gap-5 md:min-h-[var(--overview-height)]">
        <div data-overview-block>
        <div className="flex items-center gap-3 lg:gap-4">
          <div role="img" aria-label={value === null ? (loadingSavedResult ? `${scoreLabel} loading saved result` : pending ? `${scoreLabel} awaiting scored evidence` : `${scoreLabel} unavailable`) : `${scoreLabel} ${value} out of 100`} className="flex h-24 w-24 shrink-0 lg:h-28 lg:w-28 items-center justify-center rounded-full p-2" style={{background: value === null ? "#e4e4e7" : `conic-gradient(${color} 0 ${value}%, #e4e4e7 ${value}% 100%)`}}>
            <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white">
              <strong className="text-3xl font-semibold tabular-nums text-zinc-950"><ScanLiveValue value={value} active={pending && !californiaReview} /></strong>
              {value !== null ? <span className="mt-1 text-xs text-zinc-500">/ 100</span> : null}
            </div>
          </div>
          <div className="min-w-0 border-l border-zinc-200 pl-3 lg:pl-4">
            {!singlePage ? <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Site score</p> : null}
            <p className="mt-2 text-lg font-semibold text-zinc-950">{californiaReview && priorities?.length === 0 ? californiaPresentation.emptyLabel : priorities ? `${priorities.length} ${reviewFocus ? "top" : "priority"} ${priorities.length === 1 ? "issue" : "issues"}` : loadingSavedResult ? "Loading saved assessment" : pending ? "Assessment in progress" : "Assessment unavailable"}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{scannedPages === null ? loadingSavedResult ? "Loading sitewide page totals" : "Waiting for page outcomes" : `${scannedPages} ${scannedPages === 1 ? "page" : "pages"} scanned`}</p>
          </div>
        </div>
        {!score && !californiaReview ? <p className="mt-2 text-xs text-zinc-500">{loadingSavedResult ? "The sitewide score will appear when the saved result loads." : pending ? `${singlePage ? "The page score" : "The site-wide score"} will appear when the assessment is ready.` : `${singlePage ? "Page scoring" : "Site-wide scoring"} is unavailable for this scan.`}</p> : null}
        {californiaReview && value === null ? <p className="mt-2 text-xs text-zinc-600">{californiaPresentation.unavailableScore}</p> : null}
        {score?.limitedPages ? <p className="mt-1 text-xs text-amber-800">{score.limitedPages} {score.limitedPages === 1 ? "page has" : "pages have"} limited scoring coverage.</p> : null}
        </div>
        <div data-overview-block>{snapshot ?? <p className="py-3 text-sm text-zinc-500">The signal snapshot will appear when the starting-page assessment is ready.</p>}</div>
      </div>
      <div className="flex min-w-0 flex-col justify-between gap-4 md:min-h-[var(--overview-height)]">
        <div data-overview-block>
        <h3 className="text-sm font-bold tracking-tight text-zinc-900">Assessment highlights</h3>
        {reviewFocus && priorities ? <p className="mt-2 text-sm leading-6 text-zinc-600">{priorities.length ? <AssessmentHighlightsText text={highlights!.text} links={highlights!.links} expanded={highlights!.expanded} /> : californiaReview ? <AssessmentHighlightsText text={californiaPresentation.emptySummary} links={californiaPresentation.emptySummaryLinks} /> : `No ${REVIEW_FOCUS_LABELS[reviewFocus]} priority issues were identified in the assessed evidence.`}</p> : singlePage ? <p className="mt-2 text-sm leading-6 text-zinc-600"><AssessmentHighlightsText text={homepageVerdict ?? "The single page assessment will appear when ready."} links={homepageHighlightLinks} expanded={homepageHighlightExpansion} /></p>
          : priorities ? <p className="mt-2 text-sm leading-5 text-zinc-700"><AssessmentHighlightsText text={highlights!.text} links={highlights!.links} expanded={highlights!.expanded} /></p>
          : <p className="mt-2 text-sm leading-6 text-zinc-500">{loadingSavedResult ? "Loading the saved site assessment." : pending ? "Page evidence is still being assessed. The site-scan assessment will appear when ready." : "Site assessment is unavailable."}</p>}
        </div>
        {inventorySummary ? <div>{inventorySummary}</div> : null}
      </div>
    </div>
  </section>;
}
