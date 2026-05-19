import Link from "next/link";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import {
  getAdminPulseOverviewCounts,
  listAdminPulseRequests,
  type AdminPulseRequestStatus
} from "../../../../server/admin/list-pulse-requests";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const statuses = ["queued", "running", "finalizing", "completed", "completed_limited", "failed", "expired", "rate_limited"] as const;
const PAGE_SIZE = 50;

type AdminPulsePageProps = {
  searchParams?: Promise<{
    page?: string;
    q?: string;
    status?: string;
  }>;
};

function normalizeStatus(value: string | undefined): AdminPulseRequestStatus | null {
  return statuses.includes(value as AdminPulseRequestStatus) ? (value as AdminPulseRequestStatus) : null;
}

function normalizeQuery(value: string | undefined) {
  const query = value?.trim().slice(0, 160) ?? "";
  return query.length > 0 ? query : null;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
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

function formatLabel(value: string | null) {
  if (!value) {
    return "Not recorded";
  }
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function filterHref(input: { page?: number; query?: string | null; status?: string | null }) {
  const params = new URLSearchParams();
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.query) {
    params.set("q", input.query);
  }
  if (input.page && input.page > 1) {
    params.set("page", String(input.page));
  }
  const query = params.toString();
  return query ? `/app/admin/pulse?${query}` : "/app/admin/pulse";
}

function statusClass(status: string) {
  if (status === "completed" || status === "completed_limited") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "rate_limited" || status === "failed") {
    return "bg-amber-50 text-amber-700";
  }
  return "bg-sky-50 text-sky-700";
}

export default async function AdminPulsePage({ searchParams }: AdminPulsePageProps) {
  const resolved = searchParams ? await searchParams : {};
  const activeStatus = normalizeStatus(resolved.status);
  const activeQuery = normalizeQuery(resolved.q);
  const requestedPage = Number.parseInt(resolved.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [counts, requests] = await Promise.all([
    getAdminPulseOverviewCounts(),
    listAdminPulseRequests({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      query: activeQuery,
      status: activeStatus
    })
  ]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-5">
        <Metric label="Total" value={counts.total} />
        <Metric label="Completed" value={counts.completed} />
        <Metric label="Queued/running" value={counts.queuedOrRunning} />
        <Metric label="Rate limited" value={counts.rateLimited} />
        <Metric label="Feedback" value={counts.feedback} />
      </div>

      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle>Pulse Requests</CardTitle>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                First-class audit trail for Pulse API and public Pulse page requests. Feedback is private and linked to the originating request.
              </p>
            </div>
            <form action="/app/admin/pulse" className="flex flex-wrap gap-2">
              <input
                className="min-h-9 rounded-lg border border-slate-300 px-3 text-sm"
                defaultValue={activeQuery ?? ""}
                name="q"
                placeholder="Domain, job, request, scan"
              />
              <select className="min-h-9 rounded-lg border border-slate-300 px-3 text-sm" defaultValue={activeStatus ?? ""} name="status">
                <option value="">Any status</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {formatLabel(status)}
                  </option>
                ))}
              </select>
              <Button size="sm" type="submit" variant="secondary">
                Filter
              </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700" href={filterHref({ query: activeQuery })}>
              All
            </Link>
            {statuses.map((status) => (
              <Link
                className="rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700"
                href={filterHref({ query: activeQuery, status })}
                key={status}
              >
                {formatLabel(status)}
              </Link>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-3 pr-4 font-medium">Request</th>
                  <th className="pb-3 pr-4 font-medium">Target</th>
                  <th className="pb-3 pr-4 font-medium">Mode</th>
                  <th className="pb-3 pr-4 font-medium">Result</th>
                  <th className="pb-3 pr-4 font-medium">Feedback</th>
                  <th className="pb-3 font-medium">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((request) => (
                  <tr key={request.publicId}>
                    <td className="py-4 pr-4 text-slate-700">
                      <p className="font-medium text-slate-900">{request.publicId}</p>
                      <p className="text-xs text-slate-500">{request.jobId}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(request.requestedAt)}</p>
                    </td>
                    <td className="py-4 pr-4 text-slate-700">
                      <p>{request.normalizedDomain ?? "Unknown domain"}</p>
                      <p className="max-w-xs truncate text-xs text-slate-500">{request.requestedUrl ?? "No requested URL"}</p>
                    </td>
                    <td className="py-4 pr-4 text-slate-700">
                      <p>
                        {formatLabel(request.detail)} · {formatLabel(request.format)}
                      </p>
                      <p className="text-xs text-slate-500">{formatLabel(request.freshness)}</p>
                      <p className="text-xs text-slate-500">{formatLabel(request.resolutionMode)}</p>
                    </td>
                    <td className="py-4 pr-4 text-slate-700">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusClass(request.status)}`}>
                        {formatLabel(request.status)}
                      </span>
                      <p className="mt-2 text-xs text-slate-500">Scan {request.scanId ?? "Not linked"}</p>
                      {request.topFindingIds.length > 0 ? (
                        <p className="mt-1 max-w-xs truncate text-xs text-slate-500">{request.topFindingIds.join(", ")}</p>
                      ) : null}
                    </td>
                    <td className="py-4 pr-4 text-slate-700">{request.feedbackCount}</td>
                    <td className="py-4">
                      <Link className="text-sm font-semibold text-sky-700" href={`/app/admin/pulse/${request.publicId}`}>
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button asChild disabled={page <= 1} size="sm" variant="secondary">
              {page <= 1 ? <span className="cursor-not-allowed text-slate-400">Previous</span> : <Link href={filterHref({ page: page - 1, query: activeQuery, status: activeStatus })}>Previous</Link>}
            </Button>
            <span className="text-sm text-slate-600">Page {page}</span>
            <Button asChild disabled={requests.length < PAGE_SIZE} size="sm" variant="secondary">
              {requests.length < PAGE_SIZE ? <span className="cursor-not-allowed text-slate-400">Next</span> : <Link href={filterHref({ page: page + 1, query: activeQuery, status: activeStatus })}>Next</Link>}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}
