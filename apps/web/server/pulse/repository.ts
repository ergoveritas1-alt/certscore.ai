import { query, queryOne } from "@website-signal-risk-scanner/db";
import { randomUUID } from "node:crypto";
import {
  PULSE_API_VERSION,
  PULSE_PROJECTION_VERSION,
  PULSE_SCHEMA_VERSION,
  PULSE_VERSION
} from "../../lib/pulse/constants";
import type { PulseRequestContext } from "../../lib/pulse/types";
import { ensurePulseTables } from "./schema";

type PulseRequestRow = {
  public_id: string;
  job_id: string;
  requested_url: string | null;
  normalized_url: string | null;
  normalized_domain: string | null;
  status: string;
  phase: string | null;
  scan_id: string | null;
  result_pulse_url: string | null;
  result_report_url: string | null;
  resolution_mode: string | null;
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

export async function findLatestCompletedAnonymousScanForDomain(normalizedDomain: string) {
  await ensurePulseTables();
  return queryOne<{ id: string }>(
    `select s.id
       from scans s
       join domains d on d.id = s.domain_id
      where s.organization_id is null
        and d.organization_id is null
        and s.status = 'completed'
        and (lower(d.hostname) = lower($1) or lower(d.normalized_url) = lower($2))
      order by s.completed_at desc nulls last, s.created_at desc
      limit 1`,
    [normalizedDomain, `https://${normalizedDomain}`],
    { readOnly: true }
  );
}

export async function createPulseRequest(input: {
  context: PulseRequestContext;
  normalizedDomain?: string | null;
  normalizedUrl?: string | null;
  requestedUrl?: string | null;
  resolutionMode: string;
  scanId?: string | null;
  status: string;
}) {
  await ensurePulseTables();
  const publicId = createPulsePublicId();
  const jobId = `pulse_job_${publicId.replace(/^pulse_req_/, "")}`;
  await query(
    `insert into pulse_requests (
       public_id, job_id, requested_url, normalized_url, normalized_domain,
       requested_by, request_context, status, scan_id, api_version, schema_version,
       pulse_version, projection_version, resolution_mode
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      publicId,
      jobId,
      input.requestedUrl ?? null,
      input.normalizedUrl ?? null,
      input.normalizedDomain ?? null,
      {
        userId: input.context.userId ?? null,
        accountId: input.context.accountId ?? null,
        apiKeyId: input.context.apiKeyId ?? null,
        anonymous: !input.context.userId && !input.context.apiKeyId
      },
      {
        ipHash: input.context.ipHash,
        userAgent: input.context.userAgent,
        referer: input.context.referer,
        format: input.context.format,
        detail: input.context.detail,
        freshness: input.context.freshness,
        waitSeconds: input.context.waitSeconds,
        mode: input.context.mode
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
            scan_id = $2,
            result_pulse_url = $3,
            result_report_url = $4,
            response_summary = $5,
            resolution_mode = coalesce($6, resolution_mode),
            completed_at = timezone('utc', now()),
            elapsed_seconds = greatest(0, extract(epoch from (timezone('utc', now()) - requested_at))::int)
      where public_id = $1`,
    [input.pulseRequestId, input.scanId, input.resultPulseUrl, input.resultReportUrl, input.responseSummary, input.resolutionMode ?? null]
  );
}

export async function updatePulseRequestQueued(input: {
  pulseRequestId: string;
  scanId: string | null;
  resultPulseUrl: string | null;
  resultReportUrl: string | null;
}) {
  await ensurePulseTables();
  await query(
    `update pulse_requests
        set status = 'queued',
            phase = 'queued',
            scan_id = $2,
            result_pulse_url = $3,
            result_report_url = $4
      where public_id = $1`,
    [input.pulseRequestId, input.scanId, input.resultPulseUrl, input.resultReportUrl]
  );
}

export async function updatePulseRequestRateLimited(input: {
  pulseRequestId: string;
  retryAfterSeconds: number;
  scanId?: string | null;
}) {
  await ensurePulseTables();
  await query(
    `update pulse_requests
        set status = 'rate_limited',
            resolution_mode = 'rate_limited',
            throttle_reason = 'domain_5_minute_scan_limit',
            retry_after_seconds = $2,
            scan_id = coalesce($3, scan_id)
      where public_id = $1`,
    [input.pulseRequestId, input.retryAfterSeconds, input.scanId ?? null]
  );
}

export async function getPulseRequestByJobId(jobId: string) {
  await ensurePulseTables();
  return queryOne<PulseRequestRow>(
    `select public_id, job_id, requested_url, normalized_url, normalized_domain, status, phase,
            scan_id, result_pulse_url, result_report_url, resolution_mode,
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
        and expires_at > timezone('utc', now())`,
    [input.normalizedDomain],
    { readOnly: true }
  );

  if (existing) {
    const retryAfterSeconds = Math.max(1, Math.ceil((new Date(existing.expires_at).getTime() - Date.now()) / 1000));
    return { allowed: false as const, retryAfterSeconds };
  }

  await query(
    `insert into pulse_domain_throttles (normalized_domain, expires_at, last_pulse_request_id)
     values ($1, timezone('utc', now()) + interval '5 minutes', $2)
     on conflict (normalized_domain)
     do update set
       last_scan_created_at = timezone('utc', now()),
       expires_at = timezone('utc', now()) + interval '5 minutes',
       last_pulse_request_id = excluded.last_pulse_request_id`,
    [input.normalizedDomain, input.pulseRequestId]
  );

  return { allowed: true as const, retryAfterSeconds: 0 };
}

export async function getPulseFeedbackCount(input: { pulseRequestId: string; ipHash: string | null }) {
  await ensurePulseTables();
  const result = await queryOne<{ count: number }>(
    `select count(*)::int as count
       from pulse_feedback
      where pulse_request_id = $1
        and ($2::text is null or ip_hash = $2)
        and created_at > timezone('utc', now()) - interval '1 hour'`,
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
