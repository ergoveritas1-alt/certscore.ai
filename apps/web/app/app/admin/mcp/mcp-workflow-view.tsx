import { McpSessionFunnel } from "./mcp-session-funnel";
import type { McpFunnelData } from "../../../../lib/admin/mcp-funnel";
import React from "react";
import Link from "next/link";
import { MCP_TASK_PURPOSES } from "@website-signal-risk-scanner/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { AdminTrafficFilters } from "../../../../components/admin/admin-traffic-filters";
import { PaginationControls } from "../../../../components/ui/pagination-controls";
import { formatAdminDateTime } from "../../../../lib/admin/date-time";
import { buildMcpWorkflows, type McpWorkflowEvent } from "../../../../lib/admin/mcp-workflows";
import { type AdminTrafficScope } from "../../../../lib/admin/admin-traffic-scope";
import { MCP_DISCOVERY_PERIODS, type McpDiscoveryPeriod } from "../../../../lib/admin/mcp-discovery";
import { McpNavigation } from "./mcp-navigation";
import { McpThrottleReminder } from "./mcp-throttle-reminder";

export function McpWorkflowView({ funnel, followUpMinutes, events, totalEvents, period, traffic, client, surface, source, search, purpose, page, pageSize }: {
  funnel: McpFunnelData; followUpMinutes: number; events: McpWorkflowEvent[]; totalEvents: number; period: McpDiscoveryPeriod; traffic: AdminTrafficScope;
  client: string | null; surface: string | null; source: string | null; search: string; purpose: string; page: number; pageSize: number;
}) {
  const all = buildMcpWorkflows(events);
  const groups = all.filter(group => (!purpose || (purpose === "unknown" ? !group.purposes.length || group.purposes.includes("unknown") : group.purposes.includes(purpose)))
    && (!search || [group.first.client_name, group.first.scan_id, ...group.purposes, ...group.questions, ...group.integrations, ...group.clients, ...group.servers, ...group.schemas, ...group.friction].join(" ").toLowerCase().includes(search.toLowerCase())));
  const pageCount = Math.max(1, Math.ceil(groups.length / pageSize));
  const currentPage = Math.max(1, Math.min(page, pageCount));
  const visibleGroups = groups.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const params = { tab: "workflows", traffic, timeSpan: period, client, surface, source, q: search, purpose, followUp: String(followUpMinutes) };
  const href = (q: string) => `/app/admin/mcp?${new URLSearchParams({ tab: "usage", q, traffic, timeSpan: period === "1h" ? "4h" : period })}`;
  const label = (text: string) => text.replaceAll("_", " ");
  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><h2 className="text-2xl font-semibold">MCP operations</h2><AdminTrafficFilters basePath="/app/admin/mcp" scope={traffic} searchParams={params} /></div>
    <McpNavigation active="workflows" traffic={traffic} client={client} surface={surface} source={source} period={period} />
    <McpSessionFunnel data={funnel} followUpMinutes={followUpMinutes} params={params} />
    <Card>
      <CardHeader><CardTitle>Task intent &amp; workflows</CardTitle><p className="text-sm text-slate-600">What callers declared, which calls followed, where friction appeared, and which integration version was reported.</p></CardHeader>
      <CardContent className="space-y-4">
        <form method="get" action="/app/admin/mcp" className="flex flex-wrap gap-2">
          <input type="hidden" name="followUp" value={followUpMinutes} /><input type="hidden" name="tab" value="workflows" /><input type="hidden" name="traffic" value={traffic} />
          {client ? <input type="hidden" name="client" value={client} /> : null}{surface ? <input type="hidden" name="surface" value={surface} /> : null}{source ? <input type="hidden" name="source" value={source} /> : null}
          <input className="min-w-64 rounded border px-3 py-2 text-sm" name="q" defaultValue={search} aria-label="Search workflow intent, question, client, version, scan or error" placeholder="Intent, question, integration, version, scan…" />
          <select className="rounded border px-3 py-2 text-sm" name="purpose" defaultValue={purpose} aria-label="Filter by declared purpose"><option value="">All purposes</option>{MCP_TASK_PURPOSES.map(value => <option key={value} value={value}>{value === "unknown" ? "Unknown / not supplied" : label(value)}</option>)}</select>
          <select className="rounded border px-3 py-2 text-sm" name="timeSpan" defaultValue={period} aria-label="Workflow time span">{Object.keys(MCP_DISCOVERY_PERIODS).map(value => <option key={value} value={value}>Past {value}</option>)}</select>
          <button className="rounded border px-4 py-2 font-semibold" type="submit">Apply</button>
          <Link className="px-3 py-2 text-sky-700 underline" href={`/app/admin/mcp?tab=workflows&traffic=${traffic}`}>Clear filters</Link>
        </form>
        <p className="text-xs text-slate-500">{events.length.toLocaleString()} of {totalEvents.toLocaleString()} retained calls in this window. {totalEvents > events.length ? "Limited to the latest 5,000 calls; counts below describe that sample and workflows may be incomplete." : ""} Grouping uses the same session, scan, client, provider and entrypoint; no IP-based user journey is inferred. Calls without a scan/session are separate attempts.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
          ["Observed workflows / attempts", groups.length], ["Declared purpose", groups.filter(g => g.purposes.some(p => p !== "unknown")).length],
          ["Bundle retrieved", groups.filter(g => g.bundle).length], ["With errors / rate limits", groups.filter(g => g.errors).length],
        ].map(([title, value]) => <div className="rounded-lg border p-3" key={title}><p className="text-xs text-slate-500">{title}</p><p className="text-2xl font-semibold">{value}</p></div>)}</div>
        <p className="text-xs text-slate-500">Intent and integration are caller-declared, not verified. Original chat prompts are not received. Missing question/version fields remain unknown. “No bundle observed” is not proof of abandonment; activity outside this window or another session is not joined. Scan outcome is the current canonical outcome; delivery does not prove user satisfaction.</p>
        <PaginationControls basePath="/app/admin/mcp" itemLabel="workflows" page={currentPage} pageCount={pageCount} pageSize={pageSize} totalCount={groups.length} visibleCount={visibleGroups.length} searchParams={params} />
        <div className="overflow-x-auto rounded-lg border"><table className="min-w-[1250px] w-full text-left text-sm">
          <thead className="bg-slate-50"><tr>{["Intent / shared question", "Client / integration", "Observed progress", "Friction / retrieval", "Scan / outcome", "Calls"].map(title => <th key={title} scope="col" className="p-3">{title}</th>)}</tr></thead>
          <tbody className="divide-y">{visibleGroups.map(group => <tr key={group.key} className="align-top">
            <td className="max-w-80 p-3"><p className="font-semibold">{group.purposes.map(label).join(", ") || "Purpose not supplied"}</p>{group.questions.length ? group.questions.map(question => <p key={question} className="mt-2 whitespace-pre-wrap break-words text-xs">{question}</p>) : <p className="mt-1 text-xs text-slate-500">No shared question</p>}</td>
            <td className="max-w-64 p-3"><p className="break-words font-semibold">{group.first.client_name ?? "Client unknown"}</p><p className="text-xs">{group.first.surface} · {group.first.source}</p>{group.first.session_id ? <Link className="font-mono text-xs text-sky-700 underline" href={href(group.first.session_id)} title={group.first.session_id} prefetch={false}>Session {group.first.session_id.slice(0, 10)}</Link> : <p className="text-xs text-slate-500">Session unavailable</p>}<p className="mt-2 break-words text-xs">Declared integration: {group.integrations.join(", ") || "unknown"}</p><p className="text-xs">Client version: {group.clients.join(", ") || "unknown"}</p><p className="text-xs">Server: {group.servers.join(", ") || "not recorded"}</p><p className="break-words text-xs">Schema: {group.schemas.join(", ") || "not recorded"}</p></td>
            <td className="p-3"><p className="font-semibold">{group.stage}</p><p className="mt-1 text-xs">{group.scanRequest ? `${label(group.scanRequest.scan_decision)} scan request` : "No scan request in this group"}</p><p className="text-xs">{group.statusCalls} status calls · {group.bundleCalls} bundle calls</p>{group.firstBundleSeconds !== null ? <p className="text-xs">{group.firstBundleSeconds.toFixed(1)}s from scan response to first bundle</p> : null}<p className="mt-2 text-xs text-slate-500">{formatAdminDateTime(group.last.occurred_at)}</p></td>
            <td className="max-w-56 p-3"><p className={group.errors ? "font-semibold text-amber-800" : "text-slate-600"}>{group.errors} errors · {group.quotaHits} rate limits</p><p className="break-words text-xs">{group.friction.join(", ")}</p><p className="mt-2 text-xs">{group.truncatedResponses} truncated responses · shape recorded for {group.responseCoverage}/{group.rows.length} calls</p></td>
            <td className="max-w-48 p-3"><p className="font-semibold">{group.outcome ? label(group.outcome) : "No scan outcome"}</p>{group.first.scan_id ? <Link className="break-all text-xs text-sky-700 underline" href={href(group.first.scan_id)} prefetch={false}>{group.first.scan_id}</Link> : null}</td>
            <td className="max-w-80 p-3"><details><summary className="cursor-pointer text-sky-700">{group.rows.length} calls · view timeline</summary><ol className="mt-2 space-y-2">{group.rows.slice(-50).map((row, index) => <li key={row.event_id} className="text-xs"><Link className="font-mono text-sky-700 underline" href={href(row.event_id)} prefetch={false}>{row.tool_name}</Link><p>{formatAdminDateTime(row.occurred_at)} · {row.duration_ms}ms · {row.outcome}</p><p>{row.error_code}</p><pre className="max-w-72 whitespace-pre-wrap break-all">{group.details[group.rows.length > 50 ? group.rows.length - 50 + index : index] ? JSON.stringify(group.details[group.rows.length > 50 ? group.rows.length - 50 + index : index]?.arguments) : "Arguments not recorded"}</pre></li>)}</ol>{group.rows.length > 50 ? <p className="text-xs">Latest 50 calls shown.</p> : null}</details></td>
          </tr>)}{groups.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-slate-500">No retained workflows match these filters.</td></tr> : null}</tbody>
        </table></div>
      </CardContent>
    </Card>
    <McpThrottleReminder />
  </div>;
}
