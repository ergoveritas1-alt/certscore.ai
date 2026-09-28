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
  const candidates = evidence?.contractVersion === "certscore.privacy-audit-evidence.v2" ? evidence.controlCandidates : [];
  const topics = evidence ? [...new Set(evidence.notices.flatMap(notice => notice.passages.map(passage => passage.topic)))] : [];
  return <details id="california-privacy-evidence" className="group/privacy-choices border-b border-r border-zinc-200 p-5">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
      <div>
        <p className="text-xs font-semibold uppercase text-zinc-500">CCPA/CPRA · Starting page</p>
        <h3 className="mt-1 text-lg font-semibold text-zinc-950">Privacy choices &amp; notices</h3>
        <p className="mt-1 text-xs text-zinc-500">{evidence ? `${evidence.controls.length} observed ${evidence.controls.length === 1 ? "choice" : "choices"}${candidates.length ? ` · ${candidates.length} ${candidates.length === 1 ? "link" : "links"} to review` : ""} · ${evidence.notices.length} ${evidence.notices.length === 1 ? "notice" : "notices"}${topics.length ? ` · ${topics.length} ${topics.length === 1 ? "topic" : "topics"} found` : ""}` : "Evidence unavailable"}</p>
      </div>
      <DisclosureChevron className="text-zinc-400 group-open/privacy-choices:rotate-180" />
    </summary>
    <div className="mt-4 space-y-4 text-sm text-zinc-700">
      {!evidence ? <p>No verified privacy-choice or notice evidence was retained for this scan. This does not establish that these items are absent.</p> : <>
        <p>{evidence.controls.length ? `${evidence.controls.length} visible, named privacy-choice ${evidence.controls.length === 1 ? "link was" : "links were"} verified on this page.` : "No privacy-choice link was verified in this capture."}{topics.length ? ` Retained notice text covers ${topics.map(topic => topicLabels[topic].toLowerCase()).join(", ")}.` : ""}</p>
        <dl className="space-y-2">{Object.entries(controlLabels).map(([kind, label]) => {
          const rows = evidence.controls.filter(row => row.kind === kind);
          const pending = candidates.filter(row => row.kind === kind);
          return <div key={kind}><dt className="font-semibold">{label}</dt><dd>{rows.map(row => <div key={row.evidenceRef} className="mt-1">
            <span>Observed: “{row.label}” · {row.placement.replaceAll("_", " ")}</span>
            {row.destinationUrl ? <a className="ml-2 break-all text-sky-800 underline" href={row.destinationUrl} target="_blank" rel="noreferrer">View destination</a> : <span> · No separate HTTP destination retained</span>}
            <p className="text-xs text-zinc-500">{row.retrieval === "fetched" ? "Destination page retrieved" : row.retrieval === "not_attempted" ? "Destination page not fetched" : `Destination fetch ${row.retrieval.replaceAll("_", " ")}`} · Evidence: {row.evidenceRef}</p>
          </div>)}{pending.map(row => <div key={row.evidenceRef} className="mt-1 text-zinc-600">
            <span>Link identified: “{row.label}” · {row.verification === "visibility_unverified" ? "visibility not verified" : "accessible name not verified"}.</span>
            <a className="ml-2 break-all text-sky-800 underline" href={row.destinationUrl} target="_blank" rel="noreferrer">Retained destination</a>
            <p className="text-xs text-zinc-500">Visitor-facing choice not confirmed. Evidence: {row.evidenceRef}</p>
          </div>)}{!rows.length && !pending.length ? "No retained evidence; absence was not verified." : null}</dd></div>;
        })}</dl>
        <div><h3 className="font-semibold">Notice topics found</h3>
          {!evidence.notices.length ? <p className="mt-2">No verified, target-owned notice text available in this workpaper.</p> : evidence.notices.map(notice => <div className="mt-3 border-t border-zinc-100 pt-3" key={notice.evidenceRef}>
            <a className="break-all text-sky-800 underline" href={notice.url} target="_blank" rel="noreferrer">{notice.kind.replaceAll("_", " ")}</a>
            <p className="text-xs text-zinc-500">{notice.passages.length} {notice.passages.length === 1 ? "topic" : "topics"} located · {notice.directlyLinkedFromScannedPage ? "Linked from the scanned page" : "Direct link not established"}</p>
            {notice.passages.length ? <><p className="mt-2 text-xs">{notice.passages.map(passage => topicLabels[passage.topic]).join(" · ")}</p>
              <details className="mt-2 text-xs text-zinc-500"><summary className="cursor-pointer">View retained passages</summary>
                {notice.passages.map(passage => <div className="mt-2" key={passage.topic}><p className="font-semibold">{topicLabels[passage.topic]}</p><blockquote className="mt-1 border-l-2 border-zinc-200 pl-3 leading-5">{passage.excerpt}</blockquote></div>)}
              </details></> : null}
            {!notice.passages.length ? <p className="text-xs">No supported topic passage located in the retained excerpt.</p> : null}
          </div>)}
        </div>
        {evidence.truncated ? <p>Display limits apply; this workpaper is not an exhaustive inventory of privacy surfaces.</p> : null}
        <details className="border-t border-zinc-200 pt-3 text-xs text-zinc-500"><summary className="cursor-pointer">Evidence scope</summary><p className="mt-2">This passive scan verifies visible links, retained destinations, and located notice topics. It does not submit opt-out choices or determine whether the notice is complete.</p></details>
        <details className="border-t border-zinc-200 pt-3 text-xs text-zinc-500"><summary className="cursor-pointer">Evidence provenance</summary><p className="mt-2 break-all">Captured {evidence.capturedAt} · Source SHA-256: {evidence.sourceHash}</p></details>
      </>}
    </div>
  </details>;
}
