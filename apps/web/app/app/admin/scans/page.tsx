import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { getScanFromMarkerInput, ScanFromMarker } from "../../../../components/scans/scan-from-icons";
import { PaginationControls, normalizePage, normalizePageSize } from "../../../../components/ui/pagination-controls";
import { formatAdminDateTime } from "../../../../lib/admin/date-time";
import { classifyAdminRequestProvenance } from "../../../../lib/admin/request-provenance";
import { getAdminScanOverviewMetrics, listAdminScans, type AdminScanListItem, type AdminScanListStatus } from "../../../../server/admin/list-admin-scans";
import { withServerTiming } from "../../../../server/performance/log-server-timing";
import { AdminScanActions } from "./admin-scan-actions";
import { AdminScansAutoRefresh } from "./admin-scans-auto-refresh";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AdminScansPageProps = {
  searchParams?: Promise<{ email?: string; page?: string; perPage?: string; q?: string; status?: string }>;
};

const statuses = ["any", "no_go", "failed", "running", "queued", "limited", "completed"] as const;
function normalizeStatus(value: string | undefined): AdminScanListStatus {
  return statuses.includes(value as AdminScanListStatus) ? value as AdminScanListStatus : "any";
}

function getScanFreshnessBadge(scan: Pick<AdminScanListItem, "freshRescanRequested" | "requestResolutionMode" | "rowKind">) {
  if (scan.requestResolutionMode === "reused_existing_scan") {
    return { className: "bg-sky-50 text-sky-700 ring-1 ring-sky-100", label: "Reused <24h" };
  }
  if (scan.freshRescanRequested === true) {
    return { className: "bg-violet-50 text-violet-700 ring-1 ring-violet-100", label: "Forced fresh" };
  }
  return {
    className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
    label: scan.rowKind === "request" ? "Fresh request" : "Fresh"
  };
}

function getOperationalStatus(scan: AdminScanListItem) {
  if (scan.accessPostureClass === "early_loss" || scan.blockedFlag || scan.captchaFlag) {
    return { className: "bg-rose-500", label: "No-go" };
  }
  if (scan.status === "failed") {
    return { className: "bg-rose-500", label: "Failed" };
  }
  if (scan.status === "running" || scan.status === "queued") {
    return { className: "bg-amber-400", label: scan.status === "running" ? "Running" : "Queued" };
  }
  if (scan.accessPostureClass === "degraded_but_useful" || scan.accessPostureClass === "robots_limited") {
    return { className: "bg-amber-400", label: "Limited" };
  }
  if (scan.rowKind === "request") {
    return { className: "bg-sky-400", label: "Request" };
  }
  return { className: "bg-emerald-500", label: "Completed" };
}

function formatAdminScanDuration(scan: Pick<AdminScanListItem, "completedAt" | "createdAt" | "startedAt">) {
  const start = new Date(scan.startedAt ?? scan.createdAt).getTime();
  const end = scan.completedAt ? new Date(scan.completedAt).getTime() : null;
  if (!Number.isFinite(start) || end === null || !Number.isFinite(end) || end < start) {
    return null;
  }
  const seconds = (end - start) / 1000;
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s` : `${seconds.toFixed(1)}s`;
}

function getAccessLabel(scan: AdminScanListItem) {
  if (scan.captchaFlag) return "CAPTCHA";
  if (scan.blockedFlag || scan.accessPostureClass === "early_loss") return scan.homepageFetchHttpStatus ? `Blocked · ${scan.homepageFetchHttpStatus}` : "Blocked";
  if (scan.accessPostureClass === "robots_limited") return "Robots-limited";
  if (scan.accessPostureClass === "degraded_but_useful") return "Limited";
  return scan.rowKind === "scan" ? "Clear" : "—";
}

export default async function AdminScansPage({ searchParams }: AdminScansPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const currentPage = normalizePage(resolvedSearchParams.page);
  const pageSize = normalizePageSize(resolvedSearchParams.perPage);
  const activeQuery = resolvedSearchParams.q?.trim().slice(0, 160) ?? "";
  const activeEmail = resolvedSearchParams.email?.trim().slice(0, 160) ?? "";
  const activeStatus = normalizeStatus(resolvedSearchParams.status);
  const hasFilters = Boolean(activeQuery) || Boolean(activeEmail) || activeStatus !== "any";
  const scanMetrics = await withServerTiming("app.admin.scans.metrics", () => getAdminScanOverviewMetrics());
  const filteredScans = await withServerTiming("app.admin.scans.list", () => listAdminScans(hasFilters ? 25_000 : pageSize, hasFilters ? 0 : (currentPage - 1) * pageSize, { email: activeEmail || null, query: activeQuery || null, status: activeStatus }));
  const totalCount = hasFilters ? filteredScans.length : scanMetrics.totalScans;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const normalizedPage = Math.min(currentPage, totalPages);
  const scans = hasFilters ? filteredScans.slice((normalizedPage - 1) * pageSize, normalizedPage * pageSize) : filteredScans;
  const hasActiveScans = scans.some((scan) => scan.status === "queued" || scan.status === "running");

  return (
    <Card className="min-w-0 overflow-hidden border-slate-200 bg-white">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Scan Admin</CardTitle>
            <p className="text-sm text-slate-500">Compact operational view of newest scan activity.</p>
          </div>
          <p className="text-sm text-slate-500">
            {scanMetrics.totalPhysicalScans} runs · {scanMetrics.totalScanRequests} requests
          </p>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3 pt-0">
        <AdminScansAutoRefresh hasActiveScans={hasActiveScans} />
        <form className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2" method="get">
          <input aria-label="Search scans" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm" defaultValue={activeQuery} name="q" placeholder="Domain, scan, requester, IP" />
          <input aria-label="Filter scans by user email" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm" defaultValue={activeEmail} name="email" placeholder="User email" />
          <select aria-label="Filter scans by status" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" defaultValue={activeStatus} name="status">{statuses.map((status) => <option key={status} value={status}>{status === "any" ? "Any status" : status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</option>)}</select>
          <button className="h-10 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white" type="submit">Filter</button>
          {hasFilters ? <Link className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700" href="/app/admin/scans">Clear</Link> : null}
        </form>
        <PaginationControls
          basePath="/app/admin/scans"
          itemLabel="scan activity items"
          page={normalizedPage}
          pageCount={totalPages}
          pageSize={pageSize}
          totalCount={totalCount}
          visibleCount={scans.length}
          searchParams={{ email: activeEmail, q: activeQuery, status: activeStatus }}
        />
        <div className="w-full max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200">
          <table className="min-w-[1535px] table-fixed text-left text-xs">
            <colgroup>
              <col style={{ width: "100px" }} /><col style={{ width: "165px" }} /><col style={{ width: "170px" }} />
              <col style={{ width: "150px" }} /><col style={{ width: "70px" }} /><col style={{ width: "60px" }} />
              <col style={{ width: "210px" }} /><col style={{ width: "110px" }} /><col style={{ width: "80px" }} />
              <col style={{ width: "65px" }} /><col style={{ width: "100px" }} /><col style={{ width: "65px" }} />
              <col style={{ width: "160px" }} /><col style={{ width: "78px" }} />
            </colgroup>
            <thead className="sticky top-0 z-20 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
              <tr>
                {[
                  { label: "Status", className: "sticky left-0 z-30 bg-slate-50" },
                  { label: "Requester / IP" }, { label: "Requested" }, { label: "Site" },
                  { label: "Score" }, { label: "Top" }, { label: "Privacy / CMP" }, { label: "Access" },
                  { label: "Time" }, { label: "From" }, { label: "Freshness" }, { label: "Language" }, { label: "Industry" },
                  { label: "Open", className: "sticky right-0 z-30 bg-slate-50" }
                ].map(({ label, className }) => <th key={label} className={`border-b border-slate-200 px-2.5 py-1.5 font-semibold ${className ?? ""}`}>{label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
              {scans.map((scan) => {
                const provenance = classifyAdminRequestProvenance({
                  organizationName: scan.organizationName,
                  requestChannel: scan.requestChannel,
                  requesterIp: scan.requesterIp,
                  source: scan.source
                });
                const status = getOperationalStatus(scan);
                const freshness = getScanFreshnessBadge(scan);
                const duration = scan.rowKind === "scan" ? formatAdminScanDuration(scan) : null;
                const scanFromMarker = getScanFromMarkerInput(scan.scanFromValue);
                return (
                  <tr key={scan.activityId} className="group h-[52px] hover:bg-slate-50/70">
                    <td className="sticky left-0 z-10 bg-white px-2.5 py-1.5 group-hover:bg-slate-50" title={status.label}><span className="inline-flex items-center gap-1.5 font-semibold"><span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${status.className}`} /><span className={status.label === "No-go" ? "text-rose-700" : "text-slate-700"}>{status.label}</span></span></td>
                    <td className="px-2.5 py-1.5"><span className={`inline-flex max-w-full truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${provenance.className}`} title={scan.requesterName ?? provenance.label}>{scan.requesterName ?? provenance.label}</span><p className="mt-0.5 truncate font-mono text-[10px] text-slate-500" title={scan.requesterIp ?? "Not recorded"}>{scan.requesterIp ?? "IP not recorded"}</p></td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-[11px] leading-4 text-slate-600">{formatAdminDateTime(scan.requestedAt ?? scan.createdAt)}</td>
                    <td className="px-2.5 py-1.5">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="min-w-0 flex-1 truncate font-semibold text-slate-900" title={scan.domainHostname ?? scan.requestedUrl ?? "Unknown target"}>{scan.domainHostname ?? scan.requestedUrl ?? "Unknown target"}</p>
                        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">{scan.scanType}</span>
                      </div>
                      <p className="truncate font-mono text-[10px] text-slate-400" title={scan.linkedScanId ?? scan.scanId}>scan_id {scan.linkedScanId ?? scan.scanId}</p>
                    </td>
                    <td className="px-2.5 py-1.5"><span className="text-sm font-semibold text-slate-950">{scan.certscoreOverall ?? "—"}</span>{scan.certscoreOverall !== null ? <span className="text-slate-400">/100</span> : null}</td>
                    <td className="px-2.5 py-1.5"><span className="text-sm font-semibold text-slate-950">{scan.topFindingCount ?? "—"}</span></td>
                    <td className="px-2.5 py-1.5"><p className="whitespace-nowrap">Privacy {scan.privacyPolicyPresent === true ? "✓" : scan.privacyPolicyPresent === false ? "—" : "?"}</p><p className="truncate text-slate-500" title={scan.cmpVendorName ?? undefined}>CMP {scan.cmpVendorName ?? "—"}</p></td>
                    <td className="px-2.5 py-1.5"><span className={status.label === "No-go" || status.label === "Failed" ? "font-semibold text-rose-700" : "text-slate-700"}>{getAccessLabel(scan)}</span>{scan.interruptionLabel ? <p className="truncate text-[10px] text-slate-400" title={scan.interruptionReason ?? undefined}>{scan.interruptionLabel}</p> : null}</td>
                    <td className={`px-2.5 py-1.5 font-medium ${duration && (duration.includes("m") || Number.parseFloat(duration) > 60) ? "text-amber-700" : "text-slate-800"}`}>{duration ?? (scan.status === "running" ? "Running" : "—")}</td>
                    <td className="px-2.5 py-1.5" title={scan.scanFromLabel}><span aria-label={scan.scanFromLabel} className="inline-flex"><ScanFromMarker flag={"flag" in scanFromMarker ? scanFromMarker.flag : undefined} icon={"icon" in scanFromMarker ? scanFromMarker.icon : undefined} selected /></span></td>
                    <td className="px-2.5 py-1.5"><span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${freshness.className}`}>{freshness.label}</span></td>
                    <td className="px-2.5 py-1.5 font-medium uppercase text-slate-700">{scan.primaryLanguage ?? "—"}</td>
                    <td className="truncate px-2.5 py-1.5 text-slate-700" title={scan.industry ?? undefined}>{scan.industry ?? "—"}</td>
                    <td className="sticky right-0 z-10 border-l border-slate-100 bg-white px-2 py-1.5 group-hover:bg-slate-50">{scan.linkedScanId && scan.scanViewHref ? <AdminScanActions compact scanId={scan.linkedScanId} scanViewHref={scan.scanViewHref} /> : <span className="text-slate-400">—</span>}</td>
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
