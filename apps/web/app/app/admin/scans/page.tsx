import Link from "next/link";
import { SCAN_FROM_VALUES, formatScanFromLabel } from "@website-signal-risk-scanner/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { getScanFromMarkerInput, ScanFromMarker } from "../../../../components/scans/scan-from-icons";
import { PaginationControls, normalizePage, normalizePageSize } from "../../../../components/ui/pagination-controls";
import { formatAdminDateTime } from "../../../../lib/admin/date-time";
import { classifyAdminRequestProvenance } from "../../../../lib/admin/request-provenance";
import { getAdminScanFilterOptions, getAdminScanOverviewMetrics, listAdminScansPage, type AdminScanListAccess, type AdminScanListFreshness, type AdminScanListItem, type AdminScanListStatus, type AdminScanListTimeSpan } from "../../../../server/admin/list-admin-scans";
import { withServerTiming } from "../../../../server/performance/log-server-timing";
import { AdminNavigationProvider, AdminScanActions } from "./admin-scan-actions";
import { AdminScansAutoRefresh } from "./admin-scans-auto-refresh";
import { AdminScansFilterForm } from "./admin-scans-filter-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AdminScansPageProps = {
  searchParams?: Promise<{ page?: string; perPage?: string; q?: string; status?: string; freshness?: string; access?: string; outcome?: string; language?: string; industry?: string; scanFrom?: string; timeSpan?: string }>;
};

const statuses = ["any", "no_go", "failed", "running", "queued", "limited", "completed"] as const;
const freshnesses = ["any", "fresh", "forced_fresh", "reused"] as const;
const accessValues = ["any", "clear", "blocked", "captcha", "robots_limited", "limited", "unknown"] as const;
const timeSpans = ["all", "4h", "12h", "24h", "7d", "31d"] as const;
function normalizeStatus(value: string | undefined): AdminScanListStatus {
  return statuses.includes(value as AdminScanListStatus) ? value as AdminScanListStatus : "any";
}
function normalizeFreshness(value: string | undefined): AdminScanListFreshness {
  return freshnesses.includes(value as AdminScanListFreshness) ? value as AdminScanListFreshness : "any";
}
function normalizeTimeSpan(value: string | undefined): AdminScanListTimeSpan {
  return timeSpans.includes(value as AdminScanListTimeSpan) ? value as AdminScanListTimeSpan : "all";
}
function normalizeAccess(value: string | undefined): AdminScanListAccess {
  return accessValues.includes(value as AdminScanListAccess) ? value as AdminScanListAccess : "any";
}

function formatFilterLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatScanOutcome(value: string | null, noGo: boolean) {
  if (!value) return "—";
  return `${formatFilterLabel(value)} (${noGo ? "No-go" : "Go"})`;
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
  if (scan.noGoFlag || scan.accessPostureClass === "early_loss" || scan.blockedFlag || scan.captchaFlag) {
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
  if (scan.noGoFlag) {
    const category = scan.noGoLimitationKind === "scanner_access_limitation"
      ? "Access"
      : scan.noGoLimitationKind === "scanner_capture_limitation"
        ? "Capture"
        : scan.noGoLimitationKind === "target_site_state"
          ? "Target"
          : "No-go";
    return `${category} · ${scan.interruptionLabel ?? scan.noGoReason ?? "No-go"}`;
  }
  if (scan.captchaFlag) return "CAPTCHA";
  if (scan.blockedFlag || scan.accessPostureClass === "early_loss") return scan.homepageFetchHttpStatus ? `Blocked · ${scan.homepageFetchHttpStatus}` : "Blocked";
  if (scan.accessPostureClass === "robots_limited") return "Robots-limited";
  if (scan.accessPostureClass === "degraded_but_useful") return "Limited";
  return scan.rowKind === "scan" ? "Clear" : "—";
}

function requesterIpLabel(scan: Pick<AdminScanListItem, "requesterIp" | "requesterIpHash">) {
  if (scan.requesterIp) return scan.requesterIp;
  if (scan.requesterIpHash) return `Hash ${scan.requesterIpHash.slice(0, 12)}`;
  return "IP not recorded";
}

export default async function AdminScansPage({ searchParams }: AdminScansPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const currentPage = normalizePage(resolvedSearchParams.page);
  const pageSize = normalizePageSize(resolvedSearchParams.perPage);
  const activeQuery = resolvedSearchParams.q?.trim().slice(0, 160) ?? "";
  const activeStatus = normalizeStatus(resolvedSearchParams.status);
  const activeFreshness = normalizeFreshness(resolvedSearchParams.freshness);
  const activeAccess = normalizeAccess(resolvedSearchParams.access);
  const activeOutcome = resolvedSearchParams.outcome?.trim().slice(0, 120) ?? "";
  const activeLanguage = resolvedSearchParams.language?.trim().slice(0, 80) ?? "";
  const activeIndustry = resolvedSearchParams.industry?.trim().slice(0, 200) ?? "";
  const activeScanFrom = SCAN_FROM_VALUES.includes(resolvedSearchParams.scanFrom as typeof SCAN_FROM_VALUES[number]) ? resolvedSearchParams.scanFrom as typeof SCAN_FROM_VALUES[number] : "any";
  const activeTimeSpan = normalizeTimeSpan(resolvedSearchParams.timeSpan);
  const hasFilters = Boolean(activeQuery) || activeStatus !== "any" || activeFreshness !== "any" || activeAccess !== "any" || Boolean(activeOutcome) || Boolean(activeLanguage) || Boolean(activeIndustry) || activeScanFrom !== "any" || activeTimeSpan !== "all";
  const [scanMetrics, filterOptions, scanPage] = await Promise.all([
    withServerTiming("app.admin.scans.metrics", () => getAdminScanOverviewMetrics()),
    withServerTiming("app.admin.scans.filter-options", () => getAdminScanFilterOptions()),
    withServerTiming("app.admin.scans.list", () => listAdminScansPage(pageSize, (currentPage - 1) * pageSize, {
      query: activeQuery || null,
      status: activeStatus,
      freshness: activeFreshness,
      access: activeAccess,
      outcome: activeOutcome || null,
      language: activeLanguage || null,
      industry: activeIndustry || null,
      scanFrom: activeScanFrom === "any" ? null : activeScanFrom,
      timeSpan: activeTimeSpan
    }))
  ]);
  const totalCount = scanPage.totalCount;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const normalizedPage = Math.min(currentPage, totalPages);
  const scans = scanPage.items;
  const hasActiveScans = scans.some((scan) => scan.status === "queued" || scan.status === "running");

  return (
    <AdminNavigationProvider>
    <Card className="min-w-0 overflow-hidden border-slate-200 bg-white">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Scan Admin</CardTitle>
            <p className="text-sm text-slate-500">Requester IP identifies who reached CertScore. Scanner egress identifies the outbound runtime that reached the target site.</p>
          </div>
          <p className="text-sm text-slate-500">
            {scanMetrics.totalPhysicalScans} runs · {scanMetrics.totalScanRequests} requests
          </p>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3 pt-0">
        <AdminScansAutoRefresh hasActiveScans={hasActiveScans} />
        <AdminScansFilterForm hasFilters={hasFilters}>
          <input aria-label="Filter by domain, scan ID, email, requester, IP, or source; use field not-equal syntax to exclude" className="h-10 min-w-[28rem] flex-[1_1_32rem] rounded-lg border border-slate-300 bg-white px-3 text-sm" defaultValue={activeQuery} name="q" placeholder="Domain, scan_id, email, requester, IP · source:homepage-anonymous · ip!=66.*" />
          <select aria-label="Filter scans by status" className="h-10 w-[7.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeStatus} name="status">{statuses.map((status) => <option key={status} value={status}>{status === "any" ? "Any status" : formatFilterLabel(status)}</option>)}</select>
          <select aria-label="Filter scans by freshness" className="h-10 w-[8rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeFreshness} name="freshness">{freshnesses.map((freshness) => <option key={freshness} value={freshness}>{freshness === "any" ? "Any freshness" : freshness === "fresh" ? "Fresh" : freshness === "forced_fresh" ? "Forced fresh" : "Reused <24h"}</option>)}</select>
          <select aria-label="Filter scans by access posture" className="h-10 w-[8rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeAccess} name="access"><option value="any">Any access</option>{accessValues.slice(1).map((access) => <option key={access} value={access}>{access === "robots_limited" ? "Robots-limited" : access === "captcha" ? "CAPTCHA" : formatFilterLabel(access)}</option>)}</select>
          <select aria-label="Filter scans by outcome" className="h-10 w-[12rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeOutcome} name="outcome"><option value="">Any outcome</option>{filterOptions.outcomes.map((outcome) => <option key={outcome} value={outcome}>{formatScanOutcome(outcome, outcome.startsWith("reachability_blocked") || ["robots_restricted", "transport_failure", "timeout_navigation", "unknown_access_limitation", "domain_inactive_or_unstable"].includes(outcome))}</option>)}</select>
          <select aria-label="Filter scans by language" className="h-10 w-[7rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeLanguage} name="language"><option value="">Any language</option>{filterOptions.languages.map((language) => <option key={language} value={language}>{language}</option>)}</select>
          <select aria-label="Filter scans by industry" className="h-10 w-[10.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeIndustry} name="industry"><option value="">Any industry</option>{filterOptions.industries.map((industry) => <option key={industry} value={industry}>{industry}</option>)}</select>
          <select aria-label="Filter scans by origin" className="h-10 w-[7.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeScanFrom} name="scanFrom"><option value="any">Any origin</option>{SCAN_FROM_VALUES.map((scanFrom) => <option key={scanFrom} value={scanFrom}>{formatScanFromLabel(scanFrom)}</option>)}</select>
          <select aria-label="Filter scans by time span" className="h-10 w-[8.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeTimeSpan} name="timeSpan">{timeSpans.map((timeSpan) => <option key={timeSpan} value={timeSpan}>{timeSpan === "all" ? "All time" : timeSpan === "4h" ? "Past 4 hours" : timeSpan === "12h" ? "Past 12 hours" : timeSpan === "24h" ? "Past 24 hours" : timeSpan === "7d" ? "Past 7 days" : "Past 31 days"}</option>)}</select>
        </AdminScansFilterForm>
        <PaginationControls
          basePath="/app/admin/scans"
          itemLabel="scan activity items"
          page={normalizedPage}
          pageCount={totalPages}
          pageSize={pageSize}
          totalCount={totalCount}
          visibleCount={scans.length}
          searchParams={{ q: activeQuery, status: activeStatus, freshness: activeFreshness, access: activeAccess, outcome: activeOutcome, language: activeLanguage, industry: activeIndustry, scanFrom: activeScanFrom, timeSpan: activeTimeSpan }}
          showPageJump
        />
        <div className="w-full max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200">
          <table className="min-w-[1860px] table-fixed text-left text-xs">
            <colgroup>
              <col style={{ width: "100px" }} /><col style={{ width: "165px" }} /><col style={{ width: "190px" }} /><col style={{ width: "170px" }} />
              <col style={{ width: "150px" }} /><col style={{ width: "70px" }} /><col style={{ width: "60px" }} /><col style={{ width: "75px" }} />
              <col style={{ width: "210px" }} /><col style={{ width: "110px" }} /><col style={{ width: "80px" }} />
              <col style={{ width: "180px" }} /><col style={{ width: "65px" }} /><col style={{ width: "100px" }} /><col style={{ width: "65px" }} />
              <col style={{ width: "160px" }} /><col style={{ width: "78px" }} />
            </colgroup>
            <thead className="sticky top-0 z-20 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
              <tr>
                {[
                  { label: "Status", className: "sticky left-0 z-30 bg-slate-50" },
                  { label: "Requester IP" }, { label: "Scanner egress" }, { label: "Requested" }, { label: "Site" }, { label: "Tranco" },
                  { label: "Score" }, { label: "Top" }, { label: "Privacy / CMP" }, { label: "Access" },
                  { label: "Time" }, { label: "Outcome" }, { label: "From" }, { label: "Freshness" }, { label: "Language" }, { label: "Industry" },
                  { label: "Open", className: "sticky right-0 z-30 bg-slate-50" }
                ].map(({ label, className }) => <th key={label} className={`border-b border-slate-200 px-2.5 py-1.5 font-semibold ${className ?? ""}`}>{label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
              {scans.map((scan) => {
                const provenance = classifyAdminRequestProvenance({
                  organizationName: scan.organizationName,
                  requestChannel: scan.requestChannel,
                  requesterIp: scan.requesterIp ?? scan.requesterIpHash,
                  source: scan.source
                });
                const status = getOperationalStatus(scan);
                const freshness = getScanFreshnessBadge(scan);
                const duration = scan.rowKind === "scan" ? formatAdminScanDuration(scan) : null;
                const scanFromMarker = getScanFromMarkerInput(scan.scanFromValue);
                return (
                  <tr key={scan.activityId} className="group h-[52px] hover:bg-slate-50/70">
                    <td className="sticky left-0 z-10 bg-white px-2.5 py-1.5 group-hover:bg-slate-50" title={status.label}><span className="inline-flex items-center gap-1.5 font-semibold"><span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${status.className}`} /><span className={status.label === "No-go" ? "text-rose-700" : "text-slate-700"}>{status.label}</span></span></td>
                    <td className="px-2.5 py-1.5"><span className={`inline-flex max-w-full truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${provenance.className}`} title={scan.requesterName ?? provenance.label}>{scan.requesterName ?? provenance.label}</span><p className="mt-0.5 truncate font-mono text-[10px] text-slate-500" title={`${requesterIpLabel(scan)} · ${scan.requesterIpSource.replaceAll("_", " ")}`}>{requesterIpLabel(scan)}</p></td>
                    <td className="px-2.5 py-1.5"><p className="truncate font-mono text-[10px] text-slate-700" title={scan.scannerEgressId ?? "Scanner egress not recorded"}>{scan.scannerEgressId ?? "Not recorded"}</p><p className="mt-0.5 truncate text-[10px] text-slate-400" title={scan.scannerEgressProvider ?? undefined}>{scan.scannerEgressProvider ?? "Outbound runtime"}</p></td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-[11px] leading-4 text-slate-600">{formatAdminDateTime(scan.requestedAt ?? scan.createdAt)}</td>
                    <td className="px-2.5 py-1.5">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="min-w-0 flex-1 truncate font-semibold text-slate-900" title={scan.domainHostname ?? scan.requestedUrl ?? "Unknown target"}>{scan.domainHostname ?? scan.requestedUrl ?? "Unknown target"}</p>
                        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">{scan.scanType}</span>
                      </div>
                      <p className="truncate font-mono text-[10px] text-slate-400" title={scan.linkedScanId ?? scan.scanId}>scan_id {scan.linkedScanId ?? scan.scanId}</p>
                    </td>
                    <td className="px-2.5 py-1.5 font-medium text-slate-700">{scan.trancoRank ? `#${scan.trancoRank.toLocaleString()}` : "—"}</td>
                    <td className="px-2.5 py-1.5" title={[scan.scoreLabel, scan.scoreVersion, scan.scoreCoverageConfidence ? `${scan.scoreCoverageConfidence} coverage` : null, scan.scoreScoredAt ? `scored ${scan.scoreScoredAt}` : null].filter(Boolean).join(" · ") || undefined}><span className="text-sm font-semibold text-slate-950">{scan.certscoreOverall ?? "—"}</span>{scan.certscoreOverall !== null ? <span className="text-slate-400">/100</span> : null}</td>
                    <td className="px-2.5 py-1.5"><span className="text-sm font-semibold text-slate-950">{scan.topFindingCount ?? "—"}</span></td>
                    <td className="px-2.5 py-1.5"><p className="whitespace-nowrap">Privacy {scan.privacyPolicyPresent === true ? "✓" : scan.privacyPolicyPresent === false ? "—" : "?"}</p><p className="truncate text-slate-500" title={scan.cmpVendorName ?? undefined}>CMP {scan.cmpVendorName ?? "—"}</p></td>
                    <td className="px-2.5 py-1.5"><span className={status.label === "No-go" || status.label === "Failed" ? "font-semibold text-rose-700" : "text-slate-700"}>{getAccessLabel(scan)}</span>{scan.interruptionLabel ? <p className="truncate text-[10px] text-slate-400" title={scan.interruptionReason ?? undefined}>{scan.interruptionLabel}</p> : null}</td>
                    <td className={`px-2.5 py-1.5 font-medium ${duration && (duration.includes("m") || Number.parseFloat(duration) > 60) ? "text-amber-700" : "text-slate-800"}`}>{duration ?? (scan.status === "running" ? "Running" : "—")}</td>
                    <td className="truncate px-2.5 py-1.5 text-slate-700" title={scan.scanOutcome ?? undefined}>{formatScanOutcome(scan.scanOutcome, scan.noGoFlag)}</td>
                    <td className="px-2.5 py-1.5" title={scan.scanFromLabel}><span aria-label={scan.scanFromLabel} className="inline-flex"><ScanFromMarker flag={"flag" in scanFromMarker ? scanFromMarker.flag : undefined} icon={"icon" in scanFromMarker ? scanFromMarker.icon : undefined} selected /></span></td>
                    <td className="px-2.5 py-1.5"><span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${freshness.className}`}>{freshness.label}</span></td>
                    <td className="px-2.5 py-1.5 font-medium uppercase text-slate-700" title={scan.primaryLanguage ? `${scan.primaryLanguageConfidence ?? "unknown"} confidence · ${(scan.primaryLanguageSource ?? "unknown").replaceAll("_", " ")}` : "No reliable retained language evidence"}>{scan.primaryLanguage ?? "—"}</td>
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
    </AdminNavigationProvider>
  );
}
