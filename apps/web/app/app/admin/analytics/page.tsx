import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { AdminScansFilterForm } from "../scans/admin-scans-filter-form";
import { AdminTableRefreshBoundary } from "../../../../components/admin/admin-table-refresh-boundary";
import { PaginationControls, normalizePage, normalizePageSize } from "../../../../components/ui/pagination-controls";
import { formatAdminDateTime } from "../../../../lib/admin/date-time";
import { getAdminAuthenticatedScanHref } from "../../../../server/admin/admin-scan-links";
import {
  loadProductAnalyticsDashboard,
  listProductAnalyticsEventsPage,
  type ProductAnalyticsEventName,
  type ProductAnalyticsOutcome,
  type ProductAnalyticsPeriod
} from "../../../../server/admin/product-analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const periods = ["24h", "7d", "30d", "90d"] as const;
const eventNames: ProductAnalyticsEventName[] = ["page_viewed", "navigation_clicked", "action_clicked", "form_started", "form_submitted", "form_succeeded", "form_failed", "scan_started", "scan_completed", "scan_viewed", "report_viewed", "scroll_depth_reached", "session_engaged", "web_vital_recorded", "client_error", "account_created", "analytics_opted_in", "analytics_opted_out"];
const outcomes: ProductAnalyticsOutcome[] = ["observed", "started", "submitted", "success", "failure", "opted_in", "opted_out"];

type Props = { searchParams?: Promise<{ event?: string; includeBots?: string; includeInternal?: string; outcome?: string; page?: string; perPage?: string; period?: string; q?: string }> };

function count(value: number) { return new Intl.NumberFormat("en-US").format(value); }
function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function option<T extends string>(value: string | undefined, values: readonly T[]) { return values.includes(value as T) ? value as T : null; }

export default async function ProductAnalyticsPage({ searchParams }: Props) {
  const resolved = searchParams ? await searchParams : {};
  const period = option(resolved.period, periods) ?? "24h";
  const includeInternal = resolved.includeInternal === "1";
  const includeBots = resolved.includeBots !== "0";
  const eventName = option(resolved.event, eventNames);
  const outcome = option(resolved.outcome, outcomes);
  const query = resolved.q?.trim().slice(0, 160) ?? "";
  const page = normalizePage(resolved.page);
  const pageSize = normalizePageSize(resolved.perPage, 20);
  const hasFilters = Boolean(eventName || outcome || query);
  const [dashboard, eventPage] = await Promise.all([
    loadProductAnalyticsDashboard(period, includeInternal, includeBots),
    listProductAnalyticsEventsPage(period, includeInternal, includeBots, pageSize, (page - 1) * pageSize, { eventName, outcome, query })
  ]);
  const maxTrend = Math.max(1, ...dashboard.trend.map((point) => point.events));
  const metrics = [
    ["Events", dashboard.metrics.events], ["Sessions", dashboard.metrics.sessions], ["Actors", dashboard.metrics.actors],
    ["Page views", dashboard.metrics.pageViews], ["Scan-linked", dashboard.metrics.scans], ["Authenticated", dashboard.metrics.authenticated],
    ["Client errors", dashboard.metrics.errors], ["Opt-outs", dashboard.metrics.optedOut]
  ] as const;
  const filterParams = { period, includeInternal: includeInternal ? "1" : null, includeBots: includeBots ? "1" : null, event: eventName, outcome, q: query };
  const pageCount = Math.max(1, Math.ceil(eventPage.totalCount / pageSize));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">First-party telemetry</p><h2 className="text-2xl font-semibold tracking-tight text-slate-950">Product analytics</h2><p className="mt-1 text-sm text-slate-500">Privacy-bounded journeys, features, outcomes, and scan references.</p></div>
        <form action="/app/admin/analytics" className="flex items-center gap-2" method="get">
          <select aria-label="Analytics period" className="h-9 rounded-full border border-slate-300 bg-white px-3 text-sm" defaultValue={period} name="period"><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option></select>
          <label className="flex h-9 items-center gap-2 rounded-full border border-slate-300 bg-white px-3 text-sm"><input defaultChecked={includeInternal} name="includeInternal" type="checkbox" value="1" /> Include internal / QA</label>
          <label className="flex h-9 items-center gap-2 rounded-full border border-slate-300 bg-white px-3 text-sm"><input defaultChecked={includeBots} name="includeBots" type="checkbox" value="1" /> Include bots</label>
          <button className="app-raised-button h-9 rounded-full px-3 text-sm font-semibold" type="submit">Apply</button>
        </form>
      </div>

      <Card className="overflow-hidden border-slate-200 bg-white">
        <CardHeader className="border-b border-slate-100 py-3"><CardTitle>{dashboard.label} snapshot</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4 lg:grid-cols-8">{metrics.map(([name, value]) => <div className="bg-white px-3 py-2.5" key={name}><p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{name}</p><p className="mt-1 text-xl font-semibold text-slate-950">{count(value)}</p></div>)}</div>
          <div className="border-t border-slate-100 p-3"><div className="mb-2 flex justify-between"><p className="text-xs font-semibold text-slate-700">Activity</p><p className="text-[10px] text-slate-400">{includeInternal ? "Internal/QA included" : "Internal/QA excluded"} · {includeBots ? "Bots included" : "Bots excluded"}</p></div><div aria-label="Product analytics event trend" className="flex h-16 items-end gap-1" role="img">{dashboard.trend.length ? dashboard.trend.map((point) => <div aria-hidden="true" className="min-w-0 flex-1 rounded-t bg-sky-500" key={point.bucket} style={{ height: `${Math.max(2, point.events / maxTrend * 64)}px` }} title={`${point.bucket}: ${point.events} events · ${point.sessions} sessions`} />) : <p className="text-sm text-slate-400">No activity in this period.</p>}</div></div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="border-slate-200 bg-white"><CardHeader className="py-3"><CardTitle>Top routes</CardTitle></CardHeader><CardContent className="space-y-1 pt-0">{dashboard.routes.length ? dashboard.routes.map((row) => <div className="flex items-center justify-between gap-3 border-t border-slate-100 py-2 text-sm" key={row.route}><code className="truncate text-xs text-slate-700">{row.route}</code><span className="shrink-0 text-slate-500">{count(row.events)} · {count(row.sessions)} sessions</span></div>) : <p className="text-sm text-slate-400">No routes yet.</p>}</CardContent></Card>
        <Card className="border-slate-200 bg-white"><CardHeader className="py-3"><CardTitle>Feature activity</CardTitle></CardHeader><CardContent className="space-y-1 pt-0">{dashboard.features.length ? dashboard.features.map((row) => <div className="flex items-center justify-between gap-3 border-t border-slate-100 py-2 text-sm" key={`${row.eventName}:${row.feature}`}><div className="min-w-0"><p className="truncate font-medium text-slate-800">{label(row.feature)}</p><p className="text-[10px] text-slate-400">{label(row.eventName)}</p></div><span className="shrink-0 text-slate-500">{count(row.events)} · {count(row.sessions)} sessions</span></div>) : <p className="text-sm text-slate-400">No feature activity yet.</p>}</CardContent></Card>
      </div>

      <AdminTableRefreshBoundary basePath="/app/admin/analytics" label="Refreshing product events">
      <Card className="min-w-0 overflow-hidden border-slate-200 bg-white">
        <CardHeader className="py-3"><div className="flex flex-wrap items-end justify-between gap-2"><div><CardTitle>Recent product events</CardTitle><p className="mt-1 text-xs text-slate-500">Search and filter retained events. Scan evidence opens through the canonical scan record.</p></div><p className="text-sm text-slate-500">{count(eventPage.totalCount)} matching events</p></div></CardHeader>
        <CardContent className="min-w-0 space-y-3 pt-0">
          <AdminScansFilterForm basePath="/app/admin/analytics" clearHref="/app/admin/analytics" hasFilters={hasFilters} submitFirst>
            <input name="period" type="hidden" value={period} />
            {includeInternal ? <input name="includeInternal" type="hidden" value="1" /> : null}
            {includeBots ? <input name="includeBots" type="hidden" value="1" /> : null}
            <input aria-label="Search product events" className="h-10 min-w-[260px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm" name="q" placeholder="Route, feature, event, session, actor, account, hostname" defaultValue={query} />
            <select aria-label="Event type" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" defaultValue={eventName ?? ""} name="event"><option value="">Any event</option>{eventNames.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
            <select aria-label="Outcome" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" defaultValue={outcome ?? ""} name="outcome"><option value="">Any outcome</option>{outcomes.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
          </AdminScansFilterForm>
          <PaginationControls basePath="/app/admin/analytics" itemLabel="events" page={page} pageCount={pageCount} pageSize={pageSize} searchParams={filterParams} showPageJump totalCount={eventPage.totalCount} visibleCount={eventPage.rows.length} />
          <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-full text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Event</th><th className="px-3 py-2">Route / feature</th><th className="px-3 py-2">User / session</th><th className="px-3 py-2">Context</th><th className="px-3 py-2">Scan</th></tr></thead><tbody>{eventPage.rows.length ? eventPage.rows.map((event) => <tr className="border-b border-slate-100 align-top last:border-0" key={event.event_id}><td className="whitespace-nowrap px-3 py-2 text-slate-500">{formatAdminDateTime(event.occurred_at)}</td><td className="px-3 py-2"><p className="font-medium text-slate-800">{label(event.event_name)}</p><p className="text-[10px] text-slate-400">{event.outcome}</p></td><td className="max-w-xs px-3 py-2"><code className="block truncate">{event.normalized_route}</code><span className="text-slate-500">{label(event.feature)}</span></td><td className="max-w-xs px-3 py-2"><p className="truncate">{event.email ?? event.actor_id?.slice(0, 8) ?? "Anonymous aggregate"}</p><p className="text-[10px] text-slate-400">{event.session_id?.slice(0, 8) ?? "No linkable session"}</p></td><td className="px-3 py-2 text-slate-500">{event.device_class}{event.country_code ? ` · ${event.country_code}` : ""}<br />{event.consent_state}</td><td className="px-3 py-2">{event.scan_id ? <a className="text-sky-700 hover:underline" href={getAdminAuthenticatedScanHref(event.scan_id)}>{event.hostname ?? event.scan_id.slice(0, 8)}</a> : "—"}</td></tr>) : <tr><td className="px-3 py-8 text-center text-sm text-slate-400" colSpan={6}>No product events match these filters.</td></tr>}</tbody></table></div>
        </CardContent>
      </Card>
      </AdminTableRefreshBoundary>
    </div>
  );
}
