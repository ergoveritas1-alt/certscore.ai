"use client";
import { californiaAssessmentPresentation } from "../../lib/scans/california-assessment-presentation";
import { CaliforniaReviewCoverage } from "./california-review-coverage";
import type { CaliforniaPrivacyReview } from "@certscore/contracts";
import { useLayoutEffect, useRef, useState } from "react";
import { FindingRow } from "./report-finding-row";
import { CompactScrollHint } from "./compact-scroll-hint";
import { selectRegulatoryReview, regulatoryReviewContext } from "../../lib/scans/regulatory-review-catalog";
import { REVIEW_FOCUS_LABELS } from "../../lib/scans/report-review-focus";
import type { ReportReviewFocus } from "@certscore/api-contracts";
import type { SitePriorityFinding } from "../../lib/scans/full-site-priority-review";

type ReviewProps = { californiaAssessment?: CaliforniaPrivacyReview | null; findings: SitePriorityFinding[]; pending: boolean; sitewideAvailable: boolean; scannedPages?: number | null; reviewFocus?: ReportReviewFocus };
export function SitePriorityReview({ reviewFocus = "gdpr_eprivacy", ...props }: ReviewProps) {
  const { topIssues } = selectRegulatoryReview(props.findings, reviewFocus);
  return <>
    <PrioritySection {...props} findings={topIssues} reviewFocus={reviewFocus} />
    {reviewFocus === "ccpa_cpra" ? <CaliforniaReviewCoverage assessment={props.californiaAssessment} homepage={(props.scannedPages ?? 1) > 1} /> : null}
  </>;
}
function PrioritySection({ californiaAssessment, findings, pending, sitewideAvailable, scannedPages, reviewFocus = "gdpr_eprivacy" }: ReviewProps) {
  const coverage = californiaAssessment && "reviewCoverage" in californiaAssessment ? californiaAssessment.reviewCoverage : undefined;
  const californiaPresentation = californiaAssessmentPresentation(coverage);
  const incompleteCalifornia = reviewFocus === "ccpa_cpra" && californiaPresentation.incomplete;
  const listRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState<number>();
  const [atBottom, setAtBottom] = useState(false);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || findings.length <= 3) return;
    const summaries = Array.from(list.children).slice(0, 3).map(row => row.querySelector("summary")).filter((row): row is HTMLElement => Boolean(row));
    const updateScrollPosition = () => setAtBottom(list.scrollHeight > list.clientHeight + 1 && list.scrollTop + list.clientHeight >= list.scrollHeight - 2);
    const measure = () => {
      const collapsedHeight = summaries.reduce((height, row) => height + row.getBoundingClientRect().height + 1, 1);
      setListHeight(collapsedHeight);
      updateScrollPosition();
    };
    const observer = new ResizeObserver(measure);
    summaries.forEach(row => observer.observe(row));
    observer.observe(list);
    Array.from(list.children).forEach(row => observer.observe(row));
    list.addEventListener("toggle", measure, true);
    list.addEventListener("scroll", updateScrollPosition, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      list.removeEventListener("toggle", measure, true);
      list.removeEventListener("scroll", updateScrollPosition);
    };
  }, [findings]);
  return <section id="report-top-issues" aria-label="Top issues" className={`my-3 border-y border-zinc-200 bg-white pt-3 ${findings.length > 3 ? "pb-1" : "pb-3"}`}>
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{`Regulatory Risk Review · ${REVIEW_FOCUS_LABELS[reviewFocus]} & accessibility`}</p><h2 className="mt-1 text-xl font-semibold">{scannedPages === 1 ? "Top issues on this page" : "Top issues across your site"}</h2></div>
      <span className="shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-600">{incompleteCalifornia && findings.length === 0 ? "Assessment incomplete" : `${findings.length} ${findings.length === 1 ? "issue" : "issues"}`}</span>
    </div>
    {reviewFocus === "ccpa_cpra" ? <p className="mt-2 max-w-3xl text-xs leading-5 text-zinc-500">Review the coverage below for the checks completed in this visit. Notice completeness and legal applicability remain unassessed.</p> : null}
    {pending || !sitewideAvailable ? <p className="mt-1 text-xs text-zinc-500">{pending ? (sitewideAvailable ? "Priority issues are updating as the scan progresses." : "Loading sitewide priority review…") : "Starting page issues shown. Sitewide priority assessment is unavailable for this scan."}</p> : null}
    {!findings.length ? <p className="mt-4 text-sm text-zinc-600">{pending || !sitewideAvailable ? "Priority issues will appear when assessed evidence is available." : reviewFocus === "ccpa_cpra" ? californiaPresentation.emptySummary : `No ${REVIEW_FOCUS_LABELS[reviewFocus]} priority issues were identified in the assessed evidence.`}</p> : <div className="group/scroll">
      <div ref={listRef} role="region" aria-label="Priority issues" tabIndex={findings.length > 3 ? 0 : undefined} style={{ maxHeight: findings.length <= 3 ? "none" : listHeight }} className={`mt-2 ${findings.length > 3 ? "max-h-96 overflow-y-auto overscroll-y-auto" : ""} border-t border-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500`}>
        {findings.map((item, index) => <FindingRow key={item.id} priority regulatoryContext={regulatoryReviewContext(item.id, reviewFocus)} idPrefix="sitewide-" finding={{...item, rank: index + 1, focus: "", vendors: []}} pages={item.pages} observations={item.observations} />)}
      </div>
      {findings.length > 3 ? <CompactScrollHint atBottom={atBottom} onClick={() => {
        const list = listRef.current;
        if (!list) return;
        list.scrollBy({ top: atBottom ? -list.scrollHeight : list.clientHeight * 0.85,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }}>
        {atBottom ? "Scroll up to earlier issues." : `Scroll for all ${findings.length} issues.`}
      </CompactScrollHint> : null}
    </div>}
  </section>;
}
