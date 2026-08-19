import "server-only";

import { query, queryOne } from "@website-signal-risk-scanner/db";
import { requirePlatformAdminContext } from "./platform-admin";

export type ProductAnalyticsPeriod = "24h" | "7d" | "30d" | "90d";
export type ProductAnalyticsEventName = "page_viewed" | "navigation_clicked" | "action_clicked" | "form_started" | "form_submitted" | "form_succeeded" | "form_failed" | "scan_started" | "scan_completed" | "scan_viewed" | "report_viewed" | "scroll_depth_reached" | "session_engaged" | "web_vital_recorded" | "client_error" | "account_created" | "analytics_opted_in" | "analytics_opted_out";
export type ProductAnalyticsOutcome = "observed" | "started" | "submitted" | "success" | "failure" | "opted_in" | "opted_out";

const PERIODS = {
  "24h": { interval: "24 hours", bucket: "1 hour", label: "Last 24 hours", format: "HH24:00" },
  "7d": { interval: "7 days", bucket: "1 day", label: "Last 7 days", format: "Mon DD" },
  "30d": { interval: "30 days", bucket: "1 day", label: "Last 30 days", format: "Mon DD" },
  "90d": { interval: "90 days", bucket: "1 day", label: "Last 90 days", format: "Mon DD" }
} as const;

type Count = string | number | null | undefined;
type SummaryRow = { actors: Count; authenticated: Count; errors: Count; events: Count; page_views: Count; scans: Count; sessions: Count; opted_out: Count };
type TrendRow = { bucket: string; events: Count; sessions: Count };
type RouteRow = { normalized_route: string; events: Count; sessions: Count };
type FeatureRow = { event_name: string; feature: string; events: Count; sessions: Count };

export type ProductAnalyticsRecentEvent = {
  actor_id: string | null;
  consent_state: string;
  country_code: string | null;
  device_class: string;
  email: string | null;
  event_id: string;
  event_name: string;
  feature: string;
  hostname: string | null;
  normalized_route: string;
  occurred_at: string;
  outcome: string;
  scan_id: string | null;
  session_id: string | null;
};

export type ProductAnalyticsEventFilters = {
  eventName?: ProductAnalyticsEventName | null;
  outcome?: ProductAnalyticsOutcome | null;
  query?: string | null;
};

function number(value: Count) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function loadProductAnalyticsDashboard(period: ProductAnalyticsPeriod, includeInternal = false, includeBots = false) {
  await requirePlatformAdminContext();
  const config = PERIODS[period] ?? PERIODS["24h"];
  const audience = `${includeInternal ? "" : "and events.is_staff = false"} ${includeBots ? "" : "and events.is_bot = false"}`;
  const [summary, trend, routes, features, recent] = await Promise.all([
    queryOne<SummaryRow>(
      `select count(*) as events,
              count(distinct session_id) filter (where session_id is not null) as sessions,
              count(distinct actor_id) filter (where actor_id is not null) as actors,
              count(*) filter (where is_authenticated) as authenticated,
              count(*) filter (where event_name in ('page_viewed', 'scan_viewed', 'report_viewed')) as page_views,
              count(*) filter (where scan_id is not null) as scans,
              count(*) filter (where event_name = 'client_error' or outcome = 'failure') as errors,
              count(*) filter (where event_name = 'analytics_opted_out') as opted_out
         from public.product_analytics_events events
        where occurred_at >= now() - interval '${config.interval}' ${audience}`,
      [],
      { readOnly: true }
    ),
    query<TrendRow>(
      `select to_char(date_bin(interval '${config.bucket}', occurred_at, timestamptz '2001-01-01') at time zone 'UTC', '${config.format}') as bucket,
              count(*) as events,
              count(distinct session_id) filter (where session_id is not null) as sessions
         from public.product_analytics_events events
        where occurred_at >= now() - interval '${config.interval}' ${audience}
        group by date_bin(interval '${config.bucket}', occurred_at, timestamptz '2001-01-01')
        order by min(occurred_at) asc`,
      [],
      { readOnly: true }
    ),
    query<RouteRow>(
      `select normalized_route, count(*) as events, count(distinct session_id) filter (where session_id is not null) as sessions
         from public.product_analytics_events events
        where occurred_at >= now() - interval '${config.interval}' ${audience}
        group by normalized_route order by events desc limit 12`,
      [],
      { readOnly: true }
    ),
    query<FeatureRow>(
      `select event_name, feature, count(*) as events, count(distinct session_id) filter (where session_id is not null) as sessions
         from public.product_analytics_events events
        where occurred_at >= now() - interval '${config.interval}' ${audience}
        group by event_name, feature order by events desc limit 15`,
      [],
      { readOnly: true }
    ),
    query<ProductAnalyticsRecentEvent>(
      `select events.event_id, events.occurred_at, events.event_name, events.feature, events.outcome,
              events.normalized_route, events.session_id::text, events.actor_id::text, events.scan_id::text,
              events.consent_state, events.device_class, events.country_code, users.email, domains.hostname
         from public.product_analytics_events events
         left join public.users on users.id = events.user_id
         left join public.scans on scans.id = events.scan_id
         left join public.domains on domains.id = scans.domain_id
        where events.occurred_at >= now() - interval '${config.interval}' ${audience}
        order by events.occurred_at desc limit 100`,
      [],
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
    trend: trend.rows.map((row) => ({ bucket: row.bucket, events: number(row.events), sessions: number(row.sessions) })),
    routes: routes.rows.map((row) => ({ route: row.normalized_route, events: number(row.events), sessions: number(row.sessions) })),
    features: features.rows.map((row) => ({ eventName: row.event_name, feature: row.feature, events: number(row.events), sessions: number(row.sessions) })),
    recent: recent.rows
  };
}

export async function listProductAnalyticsEventsPage(
  period: ProductAnalyticsPeriod,
  includeInternal: boolean,
  includeBots: boolean,
  pageSize: number,
  offset: number,
  filters: ProductAnalyticsEventFilters = {}
) {
  await requirePlatformAdminContext();
  const config = PERIODS[period] ?? PERIODS["24h"];
  const values: unknown[] = [config.interval];
  const clauses = [`events.occurred_at >= now() - $1::interval`];
  if (!includeInternal) clauses.push("events.is_staff = false");
  if (!includeBots) clauses.push("events.is_bot = false");
  if (filters.eventName) { values.push(filters.eventName); clauses.push(`events.event_name = $${values.length}`); }
  if (filters.outcome) { values.push(filters.outcome); clauses.push(`events.outcome = $${values.length}`); }
  const queryText = filters.query?.trim().slice(0, 160);
  if (queryText) {
    values.push(`%${queryText}%`);
    const parameter = `$${values.length}`;
    clauses.push(`(events.normalized_route ilike ${parameter} or events.feature ilike ${parameter} or events.event_name ilike ${parameter} or events.session_id::text ilike ${parameter} or events.actor_id::text ilike ${parameter} or users.email ilike ${parameter} or domains.hostname ilike ${parameter})`);
  }
  const where = clauses.join(" and ");
  const [total, rows] = await Promise.all([
    queryOne<{ total_count: string }>(
      `select count(*) as total_count
         from public.product_analytics_events events
         left join public.users on users.id = events.user_id
         left join public.scans on scans.id = events.scan_id
         left join public.domains on domains.id = scans.domain_id
        where ${where}`,
      values,
      { readOnly: true }
    ),
    query<ProductAnalyticsRecentEvent>(
      `select events.event_id, events.occurred_at, events.event_name, events.feature, events.outcome,
              events.normalized_route, events.session_id::text, events.actor_id::text, events.scan_id::text,
              events.consent_state, events.device_class, events.country_code, users.email, domains.hostname
         from public.product_analytics_events events
         left join public.users on users.id = events.user_id
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
