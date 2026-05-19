"use server";

import { query, queryOne } from "@website-signal-risk-scanner/db";
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
  completedAt: string | null;
  createdAt: string;
  detail: string | null;
  elapsedSeconds: number | null;
  feedbackCount: number;
  format: string | null;
  freshness: string | null;
  jobId: string;
  normalizedDomain: string | null;
  publicId: string;
  requestedAt: string;
  requestedUrl: string | null;
  resolutionMode: string | null;
  resultPulseUrl: string | null;
  resultReportUrl: string | null;
  scanId: string | null;
  status: string;
  topFindingIds: string[];
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
  requestedBy: Record<string, unknown>;
  requestType: string;
  responseSummary: Record<string, unknown> | null;
  retryAfterSeconds: number | null;
  schemaVersion: string;
  throttleReason: string | null;
  updatedAt: string;
  feedback: AdminPulseFeedbackItem[];
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

export type AdminPulseOverviewCounts = {
  completed: number;
  feedback: number;
  queuedOrRunning: number;
  rateLimited: number;
  total: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function getRequestContextString(value: unknown, key: string) {
  const record = asRecord(value);
  const nested = record[key];
  return typeof nested === "string" && nested.trim().length > 0 ? nested.trim() : null;
}

function mapPulseRequestRow(row: Record<string, unknown>): AdminPulseRequestListItem {
  const requestContext = asRecord(row.request_context);
  const responseSummary = asRecord(row.response_summary);
  return {
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
    createdAt: String(row.created_at),
    detail: getRequestContextString(requestContext, "detail"),
    elapsedSeconds: typeof row.elapsed_seconds === "number" ? row.elapsed_seconds : null,
    feedbackCount: typeof row.feedback_count === "number" ? row.feedback_count : 0,
    format: getRequestContextString(requestContext, "format"),
    freshness: getRequestContextString(requestContext, "freshness"),
    jobId: String(row.job_id),
    normalizedDomain: typeof row.normalized_domain === "string" ? row.normalized_domain : null,
    publicId: String(row.public_id),
    requestedAt: String(row.requested_at),
    requestedUrl: typeof row.requested_url === "string" ? row.requested_url : null,
    resolutionMode: typeof row.resolution_mode === "string" ? row.resolution_mode : null,
    resultPulseUrl: typeof row.result_pulse_url === "string" ? row.result_pulse_url : null,
    resultReportUrl: typeof row.result_report_url === "string" ? row.result_report_url : null,
    scanId: typeof row.scan_id === "string" ? row.scan_id : null,
    status: String(row.status),
    topFindingIds: asStringArray(responseSummary.topFindingIds)
  };
}

export async function getAdminPulseOverviewCounts(): Promise<AdminPulseOverviewCounts> {
  await requirePlatformAdminContext();
  const result = await queryOne<{
    completed: number;
    feedback: number;
    queued_or_running: number;
    rate_limited: number;
    total: number;
  }>(
    `select
       count(*)::int as total,
       count(*) filter (where status in ('completed', 'completed_limited'))::int as completed,
       count(*) filter (where status in ('queued', 'running', 'finalizing'))::int as queued_or_running,
       count(*) filter (where status = 'rate_limited')::int as rate_limited,
       (select count(*)::int from pulse_feedback)::int as feedback
     from pulse_requests`,
    [],
    { readOnly: true }
  );

  return {
    completed: result?.completed ?? 0,
    feedback: result?.feedback ?? 0,
    queuedOrRunning: result?.queued_or_running ?? 0,
    rateLimited: result?.rate_limited ?? 0,
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
  const limit = Math.max(1, Math.min(100, input.limit ?? 50));
  const offset = Math.max(0, input.offset ?? 0);
  const search = input.query?.trim() || null;
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
            count(pf.id)::int as feedback_count
       from pulse_requests pr
       left join pulse_feedback pf on pf.pulse_request_id = pr.public_id
      where ($1::text is null or pr.status = $1)
        and (
          $2::text is null
          or pr.public_id ilike '%' || $2 || '%'
          or pr.job_id ilike '%' || $2 || '%'
          or pr.normalized_domain ilike '%' || $2 || '%'
          or pr.requested_url ilike '%' || $2 || '%'
          or pr.scan_id::text ilike '%' || $2 || '%'
        )
      group by pr.public_id
      order by pr.requested_at desc
      limit $3 offset $4`,
    [input.status ?? null, search, limit, offset],
    { readOnly: true }
  );

  return rows.rows.map(mapPulseRequestRow);
}

export async function getAdminPulseRequestDetail(pulseRequestId: string): Promise<AdminPulseRequestDetail | null> {
  await requirePlatformAdminContext();
  const [request, feedbackRows] = await Promise.all([
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
              count(pf.id)::int as feedback_count
         from pulse_requests pr
         left join pulse_feedback pf on pf.pulse_request_id = pr.public_id
        where pr.public_id = $1 or pr.job_id = $1
        group by pr.public_id
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
    phase: typeof request.phase === "string" ? request.phase : null,
    projectionVersion: String(request.projection_version),
    pulseVersion: String(request.pulse_version),
    requestChannel: String(request.request_channel),
    requestContext: asRecord(request.request_context),
    requestedBy: asRecord(request.requested_by),
    requestType: String(request.request_type),
    responseSummary: request.response_summary ? asRecord(request.response_summary) : null,
    retryAfterSeconds: typeof request.retry_after_seconds === "number" ? request.retry_after_seconds : null,
    schemaVersion: String(request.schema_version),
    throttleReason: typeof request.throttle_reason === "string" ? request.throttle_reason : null,
    updatedAt: String(request.updated_at),
    feedback: feedbackRows.map((row) => ({
      comment: typeof row.comment === "string" ? row.comment : null,
      createdAt: String(row.created_at),
      email: typeof row.email === "string" ? row.email : null,
      id: String(row.id),
      ipHash: typeof row.ip_hash === "string" ? row.ip_hash : null,
      rating: String(row.rating),
      reason: typeof row.reason === "string" ? row.reason : null,
      userAgent: typeof row.user_agent === "string" ? row.user_agent : null
    }))
  };
}

export async function listAdminPulseRequestsForScan(scanId: string): Promise<AdminPulseRequestListItem[]> {
  await requirePlatformAdminContext();
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
            count(pf.id)::int as feedback_count
       from pulse_requests pr
       left join pulse_feedback pf on pf.pulse_request_id = pr.public_id
      where pr.scan_id = $1
      group by pr.public_id
      order by pr.requested_at desc
      limit 25`,
    [scanId],
    { readOnly: true }
  );

  return rows.rows.map(mapPulseRequestRow);
}
