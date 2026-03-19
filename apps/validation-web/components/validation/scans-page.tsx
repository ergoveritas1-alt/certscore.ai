import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { addValidationTargetAndStartAction } from "../../server/validation/actions";
import { listValidationRuns } from "../../server/validation/repository";

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(new Date(value));
}

function buildScansHref(input: {
  page: number;
  rankBand?: string | null;
  status?: string | null;
}) {
  const params = new URLSearchParams();
  params.set("page", String(input.page));

  if (input.rankBand) {
    params.set("rankBand", input.rankBand);
  }

  if (input.status) {
    params.set("status", input.status);
  }

  return `/app/scans?${params.toString()}`;
}

export async function ValidationScansPage(input: {
  searchParams?: Promise<{
    focusScanId?: string;
    page?: string;
    rankBand?: string;
    status?: string;
  }>;
}) {
  const params = input.searchParams ? await input.searchParams : {};
  const page = params.page ? Number(params.page) : 1;
  const data = await listValidationRuns({
    page,
    rankBand: params.rankBand ?? null,
    status: params.status ?? null
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white">All scans</h1>
        <p className="text-sm text-slate-300">
          Validation runs are ordered newest first and paginated at 50 runs per page.
        </p>
      </div>

      <Card className="border-white/10 bg-white/5 text-slate-100">
        <CardHeader>
          <CardTitle>Run history</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="pb-3 pr-4 font-medium">Domain</th>
                <th className="pb-3 pr-4 font-medium">Rank</th>
                <th className="pb-3 pr-4 font-medium">Mode</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 pr-4 font-medium">Findings</th>
                <th className="pb-3 pr-4 font-medium">Agreement</th>
                <th className="pb-3 pr-4 font-medium">Created</th>
                <th className="pb-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {data.rows.map((run) => (
                <tr key={String(run.id)}>
                  <td className="py-4 pr-4">
                    <div className="font-medium text-white">{String(run.hostname)}</div>
                    <div className="text-xs text-slate-400">{String(run.normalized_url)}</div>
                  </td>
                  <td className="py-4 pr-4 text-slate-300">
                    {run.tranco_rank ? `#${String(run.tranco_rank)} · ${String(run.rank_band ?? "—")}` : "Manual"}
                  </td>
                  <td className="py-4 pr-4 text-slate-300">{String(run.trigger_mode)}</td>
                  <td className="py-4 pr-4">
                    <Badge tone={String(run.status) === "completed" ? "success" : String(run.status) === "failed" ? "warning" : "neutral"}>
                      {String(run.status)}
                    </Badge>
                  </td>
                  <td className="py-4 pr-4 text-slate-300">
                    {String(run.reviewed_finding_count ?? 0)}/{String(run.finding_count ?? 0)}
                  </td>
                  <td className="py-4 pr-4 text-slate-300">
                    {run.average_agreement_score === null ? "—" : String(run.average_agreement_score)}
                  </td>
                  <td className="py-4 pr-4 text-slate-300">{formatDateTime(run.created_at as string)}</td>
                  <td className="py-4">
                    <div className="flex items-center gap-2">
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/app/scans/${String(run.id)}`}>View</Link>
                      </Button>
                      {String(run.status) === "completed" ? (
                        <form action={addValidationTargetAndStartAction}>
                          <input name="hostnameOrUrl" type="hidden" value={String(run.normalized_url)} />
                          <Button size="sm" type="submit">
                            Re-scan
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-6 flex items-center justify-between text-sm text-slate-300">
            <span>
              {data.totalCount} total runs · page {data.page} of {data.pageCount}
            </span>
            <div className="flex gap-2">
              {data.page > 1 ? (
                <Button asChild size="sm" variant="secondary">
                  <Link
                    href={buildScansHref({
                      page: data.page - 1,
                      rankBand: params.rankBand ?? null,
                      status: params.status ?? null
                    })}
                  >
                    Previous
                  </Link>
                </Button>
              ) : null}
              {data.page < data.pageCount ? (
                <Button asChild size="sm" variant="secondary">
                  <Link
                    href={buildScansHref({
                      page: data.page + 1,
                      rankBand: params.rankBand ?? null,
                      status: params.status ?? null
                    })}
                  >
                    Next
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
