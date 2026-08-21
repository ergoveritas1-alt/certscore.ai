import "server-only";

import { query, queryOne } from "@website-signal-risk-scanner/db";
import {
  MAC_MINI_SCAN_BOT_API_KEY_NAMES,
  MAC_MINI_SCAN_BOT_MCP_CLIENT_NAMES,
  MAC_MINI_SCAN_BOT_REQUESTER_IPS
} from "../../lib/admin/mac-mini-scan-bot";
import { getPlatformAdminEmails, requirePlatformAdminContext } from "./platform-admin";

export type ProductAnalyticsPeriod = "1h" | "24h" | "7d" | "30d" | "90d";
export type ProductAnalyticsEventName = "page_viewed" | "navigation_clicked" | "action_clicked" | "form_started" | "form_submitted" | "form_succeeded" | "form_failed" | "scan_started" | "scan_completed" | "scan_viewed" | "report_viewed" | "scroll_depth_reached" | "session_engaged" | "web_vital_recorded" | "client_error" | "account_created" | "analytics_opted_in" | "analytics_opted_out";
export type AdminEventName = ProductAnalyticsEventName | "scan_requested" | "api_request" | "mcp_tool_invoked" | "full_scan.started" | "full_scan.completed" | "preview_scan.started" | "preview_scan.completed" | "v2_lambda_result.received" | "v2_lambda_result.failed";
export type ProductAnalyticsOutcome = "observed" | "started" | "submitted" | "success" | "failure" | "opted_in" | "opted_out";
export const ADMIN_EVENT_ROUTES = ["Web", "API", "Pulse", "SDK", "MCP", "Other"] as const;
export type AdminEventRoute = (typeof ADMIN_EVENT_ROUTES)[number];

const PERIODS = {
  "1h": { interval: "1 hour", bucket: "5 minutes", label: "Last hour", format: "HH24:MI" },
  "24h": { interval: "24 hours", bucket: "1 hour", label: "Last 24 hours", format: "HH24:00" },
  "7d": { interval: "7 days", bucket: "1 day", label: "Last 7 days", format: "Mon DD" },
  "30d": { interval: "30 days", bucket: "1 day", label: "Last 30 days", format: "Mon DD" },
  "90d": { interval: "90 days", bucket: "1 day", label: "Last 90 days", format: "Mon DD" }
} as const;

type Count = string | number | null | undefined;
type SummaryRow = { actors: Count; authenticated: Count; errors: Count; events: Count; page_views: Count; scans: Count; sessions: Count; opted_out: Count };
type TrendRow = { bucket: string; bucket_start: string; events: Count; sessions: Count };
type RouteRow = { normalized_route: string; events: Count; sessions: Count };
type FeatureRow = { event_name: string; feature: string; events: Count; sessions: Count };

export type ProductAnalyticsRecentEvent = {
  actor_id: string | null;
  consent_state: string;
  country_code: string | null;
  device_class: string;
  duration_ms: number | null;
  email: string | null;
  event_id: string;
  event_name: string;
  event_route: AdminEventRoute;
  feature: string;
  hostname: string | null;
  normalized_route: string;
  occurred_at: string;
  origin_ip: string | null;
  origin_ip_hash: string | null;
  outcome: string;
  request_region: string | null;
  freshness: string | null;
  scan_id: string | null;
  session_id: string | null;
  source: string;
};

export type ProductAnalyticsEventFilters = {
  eventName?: AdminEventName | null;
  outcome?: ProductAnalyticsOutcome | null;
  query?: string | null;
  route?: AdminEventRoute | null;
};

function eventRouteSql(requestChannel: string, requestSource: string) {
  const value = `lower(concat_ws(' ', ${requestChannel}, ${requestSource}))`;
  return `(case
    when ${value} ~ '(^|[^a-z])mcp([^a-z]|$)' then 'MCP'
    when ${value} ~ '(^|[^a-z])sdk([^a-z]|$)' then 'SDK'
    when ${value} ~ 'pulse|gpt_action|public_page' then 'Pulse'
    when ${value} ~ 'web|homepage|dashboard|manual' then 'Web'
    when ${value} ~ 'api' then 'API'
    else 'Other'
  end)`;
}

function operationalEndpointSql(route: string) {
  return `(case ${route}
    when 'Web' then '/app/scans'
    when 'MCP' then '/mcp'
    when 'SDK' then 'sdk'
    when 'Pulse' then '/api/v1/pulse'
    when 'API' then '/api/full-scan'
    else 'other'
  end)`;
}

function unifiedEventsCte(
  intervalParameter = "$1",
  macMiniApiKeyNamesParameter = "$2",
  macMiniMcpClientNamesParameter = "$3",
  macMiniRequesterIpsParameter = "$4",
  platformAdminEmailsParameter = "$5"
) {
  const scanRequestRoute = eventRouteSql("requests.request_channel", "requests.request_context ->> 'source'");
  const pulseRoute = eventRouteSql("requests.request_channel", "coalesce(requests.request_context ->> 'source', requests.request_context ->> 'channel')");
  const scanEventRoute = eventRouteSql("coalesce(attribution.request_channel, scans.scan_config_json ->> 'source')", "attribution.request_source");
  return `with platform_admin_users as (
    select users.id::text as user_id
      from public.users
     where lower(users.email) = any(${platformAdminEmailsParameter}::text[])
  ), platform_admin_api_keys as (
    select keys.public_id
      from public.integration_api_keys keys
      left join platform_admin_users admins on admins.user_id = keys.owner_user_id::text
     where (admins.user_id is not null or lower(coalesce(keys.created_by, '')) = any(${platformAdminEmailsParameter}::text[]))
       and keys.name <> all(${macMiniApiKeyNamesParameter}::text[])
  ), mac_mini_scan_bot_keys as (
    select public_id
      from public.integration_api_keys
     where name = any(${macMiniApiKeyNamesParameter}::text[])
  ), mac_mini_scan_bot_scans as (
    select distinct requests.scan_id
      from public.pulse_requests requests
      join mac_mini_scan_bot_keys keys on keys.public_id = requests.requested_by ->> 'apiKeyId'
     where requests.scan_id is not null
       and requests.requested_at >= now() - ${intervalParameter}::interval - interval '1 day'
    union
    select distinct coalesce(requests.scan_id, requests.fulfilled_by_scan_id) as scan_id
      from public.scan_requests requests
      join mac_mini_scan_bot_keys keys on keys.public_id = requests.requested_by ->> 'apiKeyId'
     where coalesce(requests.scan_id, requests.fulfilled_by_scan_id) is not null
       and requests.requested_at >= now() - ${intervalParameter}::interval - interval '1 day'
  ), request_attribution as (
    select distinct on (attributed.scan_id)
           attributed.scan_id, attributed.request_channel, attributed.request_source,
           attributed.user_id, attributed.requested_at, attributed.origin_ip, attributed.origin_ip_hash,
           attributed.freshness, attributed.request_region, attributed.is_staff
      from (
        select requests.scan_id,
               requests.request_channel,
               coalesce(requests.request_context ->> 'source', requests.request_context ->> 'channel') as request_source,
               case when requests.requested_by ->> 'userId' ~* '^[0-9a-f-]{36}$' then requests.requested_by ->> 'userId' end as user_id,
               requests.requested_at,
               coalesce(nullif(requests.request_context ->> 'sourceIp', ''), nullif(requests.request_context -> 'provenance' ->> 'sourceIp', ''), nullif(requests.requested_by ->> 'sourceIp', '')) as origin_ip,
               coalesce(nullif(requests.request_context ->> 'ipHash', ''), nullif(requests.request_context ->> 'originIp', ''), nullif(requests.request_context -> 'provenance' ->> 'ipHash', ''), nullif(requests.request_context -> 'provenance' ->> 'originIp', ''), nullif(requests.requested_by ->> 'ipHash', '')) as origin_ip_hash,
               case when requests.resolution_mode = 'reused_existing_scan' then 'reused'
                    else coalesce(nullif(requests.request_context ->> 'freshness', ''), 'latest') end as freshness,
               coalesce(nullif(requests.request_context ->> 'scanFrom', ''), nullif(requests.request_context -> 'provenance' ->> 'scanFrom', '')) as request_region,
               (exists (select 1 from platform_admin_users admins where admins.user_id = requests.requested_by ->> 'userId')
                or exists (select 1 from platform_admin_api_keys keys where keys.public_id = requests.requested_by ->> 'apiKeyId')) as is_staff
          from public.pulse_requests requests
         where requests.scan_id is not null
           and requests.requested_at >= now() - ${intervalParameter}::interval - interval '1 day'
        union all
        select coalesce(requests.scan_id, requests.fulfilled_by_scan_id) as scan_id,
               requests.request_channel,
               requests.request_context ->> 'source' as request_source,
               case when requests.requested_by ->> 'userId' ~* '^[0-9a-f-]{36}$' then requests.requested_by ->> 'userId' end as user_id,
               requests.requested_at,
               coalesce(nullif(requests.request_context ->> 'sourceIp', ''), nullif(requests.request_context -> 'provenance' ->> 'sourceIp', ''), nullif(requests.requested_by ->> 'sourceIp', '')) as origin_ip,
               coalesce(nullif(requests.request_context ->> 'ipHash', ''), nullif(requests.request_context ->> 'originIp', ''), nullif(requests.request_context -> 'provenance' ->> 'ipHash', ''), nullif(requests.request_context -> 'provenance' ->> 'originIp', ''), nullif(requests.requested_by ->> 'ipHash', '')) as origin_ip_hash,
               case when requests.resolution_mode = 'reused_existing_scan' then 'reused'
                    when requests.request_context ->> 'bypassRecentScanReuse' = 'true' then 'refresh'
                    else coalesce(nullif(requests.request_context ->> 'freshness', ''), 'latest') end as freshness,
               coalesce(nullif(requests.request_context ->> 'scanFrom', ''), nullif(requests.request_context -> 'provenance' ->> 'scanFrom', '')) as request_region,
               (exists (select 1 from platform_admin_users admins where admins.user_id = requests.requested_by ->> 'userId')
                or exists (select 1 from platform_admin_api_keys keys where keys.public_id = requests.requested_by ->> 'apiKeyId')) as is_staff
          from public.scan_requests requests
         where coalesce(requests.scan_id, requests.fulfilled_by_scan_id) is not null
           and requests.requested_at >= now() - ${intervalParameter}::interval - interval '1 day'
      ) attributed
     order by attributed.scan_id, attributed.requested_at asc
  ), unified_events as (
    select ('web:' || events.event_id::text) as event_id,
           events.occurred_at,
           'Web'::text as event_route,
           events.event_name,
           events.feature,
           events.outcome,
           events.normalized_route,
           events.session_id::text,
           events.actor_id::text,
           events.user_id::text,
           events.scan_id,
           events.consent_state,
           events.device_class,
           events.country_code,
           events.is_authenticated,
           events.is_staff,
           events.is_bot,
           false as is_mac_mini_scan_bot,
           null::text as target_hostname,
           'web_event'::text as source,
           null::text as origin_ip,
           null::text as origin_ip_hash,
           null::text as freshness,
           null::text as request_region,
           events.duration_ms
      from public.product_analytics_events events
     where events.occurred_at >= now() - ${intervalParameter}::interval

    union all

    select ('scan-request:' || requests.public_id) as event_id,
           requests.requested_at as occurred_at,
           ${scanRequestRoute} as event_route,
           'scan_requested'::text as event_name,
           coalesce(nullif(requests.request_type, ''), 'full_scan') as feature,
           case when requests.status in ('rejected', 'failed') then 'failure'
                when requests.status = 'queued' then 'started'
                else 'success' end as outcome,
           ${operationalEndpointSql(scanRequestRoute)} as normalized_route,
           null::text as session_id,
           coalesce(nullif(requests.requested_by ->> 'apiKeyId', ''), nullif(requests.requested_by ->> 'userId', '')) as actor_id,
           case when requests.requested_by ->> 'userId' ~* '^[0-9a-f-]{36}$' then requests.requested_by ->> 'userId' end as user_id,
           coalesce(requests.scan_id, requests.fulfilled_by_scan_id) as scan_id,
           'operational'::text as consent_state,
           'server'::text as device_class,
           null::text as country_code,
           requests.requested_by ? 'userId' as is_authenticated,
           (exists (select 1 from platform_admin_users admins where admins.user_id = requests.requested_by ->> 'userId')
            or exists (select 1 from platform_admin_api_keys keys where keys.public_id = requests.requested_by ->> 'apiKeyId')) as is_staff,
           false as is_bot,
           (exists (select 1 from mac_mini_scan_bot_keys keys where keys.public_id = requests.requested_by ->> 'apiKeyId')
             or exists (select 1 from mac_mini_scan_bot_scans bot_scans where bot_scans.scan_id = coalesce(requests.scan_id, requests.fulfilled_by_scan_id))) as is_mac_mini_scan_bot,
           requests.normalized_domain as target_hostname,
           'scan_request'::text as source,
           coalesce(nullif(requests.request_context ->> 'sourceIp', ''), nullif(requests.request_context -> 'provenance' ->> 'sourceIp', ''), nullif(requests.requested_by ->> 'sourceIp', '')) as origin_ip,
           coalesce(nullif(requests.request_context ->> 'ipHash', ''), nullif(requests.request_context ->> 'originIp', ''), nullif(requests.request_context -> 'provenance' ->> 'ipHash', ''), nullif(requests.request_context -> 'provenance' ->> 'originIp', ''), nullif(requests.requested_by ->> 'ipHash', '')) as origin_ip_hash,
           case when requests.resolution_mode = 'reused_existing_scan' then 'reused'
                when requests.request_context ->> 'bypassRecentScanReuse' = 'true' then 'refresh'
                else coalesce(nullif(requests.request_context ->> 'freshness', ''), 'latest') end as freshness,
           coalesce(nullif(requests.request_context ->> 'scanFrom', ''), nullif(requests.request_context -> 'provenance' ->> 'scanFrom', '')) as request_region,
           null::integer as duration_ms
      from public.scan_requests requests
     where requests.requested_at >= now() - ${intervalParameter}::interval

    union all

    select ('api:' || requests.public_id) as event_id,
           requests.requested_at as occurred_at,
           ${pulseRoute} as event_route,
           'api_request'::text as event_name,
           coalesce(nullif(requests.request_type, ''), 'scan') as feature,
           case when requests.status in ('failed', 'expired', 'rate_limited') then 'failure'
                when requests.status in ('queued', 'running', 'finalizing') then 'started'
                else 'success' end as outcome,
           ${operationalEndpointSql(pulseRoute)} as normalized_route,
           null::text as session_id,
           coalesce(nullif(requests.requested_by ->> 'apiKeyId', ''), nullif(requests.requested_by ->> 'userId', '')) as actor_id,
           case when requests.requested_by ->> 'userId' ~* '^[0-9a-f-]{36}$' then requests.requested_by ->> 'userId' end as user_id,
           requests.scan_id,
           'operational'::text as consent_state,
           'server'::text as device_class,
           null::text as country_code,
           requests.requested_by ? 'userId' as is_authenticated,
           (exists (select 1 from platform_admin_users admins where admins.user_id = requests.requested_by ->> 'userId')
            or exists (select 1 from platform_admin_api_keys keys where keys.public_id = requests.requested_by ->> 'apiKeyId')) as is_staff,
           false as is_bot,
           exists (select 1 from mac_mini_scan_bot_keys keys where keys.public_id = requests.requested_by ->> 'apiKeyId') as is_mac_mini_scan_bot,
           requests.normalized_domain as target_hostname,
           'api_request'::text as source,
           coalesce(nullif(requests.request_context ->> 'sourceIp', ''), nullif(requests.request_context -> 'provenance' ->> 'sourceIp', ''), nullif(requests.requested_by ->> 'sourceIp', '')) as origin_ip,
           coalesce(nullif(requests.request_context ->> 'ipHash', ''), nullif(requests.request_context ->> 'originIp', ''), nullif(requests.request_context -> 'provenance' ->> 'ipHash', ''), nullif(requests.request_context -> 'provenance' ->> 'originIp', ''), nullif(requests.requested_by ->> 'ipHash', '')) as origin_ip_hash,
           case when requests.resolution_mode = 'reused_existing_scan' then 'reused'
                else coalesce(nullif(requests.request_context ->> 'freshness', ''), 'latest') end as freshness,
           coalesce(nullif(requests.request_context ->> 'scanFrom', ''), nullif(requests.request_context -> 'provenance' ->> 'scanFrom', '')) as request_region,
           null::integer as duration_ms
      from public.pulse_requests requests
     where requests.requested_at >= now() - ${intervalParameter}::interval

    union all

    select ('mcp:' || events.event_id::text) as event_id,
           events.occurred_at,
           'MCP'::text as event_route,
           'mcp_tool_invoked'::text as event_name,
           events.tool_name as feature,
           case when events.outcome = 'success' then 'success' else 'failure' end as outcome,
           events.endpoint as normalized_route,
           events.session_id,
           events.actor_id,
           null::text as user_id,
           case when events.scan_id ~* '^[0-9a-f-]{36}$' then events.scan_id::uuid end as scan_id,
           'operational'::text as consent_state,
           'server'::text as device_class,
           null::text as country_code,
           events.auth_class = 'authenticated' as is_authenticated,
           coalesce(attribution.is_staff, false) as is_staff,
           false as is_bot,
           (exists (
             select 1 from mac_mini_scan_bot_scans bot_scans
              where bot_scans.scan_id = case when events.scan_id ~* '^[0-9a-f-]{36}$' then events.scan_id::uuid end
           )
           or lower(coalesce(to_jsonb(events) ->> 'client_name', '')) = any(${macMiniMcpClientNamesParameter}::text[])
           or coalesce(to_jsonb(events) ->> 'requester_ip', '') = any(${macMiniRequesterIpsParameter}::text[])) as is_mac_mini_scan_bot,
           events.target_hostname,
           'mcp_tool'::text as source,
           coalesce(nullif(to_jsonb(events) ->> 'requester_ip', ''), attribution.origin_ip) as origin_ip,
           coalesce(nullif(to_jsonb(events) ->> 'requester_ip_hash', ''), attribution.origin_ip_hash) as origin_ip_hash,
           events.freshness,
           coalesce(events.scan_from, attribution.request_region) as request_region,
           events.duration_ms
      from public.mcp_tool_invocation_events events
      left join request_attribution attribution
        on attribution.scan_id = case when events.scan_id ~* '^[0-9a-f-]{36}$' then events.scan_id::uuid end
     where events.occurred_at >= now() - ${intervalParameter}::interval

    union all

    select ('scan-event:' || events.id::text) as event_id,
           events.created_at as occurred_at,
           ${scanEventRoute} as event_route,
           events.event_type as event_name,
           'scan_lifecycle'::text as feature,
           case when events.event_type ~* 'failed|error|rejected|expired' then 'failure'
                when events.event_type ~* 'completed|received|ready|accepted' then 'success'
                else 'observed' end as outcome,
           '/app/scans/:id'::text as normalized_route,
           null::text as session_id,
           attribution.user_id as actor_id,
           attribution.user_id,
           events.scan_id,
           'operational'::text as consent_state,
           'server'::text as device_class,
           null::text as country_code,
           attribution.user_id is not null as is_authenticated,
           coalesce(attribution.is_staff, false) as is_staff,
           false as is_bot,
           exists (select 1 from mac_mini_scan_bot_scans bot_scans where bot_scans.scan_id = events.scan_id) as is_mac_mini_scan_bot,
           domains.hostname as target_hostname,
           'scan_lifecycle'::text as source,
           attribution.origin_ip,
           attribution.origin_ip_hash,
           attribution.freshness,
           attribution.request_region,
           null::integer as duration_ms
      from public.scan_events events
      left join request_attribution attribution on attribution.scan_id = events.scan_id
      left join public.scans scans on scans.id = events.scan_id
      left join public.domains domains on domains.id = coalesce(events.domain_id, scans.domain_id)
     where events.created_at >= now() - ${intervalParameter}::interval
  )`;
}

function number(value: Count) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function unifiedEventQueryValues(interval: string): unknown[] {
  return [
    interval,
    MAC_MINI_SCAN_BOT_API_KEY_NAMES,
    MAC_MINI_SCAN_BOT_MCP_CLIENT_NAMES,
    MAC_MINI_SCAN_BOT_REQUESTER_IPS,
    [...getPlatformAdminEmails()]
  ];
}

function visibilityClauses(includeInternal: boolean, excludeMacMiniScanBot: boolean) {
  const clauses: string[] = [];
  if (!includeInternal) clauses.push("events.is_staff = false");
  if (excludeMacMiniScanBot) clauses.push("events.is_mac_mini_scan_bot = false");
  return clauses;
}

export async function loadProductAnalyticsDashboard(period: ProductAnalyticsPeriod, includeInternal = false, excludeMacMiniScanBot = true) {
  await requirePlatformAdminContext();
  const config = PERIODS[period] ?? PERIODS["24h"];
  const audience = visibilityClauses(includeInternal, excludeMacMiniScanBot).map((clause) => `and ${clause}`).join(" ");
  const cte = unifiedEventsCte();
  const values = unifiedEventQueryValues(config.interval);
  const [summary, trend, routes, features, recent] = await Promise.all([
    queryOne<SummaryRow>(
      `${cte}
       select count(*) as events,
              count(distinct session_id) filter (where session_id is not null) as sessions,
              count(distinct actor_id) filter (where actor_id is not null) as actors,
              count(*) filter (where is_authenticated) as authenticated,
              count(*) filter (where event_name in ('page_viewed', 'scan_viewed', 'report_viewed')) as page_views,
              count(distinct scan_id) filter (where scan_id is not null) as scans,
              count(*) filter (where event_name = 'client_error' or outcome = 'failure' or event_name ~* 'failed|error') as errors,
              count(*) filter (where event_name = 'analytics_opted_out') as opted_out
         from unified_events events
        where true ${audience}`,
      values,
      { readOnly: true }
    ),
    query<TrendRow>(
      `${cte}
       select date_bin(interval '${config.bucket}', occurred_at, timestamptz '2001-01-01') as bucket_start,
              to_char(date_bin(interval '${config.bucket}', occurred_at, timestamptz '2001-01-01') at time zone 'UTC', '${config.format}') as bucket,
              count(*) as events,
              count(distinct session_id) filter (where session_id is not null) as sessions
         from unified_events events
        where true ${audience}
        group by date_bin(interval '${config.bucket}', occurred_at, timestamptz '2001-01-01')
        order by min(occurred_at) asc`,
      values,
      { readOnly: true }
    ),
    query<RouteRow>(
      `${cte}
       select event_route as normalized_route, count(*) as events, count(distinct session_id) filter (where session_id is not null) as sessions
         from unified_events events
        where true ${audience}
        group by event_route order by events desc`,
      values,
      { readOnly: true }
    ),
    query<FeatureRow>(
      `${cte}
       select event_name, feature, count(*) as events, count(distinct session_id) filter (where session_id is not null) as sessions
         from unified_events events
        where true ${audience}
        group by event_name, feature order by events desc limit 15`,
      values,
      { readOnly: true }
    ),
    query<ProductAnalyticsRecentEvent>(
      `${cte}
       select events.event_id, events.occurred_at, events.event_route, events.event_name, events.feature, events.outcome,
              events.normalized_route, events.session_id::text, events.actor_id::text, events.scan_id::text,
              events.consent_state, events.device_class, events.country_code, events.source, users.email,
              events.origin_ip, events.origin_ip_hash, events.freshness, events.duration_ms,
              coalesce(events.request_region, scans.scan_config_json ->> 'scanFrom') as request_region,
              coalesce(events.target_hostname, domains.hostname) as hostname
         from unified_events events
         left join public.users on users.id::text = events.user_id
         left join public.scans on scans.id = events.scan_id
         left join public.domains on domains.id = scans.domain_id
        where true ${audience}
        order by events.occurred_at desc limit 100`,
      values,
      { readOnly: true }
    )
  ]);

  return {
    label: config.label,
    metrics: {
      events: number(summary?.events), sessions: number(summary?.sessions), actors: number(summary?.actors),
      authenticated: number(summary?.authenticated), pageViews: number(summary?.page_views), scans: number(summary?.scans),
      errors: number(summary?.errors), optedOut: number(summary?.opted_out)
    },
    trend: trend.rows.map((row) => ({ bucket: row.bucket, bucketStart: row.bucket_start, events: number(row.events), sessions: number(row.sessions) })),
    routes: routes.rows.map((row) => ({ route: row.normalized_route, events: number(row.events), sessions: number(row.sessions) })),
    features: features.rows.map((row) => ({ eventName: row.event_name, feature: row.feature, events: number(row.events), sessions: number(row.sessions) })),
    recent: recent.rows
  };
}

export async function listProductAnalyticsEventsPage(
  period: ProductAnalyticsPeriod,
  includeInternal: boolean,
  excludeMacMiniScanBot: boolean,
  pageSize: number,
  offset: number,
  filters: ProductAnalyticsEventFilters = {}
) {
  await requirePlatformAdminContext();
  const config = PERIODS[period] ?? PERIODS["24h"];
  const values = unifiedEventQueryValues(config.interval);
  const clauses = ["true", ...visibilityClauses(includeInternal, excludeMacMiniScanBot)];
  if (filters.eventName) { values.push(filters.eventName); clauses.push(`events.event_name = $${values.length}`); }
  if (filters.outcome) { values.push(filters.outcome); clauses.push(`events.outcome = $${values.length}`); }
  if (filters.route) { values.push(filters.route); clauses.push(`events.event_route = $${values.length}`); }
  const queryText = filters.query?.trim().slice(0, 160);
  if (queryText) {
    values.push(`%${queryText}%`);
    const parameter = `$${values.length}`;
    clauses.push(`(events.event_route ilike ${parameter} or events.normalized_route ilike ${parameter} or events.feature ilike ${parameter} or events.event_name ilike ${parameter} or events.source ilike ${parameter} or events.session_id::text ilike ${parameter} or events.actor_id::text ilike ${parameter} or events.origin_ip ilike ${parameter} or events.origin_ip_hash ilike ${parameter} or events.freshness ilike ${parameter} or events.request_region ilike ${parameter} or users.email ilike ${parameter} or coalesce(events.target_hostname, domains.hostname) ilike ${parameter})`);
  }
  const where = clauses.join(" and ");
  const cte = unifiedEventsCte();
  const [total, rows] = await Promise.all([
    queryOne<{ total_count: string }>(
      `${cte}
       select count(*) as total_count
         from unified_events events
         left join public.users on users.id::text = events.user_id
         left join public.scans on scans.id = events.scan_id
         left join public.domains on domains.id = scans.domain_id
        where ${where}`,
      values,
      { readOnly: true }
    ),
    query<ProductAnalyticsRecentEvent>(
      `${cte}
       select events.event_id, events.occurred_at, events.event_route, events.event_name, events.feature, events.outcome,
              events.normalized_route, events.session_id::text, events.actor_id::text, events.scan_id::text,
              events.consent_state, events.device_class, events.country_code, events.source, users.email,
              events.origin_ip, events.origin_ip_hash, events.freshness, events.duration_ms,
              coalesce(events.request_region, scans.scan_config_json ->> 'scanFrom') as request_region,
              coalesce(events.target_hostname, domains.hostname) as hostname
         from unified_events events
         left join public.users on users.id::text = events.user_id
         left join public.scans on scans.id = events.scan_id
         left join public.domains on domains.id = scans.domain_id
        where ${where}
        order by events.occurred_at desc
        limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, pageSize, offset],
      { readOnly: true }
    )
  ]);
  return { rows: rows.rows, totalCount: Number(total?.total_count ?? 0) || 0 };
}
