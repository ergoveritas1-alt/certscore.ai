import "server-only";

import { unstable_cache } from "next/cache";
import { query, queryOne } from "@website-signal-risk-scanner/db";
import { MCP_TELEMETRY_RETENTION_DAYS, type McpTelemetrySurface } from "@website-signal-risk-scanner/shared";
import { calculateMcpTelemetryRates } from "../../lib/admin/mcp-telemetry-rates";
import { MAC_MINI_SCAN_BOT_API_KEY_NAMES } from "../../lib/admin/mac-mini-scan-bot";
import {
  INTERNAL_QA_EMAILS,
  INTERNAL_QA_MCP_CLIENT_NAMES,
  INTERNAL_QA_REQUESTER_IPS,
} from "../../lib/admin/admin-traffic-scope";
import {
  ADMIN_OPERATIONAL_SNAPSHOT_CONFIG,
  type AdminOperationalSnapshotPeriod,
} from "../../lib/admin/admin-operational-snapshot";
import { requesterIpAttributionFromRequest, type RequesterIpAttributionSource } from "../../lib/admin/requester-ip-attribution";
import { parseAdminEvidenceMatrix, type AdminEvidenceMatrix } from "../../lib/scans/admin-evidence-matrix";
import { requirePlatformAdminContext } from "./platform-admin";

type CountValue = number | string | null;

type SummaryRow = {
  actor_count: CountValue;
  bundle_count: CountValue;
  error_count: CountValue;
  invocation_count: CountValue;
  newest_event_at: string | null;
  new_scan_count: CountValue;
  p50_duration_ms: CountValue;
  p95_duration_ms: CountValue;
  quota_limited_count: CountValue;
  reused_scan_count: CountValue;
  scan_count: CountValue;
  session_count: CountValue;
  status_count: CountValue;
  success_count: CountValue;
};

type ComparisonRow = {
  error_count: CountValue;
  invocation_count: CountValue;
  p95_duration_ms: CountValue;
};

type TrendRow = {
  bucket_label: string;
  errors: CountValue;
  invocations: CountValue;
  quota_limited: CountValue;
};

export type AdminMcpSnapshotPeriod = AdminOperationalSnapshotPeriod;

type ToolRow = {
  calls: CountValue;
  errors: CountValue;
  p50_duration_ms: CountValue;
  p95_duration_ms: CountValue;
  surface: McpTelemetrySurface;
  tool_name: string;
};

type SurfaceRow = {
  actors: CountValue;
  calls: CountValue;
  errors: CountValue;
  sessions: CountValue;
  surface: McpTelemetrySurface;
};

type SourceRow = {
  actor_count: CountValue;
  auth_class: "anonymous" | "authenticated";
  calls: CountValue;
  client_family: string;
  session_count: CountValue;
  source: "openai" | "anthropic" | "google" | "xai" | "other" | "unknown";
  source_attribution: string;
  surface: McpTelemetrySurface;
};

type HostnameRow = {
  calls: CountValue;
  last_requested_at: string;
  scan_requests: CountValue;
  target_hostname: string;
};

export type AdminMcpTelemetryEvent = {
  access_posture_class: string | null;
  admin_summary_generated_at: string | null;
  actor_id: string | null;
  attribution_confidence: "verified" | "corroborated" | "declared" | "inferred" | "unknown";
  attribution_ruleset_version: string;
  attribution_signals: string[];
  auth_class: "anonymous" | "authenticated";
  blocked_flag: boolean | null;
  captcha_flag: boolean | null;
  client_family: string;
  client_name: string | null;
  caller_product: "chatgpt" | "codex" | "claude" | "claude_code" | "gemini_cli" | "grok" | "other" | "unknown";
  duration_ms: number;
  error_code: string | null;
  evidence_matrix: AdminEvidenceMatrix | null;
  execution_channel: "hosted_connector" | "api_managed_mcp" | "desktop_cli" | "custom_mcp" | "unknown";
  event_id: string;
  freshness: "latest" | "refresh" | null;
  industry: string | null;
  installation_origin: "openai_directory" | "anthropic_directory" | "xai_catalog" | "direct" | "unknown";
  mode_detail: string | null;
  mode_format: string | null;
  occurred_at: string;
  outcome: "success" | "error" | "rate_limited";
  page_url: string | null;
  primary_language: string | null;
  quota_outcome: "allowed" | "rate_limited" | "not_applicable";
  request_id: string;
  requested_resource: string | null;
  requested_resource_type: "url" | "domain" | "scan_id" | "job_id" | null;
  requester_network: "anthropic" | "direct" | "unknown";
  scan_decision: "reused" | "new" | "unavailable" | "not_applicable";
  scan_elapsed_seconds: number | null;
  scan_from: string | null;
  scan_id: string | null;
  scan_outcome: string | null;
  scan_status: string | null;
  scanner_egress_id: string | null;
  scanner_egress_provider: string | null;
  score: number | null;
  session_id: string | null;
  source: "openai" | "anthropic" | "google" | "xai" | "other" | "unknown";
  source_attribution: string;
  source_ip: string | null;
  source_ip_hash: string | null;
  source_ip_source: RequesterIpAttributionSource;
  surface: McpTelemetrySurface;
  target_hostname: string | null;
  target_provenance: "request" | "canonical_scan" | null;
  tool_name: string;
  top_finding_count: number | null;
  tranco_rank: number | null;
  transport_outcome: "mcp_result" | "mcp_error" | "http_429";
  perspective_provenance: "request" | "canonical_scan" | null;
};

type AdminMcpTelemetryEventRow = Omit<AdminMcpTelemetryEvent, "evidence_matrix" | "source_ip" | "source_ip_hash" | "source_ip_source"> & {
  admin_evidence_matrix: unknown;
  retained_requester_ip: string | null;
  retained_requester_ip_hash: string | null;
  requester_request_context: unknown;
  requester_requested_by: unknown;
};

export type AdminMcpTelemetryEventFilters = {
  confidence?: "verified" | "corroborated" | "declared" | "inferred" | "unknown" | null;
  excludeMacMiniScanBot?: boolean;
  includeCanary?: boolean;
  outcome?: "success" | "error" | "rate_limited" | null;
  query?: string | null;
  scanDecision?: "reused" | "new" | "unavailable" | "not_applicable" | null;
  product?: "chatgpt" | "codex" | "claude" | "claude_code" | "gemini_cli" | "grok" | "other" | "unknown" | null;
  source?: "openai" | "anthropic" | "google" | "xai" | "other" | "unknown" | null;
  surface?: McpTelemetrySurface | null;
  timeSpan?: "all" | "4h" | "12h" | "24h" | "7d" | "30d";
  toolName?: string | null;
};

type TotalRow = {
  total_count: CountValue;
};

type RetentionRow = {
  expired_event_count: CountValue;
  newest_event_at: string | null;
  oldest_event_at: string | null;
  total_event_count: CountValue;
};

function count(value: CountValue) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: CountValue) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function macMiniMcpTrafficFilter(alias: string, excludeParameter: string, apiKeyNamesParameter: string) {
  const prefix = alias ? `${alias}.` : "";
  return `and (${excludeParameter}::boolean = false or not coalesce(
    ${prefix}scan_id = any(array(
      select request.scan_id::text
        from public.pulse_requests request
        join public.integration_api_keys linked_key on linked_key.public_id = request.requested_by ->> 'apiKeyId'
       where request.scan_id is not null
         and linked_key.name = any(${apiKeyNamesParameter}::text[])
      union
      select coalesce(request.fulfilled_by_scan_id, request.scan_id)::text
        from public.scan_requests request
        join public.integration_api_keys linked_key on linked_key.public_id = request.requested_by ->> 'apiKeyId'
       where coalesce(request.fulfilled_by_scan_id, request.scan_id) is not null
         and linked_key.name = any(${apiKeyNamesParameter}::text[])
    )), false))`;
}

function internalQaMcpTrafficFilter(alias: string, emailParameter: string, requesterIpParameter: string, clientNameParameter: string) {
  const prefix = alias ? `${alias}.` : "";
  return `and not (
    ${prefix}is_canary
    or lower(coalesce(${prefix}client_name, '')) = any(${clientNameParameter}::text[])
    or coalesce(${prefix}requester_ip::text, '') = any(${requesterIpParameter}::text[])
    or coalesce(${prefix}scan_id = any(array(
      select request.scan_id::text
        from public.pulse_requests request
        left join public.integration_api_keys linked_key on linked_key.public_id = request.requested_by ->> 'apiKeyId'
        left join public.users linked_user on linked_user.id::text = coalesce(request.requested_by ->> 'userId', linked_key.owner_user_id::text)
        left join public.better_auth_users linked_auth_user on linked_auth_user.id = request.requested_by ->> 'userId'
       where request.scan_id is not null
         and lower(coalesce(linked_user.email, linked_auth_user.email, linked_key.created_by, '')) = any(${emailParameter}::text[])
      union
      select coalesce(request.fulfilled_by_scan_id, request.scan_id)::text
        from public.scan_requests request
        left join public.integration_api_keys linked_key on linked_key.public_id = request.requested_by ->> 'apiKeyId'
        left join public.users linked_user on linked_user.id::text = coalesce(request.requested_by ->> 'userId', linked_key.owner_user_id::text)
        left join public.better_auth_users linked_auth_user on linked_auth_user.id = request.requested_by ->> 'userId'
       where coalesce(request.fulfilled_by_scan_id, request.scan_id) is not null
         and lower(coalesce(linked_user.email, linked_auth_user.email, linked_key.created_by, '')) = any(${emailParameter}::text[])
    )), false)
  )`;
}

async function loadAdminMcpTelemetryDashboardUncached(
  snapshotPeriod: AdminMcpSnapshotPeriod = "24h",
  toolPeriod: AdminMcpSnapshotPeriod = "24h",
  sourcePeriod: AdminMcpSnapshotPeriod = "24h",
  includeCanary = false,
  excludeMacMiniScanBot = true,
) {
  const snapshotConfig = ADMIN_OPERATIONAL_SNAPSHOT_CONFIG[snapshotPeriod] ?? ADMIN_OPERATIONAL_SNAPSHOT_CONFIG["24h"];
  const toolConfig = ADMIN_OPERATIONAL_SNAPSHOT_CONFIG[toolPeriod] ?? ADMIN_OPERATIONAL_SNAPSHOT_CONFIG["24h"];
  const sourceConfig = ADMIN_OPERATIONAL_SNAPSHOT_CONFIG[sourcePeriod] ?? ADMIN_OPERATIONAL_SNAPSHOT_CONFIG["24h"];
  const internalQaFilter = includeCanary ? "" : internalQaMcpTrafficFilter("events", "$3", "$4", "$5");
  const macMiniFilter = macMiniMcpTrafficFilter("events", "$1", "$2");
  const macMiniEventFilter = macMiniMcpTrafficFilter("events", "$1", "$2");
  const dashboardFilterValues = [
    excludeMacMiniScanBot,
    MAC_MINI_SCAN_BOT_API_KEY_NAMES,
    INTERNAL_QA_EMAILS,
    INTERNAL_QA_REQUESTER_IPS,
    INTERNAL_QA_MCP_CLIENT_NAMES,
  ];
  const [summaryResult, trendResult, toolResult, surfaceResult, sourceResult, hostnameResult, retentionResult, comparisonResult] = await Promise.all([
    queryOne<SummaryRow>(
      `select count(*) as invocation_count,
              count(distinct session_id) filter (where session_id is not null) as session_count,
              count(distinct actor_id) filter (where actor_id is not null) as actor_count,
              count(*) filter (where tool_name = 'certscore_scan_site') as scan_count,
              count(*) filter (where tool_name = 'certscore_get_scan_status') as status_count,
              count(*) filter (where tool_name = 'certscore_get_scan_bundle') as bundle_count,
              count(*) filter (where outcome = 'success') as success_count,
              count(*) filter (where outcome = 'error') as error_count,
              count(*) filter (where outcome = 'rate_limited') as quota_limited_count,
              count(*) filter (where scan_decision = 'reused') as reused_scan_count,
              count(*) filter (where scan_decision = 'new') as new_scan_count,
              max(occurred_at) as newest_event_at,
              percentile_cont(0.5) within group (order by duration_ms) as p50_duration_ms,
              percentile_cont(0.95) within group (order by duration_ms) as p95_duration_ms
         from public.mcp_tool_invocation_events events
        where occurred_at >= ${snapshotConfig.bucketStart}
          and occurred_at < ${snapshotConfig.bucketEnd} + interval '${snapshotConfig.step}'
          ${internalQaFilter}
          ${macMiniFilter}`,
      dashboardFilterValues,
      { readOnly: true },
    ),
    query<TrendRow>(
      `with buckets as (
         select generate_series(
           ${snapshotConfig.bucketStart},
           ${snapshotConfig.bucketEnd},
           interval '${snapshotConfig.step}'
         ) as bucket
       )
       select to_char(buckets.bucket at time zone 'America/Los_Angeles', '${snapshotConfig.bucketLabel}') as bucket_label,
              count(events.event_id) as invocations,
              count(events.event_id) filter (where events.outcome = 'error') as errors,
              count(events.event_id) filter (where events.outcome = 'rate_limited') as quota_limited
         from buckets
         left join public.mcp_tool_invocation_events events
           on events.occurred_at >= buckets.bucket
          and events.occurred_at < buckets.bucket + interval '${snapshotConfig.step}'
          ${includeCanary ? "" : internalQaMcpTrafficFilter("events", "$3", "$4", "$5")}
          ${macMiniEventFilter}
        group by buckets.bucket
        order by buckets.bucket asc`,
      dashboardFilterValues,
      { readOnly: true },
    ),
    query<ToolRow>(
      `select surface,
              tool_name,
              count(*) as calls,
              count(*) filter (where outcome <> 'success') as errors,
              percentile_cont(0.5) within group (order by duration_ms) as p50_duration_ms,
              percentile_cont(0.95) within group (order by duration_ms) as p95_duration_ms
         from public.mcp_tool_invocation_events events
        where occurred_at >= ${toolConfig.bucketStart}
          and occurred_at < ${toolConfig.bucketEnd} + interval '${toolConfig.step}'
          ${internalQaFilter}
          ${macMiniFilter}
        group by surface, tool_name
        order by calls desc, surface asc, tool_name asc
        limit 100`,
      dashboardFilterValues,
      { readOnly: true },
    ),
    query<SurfaceRow>(
      `select surface,
              count(*) as calls,
              count(*) filter (where outcome <> 'success') as errors,
              count(distinct session_id) filter (where session_id is not null) as sessions,
              count(distinct actor_id) filter (where actor_id is not null) as actors
         from public.mcp_tool_invocation_events events
        where occurred_at >= ${snapshotConfig.bucketStart}
          and occurred_at < ${snapshotConfig.bucketEnd} + interval '${snapshotConfig.step}'
          ${internalQaFilter}
          ${macMiniFilter}
        group by surface
        order by calls desc`,
      dashboardFilterValues,
      { readOnly: true },
    ),
    query<SourceRow>(
      `select surface, source, source_attribution, auth_class, client_family,
              count(*) as calls,
              count(distinct session_id) filter (where session_id is not null) as session_count,
              count(distinct actor_id) filter (where actor_id is not null) as actor_count
         from public.mcp_tool_invocation_events events
        where occurred_at >= ${sourceConfig.bucketStart}
          and occurred_at < ${sourceConfig.bucketEnd} + interval '${sourceConfig.step}'
          ${internalQaFilter}
          ${macMiniFilter}
        group by surface, source, source_attribution, auth_class, client_family
        order by calls desc
        limit 50`,
      dashboardFilterValues,
      { readOnly: true },
    ),
    query<HostnameRow>(
      `select target_hostname,
              count(*) as calls,
              count(*) filter (where tool_name = 'certscore_scan_site') as scan_requests,
              max(occurred_at) as last_requested_at
         from public.mcp_tool_invocation_events events
        where occurred_at >= now() - interval '30 days'
          and target_hostname is not null
          ${internalQaFilter}
          ${macMiniFilter}
        group by target_hostname
        order by calls desc, scan_requests desc, target_hostname asc
        limit 20`,
      dashboardFilterValues,
      { readOnly: true },
    ),
    queryOne<RetentionRow>(
      `select min(occurred_at) as oldest_event_at,
              max(occurred_at) as newest_event_at,
              count(*) as total_event_count,
              count(*) filter (
                where occurred_at < now() - ($6::int * interval '1 day')
              ) as expired_event_count
         from public.mcp_tool_invocation_events events
        where true ${internalQaFilter} ${macMiniFilter}`,
      [...dashboardFilterValues, MCP_TELEMETRY_RETENTION_DAYS],
      { readOnly: true },
    ),
    queryOne<ComparisonRow>(
      `select count(*) as invocation_count,
              count(*) filter (where outcome = 'error') as error_count,
              percentile_cont(0.95) within group (order by duration_ms) as p95_duration_ms
         from public.mcp_tool_invocation_events events
        where occurred_at >= ${snapshotConfig.previousStart}
          and occurred_at < ${snapshotConfig.bucketStart}
          ${internalQaFilter}
          ${macMiniFilter}`,
      dashboardFilterValues,
      { readOnly: true },
    ),
  ]);

  const summary = summaryResult ?? {
    actor_count: 0, bundle_count: 0, error_count: 0, invocation_count: 0,
    newest_event_at: null,
    new_scan_count: 0, p50_duration_ms: null, p95_duration_ms: null,
    quota_limited_count: 0, reused_scan_count: 0, scan_count: 0,
    session_count: 0, status_count: 0, success_count: 0,
  };
  const metrics = {
    actors: count(summary.actor_count),
    bundles: count(summary.bundle_count),
    errors: count(summary.error_count),
    invocations: count(summary.invocation_count),
    newScans: count(summary.new_scan_count),
    p50DurationMs: nullableNumber(summary.p50_duration_ms),
    p95DurationMs: nullableNumber(summary.p95_duration_ms),
    quotaLimited: count(summary.quota_limited_count),
    reusedScans: count(summary.reused_scan_count),
    scans: count(summary.scan_count),
    sessions: count(summary.session_count),
    statusPolls: count(summary.status_count),
    successes: count(summary.success_count),
  };

  return {
    comparison: {
      errors: count(comparisonResult?.error_count ?? 0),
      invocations: count(comparisonResult?.invocation_count ?? 0),
      p95DurationMs: nullableNumber(comparisonResult?.p95_duration_ms ?? null),
    },
    snapshot: {
      label: snapshotConfig.label,
      period: snapshotPeriod,
    },
    sourceAnalytics: {
      label: sourceConfig.label,
      period: sourcePeriod,
    },
    toolAnalytics: {
      label: toolConfig.label,
      period: toolPeriod,
    },
    trend: trendResult.rows.map((row) => ({
      errors: count(row.errors),
      invocations: count(row.invocations),
      label: row.bucket_label,
      quotaLimited: count(row.quota_limited),
    })),
    metrics,
    rates: calculateMcpTelemetryRates({
      bundles: metrics.bundles,
      errors: metrics.errors,
      invocations: metrics.invocations,
      newScans: metrics.newScans,
      quotaLimited: metrics.quotaLimited,
      reusedScans: metrics.reusedScans,
      scans: metrics.scans,
      statusPolls: metrics.statusPolls,
    }),
    retention: {
      days: MCP_TELEMETRY_RETENTION_DAYS,
      expiredEvents: count(retentionResult?.expired_event_count ?? 0),
      newestEventAt: retentionResult?.newest_event_at ?? null,
      oldestEventAt: retentionResult?.oldest_event_at ?? null,
      totalEvents: count(retentionResult?.total_event_count ?? 0),
    },
    newestAt: summary.newest_event_at,
    sources: sourceResult.rows.map((row) => ({
      actors: count(row.actor_count),
      authClass: row.auth_class,
      calls: count(row.calls),
      clientFamily: row.client_family,
      sessions: count(row.session_count),
      source: row.source,
      sourceAttribution: row.source_attribution,
      surface: row.surface,
    })),
    surfaces: surfaceResult.rows.map((row) => ({
      actors: count(row.actors),
      calls: count(row.calls),
      errors: count(row.errors),
      sessions: count(row.sessions),
      surface: row.surface,
    })),
    tools: toolResult.rows.map((row) => ({
      calls: count(row.calls),
      errors: count(row.errors),
      p50DurationMs: nullableNumber(row.p50_duration_ms),
      p95DurationMs: nullableNumber(row.p95_duration_ms),
      surface: row.surface,
      toolName: row.tool_name,
    })),
    topHostnames: hostnameResult.rows.map((row) => ({
      calls: count(row.calls),
      hostname: row.target_hostname,
      lastRequestedAt: row.last_requested_at,
      scanRequests: count(row.scan_requests),
    })),
  };
}

const loadCachedAdminMcpTelemetryDashboard = unstable_cache(
  loadAdminMcpTelemetryDashboardUncached,
  ["admin-mcp-operational-snapshot-v1"],
  { revalidate: 30 },
);

export async function loadAdminMcpTelemetryDashboard(
  snapshotPeriod: AdminMcpSnapshotPeriod = "24h",
  toolPeriod: AdminMcpSnapshotPeriod = "24h",
  sourcePeriod: AdminMcpSnapshotPeriod = "24h",
  includeCanary = false,
  excludeMacMiniScanBot = true,
) {
  await requirePlatformAdminContext();
  return loadCachedAdminMcpTelemetryDashboard(snapshotPeriod, toolPeriod, sourcePeriod, includeCanary, excludeMacMiniScanBot);
}

export async function listAdminMcpTelemetryEventsPage(
  limit: number,
  offset: number,
  filters: AdminMcpTelemetryEventFilters = {},
) {
  await requirePlatformAdminContext();

  const conditions: string[] = [];
  const values: unknown[] = [];
  const addValue = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const queryText = filters.query?.trim().slice(0, 160) ?? "";
  if (!filters.includeCanary) {
    const emailParameter = addValue(INTERNAL_QA_EMAILS);
    const requesterIpParameter = addValue(INTERNAL_QA_REQUESTER_IPS);
    const clientNameParameter = addValue(INTERNAL_QA_MCP_CLIENT_NAMES);
    conditions.push(internalQaMcpTrafficFilter("events", emailParameter, requesterIpParameter, clientNameParameter).replace(/^and /, ""));
  }
  if (filters.excludeMacMiniScanBot !== false) {
    const apiKeyNamesParameter = addValue(MAC_MINI_SCAN_BOT_API_KEY_NAMES);
    conditions.push(macMiniMcpTrafficFilter("events", "true", apiKeyNamesParameter).replace(/^and /, ""));
  }

  if (queryText) {
    const parameter = addValue(`%${queryText}%`);
    conditions.push(`(
      target_hostname ilike ${parameter}
      or scan_id ilike ${parameter}
      or request_id::text ilike ${parameter}
      or event_id::text ilike ${parameter}
      or session_id ilike ${parameter}
      or actor_id ilike ${parameter}
      or tool_name ilike ${parameter}
      or client_family ilike ${parameter}
      or coalesce(client_name, '') ilike ${parameter}
      or caller_product ilike ${parameter}
      or attribution_confidence ilike ${parameter}
      or coalesce(requested_resource, '') ilike ${parameter}
      or coalesce(requester_ip::text, '') ilike ${parameter}
      or error_code ilike ${parameter}
    )`);
  }
  if (filters.surface) conditions.push(`surface = ${addValue(filters.surface)}`);
  if (filters.source) conditions.push(`source = ${addValue(filters.source)}`);
  if (filters.product) conditions.push(`caller_product = ${addValue(filters.product)}`);
  if (filters.confidence) conditions.push(`attribution_confidence = ${addValue(filters.confidence)}`);
  if (filters.toolName) conditions.push(`tool_name = ${addValue(filters.toolName.slice(0, 100))}`);
  if (filters.outcome) conditions.push(`outcome = ${addValue(filters.outcome)}`);
  if (filters.scanDecision) conditions.push(`scan_decision = ${addValue(filters.scanDecision)}`);

  const timeSpan = filters.timeSpan ?? "30d";
  const timeSpanSql = timeSpan === "all" ? null : {
    "4h": "occurred_at >= now() - interval '4 hours'",
    "12h": "occurred_at >= now() - interval '12 hours'",
    "24h": "occurred_at >= now() - interval '24 hours'",
    "7d": "occurred_at >= now() - interval '7 days'",
    "30d": "occurred_at >= now() - interval '30 days'",
  }[timeSpan];
  if (timeSpanSql) conditions.push(timeSpanSql);

  const whereSql = conditions.length > 0 ? `where ${conditions.join("\n and ")}` : "";
  const limitParameter = `$${values.length + 1}`;
  const offsetParameter = `$${values.length + 2}`;
  const [totalResult, eventResult] = await Promise.all([
    queryOne<TotalRow>(
      `select count(*) as total_count
         from public.mcp_tool_invocation_events events
         ${whereSql}`,
      values,
      { readOnly: true },
    ),
    query<AdminMcpTelemetryEventRow>(
      `select events.event_id, events.occurred_at, events.surface, events.source,
              events.source_attribution, events.auth_class, events.client_family, events.client_name,
              events.caller_product, events.attribution_confidence, events.attribution_signals,
              events.attribution_ruleset_version, events.execution_channel, events.installation_origin,
              events.tool_name, events.request_id,
              coalesce(events.target_hostname, canonical_domain.hostname) as target_hostname,
              case
                when events.target_hostname is not null then 'request'
                when canonical_domain.hostname is not null then 'canonical_scan'
                else null
              end as target_provenance,
              events.freshness,
              coalesce(
                events.scan_from,
                case
                  when canonical_scan.scan_config_json ->> 'scanFrom' in ('eu_de', 'eu_ie', 'california')
                    then canonical_scan.scan_config_json ->> 'scanFrom'
                  else null
                end
              ) as scan_from,
              case
                when events.scan_from is not null then 'request'
                when canonical_scan.scan_config_json ->> 'scanFrom' in ('eu_de', 'eu_ie', 'california') then 'canonical_scan'
                else null
              end as perspective_provenance,
              events.scan_id, events.scan_decision, events.scan_status, events.outcome,
              events.transport_outcome, events.duration_ms, events.quota_outcome, events.error_code,
              events.session_id, events.actor_id,
              events.requested_resource, events.requested_resource_type, events.requester_network,
              events.requester_ip::text as retained_requester_ip,
              events.requester_ip_hash as retained_requester_ip_hash,
              coalesce(requester.requested_url, canonical_page.page_url) as page_url,
              requester.request_context ->> 'detail' as mode_detail,
              requester.request_context ->> 'format' as mode_format,
              snapshot.tranco_rank,
              snapshot.certscore_overall::int as score,
              snapshot.top_finding_count::int as top_finding_count,
              snapshot.admin_evidence_matrix,
              snapshot.access_posture_class,
              snapshot.blocked_flag,
              snapshot.captcha_flag,
              snapshot.admin_summary_generated_at,
              snapshot.scan_outcome,
              snapshot.site_language_primary as primary_language,
              snapshot.admin_industry_label as industry,
              canonical_scan.egress_id as scanner_egress_id,
              canonical_scan.egress_provider as scanner_egress_provider,
              case
                when canonical_scan.completed_at is not null and canonical_scan.started_at is not null
                then extract(epoch from (canonical_scan.completed_at - canonical_scan.started_at))::float8
                else null
              end as scan_elapsed_seconds,
              requester.request_context as requester_request_context,
              requester.requested_by as requester_requested_by
         from public.mcp_tool_invocation_events events
         left join public.scans canonical_scan
           on canonical_scan.id = case
             when events.scan_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
               then events.scan_id::uuid
             else null
           end
         left join public.domains canonical_domain on canonical_domain.id = canonical_scan.domain_id
         left join lateral (
           select retained.tranco_rank,
                  retained.certscore_overall,
                  retained.top_finding_count,
                  retained.admin_evidence_matrix,
                  retained.access_posture_class,
                  retained.blocked_flag,
                  retained.captcha_flag,
                  retained.admin_summary_generated_at,
                  retained.scan_outcome,
                  retained.site_language_primary,
                  retained.admin_industry_label
             from public.scan_snapshots retained
            where retained.scan_id = canonical_scan.id
            limit 1
         ) snapshot on true
         left join lateral (
           select page.page_url
             from public.scan_pages page
            where page.scan_id = canonical_scan.id
            order by case when page.page_type = 'homepage' then 0 else 1 end, page.page_url asc
            limit 1
         ) canonical_page on true
         left join lateral (
           select candidate.request_context, candidate.requested_by, candidate.requested_url
             from (
               select request.request_context, request.requested_by, request.requested_url, request.requested_at
                 from public.pulse_requests request
                where request.scan_id::text = events.scan_id
               union all
               select request.request_context, request.requested_by, request.requested_url, request.requested_at
                 from public.scan_requests request
                where coalesce(request.fulfilled_by_scan_id, request.scan_id)::text = events.scan_id
             ) candidate
            order by (
              coalesce(
                nullif(candidate.request_context ->> 'sourceIp', ''),
                nullif(candidate.request_context -> 'provenance' ->> 'sourceIp', ''),
                nullif(candidate.request_context ->> 'originIp', ''),
                nullif(candidate.request_context -> 'provenance' ->> 'originIp', ''),
                nullif(candidate.request_context ->> 'ipHash', ''),
                nullif(candidate.request_context -> 'provenance' ->> 'ipHash', ''),
                nullif(candidate.requested_by ->> 'sourceIp', ''),
                nullif(candidate.requested_by ->> 'ipHash', '')
              ) is not null
            ) desc,
            (nullif(candidate.requested_url, '') is not null) desc,
            candidate.requested_at desc
            limit 1
         ) requester on true
         ${whereSql}
        order by events.occurred_at desc
        limit ${limitParameter}
       offset ${offsetParameter}`,
      [...values, limit, offset],
      { readOnly: true },
    ),
  ]);

  return {
    items: eventResult.rows.map((row) => {
      const requesterIp = requesterIpAttributionFromRequest({
        request_context: row.requester_request_context,
        requested_by: row.requester_requested_by,
      });
      const {
        admin_evidence_matrix: rawEvidenceMatrix,
        retained_requester_ip: retainedRequesterIp,
        retained_requester_ip_hash: retainedRequesterIpHash,
        requester_request_context: _requestContext,
        requester_requested_by: _requestedBy,
        ...event
      } = row;
      return {
        ...event,
        evidence_matrix: parseAdminEvidenceMatrix(rawEvidenceMatrix),
        source_ip: retainedRequesterIp ?? requesterIp.sourceIp,
        source_ip_hash: retainedRequesterIpHash ?? requesterIp.ipHash,
        source_ip_source: retainedRequesterIp ? "event" : retainedRequesterIpHash ? "hash_only" : requesterIp.source,
      };
    }),
    totalCount: count(totalResult?.total_count ?? 0),
  };
}
