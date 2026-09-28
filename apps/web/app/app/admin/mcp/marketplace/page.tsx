import Link from "next/link";
import { formatAdminDateTime } from "../../../../../lib/admin/date-time";
import { loadMarketplaceMcpActivity, type MarketplaceMcpActivityRow } from "../../../../../server/admin/marketplace-mcp-activity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function activityLabel(event: MarketplaceMcpActivityRow) {
  if (event.tool_name === "certscore_scan_site") {
    if (event.scan_decision === "new" && event.scan_created_at) return "Scan dispatched";
    if (event.scan_decision === "new") return "New scan reported · record unavailable";
    if (event.scan_decision === "reused" && event.scan_id) return "Existing scan reused";
    return "Scan requested · no dispatch verified";
  }
  if (event.tool_name === "certscore_get_scan_status") return "Status check";
  if (event.tool_name === "certscore_get_scan_bundle" || event.tool_name === "certscore_get_report_evidence_page") return event.outcome === "success" ? "Report retrieved" : "Report retrieval attempted";
  return "Tool request";
}

export default async function MarketplaceMcpActivityPage({ searchParams }: {
  searchParams?: Promise<{ agreement?: string; buyer?: string; page?: string }>;
}) {
  const params = await searchParams;
  const agreement = params?.agreement?.trim() ?? "";
  const buyer = params?.buyer?.trim() ?? "";
  const result = await loadMarketplaceMcpActivity({ agreementId: agreement, buyerAccountId: buyer, page: Number(params?.page ?? 1) });
  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (agreement) query.set("agreement", agreement);
    if (buyer) query.set("buyer", buyer);
    query.set("page", String(page));
    return `/app/admin/mcp/marketplace?${query}`;
  };
  const summary = result.summary;
  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
    <div className="space-y-2">
      <Link className="text-sm font-medium text-sky-700 hover:underline" href="/app/admin/mcp">← MCP activity</Link>
      <h1 className="text-3xl font-semibold text-slate-950">Marketplace MCP Light activity</h1>
      <p className="max-w-3xl text-sm leading-6 text-slate-600">Agreement IDs come from successfully validated Marketplace keys. Buyer accounts are resolved from the server-side license record. A shared key does not identify an individual operator. Historical events without this verified binding remain unattributed.</p>
    </div>
    <form action="/app/admin/mcp/marketplace" className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4" method="get">
      <label className="grid gap-1 text-xs font-medium text-slate-600">Agreement ID<input className="h-10 w-72 rounded-lg border border-slate-300 px-3 text-sm text-slate-900" defaultValue={agreement} maxLength={256} name="agreement" placeholder="Exact agreement ID" /></label>
      <label className="grid gap-1 text-xs font-medium text-slate-600">Buyer AWS account<input className="h-10 w-52 rounded-lg border border-slate-300 px-3 text-sm text-slate-900" defaultValue={buyer} inputMode="numeric" maxLength={12} name="buyer" placeholder="12-digit account ID" /></label>
      <button className="h-10 rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800" type="submit">Filter</button>
      <Link className="pb-2 text-sm text-slate-600 hover:underline" href="/app/admin/mcp/marketplace">Clear</Link>
    </form>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {[
        ["Tool requests", summary.tool_calls],
        ["Scan tool requests", summary.scan_requests],
        ["Scans dispatched", summary.dispatched_scans],
        ["Dispatched scans completed", summary.completed_scans],
        ["Reports retrieved", summary.report_retrievals],
      ].map(([label, value]) => <div className="rounded-xl border border-slate-200 bg-white p-4" key={label}><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{Number(value).toLocaleString()}</p></div>)}
    </div>
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3"><h2 className="font-semibold text-slate-950">Validated tool events</h2><p className="text-xs text-slate-500">Retained indefinitely from the start of verified attribution. Request outcome and later canonical scan completion are separate facts.</p></div>
      <div className="overflow-x-auto"><table className="min-w-[1100px] w-full text-left text-xs">
        <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2">Tool event</th><th className="px-3 py-2">Agreement / buyer</th><th className="px-3 py-2">Activity</th><th className="px-3 py-2">Tool outcome</th><th className="px-3 py-2">Scan</th><th className="px-3 py-2">Scan completed</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{result.items.map(event => <tr key={event.event_id}>
          <td className="px-3 py-3"><p className="font-mono font-semibold text-slate-900">{event.tool_name}</p><p className="mt-1 text-slate-500">{formatAdminDateTime(event.occurred_at)}</p></td>
          <td className="px-3 py-3"><p className="font-mono text-slate-800">{event.marketplace_agreement_id}</p><p className="mt-1 font-mono text-slate-500">Buyer {event.buyer_account_id ?? "unavailable"}</p></td>
          <td className="px-3 py-3 font-medium text-slate-800">{activityLabel(event)}</td>
          <td className="px-3 py-3"><p className="font-medium text-slate-800">{event.outcome.replaceAll("_", " ")}</p><p className="mt-1 text-slate-500">{event.error_code ?? "—"}</p></td>
          <td className="px-3 py-3">{event.scan_id ? <Link className="font-mono text-sky-700 hover:underline" href={`/app/admin/scans?q=${encodeURIComponent(event.scan_id)}`}>{event.scan_id}</Link> : "—"}<p className="mt-1 text-slate-500">{event.scan_created_at && event.scan_decision === "new" ? `Created ${formatAdminDateTime(event.scan_created_at)}` : `At call: ${event.scan_status ?? "not recorded"}`}</p></td>
          <td className="px-3 py-3">{event.canonical_scan_status === "completed" && event.completed_at ? formatAdminDateTime(event.completed_at) : event.scan_id ? (event.canonical_scan_status ?? "not linked") : "—"}</td>
        </tr>)}{result.items.length === 0 ? <tr><td className="px-3 py-8 text-center text-slate-500" colSpan={6}>No verified Marketplace MCP tool events match these filters.</td></tr> : null}</tbody>
      </table></div>
      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600"><span>Page {result.page} · {summary.tool_calls.toLocaleString()} events</span><div className="flex gap-4">{result.page > 1 ? <Link className="text-sky-700 hover:underline" href={pageHref(result.page - 1)}>Previous</Link> : null}{result.page * result.pageSize < summary.tool_calls ? <Link className="text-sky-700 hover:underline" href={pageHref(result.page + 1)}>Next</Link> : null}</div></div>
    </section>
  </main>;
}
