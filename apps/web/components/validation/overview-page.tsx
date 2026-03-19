import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { ViewerTimestamp } from "../time/viewer-timestamp";
import { listValidationRuns, listValidationTargets, getValidationSettings } from "../../server/validation/repository";
import { getValidationQueueAvailability } from "../../server/queue/validation-queue";
import {
  submitManualValidationRunAction,
  submitValidationSettingsAction,
  submitValidationTargetAction,
  submitValidationTargetAddAction
} from "../../server/validation/actions";

function formatStateLabel(value: string) {
  return value.replace(/_/g, " ");
}

export async function ValidationOverviewPage() {
  const [settings, targets, recentRuns, queueAvailability] = await Promise.all([
    getValidationSettings(),
    listValidationTargets(5),
    listValidationRuns({ page: 1 }),
    Promise.resolve(getValidationQueueAvailability())
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Validation control center</h1>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <Card className="border-slate-200 bg-white">
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
            </div>

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

                <button className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800" type="submit">
                  Save controls
                </button>
              </div>
            </form>

            <form action={submitValidationTargetAddAction} className="space-y-2 rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-medium text-slate-950">Add target</p>
              <p className="text-sm text-slate-600">Pull a random Tranco domain between rank 1,000 and 50,000 into the queue.</p>
              <button className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950" type="submit">
                Add random Tranco target
              </button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Recent validation runs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="pb-3 pr-4 font-medium">Domain</th>
                      <th className="pb-3 pr-4 font-medium">Mode</th>
                      <th className="pb-3 pr-4 font-medium">Status</th>
                      <th className="pb-3 pr-4 font-medium">Score</th>
                      <th className="pb-3 pr-4 font-medium">Created</th>
                      <th className="pb-3 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentRuns.items.slice(0, 4).map((run) => (
                      <tr key={run.id}>
                        <td className="py-3 pr-4 text-slate-900">{run.hostname}</td>
                        <td className="py-3 pr-4 text-slate-600">{run.triggerMode}</td>
                        <td className="py-3 pr-4 text-slate-600">{run.status}</td>
                        <td className="py-3 pr-4 text-slate-600">{run.averageAgreementScore ?? "—"}</td>
                        <td className="py-3 pr-4 text-slate-600">
                          <ViewerTimestamp value={run.createdAt} />
                        </td>
                        <td className="py-3">
                          <a className="text-sm font-medium text-slate-900 underline underline-offset-4" href={`/app/validation/scans/${run.id}`}>
                            View
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white">
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
                          <input name="targetId" type="hidden" value={target.id} />
                          <button
                            className={[
                              "rounded-full px-4 py-2 text-sm font-medium transition",
                              queueAvailability.enabled
                                ? "bg-slate-950 text-white hover:bg-slate-800"
                                : "cursor-not-allowed bg-slate-200 text-slate-500"
                            ].join(" ")}
                            disabled={!queueAvailability.enabled}
                            title={queueAvailability.reason ?? undefined}
                            type="submit"
                          >
                            Manual run
                          </button>
                        </form>
                        <form action={submitValidationTargetAction}>
                          <input name="targetId" type="hidden" value={target.id} />
                          <input name="targetAction" type="hidden" value="remove" />
                          <button className="rounded-full border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 transition hover:border-rose-400 hover:text-rose-800" type="submit">
                            Remove
                          </button>
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
