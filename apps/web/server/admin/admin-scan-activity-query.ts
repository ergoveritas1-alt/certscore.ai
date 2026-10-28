import { scanActivityTrafficClassificationCtes } from "../../lib/admin/scan-traffic-classification-sql";

export type AdminScanActivitySnapshotData = {
  rows: Array<{ activity_at: string; activity_id: string; request_public_id: string | null; row_kind: "request" | "scan"; scan_id: string | null; status: string; no_go_flag: boolean | null; access_posture_class: string | null }>;
  metrics: { items: number; runs: number; requests: number; completed: number; failed: number; limited: number; no_go: number; active: number; reused: number; newest_at: string | null; p50: number | null; p95: number | null };
  previous: { runs: number };
  regions: Array<{ value: string; count: number; runs: number; requests: number }>;
  trend: Array<{ n: number; bucket_start: string; bucket_end: string; items: number; runs: number; requests: number; failed: number; limited: number }>;
};

// One PostgreSQL statement supplies page IDs, totals, chart, comparisons and recency.
// $1–$26 are the existing activity filters; $27 is the exclusive cutoff and $28
// the inclusive current-period start. The base lower bound includes the prior period.
export function adminScanActivitySnapshotSql(base: string, boundedTraffic = false) {
  const candidates = `activity_candidates as materialized (
    select s.id as scan_id from public.scans s
      where ($7::timestamptz is null or coalesce(s.completed_at,s.started_at,s.created_at) >= $7::timestamptz)
        and coalesce(s.completed_at,s.started_at,s.created_at) < $27::timestamptz
        and ($6::text is null or coalesce(s.scan_config_json->>'scanFrom','default') = $6)
    union select coalesce(sr.fulfilled_by_scan_id,sr.scan_id) from public.scan_requests sr
      left join public.scans s on s.id = coalesce(sr.fulfilled_by_scan_id,sr.scan_id)
      where sr.resolution_mode = 'reused_existing_scan'
        and coalesce(sr.fulfilled_by_scan_id,sr.scan_id) is not null
        and ($7::timestamptz is null or sr.requested_at >= $7::timestamptz)
        and sr.requested_at < $27::timestamptz
        and ($6::text is null or coalesce(s.scan_config_json->>'scanFrom',sr.request_context->>'scanFrom','default') = $6)
  )`;
  const scopedBase = boundedTraffic ? base.replace(/^with /, `with ${candidates}, ${scanActivityTrafficClassificationCtes("select scan_id from activity_candidates")}, `) : base;
  return `${scopedBase},
  current_activity as materialized (
    select * from filtered_activity
    where activity_at < $27::timestamptz
      and ($28::timestamptz is null or activity_at >= $28::timestamptz)
  ), previous_activity as materialized (
    select scan_id from filtered_activity where activity_at < $28::timestamptz and row_kind = 'scan'
  ), summary as (
    select count(*)::int as items,
      count(*) filter (where a.row_kind = 'scan')::int as runs,
      count(*) filter (where a.row_kind = 'request')::int as requests,
      count(*) filter (where a.row_kind = 'scan' and a.status = 'completed' and a.no_go_flag is not true
        and coalesce(a.access_posture_class, '') not in ('degraded_but_useful', 'robots_limited'))::int as completed,
      count(*) filter (where a.status = 'failed')::int as failed,
      count(*) filter (where a.access_posture_class in ('degraded_but_useful', 'robots_limited'))::int as limited,
      count(*) filter (where a.no_go_flag)::int as no_go,
      count(*) filter (where a.status in ('queued', 'running', 'finalizing'))::int as active,
      count(*) filter (where a.freshness_filter = 'reused')::int as reused,
      max(a.activity_at) as newest_at,
      percentile_cont(0.5) within group (order by extract(epoch from s.completed_at - coalesce(s.started_at, s.created_at)))
        filter (where a.row_kind = 'scan' and s.completed_at >= coalesce(s.started_at, s.created_at)) as p50,
      percentile_cont(0.95) within group (order by extract(epoch from s.completed_at - coalesce(s.started_at, s.created_at)))
        filter (where a.row_kind = 'scan' and s.completed_at >= coalesce(s.started_at, s.created_at)) as p95
    from current_activity a left join public.scans s on a.row_kind = 'scan' and s.id = a.scan_id
  ), previous_summary as (
    select count(*)::int as runs from previous_activity
  ), window_bounds as (
    select coalesce($28::timestamptz, min(activity_at), $27::timestamptz - interval '24 hours') as start_at,
      $27::timestamptz as end_at from current_activity
  ), buckets as (
    select n, start_at + (end_at - start_at) * (n / 24.0) as bucket_start,
      start_at + (end_at - start_at) * ((n + 1) / 24.0) as bucket_end
    from window_bounds cross join generate_series(0, 23) n
  ), trend as (
    select b.n, b.bucket_start, b.bucket_end, count(a.activity_id)::int as items,
      count(*) filter (where a.row_kind = 'scan')::int as runs,
      count(*) filter (where a.row_kind = 'request')::int as requests,
      count(*) filter (where a.status = 'failed')::int as failed,
      count(*) filter (where a.access_posture_class in ('degraded_but_useful', 'robots_limited'))::int as limited
    from buckets b left join current_activity a on a.activity_at >= b.bucket_start and a.activity_at < b.bucket_end
    group by b.n, b.bucket_start, b.bucket_end
  ), regions as (
    select scan_from_filter as value, count(*)::int as count,
      count(*) filter (where row_kind = 'scan')::int as runs,
      count(*) filter (where row_kind = 'request')::int as requests
    from current_activity group by scan_from_filter
  ), page as (
    select activity_at, activity_id, request_public_id, row_kind, scan_id, status, no_go_flag, access_posture_class
    from current_activity order by activity_at desc, activity_id desc limit $8 offset $9
  )
  select row_to_json(summary) as metrics, row_to_json(previous_summary) as previous,
    (select coalesce(json_agg(page order by activity_at desc, activity_id desc), '[]'::json) from page) as rows,
    (select coalesce(json_agg(trend order by n), '[]'::json) from trend) as trend,
    (select coalesce(json_agg(regions order by value), '[]'::json) from regions) as regions
  from summary cross join previous_summary`;
}
