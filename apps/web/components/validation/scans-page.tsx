import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { ViewerTimestamp } from "../time/viewer-timestamp";
import { listValidationRuns } from "../../server/validation/repository";

type ValidationScansPageProps = {
  page?: number;
  rankBand?: string | null;
  status?: string | null;
};

export async function ValidationScansPage({ page = 1, rankBand = null, status = null }: ValidationScansPageProps) {
  const result = await listValidationRuns({
    page,
    rankBand,
    status
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">All validation scans</h1>
        <p className="max-w-3xl text-slate-600">Most recent runs first, showing persisted automated CertScore findings.</p>
      </div>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Run history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action="/app/validation/scans" className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">
              Status
              <select className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2" defaultValue={status ?? ""} name="status">
                <option value="">All</option>
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
              <button className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950" type="submit">
                Apply filters
              </button>
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-3 pr-4 font-medium">Run time</th>
                  <th className="pb-3 pr-4 font-medium">Domain</th>
                  <th className="pb-3 pr-4 font-medium">Scan ID</th>
                  <th className="pb-3 pr-4 font-medium">Rank</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Findings</th>
                  <th className="pb-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.items.map((run) => (
                  <tr key={run.id}>
                    <td className="py-4 pr-4 text-slate-600">
                      <ViewerTimestamp value={run.createdAt} />
                    </td>
                    <td className="py-4 pr-4 text-slate-900">
                      <div>
                        <p className="font-medium">{run.hostname}</p>
                        <p className="text-xs text-slate-500">{run.triggerMode}</p>
                      </div>
                    </td>
                    <td className="py-4 pr-4 text-slate-600">
                      <span className="font-mono text-xs text-slate-700">{run.scanId ?? "—"}</span>
                    </td>
                    <td className="py-4 pr-4 text-slate-600">
                      {run.trancoRank ?? "—"} · {run.rankBand ?? "—"}
                    </td>
                    <td className="py-4 pr-4 text-slate-600">{run.status}</td>
                    <td className="py-4 pr-4 text-slate-600">
                      {run.findingCount} flagged
                    </td>
                    <td className="py-4">
                      <Link className="text-sm font-medium text-slate-900 underline underline-offset-4" href={`/app/validation/scans/${run.id}`}>
                        View results
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
