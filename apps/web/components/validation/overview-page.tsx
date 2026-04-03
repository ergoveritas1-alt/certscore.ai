import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { ViewerTimestamp } from "../time/viewer-timestamp";
import { ValidationViewLink } from "./validation-view-link";
import { PendingSubmitButton } from "../ui/pending-submit-button";
import { listValidationRuns, listValidationTargets, getValidationSettings } from "../../server/validation/repository";
import { getValidationQueueAvailability } from "../../server/queue/validation-queue";
import {
  submitManualValidationRunAction,
  submitValidationSettingsAction,
  submitValidationTargetAction,
  submitValidationTargetAddAction
} from "../../server/validation/actions";
import { ValidationRescanForm } from "./validation-rescan-form";
import { ValidationRunsAutoRefresh } from "./validation-runs-auto-refresh";

function formatStateLabel(value: string) {
  return value.replace(/_/g, " ");
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function getPipelineTone(input: {
  enabled: boolean;
  hasActiveRuns: boolean;
  workerHealthy: boolean;
}) {
  if (!input.workerHealthy && input.hasActiveRuns) {
    return {
      badge: "border-rose-200 bg-rose-50 text-rose-800",
      panel: "from-rose-100 via-white to-orange-100"
    };
  }

  if (input.enabled) {
    return {
      badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
      panel: "from-emerald-100 via-white to-sky-100"
    };
  }

  return {
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    panel: "from-amber-100 via-white to-slate-100"
  };
}

export async function ValidationOverviewPage() {
  const [settings, targets, recentRuns, queueAvailability] = await Promise.all([
    getValidationSettings(),
    listValidationTargets(7),
    listValidationRuns({ page: 1 }),
    Promise.resolve(getValidationQueueAvailability())
  ]);
  const queuedOrActiveValidationJobs =
    (settings.queueHealth?.collect.waiting ?? 0) +
    (settings.queueHealth?.collect.active ?? 0) +
    (settings.queueHealth?.rank.waiting ?? 0) +
    (settings.queueHealth?.rank.active ?? 0);
  const showWorkerHeartbeatWarning = !settings.workerHealthy && queuedOrActiveValidationJobs > 0;
  const hasActiveRuns = recentRuns.items.some((run) =>
    ["waiting_for_scan", "queued", "collecting", "ranking", "validating"].includes(run.status ?? "")
  );
  const tone = getPipelineTone({
    enabled: settings.pipelineState === "running",
    hasActiveRuns,
    workerHealthy: settings.workerHealthy
  });
  const metricTiles = [
    {
      label: "Recent runs",
      value: recentRuns.items.length
    },
    {
      label: "Active validation jobs",
      value: queuedOrActiveValidationJobs
    },
    {
      label: "Tracked targets",
      value: targets.length
    },
    {
      label: "Pipeline mode",
      value: formatStateLabel(settings.pipelineState)
    }
  ];

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
        <div className="relative grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cx("rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]", tone.badge)}>
                Validation control
              </span>
              <span className="rounded-full border border-slate-200/80 bg-white/75 px-3 py-1 text-xs font-medium text-slate-700">
                {formatStateLabel(settings.pipelineState)}
              </span>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-[2.1rem]">
                Validation control center
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-600 md:text-[15px]">
                Monitor validation throughput, queue health, and the latest automated review runs from one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {settings.workerHealthy ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-1.5 text-xs font-medium text-emerald-800">
                  Worker heartbeat healthy
                </span>
              ) : (
                <span className="rounded-full border border-rose-200 bg-rose-50/90 px-3 py-1.5 text-xs font-medium text-rose-800">
                  Worker heartbeat stale
                </span>
              )}
              {queueAvailability.enabled ? (
                <span className="rounded-full border border-sky-200 bg-sky-50/90 px-3 py-1.5 text-xs font-medium text-sky-800">
                  Queue accepting runs
                </span>
              ) : (
                <span className="rounded-full border border-amber-200 bg-amber-50/90 px-3 py-1.5 text-xs font-medium text-amber-800">
                  Queue unavailable
                </span>
              )}
              {hasActiveRuns ? (
                <span className="rounded-full border border-slate-200/80 bg-white/75 px-3 py-1.5 text-xs font-medium text-slate-700">
                  Auto-refresh active
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {metricTiles.map((tile) => (
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <Card className="overflow-hidden border-slate-200/80 bg-white/90 shadow-[0_18px_55px_-32px_rgba(15,23,42,0.28)]">
          <CardHeader>
            <CardTitle>Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!queueAvailability.enabled ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                {queueAvailability.reason}
              </div>
            ) : null}

            <div className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 sm:grid-cols-2">
              <p>
                Mode: <span className="font-semibold text-slate-950">{settings.runMode}</span>
              </p>
              <p>
                Pipeline: <span className="font-semibold text-slate-950">{formatStateLabel(settings.pipelineState)}</span>
              </p>
              <p>
                Interval: <span className="font-semibold text-slate-950">{settings.automaticIntervalMinutes} minutes</span>
              </p>
              <p>
                Next due: <ViewerTimestamp value={settings.nextDueAt} fallback="Not scheduled" />
              </p>
              <p className="sm:col-span-2">
                Last Tranco sync: <ViewerTimestamp value={settings.lastTrancoSyncAt} fallback="Never" />
              </p>
              <p>
                Worker heartbeat: <ViewerTimestamp value={settings.lastWorkerHeartbeatAt} fallback="Never" />
              </p>
              <p>
                Worker host: <span className="font-semibold text-slate-950">{settings.lastWorkerHost ?? "—"}</span>
              </p>
              <p>
                Collect queue:{" "}
                <span className="font-semibold text-slate-950">
                  {settings.queueHealth ? `${settings.queueHealth.collect.waiting} waiting / ${settings.queueHealth.collect.active} active` : "—"}
                </span>
              </p>
              <p>
                Rank queue:{" "}
                <span className="font-semibold text-slate-950">
                  {settings.queueHealth ? `${settings.queueHealth.rank.waiting} waiting / ${settings.queueHealth.rank.active} active` : "—"}
                </span>
              </p>
            </div>

            {showWorkerHeartbeatWarning ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                Validation worker heartbeat is stale. New validation jobs may remain queued until a worker is running. Start `pnpm dev:validation` for the supported local validation flow.
              </div>
            ) : null}

            {settings.workerBacklogDetected ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                Validation queue backlog detected with no active worker consumption. Investigate the validation worker immediately.
              </div>
            ) : null}

            <form action={submitValidationSettingsAction} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Run mode
                  <select className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2" defaultValue={settings.runMode} name="runMode">
                    <option value="manual">Manual</option>
                    <option value="automatic">Automatic</option>
                  </select>
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Automatic interval
                  <select className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2" defaultValue={String(settings.automaticIntervalMinutes)} name="automaticIntervalMinutes">
                    {[5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240].map((minutes) => (
                      <option key={minutes} value={minutes}>
                        Every {minutes} minutes
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input defaultChecked={settings.pipelineState === "running"} name="pipelineEnabled" type="checkbox" value="1" />
                  Pipeline enabled
                </label>

                <PendingSubmitButton className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800" idleContent="Save controls" pendingContent="Saving..." />
              </div>
            </form>

            <form action={submitValidationTargetAddAction} className="space-y-2 rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-medium text-slate-950">Add target</p>
              <p className="text-sm text-slate-600">Enter a domain and add it directly to the validation target queue.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="min-w-0 flex-1 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  name="hostname"
                  placeholder="example.com"
                  type="text"
                />
                <PendingSubmitButton className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950" idleContent="Add target" pendingContent="Adding..." variant="secondary" />
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="overflow-hidden border-slate-200/80 bg-white/90 shadow-[0_18px_55px_-32px_rgba(15,23,42,0.28)]">
            <CardHeader>
              <CardTitle>Recent validation runs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 lg:grid-cols-2">
                {recentRuns.items.slice(0, 4).map((run) => (
                  <div
                    key={run.id}
                    className="rounded-[1.35rem] border border-slate-200/80 bg-slate-50/55 p-4 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.3)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-semibold tracking-tight text-slate-950">{run.hostname}</p>
                        <p className="font-mono text-[11px] text-slate-500">{run.scanId ?? "—"}</p>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-700">
                        {run.status}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Mode</p>
                        <p className="mt-1 text-sm text-slate-800">{run.triggerMode}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Findings</p>
                        <p className="mt-1 text-sm text-slate-800">{run.findingCount ?? "—"}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Created</p>
                        <p className="mt-1 text-sm text-slate-800">
                          <ViewerTimestamp value={run.createdAt} />
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <ValidationViewLink href={`/app/validation/scans/${run.id}`} />
                      {run.domainId ? (
                        <ValidationRescanForm
                          buttonClassName="text-sm font-medium text-slate-900 underline underline-offset-4"
                          domainId={run.domainId}
                          showIcon={false}
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-200/80 bg-white/90 shadow-[0_18px_55px_-32px_rgba(15,23,42,0.28)]">
            <CardHeader>
              <CardTitle>Target queue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {targets.map((target) => (
                  <div key={target.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-1">
                        <p className="font-medium text-slate-950">{target.hostname}</p>
                        <p className="text-sm text-slate-600">
                          Rank {target.trancoRank ?? "—"} · {target.rankBand ?? "unbanded"} · {target.denylisted ? "denylisted" : "active"}
                        </p>
                        <p className="text-sm text-slate-500">
                          Cooldown <ViewerTimestamp value={target.cooldownUntil} fallback="none" /> · Backoff{" "}
                          <ViewerTimestamp value={target.backoffUntil} fallback="none" />
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <form action={submitManualValidationRunAction}>
                          <input name="hostname" type="hidden" value={target.hostname} />
                          <input name="normalizedUrl" type="hidden" value={target.normalizedUrl} />
                          <input name="source" type="hidden" value={target.source ?? ""} />
                          <input name="targetId" type="hidden" value={target.id} />
                          <input name="trancoRank" type="hidden" value={target.trancoRank ?? ""} />
                          <PendingSubmitButton
                            className={[
                              "rounded-full px-4 py-2 text-sm font-medium transition",
                              queueAvailability.enabled
                                ? "bg-slate-950 text-white hover:bg-slate-800"
                                : "cursor-not-allowed bg-slate-200 text-slate-500"
                            ].join(" ")}
                            disabled={!queueAvailability.enabled}
                            idleContent="Manual run"
                            pendingContent="Starting..."
                          />
                        </form>
                        <form action={submitValidationTargetAction}>
                          <input name="hostname" type="hidden" value={target.hostname} />
                          <input name="normalizedUrl" type="hidden" value={target.normalizedUrl} />
                          <input name="source" type="hidden" value={target.source ?? ""} />
                          <input name="targetId" type="hidden" value={target.id} />
                          <input name="targetAction" type="hidden" value={target.denylisted ? "restore" : "deny"} />
                          <input name="trancoRank" type="hidden" value={target.trancoRank ?? ""} />
                          <PendingSubmitButton
                            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                            idleContent={target.denylisted ? "Re-include" : "Exclude"}
                            pendingContent={target.denylisted ? "Restoring..." : "Excluding..."}
                            variant="secondary"
                          />
                        </form>
                      </div>
                    </div>
                    {target.lastError ? <p className="mt-3 text-sm text-rose-700">Last error: {target.lastError}</p> : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
