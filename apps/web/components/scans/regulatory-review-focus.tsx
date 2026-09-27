import React from "react";
import type { PrivacyAuditEvidence, ReportReviewFocus } from "@certscore/api-contracts";
import { REVIEW_FOCUS_LABELS } from "../../lib/scans/report-review-focus";
import { DisclosureChevron } from "./report-finding-row";

export function RegulatoryReviewFocus({ focus }: { focus: ReportReviewFocus }) {
  return <form method="get" aria-label="Review focus" className="inline-flex shrink-0 items-center gap-3 border-b border-zinc-200 text-xs">
      {Object.entries(REVIEW_FOCUS_LABELS).map(([value, label]) => <button key={value} name="reviewFocus" value={value} type="submit" aria-pressed={focus === value}
        className={`-mb-px whitespace-nowrap border-b-2 px-0.5 py-1 leading-4 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 ${focus === value ? "border-sky-700 font-semibold text-sky-900" : "border-transparent font-medium text-zinc-500 hover:text-zinc-900"}`}>{label}</button>)}
    </form>;
}

const controlLabels = { do_not_sell_or_share: "Do Not Sell/Share", your_privacy_choices: "Privacy choices", cookie_settings: "Cookie settings" } as const;
const topicLabels = { sale_sharing: "Sale/sharing", collection_purposes: "Collection/purposes", retention: "Retention", privacy_rights: "Privacy rights", opt_out_methods: "Opt-out methods" } as const;

export function CaliforniaPrivacyWorkpaper({ evidence, focus }: { evidence?: PrivacyAuditEvidence | null; focus: ReportReviewFocus }) {
  if (focus !== "ccpa_cpra") return null;
  return <details id="california-privacy-evidence" className="group/privacy-choices border-b border-r border-zinc-200 p-5">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
      <div>
        <p className="text-xs font-semibold uppercase text-zinc-500">CCPA/CPRA · Starting page</p>
        <h3 className="mt-1 text-lg font-semibold text-zinc-950">Privacy choices &amp; notices</h3>
        <p className="mt-1 text-xs text-zinc-500">{evidence ? `${evidence.controls.length} retained ${evidence.controls.length === 1 ? "choice" : "choices"} · ${evidence.notices.length} ${evidence.notices.length === 1 ? "notice" : "notices"}` : "Evidence unavailable"}</p>
      </div>
      <DisclosureChevron className="text-zinc-400 group-open/privacy-choices:rotate-180" />
    </summary>
    <div className="mt-4 space-y-4 text-sm text-zinc-700">
      {!evidence ? <p>No verified privacy-choice or notice evidence was retained for this scan. This does not establish that these items are absent.</p> : <>
        <p>Observed privacy choices and notice passages. Opt-out functionality and notice completeness were not tested.</p>
        <dl className="space-y-2">{Object.entries(controlLabels).map(([kind, label]) => {
          const rows = evidence.controls.filter(row => row.kind === kind);
          return <div key={kind}><dt className="font-semibold">{label}</dt><dd>{rows.length ? rows.map(row => <div key={row.evidenceRef} className="mt-1">
            <span>Observed: “{row.label}” · {row.placement.replaceAll("_", " ")}</span>
            {row.destinationUrl ? <a className="ml-2 break-all text-sky-800 underline" href={row.destinationUrl} target="_blank" rel="noreferrer">Retained destination</a> : <span> · No navigable destination retained</span>}
            <p className="text-xs text-zinc-500">Destination capture: {row.retrieval.replaceAll("_", " ")}. Opt-out execution not tested. Evidence: {row.evidenceRef}</p>
          </div>) : "No retained evidence; absence was not verified."}</dd></div>;
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
        <details className="border-t border-zinc-200 pt-3 text-xs text-zinc-500"><summary className="cursor-pointer">Evidence provenance</summary><p className="mt-2 break-all">Captured {evidence.capturedAt} · Source SHA-256: {evidence.sourceHash}</p></details>
      </>}
    </div>
  </details>;
}
