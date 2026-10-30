"use client";
import { EvidenceHeaderStatus } from "./evidence-header-status";
import { createContext, useContext, type ReactNode } from "react";
import { sitewideEvidenceGroups, type SitewideEvidencePage } from "../../lib/scans/sitewide-evidence-index";
import { DetailedEvidenceFinding } from "./detailed-evidence-finding";
import { checklistRemediation } from "../../lib/scans/checklist-remediation";
import { EVIDENCE_SECTION_TITLES } from "../../lib/scans/detailed-evidence-presentation";
import { reportStatusLabel } from "../../lib/scans/report-status-presentation";
import { EvidenceSectionHeader } from "./evidence-section-header";
import { evidenceRowAnchor } from "../../lib/scans/report-evidence-navigation";

export const SitewideEvidenceContext = createContext<{pages: SitewideEvidencePage[]; limitedPages: number} | null>(null);
export function SitewideEvidenceCard({group, children}: {group: keyof typeof sitewideEvidenceGroups; children?: ReactNode}) {
  const evidence = useContext(SitewideEvidenceContext);
  const title = group === "tracking" ? EVIDENCE_SECTION_TITLES.tracking : EVIDENCE_SECTION_TITLES.runtime;
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
      const status = row.status === "Review signal" ? "Review" : reportStatusLabel(row.status);
      statuses.set(status, (statuses.get(status) ?? 0) + 1);
      summaries.set(row.summary, (summaries.get(row.summary) ?? 0) + 1);
    }
    return {id, title: observations[0]?.title ?? id, observations, statuses: [...statuses], summaries: [...summaries],
      needsReview: observations.some(row => ["gap_observed", "review_signal"].includes(row.assessmentStatus))};
  }).filter(check => check.observations.length);
  const count = checks.filter(check => check.needsReview).length;
  return <details className="group/sitewide border-b border-r border-zinc-200 p-5">
    <EvidenceSectionHeader title={`${title} · Sitewide`}
      recap={evidence ? `${checks.length} checks · ${pages.length} ${pages.length === 1 ? "page" : "pages"}${count ? ` · ${count} to review` : ""}` : "Sitewide assessment unavailable"}
      badge={<EvidenceHeaderStatus rows={[...pages.flatMap(page => page.rows), ...(!evidence || evidence.limitedPages ? [{status: "Limited"}] : [])]} />} />
    {evidence ? <div className="mt-3 divide-y border-t">
      {evidence.limitedPages ? <p className="py-2 text-xs text-amber-800">{evidence.limitedPages} page(s) have unavailable or limited coverage.</p> : null}
      {checks.map(check => <DetailedEvidenceFinding key={check.id} id={evidenceRowAnchor(check.id)} title={check.title}
        summary={check.statuses.map(([status, count]) => `${status}: ${count} ${count === 1 ? "page" : "pages"}`).join(" · ")}
        badge={<EvidenceHeaderStatus rows={check.observations} />}
        evidenceJson={{ observations: check.observations }} evidenceRefs={[...new Set(check.observations.flatMap(row => row.evidenceRefs))]}
        correctionSteps={checklistRemediation({ rowId: check.id, status: check.needsReview ? "Review signal" : "Observed" })?.steps ?? []}>
        <div className="space-y-2">{check.summaries.map(([summary, count]) => <p key={summary} className="text-xs leading-5 text-zinc-600">{summary} <span className="text-zinc-400">({count} {count === 1 ? "page" : "pages"})</span></p>)}</div>
      </DetailedEvidenceFinding>)}
    </div> : <p className="mt-2 text-xs text-zinc-500">Verified sitewide evidence is not available yet.</p>}
  </details>;
}
