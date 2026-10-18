import React from "react";
import type { ReportReviewFocus } from "@certscore/api-contracts";
import { findingApplicabilityContext } from "../../lib/scans/finding-applicability-context";

export function FindingApplicabilityNote({ findingId, reviewFocus, presentationGroup }: {
  findingId: string; reviewFocus: ReportReviewFocus; presentationGroup?: unknown;
}) {
  const note = findingApplicabilityContext(findingId, reviewFocus, presentationGroup);
  return <>
    {note.reference ? <a href={note.reference.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-sky-800 underline underline-offset-2">{note.reference.label} ↗</a> : null}
    <details className="group/applicability mt-3" aria-label="Regulatory applicability">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-sm font-semibold text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 [&::-webkit-details-marker]:hidden">
        <span>Applicability <span className="font-normal text-zinc-500">· Not assessed</span></span>
        <svg aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 transition-transform group-open/applicability:rotate-180" fill="none" viewBox="0 0 20 20"><path d="m6 8 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" /></svg>
      </summary>
      <div className="mt-3 max-w-3xl space-y-2 text-sm leading-6 text-zinc-600">
        <p>{note.explanation}</p>
        <p><span className="font-medium text-zinc-800">What to check: </span>{note.checks}</p>
        <ul className="space-y-1">{note.lookups.map(link => <li key={link.url}><a href={link.url} target="_blank" rel="noreferrer" className="text-xs text-sky-800 underline underline-offset-2">{link.label} ↗</a></li>)}</ul>
      </div>
    </details>
  </>;
}
