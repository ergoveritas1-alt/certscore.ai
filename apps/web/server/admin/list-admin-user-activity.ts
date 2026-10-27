"use server";

import { query, queryOne } from "@website-signal-risk-scanner/db";
import { ADMIN_API_ROUTES, adminApiRouteSql, type AdminApiRoute } from "../../lib/admin/api-route";
import { ADMIN_FULL_SITE_PAGES_SCANNED_SQL } from "../../lib/admin/scan-page-count-sql";
import { requirePlatformAdminContext } from "./platform-admin";

const ADMIN_SCAN_STATUSES = ["queued", "running", "finalizing", "completed", "completed_limited", "failed", "expired", "rate_limited", "no_go"] as const;

type AdminUserActivityData = {
  user: {
    createdAt: string;
    email: string;
    fullName: string | null;
    id: string;
    lastLoginAt: string | null;
    organizationName: string | null;
  };
  metrics: {
    associatedScans: number;
    completedScans: number;
    domains: number;
    lastScanRequestedAt: string | null;
    scanRequestCount: number;
    totalScans: number;
  };
  scanStatusCounts: Array<{ count: number; status: string }>;
  apiRoutes: Array<{ channels: string[]; count: number; lastRequestedAt: string | null; route: AdminApiRoute }>;
  events: AdminUserEvent[];
  eventCount: number;
  scans: Array<{
    association: "claimed" | "submitted";
    completedAt: string | null;
    createdAt: string;
    domainHostname: string | null;
    id: string;
    pagesScanned: number;
    scanType: string;
    status: string;
  }>;
};

export type AdminUserActivityTab = "scans" | "events";

export type AdminUserActivity = { user: AdminUserActivityData["user"]; page: number } & (
  | ({ tab: "scans" } & Pick<AdminUserActivityData, "metrics" | "scanStatusCounts" | "apiRoutes" | "scans">)
  | ({ tab: "events" } & Pick<AdminUserActivityData, "events" | "eventCount">)
);

export type AdminUserEvent = {
  event_id: string;
  occurred_at: string;
  event_name: string;
  normalized_route: string;
  feature: string;
  outcome: string;
  scan_id: string | null;
  hostname: string | null;
  element_id: string | null;
  browser_family: string;
  page_path: string | null;
  target_path: string | null;
  previous_route: string | null;
  entry_route: string | null;
  form_id: string | null;
  os_family: string;
  device_class: string;
  viewport_band: string | null;
  language: string | null;
  country_code: string | null;
  referring_domain: string | null;
  duration_ms: number | null;
  numeric_value: string | number | null;
  consent_state: string;
  is_authenticated: boolean;
  browser_confirmed_at: string | null;
};

type AdminUserActivityUserRow = {
  created_at: string;
  email: string;
  full_name: string | null;
  id: string;
  last_login_at: string | null;
  organization_name: string | null;
};

type AdminUserActivityMetricsRow = {
  associated_scans: number;
  completed_scans: number;
  domains: number;
  total_scans: number;
};

type AdminUserActivityRequestMetricsRow = {
  last_scan_requested_at: string | null;
  scan_request_count: number;
};

type AdminUserActivityScanRow = {
  association: "claimed" | "submitted";
  completed_at: string | null;
  created_at: string;
  domain_hostname: string | null;
  id: string;
  pages_scanned: number;
  full_site_pages_scanned: number | null;
  scan_type: string;
  status: string;
};

type AdminUserActivityStatusRow = {
  count: number;
  status: string;
};

type AdminUserActivityApiRouteRow = {
  api_route: AdminApiRoute;
  channels: string[] | null;
  count: number;
  last_requested_at: string | null;
};

export async function loadAdminUserActivity(userId: string, limit = 10, offset = 0, eventLimit = 20, eventOffset = 0, tab: AdminUserActivityTab = "scans"): Promise<AdminUserActivity | null> {
  await requirePlatformAdminContext();

  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    return null;
  }

  const normalizedLimit = Math.min(Math.max(limit, 1), 100);
  const normalizedOffset = Math.max(offset, 0);

  const user = await queryOne<AdminUserActivityUserRow>(
      `with selected_membership as (
         select organization_id
           from organization_members
          where user_id = $1
          order by created_at desc
          limit 1
       ),
       login_activity as (
         select max(better_auth_sessions.created_at) as last_login_at
           from better_auth_users
           left join better_auth_sessions on better_auth_sessions.user_id = better_auth_users.id
          where better_auth_users.email = (select email from users where id = $1)
       )
       select users.id,
              users.email,
              users.full_name,
              users.created_at,
              login_activity.last_login_at,
              organizations.name as organization_name
         from users
         left join selected_membership on true
         left join organizations on organizations.id = selected_membership.organization_id
         cross join login_activity
        where users.id = $1`,
      [normalizedUserId],
      { readOnly: true }
    );
  if (!user) return null;
  const mappedUser = {
    createdAt: user.created_at,
    email: user.email,
    fullName: user.full_name,
    id: user.id,
    lastLoginAt: user.last_login_at,
    organizationName: user.organization_name
  };

  if (tab === "events") {
    const normalizedEventLimit = Math.min(Math.max(eventLimit, 1), 100);
    const normalizedEventOffset = Math.max(eventOffset, 0);
    const loadEvents = (pageOffset: number) => query<AdminUserEvent>(
      `select e.event_id, e.occurred_at, e.event_name, e.normalized_route,
              e.feature, e.outcome, e.scan_id, e.element_id, e.browser_family, d.hostname,
              e.page_path, e.target_path, e.previous_route, e.entry_route, e.form_id,
              e.os_family, e.device_class, e.viewport_band, e.language, e.country_code,
              e.referring_domain, e.duration_ms, e.numeric_value, e.consent_state,
              e.is_authenticated, e.browser_confirmed_at
         from product_analytics_events e
         left join scans s on s.id = e.scan_id
         left join domains d on d.id = s.domain_id
        where e.user_id = $1 and e.occurred_at >= now() - interval '90 days'
        order by e.occurred_at desc, e.event_id desc
        limit $2 offset $3`,
      [normalizedUserId, normalizedEventLimit, pageOffset],
      { readOnly: true }
    ).then((result) => result.rows);
    const [eventCount, requestedEvents] = await Promise.all([
      queryOne<{ count: number }>(
      `select count(*)::int as count from product_analytics_events
        where user_id = $1 and occurred_at >= now() - interval '90 days'`,
      [normalizedUserId], { readOnly: true }
    ),
      loadEvents(normalizedEventOffset)
    ]);
    const count = Number(eventCount?.count ?? 0);
    const lastOffset = Math.max(0, Math.ceil(count / normalizedEventLimit) - 1) * normalizedEventLimit;
    const pageOffset = Math.min(normalizedEventOffset, lastOffset);
    const events = pageOffset === normalizedEventOffset ? requestedEvents : await loadEvents(pageOffset);
    return { user: mappedUser, tab: "events", events, eventCount: count, page: Math.floor(pageOffset / normalizedEventLimit) + 1 };
  }

  const loadScans = (scanOffset: number) => query<AdminUserActivityScanRow>(
      `select scans.id,
              scans.created_at,
              scans.completed_at,
              scans.status,
              scans.scan_type,
              scans.pages_scanned,
              ${ADMIN_FULL_SITE_PAGES_SCANNED_SQL} as full_site_pages_scanned,
              domains.hostname as domain_hostname,
              case when scans.claimed_by_user_id = $1 then 'claimed' else 'submitted' end as association
         from scans
         left join domains on domains.id = scans.domain_id
        where scans.submitted_by_user_id = $1 or scans.claimed_by_user_id = $1
        order by scans.created_at desc, scans.id desc
        limit $2 offset $3`,
      [normalizedUserId, normalizedLimit, scanOffset],
      { readOnly: true }
    ).then((result) => result.rows);
  const [metrics, statusCounts, requestMetrics, apiRoutes, requestedScans] = await Promise.all([
    queryOne<AdminUserActivityMetricsRow>(
      `select count(*) filter (where scans.submitted_by_user_id = $1)::int as total_scans,
              count(*) filter (where scans.completed_at is not null)::int as completed_scans,
              count(distinct scans.domain_id)::int as domains,
              count(*) filter (where scans.submitted_by_user_id = $1 or scans.claimed_by_user_id = $1)::int as associated_scans
         from scans
        where scans.submitted_by_user_id = $1 or scans.claimed_by_user_id = $1`,
      [normalizedUserId],
      { readOnly: true }
    ),
    query<AdminUserActivityStatusRow>(
      `select scans.status, count(*)::int as count
         from scans
        where scans.submitted_by_user_id = $1
        group by scans.status`,
      [normalizedUserId],
      { readOnly: true }
    ).then((result) => result.rows),
    queryOne<AdminUserActivityRequestMetricsRow>(
      `select max(activity.requested_at) as last_scan_requested_at,
              count(*)::int as scan_request_count
         from (
           select scan_requests.requested_at
             from scan_requests
            where scan_requests.requested_by ->> 'userId' = $1
           union all
           select pulse_requests.requested_at
             from pulse_requests
            where pulse_requests.requested_by ->> 'userId' = $1
         ) activity`,
      [normalizedUserId],
      { readOnly: true }
    ),
    query<AdminUserActivityApiRouteRow>(
      `select ${adminApiRouteSql({ requestChannel: "pulse_requests.request_channel", requestSource: "coalesce(pulse_requests.request_context ->> 'source', pulse_requests.request_context ->> 'channel')" })} as api_route,
              count(*)::int as count,
              max(pulse_requests.requested_at) as last_requested_at,
              array_agg(distinct nullif(pulse_requests.request_channel, '') order by nullif(pulse_requests.request_channel, '')) filter (where nullif(pulse_requests.request_channel, '') is not null) as channels
         from pulse_requests
        where pulse_requests.requested_by ->> 'userId' = $1
        group by api_route
        order by count(*) desc, api_route asc`,
      [normalizedUserId],
      { readOnly: true }
    ).then((result) => result.rows),
    loadScans(normalizedOffset)
  ]);
  const associatedScans = Number(metrics?.associated_scans ?? 0);
  const lastOffset = Math.max(0, Math.ceil(associatedScans / normalizedLimit) - 1) * normalizedLimit;
  const pageOffset = Math.min(normalizedOffset, lastOffset);
  const scans = pageOffset === normalizedOffset ? requestedScans : await loadScans(pageOffset);

  return {
    user: mappedUser,
    tab: "scans",
    page: Math.floor(pageOffset / normalizedLimit) + 1,
    metrics: {
      associatedScans: Number(metrics?.associated_scans ?? 0),
      completedScans: Number(metrics?.completed_scans ?? 0),
      domains: Number(metrics?.domains ?? 0),
      lastScanRequestedAt: requestMetrics?.last_scan_requested_at ?? null,
      scanRequestCount: Number(requestMetrics?.scan_request_count ?? 0),
      totalScans: Number(metrics?.total_scans ?? 0)
    },
    scanStatusCounts: ADMIN_SCAN_STATUSES.map((status) => ({
      status,
      count: Number(statusCounts.find((row) => row.status === status)?.count ?? 0)
    })),
    apiRoutes: ADMIN_API_ROUTES.map((route) => {
      const matchingRoute = apiRoutes.find((row) => row.api_route === route);
      return {
        channels: matchingRoute?.channels ?? [],
        count: Number(matchingRoute?.count ?? 0),
        lastRequestedAt: matchingRoute?.last_requested_at ?? null,
        route
      };
    }),
    scans: scans.map((scan) => ({
      association: scan.association,
      completedAt: scan.completed_at,
      createdAt: scan.created_at,
      domainHostname: scan.domain_hostname,
      id: scan.id,
      pagesScanned: Number(scan.full_site_pages_scanned ?? scan.pages_scanned ?? 0),
      scanType: scan.scan_type,
      status: scan.status
    }))
  };
}
