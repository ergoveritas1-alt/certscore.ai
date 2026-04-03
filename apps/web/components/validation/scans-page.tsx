import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { ViewerTimestamp } from "../time/viewer-timestamp";
import { listValidationRuns } from "../../server/validation/repository";
import { ValidationRescanForm } from "./validation-rescan-form";
import { ValidationRunsAutoRefresh } from "./validation-runs-auto-refresh";
import { ValidationViewLink } from "./validation-view-link";
import { PendingSubmitButton } from "../ui/pending-submit-button";

type ValidationScansPageProps = {
  page?: number;
  rankBand?: string | null;
  status?: string | null;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function getRunStateTone(hasActiveRuns: boolean) {
  return hasActiveRuns
    ? {
        badge: "border-sky-200 bg-sky-50 text-sky-800",
        panel: "from-sky-100 via-white to-cyan-100"
      }
    : {
        badge: "border-slate-200 bg-slate-50 text-slate-700",
        panel: "from-slate-100 via-white to-slate-50"
      };
}

export async function ValidationScansPage({ page = 1, rankBand = null, status = null }: ValidationScansPageProps) {
  const result = await listValidationRuns({
    page,
    rankBand,
    status
  });
  const hasActiveRuns = result.items.some((run) =>
    ["waiting_for_scan", "queued", "collecting", "ranking", "validating"].includes(run.status ?? "")
  );
  const tone = getRunStateTone(hasActiveRuns);
  const completedRuns = result.items.filter((run) => run.status === "completed").length;
  const flaggedFindings = result.items.reduce((sum, run) => sum + (run.findingCount ?? 0), 0);

  return (
    <div className="space-y-8">
      <ValidationRunsAutoRefresh enabled={hasActiveRuns} />
      <section
        className={cx(
          "relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-gradient-to-br p-6 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] md:p-7",
          tone.panel
        )}
      >
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(15,23,42,0.12),transparent_52%)]" />
        <div className="relative grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cx("rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]", tone.badge)}>
                Validation history
              </span>
              {hasActiveRuns ? (
                <span className="rounded-full border border-sky-200 bg-sky-50/90 px-3 py-1 text-xs font-medium text-sky-800">
                  Active runs in progress
                </span>
              ) : null}
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-[2.1rem]">
                All validation scans
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-600 md:text-[15px]">
                Review persisted validation history, filter by status or rank band, and jump straight into run-level results.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            {[
              { label: "Visible runs", value: result.items.length },
              { label: "Completed", value: completedRuns },
              { label: "Flagged findings", value: flaggedFindings }
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
          <CardTitle>Run history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action="/app/validation/scans" className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">
              Status
              <select className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2" defaultValue={status ?? ""} name="status">
                <option value="">All</option>
                <option value="waiting_for_scan">Waiting for scan</option>
                <option value="queued">Queued</option>
                <option value="collecting">Collecting</option>
                <option value="ranking">Ranking</option>
                <option value="validating">Validating</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Rank band
              <select className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2" defaultValue={rankBand ?? ""} name="rankBand">
                <option value="">All</option>
                <option value="1k-5k">1k-5k</option>
                <option value="5k-20k">5k-20k</option>
                <option value="20k-50k">20k-50k</option>
                <option value="50k-100k">50k-100k</option>
              </select>
            </label>
            <div className="flex items-end">
              <PendingSubmitButton
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                idleContent="Apply filters"
                pendingContent="Applying..."
                variant="secondary"
              />
            </div>
          </form>

          <div className="grid gap-4">
            {result.items.map((run) => (
              <div
                key={run.id}
                className="rounded-[1.35rem] border border-slate-200/80 bg-slate-50/55 p-4 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.3)]"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold tracking-tight text-slate-950">{run.hostname}</p>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-700">
                        {run.status}
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Run time</p>
                        <p className="mt-1 text-sm text-slate-800">
                          <ViewerTimestamp value={run.createdAt} />
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Scan ID</p>
                        <p className="mt-1 font-mono text-xs text-slate-700">{run.scanId ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Rank</p>
                        <p className="mt-1 text-sm text-slate-800">
                          {run.trancoRank ?? "—"} · {run.rankBand ?? "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Findings</p>
                        <p className="mt-1 text-sm text-slate-800">{run.findingCount} flagged</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      {run.triggerMode} · Scan status {run.scanStatus ?? "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <ValidationViewLink href={`/app/validation/scans/${run.id}`} idleLabel="View results" />
                    {run.domainId ? (
                      <ValidationRescanForm
                        buttonClassName="text-sm font-medium text-slate-900 underline underline-offset-4"
                        domainId={run.domainId}
                        showIcon={false}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm text-slate-600">
            <p>
              Page {result.page} of {Math.max(1, result.pageCount)}
            </p>
            <div className="flex gap-3">
              {result.page > 1 ? (
                <Link
                  className="rounded-full border border-slate-300 px-4 py-2 transition hover:border-slate-400 hover:text-slate-950"
                  href={`/app/validation/scans?page=${result.page - 1}${rankBand ? `&rankBand=${encodeURIComponent(rankBand)}` : ""}${status ? `&status=${encodeURIComponent(status)}` : ""}`}
                >
                  Previous
                </Link>
              ) : null}
              {result.page < result.pageCount ? (
                <Link
                  className="rounded-full border border-slate-300 px-4 py-2 transition hover:border-slate-400 hover:text-slate-950"
                  href={`/app/validation/scans?page=${result.page + 1}${rankBand ? `&rankBand=${encodeURIComponent(rankBand)}` : ""}${status ? `&status=${encodeURIComponent(status)}` : ""}`}
                  >
                    Next
                  </Link>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
