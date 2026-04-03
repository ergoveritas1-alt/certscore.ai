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

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export async function ValidationIssuesPage() {
  const analytics = await getValidationIssueAnalytics();
  const totalFlagged = analytics.reduce((sum, row) => sum + row.flaggedCount, 0);
  const totalReviewed = analytics.reduce((sum, row) => sum + row.reviewedCount, 0);
  const strongestSupport = analytics[0] ?? null;

  return (
    <div className="space-y-8">
      <section
        className={cx(
          "relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-gradient-to-br from-violet-100 via-white to-sky-100 p-6 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] md:p-7"
        )}
      >
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(15,23,42,0.12),transparent_52%)]" />
        <div className="relative grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-800">
                Validation analytics
              </span>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-[2.1rem]">Issue analytics</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-600 md:text-[15px]">
                Compare rule-level hit rates and verifier outcomes so repeated weak rules stand out quickly.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            {[
              { label: "Rules tracked", value: analytics.length },
              { label: "Flagged rows", value: totalFlagged },
              { label: "Reviewed rows", value: totalReviewed },
              { label: "Top rule", value: strongestSupport?.title ?? "None" }
            ].map((tile) => (
              <div
                key={tile.label}
                className="rounded-[1.4rem] border border-slate-200/80 bg-white/78 p-4 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.35)] backdrop-blur"
              >
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{tile.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{tile.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Card className="overflow-hidden border-slate-200/80 bg-white/90 shadow-[0_18px_55px_-32px_rgba(15,23,42,0.28)]">
        <CardHeader>
          <CardTitle>Rule accuracy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {analytics.map((row) => (
              <div
                key={row.ruleKey}
                className="rounded-[1.35rem] border border-slate-200/80 bg-slate-50/55 p-4 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.3)]"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <p className="font-semibold tracking-tight text-slate-950">{row.title}</p>
                    <p className="text-xs text-slate-500">{row.ruleKey}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Flagged</p>
                      <p className="mt-1 text-sm text-slate-800">{row.flaggedCount}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Reviewed</p>
                      <p className="mt-1 text-sm text-slate-800">{row.reviewedCount}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Support rate</p>
                      <p className="mt-1 text-sm text-slate-800">{formatPercent(row.supportedRate)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Not-supported</p>
                      <p className="mt-1 text-sm text-slate-800">{formatPercent(row.notSupportedRate)}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <HistogramBar
                    inconclusive={row.inconclusiveCount}
                    notSupported={row.notSupportedCount}
                    supported={row.supportedCount}
                  />
                  <p className="text-xs text-slate-500">
                    S {row.supportedCount} · I {row.inconclusiveCount} · N {row.notSupportedCount}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
