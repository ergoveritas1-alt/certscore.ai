import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { ViewerTimestamp } from "../time/viewer-timestamp";
import { getValidationRunDetail } from "../../server/validation/repository";
import { submitValidationRescanAction } from "../../server/validation/actions";

type ValidationRunDetailPageProps = {
  runId: string;
};

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatConfidenceBand(value: "very_high" | "high" | "moderate" | "low" | "very_low" | null) {
  if (!value) {
    return null;
  }

  return value.replace(/_/g, " ");
}

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
          <CardTitle>Finding review</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed divide-y divide-slate-200 text-sm">
              <colgroup>
                <col className="w-[44%]" />
                <col className="w-[44%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-3 pr-4 font-medium">Automated finding</th>
                  <th className="pb-3 pr-4 font-medium">GPT-5.4 analysis</th>
                  <th className="pb-3 font-medium">Agreement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.rows.map((row) => (
                  <tr key={`${row.automatedFinding.ruleKey}-${row.automatedFinding.rank}`} className="align-top">
                    <td className="py-4 pr-4">
                      <div className="space-y-2">
                        <p className="font-semibold text-slate-950">
                          #{row.automatedFinding.rank} · {row.automatedFinding.title}
                        </p>
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                          {row.automatedFinding.ruleKey} · {row.automatedFinding.severity}
                        </p>
                        <p className="text-slate-700">{row.automatedFinding.description}</p>
                        <p className="text-xs text-slate-500">Page: {row.automatedFinding.pageUrl ?? "site-level"}</p>
                        <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
                          {JSON.stringify(row.automatedFinding.evidence, null, 2)}
                        </pre>
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      {row.verdict ? (
                        <div className="space-y-2">
                          <p className="font-semibold text-slate-950">{row.verdict.verdict}</p>
                          <p className="text-slate-700">{row.verdict.rationale}</p>
                          <p className="text-xs text-slate-500">
                            Confidence {formatPercent(row.verdict.confidence)} · {row.verdict.model} · {row.verdict.promptVersion}
                          </p>
                          {typeof row.verdict.systemConfidenceScore === "number" ? (
                            <p className="text-xs text-slate-500">
                              System confidence {formatPercent(row.verdict.systemConfidenceScore)}
                              {row.verdict.systemConfidenceBand ? ` · ${formatConfidenceBand(row.verdict.systemConfidenceBand)}` : ""}
                            </p>
                          ) : null}
                          {row.verdict.systemConfidenceExplanation ? (
                            <p className="text-xs text-slate-500">{row.verdict.systemConfidenceExplanation}</p>
                          ) : null}
                          <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
                            {JSON.stringify(row.verdict.evidence, null, 2)}
                          </pre>
                        </div>
                      ) : (
                        <p className="text-slate-500">Verdict pending.</p>
                      )}
                    </td>
                    <td className="py-4">
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-900">
                        {row.agreementScore ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
