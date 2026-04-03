import { getValidationFindingFamily } from "@website-signal-risk-scanner/shared";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { getValidationIssueAnalytics } from "../../server/validation/repository";

function asPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function histogramStyle(supportedCount: number, inconclusiveCount: number, notSupportedCount: number) {
  const total = supportedCount + inconclusiveCount + notSupportedCount;
  if (total === 0) {
    return {
      inconclusive: "0%",
      notSupported: "0%",
      supported: "0%"
    };
  }

  return {
    inconclusive: `${(inconclusiveCount / total) * 100}%`,
    notSupported: `${(notSupportedCount / total) * 100}%`,
    supported: `${(supportedCount / total) * 100}%`
  };
}

export async function ValidationIssuesPage() {
  const rows = await getValidationIssueAnalytics();

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Issue analytics</h1>
        <p className="text-sm text-slate-300">
          Rule-level counts show how often a finding family and issue are flagged and how often GPT verification supports them.
        </p>
      </div>

      <Card className="border-white/10 bg-white/5 text-slate-100">
        <CardHeader>
          <CardTitle>Rule accuracy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.map((row) => {
            const widths = histogramStyle(row.supportedCount, row.inconclusiveCount, row.notSupportedCount);
            return (
              <div key={row.ruleKey} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-white">{row.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <Badge>{getValidationFindingFamily({ findingFamily: row.findingFamily, ruleKey: row.ruleKey }).label}</Badge>
                      <span>{row.ruleKey}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{row.totalFlagged} flagged</Badge>
                    <Badge>{row.reviewedCount} reviewed</Badge>
                    <Badge tone="success">Supported {asPercent(row.supportedRate)}</Badge>
                    <Badge tone="warning">Not supported {asPercent(row.notSupportedRate)}</Badge>
                  </div>
                </div>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
                  <div className="flex h-full">
                    <div className="bg-emerald-400" style={{ width: widths.supported }} />
                    <div className="bg-amber-400" style={{ width: widths.inconclusive }} />
                    <div className="bg-rose-400" style={{ width: widths.notSupported }} />
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-300 md:grid-cols-4">
                  <div>Supported: {row.supportedCount}</div>
                  <div>Inconclusive: {row.inconclusiveCount}</div>
                  <div>Not supported: {row.notSupportedCount}</div>
                  <div>Avg score: {row.averageAgreementScore === null ? "—" : row.averageAgreementScore}</div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
