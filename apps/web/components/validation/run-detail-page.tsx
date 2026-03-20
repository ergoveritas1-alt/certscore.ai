import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import Link from "next/link";
import { ViewerTimestamp } from "../time/viewer-timestamp";
import { getValidationRunDetail } from "../../server/validation/repository";
import { submitValidationRescanAction } from "../../server/validation/actions";
import { getReviewFindingPresentation } from "../../lib/scans/review-finding-presentation";
import { normalizeFindingName } from "../../lib/scans/canonical-review-finding";
import { deriveScanExecutionSummary } from "../../lib/scans/scan-timeout-summary";

type ValidationRunDetailPageProps = {
  runId: string;
};

export async function ValidationRunDetailPage({ runId }: ValidationRunDetailPageProps) {
  const detail = await getValidationRunDetail(runId);
  if (!detail) {
    return <p className="text-sm text-slate-600">Validation run not found.</p>;
  }

  const scanExecutionSummary = deriveScanExecutionSummary({
    ...(detail.scanExecution ?? {}),
    errorMessage: detail.errorMessage,
    events: detail.scanEvents,
    status: detail.status
  });

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
              className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
              type="submit"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <path d="M21 3v6h-6" />
              </svg>
              <span>Re-scan</span>
            </button>
          </form>
        ) : null}
      </div>

      {scanExecutionSummary ? (
        <Card
          className={
            scanExecutionSummary.tone === "danger"
              ? "border-rose-200 bg-rose-50"
              : scanExecutionSummary.tone === "success"
                ? "border-emerald-200 bg-emerald-50"
                : "border-amber-200 bg-amber-50"
          }
        >
          <CardHeader>
            <CardTitle
              className={
                scanExecutionSummary.tone === "danger"
                  ? "text-rose-950"
                  : scanExecutionSummary.tone === "success"
                    ? "text-emerald-950"
                    : "text-amber-950"
              }
            >
              {scanExecutionSummary.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul
              className={
                scanExecutionSummary.tone === "danger"
                  ? "space-y-2 text-sm text-rose-900"
                  : scanExecutionSummary.tone === "success"
                    ? "space-y-2 text-sm text-emerald-900"
                    : "space-y-2 text-sm text-amber-900"
              }
            >
              {scanExecutionSummary.details.map((detailLine) => (
                <li key={detailLine}>• {detailLine}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

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
                    findingName: normalizeFindingName(row.automatedFinding.title),
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
                          #{row.automatedFinding.rank} · {normalizeFindingName(row.automatedFinding.title)}
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
