import { mcpRequestDetailsSchema } from "@website-signal-risk-scanner/shared";

export type McpCallerIdentity = { kind: "actor" | "session"; id: string; label: string };
export type McpCallerActivity = { calls5m: number; calls10m: number; calls60m: number; quotaHits60m: number };
export type McpCallerEvent = {
  actor_id: string | null; session_id: string | null; request_details?: unknown;
};

export function mcpCallerIdentity(event: McpCallerEvent): McpCallerIdentity | null {
  const parsed = mcpRequestDetailsSchema.safeParse(event.request_details);
  const details = parsed.success ? parsed.data : null;
  if (event.actor_id && (details?.actorBasis === "authenticated" || details?.actorBasis === "provider_ephemeral")) {
    return { kind: "actor", id: event.actor_id, label: details.actorBasis === "authenticated" ? "Authenticated caller" : "Provider-declared caller" };
  }
  if (event.session_id && details?.sessionBasis === "provider_conversation") {
    return { kind: "session", id: event.session_id, label: "Provider conversation" };
  }
  if (event.actor_id) {
    return { kind: "actor", id: event.actor_id, label: details?.actorBasis === "requester_binding" ? "Requester / IP binding" : "Unverified caller binding" };
  }
  return event.session_id ? { kind: "session", id: event.session_id, label: "MCP session" } : null;
}

export function mcpCallerAnchors(events: (McpCallerEvent & { event_id: string; occurred_at: string; source: string; surface: string })[]) {
  return events.slice(0, 100).flatMap((event) => {
    const identity = mcpCallerIdentity(event);
    return identity ? [{ event_id: event.event_id, occurred_at: event.occurred_at, source: event.source,
      surface: event.surface, kind: identity.kind, caller_id: identity.id }] : [];
  });
}

// Only repository-owned visibility predicates and a parameter position enter this builder.
// Other page filters must not narrow the caller's counts. Existing timestamp indexes
// bound each lookup to the hour preceding the displayed event, including that event.
export function mcpCallerActivitySql(visibilitySql: string, anchorsParameter: number) {
  return `with anchors as (
    select * from jsonb_to_recordset($${anchorsParameter}::jsonb) as anchor(
      event_id text, occurred_at timestamptz, source text, surface text, kind text, caller_id text
    )
  )
  select anchor.event_id, activity.* from anchors anchor
  cross join lateral (
    select count(*) filter (where events.occurred_at >= anchor.occurred_at - interval '5 minutes')::int as calls5m,
           count(*) filter (where events.occurred_at >= anchor.occurred_at - interval '10 minutes')::int as calls10m,
           count(*)::int as calls60m,
           count(*) filter (where events.quota_outcome = 'rate_limited' or events.transport_outcome = 'http_429')::int as quota_hits60m
      from public.mcp_tool_invocation_events events
     where events.occurred_at >= anchor.occurred_at - interval '60 minutes'
       and events.occurred_at <= anchor.occurred_at
       and events.surface = anchor.surface and events.source = anchor.source
       and ((anchor.kind = 'actor' and events.actor_id = anchor.caller_id)
         or (anchor.kind = 'session' and events.session_id = anchor.caller_id))
       and (${visibilitySql || "true"})
  ) activity`;
}
