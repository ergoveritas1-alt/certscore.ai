import Link from "next/link";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { getAdminScanOverviewMetrics, listAdminScans } from "../../../../server/admin/list-admin-scans";
import { AdminScanActions } from "./admin-scan-actions";
import { AdminScansAutoRefresh } from "./admin-scans-auto-refresh";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ADMIN_SCAN_PAGE_SIZE = 25;

type AdminScansPageProps = {
  searchParams?: Promise<{
    page?: string;
  }>;
};

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

function buildPageHref(page: number) {
  return page <= 1 ? "/app/admin/scans" : `/app/admin/scans?page=${page}`;
}

function formatResolutionMode(value: string | null) {
  if (!value) {
    return "Request recorded";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getScanFreshnessBadge(scan: { requestResolutionMode: string | null; rowKind: "scan" | "request" }) {
  if (scan.requestResolutionMode === "reused_existing_scan") {
    return {
      className: "bg-sky-50 text-sky-700 ring-1 ring-sky-100",
      label: "Reused <24h"
    };
  }

  if (scan.rowKind === "request") {
    return {
      className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
      label: "Fresh request"
    };
  }

  return {
    className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
    label: "Fresh scan"
  };
}

export default async function AdminScansPage({ searchParams }: AdminScansPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedPage = Number.parseInt(resolvedSearchParams.page ?? "1", 10);
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const scanMetrics = await getAdminScanOverviewMetrics();
  const totalPages = Math.max(1, Math.ceil(scanMetrics.totalScans / ADMIN_SCAN_PAGE_SIZE));
  const normalizedPage = Math.min(currentPage, totalPages);
  const scans = await listAdminScans(ADMIN_SCAN_PAGE_SIZE, (normalizedPage - 1) * ADMIN_SCAN_PAGE_SIZE);
  const pageStart = scanMetrics.totalScans === 0 ? 0 : (normalizedPage - 1) * ADMIN_SCAN_PAGE_SIZE + 1;
  const pageEnd = Math.min((normalizedPage - 1) * ADMIN_SCAN_PAGE_SIZE + scans.length, scanMetrics.totalScans);
  const hasActiveScans = scans.some((scan) => scan.status === "queued" || scan.status === "running");

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Scan Admin</CardTitle>
            <p className="text-sm text-slate-500">Newest scan activity first.</p>
          </div>
          <p className="text-sm text-slate-500">
            {scanMetrics.totalScans} activity rows · {scanMetrics.totalPhysicalScans} scanner runs ·{" "}
            {scanMetrics.totalScanRequests} submitted requests
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <AdminScansAutoRefresh hasActiveScans={hasActiveScans} />
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            Showing {pageStart}-{pageEnd} of {scanMetrics.totalScans} scan activity items
          </p>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button asChild disabled={normalizedPage <= 1} size="sm" variant="secondary">
              {normalizedPage <= 1 ? (
                <span className="cursor-not-allowed text-slate-400">Previous</span>
              ) : (
                <Link href={buildPageHref(normalizedPage - 1)}>Previous</Link>
              )}
            </Button>
            <span className="text-sm text-slate-600">
              Page {normalizedPage} of {totalPages}
            </span>
            <Button asChild disabled={normalizedPage >= totalPages} size="sm" variant="secondary">
              {normalizedPage >= totalPages ? (
                <span className="cursor-not-allowed text-slate-400">Next</span>
              ) : (
                <Link href={buildPageHref(normalizedPage + 1)}>Next</Link>
              )}
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1200px] table-fixed divide-y divide-slate-200 text-sm">
            <colgroup>
              <col className="w-[10%]" />
              <col className="w-[14%]" />
              <col className="w-[28%]" />
              <col className="w-[28%]" />
              <col className="w-[12%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-3 pr-4 font-medium">Workspace</th>
                <th className="pb-3 pr-4 font-medium">Domain</th>
                <th className="pb-3 pr-4 font-medium">Scan</th>
                <th className="pb-3 pr-4 font-medium">Snapshot</th>
                <th className="pb-3 pr-4 font-medium">Activity time</th>
                <th className="pb-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scans.map((scan) => (
                <tr key={scan.activityId}>
                  <td className="py-4 pr-4 text-slate-700">
                    <p className="truncate" title={scan.organizationName ?? "Unknown workspace"}>{scan.organizationName ?? "Unknown workspace"}</p>
                    <p className="text-xs text-slate-500">Requester IP {scan.requesterIp ?? "Not recorded"}</p>
                  </td>
                  <td className="py-4 pr-4 text-slate-700">{scan.domainHostname ?? "Unknown domain"}</td>
                  <td className="py-4 pr-4 text-slate-700">
                    <p className="font-mono text-xs text-slate-500">scan_id {scan.linkedScanId ?? scan.scanId}</p>
                    <p className="text-xs text-slate-500">First generated {formatDateTime(scan.firstGeneratedAt)}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <p>{scan.status}</p>
                      {(() => {
                        const badge = getScanFreshnessBadge(scan);
                        return (
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badge.className}`}>
                            {badge.label}
                          </span>
                        );
                      })()}
                      {scan.rowKind === "request" ? (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                          Submitted request
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                          Scanner run
                        </span>
                      )}
                    </div>
                    {scan.rowKind === "request" ? (
                      <>
                        <p className="text-xs text-slate-500">{formatResolutionMode(scan.requestResolutionMode)}</p>
                        {scan.requestPublicId ? <p className="text-xs text-slate-400">{scan.requestPublicId}</p> : null}
                      </>
                    ) : (
                      <p>{scan.pagesScanned} pages</p>
                    )}
                    {scan.source === "pulse_api" ? (
                      <p className="mt-1 inline-flex rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">Pulse API</p>
                    ) : null}
                    {scan.requestChannel === "gpt_action" ? (
                      <p className="mt-1 inline-flex rounded-full bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700">
                        GPT Action
                      </p>
                    ) : null}
                  </td>
                  <td className="py-4 pr-4 text-slate-700">
                    {scan.rowKind === "request" ? (
                      <>
                        <p>
                          {scan.linkedScanId
                            ? scan.requestResolutionMode === "reused_existing_scan"
                              ? "Fulfilled by recent scan"
                              : "Fulfilled by scan"
                            : "No scan linked"}
                        </p>
                        {scan.linkedScanId ? <p className="text-xs text-slate-500">{scan.linkedScanId}</p> : null}
                        {scan.reuseWindowHours ? (
                          <p className="text-xs text-slate-500">Reuse window {scan.reuseWindowHours}h</p>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <p>Signals {scan.totalSignals ?? 0}</p>
                        <p>Findings {scan.findingCount ?? 0}</p>
                      </>
                    )}
                  </td>
                  <td className="py-4 pr-4 text-slate-700">{formatDateTime(scan.activityAt)}</td>
                  <td className="py-4">
                    {scan.linkedScanId && scan.scanViewHref ? (
                      <AdminScanActions scanId={scan.linkedScanId} scanViewHref={scan.scanViewHref} />
                    ) : (
                      <span className="text-xs text-slate-400">No report</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
