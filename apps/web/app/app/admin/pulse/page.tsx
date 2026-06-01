import Link from "next/link";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { FreshRescanBadge } from "../../../../components/scans/fresh-rescan-badge";
import { PaginationControls, normalizePage, normalizePageSize } from "../../../../components/ui/pagination-controls";
import { formatAdminDateTime } from "../../../../lib/admin/date-time";
import { classifyAdminRequestProvenance } from "../../../../lib/admin/request-provenance";
import {
  getAdminPulseOverviewCounts,
  listAdminPulseRequests,
  type AdminPulseRequestStatus
} from "../../../../server/admin/list-pulse-requests";
import { withServerTiming } from "../../../../server/performance/log-server-timing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const statuses = ["queued", "running", "finalizing", "completed", "completed_limited", "failed", "expired", "rate_limited"] as const;

type AdminPulsePageProps = {
  searchParams?: Promise<{
    page?: string;
    perPage?: string;
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

function formatLabel(value: string | null) {
  if (!value) {
    return "Not recorded";
  }
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function filterHref(input: { page?: number; pageSize?: number; query?: string | null; status?: string | null }) {
  const params = new URLSearchParams();
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.pageSize && input.pageSize !== 20) {
    params.set("perPage", String(input.pageSize));
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

function sourceIpLabel(request: { sourceIp: string | null; sourceIpHash: string | null }) {
  if (request.sourceIp) {
    return request.sourceIp;
  }
  if (request.sourceIpHash) {
    return `Hash ${request.sourceIpHash.slice(0, 12)}`;
  }
  return "Not recorded";
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
  const pageSize = normalizePageSize(resolved.perPage);
  const page = normalizePage(resolved.page);
  const [counts, requests] = await withServerTiming("app.admin.pulse", () =>
    Promise.all([
      getAdminPulseOverviewCounts(),
      listAdminPulseRequests({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        query: activeQuery,
        status: activeStatus
      })
    ])
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">
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
              <p className="mt-1 max-w-3xl text-sm text-slate-500">Newest Pulse API and public page requests first.</p>
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
        <CardContent className="space-y-3 pt-0">
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700" href={filterHref({ pageSize, query: activeQuery })}>
              All
            </Link>
            {statuses.map((status) => (
              <Link
                className="rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700"
                href={filterHref({ pageSize, query: activeQuery, status })}
                key={status}
              >
                {formatLabel(status)}
              </Link>
            ))}
          </div>

          <PaginationControls
            basePath="/app/admin/pulse"
            hasNext={requests.length >= pageSize}
            itemLabel="Pulse requests"
            page={page}
            pageSize={pageSize}
            searchParams={{ q: activeQuery, status: activeStatus }}
            visibleCount={requests.length}
          />

          <div className="overflow-x-auto">
            <table className="min-w-[1060px] table-fixed divide-y divide-slate-200 text-sm">
              <colgroup>
                <col style={{ width: "220px" }} />
                <col style={{ width: "220px" }} />
                <col style={{ width: "240px" }} />
                <col style={{ width: "380px" }} />
                <col style={{ width: "50px" }} />
              </colgroup>
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-3 pr-4 font-medium">Request</th>
                  <th className="pb-3 pr-4 font-medium">Target</th>
                  <th className="pb-3 pr-4 font-medium">Mode</th>
                  <th className="pb-3 pr-4 font-medium">Result</th>
                  <th className="pb-3 font-medium">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((request) => {
                  const provenance = classifyAdminRequestProvenance({
                    requestChannel: request.requestChannel,
                    requestedByAnonymous: request.requestedByAnonymous,
                    requesterIp: request.sourceIp ?? request.sourceIpHash
                  });
                  return (
                    <tr key={request.publicId}>
                      <td className="py-3 pr-4 align-top text-slate-700">
                        <p className="truncate font-mono text-xs text-slate-900" title={request.publicId}>{request.publicId}</p>
                        <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${provenance.className}`}>
                          {provenance.label}
                        </span>
                        <p className="mt-1 text-xs leading-snug text-slate-500">
                          <span>IP </span>
                          <span className="break-all">{sourceIpLabel(request)}</span>
                        </p>
                      </td>
                      <td className="py-3 pr-4 align-top text-slate-700">
                        <p className="truncate" title={request.normalizedDomain ?? "Unknown domain"}>{request.normalizedDomain ?? "Unknown domain"}</p>
                        <p className="max-w-xs truncate text-xs text-slate-500">{request.requestedUrl ?? "No requested URL"}</p>
                      </td>
                      <td className="py-3 pr-4 align-top text-slate-700">
                        <p className="font-medium text-slate-900">{formatLabel(request.detail)} · {formatLabel(request.format)}</p>
                        <p className="text-xs text-slate-500">
                          {formatLabel(request.freshness)} · {formatLabel(request.resolutionMode)}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                            Scan from: {request.scanFromLabel}
                          </span>
                          <FreshRescanBadge value={request.freshRescanRequested} />
                        </div>
                      </td>
                      <td className="py-3 pr-4 align-top text-slate-700">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(request.status)}`}>
                          {formatLabel(request.status)}
                        </span>
                        <p className="mt-1 truncate font-mono text-xs text-slate-500">Scan {request.scanId ?? "Not linked"}</p>
                        {request.scanId ? (
                          <p className="mt-1 text-xs text-slate-500">
                            Signals {request.snapshotTotalSignals ?? 0} · Findings {request.snapshotFindingCount ?? 0} · Top {request.topFindingIds.length}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-slate-500">Feedback {request.feedbackCount}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatAdminDateTime(request.requestedAt)}</p>
                      </td>
                      <td className="py-3 align-top">
                        <Link className="text-sm font-semibold text-sky-700" href={`/app/admin/pulse/${request.publicId}`}>
                          Details
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader className="pb-1 pt-4">
        <CardTitle className="text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}
