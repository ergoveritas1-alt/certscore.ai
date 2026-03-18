import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import {
  addValidationTargetAction,
  saveValidationControlsAction,
  startManualValidationRunAction,
  updateValidationTargetStateAction
} from "../../server/validation/actions";
import { getValidationOverviewData } from "../../server/validation/repository";

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatPipelineState(value: string) {
  if (value === "paused_by_env") {
    return "Paused by env";
  }
  if (value === "paused_by_admin") {
    return "Paused by admin";
  }
  return "Running";
}

function formatQueueMode(value: string) {
  return value === "automatic" ? "Automatic queue" : "Manual-only queue";
}

export async function ValidationOverviewPage() {
  const data = await getValidationOverviewData();

  if (data.setupRequired) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Validation controls</h1>
          <p className="max-w-3xl text-sm text-slate-300">
            The validation UI is available, but the validation database schema has not been initialized in this environment.
          </p>
        </div>

        <Card className="border-amber-400/30 bg-amber-500/10 text-amber-50">
          <CardHeader>
            <CardTitle>Setup required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>{data.setupMessage}</p>
            <p>Expected migration: `packages/db/migrations/0045_validation_pipeline.sql`</p>
            <p>After the migration is applied, reload this page and the validation controls will appear.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Validation controls</h1>
        <p className="max-w-3xl text-sm text-slate-300">
          Manual mode is the default. Automatic mode samples Tranco-backed targets at the saved interval and persists the
          cadence through restarts.
        </p>
      </div>

      <div className="grid gap-6">
        <Card className="border-white/10 bg-white/5 text-slate-100">
          <CardHeader>
            <CardTitle>Controls</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={saveValidationControlsAction} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="block text-slate-300">Mode</span>
                  <select
                    name="runMode"
                    defaultValue={data.settings.runMode}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white"
                  >
                    <option value="manual">Manual</option>
                    <option value="automatic">Automatic</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm">
                  <span className="block text-slate-300">Automatic interval</span>
                  <select
                    name="automaticIntervalMinutes"
                    defaultValue={String(data.settings.automaticIntervalMinutes)}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white"
                  >
                    {data.allowedIntervals.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        Every {minutes} minutes
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  name="pipelineEnabled"
                  defaultChecked={data.settings.pipelineEnabled}
                  className="h-4 w-4 rounded border-white/20 bg-slate-900"
                />
                <span>Allow new runs to start</span>
              </label>

              <label className="space-y-2 text-sm">
                <span className="block text-slate-300">Operator note</span>
                <textarea
                  name="operatorNote"
                  defaultValue={data.settings.operatorNote ?? ""}
                  rows={3}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white"
                />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit">Save scheduler settings</Button>
                <Badge tone={data.pipelineState === "running" ? "success" : "warning"}>
                  Scheduler: {formatPipelineState(data.pipelineState)}
                </Badge>
                <Badge>{formatQueueMode(data.settings.runMode)}</Badge>
                <span className="text-xs text-slate-400">Automatic scheduler next due: {formatDateTime(data.settings.nextDueAt)}</span>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-white/10 bg-white/5 text-slate-100">
          <CardHeader>
            <CardTitle>Add target</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-3">
              <input
                name="hostnameOrUrl"
                placeholder="example.com"
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white"
              />
              <Button formAction={addValidationTargetAction} type="submit">
                Add target only
              </Button>
            </form>
            <div className="space-y-2 text-sm text-slate-300">
              <p>Last scheduler tick: {formatDateTime(data.settings.lastScheduledAt)}</p>
              <p>Last Tranco sync: {formatDateTime(data.settings.lastTrancoSyncAt)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/10 bg-white/5 text-slate-100">
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.recentRuns.map((run) => (
            <div
              key={String(run.id)}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3"
            >
              <div>
                <div className="font-medium text-white">{String(run.hostname)}</div>
                <div className="text-xs text-slate-400">
                  {String(run.trigger_mode)} · {formatDateTime(run.created_at as string)}
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <span>{String(run.status)}</span>
                <span>{String(run.finding_count ?? 0)} findings</span>
                <span>
                  {run.average_agreement_score === null ? "—" : `${String(run.average_agreement_score)} avg`}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 text-slate-100">
        <CardHeader>
          <CardTitle>Upcoming queue</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <p className="mb-4 text-sm text-slate-300">
            This list always shows the next 5 eligible URLs. Once a target is scanned and enters cooldown or backoff, it drops off and the next URL replaces it.
          </p>
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="pb-3 pr-4 font-medium">Domain</th>
                <th className="pb-3 pr-4 font-medium">Rank</th>
                <th className="pb-3 pr-4 font-medium">State</th>
                <th className="pb-3 pr-4 font-medium">Cooldown</th>
                <th className="pb-3 pr-4 font-medium">Backoff</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {data.targets.map((target) => (
                <tr key={String(target.id)}>
                  <td className="py-4 pr-4">
                    <div className="font-medium text-white">{String(target.hostname)}</div>
                    <div className="text-xs text-slate-400">{String(target.source)}</div>
                  </td>
                  <td className="py-4 pr-4 text-slate-300">
                    {target.tranco_rank ? `#${String(target.tranco_rank)} · ${String(target.rank_band ?? "—")}` : "Manual"}
                  </td>
                  <td className="py-4 pr-4 text-slate-300">
                    {target.denylisted ? "Suppressed" : String(target.last_status ?? "idle")}
                  </td>
                  <td className="py-4 pr-4 text-slate-300">{formatDateTime(target.cooldown_until as string | null)}</td>
                  <td className="py-4 pr-4 text-slate-300">{formatDateTime(target.backoff_until as string | null)}</td>
                  <td className="py-4">
                    <div className="flex flex-wrap gap-2">
                      <form action={startManualValidationRunAction}>
                        <input type="hidden" name="targetId" value={String(target.id)} />
                        <Button size="sm" type="submit">
                          Run now
                        </Button>
                      </form>
                      <form action={updateValidationTargetStateAction}>
                        <input type="hidden" name="targetId" value={String(target.id)} />
                        <input type="hidden" name="action" value={target.denylisted ? "unsuppress" : "suppress"} />
                        <Button size="sm" type="submit" variant="secondary">
                          {target.denylisted ? "Re-include" : "Exclude"}
                        </Button>
                      </form>
                      <form action={updateValidationTargetStateAction}>
                        <input type="hidden" name="targetId" value={String(target.id)} />
                        <input type="hidden" name="action" value="clear_backoff" />
                        <Button size="sm" type="submit" variant="secondary">
                          Reset backoff
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {data.targets.length === 0 ? (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={6}>
                    No eligible URLs are currently queued.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
