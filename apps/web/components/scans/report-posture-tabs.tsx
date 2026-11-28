import React from "react";
import type { ReportReviewFocus } from "@certscore/api-contracts";
import { REVIEW_FOCUS_LABELS } from "../../lib/scans/report-review-focus";
import { getGdprEprivacyPostureTone } from "../../lib/scans/regulatory-coverage-score";

export function RegulatoryReviewFocus({ focus, scores }: {
  focus: ReportReviewFocus;
  scores?: Partial<Record<ReportReviewFocus, number | null>>;
}) {
  return <form method="get" aria-label="Review focus" className="inline-flex max-w-full flex-wrap items-center gap-x-3 border-b border-zinc-200 text-xs">
    {(Object.keys(REVIEW_FOCUS_LABELS) as ReportReviewFocus[]).map(value => {
      const active = focus === value;
      const score = scores?.[value];
      return <button key={value} name="reviewFocus" value={value} type="submit" aria-pressed={active}
        className={`-mb-px inline-flex h-8 items-center gap-1.5 whitespace-nowrap border-b-2 px-0.5 leading-4 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 ${active ? "border-sky-700 font-semibold text-sky-900" : "border-transparent font-medium text-zinc-500 hover:text-zinc-900"}`}>
        {REVIEW_FOCUS_LABELS[value]}
        {!active && score != null && Number.isFinite(score) && score >= 0 && score <= 100 ? <>
          <span aria-hidden="true" title={`${score}/100`} data-posture-preview-score
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full p-[2px]"
            style={{ background: `conic-gradient(${getGdprEprivacyPostureTone(score).ringColor} ${score}%, #e4e4e7 ${score}%)` }}>
            <span className="inline-flex h-full w-full items-center justify-center rounded-full bg-white text-[10px] font-semibold leading-none tabular-nums text-zinc-700">{score}</span>
          </span>
          <span className="sr-only"> score {score} out of 100</span>
        </> : null}
      </button>;
    })}
  </form>;
}
