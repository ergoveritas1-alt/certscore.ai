import "server-only";

import { query } from "@website-signal-risk-scanner/db";
import { MCP_TELEMETRY_RETENTION_DAYS, type McpTelemetryEvent } from "@website-signal-risk-scanner/shared";

export async function persistMcpTelemetryEvent(event: McpTelemetryEvent) {
  await query(
    `with inserted as (
       insert into public.mcp_tool_invocation_events (
         event_id, occurred_at, source, source_attribution, integration, surface, endpoint,
         tool_name, request_id, session_id, actor_id, auth_class, client_family,
         target_hostname, freshness, scan_from, scan_id, scan_decision, scan_status,
         outcome, transport_outcome, duration_ms, quota_outcome, error_code
       ) values (
         $1::uuid, $2::timestamptz, $3, $4, $5, $6, $7,
         $8, $9::uuid, $10, $11, $12, $13,
         $14, $15, $16, $17, $18, $19,
         $20, $21, $22, $23, $24
       )
       on conflict (event_id) do nothing
       returning event_id
     ), expired as (
       select event_id
         from public.mcp_tool_invocation_events
        where occurred_at < now() - ($25::int * interval '1 day')
        order by occurred_at asc
        limit 500
     ), pruned as (
       delete from public.mcp_tool_invocation_events event
        using expired
        where event.event_id = expired.event_id
       returning event.event_id
     )
     select (select count(*) from inserted)::int as inserted,
            (select count(*) from pruned)::int as pruned`,
    [
      event.eventId,
      event.occurredAt,
      event.source,
      event.sourceAttribution,
      event.integration,
      event.surface,
      event.endpoint,
      event.toolName,
      event.requestId,
      event.sessionId,
      event.actorId,
      event.authClass,
      event.clientFamily,
      event.targetHostname,
      event.freshness,
      event.scanFrom,
      event.scanId,
      event.scanDecision,
      event.scanStatus,
      event.outcome,
      event.transportOutcome,
      event.durationMs,
      event.quotaOutcome,
      event.errorCode,
      MCP_TELEMETRY_RETENTION_DAYS,
    ],
  );
}
