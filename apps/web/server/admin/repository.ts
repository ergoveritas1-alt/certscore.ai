"use server";

import { query, queryOne } from "@website-signal-risk-scanner/db";
import { SCAN_FROM_VALUES, SCAN_NO_GO_SNAPSHOT_OUTCOMES, formatScanFromLabel } from "@website-signal-risk-scanner/shared";
import type { AccessPostureClass, RecoverableFindingClass, ScanExecutionTier } from "@website-signal-risk-scanner/shared";
import { ensureMonitorSiteRequestsTable } from "../monitor-site/monitor-site-request";
import { ensureScanRequestLogTable } from "../scans/scan-request-log";
import { adminNoGoSql } from "./admin-no-go";
import { parseAdminActivitySearch } from "../../lib/admin/activity-search";

export type AdminScanQueryRow = {
  completed_at: string | null;
  created_at: string;
  domain_id: string | null;
  id: string;
  organization_id: string | null;
  pages_requested?: number;
  pages_scanned: number;
  page_language?: string | null;
  page_languages?: string[] | null;
  scan_config_json?: Record<string, unknown> | null;
  scan_type: string;
  started_at: string | null;
  status: string;
};

export type AdminScanRequestRow = {
  created_at: string;
  error_code: string | null;
  error_message: string | null;
  fulfilled_by_scan_id: string | null;
  organization_id: string | null;
  organization_name: string | null;
  normalized_domain: string | null;
  normalized_url: string | null;
  public_id: string;
  pulse_request_context: Record<string, unknown> | null;
  request_channel: string | null;
  requester_name: string | null;
  requester_email: string | null;
  request_context: Record<string, unknown> | null;
  requested_at: string;
  requested_by: Record<string, unknown> | null;
  requested_url: string | null;
  request_type: string;
  resolution_mode: string | null;
  reused_completed_at: string | null;
  reuse_window_hours: number | null;
  scan_domain_hostname: string | null;
  scan_created_at: string | null;
  scan_config_json: Record<string, unknown> | null;
  scan_id: string | null;
  scan_organization_id: string | null;
  scan_status: string | null;
  status: string;
};

export type AdminPulseScanAttributionRow = {
  normalized_url: string | null;
  public_id: string;
  request_channel: string | null;
  request_context: Record<string, unknown> | null;
  requested_at: string;
  requester_name: string | null;
  requester_email: string | null;
  resolution_mode: string | null;
  scan_id: string;
};

export type AdminScanDomainRow = {
  hostname: string;
  id?: string;
};

export type AdminScanOrganizationRow = {
  id?: string;
  name: string;
};

export type AdminScanSnapshotRow = {
  admin_industry_label?: string | null;
  admin_summary_generated_at?: string | null;
  access_posture_class?: AccessPostureClass | null;
  asn?: number | null;
  block_vendor_guess?: string | null;
  blocked_flag: boolean | null;
  captcha_flag: boolean | null;
  certscore_overall: number | null;
  cmp_vendor_name?: string | null;
  egress_id?: string | null;
  egress_type?: string | null;
  highest_successful_tier?: ScanExecutionTier | null;
  homepage_fetch_http_status: number | null;
  homepage_fetch_status?: string | null;
  legal_coverage_score?: number | null;
  normalized_body_hash?: string | null;
  report_finding_count?: number | null;
  privacy_policy_present?: boolean | null;
  recoverable_finding_classes?: RecoverableFindingClass[] | null;
  robots_fetch_http_status: number | null;
  scan_id?: string;
  scan_outcome?: string | null;
  scan_no_go_assessment?: Record<string, unknown> | null;
  scan_timestamp?: string | null;
  tranco_rank?: number | null;
  site_language_primary?: string | null;
  visual_access_review?: Record<string, unknown> | null;
  stop_tier?: ScanExecutionTier | null;
  total_signals?: number;
  top_finding_count?: number | null;
  verified_public_surfaces_count?: number | null;
};

export type AdminRuntimeArtifactRow = {
  scan_id: string;
  scan_no_go_assessment?: Record<string, unknown> | null;
  visual_access_review?: Record<string, unknown> | null;
  visual_evidence_artifacts?: unknown[] | null;
  [key: string]: unknown;
};

export type AdminScanActivityPageRef = {
  activity_at: string;
  activity_id: string;
  request_public_id: string | null;
  row_kind: "request" | "scan";
  scan_id: string | null;
};

export type AdminScanActivityFilters = {
  query?: string | null;
  status?: "any" | "no_go" | "failed" | "running" | "queued" | "limited" | "completed";
  freshness?: "any" | "fresh" | "forced_fresh" | "reused";
  access?: "any" | "clear" | "blocked" | "captcha" | "robots_limited" | "limited" | "unknown";
  outcome?: string | null;
  language?: string | null;
  industry?: string | null;
  scanFrom?: string | null;
  timeSpan?: "all" | "4h" | "12h" | "24h" | "7d" | "31d";
};

export type AdminScanFilterOptions = {
  languages: string[];
  industries: string[];
  outcomes: string[];
};

const SCAN_ACTIVITY_NO_GO_SQL = adminNoGoSql({
  accessPosture: "ss.access_posture_class",
  blockedFlag: "ss.blocked_flag",
  captchaFlag: "ss.captcha_flag",
  runtimeArtifacts: "sra",
  snapshotOutcome: "ss.scan_outcome",
  outcomesParameter: "$12"
});

function adminScanActivityBaseSql() {
  return `with scan_activity as (
    select
      'scan'::text as row_kind,
      ('scan:' || s.id::text) as activity_id,
      s.id as scan_id,
      null::text as request_public_id,
      coalesce(s.completed_at, s.started_at, s.created_at) as activity_at,
      s.status,
      case
        when coalesce(
          nullif(s.scan_config_json ->> 'source', ''),
          (
            select nullif(srq.request_channel, '')
            from public.scan_requests srq
            where coalesce(srq.fulfilled_by_scan_id, srq.scan_id) = s.id
            order by srq.requested_at desc
            limit 1
          )
        ) = 'api-full-scan'
        and exists (
          select 1
          from public.scan_requests srq
          where coalesce(srq.fulfilled_by_scan_id, srq.scan_id) = s.id
            and coalesce(srq.requested_by ->> 'anonymous', 'false') = 'true'
        ) then 'homepage-anonymous'
        else coalesce(
          nullif(s.scan_config_json ->> 'source', ''),
          (
            select nullif(srq.request_channel, '')
            from public.scan_requests srq
            where coalesce(srq.fulfilled_by_scan_id, srq.scan_id) = s.id
            order by srq.requested_at desc
            limit 1
          )
        )
      end as source_filter,
      ss.access_posture_class,
      ${SCAN_ACTIVITY_NO_GO_SQL} as no_go_flag,
      case
        when exists (
          select 1
            from public.scan_requests sr
           where coalesce(sr.fulfilled_by_scan_id, sr.scan_id) = s.id
             and coalesce(sr.request_context ->> 'bypassRecentScanReuse', sr.request_context ->> 'forceNewScan') = 'true'
        ) or exists (
          select 1
            from public.pulse_requests pr
           where pr.scan_id = s.id
             and coalesce(pr.request_context ->> 'forceNewScan', pr.request_context ->> 'bypassRecentScanReuse') = 'true'
        ) then 'forced_fresh'
        when exists (
          select 1
            from public.scan_requests sr
           where coalesce(sr.fulfilled_by_scan_id, sr.scan_id) = s.id
             and sr.resolution_mode = 'reused_existing_scan'
        ) or exists (
          select 1
            from public.pulse_requests pr
           where pr.scan_id = s.id
             and pr.resolution_mode = 'reused_existing_scan'
        ) then 'reused'
        else 'fresh'
      end as freshness_filter,
      nullif(trim(ss.site_language_primary), '') as language_filter,
      ind.label as industry_filter,
      coalesce(s.scan_config_json ->> 'scanFrom', 'default') as scan_from_filter,
      case
        when coalesce(ss.captcha_flag, false) then 'captcha'
        when coalesce(ss.blocked_flag, false) or ss.access_posture_class = 'early_loss' then 'blocked'
        when ss.access_posture_class = 'robots_limited' then 'robots_limited'
        when ss.access_posture_class = 'degraded_but_useful' then 'limited'
        when s.id is not null then 'clear'
        else 'unknown'
      end as access_filter
      ,ss.scan_outcome as outcome_filter
    from public.scans s
    left join public.domains d on d.id = s.domain_id
    left join public.industries ind on ind.id = d.industry_primary_id
    left join public.scan_snapshots ss on ss.scan_id = s.id
    left join public.scan_runtime_artifacts sra on sra.scan_id = s.id
    where (
      $1::text is null
      or s.id::text ilike '%' || $1 || '%'
      or coalesce(d.hostname, '') ilike '%' || $1 || '%'
      or coalesce(s.scan_type, '') ilike '%' || $1 || '%'
      or exists (
        select 1
        from public.scan_requests srq
        left join public.users au on au.id::text = srq.requested_by ->> 'userId'
        left join public.better_auth_users bau on bau.id = srq.requested_by ->> 'userId'
        where coalesce(srq.fulfilled_by_scan_id, srq.scan_id) = s.id
          and concat_ws(' ', srq.public_id, srq.requested_url, srq.normalized_domain,
                coalesce(au.email, bau.email, ''), srq.request_channel,
                srq.requested_by::text, srq.request_context::text) ilike '%' || $1 || '%'
      )
      or exists (
        select 1
        from public.pulse_requests prq
        left join public.integration_api_keys aik on aik.public_id = prq.requested_by ->> 'apiKeyId'
        left join public.users pau on pau.id::text = coalesce(prq.requested_by ->> 'userId', aik.owner_user_id::text)
        left join public.better_auth_users pbau on pbau.id = prq.requested_by ->> 'userId'
        where prq.scan_id = s.id
          and concat_ws(' ', prq.public_id, prq.job_id, prq.requested_url, prq.normalized_domain,
                coalesce(pau.email, pbau.email, aik.created_by, ''), prq.request_channel,
                prq.requested_by::text, prq.request_context::text) ilike '%' || $1 || '%'
      )
    )
    and ($13::text[] is null or not (
      exists (
        select 1 from public.scan_requests srq
        left join public.users au on au.id::text = srq.requested_by ->> 'userId'
        left join public.better_auth_users bau on bau.id = srq.requested_by ->> 'userId'
        where coalesce(srq.fulfilled_by_scan_id, srq.scan_id) = s.id
          and concat_ws(' ', coalesce(au.email, bau.email, ''), srq.requested_by::text) ilike any($13::text[])
      )
      or exists (
        select 1 from public.pulse_requests prq
        left join public.integration_api_keys aik on aik.public_id = prq.requested_by ->> 'apiKeyId'
        left join public.users pau on pau.id::text = coalesce(prq.requested_by ->> 'userId', aik.owner_user_id::text)
        left join public.better_auth_users pbau on pbau.id = prq.requested_by ->> 'userId'
        where prq.scan_id = s.id
          and concat_ws(' ', coalesce(pau.email, pbau.email, aik.created_by, ''), prq.requested_by::text) ilike any($13::text[])
      )
    ))
    and ($15::text[] is null or not (coalesce(d.hostname, '') ilike any($15::text[])))
    and ($16::text[] is null or not (s.id::text ilike any($16::text[])))
    and ($17::text[] is null or not (
      exists (
        select 1 from public.scan_requests srq
        left join public.users au on au.id::text = srq.requested_by ->> 'userId'
        left join public.better_auth_users bau on bau.id = srq.requested_by ->> 'userId'
        where coalesce(srq.fulfilled_by_scan_id, srq.scan_id) = s.id
          and coalesce(au.email, bau.email, '') ilike any($17::text[])
      ) or exists (
        select 1 from public.pulse_requests prq
        left join public.integration_api_keys aik on aik.public_id = prq.requested_by ->> 'apiKeyId'
        left join public.users pau on pau.id::text = coalesce(prq.requested_by ->> 'userId', aik.owner_user_id::text)
        left join public.better_auth_users pbau on pbau.id = prq.requested_by ->> 'userId'
        where prq.scan_id = s.id
          and coalesce(pau.email, pbau.email, aik.created_by, '') ilike any($17::text[])
      )
    ))
    and ($18::text[] is null or not (
      exists (
        select 1 from public.scan_requests srq
        where coalesce(srq.fulfilled_by_scan_id, srq.scan_id) = s.id
          and concat_ws(' ',
            srq.request_context ->> 'sourceIp', srq.request_context ->> 'originIp', srq.request_context ->> 'ipHash',
            srq.request_context -> 'provenance' ->> 'sourceIp', srq.request_context -> 'provenance' ->> 'originIp',
            srq.request_context -> 'provenance' ->> 'ipHash', srq.requested_by ->> 'sourceIp', srq.requested_by ->> 'ipHash'
          ) ilike any($18::text[])
      ) or exists (
        select 1 from public.pulse_requests prq
        where prq.scan_id = s.id
          and concat_ws(' ',
            prq.request_context ->> 'sourceIp', prq.request_context ->> 'originIp', prq.request_context ->> 'ipHash',
            prq.request_context -> 'provenance' ->> 'sourceIp', prq.request_context -> 'provenance' ->> 'originIp',
            prq.request_context -> 'provenance' ->> 'ipHash', prq.requested_by ->> 'sourceIp', prq.requested_by ->> 'ipHash'
          ) ilike any($18::text[])
      )
    ))

    union all

    select
      'request'::text as row_kind,
      ('request:' || sr.public_id) as activity_id,
      coalesce(sr.fulfilled_by_scan_id, sr.scan_id) as scan_id,
      sr.public_id as request_public_id,
      sr.requested_at as activity_at,
      sr.status,
      case
        when coalesce(nullif(sr.request_channel, ''), nullif(s.scan_config_json ->> 'source', '')) = 'api-full-scan'
          and coalesce(sr.requested_by ->> 'anonymous', 'false') = 'true'
          then 'homepage-anonymous'
        else coalesce(nullif(sr.request_channel, ''), nullif(s.scan_config_json ->> 'source', ''))
      end as source_filter,
      ss.access_posture_class,
      case when coalesce(sr.fulfilled_by_scan_id, sr.scan_id) is null then false else ${SCAN_ACTIVITY_NO_GO_SQL} end as no_go_flag,
      case
        when coalesce(sr.request_context ->> 'bypassRecentScanReuse', sr.request_context ->> 'forceNewScan') = 'true' then 'forced_fresh'
        when sr.resolution_mode = 'reused_existing_scan' then 'reused'
        else 'fresh'
      end as freshness_filter,
      nullif(trim(ss.site_language_primary), '') as language_filter,
      ind.label as industry_filter,
      coalesce(s.scan_config_json ->> 'scanFrom', sr.request_context ->> 'scanFrom', 'default') as scan_from_filter,
      case
        when coalesce(ss.captcha_flag, false) then 'captcha'
        when coalesce(ss.blocked_flag, false) or ss.access_posture_class = 'early_loss' then 'blocked'
        when ss.access_posture_class = 'robots_limited' then 'robots_limited'
        when ss.access_posture_class = 'degraded_but_useful' then 'limited'
        when s.id is not null then 'clear'
        else 'unknown'
      end as access_filter
      ,ss.scan_outcome as outcome_filter
    from public.scan_requests sr
    left join public.scans s on s.id = coalesce(sr.fulfilled_by_scan_id, sr.scan_id)
    left join public.domains d on d.id = s.domain_id
    left join public.industries ind on ind.id = d.industry_primary_id
    left join public.scan_snapshots ss on ss.scan_id = s.id
    left join public.scan_runtime_artifacts sra on sra.scan_id = s.id
    left join public.organizations org on org.id = sr.organization_id
    left join public.users au on au.id::text = sr.requested_by ->> 'userId'
    left join public.better_auth_users bau on bau.id = sr.requested_by ->> 'userId'
    where (coalesce(sr.fulfilled_by_scan_id, sr.scan_id) is null or sr.resolution_mode = 'reused_existing_scan')
      and (
        $1::text is null
        or concat_ws(' ', sr.public_id, sr.requested_url, sr.normalized_domain, d.hostname,
              coalesce(au.email, bau.email, ''), org.name, sr.request_channel,
              sr.requested_by::text, sr.request_context::text,
              coalesce(sr.fulfilled_by_scan_id, sr.scan_id)::text) ilike '%' || $1 || '%'
        or exists (
          select 1
          from public.pulse_requests prq
          left join public.integration_api_keys aik on aik.public_id = prq.requested_by ->> 'apiKeyId'
          left join public.users pau on pau.id::text = coalesce(prq.requested_by ->> 'userId', aik.owner_user_id::text)
          left join public.better_auth_users pbau on pbau.id = prq.requested_by ->> 'userId'
          where prq.scan_id = coalesce(sr.fulfilled_by_scan_id, sr.scan_id)
            and concat_ws(' ', prq.public_id, prq.job_id, prq.requested_url, prq.normalized_domain,
                  coalesce(pau.email, pbau.email, aik.created_by, ''), prq.request_channel,
                  prq.requested_by::text, prq.request_context::text) ilike '%' || $1 || '%'
        )
      )
      and ($13::text[] is null or not (
        concat_ws(' ', coalesce(au.email, bau.email, ''), sr.requested_by::text) ilike any($13::text[])
        or exists (
          select 1
          from public.pulse_requests prq
          left join public.integration_api_keys aik on aik.public_id = prq.requested_by ->> 'apiKeyId'
          left join public.users pau on pau.id::text = coalesce(prq.requested_by ->> 'userId', aik.owner_user_id::text)
          left join public.better_auth_users pbau on pbau.id = prq.requested_by ->> 'userId'
          where prq.scan_id = coalesce(sr.fulfilled_by_scan_id, sr.scan_id)
            and concat_ws(' ', coalesce(pau.email, pbau.email, aik.created_by, ''), prq.requested_by::text) ilike any($13::text[])
        )
      ))
      and ($15::text[] is null or not (concat_ws(' ', sr.normalized_domain, sr.requested_url, d.hostname) ilike any($15::text[])))
      and ($16::text[] is null or not (concat_ws(' ', coalesce(sr.fulfilled_by_scan_id, sr.scan_id)::text, sr.public_id) ilike any($16::text[])))
      and ($17::text[] is null or not (
        coalesce(au.email, bau.email, '') ilike any($17::text[])
        or exists (
          select 1 from public.pulse_requests prq
          left join public.integration_api_keys aik on aik.public_id = prq.requested_by ->> 'apiKeyId'
          left join public.users pau on pau.id::text = coalesce(prq.requested_by ->> 'userId', aik.owner_user_id::text)
          left join public.better_auth_users pbau on pbau.id = prq.requested_by ->> 'userId'
          where prq.scan_id = coalesce(sr.fulfilled_by_scan_id, sr.scan_id)
            and coalesce(pau.email, pbau.email, aik.created_by, '') ilike any($17::text[])
        )
      ))
      and ($18::text[] is null or not (
        concat_ws(' ',
          sr.request_context ->> 'sourceIp', sr.request_context ->> 'originIp', sr.request_context ->> 'ipHash',
          sr.request_context -> 'provenance' ->> 'sourceIp', sr.request_context -> 'provenance' ->> 'originIp',
          sr.request_context -> 'provenance' ->> 'ipHash', sr.requested_by ->> 'sourceIp', sr.requested_by ->> 'ipHash'
        ) ilike any($18::text[])
        or exists (
          select 1 from public.pulse_requests prq
          where prq.scan_id = coalesce(sr.fulfilled_by_scan_id, sr.scan_id)
            and concat_ws(' ',
              prq.request_context ->> 'sourceIp', prq.request_context ->> 'originIp', prq.request_context ->> 'ipHash',
              prq.request_context -> 'provenance' ->> 'sourceIp', prq.request_context -> 'provenance' ->> 'originIp',
              prq.request_context -> 'provenance' ->> 'ipHash', prq.requested_by ->> 'sourceIp', prq.requested_by ->> 'ipHash'
            ) ilike any($18::text[])
        )
      ))
  ), filtered_activity as (
    select *
    from scan_activity
    where (
         $2::text is null
         or $2 = 'any'
         or ($2 = 'no_go' and no_go_flag)
         or ($2 = 'failed' and status = 'failed')
         or ($2 = 'running' and status = 'running')
         or ($2 = 'queued' and status = 'queued')
         or ($2 = 'limited' and access_posture_class in ('degraded_but_useful', 'robots_limited'))
         or ($2 = 'completed' and row_kind = 'scan' and status = 'completed' and not no_go_flag
             and coalesce(access_posture_class, '') not in ('degraded_but_useful', 'robots_limited'))
       )
       and ($3::text is null or freshness_filter = $3)
       and ($4::text is null or language_filter = $4)
       and ($5::text is null or industry_filter = $5)
       and ($6::text is null or scan_from_filter = $6)
       and ($7::timestamptz is null or activity_at >= $7::timestamptz)
       and ($10::text is null or access_filter = $10)
       and ($11::text is null or outcome_filter = $11)
       and ($14::text is null or lower(source_filter) = lower($14))
       and ($19::text[] is null or not (coalesce(source_filter, '') ilike any($19::text[])))
  )`;
}

export async function loadAdminScanActivityPageRefs(
  limit: number,
  offset: number,
  filters: AdminScanActivityFilters = {}
): Promise<{ rows: AdminScanActivityPageRef[]; totalCount: number }> {
  await ensureScanRequestLogTable();
  const parsedSearch = parseAdminActivitySearch(filters.query, { source: true });
  const queryText = parsedSearch.query;
  const exclusionArray = (values: string[]) => values.length > 0 ? values : null;
  const source = parsedSearch.source;
  const status = filters.status && filters.status !== "any" ? filters.status : null;
  const freshness = filters.freshness && filters.freshness !== "any" ? filters.freshness : null;
  const language = filters.language?.trim().slice(0, 80) || null;
  const industry = filters.industry?.trim().slice(0, 200) || null;
  const scanFrom = filters.scanFrom?.trim().slice(0, 80) || null;
  const timeSpan = filters.timeSpan && filters.timeSpan !== "all" ? filters.timeSpan : null;
  const access = filters.access && filters.access !== "any" ? filters.access : null;
  const outcome = filters.outcome?.trim().slice(0, 120) || null;
  const timeSpanHours = timeSpan === "4h" ? 4 : timeSpan === "12h" ? 12 : timeSpan === "24h" ? 24 : timeSpan === "7d" ? 24 * 7 : timeSpan === "31d" ? 24 * 31 : null;
  const since = timeSpanHours === null ? null : new Date(Date.now() - timeSpanHours * 60 * 60 * 1000).toISOString();
  const params = [
    queryText, status, freshness, language, industry, scanFrom, since, limit, offset, access, outcome,
    SCAN_NO_GO_SNAPSHOT_OUTCOMES, exclusionArray(parsedSearch.exclusions.requester), source,
    exclusionArray(parsedSearch.exclusions.domain), exclusionArray(parsedSearch.exclusions.scanId),
    exclusionArray(parsedSearch.exclusions.email), exclusionArray(parsedSearch.exclusions.ip),
    exclusionArray(parsedSearch.exclusions.source)
  ];
  const baseSql = adminScanActivityBaseSql();
  const [pageResult, countResult] = await Promise.all([
    query<AdminScanActivityPageRef>(
      `${baseSql}
       select row_kind, activity_id, scan_id::text as scan_id, request_public_id, activity_at
       from filtered_activity
       order by activity_at desc, activity_id desc
       limit $8 offset $9`,
      params,
      { readOnly: true }
    ),
    queryOne<{ total_count: number }>(
      `${baseSql}
       select count(*)::int as total_count, max($8::int) as requested_limit, max($9::int) as requested_offset
       from filtered_activity`,
      params,
      { readOnly: true }
    )
  ]);
  return { rows: pageResult.rows, totalCount: countResult?.total_count ?? 0 };
}

export async function loadAdminScanFilterOptions(): Promise<AdminScanFilterOptions> {
  const [languagesResult, industriesResult, outcomesResult] = await Promise.all([
    query<{ value: string }>(
      `select distinct nullif(trim(site_language_primary), '') as value
         from public.scan_snapshots
        where nullif(trim(site_language_primary), '') is not null
        order by value asc
        limit 100`,
      [],
      { readOnly: true }
    ),
    query<{ value: string }>(
      `select label as value
         from public.industries
        order by sort_order asc, label asc`,
      [],
      { readOnly: true }
    ),
    query<{ value: string }>(
      `select distinct scan_outcome as value
         from public.scan_snapshots
        where nullif(trim(scan_outcome), '') is not null
        order by value asc`,
      [],
      { readOnly: true }
    )
  ]);

  return {
    languages: languagesResult.rows.flatMap((row) => row.value ? [row.value] : []),
    industries: industriesResult.rows.flatMap((row) => row.value ? [row.value] : []),
    outcomes: outcomesResult.rows.flatMap((row) => row.value ? [row.value] : [])
  };
}

export type AdminValidationRunSummaryRow = {
  created_at: string;
  finding_count: number;
  id: string;
  scan_id: string;
};

export type AdminScanDiagnosticEventRow = {
  created_at: string;
  event_type: string;
  message: string;
  metadata_json: Record<string, unknown> | null;
  scan_id: string;
};

export type AdminPolicyEnrichmentRow = Record<string, unknown> & {
  scan_id?: string;
};

export type AdminValidationFindingSummaryRow = {
  category: string | null;
  description: string | null;
  evidence_json: Record<string, unknown> | null;
  finding_family: string | null;
  finding_scope: string | null;
  finding_source: string | null;
  finding_subject: string | null;
  id: string;
  page_url: string | null;
  rule_key: string;
  severity: string | null;
  subtype: string | null;
  title: string;
  validation_run_id: string;
  validation_verdicts:
    | {
        agreement_score: number | null;
        confidence: number | null;
        created_at: string | null;
        evidence_json: Record<string, unknown> | null;
        model: string | null;
        prompt_version: string | null;
        rationale: string | null;
        system_confidence_band: "very_high" | "high" | "moderate" | "low" | "very_low" | null;
        system_confidence_explanation: string | null;
        system_confidence_score: number | null;
        verdict: "supported" | "inconclusive" | "not_supported" | null;
      }
    | Array<{
        agreement_score: number | null;
        confidence: number | null;
        created_at: string | null;
        evidence_json: Record<string, unknown> | null;
        model: string | null;
        prompt_version: string | null;
        rationale: string | null;
        system_confidence_band: "very_high" | "high" | "moderate" | "low" | "very_low" | null;
        system_confidence_explanation: string | null;
        system_confidence_score: number | null;
        verdict: "supported" | "inconclusive" | "not_supported" | null;
      }>
    | null;
};

export type AdminValidationVerdictRow = {
  agreement_score: number | null;
  confidence: number | null;
  created_at: string | null;
  evidence_json: Record<string, unknown> | null;
  model: string | null;
  prompt_version: string | null;
  rationale: string | null;
  system_confidence_band: "very_high" | "high" | "moderate" | "low" | "very_low" | null;
  system_confidence_explanation: string | null;
  system_confidence_score: number | null;
  validation_run_finding_id: string;
  verdict: "supported" | "inconclusive" | "not_supported" | null;
};

export type AdminUserRow = {
  auth_provider: string;
  created_at: string;
  email: string;
  full_name: string | null;
  id: string;
  last_login_at: string | null;
  updated_at: string;
};

export type AdminMembershipRow = {
  created_at: string;
  organization_id: string;
  role: string;
  user_id: string;
};

export type AdminOrganizationSummaryRow = {
  id: string;
  name: string;
  plan: string | null;
  plan_status: string | null;
  slug: string;
};

export type AdminDomainSummaryRow = {
  id: string;
  organization_id: string | null;
};

export type AdminOrganizationScanSummaryRow = {
  completed_at: string | null;
  created_at: string;
  id: string;
  organization_id: string | null;
};

export type AdminUserOverviewRow = AdminUserRow & {
  completed_scans: number;
  domain_count: number;
  last_completed_scan_at: string | null;
  last_scan_at: string | null;
  membership_role: string | null;
  organization_id: string | null;
  organization_name: string | null;
  organization_slug: string | null;
  plan: string | null;
  plan_status: string | null;
  total_scans: number;
};

export type AdminUserOverviewMetricsRow = {
  free_plan_users: number;
  individual_plan_users: number;
  pro_plan_users: number;
  team_plan_users: number;
  total_users: number;
  total_workspaces: number;
};

export type AdminPolicyReviewQueueRow = {
  assigned_to: string | null;
  created_at: string;
  id: string;
  policy_enrichment_id: string | null;
  reason: string | null;
  review_status: string | null;
  review_verdict: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  scan_id: string | null;
};

export type AdminMonitorSiteRequestStatus = "pending" | "contacted" | "converted" | "closed";

export type AdminMonitorSiteRequestRow = {
  company: string | null;
  created_at: string;
  full_name: string | null;
  id: string;
  metadata_json: Record<string, unknown> | null;
  monitoring_goal: string;
  normalized_hostname: string;
  notes: string | null;
  source_page_url: string | null;
  source_report_url: string | null;
  status: AdminMonitorSiteRequestStatus;
  updated_at: string;
  website: string;
  work_email: string;
};

export type AdminMonitorSiteRequestCounts = {
  closed: number;
  contacted: number;
  converted: number;
  pending: number;
  total: number;
};

export type AdminMonitorSiteRequestStageCounts = Record<AdminMonitorSiteRequestStageFilter, number>;

export type AdminMonitorSiteRequestSetupFilter = "activated" | "pending_setup" | "unprepared";

export type AdminMonitorSiteRequestStageFilter = "complete" | "confirmed_not_notified" | "linked_not_confirmed";

export type AdminMonitorSiteRequestListFilters = {
  plan?: string | null;
  query?: string | null;
  setup?: AdminMonitorSiteRequestSetupFilter | null;
  stage?: AdminMonitorSiteRequestStageFilter | null;
  status?: AdminMonitorSiteRequestStatus | null;
};

export type AdminOrganizationOptionRow = {
  id: string;
  name: string;
  plan: string | null;
  slug: string;
};

export type AdminScanOverviewCounts = {
  blockedOrCaptchaCount: number;
  http403Count: number;
  http429Count: number;
  scanFromCounts: Array<{ count: number; label: string; value: string }>;
  totalPhysicalScans: number;
  totalScanRequests: number;
  totalScans: number;
};

export type AdminBlockedRunTelemetryRow = {
  asn?: number | null;
  block_vendor_guess?: string | null;
  egress_id?: string | null;
  egress_type?: string | null;
  homepage_fetch_http_status: number | null;
  normalized_body_hash?: string | null;
  scan_id?: string;
  scan_outcome?: string | null;
  scan_timestamp?: string | null;
};

export async function loadAdminScanListPageData(limit: number, offset = 0, requesterEmail: string | null = null, selectedScanIds: string[] | null = null): Promise<{
  diagnosticEvents: AdminScanDiagnosticEventRow[];
  domains: AdminScanDomainRow[];
  organizations: AdminScanOrganizationRow[];
  policyEnrichmentRows: AdminPolicyEnrichmentRow[];
  resolvedSnapshots: AdminScanSnapshotRow[];
  runtimeArtifacts: AdminRuntimeArtifactRow[];
  scanRows: AdminScanQueryRow[];
  validationFindingRows: AdminValidationFindingSummaryRow[];
  validationRuns: AdminValidationRunSummaryRow[];
  verdictByFindingId: Map<string, AdminValidationVerdictRow>;
}> {
  const scansResult = await query<AdminScanQueryRow>(
    `select id, organization_id, domain_id, scan_type, status, created_at, started_at, completed_at, pages_scanned, scan_config_json,
            (select sp.page_language
               from scan_pages sp
              where sp.scan_id = scans.id
                and nullif(trim(sp.page_language), '') is not null
              order by case when sp.page_type = 'homepage' then 0 else 1 end, sp.page_url asc
              limit 1) as page_language,
            (select array_agg(sp.page_language order by case when sp.page_type = 'homepage' then 0 else 1 end, sp.page_url asc)
               from scan_pages sp
              where sp.scan_id = scans.id
                and nullif(trim(sp.page_language), '') is not null) as page_languages
       from scans
      where ($4::uuid[] is null or scans.id = any($4::uuid[]))
        and ($3::text is null or exists (
              select 1
                from public.scan_requests sr
                left join public.users request_app_user on request_app_user.id::text = sr.requested_by ->> 'userId'
                left join public.better_auth_users request_auth_user on request_auth_user.id = sr.requested_by ->> 'userId'
               where coalesce(sr.fulfilled_by_scan_id, sr.scan_id) = scans.id
                 and lower(coalesce(request_app_user.email, request_auth_user.email, '')) like '%' || lower($3) || '%'
            ) or exists (
              select 1
                from public.pulse_requests pr
                left join public.integration_api_keys request_api_key on request_api_key.public_id = pr.requested_by ->> 'apiKeyId'
                left join public.users request_pulse_app_user on request_pulse_app_user.id::text = coalesce(pr.requested_by ->> 'userId', request_api_key.owner_user_id::text)
                left join public.better_auth_users request_pulse_auth_user on request_pulse_auth_user.id = pr.requested_by ->> 'userId'
               where pr.scan_id = scans.id
                 and lower(coalesce(request_pulse_app_user.email, request_pulse_auth_user.email, request_api_key.created_by, '')) like '%' || lower($3) || '%'
            ))
      order by coalesce(completed_at, started_at, created_at) desc, created_at desc
      limit $1 offset $2`,
    [limit, offset, requesterEmail, selectedScanIds],
    { readOnly: true }
  );

  const scanRows = scansResult.rows;
  const domainIds = [...new Set(scanRows.flatMap((scan) => (scan.domain_id ? [scan.domain_id] : [])))];
  const organizationIds = [...new Set(scanRows.flatMap((scan) => (scan.organization_id ? [scan.organization_id] : [])))];
  const scanIds = scanRows.map((scan) => scan.id);

  const loadTopFindingCounts = async () => {
    if (scanIds.length === 0) {
      return new Map<string, number>();
    }
    const reportsTable = await queryOne<{ table_name: string | null }>(
      `select to_regclass('public.reports')::text as table_name`,
      [],
      { readOnly: true }
    );
    if (!reportsTable?.table_name) {
      return new Map<string, number>();
    }
    const result = await query<{ scan_id: string; top_finding_count: number | null }>(
      `select scan_id,
              case
                when jsonb_typeof(coalesce(
                  summary_json -> 'topFindings',
                  summary_json -> 'top_findings',
                  report_payload_json -> 'topFindings',
                  report_payload_json -> 'top_findings'
                )) = 'array'
                then jsonb_array_length(coalesce(
                  summary_json -> 'topFindings',
                  summary_json -> 'top_findings',
                  report_payload_json -> 'topFindings',
                  report_payload_json -> 'top_findings'
                ))
                else null
              end as top_finding_count
         from reports
        where scan_id = any($1::uuid[])`,
      [scanIds],
      { readOnly: true }
    );
    return new Map(result.rows.flatMap((row) => row.top_finding_count === null ? [] : [[row.scan_id, row.top_finding_count] as const]));
  };

  const [domainsResult, organizationsResult, snapshotsResult, diagnosticEventsResult, runtimeArtifactsResult, topFindingCounts] = await Promise.all([
    domainIds.length
      ? query<AdminScanDomainRow>(
          `select id, hostname
             from domains
            where id = any($1::uuid[])`,
          [domainIds],
          { readOnly: true }
        )
      : Promise.resolve({ rows: [] as AdminScanDomainRow[] }),
    organizationIds.length
      ? query<AdminScanOrganizationRow>(
          `select id, name
             from organizations
            where id = any($1::uuid[])`,
          [organizationIds],
          { readOnly: true }
        )
      : Promise.resolve({ rows: [] as AdminScanOrganizationRow[] }),
    scanIds.length
      ? query<AdminScanSnapshotRow>(
          `select scan_id,
                  certscore_overall,
                  admin_industry_label,
                  admin_summary_generated_at,
                  total_signals,
                  top_finding_count,
                  report_finding_count,
                  privacy_policy_present,
                  cmp_vendor_name,
                  homepage_fetch_http_status,
                  robots_fetch_http_status,
                  blocked_flag,
                  captcha_flag,
                  access_posture_class,
                  highest_successful_tier,
                  stop_tier,
                  recoverable_finding_classes,
                  legal_coverage_score,
                  verified_public_surfaces_count,
                  site_language_primary,
                  scan_outcome,
                  tranco_rank,
                  scan_no_go_assessment,
                  visual_access_review,
                  visual_evidence_artifacts
             from scan_snapshots
            where scan_id = any($1::uuid[])`,
          [scanIds],
          { readOnly: true }
        )
      : Promise.resolve({ rows: [] as AdminScanSnapshotRow[] }),
    scanIds.length
      ? query<AdminScanDiagnosticEventRow>(
          `select scan_id, event_type, message, metadata_json, created_at
             from scan_events
            where scan_id = any($1::uuid[])
              and event_type in ('scan.request', 'scan.request.received', 'request_context', 'scanner.request')
            order by created_at asc`,
          [scanIds],
          { readOnly: true }
        )
      : Promise.resolve({ rows: [] as AdminScanDiagnosticEventRow[] }),
    scanIds.length
      ? query<AdminRuntimeArtifactRow>(
          `select sra.scan_id,
                  coalesce(sra.scan_no_go_assessment, ss.scan_no_go_assessment) as scan_no_go_assessment,
                  coalesce(sra.visual_access_review, ss.visual_access_review) as visual_access_review,
                  coalesce(sra.visual_evidence_artifacts, ss.visual_evidence_artifacts) as visual_evidence_artifacts
             from scan_snapshots ss
             left join scan_runtime_artifacts sra on sra.scan_id = ss.scan_id
            where ss.scan_id = any($1::uuid[])`,
          [scanIds],
          { readOnly: true }
        )
      : Promise.resolve({ rows: [] as AdminRuntimeArtifactRow[] }),
    loadTopFindingCounts()
  ]);

  return {
    diagnosticEvents: diagnosticEventsResult.rows,
    domains: domainsResult.rows,
    organizations: organizationsResult.rows,
    policyEnrichmentRows: [],
    resolvedSnapshots: snapshotsResult.rows.map((snapshot) => ({
      ...snapshot,
      top_finding_count: snapshot.top_finding_count ?? (snapshot.scan_id ? topFindingCounts.get(snapshot.scan_id) ?? null : null)
    })),
    runtimeArtifacts: runtimeArtifactsResult.rows,
    scanRows,
    validationFindingRows: [],
    validationRuns: [],
    verdictByFindingId: new Map()
  };
}

export async function loadAdminScanRequestRows(
  limit: number,
  requesterEmail: string | null = null,
  selection?: { publicIds?: string[]; scanIds?: string[] }
): Promise<AdminScanRequestRow[]> {
  await ensureScanRequestLogTable();
  const result = await query<AdminScanRequestRow>(
    `select sr.public_id,
            sr.request_type,
            sr.request_channel,
            coalesce(app_user.email, auth_user.email) as requester_name,
            coalesce(app_user.email, auth_user.email) as requester_email,
            sr.requested_url,
            sr.normalized_url,
            sr.normalized_domain,
            sr.organization_id,
            org.name as organization_name,
            sr.requested_by,
            sr.request_context,
            pulse_attribution.request_context as pulse_request_context,
            sr.status,
            sr.resolution_mode,
            sr.scan_id,
            sr.fulfilled_by_scan_id,
            sr.reuse_window_hours,
            sr.reused_completed_at,
            sr.error_code,
            sr.error_message,
            sr.requested_at,
            sr.created_at,
            scan.status as scan_status,
            scan.created_at as scan_created_at,
            scan.scan_config_json as scan_config_json,
            scan.organization_id as scan_organization_id,
            domain.hostname as scan_domain_hostname
       from public.scan_requests sr
       left join public.scans scan on scan.id = coalesce(sr.fulfilled_by_scan_id, sr.scan_id)
       left join public.domains domain on domain.id = scan.domain_id
       left join public.organizations org on org.id = sr.organization_id
       left join public.users app_user on app_user.id::text = sr.requested_by ->> 'userId'
       left join public.better_auth_users auth_user on auth_user.id = sr.requested_by ->> 'userId'
       left join lateral (
         select pr.request_context
           from public.pulse_requests pr
          where pr.scan_id = coalesce(sr.fulfilled_by_scan_id, sr.scan_id)
            and pr.normalized_domain = sr.normalized_domain
            and abs(extract(epoch from (pr.requested_at - sr.requested_at))) <= 30
          order by abs(extract(epoch from (pr.requested_at - sr.requested_at))) asc
          limit 1
       ) pulse_attribution on true
      where ($2::text is null or lower(coalesce(app_user.email, auth_user.email, '')) like '%' || lower($2) || '%')
        and (
          ($3::uuid[] is null and $4::text[] is null)
          or coalesce(sr.fulfilled_by_scan_id, sr.scan_id) = any(coalesce($3::uuid[], '{}'::uuid[]))
          or sr.public_id = any(coalesce($4::text[], '{}'::text[]))
        )
      order by sr.requested_at desc
      limit $1`,
    [limit, requesterEmail, selection?.scanIds?.length ? selection.scanIds : null, selection?.publicIds?.length ? selection.publicIds : null],
    { readOnly: true }
  );

  return result.rows;
}

export async function loadAdminPulseScanAttributionRows(scanIds: string[], requesterEmail: string | null = null): Promise<AdminPulseScanAttributionRow[]> {
  if (scanIds.length === 0) {
    return [];
  }

  const result = await query<AdminPulseScanAttributionRow>(
    `select distinct on (pr.scan_id)
            pr.scan_id,
            pr.public_id,
            pr.request_channel,
            pr.request_context,
            pr.requested_at,
            pr.normalized_url,
            pr.resolution_mode,
            coalesce(app_user.email, auth_user.email, api_key.created_by) as requester_name
            ,coalesce(app_user.email, auth_user.email, api_key.created_by) as requester_email
       from public.pulse_requests pr
       left join public.integration_api_keys api_key
         on api_key.public_id = pr.requested_by ->> 'apiKeyId'
       left join public.users app_user
         on app_user.id::text = coalesce(pr.requested_by ->> 'userId', api_key.owner_user_id::text)
       left join public.better_auth_users auth_user
         on auth_user.id = pr.requested_by ->> 'userId'
      where pr.scan_id = any($1::uuid[])
        and ($2::text is null or lower(coalesce(app_user.email, auth_user.email, api_key.created_by, '')) like '%' || lower($2) || '%')
      order by pr.scan_id,
               case when pr.resolution_mode in ('created_new_scan', 'queued_new_scan') then 0 else 1 end,
               pr.requested_at asc`,
    [scanIds, requesterEmail],
    { readOnly: true }
  );

  return result.rows;
}

export async function persistAdminScanSummary(input: {
  cmpVendorName: string | null;
  industry: string | null;
  primaryLanguage: string | null;
  privacyPolicyPresent: boolean | null;
  scanOutcome?: string | null;
  scanId: string;
  topFindingCount: number;
  trancoRank?: number | null;
  scanNoGoAssessment?: Record<string, unknown> | null;
  visualAccessReview?: Record<string, unknown> | null;
  visualEvidenceArtifacts?: unknown[] | null;
}) {
  await query(
    `insert into scan_snapshots (
       scan_id, organization_id, domain_id, pages_requested, pages_scanned,
       admin_summary_generated_at, admin_industry_label, top_finding_count,
       site_language_primary, scan_outcome,
       privacy_policy_present, cmp_vendor_name, tranco_rank,
       scan_no_go_assessment, visual_access_review, visual_evidence_artifacts
     )
     select scans.id,
            scans.organization_id,
            scans.domain_id,
            greatest(coalesce(scans.pages_requested, scans.pages_scanned, 1), 1),
            coalesce(scans.pages_scanned, 0),
            timezone('utc', now()),
            $5,
            $2,
            $6, $7,
            coalesce($3, false),
            $4,
            $8,
            $9::jsonb,
            $10::jsonb,
            $11::jsonb
      from scans
      where scans.id = $1
        and scans.domain_id is not null
     on conflict (scan_id) do update
       set admin_summary_generated_at = excluded.admin_summary_generated_at,
           admin_industry_label = excluded.admin_industry_label,
           top_finding_count = excluded.top_finding_count,
           site_language_primary = excluded.site_language_primary,
           scan_outcome = coalesce(excluded.scan_outcome, scan_snapshots.scan_outcome),
           privacy_policy_present = excluded.privacy_policy_present,
           cmp_vendor_name = excluded.cmp_vendor_name,
           tranco_rank = coalesce(excluded.tranco_rank, scan_snapshots.tranco_rank),
           scan_no_go_assessment = coalesce(excluded.scan_no_go_assessment, scan_snapshots.scan_no_go_assessment),
           visual_access_review = coalesce(excluded.visual_access_review, scan_snapshots.visual_access_review),
           visual_evidence_artifacts = coalesce(excluded.visual_evidence_artifacts, scan_snapshots.visual_evidence_artifacts)`,
    [
      input.scanId,
      input.topFindingCount,
      input.privacyPolicyPresent,
      input.cmpVendorName,
      input.industry,
      input.primaryLanguage,
      input.scanOutcome ?? null,
      input.trancoRank ?? null,
      input.scanNoGoAssessment ? JSON.stringify(input.scanNoGoAssessment) : null,
      input.visualAccessReview ? JSON.stringify(input.visualAccessReview) : null,
      input.visualEvidenceArtifacts ? JSON.stringify(input.visualEvidenceArtifacts) : null
    ]
  );

  if (input.scanNoGoAssessment || input.visualAccessReview || input.visualEvidenceArtifacts) {
    await query(
      `update public.scan_runtime_artifacts
          set scan_no_go_assessment = coalesce($2::jsonb, scan_no_go_assessment),
              visual_access_review = coalesce($3::jsonb, visual_access_review),
              visual_evidence_artifacts = coalesce($4::jsonb, visual_evidence_artifacts),
              updated_at = timezone('utc', now())
        where scan_id = $1`,
      [
        input.scanId,
        input.scanNoGoAssessment ? JSON.stringify(input.scanNoGoAssessment) : null,
        input.visualAccessReview ? JSON.stringify(input.visualAccessReview) : null,
        input.visualEvidenceArtifacts ? JSON.stringify(input.visualEvidenceArtifacts) : null
      ]
    );
  }
}

export async function loadAdminScanDetailData(scanId: string): Promise<{
  accessibilityRuleCounts: Array<Record<string, unknown>>;
  changes: Array<Record<string, unknown>>;
  domain: AdminScanDomainRow | null;
  organization: AdminScanOrganizationRow | null;
  localV2DagLambdaEvents: Array<Record<string, unknown>>;
  pages: Array<Record<string, unknown>>;
  policyEnrichment: Array<Record<string, unknown>>;
  policyReviewQueue: Array<Record<string, unknown>>;
  runtimeArtifacts: Record<string, unknown> | null;
  runtimeContextEvents: Array<Record<string, unknown>>;
  scan: AdminScanQueryRow | null;
  snapshot: Record<string, unknown> | null;
  trackerVendors: Array<Record<string, unknown>>;
}> {
  const scan = await queryOne<AdminScanQueryRow>(
    `select id, organization_id, domain_id, scan_type, status, created_at, completed_at, pages_requested, pages_scanned, scan_config_json
       from scans
      where id = $1`,
    [scanId],
    { readOnly: true }
  );

  if (!scan) {
    return {
      accessibilityRuleCounts: [],
      changes: [],
      domain: null,
      localV2DagLambdaEvents: [],
      organization: null,
      pages: [],
      policyEnrichment: [],
      policyReviewQueue: [],
      runtimeArtifacts: null,
      runtimeContextEvents: [],
      scan: null,
      snapshot: null,
      trackerVendors: []
    };
  }

  const [
    snapshot,
    trackerVendors,
    accessibilityRuleCounts,
    pages,
    changes,
    domain,
    organization,
    runtimeArtifacts,
    runtimeContextEvents,
    localV2DagLambdaEvents,
    policyEnrichment,
    policyReviewQueue
  ] = await Promise.all([
    queryOne<Record<string, unknown>>(`select * from scan_snapshots where scan_id = $1`, [scanId], { readOnly: true }),
    query<Record<string, unknown>>(
      `select vendor_name, vendor_category, detection_source, confidence, first_party_or_third_party, before_consent, script_host, matched_signature_id
         from scan_tracker_vendors
        where scan_id = $1
        order by vendor_name asc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select rule_code, rule_group, severity, instance_count
         from scan_accessibility_rule_counts
        where scan_id = $1
        order by instance_count desc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select page_type, page_url, fetch_status, fetched_via, normalized_content_hash, title_hash, page_language
         from scan_pages
        where scan_id = $1
        order by page_type asc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select event_type, field_name, old_value_text, new_value_text, severity, event_group, event_timestamp
         from compliance_change_events
        where scan_id_current = $1
        order by event_timestamp desc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    scan.domain_id
      ? queryOne<AdminScanDomainRow>(`select hostname from domains where id = $1`, [scan.domain_id], { readOnly: true })
      : Promise.resolve(null),
    scan.organization_id
      ? queryOne<AdminScanOrganizationRow>(`select name from organizations where id = $1`, [scan.organization_id], { readOnly: true })
      : Promise.resolve(null),
    queryOne<Record<string, unknown>>(
      `select sra.*,
              coalesce(sra.scan_no_go_assessment, ss.scan_no_go_assessment) as scan_no_go_assessment,
              coalesce(sra.visual_access_review, ss.visual_access_review) as visual_access_review,
              coalesce(sra.visual_evidence_artifacts, ss.visual_evidence_artifacts) as visual_evidence_artifacts
         from scan_snapshots ss
         left join scan_runtime_artifacts sra on sra.scan_id = ss.scan_id
        where ss.scan_id = $1`,
      [scanId],
      { readOnly: true }
    ),
    query<Record<string, unknown>>(
      `select event_type, message, metadata_json, created_at
         from scan_events
        where scan_id = $1
          and event_type = 'scanner.runtime_context'
        order by created_at desc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select event_type, message, metadata_json, created_at
         from scan_events
        where scan_id = $1
          and event_type in (
            'v2_lambda_dispatch.requested',
            'v2_lambda_dispatch.started',
            'v2_lambda_dispatch.accepted',
            'v2_lambda_dispatch.failed',
            'v2_lambda_result.received',
            'v2_lambda_result.failed'
          )
        order by created_at asc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select *
         from policy_enrichment
        where scan_id = $1
        order by created_at asc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select *
         from policy_review_queue
        where scan_id = $1
        order by created_at asc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows)
  ]);

  return {
    accessibilityRuleCounts,
    changes,
    domain,
    localV2DagLambdaEvents,
    organization,
    pages,
    policyEnrichment,
    policyReviewQueue,
    runtimeArtifacts,
    runtimeContextEvents,
    scan,
    snapshot,
    trackerVendors
  };
}

export async function loadAdminUsersData(): Promise<{
  domains: AdminDomainSummaryRow[];
  memberships: AdminMembershipRow[];
  organizations: AdminOrganizationSummaryRow[];
  scans: AdminOrganizationScanSummaryRow[];
  users: AdminUserRow[];
}> {
  const [users, memberships, organizations, domains, scans] = await Promise.all([
    query<AdminUserRow>(
      `select users.id,
              users.email,
              users.full_name,
              users.auth_provider,
              users.created_at,
              users.updated_at,
              login_activity.last_login_at
         from users
         left join lateral (
           select max(better_auth_sessions.created_at) as last_login_at
             from better_auth_users
             join better_auth_sessions on better_auth_sessions.user_id = better_auth_users.id
            where better_auth_users.email = users.email
         ) login_activity on true
        order by users.created_at desc`,
      [],
      { readOnly: true }
    ).then((result) => result.rows),
    query<AdminMembershipRow>(`select user_id, organization_id, role, created_at from organization_members`, [], { readOnly: true }).then(
      (result) => result.rows
    ),
    query<AdminOrganizationSummaryRow>(`select id, name, slug, plan, plan_status from organizations`, [], { readOnly: true }).then(
      (result) => result.rows
    ),
    query<AdminDomainSummaryRow>(`select id, organization_id from domains`, [], { readOnly: true }).then((result) => result.rows),
    query<AdminOrganizationScanSummaryRow>(`select id, organization_id, created_at, completed_at from scans`, [], { readOnly: true }).then(
      (result) => result.rows
    )
  ]);

  return {
    domains,
    memberships,
    organizations,
    scans,
    users
  };
}

export async function loadAdminUserOverviewData(limit = 8): Promise<{
  metrics: AdminUserOverviewMetricsRow | null;
  users: AdminUserOverviewRow[];
}> {
  const normalizedLimit = Math.min(Math.max(limit, 1), 25);
  const [metrics, users] = await Promise.all([
    queryOne<AdminUserOverviewMetricsRow>(
      `with selected_memberships as (
         select distinct on (user_id) user_id, organization_id
           from organization_members
          order by user_id, created_at desc
       )
       select
         (select count(*)::int from users) as total_users,
         (select count(distinct organization_id)::int from organization_members) as total_workspaces,
         count(*) filter (where organizations.plan = 'free')::int as free_plan_users,
         count(*) filter (where organizations.plan = 'individual')::int as individual_plan_users,
         count(*) filter (where organizations.plan = 'pro')::int as pro_plan_users,
         count(*) filter (where organizations.plan = 'team')::int as team_plan_users
        from users
        left join selected_memberships on selected_memberships.user_id = users.id
        left join organizations on organizations.id = selected_memberships.organization_id`,
      [],
      { readOnly: true }
    ),
    query<AdminUserOverviewRow>(
      `select users.id,
              users.email,
              users.full_name,
              users.auth_provider,
              users.created_at,
              users.updated_at,
              login_activity.last_login_at,
              membership.organization_id,
              membership.role as membership_role,
              organizations.name as organization_name,
              organizations.slug as organization_slug,
              organizations.plan,
              organizations.plan_status,
              coalesce(domain_counts.domain_count, 0)::int as domain_count,
              coalesce(scan_counts.total_scans, 0)::int as total_scans,
              coalesce(scan_counts.completed_scans, 0)::int as completed_scans,
              scan_counts.last_scan_at,
              scan_counts.last_completed_scan_at
         from users
         left join lateral (
           select max(better_auth_sessions.created_at) as last_login_at
             from better_auth_users
             join better_auth_sessions on better_auth_sessions.user_id = better_auth_users.id
            where better_auth_users.email = users.email
         ) login_activity on true
         left join lateral (
           select organization_id, role
             from organization_members
            where organization_members.user_id = users.id
            order by created_at desc
            limit 1
         ) membership on true
         left join organizations on organizations.id = membership.organization_id
         left join lateral (
           select count(*)::int as domain_count
             from domains
            where domains.organization_id = membership.organization_id
         ) domain_counts on membership.organization_id is not null
         left join lateral (
           select count(*)::int as total_scans,
                  count(*) filter (where completed_at is not null)::int as completed_scans,
                  max(created_at) as last_scan_at,
                  max(completed_at) as last_completed_scan_at
             from scans
            where scans.organization_id = membership.organization_id
         ) scan_counts on membership.organization_id is not null
        order by users.created_at desc
        limit $1`,
      [normalizedLimit],
      { readOnly: true }
    ).then((result) => result.rows)
  ]);

  return {
    metrics,
    users
  };
}

export async function loadPolicyReviewQueueRows(reviewStatus?: string | null): Promise<AdminPolicyReviewQueueRow[]> {
  const result = reviewStatus
    ? await query<AdminPolicyReviewQueueRow>(
        `select *
           from policy_review_queue
          where review_status = $1
          order by created_at desc`,
        [reviewStatus],
        { readOnly: true }
      )
    : await query<AdminPolicyReviewQueueRow>(
        `select *
           from policy_review_queue
          order by created_at desc`,
        [],
        { readOnly: true }
      );

  return result.rows;
}

export async function loadAdminMonitorSiteRequestRows(
  filters: AdminMonitorSiteRequestListFilters = {},
  limit = 100
): Promise<AdminMonitorSiteRequestRow[]> {
  await ensureMonitorSiteRequestsTable();

  const normalizedLimit = Math.min(Math.max(limit, 1), 250);
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (filters.status) {
    values.push(filters.status);
    clauses.push(`status = $${values.length}`);
  }

  if (filters.setup === "unprepared") {
    clauses.push(`metadata_json->'monitorSetup' is null`);
  } else if (filters.setup) {
    values.push(filters.setup);
    clauses.push(`metadata_json->'monitorSetup'->>'setupStatus' = $${values.length}`);
  }

  if (filters.stage === "linked_not_confirmed") {
    clauses.push(`metadata_json->'monitorSetup' is not null`);
    clauses.push(`metadata_json->'monitorSetup'->>'setupStatus' = 'pending_setup'`);
  } else if (filters.stage === "confirmed_not_notified") {
    clauses.push(`metadata_json->'monitorSetup'->>'setupStatus' = 'activated'`);
    clauses.push(`metadata_json->'monitorSetup'->>'confirmationEmailSentAt' is null`);
  } else if (filters.stage === "complete") {
    clauses.push(`metadata_json->'monitorSetup'->>'setupStatus' = 'activated'`);
    clauses.push(`metadata_json->'monitorSetup'->>'confirmationEmailSentAt' is not null`);
  }

  if (filters.plan) {
    values.push(filters.plan);
    clauses.push(`metadata_json->>'sourcePlan' = $${values.length}`);
  }

  const normalizedQuery = filters.query?.trim();
  if (normalizedQuery) {
    values.push(`%${normalizedQuery.toLowerCase()}%`);
    clauses.push(`(
      lower(website) like $${values.length}
      or lower(normalized_hostname) like $${values.length}
      or lower(work_email) like $${values.length}
      or lower(coalesce(full_name, '')) like $${values.length}
      or lower(coalesce(company, '')) like $${values.length}
    )`);
  }

  values.push(normalizedLimit);
  const whereClause = clauses.length ? `where ${clauses.join(" and ")}` : "";
  const result = await query<AdminMonitorSiteRequestRow>(
    `select id,
            website,
            normalized_hostname,
            work_email,
            full_name,
            company,
            monitoring_goal,
            notes,
            source_page_url,
            source_report_url,
            metadata_json,
            status,
            created_at,
            updated_at
       from monitor_site_requests
      ${whereClause}
      order by created_at desc
      limit $${values.length}`,
    values,
    { readOnly: true }
  );

  return result.rows;
}

export async function loadAdminMonitorSiteRequestById(id: string): Promise<AdminMonitorSiteRequestRow | null> {
  await ensureMonitorSiteRequestsTable();

  return await queryOne<AdminMonitorSiteRequestRow>(
    `select id,
            website,
            normalized_hostname,
            work_email,
            full_name,
            company,
            monitoring_goal,
            notes,
            source_page_url,
            source_report_url,
            metadata_json,
            status,
            created_at,
            updated_at
       from monitor_site_requests
      where id = $1`,
    [id],
    { readOnly: true }
  );
}

export async function loadAdminMonitorSiteRequestCounts(): Promise<AdminMonitorSiteRequestCounts> {
  await ensureMonitorSiteRequestsTable();

  const result = await query<{ count: string; status: AdminMonitorSiteRequestStatus }>(
    `select status, count(*)::text as count
       from monitor_site_requests
      group by status`,
    [],
    { readOnly: true }
  );

  const counts: AdminMonitorSiteRequestCounts = {
    closed: 0,
    contacted: 0,
    converted: 0,
    pending: 0,
    total: 0
  };

  for (const row of result.rows) {
    const count = Number(row.count);
    counts[row.status] = count;
    counts.total += count;
  }

  return counts;
}

export async function loadAdminMonitorSiteRequestStageCounts(): Promise<AdminMonitorSiteRequestStageCounts> {
  await ensureMonitorSiteRequestsTable();

  const result = await query<{
    complete: string;
    confirmed_not_notified: string;
    linked_not_confirmed: string;
  }>(
    `select
       count(*) filter (
         where metadata_json->'monitorSetup' is not null
           and metadata_json->'monitorSetup'->>'setupStatus' = 'pending_setup'
       )::text as linked_not_confirmed,
       count(*) filter (
         where metadata_json->'monitorSetup'->>'setupStatus' = 'activated'
           and metadata_json->'monitorSetup'->>'confirmationEmailSentAt' is null
       )::text as confirmed_not_notified,
       count(*) filter (
         where metadata_json->'monitorSetup'->>'setupStatus' = 'activated'
           and metadata_json->'monitorSetup'->>'confirmationEmailSentAt' is not null
       )::text as complete
       from monitor_site_requests`,
    [],
    { readOnly: true }
  );

  const row = result.rows[0];

  return {
    complete: Number(row?.complete ?? 0),
    confirmed_not_notified: Number(row?.confirmed_not_notified ?? 0),
    linked_not_confirmed: Number(row?.linked_not_confirmed ?? 0)
  };
}

export async function loadAdminOrganizationOptions(): Promise<AdminOrganizationOptionRow[]> {
  const result = await query<AdminOrganizationOptionRow>(
    `select id, name, slug, plan
       from organizations
      order by name asc, created_at desc`,
    [],
    { readOnly: true }
  );

  return result.rows;
}

export async function updateAdminMonitorSiteRequestStatus(input: {
  id: string;
  status: AdminMonitorSiteRequestStatus;
}): Promise<AdminMonitorSiteRequestRow | null> {
  await ensureMonitorSiteRequestsTable();

  return await queryOne<AdminMonitorSiteRequestRow>(
    `update monitor_site_requests
        set status = $2
      where id = $1
      returning id,
                website,
                normalized_hostname,
                work_email,
                full_name,
                company,
                monitoring_goal,
                notes,
                source_page_url,
                source_report_url,
                metadata_json,
                status,
                created_at,
                updated_at`,
    [input.id, input.status]
  );
}

export async function updateAdminMonitorSiteRequestSetup(input: {
  id: string;
  metadata: Record<string, unknown>;
  status: AdminMonitorSiteRequestStatus;
}): Promise<AdminMonitorSiteRequestRow | null> {
  await ensureMonitorSiteRequestsTable();

  return await queryOne<AdminMonitorSiteRequestRow>(
    `update monitor_site_requests
        set status = $2,
            metadata_json = coalesce(metadata_json, '{}'::jsonb) || $3::jsonb
      where id = $1
      returning id,
                website,
                normalized_hostname,
                work_email,
                full_name,
                company,
                monitoring_goal,
                notes,
                source_page_url,
                source_report_url,
                metadata_json,
                status,
                created_at,
                updated_at`,
    [input.id, input.status, JSON.stringify(input.metadata)]
  );
}

export async function loadPolicyReviewQueueUpdateContext(queueItemId: string): Promise<{
  pageType: string | null;
  queueItem: Pick<AdminPolicyReviewQueueRow, "policy_enrichment_id" | "reason"> | null;
}> {
  const existingQueueItem = await queryOne<Pick<AdminPolicyReviewQueueRow, "policy_enrichment_id" | "reason">>(
    `select reason, policy_enrichment_id
       from policy_review_queue
      where id = $1`,
    [queueItemId],
    { readOnly: true }
  );

  const policyEnrichmentRow =
    existingQueueItem?.policy_enrichment_id
      ? await queryOne<{ page_type: string | null }>(
          `select page_type
             from policy_enrichment
            where id = $1`,
          [existingQueueItem.policy_enrichment_id],
          { readOnly: true }
        )
      : null;

  return {
    pageType: typeof policyEnrichmentRow?.page_type === "string" ? policyEnrichmentRow.page_type : null,
    queueItem: existingQueueItem ?? null
  };
}

export async function updatePolicyReviewQueueRow(input: {
  assignedTo?: string | null;
  queueItemId: string;
  reviewStatus: string;
  reviewVerdict: string | null;
  reviewedAt: string;
  reviewerNotes?: string | null;
}) {
  return await queryOne<AdminPolicyReviewQueueRow>(
    `update policy_review_queue
        set assigned_to = $2,
            review_status = $3,
            review_verdict = $4,
            reviewed_at = $5,
            reviewer_notes = $6
      where id = $1
      returning *`,
    [
      input.queueItemId,
      input.assignedTo ?? null,
      input.reviewStatus,
      input.reviewVerdict,
      input.reviewedAt,
      input.reviewerNotes ?? null
    ]
  );
}

export async function updateAdminMembershipRole(input: {
  organizationId: string;
  role: "advanced" | "user";
  userId: string;
}) {
  await query(
    `update organization_members
        set role = $3
      where organization_id = $1
        and user_id = $2`,
    [input.organizationId, input.userId, input.role]
  );
}

export async function updateAdminOrganizationPlan(input: {
  organizationId: string;
  plan: string;
  planStatus: string;
}) {
  await query(
    `update organizations
        set plan = $2,
            plan_status = $3
      where id = $1`,
    [input.organizationId, input.plan, input.planStatus]
  );
}

export async function loadAdminScanOverviewCounts(): Promise<AdminScanOverviewCounts> {
  await ensureScanRequestLogTable();
  const [totalScansResult, totalScanRequestsResult, unlinkedScanRequestsResult, http403Result, http429Result, blockedOrCaptchaResult, scanFromResult] = await Promise.all([
    query<{ count: string }>(`select count(*)::text as count from scans`, [], { readOnly: true }),
    query<{ count: string }>(`select count(*)::text as count from scan_requests`, [], { readOnly: true }),
    query<{ count: string }>(
      `select count(*)::text as count
         from scan_requests
        where coalesce(fulfilled_by_scan_id, scan_id) is null
           or resolution_mode = 'reused_existing_scan'`,
      [],
      { readOnly: true }
    ),
    query<{ count: string }>(
      `select count(*)::text as count
         from scan_snapshots
        where homepage_fetch_http_status = 403
           or robots_fetch_http_status = 403`,
      [],
      { readOnly: true }
    ),
    query<{ count: string }>(
      `select count(*)::text as count
         from scan_snapshots
        where homepage_fetch_http_status = 429
           or robots_fetch_http_status = 429`,
      [],
      { readOnly: true }
    ),
    query<{ count: string }>(
      `select count(*)::text as count
         from scan_snapshots
        where blocked_flag = true
           or captcha_flag = true
           or scan_outcome = 'content_capture_degraded'`,
      [],
      { readOnly: true }
    ),
    query<{ count: string; scan_from: string }>(
      `select coalesce(scan_config_json->>'scanFrom', 'default') as scan_from,
              count(*)::text as count
         from scans
        group by coalesce(scan_config_json->>'scanFrom', 'default')`,
      [],
      { readOnly: true }
    )
  ]);

  const totalPhysicalScans = Number(totalScansResult.rows[0]?.count ?? "0");
  const totalScanRequests = Number(totalScanRequestsResult.rows[0]?.count ?? "0");
  const totalUnlinkedScanRequests = Number(unlinkedScanRequestsResult.rows[0]?.count ?? "0");

  return {
    totalScans: totalPhysicalScans + totalUnlinkedScanRequests,
    totalPhysicalScans,
    totalScanRequests,
    scanFromCounts: SCAN_FROM_VALUES.map((scanFrom) => ({
      count: Number(scanFromResult.rows.find((row) => row.scan_from === scanFrom)?.count ?? "0"),
      label: formatScanFromLabel(scanFrom),
      value: scanFrom
    })),
    http403Count: Number(http403Result.rows[0]?.count ?? "0"),
    http429Count: Number(http429Result.rows[0]?.count ?? "0"),
    blockedOrCaptchaCount: Number(blockedOrCaptchaResult.rows[0]?.count ?? "0")
  };
}

export async function loadBlockedRunTelemetryRows(hours: number): Promise<AdminBlockedRunTelemetryRow[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const result = await query<AdminBlockedRunTelemetryRow>(
    `select scan_id, scan_timestamp, scan_outcome, homepage_fetch_http_status, egress_id, egress_type, asn, block_vendor_guess, normalized_body_hash
       from scan_snapshots
      where scan_timestamp >= $1
      order by scan_timestamp asc`,
    [since],
    { readOnly: true }
  );

  return result.rows;
}
