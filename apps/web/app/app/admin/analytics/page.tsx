import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { AdminScansFilterForm } from "../scans/admin-scans-filter-form";
import { AdminTableRefreshBoundary } from "../../../../components/admin/admin-table-refresh-boundary";
import { PaginationControls, normalizePage, normalizePageSize } from "../../../../components/ui/pagination-controls";
import { formatAdminCompactDateTime, formatAdminDateTime } from "../../../../lib/admin/date-time";
import { AdminTrafficFilters } from "../../../../components/admin/admin-traffic-filters";
import { AdminOperationalSnapshot } from "../../../../components/admin/admin-operational-snapshot";
import { adminOperationalSnapshotDelta, adminOperationalSnapshotHealth, adminOperationalSnapshotHref } from "../../../../lib/admin/admin-operational-snapshot";
import { adminTrafficScopeVisibility, resolveAdminTrafficScope } from "../../../../lib/admin/admin-traffic-scope";
import { getAdminAuthenticatedScanHref } from "../../../../server/admin/admin-scan-links";
import { withServerTiming } from "../../../../server/performance/log-server-timing";
import {
  ADMIN_EVENT_ROUTES,
  loadProductAnalyticsDashboard,
  listProductAnalyticsEventsPage,
  type AdminEventRoute,
  type AdminEventName,
  type ProductAnalyticsOutcome,
  type ProductAnalyticsPeriod
} from "../../../../server/admin/product-analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const periods = ["1h", "24h", "7d", "30d", "1y"] as const;
const eventNames: AdminEventName[] = ["page_viewed", "navigation_clicked", "action_clicked", "form_started", "form_submitted", "form_succeeded", "form_failed", "scan_started", "scan_completed", "scan_viewed", "report_viewed", "scroll_depth_reached", "session_engaged", "web_vital_recorded", "client_error", "account_created", "oauth_authorized", "mcp_initialized", "mcp_tools_listed", "mcp_first_tool_invoked", "mcp_scan_requested", "analytics_opted_in", "analytics_opted_out", "scan_requested", "api_request", "mcp_tool_invoked", "full_scan.started", "full_scan.completed", "preview_scan.started", "preview_scan.completed", "v2_lambda_result.received", "v2_lambda_result.failed"];
const outcomes: ProductAnalyticsOutcome[] = ["observed", "started", "submitted", "success", "failure", "opted_in", "opted_out"];

type Props = { searchParams?: Promise<{ audienceFilters?: string; event?: string; excludeInternal?: string; excludeMacMiniScanBot?: string; includeCanary?: string; outcome?: string; page?: string; perPage?: string; period?: string; q?: string; route?: string; scanBotFilter?: string; snapshot?: string; traffic?: string }> };

function count(value: number) { return new Intl.NumberFormat("en-US").format(value); }
function label(value: string) { return value.replace(/[_.]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function option<T extends string>(value: string | undefined, values: readonly T[]) { return values.includes(value as T) ? value as T : null; }
function eventAge(value: string) {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1_000));
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;
  if (elapsedSeconds < 3_600) return `${Math.floor(elapsedSeconds / 60)}m ago`;
  if (elapsedSeconds < 86_400) return `${Math.floor(elapsedSeconds / 3_600)}h ago`;
  return `${Math.floor(elapsedSeconds / 86_400)}d ago`;
}
function durationLabel(value: number | null) {
  if (value === null) return null;
  return value < 1_000 ? `${value}ms` : `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}s`;
}
function percentage(value: number | null) { return value === null ? "—" : `${(value * 100).toFixed(1)}%`; }
function originLabel(event: { country_code: string | null; origin_ip: string | null; origin_ip_hash: string | null }) {
  if (event.origin_ip) return event.origin_ip;
  if (event.origin_ip_hash) return `Hash ${event.origin_ip_hash.slice(0, 12)}`;
  return event.country_code ? `Country ${event.country_code}` : "Not retained";
}

const routeTone: Record<AdminEventRoute, string> = {
  API: "bg-violet-50 text-violet-700 ring-violet-200",
  MCP: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  Other: "bg-slate-100 text-slate-600 ring-slate-200",
  Pulse: "bg-amber-50 text-amber-700 ring-amber-200",
  SDK: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  Web: "bg-emerald-50 text-emerald-700 ring-emerald-200"
};

export default async function ProductAnalyticsPage({ searchParams }: Props) {
  const resolved = searchParams ? await searchParams : {};
  const period = option(resolved.snapshot ?? resolved.period, periods) ?? "24h";
  const trafficScope = resolveAdminTrafficScope(resolved);
  const { includeInternalQa: includeInternal, includeMacMini } = adminTrafficScopeVisibility(trafficScope);
  const excludeMacMiniScanBot = !includeMacMini;
  const eventName = option(resolved.event, eventNames);
  const outcome = option(resolved.outcome, outcomes);
  const route = option(resolved.route, ADMIN_EVENT_ROUTES) as AdminEventRoute | null;
  const query = resolved.q?.trim().slice(0, 160) ?? "";
  const page = normalizePage(resolved.page);
  const pageSize = normalizePageSize(resolved.perPage, 20);
  const hasFilters = Boolean(eventName || outcome || query || route);
  const [dashboard, eventPage] = await Promise.all([
    withServerTiming("app.admin.events.operational_snapshot", () =>
      loadProductAnalyticsDashboard(period, includeInternal, excludeMacMiniScanBot)
    ),
    withServerTiming("app.admin.events.rows", () =>
      listProductAnalyticsEventsPage(period, includeInternal, excludeMacMiniScanBot, pageSize, (page - 1) * pageSize, { eventName, outcome, query, route })
    )
  ]);
  const eventDelta = adminOperationalSnapshotDelta(dashboard.metrics.events, dashboard.comparison.events);
  const errorDelta = adminOperationalSnapshotDelta(dashboard.metrics.errors, dashboard.comparison.errors, "higher_is_bad");
  const latencyDelta = adminOperationalSnapshotDelta(dashboard.metrics.p95DurationMs ?? 0, dashboard.comparison.p95DurationMs ?? 0, "higher_is_bad");
  const snapshotHref = (values: Record<string, string | null | undefined>) => adminOperationalSnapshotHref("/app/admin/analytics", { snapshot: period, traffic: trafficScope, ...values });
  const metrics = [
    { label: "Events", value: count(dashboard.metrics.events), detail: dashboard.label, comparison: eventDelta.label, anomaly: eventDelta.anomaly, href: snapshotHref({}) },
    { label: "Sessions", value: count(dashboard.metrics.sessions), detail: "opaque", definition: "sessions" as const },
    { label: "Actors", value: count(dashboard.metrics.actors), detail: "identified", definition: "actors" as const },
    { label: "Scans", value: count(dashboard.metrics.scans), detail: "linked scans", definition: "scans" as const, href: snapshotHref({ event: "scan_requested" }) },
    { label: "Errors", value: count(dashboard.metrics.errors), detail: "events", definition: "errors" as const, comparison: errorDelta.label, anomaly: errorDelta.anomaly, href: snapshotHref({ outcome: "failure" }) },
    { label: "Latency", value: `${durationLabel(dashboard.metrics.p50DurationMs) ?? "—"} / ${durationLabel(dashboard.metrics.p95DurationMs) ?? "—"}`, detail: "p50 / p95", definition: "latency" as const, comparison: latencyDelta.label, anomaly: latencyDelta.anomaly },
  ];
  const rates = [
    { label: "Authenticated", value: percentage(dashboard.metrics.events > 0 ? dashboard.metrics.authenticated / dashboard.metrics.events : null) },
    { label: "Errors", value: percentage(dashboard.metrics.events > 0 ? dashboard.metrics.errors / dashboard.metrics.events : null), anomaly: errorDelta.anomaly, href: snapshotHref({ outcome: "failure" }) },
    { label: "Page views", value: count(dashboard.metrics.pageViews), href: snapshotHref({ event: "page_viewed" }) },
    { label: "Opt-outs", value: count(dashboard.metrics.optedOut), href: snapshotHref({ event: "analytics_opted_out" }) },
    { label: "Events / session", value: dashboard.metrics.sessions > 0 ? (dashboard.metrics.events / dashboard.metrics.sessions).toFixed(2) : "—" },
    { label: "Events / actor", value: dashboard.metrics.actors > 0 ? (dashboard.metrics.events / dashboard.metrics.actors).toFixed(2) : "—" },
  ];
  const filterParams = { snapshot: period, traffic: trafficScope, event: eventName, outcome, q: query, route };
  const pageCount = Math.max(1, Math.ceil(eventPage.totalCount / pageSize));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">First-party operational telemetry</p><h2 className="text-2xl font-semibold tracking-tight text-slate-950">Events</h2><p className="mt-1 text-sm text-slate-500">Privacy-bounded activity across Web, API, Pulse, SDK, MCP, and scan lifecycle routes.</p></div>
        <AdminTrafficFilters basePath="/app/admin/analytics" scope={trafficScope} searchParams={resolved} />
      </div>

      <AdminOperationalSnapshot
        ariaLabel={`Event trend: ${count(dashboard.metrics.events)} events during ${dashboard.label.toLowerCase()}`}
        basePath="/app/admin/analytics"
        breakdown={ADMIN_EVENT_ROUTES.map((routeName) => { const row = dashboard.routes.find((candidate) => candidate.route === routeName); return { label: routeName, value: count(row?.events ?? 0), detail: `${count(row?.sessions ?? 0)} sessions`, href: snapshotHref({ route: routeName }) }; })}
        breakdownColumns="sm:grid-cols-2 xl:grid-cols-6"
        health={adminOperationalSnapshotHealth(dashboard.newestAt, period)}
        metrics={metrics}
        period={period}
        rates={rates}
        searchParams={resolved}
        subtitle={`Unified operational events · ${dashboard.label}`}
        trend={dashboard.trend.map((point) => ({ key: point.bucketStart, label: point.bucket, value: point.events, title: `${point.bucket}: ${point.events} events · ${point.sessions} sessions` }))}
        trendTotal={dashboard.label}
      />

      <Card className="min-w-0 overflow-hidden border-slate-200 bg-white">
        <CardContent className="min-w-0 p-2">
          <section aria-labelledby="feature-activity-heading" className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5">
            <div className="mb-1 flex items-center justify-between"><h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500" id="feature-activity-heading">Feature activity</h3><span className="text-[9px] text-slate-400">Top 15 · events · sessions</span></div>
            <div className="flex min-w-0 gap-1 overflow-x-auto pb-0.5">{dashboard.features.length ? dashboard.features.map((row) => <div className="flex h-7 min-w-[190px] items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2" key={`${row.eventName}:${row.feature}`} title={`${label(row.feature)} · ${label(row.eventName)} · ${count(row.events)} events · ${count(row.sessions)} sessions`}><span className="min-w-0 truncate text-[10px] font-medium text-slate-700">{label(row.feature)} · {label(row.eventName)}</span><span className="shrink-0 text-[10px] tabular-nums text-slate-500">{count(row.events)} · {count(row.sessions)}</span></div>) : <p className="text-xs text-slate-400">No feature activity yet.</p>}</div>
          </section>
        </CardContent>
      </Card>

      <AdminTableRefreshBoundary basePath="/app/admin/analytics" label="Refreshing events">
      <Card className="min-w-0 overflow-hidden border-slate-200 bg-white">
        <CardHeader className="py-2.5"><div className="flex flex-wrap items-end justify-between gap-2"><div><CardTitle>Recent events</CardTitle><p className="mt-0.5 text-xs text-slate-500">Dense two-line rows with route, request origin, freshness, and canonical scan links.</p></div><p className="text-sm text-slate-500">{count(eventPage.totalCount)} matching events</p></div></CardHeader>
        <CardContent className="min-w-0 space-y-2 pt-0">
          <AdminScansFilterForm basePath="/app/admin/analytics" clearHref="/app/admin/analytics" hasFilters={hasFilters} submitFirst>
            <input name="snapshot" type="hidden" value={period} />
            <input name="traffic" type="hidden" value={trafficScope} />
            <input aria-label="Search events" className="h-10 min-w-[260px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm" name="q" placeholder="Route, page, event, source, actor, IP, freshness, region, hostname" defaultValue={query} />
            <select aria-label="Route" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" defaultValue={route ?? ""} name="route"><option value="">Any route</option>{ADMIN_EVENT_ROUTES.map((value) => <option key={value} value={value}>{value}</option>)}</select>
            <select aria-label="Event type" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" defaultValue={eventName ?? ""} name="event"><option value="">Any event</option>{eventNames.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
            <select aria-label="Outcome" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" defaultValue={outcome ?? ""} name="outcome"><option value="">Any outcome</option>{outcomes.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
          </AdminScansFilterForm>
          <PaginationControls basePath="/app/admin/analytics" itemLabel="events" page={page} pageCount={pageCount} pageSize={pageSize} searchParams={filterParams} showPageJump totalCount={eventPage.totalCount} visibleCount={eventPage.rows.length} />
          <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[1180px] table-fixed text-left text-[11px]"><colgroup><col className="w-[10%]" /><col className="w-[6%]" /><col className="w-[19%]" /><col className="w-[16%]" /><col className="w-[15%]" /><col className="w-[14%]" /><col className="w-[10%]" /><col className="w-[10%]" /></colgroup><thead className="border-b border-slate-200 bg-slate-50 text-[9px] uppercase tracking-wide text-slate-500"><tr><th className="px-2.5 py-1.5">Time</th><th className="px-2.5 py-1.5">Route</th><th className="px-2.5 py-1.5">Event</th><th className="px-2.5 py-1.5">Page / feature</th><th className="px-2.5 py-1.5">Actor / session</th><th className="px-2.5 py-1.5">Origin</th><th className="px-2.5 py-1.5">Request</th><th className="px-2.5 py-1.5">Scan</th></tr></thead><tbody>{eventPage.rows.length ? eventPage.rows.map((event) => {
            const duration = durationLabel(event.duration_ms);
            const fullTime = formatAdminDateTime(event.occurred_at);
            return <tr className="border-b border-slate-100 align-middle last:border-0 hover:bg-slate-50/70" key={event.event_id} title={fullTime}>
              <td className="px-2.5 py-1.5"><p className="truncate font-medium tabular-nums text-slate-700">{formatAdminCompactDateTime(event.occurred_at)}</p><p className="truncate text-[9px] text-slate-400">{eventAge(event.occurred_at)}</p></td>
              <td className="px-2.5 py-1.5"><span className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold ring-1 ${routeTone[event.event_route]}`}>{event.event_route}</span></td>
              <td className="px-2.5 py-1.5"><p className="truncate font-medium text-slate-800" title={label(event.event_name)}>{label(event.event_name)}</p><p className="truncate text-[9px] text-slate-400">{label(event.outcome)}{duration ? ` · ${duration}` : ""}</p></td>
              <td className="px-2.5 py-1.5"><code className="block truncate text-[10px] text-slate-700" title={event.normalized_route}>{event.normalized_route}</code><p className="truncate text-[9px] text-slate-400" title={label(event.feature)}>{label(event.feature)}</p></td>
              <td className="px-2.5 py-1.5"><p className="truncate text-slate-700" title={event.email ?? event.actor_id ?? "Anonymous aggregate"}>{event.email ?? event.actor_id?.slice(0, 12) ?? "Anonymous aggregate"}</p><p className="truncate font-mono text-[9px] text-slate-400" title={event.session_id ?? "No linkable session"}>{event.session_id?.slice(0, 12) ?? "No linkable session"}</p></td>
              <td className="px-2.5 py-1.5"><p className="truncate font-mono text-[10px] text-slate-700" title={originLabel(event)}>{originLabel(event)}</p><p className="truncate text-[9px] text-slate-400">{label(event.source)} · {label(event.device_class)}</p></td>
              <td className="px-2.5 py-1.5"><p className="truncate font-medium text-slate-700">{event.freshness ? label(event.freshness) : "—"}</p><p className="truncate text-[9px] text-slate-400">{event.request_region ? label(event.request_region) : event.country_code ? `Country ${event.country_code}` : "No region"}</p></td>
              <td className="px-2.5 py-1.5">{event.scan_id ? <a className="block truncate font-medium text-sky-700 hover:underline" href={getAdminAuthenticatedScanHref(event.scan_id)} title={event.hostname ?? event.scan_id}>{event.hostname ?? event.scan_id.slice(0, 8)}</a> : <p className="truncate text-slate-500" title={event.hostname ?? undefined}>{event.hostname ?? "—"}</p>}<p className="truncate font-mono text-[9px] text-slate-400">{event.scan_id?.slice(0, 8) ?? "No scan"}</p>{event.scan_id ? <p className="mt-0.5 flex gap-1.5 text-[9px]"><a className="text-sky-700 hover:underline" href={adminOperationalSnapshotHref("/app/admin/scans", { q: event.scan_id, traffic: trafficScope })}>Scans</a><a className="text-sky-700 hover:underline" href={adminOperationalSnapshotHref("/app/admin/pulse", { q: event.scan_id, traffic: trafficScope })}>API</a><a className="text-sky-700 hover:underline" href={adminOperationalSnapshotHref("/app/admin/mcp", { q: event.scan_id, traffic: trafficScope })}>MCP</a></p> : null}</td>
            </tr>;
          }) : <tr><td className="px-3 py-8 text-center text-sm text-slate-400" colSpan={8}>No events match these filters.</td></tr>}</tbody></table></div>
        </CardContent>
      </Card>
      </AdminTableRefreshBoundary>
    </div>
  );
}
