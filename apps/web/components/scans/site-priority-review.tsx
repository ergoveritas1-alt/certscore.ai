"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { FindingRow } from "./report-finding-row";
import { CompactScrollHint } from "./compact-scroll-hint";
import type { SitePriorityFinding } from "../../lib/scans/full-site-priority-review";

export function SitePriorityReview({ findings, pending, sitewideAvailable, scannedPages }: { findings: SitePriorityFinding[]; pending: boolean; sitewideAvailable: boolean; scannedPages?: number | null }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState<number>();
  const [atBottom, setAtBottom] = useState(false);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const summaries = Array.from(list.children).slice(0, 3).map(row => row.querySelector("summary")).filter((row): row is HTMLElement => Boolean(row));
    const updateScrollPosition = () => setAtBottom(list.scrollHeight > list.clientHeight + 1 && list.scrollTop + list.clientHeight >= list.scrollHeight - 2);
    const measure = () => {
      const collapsedHeight = summaries.reduce((height, row) => height + row.getBoundingClientRect().height + 1, 1);
      const singleIssueExpanded = findings.length === 1 && summaries[0]?.closest("details")?.open;
      setListHeight(collapsedHeight * (singleIssueExpanded ? 2 : 1));
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
  return <section aria-label="Regulatory risk review" className={`my-3 border-y border-zinc-200 bg-white pt-3 ${findings.length > 3 ? "pb-1" : "pb-3"}`}>
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Regulatory Risk Review</p><h2 className="mt-1 text-xl font-semibold">{scannedPages === 1 ? "Top issues on this page" : "Top issues across your site"}</h2></div>
      <span className="shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-600">{findings.length} {findings.length === 1 ? "issue" : "issues"}</span>
    </div>
    {pending || !sitewideAvailable ? <p className="mt-1 text-xs text-zinc-500">{pending ? (sitewideAvailable ? "Priority issues are updating as the scan progresses." : "Loading sitewide priority review…") : "Starting page issues shown. Sitewide priority assessment is unavailable for this scan."}</p> : null}
    {!findings.length ? <p className="mt-4 text-sm text-zinc-600">{pending || !sitewideAvailable ? "Priority issues will appear when assessed evidence is available." : "No priority issues were identified in the assessed evidence. Resource purposes may remain unclassified; inventory labels are separate from priority findings."}</p> : <div className="group/scroll">
      <div ref={listRef} role="region" aria-label="Priority issues" tabIndex={findings.length > 3 ? 0 : undefined} style={{ maxHeight: listHeight }} className="mt-2 max-h-96 overflow-y-auto overscroll-y-auto border-t border-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
        {findings.map((item, index) => <FindingRow key={item.id} priority idPrefix="sitewide-" finding={{...item, rank: index + 1, focus: "", vendors: []}} pages={item.pages} observations={item.observations} />)}
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
