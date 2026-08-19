import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { PaginationControls, normalizePage, normalizePageSize } from "../../../../components/ui/pagination-controls";
import { formatAdminDateTime } from "../../../../lib/admin/date-time";
import { getAdminAuthenticatedScanHref } from "../../../../server/admin/admin-scan-links";
import { loadAdminMcpTelemetryDashboard, listAdminMcpTelemetryEventsPage, type AdminMcpSnapshotPeriod, type AdminMcpTelemetryEvent } from "../../../../server/admin/mcp-telemetry";
import { withServerTiming } from "../../../../server/performance/log-server-timing";
import { AdminScansFilterForm } from "../scans/admin-scans-filter-form";
import { CanaryTrafficToggle } from "../../../../components/admin/canary-traffic-toggle";
import { AdminTableRefreshBoundary } from "../../../../components/admin/admin-table-refresh-boundary";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const surfaceLabels = {
  mcp_light: "Light · /mcp/light",
  mcp_anonymous: "Anonymous full · /mcp/anonymous",
  mcp_authenticated: "Authenticated · /mcp",
} as const;

const surfaces = ["mcp_light", "mcp_anonymous", "mcp_authenticated"] as const;
const sources = ["openai", "anthropic", "unknown"] as const;
const outcomes = ["success", "error", "rate_limited"] as const;
const scanDecisions = ["reused", "new", "unavailable", "not_applicable"] as const;
const timeSpans = ["all", "4h", "12h", "24h", "7d", "30d"] as const;
const snapshotPeriods = ["1h", "24h", "7d", "30d", "1y"] as const;

type AdminMcpPageProps = {
  searchParams?: Promise<{
    decision?: string;
    includeCanary?: string;
    outcome?: string;
    page?: string;
    perPage?: string;
    q?: string;
    source?: string;
    sourcePeriod?: string;
    snapshot?: string;
    surface?: string;
    timeSpan?: string;
    tool?: string;
    toolPeriod?: string;
  }>;
};

function number(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function percentage(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function duration(value: number | null) {
  if (value === null) return "—";
  return value >= 1_000 ? `${(value / 1_000).toFixed(2)}s` : `${Math.round(value)}ms`;
}

function sourceLabel(source: string, attribution: string) {
  const allowedAttribution = new Set(["verified_network", "self_declared_header", "self_declared_client"]);
  if ((source !== "openai" && source !== "anthropic") || !allowedAttribution.has(attribution)) {
    return "Unknown source";
  }
  return `${source === "openai" ? "OpenAI" : "Anthropic"} · ${attribution.replaceAll("_", " ")}`;
}

function normalizeOption<T extends string>(value: string | undefined, options: readonly T[]): T | null {
  return options.includes(value as T) ? value as T : null;
}

function formatLabel(value: string | null) {
  return value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "—";
}

function formatRequestedDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: "Unavailable", time: "" };
  return {
    date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }).format(parsed),
    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Los_Angeles", timeZoneName: "short" }).format(parsed),
  };
}

function outcomePresentation(outcome: AdminMcpTelemetryEvent["outcome"]) {
  if (outcome === "success") return { dot: "bg-emerald-500", label: "Success", text: "text-slate-700" };
  if (outcome === "rate_limited") return { dot: "bg-amber-400", label: "Rate limited", text: "text-amber-700" };
  return { dot: "bg-rose-500", label: "Failed", text: "text-rose-700" };
}

function surfaceClass(surface: AdminMcpTelemetryEvent["surface"]) {
  if (surface === "mcp_light") return "bg-sky-50 text-sky-700 ring-sky-100";
  if (surface === "mcp_authenticated") return "bg-violet-50 text-violet-700 ring-violet-100";
  return "bg-cyan-50 text-cyan-700 ring-cyan-100";
}

function sourceClass(source: AdminMcpTelemetryEvent["source"], attribution: string) {
  if (sourceLabel(source, attribution) === "Unknown source") return "bg-slate-100 text-slate-600 ring-slate-200";
  if (source === "openai") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (source === "anthropic") return "bg-amber-50 text-amber-700 ring-amber-100";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function decisionClass(decision: AdminMcpTelemetryEvent["scan_decision"]) {
  if (decision === "reused") return "bg-sky-50 text-sky-700 ring-sky-100";
  if (decision === "new") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (decision === "unavailable") return "bg-rose-50 text-rose-700 ring-rose-100";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

export default async function AdminMcpTelemetryPage({ searchParams }: AdminMcpPageProps) {
  const resolved = searchParams ? await searchParams : {};
  const page = normalizePage(resolved.page);
  const pageSize = normalizePageSize(resolved.perPage, 20);
  const activeQuery = resolved.q?.trim().slice(0, 160) ?? "";
  const includeCanary = resolved.includeCanary === "1";
  const activeSurface = normalizeOption(resolved.surface, surfaces);
  const activeSource = normalizeOption(resolved.source, sources);
  const activeOutcome = normalizeOption(resolved.outcome, outcomes);
  const activeDecision = normalizeOption(resolved.decision, scanDecisions);
  const activeTimeSpan = normalizeOption(resolved.timeSpan, timeSpans) ?? "30d";
  const activeSnapshotPeriod = normalizeOption(resolved.snapshot, snapshotPeriods) ?? "24h";
  const activeToolPeriod = normalizeOption(resolved.toolPeriod, snapshotPeriods) ?? "24h";
  const activeSourcePeriod = normalizeOption(resolved.sourcePeriod, snapshotPeriods) ?? "24h";
  const activeTool = resolved.tool?.trim().slice(0, 100) ?? "";
  const hasFilters = Boolean(activeQuery || activeSurface || activeSource || activeOutcome || activeDecision || activeTool || activeTimeSpan !== "30d");
  const [dashboard, eventPage] = await Promise.all([
    withServerTiming("app.admin.mcp_telemetry", () => loadAdminMcpTelemetryDashboard(
      activeSnapshotPeriod as AdminMcpSnapshotPeriod,
      activeToolPeriod as AdminMcpSnapshotPeriod,
      activeSourcePeriod as AdminMcpSnapshotPeriod,
      includeCanary,
    )),
    withServerTiming("app.admin.mcp_telemetry.rows", () => listAdminMcpTelemetryEventsPage(pageSize, (page - 1) * pageSize, {
      outcome: activeOutcome,
      query: activeQuery || null,
      scanDecision: activeDecision,
      source: activeSource,
      surface: activeSurface,
      timeSpan: activeTimeSpan,
      toolName: activeTool || null,
      includeCanary,
    })),
  ]);
  const maxTrend = Math.max(1, ...dashboard.trend.map((bucket) => bucket.invocations));
  const hasActivity = dashboard.retention.totalEvents > 0 || dashboard.metrics.invocations > 0;
  const pageCount = Math.max(1, Math.ceil(eventPage.totalCount / pageSize));
  const toolOptions = Array.from(new Set([activeTool, ...dashboard.tools.map((tool) => tool.toolName)].filter(Boolean))).sort();
  const summaryMetrics = [
    ["Requests", number(dashboard.metrics.invocations), dashboard.snapshot.label],
    ["Sessions", number(dashboard.metrics.sessions), "opaque"],
    ["Actors", number(dashboard.metrics.actors), "opaque"],
    ["Scans", number(dashboard.metrics.scans), "tool calls"],
    ["Successful", number(dashboard.metrics.successes), "requests"],
    ["Latency", `${duration(dashboard.metrics.p50DurationMs)} / ${duration(dashboard.metrics.p95DurationMs)}`, "p50 / p95"],
  ];
  const rateMetrics = [
    ["Reuse", percentage(dashboard.rates.scanReuseRate)],
    ["Errors", percentage(dashboard.rates.errorRate)],
    ["Quota", percentage(dashboard.rates.quotaHitRate)],
    ["Bundles / scan", dashboard.rates.bundlePerScanRatio?.toFixed(2) ?? "—"],
    ["Polls / scan", dashboard.rates.statusPollsPerScanRatio?.toFixed(2) ?? "—"],
    ["New scans", number(dashboard.metrics.newScans)],
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">Hosted MCP operations</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">MCP operations</h2>
        </div>
        <div className="flex items-center gap-3">
          <CanaryTrafficToggle basePath="/app/admin/mcp" includeCanary={includeCanary} searchParams={resolved} />
          {dashboard.retention.totalEvents > 0 ? (
          <p className="text-xs text-slate-500">
            {dashboard.retention.days}d retention · {number(dashboard.retention.totalEvents)} events
            {dashboard.retention.expiredEvents > 0 ? ` · ${number(dashboard.retention.expiredEvents)} pending prune` : ""}
          </p>
          ) : null}
        </div>
      </div>

      <Card className="overflow-hidden border-slate-200 bg-white">
        <CardHeader className="border-b border-slate-100 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Operational snapshot</CardTitle>
              <p className="mt-0.5 text-xs text-slate-500">All hosted MCP entrypoints · {dashboard.snapshot.label}{activeSnapshotPeriod === "1y" ? ` · limited to ${dashboard.retention.days}d retained data` : ""}</p>
            </div>
            <form action="/app/admin/mcp" className="flex items-center gap-2" method="get">
              {activeQuery ? <input name="q" type="hidden" value={activeQuery} /> : null}
              {activeSurface ? <input name="surface" type="hidden" value={activeSurface} /> : null}
              {activeSource ? <input name="source" type="hidden" value={activeSource} /> : null}
              {activeTool ? <input name="tool" type="hidden" value={activeTool} /> : null}
              {activeOutcome ? <input name="outcome" type="hidden" value={activeOutcome} /> : null}
              {activeDecision ? <input name="decision" type="hidden" value={activeDecision} /> : null}
              <input name="timeSpan" type="hidden" value={activeTimeSpan} />
              <input name="toolPeriod" type="hidden" value={activeToolPeriod} />
              <input name="sourcePeriod" type="hidden" value={activeSourcePeriod} />
              {includeCanary ? <input name="includeCanary" type="hidden" value="1" /> : null}
              <label className="sr-only" htmlFor="mcp-snapshot-period">Snapshot period</label>
              <select className="h-9 rounded-full border border-slate-300 bg-white px-3 text-sm text-slate-700" defaultValue={activeSnapshotPeriod} id="mcp-snapshot-period" name="snapshot">
                <option value="1h">Last hour</option>
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="1y">Last year (retained data)</option>
              </select>
              <button className="app-raised-button inline-flex h-9 items-center rounded-full px-3 text-sm font-semibold text-slate-700" type="submit">Apply</button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-3 gap-px bg-slate-100 sm:grid-cols-6">
            {summaryMetrics.map(([label, value, detail]) => (
              <div className="min-w-0 bg-white px-3 py-2.5" key={label}>
                <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-0.5 truncate text-lg font-semibold text-slate-950">{value}</p>
                <p className="truncate text-[10px] text-slate-400">{detail}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 border-t border-slate-100 p-3 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-700">{dashboard.snapshot.label} activity</p><p className="text-[10px] text-slate-400">{dashboard.trend[0]?.label ?? "Start"} — {dashboard.trend.at(-1)?.label ?? "Now"}</p></div>
              <div aria-label={`MCP request trend: ${number(dashboard.metrics.invocations)} requests during ${dashboard.snapshot.label.toLowerCase()}`} className="flex h-14 items-end gap-1" role="img">
                {dashboard.trend.map((bucket, index) => (
                  <div aria-hidden="true" className="min-w-0 flex-1 rounded-t bg-sky-500 transition hover:bg-sky-600" key={`${bucket.label}:${index}`} style={{ height: `${Math.max(bucket.invocations > 0 ? 4 : 1, (bucket.invocations / maxTrend) * 56)}px` }} title={`${bucket.label}: ${bucket.invocations} requests, ${bucket.errors} errors, ${bucket.quotaLimited} quota limited`} />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {rateMetrics.map(([label, value]) => <div className="rounded-lg bg-slate-50 px-2 py-1.5" key={label}><p className="truncate text-[10px] text-slate-500">{label}</p><p className="mt-0.5 text-sm font-semibold text-slate-950">{value}</p></div>)}
            </div>
          </div>

          <div className="grid gap-px border-t border-slate-100 bg-slate-100 md:grid-cols-3">
            {surfaces.map((surface) => {
              const row = dashboard.surfaces.find((item) => item.surface === surface);
              return <div className="flex items-center justify-between gap-3 bg-white px-3 py-2.5" key={surface}><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-900">{surfaceLabels[surface]}</p><p className="truncate text-[10px] text-slate-500">{number(row?.sessions ?? 0)} sessions · {number(row?.actors ?? 0)} actors · {number(row?.errors ?? 0)} errors</p></div><p className="shrink-0 text-lg font-semibold text-slate-950">{number(row?.calls ?? 0)}</p></div>;
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden border-slate-200 bg-white">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>MCP request activity</CardTitle>
              <p className="mt-1 text-sm text-slate-500">Every retained tool request across hosted MCP entrypoints.</p>
            </div>
            <p className="text-sm text-slate-500">{number(eventPage.totalCount)} matching requests</p>
          </div>
        </CardHeader>
        <AdminTableRefreshBoundary basePath="/app/admin/mcp" label="Refreshing MCP requests">
        <CardContent className="min-w-0 space-y-3 pt-0">
          <AdminScansFilterForm basePath="/app/admin/mcp" clearHref="/app/admin/mcp" hasFilters={hasFilters} submitFirst>
            <input name="snapshot" type="hidden" value={activeSnapshotPeriod} />
            <input name="toolPeriod" type="hidden" value={activeToolPeriod} />
            <input name="sourcePeriod" type="hidden" value={activeSourcePeriod} />
            {includeCanary ? <input name="includeCanary" type="hidden" value="1" /> : null}
            <input aria-label="Filter MCP requests by hostname, scan ID, request ID, opaque ID, tool, client, or error" className="h-10 min-w-[24rem] flex-[1_1_28rem] rounded-lg border border-slate-300 bg-white px-3 text-sm" defaultValue={activeQuery} name="q" placeholder="Hostname, scan ID, request ID, session, actor, client, error" />
            <select aria-label="Filter MCP requests by entrypoint" className="h-10 w-[10.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeSurface ?? ""} name="surface"><option value="">Any entrypoint</option>{surfaces.map((surface) => <option key={surface} value={surface}>{surfaceLabels[surface]}</option>)}</select>
            <select aria-label="Filter MCP requests by provider signal" className="h-10 w-[8.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeSource ?? ""} name="source"><option value="">Any provider</option>{sources.map((source) => <option key={source} value={source}>{source === "unknown" ? "Unknown" : `${formatLabel(source)} signal`}</option>)}</select>
            <select aria-label="Filter MCP requests by tool" className="h-10 w-[13rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeTool} name="tool"><option value="">Any tool</option>{toolOptions.map((tool) => <option key={tool} value={tool}>{tool}</option>)}</select>
            <select aria-label="Filter MCP requests by outcome" className="h-10 w-[8.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeOutcome ?? ""} name="outcome"><option value="">Any outcome</option>{outcomes.map((outcome) => <option key={outcome} value={outcome}>{formatLabel(outcome)}</option>)}</select>
            <select aria-label="Filter MCP requests by scan decision" className="h-10 w-[9rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeDecision ?? ""} name="decision"><option value="">Any decision</option>{scanDecisions.map((decision) => <option key={decision} value={decision}>{formatLabel(decision)}</option>)}</select>
            <select aria-label="Filter MCP requests by time span" className="h-10 w-[8.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeTimeSpan} name="timeSpan">{timeSpans.map((timeSpan) => <option key={timeSpan} value={timeSpan}>{timeSpan === "all" ? "All retained" : timeSpan === "4h" ? "Past 4 hours" : timeSpan === "12h" ? "Past 12 hours" : timeSpan === "24h" ? "Past 24 hours" : timeSpan === "7d" ? "Past 7 days" : "Past 30 days"}</option>)}</select>
          </AdminScansFilterForm>

          <PaginationControls basePath="/app/admin/mcp" itemLabel="MCP requests" page={page} pageCount={pageCount} pageSize={pageSize} searchParams={{ q: activeQuery, surface: activeSurface, source: activeSource, tool: activeTool, outcome: activeOutcome, decision: activeDecision, timeSpan: activeTimeSpan, snapshot: activeSnapshotPeriod, toolPeriod: activeToolPeriod, sourcePeriod: activeSourcePeriod, includeCanary: includeCanary ? "1" : null }} showPageJump totalCount={eventPage.totalCount} visibleCount={eventPage.items.length} />

          <div className="w-full max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200">
            <table className="w-[1760px] min-w-[1760px] table-fixed text-left text-xs">
              <colgroup>
                <col className="w-[105px]" /><col className="w-[160px]" /><col className="w-[175px]" /><col className="w-[110px]" />
                <col className="w-[220px]" /><col className="w-[210px]" /><col className="w-[95px]" /><col className="w-[95px]" />
                <col className="w-[75px]" /><col className="w-[165px]" /><col className="w-[180px]" /><col className="w-[110px]" /><col className="w-[60px]" />
              </colgroup>
              <thead className="sticky top-0 z-20 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                <tr>{[
                  { label: "Status", className: "sticky left-0 z-30 bg-slate-50" }, { label: "Entrypoint" }, { label: "Provider / client" },
                  { label: "Requested" }, { label: "Target" }, { label: "Tool" }, { label: "Decision" }, { label: "Perspective" },
                  { label: "Latency" }, { label: "Scan ID" }, { label: "Request / event" }, { label: "Opaque IDs" },
                  { label: "Open", className: "sticky right-0 z-30 bg-slate-50" },
                ].map(({ label, className }) => <th className={`border-b border-slate-200 px-2.5 py-1.5 font-semibold ${className ?? ""}`} key={label}>{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                {eventPage.items.map((event) => {
                  const outcome = outcomePresentation(event.outcome);
                  const requested = formatRequestedDateTime(event.occurred_at);
                  const scanHref = getAdminAuthenticatedScanHref(event.scan_id);
                  return (
                    <tr className="group h-[54px] hover:bg-slate-50/70" key={event.event_id}>
                      <td className="sticky left-0 z-10 bg-white px-2.5 py-1.5 group-hover:bg-slate-50"><span className={`inline-flex items-center gap-1.5 font-semibold ${outcome.text}`}><span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${outcome.dot}`} />{outcome.label}</span>{event.error_code ? <p className="mt-0.5 truncate text-[10px] text-rose-600" title={event.error_code}>{event.error_code}</p> : null}</td>
                      <td className="px-2.5 py-1.5"><span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${surfaceClass(event.surface)}`}>{surfaceLabels[event.surface]}</span><p className="mt-1 text-[10px] text-slate-500">{event.auth_class}</p></td>
                      <td className="px-2.5 py-1.5"><span className={`inline-flex max-w-full truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${sourceClass(event.source, event.source_attribution)}`}>{sourceLabel(event.source, event.source_attribution)}</span><p className="mt-1 truncate text-[10px] text-slate-500" title={event.client_family}>{formatLabel(event.client_family)}</p></td>
                      <td className="px-2.5 py-1.5 text-[10px] leading-4" title={formatAdminDateTime(event.occurred_at)}><p>{requested.date}</p><p className="text-slate-500">{requested.time}</p></td>
                      <td className="px-2.5 py-1.5"><p className="truncate font-mono text-[11px] font-semibold text-slate-900" title={event.target_hostname ?? "No target hostname"}>{event.target_hostname ?? "—"}</p><p className="mt-1 truncate text-[10px] text-slate-500">{event.freshness ? formatLabel(event.freshness) : "No freshness"}</p></td>
                      <td className="px-2.5 py-1.5"><p className="truncate font-mono text-[10px] font-semibold text-slate-900" title={event.tool_name}>{event.tool_name}</p><p className="mt-1 truncate text-[10px] text-slate-500">{formatLabel(event.transport_outcome)}</p></td>
                      <td className="px-2.5 py-1.5"><span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${decisionClass(event.scan_decision)}`}>{formatLabel(event.scan_decision)}</span>{event.scan_status ? <p className="mt-1 truncate text-[10px] text-slate-500">{formatLabel(event.scan_status)}</p> : null}</td>
                      <td className="px-2.5 py-1.5 font-medium text-slate-700">{event.scan_from ? formatLabel(event.scan_from) : "—"}</td>
                      <td className="px-2.5 py-1.5 font-semibold text-slate-900">{duration(event.duration_ms)}</td>
                      <td className="px-2.5 py-1.5"><p className="truncate font-mono text-[10px]" title={event.scan_id ?? undefined}>{event.scan_id ?? "—"}</p></td>
                      <td className="px-2.5 py-1.5 font-mono text-[10px] text-slate-500"><p className="truncate" title={event.request_id}>req {event.request_id}</p><p className="mt-1 truncate" title={event.event_id}>evt {event.event_id}</p></td>
                      <td className="px-2.5 py-1.5 font-mono text-[10px] text-slate-500"><p className="truncate" title={event.session_id ?? undefined}>session {event.session_id ?? "—"}</p><p className="mt-1 truncate" title={event.actor_id ?? undefined}>actor {event.actor_id ?? "—"}</p></td>
                      <td className="sticky right-0 z-10 border-l border-slate-100 bg-white px-2 py-1.5 text-center group-hover:bg-slate-50">{scanHref ? <Link aria-label={`Open scan ${event.scan_id}`} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white font-semibold text-sky-700" href={scanHref} prefetch={false}>→</Link> : <span className="text-slate-300">—</span>}</td>
                    </tr>
                  );
                })}
                {eventPage.items.length === 0 ? <tr><td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={13}>No MCP requests match these filters.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </CardContent>
        </AdminTableRefreshBoundary>
      </Card>

      <Card className="border-slate-200 bg-white">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><CardTitle>Tool distribution and latency</CardTitle><p className="mt-0.5 text-xs text-slate-500">{dashboard.toolAnalytics.label} · p50 / p95{activeToolPeriod === "1y" ? ` · limited to ${dashboard.retention.days}d retained data` : ""}</p></div>
                <form action="/app/admin/mcp" className="flex items-center gap-2" method="get">
                  {activeQuery ? <input name="q" type="hidden" value={activeQuery} /> : null}{activeSurface ? <input name="surface" type="hidden" value={activeSurface} /> : null}{activeSource ? <input name="source" type="hidden" value={activeSource} /> : null}{activeTool ? <input name="tool" type="hidden" value={activeTool} /> : null}{activeOutcome ? <input name="outcome" type="hidden" value={activeOutcome} /> : null}{activeDecision ? <input name="decision" type="hidden" value={activeDecision} /> : null}
                  <input name="timeSpan" type="hidden" value={activeTimeSpan} /><input name="snapshot" type="hidden" value={activeSnapshotPeriod} /><input name="sourcePeriod" type="hidden" value={activeSourcePeriod} />
                  {includeCanary ? <input name="includeCanary" type="hidden" value="1" /> : null}
                  <label className="sr-only" htmlFor="mcp-tool-period">Tool analytics period</label>
                  <select className="h-9 rounded-full border border-slate-300 bg-white px-3 text-sm text-slate-700" defaultValue={activeToolPeriod} id="mcp-tool-period" name="toolPeriod"><option value="1h">Last hour</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="1y">Last year (retained data)</option></select>
                  <button className="app-raised-button inline-flex h-9 items-center rounded-full px-3 text-sm font-semibold text-slate-700" type="submit">Apply</button>
                </form>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto pt-0">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3">Entrypoint</th>
                    <th className="py-2 pr-3">Tool</th>
                    <th className="py-2 pr-3">Calls</th>
                    <th className="py-2 pr-3">Errors</th>
                    <th className="py-2 pr-3">p50</th>
                    <th className="py-2">p95</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dashboard.tools.map((tool) => (
                    <tr key={`${tool.surface}:${tool.toolName}`}>
                      <td className="py-2 pr-3 text-slate-600">{surfaceLabels[tool.surface]}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-slate-900">{tool.toolName}</td>
                      <td className="py-2 pr-3">{number(tool.calls)}</td>
                      <td className="py-2 pr-3">{number(tool.errors)}</td>
                      <td className="py-2 pr-3">{duration(tool.p50DurationMs)}</td>
                      <td className="py-2">{duration(tool.p95DurationMs)}</td>
                    </tr>
                  ))}
                  {dashboard.tools.length === 0 ? <tr><td className="py-8 text-center text-sm text-slate-500" colSpan={6}>No tool activity retained during {dashboard.toolAnalytics.label.toLowerCase()}.</td></tr> : null}
                </tbody>
              </table>
            </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><CardTitle>Source and access signals</CardTitle><p className="mt-0.5 text-xs text-slate-500">{dashboard.sourceAnalytics.label}{activeSourcePeriod === "1y" ? ` · limited to ${dashboard.retention.days}d retained data` : ""}</p></div>
                <form action="/app/admin/mcp" className="flex items-center gap-2" method="get">
                  {activeQuery ? <input name="q" type="hidden" value={activeQuery} /> : null}{activeSurface ? <input name="surface" type="hidden" value={activeSurface} /> : null}{activeSource ? <input name="source" type="hidden" value={activeSource} /> : null}{activeTool ? <input name="tool" type="hidden" value={activeTool} /> : null}{activeOutcome ? <input name="outcome" type="hidden" value={activeOutcome} /> : null}{activeDecision ? <input name="decision" type="hidden" value={activeDecision} /> : null}
                  <input name="timeSpan" type="hidden" value={activeTimeSpan} /><input name="snapshot" type="hidden" value={activeSnapshotPeriod} /><input name="toolPeriod" type="hidden" value={activeToolPeriod} />
                  {includeCanary ? <input name="includeCanary" type="hidden" value="1" /> : null}
                  <label className="sr-only" htmlFor="mcp-source-period">Source analytics period</label>
                  <select className="h-9 rounded-full border border-slate-300 bg-white px-3 text-sm text-slate-700" defaultValue={activeSourcePeriod} id="mcp-source-period" name="sourcePeriod"><option value="1h">Last hour</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="1y">Last year (retained data)</option></select>
                  <button className="app-raised-button inline-flex h-9 items-center rounded-full px-3 text-sm font-semibold text-slate-700" type="submit">Apply</button>
                </form>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="grid gap-2 lg:grid-cols-2">
                {dashboard.sources.map((source, index) => (
                  <div className="rounded-xl border border-slate-200 px-3 py-2.5" key={`${source.surface}:${source.source}:${source.sourceAttribution}:${source.clientFamily}:${index}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">{sourceLabel(source.source, source.sourceAttribution)}</p>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{surfaceLabels[source.surface]}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{source.clientFamily.replaceAll("_", " ")} · {source.authClass} · {number(source.calls)} calls · {number(source.sessions)} sessions · {number(source.actors)} actors</p>
                  </div>
                ))}
                {dashboard.sources.length === 0 ? <p className="text-sm text-slate-500">No source signals retained during {dashboard.sourceAnalytics.label.toLowerCase()}.</p> : null}
              </div>
              <p className="text-xs leading-5 text-slate-500">Self-declared headers and client names are useful routing signals but are not verified provider identity. Verified attribution currently applies only to recognized provider egress.</p>
            </CardContent>
      </Card>

      {hasActivity ? (
        <>
          <details className="group rounded-xl border border-slate-200 bg-white">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900 marker:hidden">Frequently requested hostnames <span className="float-right text-slate-400 group-open:rotate-180">⌄</span></summary>
            <div className="overflow-x-auto border-t border-slate-100 px-4 pb-4">
          <table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-2 pr-4">Hostname</th><th className="py-2 pr-4">Scan requests</th><th className="py-2 pr-4">All calls</th><th className="py-2">Last requested</th></tr></thead><tbody className="divide-y divide-slate-100">{dashboard.topHostnames.map((host) => <tr key={host.hostname}><td className="py-2 pr-4 font-mono text-xs text-slate-900">{host.hostname}</td><td className="py-2 pr-4">{number(host.scanRequests)}</td><td className="py-2 pr-4">{number(host.calls)}</td><td className="py-2">{formatAdminDateTime(host.lastRequestedAt)}</td></tr>)}</tbody></table>
          {dashboard.topHostnames.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No requested hostnames retained yet.</p> : null}
            </div>
          </details>

        </>
      ) : null}
    </div>
  );
}
