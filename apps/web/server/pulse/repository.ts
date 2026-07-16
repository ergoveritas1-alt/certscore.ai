import { query, queryOne } from "@website-signal-risk-scanner/db";
import { DEFAULT_SCAN_FROM, normalizeScanFrom, type ScanFrom } from "@website-signal-risk-scanner/shared";
import { randomUUID } from "node:crypto";
import {
  PULSE_API_VERSION,
  PULSE_PROJECTION_VERSION,
  PULSE_SCHEMA_VERSION,
  PULSE_VERSION
} from "../../lib/pulse/constants";
import type { PulseRequestContext } from "../../lib/pulse/types";
import { ensurePulseTables } from "./schema";
import {
  ANONYMOUS_SCAN_DAILY_LIMIT,
  anonymousScanQuotaKey,
  decideAnonymousScanQuota,
  retryAfterNextUtcDay,
  type AnonymousScanQuotaDecision
} from "./anonymous-scan-quota";

type PulseRequestRow = {
  public_id: string;
  job_id: string;
  requested_url: string | null;
  normalized_url: string | null;
  normalized_domain: string | null;
  request_channel: string | null;
  status: string;
  phase: string | null;
  scan_id: string | null;
  result_pulse_url: string | null;
  result_report_url: string | null;
  resolution_mode: string | null;
  request_context: Record<string, unknown>;
  retry_after_seconds: number | null;
  error_code: string | null;
  error_message: string | null;
  requested_at: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export function createPulsePublicId(prefix = "pulse_req") {
  return `${prefix}_${randomUUID()}`;
}

export function pulseJobIdForPublicId(publicId: string) {
  return `pulse_job_${publicId.replace(/^pulse_req_/, "")}`;
}

export async function findLatestCompletedAnonymousScanForDomain(
  normalizedDomain: string,
  input?: { maxAgeHours?: number; minPagesRequested?: number; scanFrom?: ScanFrom }
) {
  await ensurePulseTables();
  const scanFrom = normalizeScanFrom(input?.scanFrom);
  const parameters: Array<string | number> = [normalizedDomain, `https://${normalizedDomain}`, scanFrom];
  const maxAgeClause =
    typeof input?.maxAgeHours === "number" && Number.isFinite(input.maxAgeHours)
      ? (() => {
          parameters.push(Math.floor(input.maxAgeHours));
          return `and s.completed_at is not null and s.completed_at >= now() - ($${parameters.length}::int * interval '1 hour')`;
        })()
      : "";
  const minPagesClause =
    typeof input?.minPagesRequested === "number" && Number.isFinite(input.minPagesRequested)
      ? (() => {
          parameters.push(Math.floor(input.minPagesRequested));
          return `and s.pages_requested >= $${parameters.length}`;
        })()
      : "";
  return queryOne<{ id: string }>(
    `select s.id
       from scans s
       join domains d on d.id = s.domain_id
      where s.organization_id is null
        and d.organization_id is null
        and s.status = 'completed'
        and coalesce(s.scan_config_json->>'scanFrom', '${DEFAULT_SCAN_FROM}') = $3
        ${minPagesClause}
        and (lower(d.hostname) = lower($1) or lower(d.normalized_url) = lower($2))
        ${maxAgeClause}
      order by s.completed_at desc nulls last, s.created_at desc
      limit 1`,
    parameters,
    { readOnly: true }
  );
}

export async function createPulseRequest(input: {
  context: PulseRequestContext;
  normalizedDomain?: string | null;
  normalizedUrl?: string | null;
  requestChannel?: string;
  requestedUrl?: string | null;
  resolutionMode: string;
  scanId?: string | null;
  status: string;
}) {
  await ensurePulseTables();
  const publicId = createPulsePublicId();
  const jobId = pulseJobIdForPublicId(publicId);
  await query(
    `insert into pulse_requests (
       public_id, job_id, requested_url, normalized_url, normalized_domain,
       request_channel, requested_by, request_context, status, scan_id, api_version, schema_version,
       pulse_version, projection_version, resolution_mode
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      publicId,
      jobId,
      input.requestedUrl ?? null,
      input.normalizedUrl ?? null,
      input.normalizedDomain ?? null,
      input.requestChannel ?? input.context.channel ?? input.context.source ?? "pulse_api",
      {
        userId: input.context.userId ?? null,
        accountId: input.context.accountId ?? null,
        apiKeyId: input.context.apiKeyId ?? null,
        anonymous: !input.context.userId && !input.context.apiKeyId
      },
      {
        ipHash: input.context.ipHash,
        sourceIp: input.context.sourceIp,
        userAgent: input.context.userAgent,
        referer: input.context.referer,
        requestId: input.context.requestId ?? null,
        format: input.context.format,
        detail: input.context.detail,
        freshness: input.context.freshness,
        forceNewScan: input.context.forceNewScan ?? false,
        waitSeconds: input.context.waitSeconds,
        mode: input.context.mode,
        quotaClass: input.context.quotaClass ?? null,
        source: input.context.source ?? input.context.channel ?? "pulse_api",
        channel: input.context.channel ?? input.context.source ?? "pulse_api"
      },
      input.status,
      input.scanId ?? null,
      PULSE_API_VERSION,
      PULSE_SCHEMA_VERSION,
      PULSE_VERSION,
      PULSE_PROJECTION_VERSION,
      input.resolutionMode
    ]
  );

  return { publicId, jobId };
}

export async function getPulseGptActionUsage(input: { ipHash: string | null }) {
  await ensurePulseTables();
  if (!input.ipHash) {
    return { hourlyCount: 0, dailyCount: 0 };
  }

  const result = await queryOne<{ hourly_count: number; daily_count: number }>(
    `select
       count(*) filter (where requested_at > now() - interval '1 hour')::int as hourly_count,
       count(*) filter (where requested_at > now() - interval '1 day')::int as daily_count
       from pulse_requests
      where request_channel = 'gpt_action'
        and request_context->>'mode' = 'url'
        and request_context->>'ipHash' = $1`,
    [input.ipHash],
    { readOnly: true }
  );

  return {
    hourlyCount: result?.hourly_count ?? 0,
    dailyCount: result?.daily_count ?? 0
  };
}

export async function updatePulseRequestCompleted(input: {
  pulseRequestId: string;
  scanId: string;
  resultPulseUrl: string;
  resultReportUrl: string;
  responseSummary: Record<string, unknown>;
  resolutionMode?: string;
}) {
  await ensurePulseTables();
  await query(
    `update pulse_requests
        set status = 'completed',
            phase = 'completed',
            scan_id = $2,
            result_pulse_url = coalesce(result_pulse_url, $3),
            result_report_url = $4,
            response_summary = $5,
            resolution_mode = case
              when public_id = $1 then coalesce($6, resolution_mode)
              else resolution_mode
            end,
            completed_at = now(),
            elapsed_seconds = greatest(0, extract(epoch from (now() - requested_at))::int)
      where public_id = $1
         or (scan_id = $2 and status in ('queued', 'running'))`,
    [input.pulseRequestId, input.scanId, input.resultPulseUrl, input.resultReportUrl, input.responseSummary, input.resolutionMode ?? null]
  );
}

export async function recordPulseArtifactDownload(input: {
  artifactType: "summary_json" | "evidence_json";
  byteSize?: number | null;
  cachedOrReused?: boolean | null;
  normalizedDomain?: string | null;
  pulseRequestId?: string | null;
  requestChannel?: string | null;
  requestSource?: string | null;
  requesterContext?: Record<string, unknown> | null;
  resolutionMode?: string | null;
  responseStatus: number;
  routeName?: string | null;
  scanId?: string | null;
}) {
  await ensurePulseTables();
  await query(
    `insert into pulse_artifact_downloads (
       pulse_request_id, scan_id, normalized_domain, artifact_type, route_name,
       request_source, request_channel, response_status, byte_size, resolution_mode,
       cached_or_reused, requester_context
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      input.pulseRequestId ?? null,
      input.scanId ?? null,
      input.normalizedDomain ?? null,
      input.artifactType,
      input.routeName ?? null,
      input.requestSource ?? null,
      input.requestChannel ?? null,
      input.responseStatus,
      input.byteSize ?? null,
      input.resolutionMode ?? null,
      input.cachedOrReused ?? null,
      input.requesterContext ?? {}
    ]
  );
}

export async function updatePulseRequestQueued(input: {
  pulseRequestId: string;
  scanId: string | null;
  resultPulseUrl: string | null;
  resultReportUrl: string | null;
  resolutionMode?: string | null;
}) {
  await ensurePulseTables();
  await query(
    `update pulse_requests
        set status = 'queued',
            phase = 'queued',
            scan_id = $2,
            result_pulse_url = $3,
            result_report_url = $4,
            resolution_mode = coalesce($5, resolution_mode)
      where public_id = $1`,
    [input.pulseRequestId, input.scanId, input.resultPulseUrl, input.resultReportUrl, input.resolutionMode ?? null]
  );
}

export async function claimPulseAlternateRegionFallback(input: {
  fallbackScanFrom: string;
  noGoReason: string;
  primaryScanFrom: string;
  primaryScanId: string;
  pulseRequestId: string;
}) {
  await ensurePulseTables();
  const result = await query<{ public_id: string }>(
    `update pulse_requests
        set status = 'queued',
            phase = 'queued',
            resolution_mode = 'alternate_region_fallback_claimed',
            request_context = request_context || jsonb_build_object('recovery', $3::jsonb)
      where public_id = $1
        and scan_id = $2
        and status in ('queued', 'running', 'completed', 'completed_limited')
        and coalesce(request_context->'recovery'->>'alternateRegionAttempted', 'false') <> 'true'
      returning public_id`,
    [
      input.pulseRequestId,
      input.primaryScanId,
      {
        alternateRegionAttempted: true,
        fallbackScanFrom: input.fallbackScanFrom,
        noGoReason: input.noGoReason,
        primaryScanFrom: input.primaryScanFrom,
        primaryScanId: input.primaryScanId,
        claimedAt: new Date().toISOString()
      }
    ]
  );
  return result.rowCount === 1;
}

export async function markPulseAlternateRegionFallbackFailed(input: {
  errorMessage: string;
  primaryScanId: string;
  pulseRequestId: string;
  resultPulseUrl: string | null;
  resultReportUrl: string | null;
}) {
  await ensurePulseTables();
  await query(
    `update pulse_requests
        set status = 'completed_limited',
            phase = 'completed',
            scan_id = $2,
            result_pulse_url = $3,
            result_report_url = $4,
            resolution_mode = 'alternate_region_fallback_failed',
            error_code = 'alternate_region_fallback_failed',
            error_message = $5,
            completed_at = coalesce(completed_at, now()),
            elapsed_seconds = greatest(0, extract(epoch from (coalesce(completed_at, now()) - requested_at))::int)
      where public_id = $1`,
    [
      input.pulseRequestId,
      input.primaryScanId,
      input.resultPulseUrl,
      input.resultReportUrl,
      input.errorMessage.slice(0, 1_000)
    ]
  );
}

export async function updatePulseRequestLifecycle(input: {
  completedAt?: string | null;
  phase: string;
  pulseRequestId: string;
  resolutionMode?: string | null;
  status: string;
}) {
  await ensurePulseTables();
  const terminal = ["completed", "completed_limited", "failed", "expired", "rate_limited"].includes(input.status);
  await query(
    `update pulse_requests
        set status = $2,
            phase = $3,
            completed_at = case
              when $4::boolean then coalesce($5::timestamptz, completed_at, now())
              else completed_at
            end,
            elapsed_seconds = case
              when $4::boolean then greatest(0, extract(epoch from (coalesce($5::timestamptz, now()) - requested_at))::int)
              else elapsed_seconds
            end,
            resolution_mode = coalesce($6, resolution_mode)
      where public_id = $1`,
    [input.pulseRequestId, input.status, input.phase, terminal, input.completedAt ?? null, input.resolutionMode ?? null]
  );
}

export async function updatePulseRequestRateLimited(input: {
  pulseRequestId: string;
  retryAfterSeconds: number;
  throttleReason?: string;
  scanId?: string | null;
}) {
  await ensurePulseTables();
  await query(
    `update pulse_requests
        set status = 'rate_limited',
            phase = 'rate_limited',
            resolution_mode = 'rate_limited',
            throttle_reason = $4,
            retry_after_seconds = $2,
            scan_id = coalesce($3, scan_id),
            completed_at = coalesce(completed_at, now()),
            elapsed_seconds = greatest(0, extract(epoch from (now() - requested_at))::int)
      where public_id = $1`,
    [input.pulseRequestId, input.retryAfterSeconds, input.scanId ?? null, input.throttleReason ?? "domain_1_minute_scan_limit"]
  );
}

export async function updatePulseRequestFailed(input: {
  errorCode: string;
  errorMessage: string;
  pulseRequestId: string;
  resolutionMode?: string;
}) {
  await ensurePulseTables();
  await query(
    `update pulse_requests
        set status = 'failed',
            phase = 'failed',
            resolution_mode = coalesce($4, 'failed_before_scan_creation'),
            error_code = $2,
            error_message = $3,
            completed_at = coalesce(completed_at, now()),
            elapsed_seconds = greatest(0, extract(epoch from (now() - requested_at))::int)
      where public_id = $1`,
    [input.pulseRequestId, input.errorCode, input.errorMessage.slice(0, 1_000), input.resolutionMode ?? null]
  );
}

export async function getPulseRequestByJobId(jobId: string) {
  await ensurePulseTables();
  return queryOne<PulseRequestRow>(
    `select public_id, job_id, requested_url, normalized_url, normalized_domain, request_channel, status, phase,
            scan_id, result_pulse_url, result_report_url, resolution_mode, request_context,
            retry_after_seconds, error_code, error_message, requested_at, created_at, updated_at, completed_at
       from pulse_requests
      where job_id = $1 or public_id = $1
      limit 1`,
    [jobId],
    { readOnly: true }
  );
}

export async function claimPulseDomainScanCreation(input: { normalizedDomain: string; pulseRequestId: string }) {
  await ensurePulseTables();
  const existing = await queryOne<{ expires_at: string }>(
    `select expires_at
       from pulse_domain_throttles
      where normalized_domain = $1
        and expires_at > now()`,
    [input.normalizedDomain],
    { readOnly: true }
  );

  if (existing) {
    const retryAfterSeconds = Math.max(1, Math.ceil((new Date(existing.expires_at).getTime() - Date.now()) / 1000));
    return { allowed: false as const, retryAfterSeconds };
  }

  await query(
    `insert into pulse_domain_throttles (normalized_domain, expires_at, last_pulse_request_id)
     values ($1, now() + interval '1 minute', $2)
     on conflict (normalized_domain)
     do update set
       last_scan_created_at = now(),
       expires_at = now() + interval '1 minute',
       last_pulse_request_id = excluded.last_pulse_request_id`,
    [input.normalizedDomain, input.pulseRequestId]
  );

  return { allowed: true as const, retryAfterSeconds: 0 };
}

export async function claimAnonymousScanDailyQuota(input: {
  ipHash: string | null | undefined;
}): Promise<AnonymousScanQuotaDecision> {
  await ensurePulseTables();
  const requesterKey = anonymousScanQuotaKey(input.ipHash);
  const claimed = await queryOne<{ scan_count: number | string }>(
    `insert into anonymous_scan_daily_quotas (requester_key, window_date, scan_count, last_scan_at, updated_at)
     values ($1, (now() at time zone 'utc')::date, 1, now(), now())
     on conflict (requester_key, window_date)
     do update set
       scan_count = anonymous_scan_daily_quotas.scan_count + 1,
       last_scan_at = now(),
       updated_at = now()
     where anonymous_scan_daily_quotas.scan_count < $2
     returning scan_count`,
    [requesterKey, ANONYMOUS_SCAN_DAILY_LIMIT]
  );

  if (claimed) {
    return decideAnonymousScanQuota({ currentCount: Number(claimed.scan_count) - 1 });
  }

  return {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: retryAfterNextUtcDay()
  };
}

export async function getAnonymousScanDailyQuotaState(input: {
  ipHash: string | null | undefined;
  now?: Date;
}) {
  await ensurePulseTables();
  const requesterKey = anonymousScanQuotaKey(input.ipHash);
  const row = await queryOne<{ scan_count: number | string }>(
    `select scan_count
       from anonymous_scan_daily_quotas
      where requester_key = $1
        and window_date = (now() at time zone 'utc')::date`,
    [requesterKey],
    { readOnly: true }
  );
  const used = Math.max(0, Math.min(ANONYMOUS_SCAN_DAILY_LIMIT, Number(row?.scan_count ?? 0)));
  const now = input.now ?? new Date();
  const resetAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

  return {
    limit: ANONYMOUS_SCAN_DAILY_LIMIT,
    remaining: Math.max(0, ANONYMOUS_SCAN_DAILY_LIMIT - used),
    resetAt,
    used
  };
}

export async function getPulseFeedbackCount(input: { pulseRequestId: string; ipHash: string | null }) {
  await ensurePulseTables();
  const result = await queryOne<{ count: number }>(
    `select count(*)::int as count
       from pulse_feedback
      where pulse_request_id = $1
        and ($2::text is null or ip_hash = $2)
        and created_at > now() - interval '1 hour'`,
    [input.pulseRequestId, input.ipHash],
    { readOnly: true }
  );
  return result?.count ?? 0;
}

export async function savePulseFeedback(input: {
  pulseRequestId: string;
  rating: string;
  reason: string | null;
  comment: string | null;
  email: string | null;
  ipHash: string | null;
  userAgent: string | null;
}) {
  await ensurePulseTables();
  const request = await queryOne<{ scan_id: string | null; normalized_domain: string | null }>(
    `select scan_id, normalized_domain from pulse_requests where public_id = $1`,
    [input.pulseRequestId],
    { readOnly: true }
  );
  if (!request) {
    return null;
  }
  await query(
    `insert into pulse_feedback (
       pulse_request_id, scan_id, normalized_domain, rating, reason, comment, email, ip_hash, user_agent
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.pulseRequestId,
      request.scan_id,
      request.normalized_domain,
      input.rating,
      input.reason,
      input.comment,
      input.email,
      input.ipHash,
      input.userAgent
    ]
  );
  return request;
}
