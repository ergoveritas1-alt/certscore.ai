import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { MCP_FUNNEL_FOLLOW_UP_MINUTES, mcpFunnelBreakdown, summarizeMcpFunnel, type McpFunnelData } from "../../../../lib/admin/mcp-funnel";
import { formatAdminDateTime } from "../../../../lib/admin/date-time";

export function funnelRate(numerator: number, denominator: number) {
  return denominator ? `${numerator}/${denominator} · ${(100 * numerator / denominator).toFixed(1)}%` : "— (no eligible sessions)";
}
function integrationLabel(value: string) {
  if (value === "unknown") return "Not supplied";
  if (value === "multiple") return "Multiple declared revisions";
  try { const [id, version, skill] = JSON.parse(value); return `${id} @ ${version} · skill ${skill ?? "not supplied"}`; }
  catch { return "Not supplied"; }
}
export function McpSessionFunnel({ data, followUpMinutes, params }: {
  data: McpFunnelData; followUpMinutes: number; params: Record<string,string|null>;
}) {
  const summary = summarizeMcpFunnel(data.sessions);
  const breakdown = mcpFunnelBreakdown(data.sessions);
  const stages: [string,number,number,string][] = [
    ["Connected",summary.connected,summary.connected,"Sessions with a full follow-up window"],
    ["Called a tool",summary.called,summary.connected,"Of connected sessions; catalogue listing is optional"],
    ["Attempted a scan",summary.attempted,summary.called,"Of sessions calling a tool"],
    ["Scan admitted",summary.admitted,summary.attempted,"Of sessions attempting a scan; new or reused"],
    ["Result retrieved after admission",summary.delivered,summary.admitted,"Of admitted sessions; same scan, after admission"],
  ];
  return <Card>
    <CardHeader><CardTitle>Session funnel</CardTitle>
      <p className="text-sm text-slate-600">Follow sessions from their first retained connection through scan admission and result retrieval.</p>
    </CardHeader>
    <CardContent className="space-y-4">
      <form action="/app/admin/mcp" method="get" className="flex flex-wrap items-center gap-2">
        {Object.entries(params).filter(([key,value]) => key !== "followUp" && value !== null && value !== "").map(([key,value]) => <input key={key} type="hidden" name={key} value={value!} />)}
        <label className="text-sm" htmlFor="mcp-funnel-follow-up">Follow each session for</label>
        <select id="mcp-funnel-follow-up" name="followUp" defaultValue={followUpMinutes} className="rounded border px-3 py-2 text-sm">
          {MCP_FUNNEL_FOLLOW_UP_MINUTES.map(value => <option key={value} value={value}>{value} minutes</option>)}
        </select>
        <button type="submit" className="rounded border px-3 py-2 text-sm font-semibold">Apply follow-up</button>
      </form>
      <p className="text-xs text-slate-500">Connection cohort: past {params.timeSpan}. Every rate uses only sessions whose full {followUpMinutes}-minute window has elapsed. {summary.pending} recent sessions are pending and excluded from rates. As of {formatAdminDateTime(data.as_of)}; cached for up to 30 seconds. Traffic, client, provider and entrypoint filters apply; workflow text/purpose filters below do not narrow this funnel.</p>
      {data.total_sessions > data.sessions.length ? <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">Showing the latest {data.sessions.length.toLocaleString()} of {data.total_sessions.toLocaleString()} eligible sessions. All funnel counts and rates describe this sample. Narrow the time window for complete coverage.</p> : null}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr><th className="p-2" scope="col">Stage</th><th className="p-2" scope="col">Sessions</th><th className="p-2" scope="col">Conversion</th><th className="p-2" scope="col">Denominator</th></tr></thead>
        <tbody>{stages.map(([label,value,denominator,description]) => <tr key={label} className="border-t"><th scope="row" className="p-2 font-medium">{label}</th><td className="p-2">{value}</td><td className="p-2">{funnelRate(value,denominator)}</td><td className="p-2 text-xs text-slate-500">{description}</td></tr>)}</tbody>
      </table></div>
      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <p><strong>{summary.newScan}</strong> sessions admitted a new scan; <strong>{summary.reused}</strong> reused a scan. These groups can overlap.</p>
        <p><strong>{summary.listed}</strong> sessions listed tools. Listing is optional and is not a required funnel step.</p>
        <p><strong>{summary.resultOnly}</strong> retrieved results without attempting a scan in the window.</p>
        <p>Sessions with errors: <strong>{funnelRate(summary.withErrors,summary.called)}</strong></p>
        <p>Sessions hitting CertScore quotas: <strong>{funnelRate(summary.quotaSessions,summary.called)}</strong></p>
        <p>Status calls after admission: <strong>{summary.statusCalls}</strong> across {summary.admittedScans} admitted scans (counted per session); <strong>{summary.admittedScans ? (summary.statusCalls/summary.admittedScans).toFixed(1) : "—"}</strong> calls per scan.</p>
        <p>Observed response truncation: <strong>{summary.truncationKnown ? `${summary.truncated}/${summary.truncationKnown} calls · ${(100*summary.truncated/summary.truncationKnown).toFixed(1)}%` : "not recorded"}</strong></p>
        <p>Declared purpose coverage: <strong>{funnelRate(summary.purposeKnown,summary.attempted)}</strong> of scan-attempt sessions.</p>
        <p>Integration/version coverage: <strong>{funnelRate(summary.integrationKnown,summary.attempted)}</strong> of scan-attempt sessions.</p>
        <p>Current admitted scan outcomes: <strong>{summary.partial}</strong> sessions with partial results; <strong>{summary.noGo}</strong> with no-go results. These can overlap and are current, not outcomes frozen at the follow-up deadline.</p>
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-sky-700">Compare intent and integration revisions · {breakdown.length} groups</summary>
        <div className="mt-3 overflow-x-auto"><table className="min-w-[950px] w-full text-left text-xs">
          <thead><tr>{["Client / entrypoint / provider","Declared purpose","Declared integration / skill","Mature sessions","Admission / attempts","Retrieved / admitted","Quota / calling sessions"].map(label => <th className="p-2" key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{breakdown.slice(0,50).map(group => <tr className="border-t align-top" key={group.key}>
            <td className="max-w-52 break-words p-2">{group.first.client_name ?? "Unknown client"}<p>{group.first.surface} · {group.first.source}</p></td>
            <td className="p-2">{group.first.purpose.replaceAll('_',' ')}</td>
            <td className="max-w-64 break-words p-2">{integrationLabel(group.first.integration)}</td>
            <td className="p-2">{group.connected}</td><td className="p-2">{funnelRate(group.admitted,group.attempted)}</td>
            <td className="p-2">{funnelRate(group.delivered,group.admitted)}</td><td className="p-2">{funnelRate(group.quotaSessions,group.called)}</td>
          </tr>)}</tbody>
        </table></div>
        {breakdown.length > 50 ? <p className="text-xs">Largest 50 groups shown; totals above include all sampled groups.</p> : null}
        <p className="mt-2 text-xs text-slate-500">Purpose and integration are taken only from declared scan-request context. Multiple declarations stay grouped as “multiple”; missing declarations remain unknown. These comparisons are descriptive and do not establish that a revision caused a change.</p>
      </details>
      <p className="text-xs text-slate-500">{data.outside_cohort_calls.toLocaleString()} visible calls have no matching connection in this cohort, including {data.missing_session_calls.toLocaleString()} without a session identifier. They remain in Usage and are excluded here. Unlinked discovery has only declared-client QA filtering. Missing initialization, old sessions and shared/rotating identifiers limit coverage; sessions are not unique agents.</p>
      <p className="text-xs text-slate-500">Retrieval includes bundles, reports, evidence, findings and exports. A session converts after at least one admitted scan has a successful retrieval; this does not mean every scan succeeded. No-go delivery and partial results still count as delivery. Calls after the deadline or in another session are not credited; absence does not prove abandonment or dissatisfaction.</p>
    </CardContent>
  </Card>;
}
