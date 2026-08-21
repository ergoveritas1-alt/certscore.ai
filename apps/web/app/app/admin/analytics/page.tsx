import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { AdminScansFilterForm } from "../scans/admin-scans-filter-form";
import { AdminTableRefreshBoundary } from "../../../../components/admin/admin-table-refresh-boundary";
import { PaginationControls, normalizePage, normalizePageSize } from "../../../../components/ui/pagination-controls";
import { formatAdminCompactDateTime, formatAdminDateTime } from "../../../../lib/admin/date-time";
import { resolveExcludeInternalAnalytics, resolveExcludeMacMiniScanBot } from "../../../../lib/admin/mac-mini-scan-bot";
import { getAdminAuthenticatedScanHref } from "../../../../server/admin/admin-scan-links";
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

const periods = ["1h", "24h", "7d", "30d", "90d"] as const;
const eventNames: AdminEventName[] = ["page_viewed", "navigation_clicked", "action_clicked", "form_started", "form_submitted", "form_succeeded", "form_failed", "scan_started", "scan_completed", "scan_viewed", "report_viewed", "scroll_depth_reached", "session_engaged", "web_vital_recorded", "client_error", "account_created", "analytics_opted_in", "analytics_opted_out", "scan_requested", "api_request", "mcp_tool_invoked", "full_scan.started", "full_scan.completed", "preview_scan.started", "preview_scan.completed", "v2_lambda_result.received", "v2_lambda_result.failed"];
const outcomes: ProductAnalyticsOutcome[] = ["observed", "started", "submitted", "success", "failure", "opted_in", "opted_out"];

type Props = { searchParams?: Promise<{ audienceFilters?: string; event?: string; excludeInternal?: string; excludeMacMiniScanBot?: string; outcome?: string; page?: string; perPage?: string; period?: string; q?: string; route?: string; scanBotFilter?: string }> };

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
  const period = option(resolved.period, periods) ?? "24h";
  const excludeInternal = resolveExcludeInternalAnalytics(resolved);
  const includeInternal = !excludeInternal;
  const excludeMacMiniScanBot = resolveExcludeMacMiniScanBot(resolved);
  const eventName = option(resolved.event, eventNames);
  const outcome = option(resolved.outcome, outcomes);
  const route = option(resolved.route, ADMIN_EVENT_ROUTES) as AdminEventRoute | null;
  const query = resolved.q?.trim().slice(0, 160) ?? "";
  const page = normalizePage(resolved.page);
  const pageSize = normalizePageSize(resolved.perPage, 20);
  const hasFilters = Boolean(eventName || outcome || query || route);
  const [dashboard, eventPage] = await Promise.all([
    loadProductAnalyticsDashboard(period, includeInternal, excludeMacMiniScanBot),
    listProductAnalyticsEventsPage(period, includeInternal, excludeMacMiniScanBot, pageSize, (page - 1) * pageSize, { eventName, outcome, query, route })
  ]);
  const maxTrend = Math.max(1, ...dashboard.trend.map((point) => point.events));
  const metrics = [
    ["Events", dashboard.metrics.events], ["Sessions", dashboard.metrics.sessions], ["Actors", dashboard.metrics.actors],
    ["Page views", dashboard.metrics.pageViews], ["Scan-linked", dashboard.metrics.scans], ["Authenticated", dashboard.metrics.authenticated],
    ["Client errors", dashboard.metrics.errors], ["Opt-outs", dashboard.metrics.optedOut]
  ] as const;
  const filterParams = { period, audienceFilters: "1", excludeInternal: excludeInternal ? "1" : null, scanBotFilter: "1", excludeMacMiniScanBot: excludeMacMiniScanBot ? "1" : null, event: eventName, outcome, q: query, route };
  const pageCount = Math.max(1, Math.ceil(eventPage.totalCount / pageSize));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">First-party operational telemetry</p><h2 className="text-2xl font-semibold tracking-tight text-slate-950">Events</h2><p className="mt-1 text-sm text-slate-500">Privacy-bounded activity across Web, API, Pulse, SDK, MCP, and scan lifecycle routes.</p></div>
        <form action="/app/admin/analytics" className="flex items-center gap-2" method="get">
          <input name="audienceFilters" type="hidden" value="1" />
          <input name="scanBotFilter" type="hidden" value="1" />
          <select aria-label="Analytics period" className="h-9 rounded-full border border-slate-300 bg-white px-3 text-sm" defaultValue={period} name="period"><option value="1h">Last hour</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option></select>
          <label className="flex h-9 items-center gap-2 rounded-full border border-slate-300 bg-white px-3 text-sm"><input defaultChecked={excludeInternal} key={excludeInternal ? "exclude-internal" : "include-internal"} name="excludeInternal" type="checkbox" value="1" /> Exclude internal / QA</label>
          <label className="flex h-9 items-center gap-2 rounded-full border border-slate-300 bg-white px-3 text-sm"><input defaultChecked={excludeMacMiniScanBot} key={excludeMacMiniScanBot ? "exclude-scan-bot" : "include-scan-bot"} name="excludeMacMiniScanBot" type="checkbox" value="1" /> Exclude Mac mini scan bot</label>
          <button className="app-raised-button h-9 rounded-full px-3 text-sm font-semibold" type="submit">Apply</button>
        </form>
      </div>

      <Card className="overflow-hidden border-slate-200 bg-white">
        <CardHeader className="border-b border-slate-100 py-3"><CardTitle>{dashboard.label} snapshot</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4 lg:grid-cols-8">{metrics.map(([name, value]) => <div className="bg-white px-3 py-2.5" key={name}><p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{name}</p><p className="mt-1 text-xl font-semibold text-slate-950">{count(value)}</p></div>)}</div>
          <div className="border-t border-slate-100 p-3"><div className="mb-2 flex justify-between"><p className="text-xs font-semibold text-slate-700">Activity</p><p className="text-[10px] text-slate-400">{excludeInternal ? "Internal/QA excluded" : "Internal/QA included"} · {excludeMacMiniScanBot ? "Mac mini scan bot excluded" : "Mac mini scan bot included"}</p></div><div aria-label="Event trend" className="flex h-16 items-end gap-1" role="img">{dashboard.trend.length ? dashboard.trend.map((point) => <div aria-hidden="true" className="min-w-0 flex-1 rounded-t bg-sky-500" key={point.bucketStart} style={{ height: `${Math.max(2, point.events / maxTrend * 64)}px` }} title={`${point.bucket}: ${point.events} events · ${point.sessions} sessions`} />) : <p className="text-sm text-slate-400">No activity in this period.</p>}</div></div>
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden border-slate-200 bg-white">
        <CardContent className="grid min-w-0 gap-2 p-2 xl:grid-cols-[minmax(520px,2fr)_minmax(0,3fr)]">
          <section aria-labelledby="route-activity-heading" className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5">
            <div className="mb-1 flex items-center justify-between"><h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500" id="route-activity-heading">Routes</h3><span className="text-[9px] text-slate-400">Events · sessions</span></div>
            <div className="flex min-w-max gap-1 overflow-x-auto">{dashboard.routes.length ? dashboard.routes.map((row) => <div aria-label={`${row.route}: ${count(row.events)} events and ${count(row.sessions)} sessions`} className="flex h-7 min-w-[78px] flex-1 items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 text-[10px]" key={row.route}><span className="font-semibold text-slate-700">{row.route}</span><span className="tabular-nums text-slate-500">{count(row.events)} · {count(row.sessions)}</span></div>) : <p className="text-xs text-slate-400">No routes yet.</p>}</div>
          </section>
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
            <input name="period" type="hidden" value={period} />
            <input name="audienceFilters" type="hidden" value="1" />
            {excludeInternal ? <input name="excludeInternal" type="hidden" value="1" /> : null}
            <input name="scanBotFilter" type="hidden" value="1" />
            {excludeMacMiniScanBot ? <input name="excludeMacMiniScanBot" type="hidden" value="1" /> : null}
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
              <td className="px-2.5 py-1.5">{event.scan_id ? <a className="block truncate font-medium text-sky-700 hover:underline" href={getAdminAuthenticatedScanHref(event.scan_id)} title={event.hostname ?? event.scan_id}>{event.hostname ?? event.scan_id.slice(0, 8)}</a> : <p className="truncate text-slate-500" title={event.hostname ?? undefined}>{event.hostname ?? "—"}</p>}<p className="truncate font-mono text-[9px] text-slate-400">{event.scan_id?.slice(0, 8) ?? "No scan"}</p></td>
            </tr>;
          }) : <tr><td className="px-3 py-8 text-center text-sm text-slate-400" colSpan={8}>No events match these filters.</td></tr>}</tbody></table></div>
        </CardContent>
      </Card>
      </AdminTableRefreshBoundary>
    </div>
  );
}
