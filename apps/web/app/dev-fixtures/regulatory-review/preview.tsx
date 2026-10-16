"use client";
import { useState } from "react";
import type { ReportReviewFocus } from "@certscore/api-contracts";
import { SitePriorityReview } from "../../../components/scans/site-priority-review";
import { REGULATORY_REVIEW_TOPICS, selectRegulatoryReview } from "../../../lib/scans/regulatory-review-catalog";
import { REVIEW_FOCUS_LABELS, reviewFocusMismatchNote } from "../../../lib/scans/report-review-focus";
import { findingEvidenceAnchor } from "../../../lib/scans/report-evidence-navigation";
import { ACCESSIBILITY_PREVIEW, CALIFORNIA_COVERAGE_GAPS, CALIFORNIA_REUSE_PLAN, REGULATORY_PREVIEW_FINDINGS, californiaPreviewAssessment } from "./preview-data";

export function RegulatoryReviewPreview() {
  const [mode, setMode] = useState<ReportReviewFocus>("gdpr_eprivacy");
  const [index, setIndex] = useState(0);
  const [all, setAll] = useState(false);
  const [showAccessibility, setShowAccessibility] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [scanOrigin, setScanOrigin] = useState<"eu_de" | "california">("eu_de");
  const topics = REGULATORY_REVIEW_TOPICS.filter(topic => topic.contexts[mode]);
  const selected = topics[index] ?? topics[0]!;
  const available = REGULATORY_PREVIEW_FINDINGS.filter(finding => topics.some(topic => topic.findingIds.includes(finding.id)));
  const findings = empty ? [] : all ? available : available.filter(finding => selected.findingIds.includes(finding.id));
  const display = [...findings, ...(showAccessibility ? [ACCESSIBILITY_PREVIEW] : [])];
  const counts = selectRegulatoryReview(display, mode);
  const coverageNote = reviewFocusMismatchNote(mode, scanOrigin);
  const button = "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500";
  return <main className="mx-auto max-w-5xl px-5 py-8 text-zinc-900">
    <p className="text-xs font-semibold uppercase tracking-widest text-sky-700">Local design review · presentation fixtures</p>
    <h1 className="mt-2 text-3xl font-semibold tracking-tight">Regulatory context, grounded in evidence</h1>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">Cycle through every context family. These illustrative inputs exercise the real report components; they do not create scan evidence, findings or scores. Production still requires a supported canonical assessment.</p>
    <div className="my-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Review mode">{(["gdpr_eprivacy", "ccpa_cpra"] as const).map(value => <button key={value} aria-pressed={mode === value} className={`${button} aria-pressed:border-sky-700 aria-pressed:bg-sky-50 aria-pressed:text-sky-900`} onClick={() => { setMode(value); setIndex(0); setEmpty(false); }}>{REVIEW_FOCUS_LABELS[value]}</button>)}</div>
      <label className="mt-4 block text-xs font-semibold text-zinc-600">Illustrative scan location <select className="ml-2 rounded-lg border border-zinc-300 bg-white p-2 text-sm font-normal" value={scanOrigin} onChange={event => setScanOrigin(event.target.value as "eu_de" | "california")}><option value="eu_de">Germany</option><option value="california">California</option></select></label>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-0 grow text-xs font-semibold text-zinc-600">Finding scenario<select className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-sm font-normal text-zinc-900" value={selected.id} onChange={event => { setIndex(topics.findIndex(topic => topic.id === event.target.value)); setAll(false); setEmpty(false); }}>{topics.map((topic, i) => <option key={topic.id} value={topic.id}>{i + 1}. {topic.title}</option>)}</select></label>
        <button className={button} onClick={() => { setIndex((index - 1 + topics.length) % topics.length); setAll(false); setEmpty(false); }}>Previous</button>
        <button className={button} onClick={() => { setIndex((index + 1) % topics.length); setAll(false); setEmpty(false); }}>Next</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <label><input className="mr-2" type="checkbox" checked={all} onChange={event => { setAll(event.target.checked); setEmpty(false); }} />Show all {topics.length} topics</label>
        <label><input className="mr-2" type="checkbox" checked={showAccessibility} onChange={event => setShowAccessibility(event.target.checked)} />Include accessibility</label>
        <label><input className="mr-2" type="checkbox" checked={empty} onChange={event => setEmpty(event.target.checked)} />No regulatory findings</label>
      </div>
      <p className="mt-4 text-xs text-zinc-500" aria-live="polite">{empty ? "Empty-state review" : all ? `${topics.length} context families` : `Scenario ${index + 1} of ${topics.length}`} · {counts.regulatory.length} regulatory {counts.regulatory.length === 1 ? "issue" : "issues"} · {counts.other.length} other {counts.other.length === 1 ? "issue" : "issues"}</p>
    </div>
    {coverageNote ? <p className="mb-1 max-w-3xl text-xs leading-5 text-amber-800">{coverageNote}</p> : null}
    <p className="text-xs font-medium text-zinc-500">Oct 12, 2026, 7:57:57 AM PDT <span className="ml-2 tabular-nums">(35 sec scan)</span></p>
    <SitePriorityReview key={`${mode}-${selected.id}-${all}-${empty}`} findings={display} reviewFocus={mode} californiaAssessment={!all && !empty && mode === "ccpa_cpra" ? californiaPreviewAssessment(selected.id) : null} pending={false} sitewideAvailable scannedPages={1} />
    {mode === "ccpa_cpra" && <p className="text-xs text-zinc-500">Coverage is illustrative. Combined and empty scenarios have no shared assessment.</p>}
    <section id="evidence" className="mt-8 rounded-xl border border-zinc-200 p-5">
      <h2 className="text-base font-semibold">Preview evidence destinations</h2><p className="mt-2 text-sm text-zinc-600">Links below represent the same evidence destinations used by reports. This preview contains illustrative copy only.</p>
      {display.map(finding => <p id={findingEvidenceAnchor(finding.id, finding.evidenceJson.presentationGroup)} key={finding.id} className="mt-3 scroll-mt-6 text-sm"><strong>{finding.title}:</strong> {finding.summary}</p>)}
    </section>
    <details className="mt-8 rounded-xl border border-zinc-200 p-5" open={mode === "ccpa_cpra"}>
      <summary className="cursor-pointer text-base font-semibold">Coverage decisions: why not 30 per mode?</summary>
      <p className="mt-3 text-sm leading-6 text-zinc-600">The EU catalog has 31 context families, grouping overlapping tracking, embeds and transport checks. These are conditional presentation scenarios, not a claim that every check can currently produce a finding. California has five passive presentation routes: a supported missing privacy policy, exact 404/410 errors on named notice-at-collection, rights-information or privacy-choice links, and a complete inspection finding no named sale/sharing choice. GPC is excluded. The sixth route covers advertising activity after a separately confirmed sale/sharing opt-out. Its bounded observer is configured for every eligible regional sharded scan once deployed. Clearly named request routes can be retained as positive coverage evidence, but their operation remains unassessed. Ten further topics below require dedicated evidence. They are not report findings.</p>
      <h3 className="mt-5 text-sm font-semibold">Reuse EU evidence with a separate California assessment</h3>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs leading-5"><thead><tr className="border-b"><th className="p-2">EU family</th><th className="p-2">What can be reused</th><th className="p-2">California treatment</th></tr></thead><tbody>{CALIFORNIA_REUSE_PLAN.map(([family, reuse, treatment]) => <tr key={family} className="border-b align-top"><th className="p-2 font-medium">{family}</th><td className="p-2">{reuse}</td><td className="p-2">{treatment}</td></tr>)}</tbody></table></div>
      <p className="mt-3 text-xs leading-5 text-zinc-600">GDPR legal bases, DPO requirements and EEA transfer safeguards remain EU-specific. California profiling rules need their own applicability and effective-date assessment. GPC remains excluded. These reuse ideas do not enable new customer findings.</p>
      <p className="mt-3 text-xs leading-5 text-zinc-600">California’s <a className="underline" href="https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf" target="_blank" rel="noreferrer">2026 regulations</a> address disclosures, collection notices and choice design. The <a className="underline" href="https://cppa.ca.gov/announcements/2025/20250312.html" target="_blank" rel="noreferrer">Honda decision</a> illustrates excessive verification and unequal privacy choices; its $632,500 fine resolved multiple claims.</p>
      <h3 className="mt-5 text-sm font-semibold">Further California assessment coverage</h3>
      <ol className="mt-4 grid gap-4 sm:grid-cols-2">{CALIFORNIA_COVERAGE_GAPS.map(([title, reason], i) => <li key={title} className="rounded-lg bg-zinc-50 p-3"><p className="text-sm font-semibold">{i + 1}. {title}</p><p className="mt-1 text-xs leading-5 text-zinc-600">{reason}</p><span className="mt-2 inline-block text-xs font-medium text-zinc-500">Needs canonical assessment</span></li>)}</ol>
    </details>
  </main>;
}
