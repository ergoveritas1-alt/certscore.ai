import Link from "next/link";
import { McpThrottleReminder } from "./mcp-throttle-reminder";
import { AdminTrafficFilters } from "../../../../components/admin/admin-traffic-filters";
import { AdminTableRefreshBoundary } from "../../../../components/admin/admin-table-refresh-boundary";
import { PaginationControls } from "../../../../components/ui/pagination-controls";
import { formatAdminDateTime } from "../../../../lib/admin/date-time";
import { type AdminTrafficScope } from "../../../../lib/admin/admin-traffic-scope";
import { discoveryBehavior, MCP_DISCOVERY_PERIODS, mcpClientHref, type McpDiscoveryClient, type McpDiscoveryPeriod } from "../../../../lib/admin/mcp-discovery";
import { AdminScansFilterForm } from "../scans/admin-scans-filter-form";
import { McpNavigation } from "./mcp-navigation";

const surfaces: Record<string, string> = { mcp_light: "Light", mcp_anonymous: "Anonymous full", mcp_authenticated: "Authenticated" };
const confidenceLabels: Record<string, string> = { verified: "Verified attribution", corroborated: "Corroborated signals", declared: "Client-declared", inferred: "Inferred", unknown: "Unverified" };
const fieldClass = "h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm";

export function McpDiscoveryView({ data, period, search, client, surface, source, traffic, page, pageSize }: {
  data: { total_count: number; items: McpDiscoveryClient[] }; period: McpDiscoveryPeriod;
  search: string; client: string | null; surface: string | null; source: string | null;
  traffic: AdminTrafficScope; page: number; pageSize: number;
}) {
  const params = { tab: "discovery", timeSpan: period, q: search, client, surface, source, traffic };
  const hasFilters = Boolean(search || client || surface || source || period !== "24h");
  return <div className="space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">Hosted MCP operations</p><h2 className="text-2xl font-semibold tracking-tight text-slate-950">MCP operations</h2></div>
      <AdminTrafficFilters basePath="/app/admin/mcp" scope={traffic} searchParams={params} />
    </div>
    <McpNavigation active="discovery" traffic={traffic} client={client} surface={surface} source={source} period={period} />
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-lg font-semibold text-slate-950">Discovery &amp; probes</h3><p className="mt-1 text-sm text-slate-600">Who connects, reads the catalogue, and goes on to use tools.</p></div>
        <p className="text-sm text-slate-500">{data.total_count.toLocaleString()} client groups · 30-second cache</p>
      </div>
      <p className="mb-4 max-w-4xl text-sm text-slate-600">Names are client-declared, not verified identities. Groups combine the same name, entrypoint and attributed provider; sessions are not people. Catalogue-only activity is not adoption or proof of intent. Agent count is unknown: clients can create a new session for every call, and requester bindings may represent shared or rotating IPs.</p>
      <AdminTableRefreshBoundary basePath="/app/admin/mcp" label="Refreshing MCP discovery">
        <div className="space-y-3">
          <AdminScansFilterForm basePath="/app/admin/mcp" clearHref={mcpClientHref("discovery", { traffic })} hasFilters={hasFilters} submitFirst>
            <input name="tab" type="hidden" value="discovery" /><input name="traffic" type="hidden" value={traffic} />
            {client ? <input name="client" type="hidden" value={client} /> : null}
            {source ? <input name="source" type="hidden" value={source} /> : null}
            <input aria-label="Search declared MCP client names" className={`${fieldClass} min-w-64 flex-1`} defaultValue={search} name="q" placeholder="Search client names" />
            <select aria-label="Discovery entrypoint" className={fieldClass} defaultValue={surface ?? ""} name="surface"><option value="">All entrypoints</option>{Object.entries(surfaces).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select aria-label="Discovery period" className={fieldClass} defaultValue={period} name="timeSpan">{Object.keys(MCP_DISCOVERY_PERIODS).map(value => <option key={value} value={value}>{value === "1h" ? "Past hour" : value === "6h" ? "Past 6 hours" : value === "24h" ? "Past 24 hours" : value === "7d" ? "Past 7 days" : "Past 30 days"}</option>)}</select>
          </AdminScansFilterForm>
          {client || source ? <p className="text-sm text-sky-800">Filtered to {client ? `client “${client}”` : "all clients"}{source ? ` · provider: ${source}` : ""}. <Link className="underline" href={mcpClientHref("discovery", { traffic, period })} prefetch={false}>Clear client filter</Link></p> : null}
          <PaginationControls basePath="/app/admin/mcp" itemLabel="client groups" page={page} pageCount={Math.max(1, Math.ceil(data.total_count / pageSize))} pageSize={pageSize} searchParams={params} showPageJump totalCount={data.total_count} visibleCount={data.items.length} />
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1450px] text-left text-xs">
              <caption className="sr-only">MCP discovery and tool activity by declared client during the selected period</caption>
              <thead className="bg-slate-50 text-slate-600"><tr>{["Declared client / attribution", "Entrypoint", "Behavior in period", "First / last seen (Pacific)", "Initializations", "Sessions listing tools", "Sessions / caller coverage", "Methods", "Tool calls / errors / limits", "Scan requests", "Successful bundles", "Usage"].map(label => <th className="px-3 py-3 font-semibold" key={label} scope="col">{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{data.items.map(row => <tr className="align-top hover:bg-slate-50" key={JSON.stringify([row.client_name, row.surface, row.source])}>
                <td className="max-w-64 break-words px-3 py-3"><p className="font-semibold text-slate-900">{row.client_name ?? "Name not recorded"}</p><p className="mt-1 text-slate-500">{row.source === "unknown" ? "Unattributed provider" : row.source} · {row.confidence.map(value => confidenceLabels[value] ?? value).join(", ")}</p></td>
                <td className="px-3 py-3">{surfaces[row.surface] ?? row.surface}</td>
                <td className="px-3 py-3"><span className={`inline-block rounded-full px-2 py-1 ${row.tool_calls > 0 ? "bg-emerald-50 text-emerald-800" : "bg-sky-50 text-sky-800"}`}>{discoveryBehavior(row)}</span></td>
                <td className="whitespace-nowrap px-3 py-3"><p>{formatAdminDateTime(row.first_seen)}</p><p className="mt-1 text-slate-500">{formatAdminDateTime(row.last_seen)}</p></td>
                <td className="px-3 py-3"><p>{row.initializations.toLocaleString()}</p><p className="mt-1 whitespace-nowrap text-slate-500">{(row.initializations / MCP_DISCOVERY_PERIODS[period]).toFixed(2)} / hour</p></td>
                <td className="px-3 py-3">{row.catalog_reads.toLocaleString()}</td><td className="px-3 py-3"><p>{row.sessions.toLocaleString()} sessions</p><p>{row.requester_ips.toLocaleString()} caller IPs · {row.actors.toLocaleString()} bindings</p><p className="mt-1 text-slate-500">{row.identity_covered_calls > 0 ? `${row.identified_callers} declared/authenticated callers across ${row.identity_covered_calls}/${row.tool_calls} calls` : "Stable caller identity unavailable"}</p></td>
                <td className="px-3 py-3 font-mono">{row.methods.map(method => <p key={method}>{method}</p>)}</td>
                <td className="px-3 py-3"><p>{row.tool_calls.toLocaleString()} / <span className={row.tool_errors ? "text-rose-700" : ""}>{row.tool_errors.toLocaleString()}</span></p><p className={`mt-1 ${row.quota_hits ? "font-semibold text-amber-800" : "text-slate-500"}`}>{row.quota_hits} rate limits · {row.http_429} HTTP 429</p>{row.error_codes?.length ? <p className="mt-1 max-w-52 break-words text-rose-700">{row.error_codes.join(", ")}</p> : null}</td>
                <td className="px-3 py-3">{row.scan_requests.toLocaleString()}</td><td className="px-3 py-3">{row.bundles.toLocaleString()}</td>
                <td className="px-3 py-3">{row.client_name ? <Link className="whitespace-nowrap font-semibold text-sky-700 underline" href={mcpClientHref("usage", { clientName: row.client_name, surface: row.surface, source: row.source, traffic, period })} prefetch={false}>View calls{period === "1h" ? " (4h)" : ""}</Link> : <span className="text-slate-400">No named client</span>}</td>
              </tr>)}{data.items.length === 0 ? <tr><td className="px-4 py-12 text-center text-sm text-slate-500" colSpan={12}>No retained discovery or tool activity matches these filters.</td></tr> : null}</tbody>
            </table>
          </div>
          <p className="text-xs leading-5 text-slate-500">First/last seen and behavior cover the selected period only. Frequency is initializations divided by the full period. Initializations and sessions listing tools are deduplicated activation events, not protocol-request totals. Methods include retained initialize, tools/list and tools/call events; other protocol requests and HTTP failures are not retained here. Errors include failed or rate-limited tool calls. Telemetry is best-effort; no recorded tool use does not prove none occurred. Internal traffic is excluded when identifiable; discovery without a linked call has only client-name attribution for that exclusion.</p>
        </div>
      </AdminTableRefreshBoundary>
    </section>
    <McpThrottleReminder />
  </div>;
}
