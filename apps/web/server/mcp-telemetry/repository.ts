import "server-only";

import { query, queryOne } from "@website-signal-risk-scanner/db";
import { MCP_TELEMETRY_RETENTION_DAYS, type McpActivationEvent, type McpTelemetryEvent } from "@website-signal-risk-scanner/shared";
import { isPlatformAdminEmail } from "../admin/platform-admin";
import { persistProductAnalyticsEvent } from "../product-analytics/repository";

export async function persistMcpActivationEvent(event: McpActivationEvent) {
  const user = event.userId
    ? await queryOne<{ email: string }>(
        `select email from public.users where id = $1::uuid limit 1`,
        [event.userId],
        { readOnly: true }
      )
    : null;
  await persistProductAnalyticsEvent({
    category: "interaction",
    eventName: event.stage,
    feature: `mcp:${event.callerProduct}`,
    outcome: "success",
    route: "/mcp"
  }, {
    browserFamily: "server",
    consentState: "operational",
    countryCode: null,
    deviceClass: "unknown",
    isBot: false,
    isStaff: isPlatformAdminEmail(user?.email),
    osFamily: "server",
    organizationId: event.organizationId,
    referringDomain: null,
    userId: event.userId
  }, event.eventId);
}

export async function persistMcpTelemetryEvent(event: McpTelemetryEvent) {
  await query(
    `with inserted as (
       insert into public.mcp_tool_invocation_events (
         event_id, occurred_at, source, source_attribution, integration, surface, endpoint,
         tool_name, request_id, session_id, actor_id, auth_class, client_family,
         target_hostname, is_canary, freshness, scan_from, scan_id, scan_decision, scan_status,
         outcome, transport_outcome, duration_ms, quota_outcome, error_code,
         client_name, requester_ip, requester_ip_hash, requester_network,
         requested_resource_type, requested_resource,
         caller_product, attribution_confidence, attribution_signals,
         attribution_ruleset_version, execution_channel, installation_origin
       ) values (
         $1::uuid, $2::timestamptz, $3, $4, $5, $6, $7,
         $8, $9::uuid, $10, $11, $12, $13,
         $14, ($15::boolean or exists (
           select 1 from public.mcp_tool_invocation_events prior
            where prior.scan_id = $18 and prior.is_canary = true
         ) or exists (
           select 1 from public.scan_pages page
            where page.scan_id::text = $18 and page.page_url ~* '^https?://[^/?#]+/\\.well-known/certscore-canary/'
         )), $16, $17, $18, $19, $20,
         $21, $22, $23, $24, $25,
         $26, $27::inet, $28, $29, $30, $31,
         $32, $33, $34::jsonb, $35, $36, $37
       )
       on conflict (event_id) do nothing
       returning event_id
     ), expired as (
       select event_id
         from public.mcp_tool_invocation_events
        where occurred_at < now() - ($38::int * interval '1 day')
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
      event.isCanary,
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
      event.clientName,
      event.requesterIp,
      event.requesterIpHash,
      event.requesterNetwork,
      event.requestedResourceType,
      event.requestedResource,
      event.callerProduct,
      event.attributionConfidence,
      JSON.stringify(event.attributionSignals),
      event.attributionRulesetVersion,
      event.executionChannel,
      event.installationOrigin,
      MCP_TELEMETRY_RETENTION_DAYS,
    ],
  );
}
