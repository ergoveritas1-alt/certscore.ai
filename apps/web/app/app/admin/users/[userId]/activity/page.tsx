import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { PaginationControls, normalizePage, normalizePageSize } from "../../../../../../components/ui/pagination-controls";
import { formatAdminCompactDateTime, formatAdminDateTime } from "../../../../../../lib/admin/date-time";
import { loadAdminUserActivity } from "../../../../../../server/admin/list-admin-user-activity";

type AdminUserActivityPageProps = {
  params: Promise<{ userId: string }>;
  searchParams?: Promise<{ page?: string; perPage?: string }>;
};

function formatStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatChannels(channels: string[]) {
  return channels.length > 0 ? channels.join(", ") : "—";
}

export default async function AdminUserActivityPage({ params, searchParams }: AdminUserActivityPageProps) {
  const { userId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const pageSize = normalizePageSize(resolvedSearchParams.perPage);
  const requestedPage = normalizePage(resolvedSearchParams.page);
  const requestedActivity = await loadAdminUserActivity(userId, pageSize, (requestedPage - 1) * pageSize);

  if (!requestedActivity) {
    notFound();
  }

  const pageCount = Math.max(1, Math.ceil(requestedActivity.metrics.associatedScans / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const activity = page === requestedPage
    ? requestedActivity
    : await loadAdminUserActivity(userId, pageSize, (page - 1) * pageSize);

  if (!activity) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="text-sm font-medium text-sky-700 hover:text-sky-900" href="/app/admin/users?dir=desc&sort=lastLogin">← Back to Users</Link>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">User activity</h2>
          <p className="mt-1 text-sm text-slate-600">{activity.user.email}{activity.user.organizationName ? ` · ${activity.user.organizationName}` : " · Unassigned"}</p>
        </div>
      </div>

      <Card className="border-slate-200 bg-white">
        <CardContent className="p-0">
          <div className="grid divide-y divide-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            <section className="min-w-0 p-4" aria-labelledby="scan-status-summary">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900" id="scan-status-summary">Scan status</h3>
                <p className="text-right text-xs text-slate-500">{activity.metrics.totalScans} submitted · {activity.metrics.associatedScans} associated · {activity.metrics.scanRequestCount} requested<br />{activity.metrics.lastScanRequestedAt ? `Last ${formatAdminCompactDateTime(activity.metrics.lastScanRequestedAt)}` : "No requests"}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500"><tr><th className="pb-1.5 pr-3">Status</th><th className="pb-1.5 text-right">Count</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {activity.scanStatusCounts.map((item) => <tr key={item.status}><td className="py-1.5 pr-3 text-slate-700">{formatStatus(item.status)}</td><td className="py-1.5 text-right font-medium tabular-nums text-slate-900">{item.count}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="min-w-0 p-4" aria-labelledby="api-route-summary">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900" id="api-route-summary">API activity routes</h3>
                <p className="text-xs text-slate-500">Pulse · SDK · MCP · Other</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500"><tr><th className="pb-1.5 pr-3">Route</th><th className="pb-1.5 pr-3 text-right">Requests</th><th className="pb-1.5 pr-3">Channels</th><th className="pb-1.5">Last request</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {activity.apiRoutes.map((item) => <tr key={item.route}><td className="py-1.5 pr-3 font-medium text-slate-700">{item.route}</td><td className="py-1.5 pr-3 text-right tabular-nums text-slate-900">{item.count}</td><td className="py-1.5 pr-3 text-slate-600">{formatChannels(item.channels)}</td><td className="whitespace-nowrap py-1.5 text-slate-600">{item.lastRequestedAt ? formatAdminCompactDateTime(item.lastRequestedAt) : "—"}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader><CardTitle>Account details</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-4">
          <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Name</p><p className="mt-1 text-slate-900">{activity.user.fullName ?? "—"}</p></div>
          <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Created</p><p className="mt-1 text-slate-900">{formatAdminDateTime(activity.user.createdAt)}</p></div>
          <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Last login</p><p className="mt-1 text-slate-900">{formatAdminDateTime(activity.user.lastLoginAt)}</p></div>
          <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Last scan requested</p><p className="mt-1 text-slate-900">{formatAdminDateTime(activity.metrics.lastScanRequestedAt)}</p></div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader><CardTitle>Scan activity</CardTitle></CardHeader>
        <CardContent>
          <PaginationControls
            basePath={`/app/admin/users/${userId}/activity`}
            itemLabel="scan activity items"
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            totalCount={activity.metrics.associatedScans}
            visibleCount={activity.scans.length}
          />
          {activity.scans.length === 0 ? <p className="text-sm text-slate-600">No scans submitted by this user.</p> : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-2 pr-4">Domain</th><th className="pb-2 pr-4">Association</th><th className="pb-2 pr-4">Status</th><th className="pb-2 pr-4">Pages</th><th className="pb-2 pr-4">Submitted</th><th className="pb-2 pr-4">Completed</th><th className="pb-2"> </th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {activity.scans.map((scan) => <tr key={scan.id}><td className="py-3 pr-4 font-medium text-slate-900">{scan.domainHostname ?? "Unknown domain"}</td><td className="py-3 pr-4 text-slate-600">{scan.association === "claimed" ? "Claimed after signup" : "Submitted by user"}</td><td className="py-3 pr-4 text-slate-600">{formatStatus(scan.status)}</td><td className="py-3 pr-4 text-slate-600">{scan.pagesScanned}</td><td className="whitespace-nowrap py-3 pr-4 text-slate-600">{formatAdminDateTime(scan.createdAt)}</td><td className="whitespace-nowrap py-3 pr-4 text-slate-600">{formatAdminDateTime(scan.completedAt)}</td><td className="py-3"><Link className="font-medium text-sky-700 hover:text-sky-900" href={`/app/scans/${scan.id}`}>View scan</Link></td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
