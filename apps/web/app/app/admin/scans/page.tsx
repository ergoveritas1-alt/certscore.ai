import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { PaginationControls, normalizePage, normalizePageSize } from "../../../../components/ui/pagination-controls";
import { formatAdminDateTime } from "../../../../lib/admin/date-time";
import { classifyAdminRequestProvenance } from "../../../../lib/admin/request-provenance";
import { getAdminScanOverviewMetrics, listAdminScans } from "../../../../server/admin/list-admin-scans";
import { withServerTiming } from "../../../../server/performance/log-server-timing";
import { AdminScanActions } from "./admin-scan-actions";
import { AdminScansAutoRefresh } from "./admin-scans-auto-refresh";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AdminScansPageProps = {
  searchParams?: Promise<{
    page?: string;
    perPage?: string;
  }>;
};

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
  const currentPage = normalizePage(resolvedSearchParams.page);
  const pageSize = normalizePageSize(resolvedSearchParams.perPage);
  const scanMetrics = await withServerTiming("app.admin.scans.metrics", () => getAdminScanOverviewMetrics());
  const totalPages = Math.max(1, Math.ceil(scanMetrics.totalScans / pageSize));
  const normalizedPage = Math.min(currentPage, totalPages);
  const scans = await withServerTiming("app.admin.scans.list", () => listAdminScans(pageSize, (normalizedPage - 1) * pageSize));
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
        <PaginationControls
          basePath="/app/admin/scans"
          itemLabel="scan activity items"
          page={normalizedPage}
          pageCount={totalPages}
          pageSize={pageSize}
          totalCount={scanMetrics.totalScans}
          visibleCount={scans.length}
        />
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] table-fixed divide-y divide-slate-200 text-sm">
            <colgroup>
              <col style={{ width: "190px" }} />
              <col style={{ width: "170px" }} />
              <col style={{ width: "360px" }} />
              <col style={{ width: "300px" }} />
              <col style={{ width: "60px" }} />
            </colgroup>
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-3 pr-4 font-medium">Request</th>
                <th className="pb-3 pr-4 font-medium">Target</th>
                <th className="pb-3 pr-4 font-medium">Scan</th>
                <th className="pb-3 pr-4 font-medium">Result</th>
                <th className="pb-3 font-medium">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scans.map((scan) => {
                const provenance = classifyAdminRequestProvenance({
                  organizationName: scan.organizationName,
                  requestChannel: scan.requestChannel,
                  requesterIp: scan.requesterIp,
                  source: scan.source
                });
                return (
                  <tr key={scan.activityId}>
                    <td className="py-3 pr-4 align-top text-slate-700">
                      <p className="truncate font-medium text-slate-900" title={scan.organizationName ?? "Unknown workspace"}>
                        {scan.organizationName ?? "Unknown workspace"}
                      </p>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${provenance.className}`}>
                        {provenance.label}
                      </span>
                      <p className="mt-1 text-xs leading-snug text-slate-500">
                        <span>IP </span>
                        <span className="break-all">{scan.requesterIp ?? "Not recorded"}</span>
                      </p>
                    </td>
                    <td className="py-3 pr-4 align-top text-slate-700">
                      <p className="truncate" title={scan.domainHostname ?? "Unknown domain"}>{scan.domainHostname ?? "Unknown domain"}</p>
                    </td>
                    <td className="py-3 pr-4 align-top text-slate-700">
                      <p className="truncate font-mono text-xs text-slate-500" title={scan.linkedScanId ?? scan.scanId}>
                        scan_id {scan.linkedScanId ?? scan.scanId}
                      </p>
                      <p className="text-xs text-slate-500">First generated {formatAdminDateTime(scan.firstGeneratedAt)}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-slate-900">{scan.status}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          Scan from: {scan.scanFromLabel}
                        </span>
                        {(() => {
                          const badge = getScanFreshnessBadge(scan);
                          return (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
                              {badge.label}
                            </span>
                          );
                        })()}
                        {scan.rowKind === "request" ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Request</span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Run</span>
                        )}
                        {scan.rowKind === "scan" ? <span className="text-xs text-slate-500">{scan.pagesScanned} pages</span> : null}
                      </div>
                      {scan.rowKind === "request" ? (
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {formatResolutionMode(scan.requestResolutionMode)}
                          {scan.requestPublicId ? ` · ${scan.requestPublicId}` : ""}
                        </p>
                      ) : (
                        scan.requestPublicId ? <p className="mt-1 truncate text-xs text-slate-400">Request {scan.requestPublicId}</p> : null
                      )}
                    </td>
                    <td className="py-3 pr-4 align-top text-slate-700">
                      {scan.rowKind === "request" ? (
                        <>
                          <p className="font-medium text-slate-900">
                            {scan.linkedScanId
                              ? scan.requestResolutionMode === "reused_existing_scan"
                                ? "Fulfilled by recent scan"
                                : "Fulfilled by scan"
                              : "No scan linked"}
                          </p>
                          {scan.linkedScanId ? <p className="truncate font-mono text-xs text-slate-500">{scan.linkedScanId}</p> : null}
                          {scan.reuseWindowHours ? (
                            <p className="text-xs text-slate-500">Reuse window {scan.reuseWindowHours}h</p>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <p className="font-medium text-slate-900">
                            Signals {scan.totalSignals ?? 0} · Findings {scan.findingCount ?? 0}
                          </p>
                          {scan.topFindingCount !== null ? (
                            <p className="text-xs text-slate-500">Top findings {scan.topFindingCount}</p>
                          ) : null}
                        </>
                      )}
                      <p className="mt-1 text-xs text-slate-500">{formatAdminDateTime(scan.activityAt)}</p>
                    </td>
                    <td className="py-3 align-top">
                      {scan.linkedScanId && scan.scanViewHref ? (
                        <AdminScanActions scanId={scan.linkedScanId} scanViewHref={scan.scanViewHref} />
                      ) : (
                        <span className="text-xs text-slate-400">No report</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
