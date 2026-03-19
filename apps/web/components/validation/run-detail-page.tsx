import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { ViewerTimestamp } from "../time/viewer-timestamp";
import { getValidationRunDetail } from "../../server/validation/repository";

type ValidationRunDetailPageProps = {
  runId: string;
};

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export async function ValidationRunDetailPage({ runId }: ValidationRunDetailPageProps) {
  const detail = await getValidationRunDetail(runId);
  if (!detail) {
    return <p className="text-sm text-slate-600">Validation run not found.</p>;
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{detail.hostname}</h1>
        <p className="text-slate-600">
          {detail.status} · {detail.triggerMode} · Rank {detail.trancoRank ?? "—"} · {detail.rankBand ?? "—"}
        </p>
        <p className="text-sm text-slate-500">
          Created <ViewerTimestamp value={detail.createdAt} /> · Completed <ViewerTimestamp value={detail.completedAt} fallback="In progress" />
        </p>
      </div>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Finding review</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
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
                        <pre className="overflow-x-auto rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
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
                          <pre className="overflow-x-auto rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
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
