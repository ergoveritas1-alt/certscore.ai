import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SCAN_FROM_VALUES, formatScanFromLabel } from "@website-signal-risk-scanner/shared";
import { getScanFromMarkerInput, ScanFromMarker } from "../../../../components/scans/scan-from-icons";
import { PaginationControls, normalizePage, normalizePageSize } from "../../../../components/ui/pagination-controls";
import { formatAdminDateTime } from "../../../../lib/admin/date-time";
import { classifyAdminRequestProvenance } from "../../../../lib/admin/request-provenance";
import { ADMIN_API_ROUTES, type AdminApiRoute } from "../../../../lib/admin/api-route";
import { getAdminAuthenticatedScanHref } from "../../../../server/admin/admin-scan-links";
import { getAdminPulseFilterOptions, getAdminPulseOverviewCounts, listAdminPulseRequestsPage, type AdminPulseRequestStatus } from "../../../../server/admin/list-pulse-requests";
import { withServerTiming } from "../../../../server/performance/log-server-timing";
import { AdminNavigationProvider, AdminReportLink } from "../scans/admin-scan-actions";
import { AdminScansFilterForm } from "../scans/admin-scans-filter-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const statuses = ["queued", "running", "finalizing", "completed", "completed_limited", "failed", "expired", "rate_limited", "no_go"] as const;
const freshnesses = ["any", "fresh", "forced_fresh", "reused"] as const;
const accessValues = ["any", "clear", "blocked", "captcha", "robots_limited", "limited", "unknown"] as const;
const timeSpans = ["all", "4h", "12h", "24h", "7d", "31d"] as const;

type AdminPulsePageProps = {
  searchParams?: Promise<{ page?: string; perPage?: string; q?: string; status?: string; route?: string; freshness?: string; access?: string; outcome?: string; language?: string; industry?: string; scanFrom?: string; timeSpan?: string }>;
};

function normalizeStatus(value: string | undefined): AdminPulseRequestStatus | null {
  return statuses.includes(value as AdminPulseRequestStatus) ? (value as AdminPulseRequestStatus) : null;
}

function normalizeRoute(value: string | undefined): AdminApiRoute | null {
  return ADMIN_API_ROUTES.includes(value as AdminApiRoute) ? value as AdminApiRoute : null;
}

function normalizeQuery(value: string | undefined) {
  const query = value?.trim().slice(0, 160) ?? "";
  return query || null;
}

function normalizeOption(value: string | undefined, options: readonly string[], fallback: string) {
  return options.includes(value ?? "") ? value ?? fallback : fallback;
}

function formatLabel(value: string | null) {
  return value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "—";
}

function sourceIpLabel(request: { sourceIp: string | null; sourceIpHash: string | null }) {
  if (request.sourceIp) return request.sourceIp;
  if (request.sourceIpHash) return `Hash ${request.sourceIpHash.slice(0, 12)}`;
  return "IP not recorded";
}

function statusIndicator(request: { status: string; noGoFlag: boolean }) {
  if (request.noGoFlag) return { className: "bg-rose-500", label: "No-go" };
  const status = request.status;
  if (status === "completed") return { className: "bg-emerald-500", label: "Completed" };
  if (status === "completed_limited") return { className: "bg-amber-400", label: "Completed limited" };
  if (status === "failed" || status === "expired" || status === "rate_limited") return { className: "bg-rose-500", label: formatLabel(status) };
  return { className: "bg-sky-400", label: formatLabel(status) };
}

function routeClass(route: string) {
  if (route === "MCP") return "bg-violet-50 text-violet-700 ring-violet-100";
  if (route === "SDK") return "bg-cyan-50 text-cyan-700 ring-cyan-100";
  if (route === "Pulse") return "bg-sky-50 text-sky-700 ring-sky-100";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function freshnessLabel(value: string | null, forced: boolean | null) {
  if (forced) return "Forced fresh";
  if (value === "latest") return "Latest";
  if (value === "refresh") return "Refresh";
  return formatLabel(value);
}

function outcomeLabel(value: string | null, noGo: boolean) {
  return value ? `${formatLabel(value)} (${noGo ? "No-go" : "Go"})` : "—";
}

function accessLabel(request: {
  accessPostureClass: string | null;
  adminSummaryGeneratedAt: string | null;
  blockedFlag: boolean | null;
  captchaFlag: boolean | null;
  noGoFlag: boolean;
  noGoReason: string | null;
}) {
  if (request.captchaFlag) return "CAPTCHA";
  if (request.blockedFlag || request.accessPostureClass === "early_loss") return "Blocked";
  if (request.noGoFlag) return request.noGoReason ?? "No-go";
  if (request.accessPostureClass === "robots_limited") return "Robots-limited";
  if (request.accessPostureClass === "degraded_but_useful") return "Limited";
  return request.accessPostureClass || request.adminSummaryGeneratedAt ? "Clear" : "—";
}

export default async function AdminPulsePage({ searchParams }: AdminPulsePageProps) {
  const resolved = searchParams ? await searchParams : {};
  const activeStatus = normalizeStatus(resolved.status);
  const activeRoute = normalizeRoute(resolved.route);
  const activeQuery = normalizeQuery(resolved.q);
  const activeFreshness = normalizeOption(resolved.freshness, freshnesses, "any");
  const activeAccess = normalizeOption(resolved.access, accessValues, "any");
  const activeOutcome = resolved.outcome?.trim().slice(0, 120) ?? "";
  const activeLanguage = resolved.language?.trim().slice(0, 80) ?? "";
  const activeIndustry = resolved.industry?.trim().slice(0, 200) ?? "";
  const activeScanFrom = SCAN_FROM_VALUES.includes(resolved.scanFrom as typeof SCAN_FROM_VALUES[number]) ? resolved.scanFrom as typeof SCAN_FROM_VALUES[number] : "any";
  const activeTimeSpan = normalizeOption(resolved.timeSpan, timeSpans, "all") as typeof timeSpans[number];
  const hasFilters = Boolean(activeQuery) || Boolean(activeStatus) || Boolean(activeRoute) || activeFreshness !== "any" || activeAccess !== "any" || Boolean(activeOutcome) || Boolean(activeLanguage) || Boolean(activeIndustry) || activeScanFrom !== "any" || activeTimeSpan !== "all";
  const pageSize = normalizePageSize(resolved.perPage);
  const page = normalizePage(resolved.page);
  const requestListInput = { limit: pageSize, offset: (page - 1) * pageSize, query: activeQuery, status: activeStatus, route: activeRoute, freshness: activeFreshness, access: activeAccess, outcome: activeOutcome, language: activeLanguage, industry: activeIndustry, scanFrom: activeScanFrom, timeSpan: activeTimeSpan };
  const [counts, filterOptions, requestPage] = await withServerTiming("app.admin.api_activity", () => Promise.all([
    getAdminPulseOverviewCounts(),
    getAdminPulseFilterOptions(),
    listAdminPulseRequestsPage(requestListInput)
  ]));
  const filteredTotal = requestPage.totalCount;
  const requests = requestPage.items;
  const pageCount = Math.max(1, Math.ceil(filteredTotal / pageSize));

  return (
    <AdminNavigationProvider>
    <Card className="border-slate-200 bg-white">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <CardTitle>API Activity</CardTitle>
            <p className="text-sm text-slate-500">Logical programmatic requests across Pulse, MCP, SDK, and other integrations. Caller IP is the client or server that reached CertScore—not the scanned site. SDK/MCP result-fetch follow-ups are grouped with their initiating request.</p>
          </div>
          <p className="text-sm text-slate-500">
            {counts.total} requests · {counts.completed} completed · {counts.queuedOrRunning} active · {counts.rateLimited} rate limited
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <AdminScansFilterForm basePath="/app/admin/pulse" clearHref="/app/admin/pulse" hasFilters={hasFilters}>
          <input aria-label="Filter by domain, scan ID, email, requester, or IP; use field not-equal syntax to exclude" className="h-10 min-w-[28rem] flex-[1_1_32rem] rounded-lg border border-slate-300 bg-white px-3 text-sm" defaultValue={activeQuery ?? ""} name="q" placeholder="Domain, scan_id, email, requester, IP · exclude: ip!=66.*" />
          <select aria-label="Filter API activity by status" className="h-10 w-[8rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeStatus ?? ""} name="status"><option value="">Any status</option>{statuses.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}</select>
          <select aria-label="Filter API activity by request route" className="h-10 w-[8rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeRoute ?? ""} name="route"><option value="">Any route</option>{ADMIN_API_ROUTES.map((route) => <option key={route} value={route}>{route}</option>)}</select>
          <select aria-label="Filter API activity by freshness" className="h-10 w-[8rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeFreshness} name="freshness"><option value="any">Any freshness</option>{freshnesses.slice(1).map((freshness) => <option key={freshness} value={freshness}>{freshness === "forced_fresh" ? "Forced fresh" : freshness === "reused" ? "Reused <24h" : "Fresh"}</option>)}</select>
          <select aria-label="Filter API activity by access posture" className="h-10 w-[8rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeAccess} name="access"><option value="any">Any access</option>{accessValues.slice(1).map((access) => <option key={access} value={access}>{access === "robots_limited" ? "Robots-limited" : access === "captcha" ? "CAPTCHA" : formatLabel(access)}</option>)}</select>
          <select aria-label="Filter API activity by outcome" className="h-10 w-[12rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeOutcome} name="outcome"><option value="">Any outcome</option>{filterOptions.outcomes.map((outcome) => <option key={outcome} value={outcome}>{outcomeLabel(outcome, outcome.startsWith("reachability_blocked") || ["robots_restricted", "transport_failure", "timeout_navigation", "unknown_access_limitation", "domain_inactive_or_unstable"].includes(outcome))}</option>)}</select>
          <select aria-label="Filter API activity by language" className="h-10 w-[7rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeLanguage} name="language"><option value="">Any language</option>{filterOptions.languages.map((language) => <option key={language} value={language}>{language}</option>)}</select>
          <select aria-label="Filter API activity by industry" className="h-10 w-[10.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeIndustry} name="industry"><option value="">Any industry</option>{filterOptions.industries.map((industry) => <option key={industry} value={industry}>{industry}</option>)}</select>
          <select aria-label="Filter API activity by origin" className="h-10 w-[7.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeScanFrom} name="scanFrom"><option value="any">Any origin</option>{SCAN_FROM_VALUES.map((scanFrom) => <option key={scanFrom} value={scanFrom}>{formatScanFromLabel(scanFrom)}</option>)}</select>
          <select aria-label="Filter API activity by time span" className="h-10 w-[8.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeTimeSpan} name="timeSpan">{timeSpans.map((timeSpan) => <option key={timeSpan} value={timeSpan}>{timeSpan === "all" ? "All time" : timeSpan === "4h" ? "Past 4 hours" : timeSpan === "12h" ? "Past 12 hours" : timeSpan === "24h" ? "Past 24 hours" : timeSpan === "7d" ? "Past 7 days" : "Past 31 days"}</option>)}</select>
        </AdminScansFilterForm>

        <PaginationControls
          basePath="/app/admin/pulse"
          itemLabel="API requests"
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          searchParams={{ q: activeQuery, status: activeStatus, route: activeRoute, freshness: activeFreshness, access: activeAccess, outcome: activeOutcome, language: activeLanguage, industry: activeIndustry, scanFrom: activeScanFrom, timeSpan: activeTimeSpan }}
          showPageJump
          totalCount={filteredTotal}
          visibleCount={requests.length}
        />

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="table-fixed text-left text-xs" style={{ minWidth: "1920px" }}>
            <colgroup>
              <col style={{ width: "40px" }} /><col style={{ width: "70px" }} /><col style={{ width: "175px" }} />
              <col style={{ width: "140px" }} /><col style={{ width: "165px" }} /><col style={{ width: "70px" }} /><col style={{ width: "75px" }} />
              <col style={{ width: "60px" }} /><col style={{ width: "210px" }} /><col style={{ width: "110px" }} />
              <col style={{ width: "75px" }} /><col style={{ width: "180px" }} /><col style={{ width: "55px" }} /><col style={{ width: "100px" }} />
              <col style={{ width: "65px" }} /><col style={{ width: "160px" }} /><col style={{ width: "120px" }} />
              <col style={{ width: "130px" }} /><col style={{ width: "70px" }} />
            </colgroup>
            <thead className="sticky top-0 z-20 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
              <tr>
                {[
                  { label: "Status", className: "sticky left-0 z-30 bg-slate-50" }, { label: "Route" },
                  { label: "Requester / caller IP" }, { label: "Requested" }, { label: "Site" }, { label: "Tranco" },
                  { label: "Score" }, { label: "Top" }, { label: "Privacy / CMP" }, { label: "Access" },
                  { label: "Time" }, { label: "Outcome" }, { label: "From" }, { label: "Freshness" }, { label: "Language" },
                  { label: "Industry" }, { label: "Mode" }, { label: "Usage" },
                  { label: "Open", className: "sticky right-0 z-30 bg-slate-50" }
                ].map(({ label, className }) => <th className={`border-b border-slate-200 px-2.5 py-1.5 font-semibold ${className ?? ""}`} key={label}>{label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
              {requests.map((request) => {
                const provenance = classifyAdminRequestProvenance({
                  requestChannel: request.requestChannel,
                  requestedByAnonymous: request.requestedByAnonymous,
                  requesterName: request.requesterName,
                  requesterIp: request.sourceIp ?? request.sourceIpHash
                });
                const status = statusIndicator(request);
                const marker = getScanFromMarkerInput(request.scanFromValue);
                const scanReportHref = getAdminAuthenticatedScanHref(request.scanId);
                const openHref = scanReportHref || `/app/admin/pulse/${request.publicId}`;
                return (
                  <tr className="group h-[52px] hover:bg-slate-50/70" key={request.publicId}>
                    <td className="sticky left-0 z-10 bg-white px-2.5 py-1.5 group-hover:bg-slate-50" title={status.label}><span className="inline-flex items-center gap-1.5 font-semibold"><span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${status.className}`} /><span className={status.label === "No-go" ? "text-rose-700" : "text-slate-700"}>{status.label}</span></span></td>
                    <td className="px-2.5 py-1.5"><span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${routeClass(request.apiRoute)}`}>{request.apiRoute}</span></td>
                    <td className="px-2.5 py-1.5"><span className={`inline-flex max-w-full truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${provenance.className}`} title={request.requesterName ?? provenance.label}>{request.requesterName ?? provenance.label}</span><p className="mt-0.5 truncate font-mono text-[10px] text-slate-500" title={`${sourceIpLabel(request)} · ${request.sourceIpSource.replaceAll("_", " ")}`}>{sourceIpLabel(request)}</p></td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-[11px] leading-4 text-slate-600">{formatAdminDateTime(request.requestedAt)}</td>
                    <td className="px-2.5 py-1.5"><p className="truncate font-semibold text-slate-900" title={request.normalizedDomain ?? undefined}>{request.normalizedDomain ?? "Unknown"}</p><p className="truncate font-mono text-[10px] text-slate-400" title={request.publicId}>{request.publicId}</p></td>
                    <td className="px-2.5 py-1.5 font-medium text-slate-700">{request.trancoRank ? `#${request.trancoRank.toLocaleString()}` : "—"}</td>
                    <td className="px-2.5 py-1.5 font-semibold text-slate-900">{request.score !== null ? <><span>{request.score}</span><span className="text-[11px] font-normal text-slate-400">/100</span></> : "—"}</td>
                    <td className="px-2.5 py-1.5 font-semibold text-slate-900">{request.topFindingCount ?? "—"}</td>
                    <td className="px-2.5 py-1.5"><p className="whitespace-nowrap">Privacy {request.privacyPolicyPresent === true ? "✓" : request.privacyPolicyPresent === false ? "—" : "?"}</p><p className="truncate text-slate-500" title={request.cmpVendorName ?? undefined}>CMP {request.cmpVendorName ?? "—"}</p></td>
                    <td className="truncate px-2.5 py-1.5 font-medium text-slate-700" title={request.noGoReason ?? undefined}>{accessLabel(request)}</td>
                    <td className="px-2.5 py-1.5 font-medium text-slate-800">{request.elapsedSeconds !== null ? `${Number.isInteger(Math.round(request.elapsedSeconds * 10) / 10) ? Math.round(request.elapsedSeconds * 10) / 10 : (Math.round(request.elapsedSeconds * 10) / 10).toFixed(1)}s` : "—"}</td>
                    <td className="truncate px-2.5 py-1.5 text-slate-700" title={request.scanOutcome ?? undefined}>{outcomeLabel(request.scanOutcome, request.noGoFlag)}</td>
                    <td className="px-2.5 py-1.5" title={request.scanFromLabel}><span aria-label={request.scanFromLabel} className="inline-flex"><ScanFromMarker flag={"flag" in marker ? marker.flag : undefined} icon={"icon" in marker ? marker.icon : undefined} selected /></span></td>
                    <td className="px-2.5 py-1.5"><span className="inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">{freshnessLabel(request.freshness, request.freshRescanRequested)}</span></td>
                    <td className="px-2.5 py-1.5 font-medium uppercase text-slate-700" title={request.primaryLanguage ? `${request.primaryLanguageConfidence ?? "unknown"} confidence · ${(request.primaryLanguageSource ?? "unknown").replaceAll("_", " ")}` : "No reliable retained language evidence"}>{request.primaryLanguage ?? "—"}</td>
                    <td className="truncate px-2.5 py-1.5 text-slate-700" title={request.industry ?? undefined}>{request.industry ?? "—"}</td>
                    <td className="px-2.5 py-1.5"><p className="font-medium text-slate-800">{formatLabel(request.detail)}</p><p className="text-[10px] text-slate-500">{formatLabel(request.format)}</p></td>
                    <td className="px-2.5 py-1.5"><p>{request.feedbackCount} feedback</p><p className="text-[10px] text-slate-500">JSON {request.summaryJsonDownloads + request.evidenceJsonDownloads}</p></td>
                    <td className="sticky right-0 z-10 border-l border-slate-100 bg-white px-2 py-1.5 text-center group-hover:bg-slate-50"><AdminReportLink ariaLabel={scanReportHref ? `Open scan report ${request.scanId}` : `Open API request ${request.publicId}`} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white font-semibold text-sky-700" href={openHref}>→</AdminReportLink></td>
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
