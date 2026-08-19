import "server-only";

import { query, queryOne } from "@website-signal-risk-scanner/db";
import { MCP_TELEMETRY_RETENTION_DAYS, type McpTelemetrySurface } from "@website-signal-risk-scanner/shared";
import { calculateMcpTelemetryRates } from "../../lib/admin/mcp-telemetry-rates";
import { requirePlatformAdminContext } from "./platform-admin";

type CountValue = number | string | null;

type SummaryRow = {
  actor_count: CountValue;
  bundle_count: CountValue;
  error_count: CountValue;
  invocation_count: CountValue;
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

type TrendRow = {
  bucket_label: string;
  errors: CountValue;
  invocations: CountValue;
  quota_limited: CountValue;
};

export type AdminMcpSnapshotPeriod = "1h" | "24h" | "7d" | "30d" | "1y";

const SNAPSHOT_CONFIG = {
  "1h": {
    bucketEnd: "date_bin('5 minutes', now(), timestamptz '2001-01-01')",
    bucketLabel: "HH24:MI",
    bucketStart: "date_bin('5 minutes', now(), timestamptz '2001-01-01') - interval '55 minutes'",
    label: "Last hour",
    step: "5 minutes",
  },
  "24h": {
    bucketEnd: "date_trunc('hour', now())",
    bucketLabel: "Mon DD HH24:00",
    bucketStart: "date_trunc('hour', now()) - interval '23 hours'",
    label: "Last 24 hours",
    step: "1 hour",
  },
  "7d": {
    bucketEnd: "date_trunc('day', now())",
    bucketLabel: "Mon DD",
    bucketStart: "date_trunc('day', now()) - interval '6 days'",
    label: "Last 7 days",
    step: "1 day",
  },
  "30d": {
    bucketEnd: "date_trunc('day', now())",
    bucketLabel: "Mon DD",
    bucketStart: "date_trunc('day', now()) - interval '29 days'",
    label: "Last 30 days",
    step: "1 day",
  },
  "1y": {
    bucketEnd: "date_trunc('month', now())",
    bucketLabel: "Mon YYYY",
    bucketStart: "date_trunc('month', now()) - interval '11 months'",
    label: "Last year",
    step: "1 month",
  },
} as const;

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
  source: "openai" | "anthropic" | "unknown";
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
  actor_id: string | null;
  auth_class: "anonymous" | "authenticated";
  client_family: string;
  duration_ms: number;
  error_code: string | null;
  event_id: string;
  freshness: "latest" | "refresh" | null;
  occurred_at: string;
  outcome: "success" | "error" | "rate_limited";
  quota_outcome: "allowed" | "rate_limited" | "not_applicable";
  request_id: string;
  scan_decision: "reused" | "new" | "unavailable" | "not_applicable";
  scan_from: string | null;
  scan_id: string | null;
  scan_status: string | null;
  session_id: string | null;
  source: "openai" | "anthropic" | "unknown";
  source_attribution: string;
  surface: McpTelemetrySurface;
  target_hostname: string | null;
  tool_name: string;
  transport_outcome: "mcp_result" | "mcp_error" | "http_429";
};

export type AdminMcpTelemetryEventFilters = {
  includeCanary?: boolean;
  outcome?: "success" | "error" | "rate_limited" | null;
  query?: string | null;
  scanDecision?: "reused" | "new" | "unavailable" | "not_applicable" | null;
  source?: "openai" | "anthropic" | "unknown" | null;
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

export async function loadAdminMcpTelemetryDashboard(
  snapshotPeriod: AdminMcpSnapshotPeriod = "24h",
  toolPeriod: AdminMcpSnapshotPeriod = "24h",
  sourcePeriod: AdminMcpSnapshotPeriod = "24h",
  includeCanary = false,
) {
  await requirePlatformAdminContext();
  const snapshotConfig = SNAPSHOT_CONFIG[snapshotPeriod] ?? SNAPSHOT_CONFIG["24h"];
  const toolConfig = SNAPSHOT_CONFIG[toolPeriod] ?? SNAPSHOT_CONFIG["24h"];
  const sourceConfig = SNAPSHOT_CONFIG[sourcePeriod] ?? SNAPSHOT_CONFIG["24h"];
  const canaryFilter = includeCanary ? "" : "and is_canary = false";
  const [summaryResult, trendResult, toolResult, surfaceResult, sourceResult, hostnameResult, retentionResult] = await Promise.all([
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
              percentile_cont(0.5) within group (order by duration_ms) as p50_duration_ms,
              percentile_cont(0.95) within group (order by duration_ms) as p95_duration_ms
         from public.mcp_tool_invocation_events
        where occurred_at >= ${snapshotConfig.bucketStart}
          and occurred_at < ${snapshotConfig.bucketEnd} + interval '${snapshotConfig.step}'
          ${canaryFilter}`,
      [],
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
       select to_char(buckets.bucket at time zone 'UTC', '${snapshotConfig.bucketLabel}') as bucket_label,
              count(events.event_id) as invocations,
              count(events.event_id) filter (where events.outcome = 'error') as errors,
              count(events.event_id) filter (where events.outcome = 'rate_limited') as quota_limited
         from buckets
         left join public.mcp_tool_invocation_events events
           on events.occurred_at >= buckets.bucket
          and events.occurred_at < buckets.bucket + interval '${snapshotConfig.step}'
          ${canaryFilter.replace("and is_canary", "and events.is_canary")}
        group by buckets.bucket
        order by buckets.bucket asc`,
      [],
      { readOnly: true },
    ),
    query<ToolRow>(
      `select surface,
              tool_name,
              count(*) as calls,
              count(*) filter (where outcome <> 'success') as errors,
              percentile_cont(0.5) within group (order by duration_ms) as p50_duration_ms,
              percentile_cont(0.95) within group (order by duration_ms) as p95_duration_ms
         from public.mcp_tool_invocation_events
        where occurred_at >= ${toolConfig.bucketStart}
          and occurred_at < ${toolConfig.bucketEnd} + interval '${toolConfig.step}'
          ${canaryFilter}
        group by surface, tool_name
        order by calls desc, surface asc, tool_name asc
        limit 100`,
      [],
      { readOnly: true },
    ),
    query<SurfaceRow>(
      `select surface,
              count(*) as calls,
              count(*) filter (where outcome <> 'success') as errors,
              count(distinct session_id) filter (where session_id is not null) as sessions,
              count(distinct actor_id) filter (where actor_id is not null) as actors
         from public.mcp_tool_invocation_events
        where occurred_at >= ${snapshotConfig.bucketStart}
          and occurred_at < ${snapshotConfig.bucketEnd} + interval '${snapshotConfig.step}'
          ${canaryFilter}
        group by surface
        order by calls desc`,
      [],
      { readOnly: true },
    ),
    query<SourceRow>(
      `select surface, source, source_attribution, auth_class, client_family,
              count(*) as calls,
              count(distinct session_id) filter (where session_id is not null) as session_count,
              count(distinct actor_id) filter (where actor_id is not null) as actor_count
         from public.mcp_tool_invocation_events
        where occurred_at >= ${sourceConfig.bucketStart}
          and occurred_at < ${sourceConfig.bucketEnd} + interval '${sourceConfig.step}'
          ${canaryFilter}
        group by surface, source, source_attribution, auth_class, client_family
        order by calls desc
        limit 50`,
      [],
      { readOnly: true },
    ),
    query<HostnameRow>(
      `select target_hostname,
              count(*) as calls,
              count(*) filter (where tool_name = 'certscore_scan_site') as scan_requests,
              max(occurred_at) as last_requested_at
         from public.mcp_tool_invocation_events
        where occurred_at >= now() - interval '30 days'
          and target_hostname is not null
          ${canaryFilter}
        group by target_hostname
        order by calls desc, scan_requests desc, target_hostname asc
        limit 20`,
      [],
      { readOnly: true },
    ),
    queryOne<RetentionRow>(
      `select min(occurred_at) as oldest_event_at,
              max(occurred_at) as newest_event_at,
              count(*) as total_event_count,
              count(*) filter (
                where occurred_at < now() - ($1::int * interval '1 day')
              ) as expired_event_count
         from public.mcp_tool_invocation_events
        where true ${canaryFilter}`,
      [MCP_TELEMETRY_RETENTION_DAYS],
      { readOnly: true },
    ),
  ]);

  const summary = summaryResult ?? {
    actor_count: 0, bundle_count: 0, error_count: 0, invocation_count: 0,
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

export async function listAdminMcpTelemetryEventsPage(
  limit: number,
  offset: number,
  filters: AdminMcpTelemetryEventFilters = {},
) {
  await requirePlatformAdminContext();

  const conditions: string[] = [];
  const values: Array<string | number> = [];
  const addValue = (value: string | number) => {
    values.push(value);
    return `$${values.length}`;
  };
  const queryText = filters.query?.trim().slice(0, 160) ?? "";
  if (!filters.includeCanary) conditions.push("is_canary = false");

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
      or error_code ilike ${parameter}
    )`);
  }
  if (filters.surface) conditions.push(`surface = ${addValue(filters.surface)}`);
  if (filters.source) conditions.push(`source = ${addValue(filters.source)}`);
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
         from public.mcp_tool_invocation_events
         ${whereSql}`,
      values,
      { readOnly: true },
    ),
    query<AdminMcpTelemetryEvent>(
      `select event_id, occurred_at, surface, source, source_attribution, auth_class, client_family,
              tool_name, request_id, target_hostname, freshness, scan_from, scan_id, scan_decision,
              scan_status, outcome, transport_outcome, duration_ms, quota_outcome, error_code,
              session_id, actor_id
         from public.mcp_tool_invocation_events
         ${whereSql}
        order by occurred_at desc
        limit ${limitParameter}
       offset ${offsetParameter}`,
      [...values, limit, offset],
      { readOnly: true },
    ),
  ]);

  return {
    items: eventResult.rows,
    totalCount: count(totalResult?.total_count ?? 0),
  };
}
