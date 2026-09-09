import { mcpRequestDetailsSchema, type McpTaskContext } from "@website-signal-risk-scanner/shared";

export type McpRelatedContext = { eventId: string; occurredAt: string; taskContext: McpTaskContext };
type ContextEvent = { event_id: string; occurred_at: string; session_id: string | null; actor_id: string | null; scan_id: string | null; source: string; surface: string; request_details?: unknown };
export function mcpContextAnchors(events: ContextEvent[]) {
  return events.slice(0, 100).filter(event => {
    const parsed = mcpRequestDetailsSchema.safeParse(event.request_details);
    return event.session_id && event.actor_id && event.scan_id && parsed.success && !parsed.data.taskContext?.questionSummary
      && ["mcp_session", "provider_conversation"].includes(parsed.data.sessionBasis);
  }).map(({ event_id, occurred_at, session_id, actor_id, scan_id, source, surface }) => ({ event_id, occurred_at, session_id, actor_id, scan_id, source, surface }));
}

// Context is a separately attributed earlier call, never inferred from an IP,
// domain, shared/reused scan alone, or a different conversation. No write-back.
export function mcpRelatedContextSql(visibilitySql: string, anchorsParameter: number) {
  return `with anchors as (
    select * from jsonb_to_recordset($${anchorsParameter}::jsonb) as anchor(
      event_id text, occurred_at timestamptz, session_id text, actor_id text, scan_id text, source text, surface text
    )
  ) select anchor.event_id, previous.event_id as source_event_id,
           previous.occurred_at as source_occurred_at, previous.request_details
      from anchors anchor
      cross join lateral (
        select events.event_id, events.occurred_at, events.request_details
          from public.mcp_tool_invocation_events events
         where events.session_id = anchor.session_id and events.actor_id = anchor.actor_id
           and events.scan_id = anchor.scan_id
           and events.surface = anchor.surface and events.source = anchor.source
           and events.occurred_at < anchor.occurred_at
           and events.occurred_at >= anchor.occurred_at - interval '24 hours'
           and events.occurred_at >= now() - interval '90 days'
           and events.tool_name = 'certscore_scan_site'
           and events.request_details #>> '{taskContext,questionSummary}' is not null
           and (${visibilitySql || "true"})
         order by events.occurred_at desc, events.event_id desc limit 1
      ) previous`;
}

export function parseMcpRelatedContext(row: { source_event_id: string; source_occurred_at: string; request_details: unknown }): McpRelatedContext | null {
  const parsed = mcpRequestDetailsSchema.safeParse(row.request_details);
  if (!parsed.success || !parsed.data.taskContext?.questionSummary) return null;
  const occurredAt = new Date(row.source_occurred_at);
  if (!Number.isFinite(occurredAt.getTime())) return null;
  return { eventId: row.source_event_id, occurredAt: occurredAt.toISOString(), taskContext: parsed.data.taskContext };
}
