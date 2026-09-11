import Link from "next/link";
import { McpDetailsPopup } from "./mcp-details-popup";
import React from "react";
import { mcpCallerIdentity, type McpCallerActivity as Activity, type McpCallerEvent } from "../../../../lib/admin/mcp-caller-activity";

export function McpCallerActivity({ event, traffic, period, children }: {
  event: McpCallerEvent & { source: string; surface: string; caller_activity?: Activity | null };
  traffic: string; period: string; children?: React.ReactNode;
}) {
  const identity = mcpCallerIdentity(event);
  if (!identity) return <McpDetailsPopup title="Caller activity" trigger="Caller ID unavailable">{children}<p>Caller ID unavailable · activity unknown</p></McpDetailsPopup>;
  const counts = event.caller_activity;
  const href = `/app/admin/mcp?${new URLSearchParams({ q: identity.id, source: event.source, surface: event.surface, traffic, timeSpan: period })}`;
  return <McpDetailsPopup title="Caller activity" trigger={`${identity.kind === "session" ? "Session" : "Caller"} ${identity.id.slice(0, 12)}`}>
    {children}
    <Link href={href} prefetch={false} className="break-all font-mono font-semibold text-sky-700 hover:underline" title={`${identity.label}: ${identity.id}`}>
      {identity.kind === "session" ? "Session" : "Caller"} {identity.id}
    </Link>
    <p className="text-slate-500">Correlation only: shared IPs can combine callers; sessions and provider IDs can rotate. These are not verified unique agents.</p>
    <McpCallerActivityCounts counts={counts} />
    {counts?.quotaHits60m ? <p className="font-medium text-amber-800">Rate limited / 429: {counts.quotaHits60m} in 60m</p> : null}
  </McpDetailsPopup>;
}

export function McpCallerActivityCounts({ counts }: { counts?: Activity | null }) {
  return (
    <p className="whitespace-nowrap font-medium tabular-nums text-slate-700" title="Calls in the preceding 5/10/60 minutes and 24 hours as of this request, including this call, errors and rate limits. Same ID, provider, entrypoint and traffic visibility; across all tools and page filters.">
      5m: {counts?.calls5m ?? "—"} · 10m: {counts?.calls10m ?? "—"} · 60m: {counts?.calls60m ?? "—"} · 24hr: {counts?.calls24h ?? "—"}
    </p>
  );
}
