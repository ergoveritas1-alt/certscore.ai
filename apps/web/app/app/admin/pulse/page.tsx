import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SCAN_FROM_VALUES, formatScanFromLabel } from "@website-signal-risk-scanner/shared";
import { getScanFromMarkerInput, ScanFromMarker } from "../../../../components/scans/scan-from-icons";
import { PaginationControls, normalizePage, normalizePageSize } from "../../../../components/ui/pagination-controls";
import { formatAdminDateTime } from "../../../../lib/admin/date-time";
import { classifyAdminRequestProvenance } from "../../../../lib/admin/request-provenance";
import { ADMIN_API_ROUTES, type AdminApiRoute } from "../../../../lib/admin/api-route";
import { getAdminAuthenticatedScanHref } from "../../../../server/admin/admin-scan-links";
import { getAdminPulseFilterOptions, getAdminPulseOperationalSnapshot, listAdminPulseRequestsPage, type AdminPulseOperationalSnapshotPeriod, type AdminPulseRequestStatus } from "../../../../server/admin/list-pulse-requests";
import { withServerTiming } from "../../../../server/performance/log-server-timing";
import { AdminNavigationProvider, AdminReportLink } from "../scans/admin-scan-actions";
import { AdminScansFilterForm } from "../scans/admin-scans-filter-form";
import { AdminTrafficFilters } from "../../../../components/admin/admin-traffic-filters";
import { AdminOperationalSnapshot } from "../../../../components/admin/admin-operational-snapshot";
import { AdminTableRefreshBoundary } from "../../../../components/admin/admin-table-refresh-boundary";
import { adminOperationalSnapshotDelta, adminOperationalSnapshotHealth, adminOperationalSnapshotHref } from "../../../../lib/admin/admin-operational-snapshot";
import { adminTrafficScopeVisibility, resolveAdminTrafficScope, type AdminTrafficScope } from "../../../../lib/admin/admin-traffic-scope";
import {
  adminPolicyEvidenceDiagnosticTitle,
  adminPolicyEvidenceStageLabel,
  type AdminEvidenceAggregate,
  type AdminEvidenceResult,
  type AdminPolicyEvidenceDiagnostic
} from "../../../../lib/scans/admin-evidence-matrix";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const statuses = ["queued", "running", "finalizing", "completed", "completed_limited", "failed", "expired", "rate_limited", "no_go"] as const;
const freshnesses = ["any", "fresh", "forced_fresh", "reused"] as const;
const accessValues = ["any", "clear", "blocked", "captcha", "robots_limited", "limited", "unknown"] as const;
const timeSpans = ["all", "4h", "12h", "24h", "7d", "31d"] as const;
const snapshotPeriods = ["1h", "24h", "7d", "30d", "1y"] as const;

type AdminPulsePageProps = {
  searchParams?: Promise<{ page?: string; perPage?: string; q?: string; status?: string; route?: string; freshness?: string; access?: string; outcome?: string; language?: string; industry?: string; scanFrom?: string; snapshot?: string; timeSpan?: string; includeCanary?: string; excludeMacMiniScanBot?: string; scanBotFilter?: string; traffic?: string }>;
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

function snapshotNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function snapshotPercentage(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function snapshotDuration(value: number | null) {
  if (value === null) return "—";
  return value >= 60 ? `${(value / 60).toFixed(1)}m` : `${value.toFixed(value < 10 ? 1 : 0)}s`;
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

function formatRequestedDateTime(value: string | null) {
  if (!value) return { date: "Not available", time: "" };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: "Not available", time: "" };
  return {
    date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }).format(parsed),
    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "America/Los_Angeles", timeZoneName: "short" }).format(parsed)
  };
}

const EVIDENCE_MARKS = {
  observed: { mark: "✓", className: "text-emerald-700" },
  gap_observed: { mark: "!", className: "text-rose-700" },
  review_signal: { mark: "△", className: "text-amber-700" },
  not_observed: { mark: "—", className: "text-slate-500" },
  no_match_found: { mark: "—", className: "text-slate-500" },
  not_confirmed: { mark: "?", className: "text-amber-700" },
  not_testable: { mark: "×", className: "text-slate-400" },
  insufficient_evidence: { mark: "×", className: "text-slate-400" },
  out_of_scope: { mark: "·", className: "text-slate-400" }
} as const;

const STATUS_LABELS = {
  observed: "Observed", gap_observed: "Gap observed", review_signal: "Review signal", not_observed: "Not observed",
  no_match_found: "No match found", not_confirmed: "Not confirmed", not_testable: "Not testable", insufficient_evidence: "Insufficient evidence", out_of_scope: "Out of scope"
} as const;

function evidenceTitle(label: string, result: AdminEvidenceResult | null) {
  return result ? `${label}: ${STATUS_LABELS[result.status]} — ${result.descriptor}` : `${label}: not projected for this request`;
}

function EvidenceCode({ code, disposition, label, result }: { code: string; disposition?: string | null; label: string; result: AdminEvidenceResult | null }) {
  const presentation = result ? EVIDENCE_MARKS[result.status] : { mark: "·", className: "text-slate-300" };
  const title = [evidenceTitle(label, result), disposition ? `Pipeline disposition: ${disposition.replaceAll("_", " ")}` : null]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
  return <span className={`whitespace-nowrap font-semibold ${presentation.className}`} title={title}>{code}{presentation.mark}</span>;
}

function EvidenceGroupCell({ aggregate, labels, policyEvidence, results }: { aggregate: AdminEvidenceAggregate | null; labels: Record<string, string>; policyEvidence?: AdminPolicyEvidenceDiagnostic | null; results: Record<string, AdminEvidenceResult | null> | null }) {
  const summary = aggregate && aggregate.projected > 0 ? `${aggregate.observed}/${aggregate.total} ✓ · ${aggregate.review}△ · ${aggregate.concern}!` : "Not projected";
  return <><p className="truncate text-[10px] font-medium text-slate-600" title={policyEvidence ? adminPolicyEvidenceDiagnosticTitle(policyEvidence) : undefined}>{policyEvidence ? `${adminPolicyEvidenceStageLabel(policyEvidence.stage)} · ` : ""}{summary}</p><p className="flex items-center gap-1.5 overflow-hidden text-[10px] leading-4">{Object.entries(labels).map(([code, label]) => <EvidenceCode code={code} disposition={policyEvidence?.topicDispositions?.[code]?.disposition} key={code} label={label} result={results?.[code] ?? null} />)}</p></>;
}

const TRANSPARENCY_LABELS = { CC: "Controller/contact", LB: "Legal basis", DR: "Data retention", PP: "Processing purposes", RC: "Recipients/categories", DS: "Data-subject rights", IT: "International transfers", PC: "Privacy contact", SA: "Supervisory authority", AD: "Automated decisions/profiling" };
const TRANSPORT_LABELS = { HD: "HTTPS delivery", HR: "HTTP redirect", MC: "Mixed content", TC: "TLS certificate", FT: "Form transport" };
const RUNTIME_LABELS = { FP: "Device ID/fingerprinting", SR: "Session replay", IF: "Third-party iframe", SM: "Social media", "3P": "Embedded third-party services" };

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

type AdminPulseFilterState = {
  activeAccess: string;
  activeFreshness: string;
  activeIndustry: string;
  activeLanguage: string;
  activeOutcome: string;
  activeQuery: string | null;
  activeRoute: AdminApiRoute | null;
  activeScanFrom: string;
  activeSnapshotPeriod: AdminPulseOperationalSnapshotPeriod;
  activeStatus: AdminPulseRequestStatus | null;
  activeTimeSpan: (typeof timeSpans)[number];
  hasFilters: boolean;
  trafficScope: AdminTrafficScope;
};

async function AdminPulseFilters({
  activeAccess,
  activeFreshness,
  activeIndustry,
  activeLanguage,
  activeOutcome,
  activeQuery,
  activeRoute,
  activeScanFrom,
  activeSnapshotPeriod,
  activeStatus,
  activeTimeSpan,
  hasFilters,
  trafficScope,
}: AdminPulseFilterState) {
  const filterOptions = await withServerTiming("app.admin.api_activity.filters", () => getAdminPulseFilterOptions());

  return (
    <AdminScansFilterForm basePath="/app/admin/pulse" clearHref="/app/admin/pulse" hasFilters={hasFilters} submitFirst>
      <input name="traffic" type="hidden" value={trafficScope} />
      <input name="snapshot" type="hidden" value={activeSnapshotPeriod} />
      <input
        aria-label="Filter by domain, scan ID, email, requester, or IP; use field not-equal syntax to exclude"
        className="h-10 min-w-[28rem] flex-[1_1_32rem] rounded-lg border border-slate-300 bg-white px-3 text-sm"
        defaultValue={activeQuery ?? ""}
        name="q"
        placeholder="Domain, scan_id, email, requester, IP · exclude: ip!=66.*"
      />
      <select
        aria-label="Filter API activity by status"
        className="h-10 w-[8rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs"
        defaultValue={activeStatus ?? ""}
        name="status"
      >
        <option value="">Any status</option>
        {statuses.map((status) => (
          <option key={status} value={status}>
            {formatLabel(status)}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter API activity by request route"
        className="h-10 w-[8rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs"
        defaultValue={activeRoute ?? ""}
        name="route"
      >
        <option value="">Any route</option>
        {ADMIN_API_ROUTES.map((route) => (
          <option key={route} value={route}>
            {route}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter API activity by freshness"
        className="h-10 w-[8rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs"
        defaultValue={activeFreshness}
        name="freshness"
      >
        <option value="any">Any freshness</option>
        {freshnesses.slice(1).map((freshness) => (
          <option key={freshness} value={freshness}>
            {freshness === "forced_fresh" ? "Forced fresh" : freshness === "reused" ? "Reused <24h" : "Fresh"}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter API activity by access posture"
        className="h-10 w-[8rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs"
        defaultValue={activeAccess}
        name="access"
      >
        <option value="any">Any access</option>
        {accessValues.slice(1).map((access) => (
          <option key={access} value={access}>
            {access === "robots_limited" ? "Robots-limited" : access === "captcha" ? "CAPTCHA" : formatLabel(access)}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter API activity by outcome"
        className="h-10 w-[12rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs"
        defaultValue={activeOutcome}
        name="outcome"
      >
        <option value="">Any outcome</option>
        {filterOptions.outcomes.map((outcome) => (
          <option key={outcome} value={outcome}>
            {outcomeLabel(
              outcome,
              outcome.startsWith("reachability_blocked") ||
                ["robots_restricted", "transport_failure", "timeout_navigation", "unknown_access_limitation", "domain_inactive_or_unstable"].includes(
                  outcome
                )
            )}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter API activity by language"
        className="h-10 w-[7rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs"
        defaultValue={activeLanguage}
        name="language"
      >
        <option value="">Any language</option>
        {filterOptions.languages.map((language) => (
          <option key={language} value={language}>
            {language}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter API activity by industry"
        className="h-10 w-[10.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs"
        defaultValue={activeIndustry}
        name="industry"
      >
        <option value="">Any industry</option>
        {filterOptions.industries.map((industry) => (
          <option key={industry} value={industry}>
            {industry}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter API activity by origin"
        className="h-10 w-[7.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs"
        defaultValue={activeScanFrom}
        name="scanFrom"
      >
        <option value="any">Any origin</option>
        {SCAN_FROM_VALUES.map((scanFrom) => (
          <option key={scanFrom} value={scanFrom}>
            {formatScanFromLabel(scanFrom)}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter API activity by time span"
        className="h-10 w-[8.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs"
        defaultValue={activeTimeSpan}
        name="timeSpan"
      >
        {timeSpans.map((timeSpan) => (
          <option key={timeSpan} value={timeSpan}>
            {timeSpan === "all"
              ? "All time"
              : timeSpan === "4h"
                ? "Past 4 hours"
                : timeSpan === "12h"
                  ? "Past 12 hours"
                  : timeSpan === "24h"
                    ? "Past 24 hours"
                    : timeSpan === "7d"
                      ? "Past 7 days"
                      : "Past 31 days"}
          </option>
        ))}
      </select>
    </AdminScansFilterForm>
  );
}

function AdminPulseFiltersFallback() {
  return <div aria-label="Loading API activity filters" className="h-10 w-full animate-pulse rounded-lg bg-slate-100" />;
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
  const activeSnapshotPeriod = normalizeOption(resolved.snapshot, snapshotPeriods, "24h") as AdminPulseOperationalSnapshotPeriod;
  const trafficScope = resolveAdminTrafficScope(resolved);
  const { includeInternalQa: includeCanary, includeMacMini } = adminTrafficScopeVisibility(trafficScope);
  const excludeMacMiniScanBot = !includeMacMini;
  const hasFilters = Boolean(activeQuery) || Boolean(activeStatus) || Boolean(activeRoute) || activeFreshness !== "any" || activeAccess !== "any" || Boolean(activeOutcome) || Boolean(activeLanguage) || Boolean(activeIndustry) || activeScanFrom !== "any" || activeTimeSpan !== "all";
  const pageSize = normalizePageSize(resolved.perPage);
  const page = normalizePage(resolved.page);
  const requestListInput = { limit: pageSize, offset: (page - 1) * pageSize, query: activeQuery, status: activeStatus, route: activeRoute, freshness: activeFreshness, access: activeAccess, outcome: activeOutcome, language: activeLanguage, industry: activeIndustry, scanFrom: activeScanFrom, timeSpan: activeTimeSpan, includeCanary, excludeMacMiniScanBot };
  const [operationalSnapshot, requestPage] = await Promise.all([
    withServerTiming("app.admin.api_activity.operational_snapshot", () => getAdminPulseOperationalSnapshot(activeSnapshotPeriod, includeCanary, excludeMacMiniScanBot)),
    withServerTiming("app.admin.api_activity.rows", () => listAdminPulseRequestsPage(requestListInput)),
  ]);
  const filteredTotal = requestPage.totalCount;
  const requests = requestPage.items;
  const pageCount = Math.max(1, Math.ceil(filteredTotal / pageSize));
  const requestDelta = adminOperationalSnapshotDelta(operationalSnapshot.metrics.requests, operationalSnapshot.comparison.requests);
  const errorDelta = adminOperationalSnapshotDelta(operationalSnapshot.metrics.errors, operationalSnapshot.comparison.errors, "higher_is_bad");
  const latencyDelta = adminOperationalSnapshotDelta(operationalSnapshot.metrics.p95DurationSeconds ?? 0, operationalSnapshot.comparison.p95DurationSeconds ?? 0, "higher_is_bad");
  const snapshotHref = (values: Record<string, string | null | undefined>) => adminOperationalSnapshotHref("/app/admin/pulse", { snapshot: activeSnapshotPeriod, traffic: trafficScope, ...values });
  const snapshotMetrics = [
    { label: "Requests", value: snapshotNumber(operationalSnapshot.metrics.requests), detail: operationalSnapshot.period.label, definition: "requests" as const, comparison: requestDelta.label, anomaly: requestDelta.anomaly, href: snapshotHref({}) },
    { label: "Actors", value: snapshotNumber(operationalSnapshot.metrics.actors), detail: "identified callers", definition: "actors" as const },
    { label: "Scans", value: snapshotNumber(operationalSnapshot.metrics.scans), detail: "linked scans", definition: "scans" as const },
    { label: "Successful", value: snapshotNumber(operationalSnapshot.metrics.successful), detail: "requests", definition: "successful" as const, href: snapshotHref({ status: "completed" }) },
    { label: "Active", value: snapshotNumber(operationalSnapshot.metrics.active), detail: "requests", definition: "active" as const, href: snapshotHref({ status: "running" }) },
    { label: "Latency", value: `${snapshotDuration(operationalSnapshot.metrics.p50DurationSeconds)} / ${snapshotDuration(operationalSnapshot.metrics.p95DurationSeconds)}`, detail: "p50 / p95", definition: "latency" as const, comparison: latencyDelta.label, anomaly: latencyDelta.anomaly },
  ];
  const snapshotRates = [
    { label: "Success", value: snapshotPercentage(operationalSnapshot.rates.success), href: snapshotHref({ status: "completed" }) },
    { label: "Errors", value: snapshotPercentage(operationalSnapshot.rates.error), href: snapshotHref({ status: "failed" }), anomaly: errorDelta.anomaly },
    { label: "Quota", value: snapshotPercentage(operationalSnapshot.rates.quota), href: snapshotHref({ status: "rate_limited" }) },
    { label: "Reuse", value: snapshotPercentage(operationalSnapshot.rates.reuse), href: snapshotHref({ freshness: "reused" }) },
    { label: "New scans", value: snapshotNumber(operationalSnapshot.metrics.newScans) },
    { label: "Rate limited", value: snapshotNumber(operationalSnapshot.metrics.rateLimited), href: snapshotHref({ status: "rate_limited" }) },
  ];

  return (
    <AdminNavigationProvider>
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">API Activity</h2>
          <p className="text-sm text-slate-500">Logical programmatic requests across Pulse, MCP, SDK, and other integrations. Caller IP is the client or server that reached CertScore—not the scanned site.</p>
        </div>
        <AdminTrafficFilters basePath="/app/admin/pulse" scope={trafficScope} searchParams={resolved} />
      </div>

      <AdminOperationalSnapshot
        ariaLabel={`API request trend: ${snapshotNumber(operationalSnapshot.metrics.requests)} requests during ${operationalSnapshot.period.label.toLowerCase()}`}
        basePath="/app/admin/pulse"
        breakdown={operationalSnapshot.routes.map((route) => ({ label: route.route, value: snapshotNumber(route.count), detail: `${snapshotNumber(route.completed)} completed · ${snapshotNumber(route.errors)} errors`, href: snapshotHref({ route: route.route }) }))}
        health={adminOperationalSnapshotHealth(operationalSnapshot.newestAt, activeSnapshotPeriod)}
        metrics={snapshotMetrics}
        period={activeSnapshotPeriod}
        rates={snapshotRates}
        searchParams={resolved}
        subtitle={`Logical API requests · ${operationalSnapshot.period.label}`}
        trend={operationalSnapshot.trend.map((bucket, index) => ({ key: `${bucket.bucket}:${index}`, label: bucket.label, value: bucket.requests, title: `${bucket.label}: ${bucket.requests} requests · ${bucket.errors} errors · ${bucket.rateLimited} rate limited`, className: bucket.errors > 0 ? "bg-rose-400 hover:bg-rose-500" : bucket.rateLimited > 0 ? "bg-amber-400 hover:bg-amber-500" : undefined }))}
        trendTotal={operationalSnapshot.period.label}
      />

      <Card className="min-w-0 overflow-hidden border-slate-200 bg-white">
      <CardHeader className="pb-2"><div className="flex flex-wrap items-end justify-between gap-2"><div><CardTitle>API request activity</CardTitle><p className="mt-1 text-sm text-slate-500">SDK/MCP result-fetch follow-ups are grouped with their initiating request.</p></div><p className="text-sm text-slate-500">{snapshotNumber(filteredTotal)} matching requests</p></div></CardHeader>
      <AdminTableRefreshBoundary basePath="/app/admin/pulse" label="Refreshing API activity">
      <CardContent className="space-y-3 pt-0">
        <Suspense fallback={<AdminPulseFiltersFallback />}>
          <AdminPulseFilters
            activeAccess={activeAccess}
            activeFreshness={activeFreshness}
            activeIndustry={activeIndustry}
            activeLanguage={activeLanguage}
            activeOutcome={activeOutcome}
            activeQuery={activeQuery}
            activeRoute={activeRoute}
            activeScanFrom={activeScanFrom}
            activeSnapshotPeriod={activeSnapshotPeriod}
            activeStatus={activeStatus}
            activeTimeSpan={activeTimeSpan}
            hasFilters={hasFilters}
            trafficScope={trafficScope}
          />
        </Suspense>

        <PaginationControls
          basePath="/app/admin/pulse"
          itemLabel="API requests"
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          searchParams={{ q: activeQuery, status: activeStatus, route: activeRoute, freshness: activeFreshness, access: activeAccess, outcome: activeOutcome, language: activeLanguage, industry: activeIndustry, scanFrom: activeScanFrom, snapshot: activeSnapshotPeriod, timeSpan: activeTimeSpan, traffic: trafficScope }}
          showPageJump
          totalCount={filteredTotal}
          visibleCount={requests.length}
        />

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="table-fixed text-left text-xs" style={{ width: "2812px", minWidth: "2812px" }}>
            <colgroup>
              <col style={{ width: "100px" }} /><col style={{ width: "70px" }} /><col style={{ width: "150px" }} />
              <col style={{ width: "100px" }} /><col style={{ width: "160px" }} /><col style={{ width: "60px" }} /><col style={{ width: "60px" }} />
              <col style={{ width: "50px" }} /><col style={{ width: "170px" }} /><col style={{ width: "75px" }} />
              <col style={{ width: "164px" }} /><col style={{ width: "205px" }} /><col style={{ width: "135px" }} /><col style={{ width: "145px" }} />
              <col style={{ width: "55px" }} /><col style={{ width: "100px" }} /><col style={{ width: "65px" }} /><col style={{ width: "160px" }} />
              <col style={{ width: "120px" }} /><col style={{ width: "130px" }} /><col style={{ width: "70px" }} /><col style={{ width: "120px" }} /><col style={{ width: "190px" }} /><col style={{ width: "190px" }} />
              <col style={{ width: "78px" }} />
            </colgroup>
            <thead className="sticky top-0 z-20 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
              <tr>
                {[
                  { label: "Status", className: "sticky left-0 z-30 bg-slate-50" }, { label: "Route" },
                  { label: "Requester / caller IP" }, { label: "Requested" }, { label: "Page" }, { label: "Tranco" },
                  { label: "Score" }, { label: "Top" }, { label: "Privacy / CMP" }, { label: "A/R/O" },
                  { label: "Access" }, { label: "Transparency" }, { label: "Transport" }, { label: "Runtime" }, { label: "Time" }, { label: "Outcome" }, { label: "From" }, { label: "Freshness" }, { label: "Language" },
                  { label: "Industry" }, { label: "Mode" }, { label: "Usage" }, { label: "Scan ID" }, { label: "Scanner egress" },
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
                const requestedDateTime = formatRequestedDateTime(request.requestedAt);
                const matrix = request.evidenceMatrix;
                return (
                  <tr className="group h-[52px] hover:bg-slate-50/70" key={request.publicId}>
                    <td className="sticky left-0 z-10 bg-white px-2.5 py-1.5 group-hover:bg-slate-50" title={status.label}><span className="inline-flex items-center gap-1.5 font-semibold"><span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${status.className}`} /><span className={status.label === "No-go" ? "text-rose-700" : "text-slate-700"}>{status.label}</span></span></td>
                    <td className="px-2.5 py-1.5"><span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${routeClass(request.apiRoute)}`}>{request.apiRoute}</span></td>
                    <td className="px-2.5 py-1.5"><span className={`inline-flex max-w-full truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${provenance.className}`} title={request.requesterName ?? provenance.label}>{request.requesterName ?? provenance.label}</span><p className="mt-0.5 truncate font-mono text-[10px] text-slate-500" title={`${sourceIpLabel(request)} · ${request.sourceIpSource.replaceAll("_", " ")}`}>{sourceIpLabel(request)}</p></td>
                    <td className="px-2.5 py-1.5 text-[10px] leading-4 text-slate-600" title={formatAdminDateTime(request.requestedAt)}><p className="truncate">{requestedDateTime.date}</p><p className="truncate text-slate-500">{requestedDateTime.time}</p></td>
                    <td className="px-2.5 py-1.5">
                      <p className="line-clamp-2 break-all font-semibold leading-4 text-slate-900" title={request.pageUrl ?? "Page URL unavailable"}>
                        {request.pageUrl ?? "Page URL unavailable"}
                      </p>
                    </td>
                    <td className="px-2.5 py-1.5 font-medium text-slate-700">{request.trancoRank ? `#${request.trancoRank.toLocaleString()}` : "—"}</td>
                    <td className="px-2.5 py-1.5 font-semibold text-slate-900">{request.score !== null ? <><span>{request.score}</span><span className="text-[11px] font-normal text-slate-400">/100</span></> : "—"}</td>
                    <td className="px-2.5 py-1.5 font-semibold text-slate-900">{request.topFindingCount ?? "—"}</td>
                    <td className="px-2.5 py-1.5"><p className="flex gap-2 text-[10px]"><EvidenceCode code="Privacy" label="Privacy notice" result={matrix?.privacyConsent.privacyNotice ?? null} /><EvidenceCode code="CMP" label="CMP framework" result={matrix?.privacyConsent.cmp ?? null} /></p><p className="truncate text-[10px] text-slate-500" title={evidenceTitle("Consent mechanism", matrix?.privacyConsent.mechanism ?? null)}>Mechanism {matrix?.privacyConsent.cmpVendorName ?? (matrix?.privacyConsent.mechanism ? EVIDENCE_MARKS[matrix.privacyConsent.mechanism.status].mark : "·")}</p></td>
                    <td className="px-2.5 py-1.5"><p className="flex gap-2 text-[10px]"><EvidenceCode code="A" label="Accept" result={matrix?.privacyConsent.accept ?? null} /><EvidenceCode code="R" label="Reject" result={matrix?.privacyConsent.reject ?? null} /><EvidenceCode code="O" label="Options" result={matrix?.privacyConsent.options ?? null} /></p><p className="truncate text-[10px] text-slate-400">Canonical controls</p></td>
                    <td className="px-2.5 py-1.5 font-medium leading-4 text-slate-700" title={request.noGoReason ?? undefined}><span className="line-clamp-2 break-words">{accessLabel(request)}</span></td>
                    <td className="px-2.5 py-1.5"><EvidenceGroupCell aggregate={matrix?.transparency.aggregate ?? null} labels={TRANSPARENCY_LABELS} policyEvidence={matrix?.policyEvidence} results={matrix?.transparency.results ?? null} /></td>
                    <td className="px-2.5 py-1.5"><EvidenceGroupCell aggregate={matrix?.transport.aggregate ?? null} labels={TRANSPORT_LABELS} results={matrix?.transport.results ?? null} /></td>
                    <td className="px-2.5 py-1.5"><EvidenceGroupCell aggregate={matrix?.runtime.aggregate ?? null} labels={RUNTIME_LABELS} results={matrix?.runtime.results ?? null} /></td>
                    <td className="px-2.5 py-1.5 font-medium text-slate-800">{request.elapsedSeconds !== null ? `${Number.isInteger(Math.round(request.elapsedSeconds * 10) / 10) ? Math.round(request.elapsedSeconds * 10) / 10 : (Math.round(request.elapsedSeconds * 10) / 10).toFixed(1)}s` : "—"}</td>
                    <td className="truncate px-2.5 py-1.5 text-slate-700" title={request.scanOutcome ?? undefined}>{outcomeLabel(request.scanOutcome, request.noGoFlag)}</td>
                    <td className="px-2.5 py-1.5" title={request.scanFromLabel}><span aria-label={request.scanFromLabel} className="inline-flex"><ScanFromMarker flag={"flag" in marker ? marker.flag : undefined} icon={"icon" in marker ? marker.icon : undefined} selected /></span></td>
                    <td className="px-2.5 py-1.5"><span className="inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">{freshnessLabel(request.freshness, request.freshRescanRequested)}</span></td>
                    <td className="px-2.5 py-1.5 font-medium uppercase text-slate-700" title={request.primaryLanguage ? `${request.primaryLanguageConfidence ?? "unknown"} confidence · ${(request.primaryLanguageSource ?? "unknown").replaceAll("_", " ")}` : "No reliable retained language evidence"}>{request.primaryLanguage ?? "—"}</td>
                    <td className="truncate px-2.5 py-1.5 text-slate-700" title={request.industry ?? undefined}>{request.industry ?? "—"}</td>
                    <td className="px-2.5 py-1.5"><p className="font-medium text-slate-800">{formatLabel(request.detail)}</p><p className="text-[10px] text-slate-500">{formatLabel(request.format)}</p></td>
                    <td className="px-2.5 py-1.5"><p>{request.feedbackCount} feedback</p><p className="text-[10px] text-slate-500">JSON {request.summaryJsonDownloads + request.evidenceJsonDownloads}</p></td>
                    <td className="px-2.5 py-1.5"><p className="truncate font-mono text-[10px] text-slate-700" title={request.scanId ?? undefined}>{request.scanId ?? "—"}</p><p className="mt-0.5 flex gap-1.5 text-[9px]">{request.scanId ? <><Link className="text-sky-700 hover:underline" href={adminOperationalSnapshotHref("/app/admin/scans", { q: request.scanId, traffic: trafficScope })} prefetch={false}>Scans</Link><Link className="text-sky-700 hover:underline" href={adminOperationalSnapshotHref("/app/admin/analytics", { q: request.scanId, traffic: trafficScope })} prefetch={false}>Events</Link><Link className="text-sky-700 hover:underline" href={adminOperationalSnapshotHref("/app/admin/mcp", { q: request.scanId, traffic: trafficScope })} prefetch={false}>MCP</Link></> : <Link className="text-sky-700 hover:underline" href={adminOperationalSnapshotHref("/app/admin/analytics", { q: request.publicId, traffic: trafficScope })} prefetch={false}>Events</Link>}</p></td>
                    <td className="px-2.5 py-1.5"><p className="truncate font-mono text-[10px] text-slate-700" title={request.scannerEgressId ?? "Scanner egress not recorded"}>{request.scannerEgressId ?? "Not recorded"}</p><p className="mt-0.5 truncate text-[10px] text-slate-400" title={request.scannerEgressProvider ?? undefined}>{request.scannerEgressProvider ?? "Outbound runtime"}</p></td>
                    <td className="sticky right-0 z-10 border-l border-slate-100 bg-white px-2 py-1.5 text-center group-hover:bg-slate-50"><AdminReportLink ariaLabel={scanReportHref ? `Open scan report ${request.scanId}` : `Open API request ${request.publicId}`} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white font-semibold text-sky-700" href={openHref}>→</AdminReportLink></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
      </AdminTableRefreshBoundary>
    </Card>
    </div>
    </AdminNavigationProvider>
  );
}
