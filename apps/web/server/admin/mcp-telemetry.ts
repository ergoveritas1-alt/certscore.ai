import "server-only";

import { query, queryOne } from "@website-signal-risk-scanner/db";
import type { McpTelemetrySurface } from "@website-signal-risk-scanner/shared";
import { calculateMcpTelemetryRates } from "../../lib/admin/mcp-telemetry-rates";
import { requirePlatformAdminContext } from "./platform-admin";

type CountValue = number | string | null;

type SummaryRow = {
  actor_count_30d: CountValue;
  bundle_count_30d: CountValue;
  error_count_30d: CountValue;
  invocation_count_30d: CountValue;
  invocation_count_7d: CountValue;
  invocation_count_today: CountValue;
  new_scan_count_30d: CountValue;
  p50_duration_ms_30d: CountValue;
  p95_duration_ms_30d: CountValue;
  quota_limited_count_30d: CountValue;
  reused_scan_count_30d: CountValue;
  scan_count_30d: CountValue;
  session_count_30d: CountValue;
  status_count_30d: CountValue;
  success_count_30d: CountValue;
};

type DailyRow = {
  day: string;
  errors: CountValue;
  invocations: CountValue;
  quota_limited: CountValue;
};

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

type RecentRow = {
  actor_id: string | null;
  auth_class: "anonymous" | "authenticated";
  client_family: string;
  duration_ms: number;
  error_code: string | null;
  occurred_at: string;
  outcome: "success" | "error" | "rate_limited";
  scan_decision: "reused" | "new" | "unavailable" | "not_applicable";
  scan_from: string | null;
  scan_id: string | null;
  session_id: string | null;
  source: "openai" | "anthropic" | "unknown";
  source_attribution: string;
  surface: McpTelemetrySurface;
  target_hostname: string | null;
  tool_name: string;
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

export async function loadAdminMcpTelemetryDashboard() {
  await requirePlatformAdminContext();
  const [summaryResult, dailyResult, toolResult, surfaceResult, sourceResult, hostnameResult, recentResult] = await Promise.all([
    queryOne<SummaryRow>(
      `select count(*) filter (where occurred_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')) as invocation_count_today,
              count(*) filter (where occurred_at >= now() - interval '7 days') as invocation_count_7d,
              count(*) as invocation_count_30d,
              count(distinct session_id) filter (where session_id is not null) as session_count_30d,
              count(distinct actor_id) filter (where actor_id is not null) as actor_count_30d,
              count(*) filter (where tool_name = 'certscore_scan_site') as scan_count_30d,
              count(*) filter (where tool_name = 'certscore_get_scan_status') as status_count_30d,
              count(*) filter (where tool_name = 'certscore_get_scan_bundle') as bundle_count_30d,
              count(*) filter (where outcome = 'success') as success_count_30d,
              count(*) filter (where outcome = 'error') as error_count_30d,
              count(*) filter (where outcome = 'rate_limited') as quota_limited_count_30d,
              count(*) filter (where scan_decision = 'reused') as reused_scan_count_30d,
              count(*) filter (where scan_decision = 'new') as new_scan_count_30d,
              percentile_cont(0.5) within group (order by duration_ms) as p50_duration_ms_30d,
              percentile_cont(0.95) within group (order by duration_ms) as p95_duration_ms_30d
         from public.mcp_tool_invocation_events
        where occurred_at >= now() - interval '30 days'`,
      [],
      { readOnly: true },
    ),
    query<DailyRow>(
      `with days as (
         select generate_series(
           (now() at time zone 'UTC')::date - 29,
           (now() at time zone 'UTC')::date,
           interval '1 day'
         )::date as day
       )
       select to_char(days.day, 'YYYY-MM-DD') as day,
              count(events.event_id) as invocations,
              count(events.event_id) filter (where events.outcome = 'error') as errors,
              count(events.event_id) filter (where events.outcome = 'rate_limited') as quota_limited
         from days
         left join public.mcp_tool_invocation_events events
           on (events.occurred_at at time zone 'UTC')::date = days.day
        group by days.day
        order by days.day asc`,
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
        where occurred_at >= now() - interval '30 days'
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
        where occurred_at >= now() - interval '30 days'
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
        where occurred_at >= now() - interval '30 days'
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
        group by target_hostname
        order by calls desc, scan_requests desc, target_hostname asc
        limit 20`,
      [],
      { readOnly: true },
    ),
    query<RecentRow>(
      `select occurred_at, surface, source, source_attribution, auth_class, client_family,
              tool_name, target_hostname, scan_from, scan_id, scan_decision, outcome,
              duration_ms, error_code, session_id, actor_id
         from public.mcp_tool_invocation_events
        order by occurred_at desc
        limit 40`,
      [],
      { readOnly: true },
    ),
  ]);

  const summary = summaryResult ?? {
    actor_count_30d: 0, bundle_count_30d: 0, error_count_30d: 0, invocation_count_30d: 0,
    invocation_count_7d: 0, invocation_count_today: 0, new_scan_count_30d: 0,
    p50_duration_ms_30d: null, p95_duration_ms_30d: null, quota_limited_count_30d: 0,
    reused_scan_count_30d: 0, scan_count_30d: 0, session_count_30d: 0,
    status_count_30d: 0, success_count_30d: 0,
  };
  const metrics = {
    actors30d: count(summary.actor_count_30d),
    bundles30d: count(summary.bundle_count_30d),
    errors30d: count(summary.error_count_30d),
    invocations30d: count(summary.invocation_count_30d),
    invocations7d: count(summary.invocation_count_7d),
    invocationsToday: count(summary.invocation_count_today),
    newScans30d: count(summary.new_scan_count_30d),
    p50DurationMs30d: nullableNumber(summary.p50_duration_ms_30d),
    p95DurationMs30d: nullableNumber(summary.p95_duration_ms_30d),
    quotaLimited30d: count(summary.quota_limited_count_30d),
    reusedScans30d: count(summary.reused_scan_count_30d),
    scans30d: count(summary.scan_count_30d),
    sessions30d: count(summary.session_count_30d),
    statusPolls30d: count(summary.status_count_30d),
    successes30d: count(summary.success_count_30d),
  };

  return {
    daily: dailyResult.rows.map((row) => ({
      day: row.day,
      errors: count(row.errors),
      invocations: count(row.invocations),
      quotaLimited: count(row.quota_limited),
    })),
    metrics,
    rates: calculateMcpTelemetryRates({
      bundles: metrics.bundles30d,
      errors: metrics.errors30d,
      invocations: metrics.invocations30d,
      newScans: metrics.newScans30d,
      quotaLimited: metrics.quotaLimited30d,
      reusedScans: metrics.reusedScans30d,
      scans: metrics.scans30d,
      statusPolls: metrics.statusPolls30d,
    }),
    recent: recentResult.rows,
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
