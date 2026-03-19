import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import Link from "next/link";
import { ViewerTimestamp } from "../time/viewer-timestamp";
import { getValidationRunDetail } from "../../server/validation/repository";
import { submitValidationRescanAction } from "../../server/validation/actions";
import { getReviewFindingPresentation } from "../../lib/scans/review-finding-presentation";

type ValidationRunDetailPageProps = {
  runId: string;
};

export async function ValidationRunDetailPage({ runId }: ValidationRunDetailPageProps) {
  const detail = await getValidationRunDetail(runId);
  if (!detail) {
    return <p className="text-sm text-slate-600">Validation run not found.</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{detail.hostname}</h1>
          <p className="font-mono text-xs text-slate-500">scan_id {detail.scanId ?? "—"}</p>
          <p className="text-slate-600">
            {detail.status} · {detail.triggerMode} · Rank {detail.trancoRank ?? "—"} · {detail.rankBand ?? "—"}
          </p>
          <p className="text-sm text-slate-500">
            Created <ViewerTimestamp value={detail.createdAt} /> · Completed <ViewerTimestamp value={detail.completedAt} fallback="In progress" />
          </p>
        </div>
        {detail.domainId ? (
          <form action={submitValidationRescanAction}>
            <input name="domainId" type="hidden" value={detail.domainId} />
            <button
              className="inline-flex h-11 items-center gap-2 rounded-full border-0 bg-[linear-gradient(180deg,#62cf63_0%,#4fbe51_100%)] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(79,190,81,0.24)] transition hover:brightness-[1.03]"
              type="submit"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <path d="M21 3v6h-6" />
              </svg>
              <span>Re-scan</span>
            </button>
          </form>
        ) : null}
      </div>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Automated findings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {detail.rows.map((row) => (
              <div key={`${row.automatedFinding.ruleKey}-${row.automatedFinding.rank}`} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5">
                {(() => {
                  const siblingFindingKeysOrTitles = detail.rows
                    .filter((candidate) => candidate.automatedFinding.pageUrl === row.automatedFinding.pageUrl)
                    .flatMap((candidate) => [candidate.automatedFinding.ruleKey, candidate.automatedFinding.title])
                    .filter((value) => value !== row.automatedFinding.ruleKey && value !== row.automatedFinding.title);
                  const presentation = getReviewFindingPresentation({
                    evidence: row.automatedFinding.evidence,
                    keyOrTitle: row.automatedFinding.ruleKey,
                    findingTitle: row.automatedFinding.title,
                    siblingFindingKeysOrTitles
                  });
                  const pageLabel = row.automatedFinding.pageUrl ?? detail.hostname;
                  const summaryJson = {
                    url: pageLabel,
                    findingName: row.automatedFinding.title,
                    confidenceScore: presentation.confidenceScore ?? "NA",
                    whyThisMatters: presentation.whyThisMatters,
                    suggestedFix: presentation.suggestedFix,
                    suggestedBestPractice: presentation.bestPracticeLink
                      ? {
                          organization: presentation.bestPracticeLink.label,
                          title: presentation.bestPracticeLink.title,
                          url: presentation.bestPracticeLink.url
                        }
                      : null
                  };

                  return (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">URL</p>
                        <p className="text-sm text-slate-700 break-all">{pageLabel}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Finding name</p>
                        <p className="font-semibold text-slate-950">
                          #{row.automatedFinding.rank} · {row.automatedFinding.title}
                        </p>
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                          {row.automatedFinding.ruleKey} · {row.automatedFinding.severity} · {detail.hostname}
                        </p>
                      </div>
                      <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-2xl bg-white p-3 text-xs text-slate-600">
                        {JSON.stringify(summaryJson, null, 2)}
                      </pre>
                      <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-2xl bg-white p-3 text-xs text-slate-600">
                        {JSON.stringify(row.automatedFinding.evidence, null, 2)}
                      </pre>
                    </div>
                  );
                })()}
              </div>
            ))}
            {detail.rows.length === 0 ? <p className="text-sm text-slate-500">No automated findings were stored for this run.</p> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
