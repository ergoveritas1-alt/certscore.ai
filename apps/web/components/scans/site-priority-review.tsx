"use client";
import { californiaAssessmentPresentation } from "../../lib/scans/california-assessment-presentation";
import type { CaliforniaPrivacyReview } from "@certscore/contracts";
import React, { useLayoutEffect, useRef, useState } from "react";
import { AssessmentHighlightsText } from "./assessment-highlights-text";
import { FindingRow } from "./report-finding-row";
import { CompactScrollHint } from "./compact-scroll-hint";
import { regulatoryReviewContext } from "../../lib/scans/regulatory-review-catalog";
import { buildRegulatoryAssessmentHighlights } from "../../lib/scans/regulatory-assessment-highlights";
import type { AssessmentReportIdentity } from "../../lib/scans/california-assessment-result-summary";
import type { AssessmentHighlightsPresentation } from "../../lib/scans/assessment-highlights";
import { REVIEW_FOCUS_LABELS } from "../../lib/scans/report-review-focus";
import type { ReportReviewFocus } from "@certscore/api-contracts";
import type { SitePriorityFinding } from "../../lib/scans/full-site-priority-review";

type ReviewProps = { reportIdentity?: AssessmentReportIdentity; californiaAssessment?: CaliforniaPrivacyReview | null; findings: SitePriorityFinding[]; pending: boolean; sitewideAvailable: boolean; scannedPages?: number | null; reviewFocus?: ReportReviewFocus };
export function SitePriorityReview({ reviewFocus = "gdpr_eprivacy", ...props }: ReviewProps) {
  const coverage = props.californiaAssessment && "reviewCoverage" in props.californiaAssessment ? props.californiaAssessment.reviewCoverage : undefined;
  const { topIssues, highlights } = buildRegulatoryAssessmentHighlights(props.findings, reviewFocus,
    props.scannedPages === 1 ? { kind: "page" } : { kind: "site", scannedPages: props.scannedPages ?? null }, {}, props.reportIdentity, coverage);
  return <PrioritySection {...props} findings={topIssues} highlights={highlights} reviewFocus={reviewFocus} />;
}
function PrioritySection({ californiaAssessment, findings, pending, sitewideAvailable, scannedPages, highlights, reviewFocus = "gdpr_eprivacy" }: ReviewProps & { highlights: AssessmentHighlightsPresentation }) {
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
      <span className="shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-600">{incompleteCalifornia && findings.length === 0 ? californiaPresentation.emptyLabel : `${findings.length} ${findings.length === 1 ? "issue" : "issues"}`}</span>
    </div>
    {pending || !sitewideAvailable ? <p className="mt-1 text-xs text-zinc-500">{pending ? (sitewideAvailable ? "Priority issues are updating as the scan progresses." : "Loading sitewide priority review…") : "Starting page issues shown. Sitewide priority assessment is unavailable for this scan."}</p> : null}
    {!findings.length ? <p className="mt-4 text-sm text-zinc-600">{pending || !sitewideAvailable ? "Priority issues will appear when assessed evidence is available." : <AssessmentHighlightsText text={highlights.text} links={highlights.links} expanded={highlights.expanded} />}</p> : <div className="group/scroll">
      <div ref={listRef} role="region" aria-label="Priority issues" tabIndex={findings.length > 3 ? 0 : undefined} style={{ maxHeight: findings.length <= 3 ? "none" : listHeight }} className={`mt-2 ${findings.length > 3 ? "max-h-96 overflow-y-auto overscroll-y-auto" : ""} border-t border-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500`}>
        {findings.map((item, index) => <FindingRow key={item.id} priority reviewFocus={reviewFocus} regulatoryContext={regulatoryReviewContext(item.id, reviewFocus)} idPrefix="sitewide-" finding={{...item, rank: index + 1, focus: "", vendors: []}} pages={item.pages} observations={item.observations} />)}
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
