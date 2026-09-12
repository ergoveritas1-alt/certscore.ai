"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { FindingRow } from "./report-finding-row";
import type { SitePriorityFinding } from "../../lib/scans/full-site-priority-review";

export function SitePriorityReview({ findings, pending, sitewideAvailable, scannedPages }: { findings: SitePriorityFinding[]; pending: boolean; sitewideAvailable: boolean; scannedPages?: number | null }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState<number>();
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const summaries = Array.from(list.children).slice(0, 3).map(row => row.querySelector("summary")).filter((row): row is HTMLElement => Boolean(row));
    const measure = () => setListHeight(summaries.reduce((height, row) => height + row.getBoundingClientRect().height + 1, 1));
    const observer = new ResizeObserver(measure);
    summaries.forEach(row => observer.observe(row));
    measure();
    return () => observer.disconnect();
  }, [findings]);
  return <section aria-label="Sitewide priority review" className="my-3 border-y border-zinc-200 bg-white py-3">
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Priority review</p><h2 className="mt-1 text-xl font-semibold">{scannedPages === 1 ? "Top issues on this page" : "Top issues across your site"}</h2></div>
      <span className="shrink-0 rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700">{findings.length} {findings.length === 1 ? "issue" : "issues"}</span>
    </div>
    {pending || !sitewideAvailable ? <p className="mt-1 text-xs text-zinc-500">{pending ? (sitewideAvailable ? "Priority issues are updating as the scan progresses." : "Loading sitewide priority review…") : "Homepage issues shown. Sitewide priority assessment is unavailable for this scan."}</p> : null}
    {!findings.length ? <p className="mt-4 text-sm text-zinc-600">{pending || !sitewideAvailable ? "Priority issues will appear when assessed evidence is available." : "No priority issues were identified in the assessed evidence."}</p> : <>
      <div ref={listRef} role="region" aria-label="Priority issues" tabIndex={findings.length > 3 ? 0 : undefined} style={{ maxHeight: listHeight }} className="mt-2 max-h-96 overflow-y-auto overscroll-contain border-t border-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
        {findings.map((item, index) => <FindingRow key={item.id} priority idPrefix="sitewide-" finding={{...item, rank: index + 1, focus: "", vendors: []}} pages={item.pages} />)}
      </div>
      {findings.length > 3 ? <p className="mt-2 text-xs text-zinc-500">Scroll for all {findings.length} issues.</p> : null}
    </>}
  </section>;
}
