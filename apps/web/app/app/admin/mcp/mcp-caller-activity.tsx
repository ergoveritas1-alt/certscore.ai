import Link from "next/link";
import React from "react";
import { mcpCallerIdentity, type McpCallerActivity as Activity, type McpCallerEvent } from "../../../../lib/admin/mcp-caller-activity";

export function McpCallerActivity({ event, traffic, period }: {
  event: McpCallerEvent & { source: string; surface: string; caller_activity?: Activity | null };
  traffic: string; period: string;
}) {
  const identity = mcpCallerIdentity(event);
  if (!identity) return <p className="text-[10px] text-slate-500">Caller ID unavailable · activity unknown</p>;
  const counts = event.caller_activity;
  const href = `/app/admin/mcp?${new URLSearchParams({ q: identity.id, source: event.source, surface: event.surface, traffic, timeSpan: period })}`;
  return <div className="mt-1 border-t border-slate-100 pt-1 text-[10px]">
    <Link href={href} prefetch={false} className="font-mono font-semibold text-sky-700 hover:underline" title={`${identity.label}: ${identity.id}`}>
      {identity.kind === "session" ? "Session" : "Caller"} {identity.id.slice(0, 12)}
    </Link>
    <p className="text-slate-500" title="Correlation only: shared IPs can combine callers; sessions and provider IDs can rotate. These are not verified unique agents.">{identity.label}</p>
    <p className="font-medium tabular-nums text-slate-700" title="Calls in the preceding 5/10/60 minutes as of this request, including this call, errors and rate limits. Same ID, provider, entrypoint and traffic visibility; across all tools and page filters.">
      5m: {counts?.calls5m ?? "—"} · 10m: {counts?.calls10m ?? "—"} · 60m: {counts?.calls60m ?? "—"}
    </p>
    {counts?.quotaHits60m ? <p className="font-medium text-amber-800">Rate limited / 429: {counts.quotaHits60m} in 60m</p> : null}
  </div>;
}
