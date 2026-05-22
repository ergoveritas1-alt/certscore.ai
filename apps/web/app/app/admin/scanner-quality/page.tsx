import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { listRecentQualityWarningRuns } from "../../../../server/admin/list-quality-warnings";

function formatRate(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "unknown";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "unknown";
  }
  return value.toFixed(2);
}

export default async function AdminScannerQualityPage() {
  const runs = await listRecentQualityWarningRuns();
  const warnings = runs.flatMap((run) =>
    run.warnings.map((warning) => ({
      ...warning,
      runDir: run.runDir
    }))
  );

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Scanner Quality Warnings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-600">
          <p>WARN-only Phase 1B egress quality signals from generated calibration and load-test artifacts.</p>
          <p>Control-plane gate failures remain hard stops and are not downgraded into quality warnings.</p>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Recent Warning Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-slate-600">No quality warning artifacts found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Batch</th>
                    <th className="py-2 pr-4 font-medium">Generated</th>
                    <th className="py-2 pr-4 font-medium">Warnings</th>
                    <th className="py-2 pr-4 font-medium">Artifact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {runs.map((run) => (
                    <tr key={run.runDir}>
                      <td className="py-3 pr-4 font-medium text-slate-900">{run.batchId}</td>
                      <td className="py-3 pr-4 text-slate-600">{run.generatedAt ?? "unknown"}</td>
                      <td className="py-3 pr-4 text-slate-600">{run.warningCount}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-slate-500">{run.runDir}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Active / Recent Warnings</CardTitle>
        </CardHeader>
        <CardContent>
          {warnings.length === 0 ? (
            <p className="text-sm text-slate-600">No active or recent quality warnings in available artifacts.</p>
          ) : (
            <div className="space-y-4">
              {warnings.map((warning) => (
                <div key={warning.warningId} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold uppercase text-amber-800">{warning.severity}</span>
                    <span className="font-medium text-slate-950">{warning.code}</span>
                    <span className="text-sm text-slate-600">{warning.generatedAt}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{warning.explanation}</p>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="text-slate-500">Batch</dt>
                      <dd className="font-medium text-slate-900">{warning.batchId}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Egress</dt>
                      <dd className="font-medium text-slate-900">
                        {warning.egress_id} / {warning.egressProvider}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Findings/completed</dt>
                      <dd className="font-medium text-slate-900">{formatNumber(warning.metrics.findingsPerCompleted)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Zero-finding rate</dt>
                      <dd className="font-medium text-slate-900">{formatRate(warning.metrics.zeroFindingRate)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Completed</dt>
                      <dd className="font-medium text-slate-900">{warning.metrics.completedCount}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Pages scanned</dt>
                      <dd className="font-medium text-slate-900">{warning.metrics.pagesScanned}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Blocker label rate</dt>
                      <dd className="font-medium text-slate-900">{formatRate(warning.metrics.blockerLabelRate)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Window</dt>
                      <dd className="font-medium text-slate-900">{warning.completionWindow.label ?? "completed scans"}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
