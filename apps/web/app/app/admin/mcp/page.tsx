import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { formatAdminDateTime } from "../../../../lib/admin/date-time";
import { loadAdminMcpTelemetryDashboard } from "../../../../server/admin/mcp-telemetry";
import { withServerTiming } from "../../../../server/performance/log-server-timing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const surfaceLabels = {
  mcp_light: "Light · /mcp/light",
  mcp_anonymous: "Anonymous full · /mcp/anonymous",
  mcp_authenticated: "Authenticated · /mcp",
} as const;

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
  if (source === "unknown") return "Unknown source";
  return `${source === "openai" ? "OpenAI" : "Anthropic"} · ${attribution.replaceAll("_", " ")}`;
}

export default async function AdminMcpTelemetryPage() {
  const dashboard = await withServerTiming("app.admin.mcp_telemetry", () => loadAdminMcpTelemetryDashboard());
  const maxDaily = Math.max(1, ...dashboard.daily.map((day) => day.invocations));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">Hosted MCP operations</p>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">MCP telemetry</h2>
        <p className="max-w-4xl text-sm leading-6 text-slate-600">
          Invocation telemetry for all hosted CertScore MCP entrypoints. OpenAI or Anthropic attribution is shown only when a verified network or a bounded self-declared client signal exists; unknown traffic is not reassigned to a provider.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
        This dashboard measures requests that reach CertScore.ai infrastructure. It does not measure ChatGPT directory impressions, searches, plugin suggestions, install impressions, or cases where ChatGPT considered CertScore.ai but did not invoke it.
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Today", number(dashboard.metrics.invocationsToday), "All tool invocations"],
          ["Last 7 days", number(dashboard.metrics.invocations7d), "All entrypoints"],
          ["Last 30 days", number(dashboard.metrics.invocations30d), "Retained invocations"],
          ["Opaque sessions", number(dashboard.metrics.sessions30d), "Where measurable"],
          ["Opaque actors", number(dashboard.metrics.actors30d), "Where safely measurable"],
          ["Latency", `${duration(dashboard.metrics.p50DurationMs30d)} / ${duration(dashboard.metrics.p95DurationMs30d)}`, "Median / p95"],
        ].map(([title, value, detail]) => (
          <Card className="border-slate-200 bg-white" key={title}>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">{title}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="border-slate-200 bg-white">
          <CardHeader><CardTitle>30-day activity</CardTitle></CardHeader>
          <CardContent>
            <div aria-label="Daily MCP invocation trend" className="flex h-52 items-end gap-1" role="img">
              {dashboard.daily.map((day) => (
                <div className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1" key={day.day} title={`${day.day}: ${day.invocations} calls, ${day.errors} errors, ${day.quotaLimited} quota limited`}>
                  <div className="w-full rounded-t bg-sky-500 transition group-hover:bg-sky-600" style={{ height: `${Math.max(day.invocations > 0 ? 4 : 1, (day.invocations / maxDaily) * 176)}px` }} />
                  <span className="sr-only">{day.day}: {day.invocations} invocations</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-xs text-slate-500"><span>{dashboard.daily[0]?.day ?? "30 days ago"}</span><span>{dashboard.daily.at(-1)?.day ?? "Today"}</span></div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader><CardTitle>Rates · last 30 days</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            {[
              ["Scan reuse", percentage(dashboard.rates.scanReuseRate)],
              ["Errors", percentage(dashboard.rates.errorRate)],
              ["Quota hits", percentage(dashboard.rates.quotaHitRate)],
              ["Bundles / scan", dashboard.rates.bundlePerScanRatio?.toFixed(2) ?? "—"],
              ["Status polls / scan", dashboard.rates.statusPollsPerScanRatio?.toFixed(2) ?? "—"],
              ["Successful", number(dashboard.metrics.successes30d)],
            ].map(([label, value]) => <div className="rounded-xl border border-slate-200 p-3" key={label}><p className="text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-slate-950">{value}</p></div>)}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-white">
        <CardHeader><CardTitle>Entrypoints · last 30 days</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {(["mcp_light", "mcp_anonymous", "mcp_authenticated"] as const).map((surface) => {
            const row = dashboard.surfaces.find((item) => item.surface === surface);
            return <div className="rounded-2xl border border-slate-200 p-4" key={surface}><p className="font-semibold text-slate-950">{surfaceLabels[surface]}</p><p className="mt-3 text-2xl font-semibold">{number(row?.calls ?? 0)}</p><p className="mt-1 text-sm text-slate-600">Sessions {number(row?.sessions ?? 0)} · Actors {number(row?.actors ?? 0)} · Errors {number(row?.errors ?? 0)}</p></div>;
          })}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader><CardTitle>Operational totals · last 30 days</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {[
            ["Scan requests", dashboard.metrics.scans30d],
            ["Status requests", dashboard.metrics.statusPolls30d],
            ["Bundle requests", dashboard.metrics.bundles30d],
            ["Reused scans", dashboard.metrics.reusedScans30d],
            ["New scans", dashboard.metrics.newScans30d],
            ["Successful", dashboard.metrics.successes30d],
            ["Failed", dashboard.metrics.errors30d],
            ["Quota limited", dashboard.metrics.quotaLimited30d],
          ].map(([label, value]) => <div className="rounded-xl border border-slate-200 p-3" key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-slate-950">{number(Number(value))}</p></div>)}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-slate-200 bg-white">
          <CardHeader><CardTitle>Tool distribution and latency</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-2 pr-3">Entrypoint</th><th className="py-2 pr-3">Tool</th><th className="py-2 pr-3">Calls</th><th className="py-2 pr-3">Errors</th><th className="py-2 pr-3">p50</th><th className="py-2">p95</th></tr></thead><tbody className="divide-y divide-slate-100">{dashboard.tools.map((tool) => <tr key={`${tool.surface}:${tool.toolName}`}><td className="py-2 pr-3 text-slate-600">{surfaceLabels[tool.surface]}</td><td className="py-2 pr-3 font-mono text-xs text-slate-900">{tool.toolName}</td><td className="py-2 pr-3">{number(tool.calls)}</td><td className="py-2 pr-3">{number(tool.errors)}</td><td className="py-2 pr-3">{duration(tool.p50DurationMs)}</td><td className="py-2">{duration(tool.p95DurationMs)}</td></tr>)}</tbody></table>
            {dashboard.tools.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No retained MCP invocations yet.</p> : null}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader><CardTitle>Source and access signals</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {dashboard.sources.map((source, index) => <div className="rounded-xl border border-slate-200 p-3" key={`${source.surface}:${source.source}:${source.sourceAttribution}:${source.clientFamily}:${index}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-slate-900">{sourceLabel(source.source, source.sourceAttribution)}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{surfaceLabels[source.surface]}</span></div><p className="mt-1 text-sm text-slate-600">{source.clientFamily.replaceAll("_", " ")} · {source.authClass} · {number(source.calls)} calls · {number(source.sessions)} sessions · {number(source.actors)} actors</p></div>)}
            {dashboard.sources.length === 0 ? <p className="text-sm text-slate-500">No source signals retained yet.</p> : null}
            <p className="text-xs leading-5 text-slate-500">Self-declared headers and client names are useful routing signals but are not verified provider identity. Verified attribution currently applies only to recognized provider egress.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-white">
        <CardHeader><CardTitle>Frequently requested hostnames · last 30 days</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-2 pr-4">Hostname</th><th className="py-2 pr-4">Scan requests</th><th className="py-2 pr-4">All calls</th><th className="py-2">Last requested</th></tr></thead><tbody className="divide-y divide-slate-100">{dashboard.topHostnames.map((host) => <tr key={host.hostname}><td className="py-2 pr-4 font-mono text-xs text-slate-900">{host.hostname}</td><td className="py-2 pr-4">{number(host.scanRequests)}</td><td className="py-2 pr-4">{number(host.calls)}</td><td className="py-2">{formatAdminDateTime(host.lastRequestedAt)}</td></tr>)}</tbody></table>
          {dashboard.topHostnames.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No requested hostnames retained yet.</p> : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader><CardTitle>Recent invocations</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-2 pr-3">Occurred</th><th className="py-2 pr-3">Entrypoint</th><th className="py-2 pr-3">Source</th><th className="py-2 pr-3">Tool</th><th className="py-2 pr-3">Target</th><th className="py-2 pr-3">Decision</th><th className="py-2 pr-3">Outcome</th><th className="py-2 pr-3">Latency</th><th className="py-2">Opaque IDs</th></tr></thead><tbody className="divide-y divide-slate-100">{dashboard.recent.map((event, index) => <tr key={`${event.occurred_at}:${event.tool_name}:${index}`}><td className="py-2 pr-3">{formatAdminDateTime(event.occurred_at)}</td><td className="py-2 pr-3">{surfaceLabels[event.surface]}</td><td className="py-2 pr-3">{sourceLabel(event.source, event.source_attribution)}</td><td className="py-2 pr-3 font-mono">{event.tool_name}</td><td className="py-2 pr-3 font-mono">{event.target_hostname ?? "—"}</td><td className="py-2 pr-3">{event.scan_decision.replaceAll("_", " ")}</td><td className="py-2 pr-3">{event.outcome}{event.error_code ? ` · ${event.error_code}` : ""}</td><td className="py-2 pr-3">{duration(event.duration_ms)}</td><td className="py-2 font-mono text-[10px] text-slate-500">session {event.session_id ?? "—"}<br />actor {event.actor_id ?? "—"}</td></tr>)}</tbody></table>
          {dashboard.recent.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No retained MCP invocations yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
