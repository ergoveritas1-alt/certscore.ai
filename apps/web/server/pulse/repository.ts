import { query, queryOne, withWriteTransaction } from "@website-signal-risk-scanner/db";
import { DEFAULT_SCAN_FROM, normalizeScanFrom, type ScanFrom } from "@website-signal-risk-scanner/shared";
import { randomUUID } from "node:crypto";
import {
  PULSE_API_VERSION,
  PULSE_PROJECTION_VERSION,
  PULSE_SCHEMA_VERSION,
  PULSE_VERSION
} from "../../lib/pulse/constants";
import type { PulseRequestContext } from "../../lib/pulse/types";
import {
  decideIntegrationApiKeyUsageLimit,
  integrationOrganizationScanCreateLimits,
  type IntegrationApiKeyRecord
} from "../integrations/api-keys";
import { ensurePulseTables } from "./schema";
import {
  ANONYMOUS_SCAN_DAILY_LIMIT,
  LIGHT_MCP_NEW_SCAN_POLICY,
  anonymousScanQuotaKey,
  decideAnonymousScanQuota,
  decideLightMcpScanConcurrency,
  decideLightMcpNewScanQuota,
  retryAfterNextUtcDay,
  type AnonymousScanQuotaDecision
} from "./anonymous-scan-quota";
import {
  decidePulseRetrievalQuota,
  PULSE_RETRIEVAL_DAILY_WINDOW_SECONDS,
  PULSE_RETRIEVAL_WINDOW_SECONDS,
  pulseRetrievalPrincipal,
  type PulseRetrievalProfile
} from "./retrieval-quota";

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
  input?: { maxAgeHours?: number; minPagesRequested?: number; normalizedUrl?: string; scanFrom?: ScanFrom }
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
  const targetUrlClause = input?.normalizedUrl
    ? (() => {
        parameters.push(input.normalizedUrl);
        return `and coalesce(s.scan_config_json->>'normalizedUrl', d.normalized_url) = $${parameters.length}`;
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
        ${targetUrlClause}
        and (lower(d.hostname) = lower($1) or lower(d.normalized_url) = lower($2))
        ${maxAgeClause}
      order by s.completed_at desc nulls last, s.created_at desc
      limit 1`,
    parameters,
    { readOnly: true }
  );
}

type CreatePulseRequestInput = {
  context: PulseRequestContext;
  normalizedDomain?: string | null;
  normalizedUrl?: string | null;
  requestChannel?: string;
  requestedUrl?: string | null;
  resolutionMode: string;
  scanId?: string | null;
  status: string;
};

const INSERT_PULSE_REQUEST_SQL = `insert into pulse_requests (
       public_id, job_id, requested_url, normalized_url, normalized_domain,
       request_channel, requested_by, request_context, status, scan_id, api_version, schema_version,
       pulse_version, projection_version, resolution_mode
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`;

function pulseRequestInsertValues(input: CreatePulseRequestInput, publicId: string, jobId: string) {
  return [
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
        retrievalPrincipal: input.context.retrievalPrincipal ?? null,
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
    ];
}

export async function createPulseRequest(input: CreatePulseRequestInput) {
  await ensurePulseTables();
  const publicId = createPulsePublicId();
  const jobId = pulseJobIdForPublicId(publicId);
  await query(INSERT_PULSE_REQUEST_SQL, pulseRequestInsertValues(input, publicId, jobId));

  return { publicId, jobId };
}

/** Atomically bounds completed scan reads before recording API activity. */
export async function createPulseRequestWithRetrievalQuota(input: CreatePulseRequestInput & { scanId: string }) {
  await ensurePulseTables();
  const principal = pulseRetrievalPrincipal(input.context);
  const context: PulseRequestContext = {
    ...input.context,
    quotaClass: "scan_retrieval",
    retrievalPrincipal: principal
  };
  const decision = await claimPulseReadQuota({
    detail: context.detail,
    principal,
    profile: "terminal",
    route: context.source ?? context.channel ?? "pulse_api",
    target: `scan:${input.scanId}`
  });
  if (!decision.allowed) return decision;
  const { publicId, jobId } = await createPulseRequest({ ...input, context });
  return { ...decision, publicId, jobId };
}

export async function claimPulseReadQuota(input: {
  detail: PulseRequestContext["detail"];
  principal: string;
  profile: PulseRetrievalProfile;
  route: string;
  target: string;
}) {
  await ensurePulseTables();
  return withWriteTransaction(async (client) => {
    const principal = input.principal;
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`pulse-retrieval-principal:${principal}`]);
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`pulse-retrieval-target:${input.target}`]);
    const usageResult = await client.query<{
      daily_principal_scan_units: number;
      oldest_daily_principal_scan_at: string | null;
      oldest_principal_at: string | null;
      oldest_principal_scan_at: string | null;
      oldest_scan_at: string | null;
      principal_scan_units: number;
      principal_units: number;
      scan_units: number;
    }>(
      `with recent as (
         select target,
                requested_at,
                principal as retrieval_principal,
                units
           from pulse_read_events
          where requested_at > now() - make_interval(secs => $3::int)
            and profile = $5
            and (
              principal = $1
              or target = $2
            )
       )
       select
         coalesce(sum(units) filter (
           where retrieval_principal = $1
             and requested_at > now() - make_interval(secs => $4::int)
         ), 0)::int as principal_units,
         coalesce(sum(units) filter (
           where target = $2
             and requested_at > now() - make_interval(secs => $4::int)
         ), 0)::int as scan_units,
         min(requested_at) filter (
           where retrieval_principal = $1
             and requested_at > now() - make_interval(secs => $4::int)
         ) as oldest_principal_at,
         min(requested_at) filter (
           where target = $2
             and requested_at > now() - make_interval(secs => $4::int)
         ) as oldest_scan_at,
         min(requested_at) filter (where retrieval_principal = $1 and target = $2) as oldest_daily_principal_scan_at,
         coalesce(sum(units) filter (
           where retrieval_principal = $1
             and target = $2
             and requested_at > now() - make_interval(secs => $4::int)
         ), 0)::int as principal_scan_units,
         min(requested_at) filter (
           where retrieval_principal = $1
             and target = $2
             and requested_at > now() - make_interval(secs => $4::int)
         ) as oldest_principal_scan_at,
         coalesce(sum(units) filter (where retrieval_principal = $1 and target = $2), 0)::int as daily_principal_scan_units
       from recent`,
      [
        principal,
        input.target,
        PULSE_RETRIEVAL_DAILY_WINDOW_SECONDS,
        PULSE_RETRIEVAL_WINDOW_SECONDS,
        input.profile
      ]
    );
    const row = usageResult.rows[0];
    const decision = decidePulseRetrievalQuota({
      detail: input.detail,
      profile: input.profile,
      usage: {
        dailyPrincipalScanUnits: Number(row?.daily_principal_scan_units ?? 0),
        oldestDailyPrincipalScanAt: row?.oldest_daily_principal_scan_at ?? null,
        oldestPrincipalAt: row?.oldest_principal_at ?? null,
        oldestPrincipalScanAt: row?.oldest_principal_scan_at ?? null,
        oldestScanAt: row?.oldest_scan_at ?? null,
        principalScanUnits: Number(row?.principal_scan_units ?? 0),
        principalUnits: Number(row?.principal_units ?? 0),
        scanUnits: Number(row?.scan_units ?? 0)
      }
    });
    if (!decision.allowed) return decision;
    await client.query(
      `insert into pulse_read_events (principal, target, profile, route, units)
       values ($1, $2, $3, $4, $5)`,
      [principal, input.target, input.profile, input.route, decision.weight]
    );
    return decision;
  });
}

/** Atomically checks the shared regional key quota and reserves one accepted new-scan submission. */
export async function createPulseRequestWithApiKeyQuota(input: CreatePulseRequestInput & {
  key: Pick<IntegrationApiKeyRecord, "organizationId" | "publicId" | "hourlyLimit" | "dailyLimit">;
}) {
  await ensurePulseTables();
  return withWriteTransaction(async (client) => {
    if (input.key.organizationId) {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [`integration-org:${input.key.organizationId}`]);
    }
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`integration-key:${input.key.publicId}`]);

    const usageResult = await client.query<{
      key_hourly_count: number;
      key_daily_count: number;
      organization_hourly_count: number;
      organization_daily_count: number;
    }>(
      `select
         count(*) filter (
           where requested_by->>'apiKeyId' = $1
             and request_context->>'quotaClass' = 'scan_create'
             and requested_at > now() - interval '1 hour'
         )::int as key_hourly_count,
         count(*) filter (
           where requested_by->>'apiKeyId' = $1
             and request_context->>'quotaClass' = 'scan_create'
             and requested_at > now() - interval '1 day'
         )::int as key_daily_count,
         count(*) filter (
           where $2::text is not null
             and requested_by->>'accountId' = $2
             and request_context->>'quotaClass' = 'scan_create'
             and requested_at > now() - interval '1 hour'
         )::int as organization_hourly_count,
         count(*) filter (
           where $2::text is not null
             and requested_by->>'accountId' = $2
             and request_context->>'quotaClass' = 'scan_create'
             and requested_at > now() - interval '1 day'
         )::int as organization_daily_count
         from pulse_requests
        where requested_at > now() - interval '1 day'
          and (
            requested_by->>'apiKeyId' = $1
            or ($2::text is not null and requested_by->>'accountId' = $2)
          )`,
      [input.key.publicId, input.key.organizationId]
    );
    const usageRow = usageResult.rows[0];
    const organizationLimits = integrationOrganizationScanCreateLimits(input.key.publicId);
    const decision = decideIntegrationApiKeyUsageLimit({
      keyHourlyCount: Number(usageRow?.key_hourly_count ?? 0),
      keyDailyCount: Number(usageRow?.key_daily_count ?? 0),
      organizationHourlyCount: Number(usageRow?.organization_hourly_count ?? 0),
      organizationDailyCount: Number(usageRow?.organization_daily_count ?? 0),
      keyHourlyLimit: input.key.hourlyLimit,
      keyDailyLimit: input.key.dailyLimit,
      organizationHourlyLimit: organizationLimits.hourlyLimit,
      organizationDailyLimit: organizationLimits.dailyLimit
    });
    if (!decision.allowed) {
      return decision;
    }

    const publicId = createPulsePublicId();
    const jobId = pulseJobIdForPublicId(publicId);
    await client.query(INSERT_PULSE_REQUEST_SQL, pulseRequestInsertValues(input, publicId, jobId));
    return { ...decision, publicId, jobId };
  });
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

export function pulseScanThrottleIdentity(input: { normalizedDomain: string; normalizedUrl: string; scanFrom?: ScanFrom }) {
  // Freshness is scoped to the requested page and scanner location; query strings do not create new identities.
  const location = normalizeScanFrom(input.scanFrom);
  try {
    const url = new URL(input.normalizedUrl);
    const path = url.pathname.replace(/\/{2,}/g, "/");
    const normalizedPath = path.length > 1 ? path.replace(/\/$/, "") : "/";
    return normalizedPath === "/"
      ? `${input.normalizedDomain}|${location}`
      : `${input.normalizedDomain}${normalizedPath}|${location}`;
  } catch {
    return `${input.normalizedDomain}|${location}`;
  }
}

export async function claimPulseDomainScanCreation(input: { normalizedDomain: string; normalizedUrl: string; pulseRequestId: string; scanFrom?: ScanFrom }) {
  await ensurePulseTables();
  const throttleIdentity = pulseScanThrottleIdentity(input);
  const claimed = await queryOne<{ expires_at: string }>(
    `insert into pulse_domain_throttles (normalized_domain, expires_at, last_pulse_request_id)
     values ($1, now() + interval '1 minute', $2)
     on conflict (normalized_domain)
     do update set
       last_scan_created_at = now(),
       expires_at = now() + interval '1 minute',
       last_pulse_request_id = excluded.last_pulse_request_id,
       updated_at = now()
     where pulse_domain_throttles.expires_at <= now()
     returning expires_at`,
    [throttleIdentity, input.pulseRequestId]
  );

  if (claimed) return { allowed: true as const, retryAfterSeconds: 0 };
  const existing = await queryOne<{ expires_at: string }>(
    `select expires_at from pulse_domain_throttles where normalized_domain = $1`,
    [throttleIdentity],
    { readOnly: true }
  );
  const retryAfterSeconds = Math.max(1, Math.ceil((new Date(existing?.expires_at ?? Date.now() + 60_000).getTime() - Date.now()) / 1_000));
  return { allowed: false as const, retryAfterSeconds };
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

type LightMcpNewScanUsageRow = {
  oldest_ip_burst_at: string | null;
  oldest_session_burst_at: string | null;
  oldest_surface_burst_at: string | null;
  ip_burst_count: number | string;
  ip_daily_count: number | string;
  session_burst_count: number | string;
  session_daily_count: number | string;
  surface_burst_count: number | string;
  surface_daily_count: number | string;
};

function lightMcpUsage(row: LightMcpNewScanUsageRow | undefined) {
  return {
    session: {
      burstCount: Number(row?.session_burst_count ?? 0),
      dailyCount: Number(row?.session_daily_count ?? 0),
      oldestBurstAt: row?.oldest_session_burst_at ?? null
    },
    ip: {
      burstCount: Number(row?.ip_burst_count ?? 0),
      dailyCount: Number(row?.ip_daily_count ?? 0),
      oldestBurstAt: row?.oldest_ip_burst_at ?? null
    },
    surface: {
      burstCount: Number(row?.surface_burst_count ?? 0),
      dailyCount: Number(row?.surface_daily_count ?? 0),
      oldestBurstAt: row?.oldest_surface_burst_at ?? null
    }
  };
}

const LIGHT_MCP_NEW_SCAN_USAGE_SQL = `select
  count(*) filter (where requested_at > now() - make_interval(secs => $3::int))::int as surface_burst_count,
  count(*) filter (where requester_key = $1 and requested_at > now() - make_interval(secs => $3::int))::int as session_burst_count,
  count(*) filter (where coalesce(ip_key, requester_key) = $2 and requested_at > now() - make_interval(secs => $3::int))::int as ip_burst_count,
  count(*) filter (where requested_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc')::int as surface_daily_count,
  count(*) filter (where requester_key = $1 and requested_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc')::int as session_daily_count,
  count(*) filter (where coalesce(ip_key, requester_key) = $2 and requested_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc')::int as ip_daily_count,
  min(requested_at) filter (where requested_at > now() - make_interval(secs => $3::int)) as oldest_surface_burst_at,
  min(requested_at) filter (where requester_key = $1 and requested_at > now() - make_interval(secs => $3::int)) as oldest_session_burst_at,
  min(requested_at) filter (where coalesce(ip_key, requester_key) = $2 and requested_at > now() - make_interval(secs => $3::int)) as oldest_ip_burst_at
from light_mcp_new_scan_events
where requested_at > now() - interval '1 day'
   or requested_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;

function logLightMcpScanAdmission(input: {
  active: { session: number; ip: number; surface: number };
  decision: ReturnType<typeof decideLightMcpNewScanQuota> | ReturnType<typeof decideLightMcpScanConcurrency>;
  usage?: ReturnType<typeof lightMcpUsage>;
}) {
  const utilization = {
    concurrency: input.active.surface / LIGHT_MCP_NEW_SCAN_POLICY.concurrency.surface,
    burst: (input.usage?.surface.burstCount ?? 0) / LIGHT_MCP_NEW_SCAN_POLICY.surface.burstLimit,
    daily: (input.usage?.surface.dailyCount ?? 0) / LIGHT_MCP_NEW_SCAN_POLICY.surface.dailyLimit
  };
  const peakSurfaceUtilization = Math.max(...Object.values(utilization));
  const event = {
    event: "light_mcp.scan_admission",
    level: !input.decision.allowed || peakSurfaceUtilization >= 0.7 ? "warn" : "info",
    outcome: input.decision.allowed ? "allowed" : "denied",
    scope: input.decision.scope,
    window: input.decision.window,
    retryAfterSeconds: input.decision.retryAfterSeconds,
    active: input.active,
    usage: input.usage ? {
      session: { burst: input.usage.session.burstCount, daily: input.usage.session.dailyCount },
      ip: { burst: input.usage.ip.burstCount, daily: input.usage.ip.dailyCount },
      surface: { burst: input.usage.surface.burstCount, daily: input.usage.surface.dailyCount }
    } : null,
    surfaceUtilization: utilization,
    capacityWarning: peakSurfaceUtilization >= 0.7,
    policy: LIGHT_MCP_NEW_SCAN_POLICY
  };
  (event.level === "warn" ? console.warn : console.log)(JSON.stringify(event));
}

/** Atomically reserves one genuinely new scan against both requester and whole-Light safety rails. */
export async function claimLightMcpNewScanQuota(input: { ipKey: string; sessionKey: string }) {
  await ensurePulseTables();
  return withWriteTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", ["light-mcp-new-scan-surface"]);
    const activeResult = await client.query<{
      ip_count: number | string;
      session_count: number | string;
      surface_count: number | string;
    }>(`select
          count(*)::int as surface_count,
          count(*) filter (where requester_key = $1)::int as session_count,
          count(*) filter (where ip_key = $2)::int as ip_count
        from light_mcp_active_scan_claims claim
        left join scans scan on scan.id = claim.scan_id
       where claim.released_at is null
         and (
           (claim.scan_id is null and claim.expires_at > now())
           or (claim.scan_id is not null and scan.status not in ('completed', 'failed', 'expired', 'cancelled'))
         )`, [
      input.sessionKey,
      input.ipKey
    ]);
    const active = activeResult.rows[0];
    const activeUsage = {
      session: Number(active?.session_count ?? 0),
      ip: Number(active?.ip_count ?? 0),
      surface: Number(active?.surface_count ?? 0)
    };
    const concurrencyDecision = decideLightMcpScanConcurrency({
      usage: activeUsage
    });
    if (!concurrencyDecision.allowed) {
      logLightMcpScanAdmission({ active: activeUsage, decision: concurrencyDecision });
      return concurrencyDecision;
    }
    const usageResult = await client.query<LightMcpNewScanUsageRow>(LIGHT_MCP_NEW_SCAN_USAGE_SQL, [
      input.sessionKey,
      input.ipKey,
      LIGHT_MCP_NEW_SCAN_POLICY.burstWindowSeconds
    ]);
    const usage = lightMcpUsage(usageResult.rows[0]);
    const decision = decideLightMcpNewScanQuota({ usage });
    if (!decision.allowed) {
      logLightMcpScanAdmission({ active: activeUsage, decision, usage });
      return decision;
    }
    await client.query(
      "insert into light_mcp_new_scan_events (requester_key, ip_key) values ($1, $2)",
      [input.sessionKey, input.ipKey]
    );
    const claimResult = await client.query<{ id: string }>(
      `insert into light_mcp_active_scan_claims (requester_key, ip_key, expires_at)
       values ($1, $2, now() + make_interval(secs => $3::int))
       returning id`,
      [input.sessionKey, input.ipKey, LIGHT_MCP_NEW_SCAN_POLICY.concurrencyLeaseSeconds]
    );
    logLightMcpScanAdmission({ active: activeUsage, decision, usage });
    return { ...decision, concurrencyClaimId: claimResult.rows[0]!.id };
  });
}

export async function bindLightMcpScanConcurrencyClaim(input: { claimId: string; scanId: string }) {
  await ensurePulseTables();
  const result = await query(
    `update light_mcp_active_scan_claims
        set scan_id = $2
      where id = $1
        and released_at is null
        and expires_at > now()`,
    [input.claimId, input.scanId]
  );
  if (result.rowCount !== 1) {
    throw new Error("Light MCP concurrency claim could not be bound to the created scan.");
  }
}

export async function releaseLightMcpScanConcurrencyClaim(claimId: string) {
  await ensurePulseTables();
  await query(
    `update light_mcp_active_scan_claims
        set released_at = coalesce(released_at, now())
      where id = $1`,
    [claimId]
  );
}

export async function getLightMcpNewScanQuotaState(input: { ipKey: string; sessionKey: string; now?: Date }) {
  await ensurePulseTables();
  const row = await queryOne<LightMcpNewScanUsageRow>(LIGHT_MCP_NEW_SCAN_USAGE_SQL, [
    input.sessionKey,
    input.ipKey,
    LIGHT_MCP_NEW_SCAN_POLICY.burstWindowSeconds
  ], { readOnly: true });
  const usage = lightMcpUsage(row ?? undefined);
  const limit = LIGHT_MCP_NEW_SCAN_POLICY.session.dailyLimit;
  const remaining = Math.max(0, Math.min(
    LIGHT_MCP_NEW_SCAN_POLICY.session.dailyLimit - usage.session.dailyCount,
    LIGHT_MCP_NEW_SCAN_POLICY.ip.dailyLimit - usage.ip.dailyCount,
    LIGHT_MCP_NEW_SCAN_POLICY.surface.dailyLimit - usage.surface.dailyCount
  ));
  const now = input.now ?? new Date();
  return {
    limit,
    remaining,
    resetAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString(),
    used: limit - remaining
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
