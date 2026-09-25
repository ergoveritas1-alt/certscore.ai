import React from "react";
import type { PrivacyAuditEvidence, ReportReviewFocus } from "@certscore/api-contracts";
import { REVIEW_FOCUS_LABELS, reviewFocusScopeNote } from "../../lib/scans/report-review-focus";

export function RegulatoryReviewFocus({ focus, scanFrom, gpcSummary }: { focus: ReportReviewFocus; scanFrom: string; gpcSummary?: string }) {
  return <section aria-label="Regulatory review focus" className="mx-auto max-w-[1500px] px-4 pt-4 sm:px-6">
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <form method="get" className="flex flex-wrap items-center gap-2">
        <span className="mr-2 text-sm font-semibold">Review focus</span>
        {Object.entries(REVIEW_FOCUS_LABELS).map(([value, label]) => <button key={value} name="reviewFocus" value={value} type="submit" aria-pressed={focus === value}
          className={`rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 ${focus === value ? "border-sky-700 bg-sky-50 text-sky-900" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}>{label}</button>)}
      </form>
      <p className="mt-3 text-sm text-zinc-700">{focus === "ccpa_cpra"
        ? "Review GPC response, sale/share choice surfaces, retained notices and observed tracking technologies."
        : "Review pre-choice activity, consent controls, observed choice outcomes and policy transparency."}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-sky-800">
        {focus === "ccpa_cpra" ? <><a href="#gpc-evidence" className="underline">GPC: {gpcSummary ?? "Evidence unavailable"}</a><a href="#california-privacy-evidence" className="underline">Privacy choices and notices</a></>
          : <><a href="#consent-review-evidence" className="underline">Consent evidence</a><a href="#california-privacy-evidence" className="underline">Additional privacy evidence</a></>}
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-500">{reviewFocusScopeNote(focus, scanFrom)}</p>
      <p className="text-xs leading-5 text-zinc-500">The overall posture score is shared across these views. A separate CCPA/CPRA score is not available.</p>
    </div>
  </section>;
}

const controlLabels = { do_not_sell_or_share: "Do Not Sell/Share", your_privacy_choices: "Privacy choices", cookie_settings: "Cookie settings" } as const;
const topicLabels = { sale_sharing: "Sale/sharing", collection_purposes: "Collection/purposes", retention: "Retention", privacy_rights: "Privacy rights", opt_out_methods: "Opt-out methods" } as const;

export function CaliforniaPrivacyWorkpaper({ evidence, expanded = false }: { evidence?: PrivacyAuditEvidence | null; expanded?: boolean }) {
  return <details id="california-privacy-evidence" open={expanded} className="border-b border-r border-zinc-200 p-5">
    <summary className="cursor-pointer text-base font-semibold">California privacy choices and notices</summary>
    <div className="mt-4 space-y-4 text-sm text-zinc-700">
      <p>Starting-page observations. Presence does not establish a working opt-out or a complete notice.</p>
      {!evidence ? <p>Unknown — verified privacy-choice and notice evidence was not retained for this report. This is not evidence of absence.</p> : <>
        <dl className="space-y-2">{Object.entries(controlLabels).map(([kind, label]) => {
          const rows = evidence.controls.filter(row => row.kind === kind);
          return <div key={kind}><dt className="font-semibold">{label}</dt><dd>{rows.length ? rows.map(row => <div key={row.evidenceRef} className="mt-1">
            <span>Observed: “{row.label}” · {row.placement.replaceAll("_", " ")}</span>
            {row.destinationUrl ? <a className="ml-2 break-all text-sky-800 underline" href={row.destinationUrl} target="_blank" rel="noreferrer">Retained destination</a> : <span> · No navigable destination retained</span>}
            <p className="text-xs text-zinc-500">Destination capture: {row.retrieval.replaceAll("_", " ")}. Opt-out execution not tested. Evidence: {row.evidenceRef}</p>
          </div>) : "Unknown — no verified matching surface retained; complete control-absence inspection was not established."}</dd></div>;
        })}</dl>
        <div><h3 className="font-semibold">Retained notice passages</h3><p className="mt-1 text-xs text-zinc-500">Passages locate topics for review; they do not assess disclosure adequacy. Notice placement at collection points was not assessed.</p>
          {!evidence.notices.length ? <p className="mt-2">No verified, target-owned notice text available in this workpaper.</p> : evidence.notices.map(notice => <div className="mt-3 border-t border-zinc-100 pt-3" key={notice.evidenceRef}>
            <a className="break-all text-sky-800 underline" href={notice.url} target="_blank" rel="noreferrer">{notice.kind.replaceAll("_", " ")}</a>
            <p className="text-xs text-zinc-500">Text coverage: {notice.coverage} · Direct link from scanned page: {notice.directlyLinkedFromScannedPage ? "observed" : "not established"}</p>
            {notice.passages.map(passage => <div className="mt-2" key={passage.topic}><p className="text-xs font-semibold">{topicLabels[passage.topic]} — passage for review</p><blockquote className="mt-1 border-l-2 border-zinc-200 pl-3 text-xs leading-5">{passage.excerpt}</blockquote></div>)}
            {!notice.passages.length ? <p className="text-xs">No supported topic passage located in the retained excerpt.</p> : null}
          </div>)}
        </div>
        {evidence.truncated ? <p>Display limits apply; this workpaper is not an exhaustive inventory of privacy surfaces.</p> : null}
        <p className="break-all text-xs text-zinc-500">Captured {evidence.capturedAt} · Source SHA-256: {evidence.sourceHash}</p>
      </>}
    </div>
  </details>;
}
