import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { getValidationIssueAnalytics } from "../../server/validation/repository";

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function HistogramBar(input: { inconclusive: number; notSupported: number; supported: number }) {
  const total = input.supported + input.inconclusive + input.notSupported;
  if (total === 0) {
    return <div className="h-3 rounded-full bg-slate-100" />;
  }

  const supportedWidth = (input.supported / total) * 100;
  const inconclusiveWidth = (input.inconclusive / total) * 100;
  const notSupportedWidth = (input.notSupported / total) * 100;

  return (
    <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
      <div className="bg-emerald-500" style={{ width: `${supportedWidth}%` }} />
      <div className="bg-amber-400" style={{ width: `${inconclusiveWidth}%` }} />
      <div className="bg-rose-500" style={{ width: `${notSupportedWidth}%` }} />
    </div>
  );
}

export async function ValidationIssuesPage() {
  const analytics = await getValidationIssueAnalytics();

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Issue analytics</h1>
        <p className="max-w-3xl text-slate-600">
          Aggregated by rule key so you can see how often each automated finding is flagged and how often the secondary verifier supports it.
        </p>
      </div>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Rule accuracy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-3 pr-4 font-medium">Rule</th>
                  <th className="pb-3 pr-4 font-medium">Flagged</th>
                  <th className="pb-3 pr-4 font-medium">Reviewed</th>
                  <th className="pb-3 pr-4 font-medium">Support rate</th>
                  <th className="pb-3 pr-4 font-medium">Not-supported rate</th>
                  <th className="pb-3 font-medium">Histogram</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analytics.map((row) => (
                  <tr key={row.ruleKey}>
                    <td className="py-4 pr-4">
                      <div className="space-y-1">
                        <p className="font-medium text-slate-950">{row.title}</p>
                        <p className="text-xs text-slate-500">{row.ruleKey}</p>
                      </div>
                    </td>
                    <td className="py-4 pr-4 text-slate-600">{row.flaggedCount}</td>
                    <td className="py-4 pr-4 text-slate-600">{row.reviewedCount}</td>
                    <td className="py-4 pr-4 text-slate-600">{formatPercent(row.supportedRate)}</td>
                    <td className="py-4 pr-4 text-slate-600">{formatPercent(row.notSupportedRate)}</td>
                    <td className="py-4">
                      <div className="space-y-2">
                        <HistogramBar inconclusive={row.inconclusiveCount} notSupported={row.notSupportedCount} supported={row.supportedCount} />
                        <p className="text-xs text-slate-500">
                          S {row.supportedCount} · I {row.inconclusiveCount} · N {row.notSupportedCount}
                        </p>
                      </div>
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
