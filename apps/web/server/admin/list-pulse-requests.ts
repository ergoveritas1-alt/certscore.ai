"use server";

import { query, queryOne } from "@website-signal-risk-scanner/db";
import { formatScanFromLabel, normalizeScanFrom } from "@website-signal-risk-scanner/shared";
import { classifyAdminApiRoute, type AdminApiRoute } from "../../lib/admin/api-route";
import { ensurePulseTables } from "../pulse/schema";
import { requirePlatformAdminContext } from "./platform-admin";

export type AdminPulseRequestStatus =
  | "queued"
  | "running"
  | "finalizing"
  | "completed"
  | "completed_limited"
  | "failed"
  | "expired"
  | "rate_limited";

export type AdminPulseRequestListItem = {
  accessPostureClass: string | null;
  apiRoute: AdminApiRoute;
  blockedFlag: boolean | null;
  captchaFlag: boolean | null;
  cmpVendorName: string | null;
  completedAt: string | null;
  createdAt: string;
  detail: string | null;
  elapsedSeconds: number | null;
  feedbackCount: number;
  format: string | null;
  freshRescanRequested: boolean | null;
  freshness: string | null;
  jobId: string;
  normalizedDomain: string | null;
  industry: string | null;
  publicId: string;
  requestedAt: string;
  requestedUrl: string | null;
  primaryLanguage: string | null;
  privacyPolicyPresent: boolean | null;
  resolutionMode: string | null;
  resultPulseUrl: string | null;
  resultReportUrl: string | null;
  scanId: string | null;
  score: number | null;
  scanFromLabel: string;
  scanFromValue: string;
  requestChannel: string | null;
  requestedByAnonymous: boolean | null;
  requesterName: string | null;
  sourceIp: string | null;
  sourceIpHash: string | null;
  status: string;
  snapshotFindingCount: number | null;
  snapshotTotalSignals: number | null;
  summaryJsonDownloads: number;
  evidenceJsonDownloads: number;
  topFindingIds: string[];
  topFindingCount: number | null;
};

export type AdminPulseRequestDetail = AdminPulseRequestListItem & {
  apiVersion: string;
  errorCode: string | null;
  errorMessage: string | null;
  normalizedUrl: string | null;
  phase: string | null;
  projectionVersion: string;
  pulseVersion: string;
  requestChannel: string;
  requestContext: Record<string, unknown>;
  requestedByAnonymous: boolean | null;
  requestedBy: Record<string, unknown>;
  requestType: string;
  responseSummary: Record<string, unknown> | null;
  retryAfterSeconds: number | null;
  schemaVersion: string;
  throttleReason: string | null;
  updatedAt: string;
  feedback: AdminPulseFeedbackItem[];
  artifactDownloads: AdminPulseArtifactDownloadItem[];
};

export type AdminPulseFeedbackItem = {
  comment: string | null;
  createdAt: string;
  email: string | null;
  id: string;
  ipHash: string | null;
  rating: string;
  reason: string | null;
  userAgent: string | null;
};

export type AdminPulseArtifactDownloadItem = {
  artifactType: string;
  byteSize: number | null;
  cachedOrReused: boolean | null;
  createdAt: string;
  id: string;
  requestChannel: string | null;
  requestSource: string | null;
  resolutionMode: string | null;
  responseStatus: number;
  routeName: string | null;
};

export type AdminPulseOverviewCounts = {
  completed: number;
  evidenceJsonDownloads: number;
  feedback: number;
  queuedOrRunning: number;
  rateLimited: number;
  summaryJsonDownloads: number;
  total: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function timestampString(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === "string" && value.trim() ? value : null;
}

function getRequestContextString(value: unknown, key: string) {
  const record = asRecord(value);
  const nested = record[key];
  return typeof nested === "string" && nested.trim().length > 0 ? nested.trim() : null;
}

function getRequestContextBoolean(value: unknown, key: string) {
  const record = asRecord(value);
  const nested = record[key];
  if (typeof nested === "boolean") {
    return nested;
  }
  if (typeof nested === "string") {
    const normalized = nested.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return null;
}

function getFreshRescanRequested(requestContext: Record<string, unknown>) {
  return getRequestContextBoolean(requestContext, "bypassRecentScanReuse") ?? getRequestContextBoolean(requestContext, "forceNewScan");
}

function mapPulseRequestRow(row: Record<string, unknown>): AdminPulseRequestListItem {
  const requestContext = asRecord(row.request_context);
  const requestedBy = asRecord(row.requested_by);
  const responseSummary = asRecord(row.response_summary);
  const scanId = typeof row.scan_id === "string" ? row.scan_id : null;
  const storedTopFindingIds = asStringArray(responseSummary.topFindingIds);
  const scanFromValue = normalizeScanFrom(requestContext.scanFrom ?? asRecord(row.scan_config_json).scanFrom);
  const score =
    typeof responseSummary.score === "number"
      ? responseSummary.score
      : typeof row.snapshot_score === "number" ? row.snapshot_score : null;
  return {
    accessPostureClass: typeof row.access_posture_class === "string" ? row.access_posture_class : null,
    apiRoute: classifyAdminApiRoute({
      requestChannel: typeof row.request_channel === "string" ? row.request_channel : null,
      requestSource: getRequestContextString(requestContext, "source") ?? getRequestContextString(requestContext, "channel")
    }),
    completedAt: timestampString(row.completed_at) ?? timestampString(row.scan_completed_at),
    blockedFlag: typeof row.blocked_flag === "boolean" ? row.blocked_flag : null,
    captchaFlag: typeof row.captcha_flag === "boolean" ? row.captcha_flag : null,
    cmpVendorName: typeof row.cmp_vendor_name === "string" ? row.cmp_vendor_name : null,
    createdAt: timestampString(row.created_at) ?? String(row.created_at),
    detail: getRequestContextString(requestContext, "detail"),
    elapsedSeconds:
      typeof row.elapsed_seconds === "number"
        ? row.elapsed_seconds
        : typeof row.scan_elapsed_seconds === "number"
          ? row.scan_elapsed_seconds
          : null,
    feedbackCount: typeof row.feedback_count === "number" ? row.feedback_count : 0,
    format: getRequestContextString(requestContext, "format"),
    freshRescanRequested: getFreshRescanRequested(requestContext),
    freshness: getRequestContextString(requestContext, "freshness"),
    jobId: String(row.job_id),
    industry: typeof row.admin_industry_label === "string" ? row.admin_industry_label : null,
    normalizedDomain:
      typeof row.normalized_domain === "string"
        ? row.normalized_domain
        : typeof row.scan_domain_hostname === "string"
          ? row.scan_domain_hostname
          : null,
    publicId: String(row.public_id),
    requestedAt: timestampString(row.requested_at) ?? String(row.requested_at),
    requestedUrl: typeof row.requested_url === "string" ? row.requested_url : null,
    primaryLanguage: typeof row.site_language_primary === "string" ? row.site_language_primary : null,
    privacyPolicyPresent:
      typeof row.privacy_policy_present === "boolean" ? row.privacy_policy_present : null,
    resolutionMode: typeof row.resolution_mode === "string" ? row.resolution_mode : null,
    resultPulseUrl: typeof row.result_pulse_url === "string" ? row.result_pulse_url : null,
    resultReportUrl: typeof row.result_report_url === "string" ? row.result_report_url : null,
    scanId,
    score,
    scanFromLabel: formatScanFromLabel(scanFromValue),
    scanFromValue,
    requestChannel: typeof row.request_channel === "string" ? row.request_channel : null,
    requestedByAnonymous: typeof requestedBy.anonymous === "boolean" ? requestedBy.anonymous : null,
    requesterName: typeof row.requester_name === "string" ? row.requester_name : null,
    sourceIp: getRequestContextString(requestContext, "sourceIp"),
    sourceIpHash: getRequestContextString(requestContext, "ipHash"),
    status:
      ["completed", "completed_limited", "failed"].includes(String(row.scan_status)) &&
      ["queued", "running", "finalizing"].includes(String(row.status))
        ? String(row.scan_status)
        : String(row.status),
    snapshotFindingCount: typeof row.snapshot_finding_count === "number" ? row.snapshot_finding_count : null,
    snapshotTotalSignals: typeof row.snapshot_total_signals === "number" ? row.snapshot_total_signals : null,
    summaryJsonDownloads: typeof row.summary_json_downloads === "number" ? row.summary_json_downloads : 0,
    evidenceJsonDownloads: typeof row.evidence_json_downloads === "number" ? row.evidence_json_downloads : 0,
    topFindingIds: storedTopFindingIds,
    topFindingCount:
      score === null
        ? null
        : typeof row.top_finding_count === "number"
        ? row.top_finding_count
        : storedTopFindingIds.length > 0
          ? storedTopFindingIds.length
          : null
  };
}

function buildDisplayResponseSummary(input: {
  base: AdminPulseRequestListItem;
  raw: unknown;
}) {
  const responseSummary = input.raw ? asRecord(input.raw) : null;
  if (!responseSummary) {
    return null;
  }

  return {
    ...responseSummary,
    topFindingIds: input.base.topFindingIds,
    topFindingCount: input.base.topFindingCount,
    findingCount: input.base.snapshotFindingCount,
    scanId: input.base.scanId,
    totalSignals: input.base.snapshotTotalSignals
  };
}

export async function getAdminPulseOverviewCounts(): Promise<AdminPulseOverviewCounts> {
  await requirePlatformAdminContext();
  await ensurePulseTables();
  const result = await queryOne<{
    completed: number;
    evidence_json_downloads: number;
    feedback: number;
    queued_or_running: number;
    rate_limited: number;
    summary_json_downloads: number;
    total: number;
  }>(
    `select
       count(*)::int as total,
       count(*) filter (where status in ('completed', 'completed_limited'))::int as completed,
       count(*) filter (where status in ('queued', 'running', 'finalizing'))::int as queued_or_running,
       count(*) filter (where status = 'rate_limited')::int as rate_limited,
       (select count(*)::int from pulse_feedback)::int as feedback,
       (select count(*)::int from pulse_artifact_downloads where artifact_type = 'summary_json')::int as summary_json_downloads,
       (select count(*)::int from pulse_artifact_downloads where artifact_type = 'evidence_json')::int as evidence_json_downloads
     from pulse_requests`,
    [],
    { readOnly: true }
  );

  return {
    completed: result?.completed ?? 0,
    evidenceJsonDownloads: result?.evidence_json_downloads ?? 0,
    feedback: result?.feedback ?? 0,
    queuedOrRunning: result?.queued_or_running ?? 0,
    rateLimited: result?.rate_limited ?? 0,
    summaryJsonDownloads: result?.summary_json_downloads ?? 0,
    total: result?.total ?? 0
  };
}

export async function listAdminPulseRequests(input: {
  limit?: number;
  offset?: number;
  query?: string | null;
  status?: AdminPulseRequestStatus | null;
} = {}): Promise<AdminPulseRequestListItem[]> {
  await requirePlatformAdminContext();
  await ensurePulseTables();
  const limit = Math.max(1, Math.min(100, input.limit ?? 20));
  const offset = Math.max(0, input.offset ?? 0);
  const search = input.query?.trim() || null;
  const rows = await query<Record<string, unknown>>(
    `select pr.public_id,
            pr.job_id,
            pr.requested_url,
            pr.normalized_domain,
            pr.requested_at,
            pr.request_context,
            pr.request_channel,
            pr.requested_by,
            pr.status,
            pr.scan_id::text as scan_id,
            pr.result_pulse_url,
            pr.result_report_url,
            pr.resolution_mode,
            pr.response_summary,
            pr.completed_at,
            pr.elapsed_seconds,
            pr.created_at,
            coalesce(app_user.email, auth_user.email, api_key.created_by) as requester_name,
            s.status as scan_status,
            s.completed_at as scan_completed_at,
            case
              when s.completed_at is not null and s.started_at is not null
              then extract(epoch from (s.completed_at - s.started_at))::float8
              else null
            end as scan_elapsed_seconds,
            domain.hostname as scan_domain_hostname,
            ss.total_signals::int as snapshot_total_signals,
            ss.report_finding_count::int as snapshot_finding_count,
            ss.certscore_overall::int as snapshot_score,
            ss.top_finding_count::int as top_finding_count,
            ss.privacy_policy_present,
            ss.cmp_vendor_name,
            ss.access_posture_class,
            ss.blocked_flag,
            ss.captcha_flag,
            ss.site_language_primary,
            ss.admin_industry_label,
            s.scan_config_json,
            coalesce(pf.feedback_count, 0)::int as feedback_count,
            coalesce(pad.summary_json_downloads, 0)::int as summary_json_downloads,
            coalesce(pad.evidence_json_downloads, 0)::int as evidence_json_downloads
       from pulse_requests pr
       left join scan_snapshots ss on ss.scan_id = pr.scan_id
       left join scans s on s.id = pr.scan_id
       left join domains domain on domain.id = s.domain_id
       left join users app_user on app_user.id::text = pr.requested_by ->> 'userId'
       left join better_auth_users auth_user on auth_user.id = pr.requested_by ->> 'userId'
       left join integration_api_keys api_key on api_key.public_id = pr.requested_by ->> 'apiKeyId'
       left join lateral (
         select count(*)::int as feedback_count
           from pulse_feedback
          where pulse_request_id = pr.public_id
       ) pf on true
       left join lateral (
         select
           count(*) filter (where artifact_type = 'summary_json')::int as summary_json_downloads,
           count(*) filter (where artifact_type = 'evidence_json')::int as evidence_json_downloads
          from pulse_artifact_downloads
         where pulse_request_id = pr.public_id
       ) pad on true
      where ($1::text is null or pr.status = $1)
        and (
          $2::text is null
          or pr.public_id ilike '%' || $2 || '%'
          or pr.job_id ilike '%' || $2 || '%'
          or pr.normalized_domain ilike '%' || $2 || '%'
          or pr.requested_url ilike '%' || $2 || '%'
          or pr.scan_id::text ilike '%' || $2 || '%'
        )
      order by pr.requested_at desc
      limit $3 offset $4`,
    [input.status ?? null, search, limit, offset],
    { readOnly: true }
  );

  return rows.rows.map((row) => mapPulseRequestRow(row));
}

export async function getAdminPulseRequestDetail(pulseRequestId: string): Promise<AdminPulseRequestDetail | null> {
  await requirePlatformAdminContext();
  await ensurePulseTables();
  const [request, feedbackRows, artifactDownloadRows] = await Promise.all([
    queryOne<Record<string, unknown>>(
      `select pr.public_id,
              pr.job_id,
              pr.request_type,
              pr.request_channel,
              pr.requested_url,
              pr.normalized_url,
              pr.normalized_domain,
              pr.requested_at,
              pr.requested_by,
              pr.request_context,
              pr.status,
              pr.phase,
              pr.scan_id::text as scan_id,
              pr.result_pulse_url,
              pr.result_report_url,
              pr.api_version,
              pr.schema_version,
              pr.pulse_version,
              pr.projection_version,
              pr.resolution_mode,
              pr.throttle_reason,
              pr.retry_after_seconds,
              pr.response_summary,
              pr.error_code,
              pr.error_message,
              pr.completed_at,
              pr.elapsed_seconds,
              pr.created_at,
              pr.updated_at,
              coalesce(app_user.email, auth_user.email, api_key.created_by) as requester_name,
              s.status as scan_status,
              s.completed_at as scan_completed_at,
              case
                when s.completed_at is not null and s.started_at is not null
                then extract(epoch from (s.completed_at - s.started_at))::float8
                else null
              end as scan_elapsed_seconds,
              domain.hostname as scan_domain_hostname,
              ss.total_signals::int as snapshot_total_signals,
              ss.report_finding_count::int as snapshot_finding_count,
              ss.certscore_overall::int as snapshot_score,
              ss.top_finding_count::int as top_finding_count,
              ss.privacy_policy_present,
              ss.cmp_vendor_name,
              ss.access_posture_class,
              ss.blocked_flag,
              ss.captcha_flag,
              ss.site_language_primary,
              ss.admin_industry_label,
              s.scan_config_json,
              coalesce(pf.feedback_count, 0)::int as feedback_count,
              coalesce(pad.summary_json_downloads, 0)::int as summary_json_downloads,
              coalesce(pad.evidence_json_downloads, 0)::int as evidence_json_downloads
         from pulse_requests pr
         left join scans s on s.id = pr.scan_id
         left join domains domain on domain.id = s.domain_id
         left join scan_snapshots ss on ss.scan_id = pr.scan_id
         left join users app_user on app_user.id::text = pr.requested_by ->> 'userId'
         left join better_auth_users auth_user on auth_user.id = pr.requested_by ->> 'userId'
         left join integration_api_keys api_key on api_key.public_id = pr.requested_by ->> 'apiKeyId'
         left join lateral (
           select count(*)::int as feedback_count
             from pulse_feedback
            where pulse_request_id = pr.public_id
         ) pf on true
         left join lateral (
           select
             count(*) filter (where artifact_type = 'summary_json')::int as summary_json_downloads,
             count(*) filter (where artifact_type = 'evidence_json')::int as evidence_json_downloads
            from pulse_artifact_downloads
           where pulse_request_id = pr.public_id
         ) pad on true
        where pr.public_id = $1 or pr.job_id = $1
        limit 1`,
      [pulseRequestId],
      { readOnly: true }
    ),
    query<Record<string, unknown>>(
      `select id::text,
              rating,
              reason,
              comment,
              email,
              ip_hash,
              user_agent,
              created_at
         from pulse_feedback
        where pulse_request_id = $1
        order by created_at desc
        limit 100`,
      [pulseRequestId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select id::text,
              artifact_type,
              route_name,
              request_source,
              request_channel,
              response_status,
              byte_size,
              resolution_mode,
              cached_or_reused,
              created_at
         from pulse_artifact_downloads
        where pulse_request_id = $1
        order by created_at desc
        limit 100`,
      [pulseRequestId],
      { readOnly: true }
    ).then((result) => result.rows)
  ]);

  if (!request) {
    return null;
  }

  const base = mapPulseRequestRow(request);
  return {
    ...base,
    apiVersion: String(request.api_version),
    errorCode: typeof request.error_code === "string" ? request.error_code : null,
    errorMessage: typeof request.error_message === "string" ? request.error_message : null,
    normalizedUrl: typeof request.normalized_url === "string" ? request.normalized_url : null,
    phase:
      ["completed", "completed_limited", "failed", "expired", "rate_limited"].includes(base.status)
        ? base.status
        : typeof request.phase === "string"
          ? request.phase
          : null,
    projectionVersion: String(request.projection_version),
    pulseVersion: String(request.pulse_version),
    requestChannel: String(request.request_channel),
    requestContext: asRecord(request.request_context),
    requestedByAnonymous: typeof asRecord(request.requested_by).anonymous === "boolean" ? (asRecord(request.requested_by).anonymous as boolean) : null,
    requestedBy: asRecord(request.requested_by),
    requestType: String(request.request_type),
    responseSummary: buildDisplayResponseSummary({ base, raw: request.response_summary }),
    retryAfterSeconds: typeof request.retry_after_seconds === "number" ? request.retry_after_seconds : null,
    schemaVersion: String(request.schema_version),
    throttleReason: typeof request.throttle_reason === "string" ? request.throttle_reason : null,
    updatedAt: timestampString(request.updated_at) ?? String(request.updated_at),
    feedback: feedbackRows.map((row) => ({
      comment: typeof row.comment === "string" ? row.comment : null,
      createdAt: timestampString(row.created_at) ?? String(row.created_at),
      email: typeof row.email === "string" ? row.email : null,
      id: String(row.id),
      ipHash: typeof row.ip_hash === "string" ? row.ip_hash : null,
      rating: String(row.rating),
      reason: typeof row.reason === "string" ? row.reason : null,
      userAgent: typeof row.user_agent === "string" ? row.user_agent : null
    })),
    artifactDownloads: artifactDownloadRows.map((row) => ({
      artifactType: String(row.artifact_type),
      byteSize: typeof row.byte_size === "number" ? row.byte_size : null,
      cachedOrReused: typeof row.cached_or_reused === "boolean" ? row.cached_or_reused : null,
      createdAt: timestampString(row.created_at) ?? String(row.created_at),
      id: String(row.id),
      requestChannel: typeof row.request_channel === "string" ? row.request_channel : null,
      requestSource: typeof row.request_source === "string" ? row.request_source : null,
      resolutionMode: typeof row.resolution_mode === "string" ? row.resolution_mode : null,
      responseStatus: typeof row.response_status === "number" ? row.response_status : 0,
      routeName: typeof row.route_name === "string" ? row.route_name : null
    }))
  };
}

export async function listAdminPulseRequestsForScan(scanId: string): Promise<AdminPulseRequestListItem[]> {
  await requirePlatformAdminContext();
  await ensurePulseTables();
  const rows = await query<Record<string, unknown>>(
    `select pr.public_id,
            pr.job_id,
            pr.requested_url,
            pr.normalized_domain,
            pr.requested_at,
            pr.request_context,
            pr.status,
            pr.scan_id::text as scan_id,
            pr.result_pulse_url,
            pr.result_report_url,
            pr.resolution_mode,
            pr.response_summary,
            pr.completed_at,
            pr.elapsed_seconds,
            pr.created_at,
            s.scan_config_json,
            ss.certscore_overall::int as snapshot_score,
            ss.top_finding_count::int as top_finding_count,
            ss.privacy_policy_present,
            ss.cmp_vendor_name,
            ss.site_language_primary,
            ss.admin_industry_label,
            coalesce(pf.feedback_count, 0)::int as feedback_count,
            coalesce(pad.summary_json_downloads, 0)::int as summary_json_downloads,
            coalesce(pad.evidence_json_downloads, 0)::int as evidence_json_downloads
       from pulse_requests pr
       left join scans s on s.id = pr.scan_id
       left join scan_snapshots ss on ss.scan_id = pr.scan_id
       left join lateral (
         select count(*)::int as feedback_count
           from pulse_feedback
          where pulse_request_id = pr.public_id
       ) pf on true
       left join lateral (
         select
           count(*) filter (where artifact_type = 'summary_json')::int as summary_json_downloads,
           count(*) filter (where artifact_type = 'evidence_json')::int as evidence_json_downloads
          from pulse_artifact_downloads
         where pulse_request_id = pr.public_id
       ) pad on true
      where pr.scan_id = $1
      order by pr.requested_at desc
      limit 25`,
    [scanId],
    { readOnly: true }
  );

  return rows.rows.map((row) => mapPulseRequestRow(row));
}
