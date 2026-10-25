import React from "react";
import type { ReportReviewFocus } from "@certscore/api-contracts";
import { findingApplicabilityContext } from "../../lib/scans/finding-applicability-context";
import { APPLICABILITY_REVIEWED_AT } from "../../lib/scans/finding-applicability-registry";
import { FindingDisclosureSummary } from "./finding-disclosure-summary";

export function FindingApplicabilityNote({ findingId, reviewFocus, presentationGroup }: {
  findingId: string; reviewFocus: ReportReviewFocus; presentationGroup?: unknown;
}) {
  const note = findingApplicabilityContext(findingId, reviewFocus, presentationGroup);
  return <details className="group/finding-disclosure mt-3" aria-label="Regulatory applicability">
    <FindingDisclosureSummary>Applicability</FindingDisclosureSummary>
    <div className="mt-2 space-y-3 rounded-lg border border-sky-100 bg-white p-3 text-sm leading-6 text-zinc-600" data-applicability-key={note.key ?? "unmapped"}>
      <div>
        <h4 className="font-semibold text-zinc-900">When this matters</h4>
        <p className="mt-1 max-w-3xl">{note.when}</p>
      </div>
      <div>
        <h4 className="font-semibold text-zinc-900">What to check</h4>
        <ol className="mt-1 space-y-1.5">{note.checks.map((check, index) => <li key={check} className="flex items-start gap-2.5">
          <span aria-hidden="true" className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-50 text-[0.65rem] font-semibold text-sky-800">{index + 1}</span>
          <span className="max-w-3xl">{check}</span>
        </li>)}</ol>
      </div>
      <div className="border-t border-zinc-100 pt-3">
        <p className="max-w-3xl text-xs leading-5"><span className="font-semibold text-zinc-700">Scope to confirm: </span>{note.scopeCheck}</p>
        {note.sources.length ? <ul aria-label="Applicability sources" className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{note.sources.map(link => <li key={link.url}>
          <a href={link.url} target="_blank" rel="noreferrer" className="text-xs text-sky-800 underline underline-offset-2 hover:text-sky-950">{link.label} ↗</a>
        </li>)}</ul> : null}
        <p className="mt-2 text-[0.65rem] text-zinc-500">Guidance reviewed {APPLICABILITY_REVIEWED_AT}</p>
      </div>
    </div>
  </details>;
}
