import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isCanonicalScanId } from "@certscore/api-contracts";
import {
  apiReadRateLimitGuidance,
  normalizeScanFrom,
  PUBLIC_TARGET_POLICY_VERSION,
  type ScanFrom
} from "@website-signal-risk-scanner/shared";
import { restrictScanFromForUser } from "../../../../server/scans/restricted-scan-options";
import { SITE_URL } from "../../../../lib/seo";
import { applyPulseCors, pulseOptionsResponse } from "../../../../lib/pulse/cors";
import { buildPulseError } from "../../../../lib/pulse/error";
import {
  getHighPriorityFindingCount,
  getTopFindingIds,
  getTotalObservationCount,
  logPulseGptActionEvent
} from "../../../../lib/pulse/gpt-action-analytics";
import { renderPulseMarkdown } from "../../../../lib/pulse/markdown";
import { assessPulseScanRecordQuality, buildPulseProjection } from "../../../../lib/pulse/projection";
import {
  getPulseRequesterContext,
  normalizePulseUrl,
  parsePulseDetail,
  parsePulseFormat,
  parsePulseFreshness,
  parsePulseWaitSeconds,
  trustedMcpInternalRead
} from "../../../../lib/pulse/request";
import { buildPulseStatus } from "../../../../lib/pulse/status";
import { PULSE_MIN_REUSABLE_PAGES_REQUESTED, PULSE_SCAN_COVERAGE_PLAN_CODE } from "../../../../lib/pulse/scan-coverage";
import { queueAlternateRegionRecovery } from "../../../../server/pulse/queue-alternate-region-recovery";
import {
  parseBearerToken,
  validateCertScoreBearerToken,
  type IntegrationApiKeyRecord,
  type IntegrationApiKeyScope
} from "../../../../server/integrations/api-keys";
import { checkDomainDns, isDomainDnsPreflightError } from "../../../../server/domains/domain-dns";
import { createAnonymousFullScan } from "../../../../server/scans/create-anonymous-full-scan";
import { getPublicScanRecord, type PublicScanRecord } from "../../../../server/scans/get-public-scan-record";
import { getPublicScanStatusProjection } from "../../../../server/scans/scan-status-projection";
import {
  getRecentScanReuseEligibility
} from "../../../../server/scans/recent-scan-reuse";
import { isAnonymousScanQuotaError } from "../../../../server/pulse/anonymous-scan-quota";
import {
  claimPulseDomainScanCreation,
  createPulseRequest,
  createPulseRequestWithApiKeyQuota,
  createPulseRequestWithRetrievalQuota,
  findLatestCompletedAnonymousScanForDomain,
  getPulseGptActionUsage,
  getPulseRequestByJobId,
  recordPulseArtifactDownload,
  updatePulseRequestCompleted,
  updatePulseRequestFailed,
  updatePulseRequestQueued,
  updatePulseRequestRateLimited
} from "../../../../server/pulse/repository";
import { logApiReadRateLimited } from "../../../../server/pulse/read-rate-log";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GPT_ACTION_HOURLY_LIMIT = 5;
const GPT_ACTION_DAILY_LIMIT = 20;
const GPT_ACTION_MAX_WAIT_SECONDS = 35;

function pulseAbsoluteUrl(path: string) {
  return new URL(path, process.env.NEXT_PUBLIC_APP_URL?.trim() || SITE_URL).toString();
}

type PulseRouteOptions = {
  gptAction?: boolean;
  routeName?: string;
};

function etagFor(pulse: any, scanId: string, detail: string, format: string) {
  const pulseProjectionVersion = String(pulse.meta?.projectionVersion ?? "unknown").replace(/[^a-zA-Z0-9._-]/g, "");
  const reportProjectionVersion = String(pulse.meta?.reportProjectionVersion ?? "unknown").replace(/[^a-zA-Z0-9._-]/g, "");
  const reportProjectionHash = String(pulse.meta?.reportProjectionSourceHash ?? "no-source-hash")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 16);
  return `"${pulseProjectionVersion}-scan-${scanId}-${reportProjectionVersion}-${reportProjectionHash}-${detail}-${format}"`;
}

function diagnosticHeaders(route: string, requestId: string, headers?: HeadersInit) {
  const nextHeaders = new Headers(headers);
  nextHeaders.set("X-CertScore.ai-Pulse", "v1");
  nextHeaders.set("X-CertScore.ai-Route", route);
  nextHeaders.set("X-CertScore.ai-Request-Id", requestId);
  nextHeaders.set("X-CertScore-Pulse", "v1");
  nextHeaders.set("X-CertScore-Route", route);
  nextHeaders.set("X-CertScore-Request-Id", requestId);
  return applyPulseCors(nextHeaders);
}

function pulseArtifactType(detail: unknown) {
  if (detail === "summary") {
    return "summary_json" as const;
  }
  if (detail === "evidence") {
    return "evidence_json" as const;
  }
  return null;
}

async function completedResponse(
  pulse: any,
  format: "json" | "markdown",
  requestId: string,
  options: PulseRouteOptions & {
    requestContext?: Record<string, unknown> | null;
    resolutionMode?: string | null;
    pulseRequestId?: string | null;
    scanId?: string | null;
    normalizedDomain?: string | null;
  } = {}
) {
  const scanId = pulse.scan?.scanId ?? pulse.links?.scanJsonUrl?.split("scanId=")[1] ?? "unknown";
  if (format === "markdown") {
    return new NextResponse(renderPulseMarkdown(pulse, { gptAction: options.gptAction }), {
      headers: diagnosticHeaders(options.routeName ?? "pulse", requestId, {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        "Content-Type": "text/markdown; charset=utf-8",
        ETag: etagFor(pulse, scanId, pulse.meta.detail, "md")
      })
    });
  }
  const body = JSON.stringify(pulse);
  const artifactType = pulseArtifactType(pulse.meta?.detail);
  if (artifactType) {
    await recordPulseArtifactDownload({
      artifactType,
      byteSize: new TextEncoder().encode(body).byteLength,
      cachedOrReused: options.resolutionMode === "reused_existing_scan" || options.resolutionMode === "returned_stale_while_refreshing",
      normalizedDomain: options.normalizedDomain ?? pulse.domain ?? null,
      pulseRequestId: options.pulseRequestId ?? null,
      requestChannel: typeof options.requestContext?.channel === "string" ? options.requestContext.channel : options.gptAction ? "gpt_action" : "pulse_api",
      requestSource: typeof options.requestContext?.source === "string" ? options.requestContext.source : options.gptAction ? "gpt_action" : "pulse_api",
      requesterContext: {
        ipHash: options.requestContext?.ipHash ?? null,
        userAgent: options.requestContext?.userAgent ?? null,
        referer: options.requestContext?.referer ?? null
      },
      resolutionMode: options.resolutionMode ?? null,
      responseStatus: 200,
      routeName: options.routeName ?? "pulse",
      scanId: options.scanId ?? pulse.scanId ?? pulse.scan_id ?? null
    }).catch((error) => console.error("[pulse] artifact download log failed", { requestId, artifactType, error }));
  }
  return new Response(body, {
    headers: diagnosticHeaders(options.routeName ?? "pulse", requestId, {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Type": "application/json; charset=utf-8",
      ETag: etagFor(pulse, scanId, pulse.meta.detail, "json")
    }),
    status: 200
  });
}

function pulseJson(body: unknown, init: ResponseInit | undefined, requestId: string, routeName = "pulse") {
  const headers = diagnosticHeaders(routeName, requestId, init?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), {
    ...init,
    headers
  });
}

function retryAfterForStatus(status: { retryAfterSeconds?: number | null; estimatedWaitSeconds?: number | null }) {
  return status.retryAfterSeconds ?? status.estimatedWaitSeconds ?? 30;
}

function parseForceNewScan(value: string | null) {
  return value === "true" || value === "1";
}

async function loadPulseScanRecord(scanId: string) {
  const [status, scanRecord] = await Promise.all([
    getPublicScanStatusProjection(scanId).catch(() => null),
    getPublicScanRecord(scanId, { logPrefix: "[pulse]" }),
  ]);
  if (
    scanRecord &&
    scanRecord.scan.status === "completed" &&
    (
      !status ||
      (
        status.reportProjectionRequired &&
        !status.reportReady &&
        (status.status === "completed" || status.status === "completed_limited")
      )
    )
  ) {
    return {
      ...scanRecord,
      scan: { ...scanRecord.scan, status: "finalizing" },
    } as PublicScanRecord;
  }
  return scanRecord;
}

function pulseUnavailableResponse(input: {
  detail: "tiny" | "standard" | "full" | "summary" | "evidence";
  format: "json" | "markdown";
  message?: string;
  requestId: string;
  routeName: string;
  status?: number;
  url?: string | null;
}) {
  return pulseJson(
    buildPulseError({
      code: "scan_unavailable",
      message:
        input.message ??
        "This scan completed without enough retained public evidence for a reliable Pulse summary. Run a fresh scan before relying on the result.",
      url: input.url,
      detail: input.detail,
      format: input.format
    }),
    { headers: { "Cache-Control": "no-store", "Retry-After": "60" }, status: input.status ?? 409 },
    input.requestId,
    input.routeName
  );
}

async function waitForCompletedScan(scanId: string, waitSeconds: number) {
  const deadline = Date.now() + waitSeconds * 1000;
  while (Date.now() < deadline) {
    const scanRecord = await loadPulseScanRecord(scanId);
    if (scanRecord?.scan.status === "completed") {
      return scanRecord;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return null;
}

async function buildAndLogCompletedPulse(input: {
  detail: "tiny" | "standard" | "full" | "summary" | "evidence";
  format: "json" | "markdown";
  freshness: "latest" | "refresh";
  pulseRequestId: string;
  requestedUrl: string | null;
  resolutionMode: string;
  scanRecord: PublicScanRecord;
  waitSeconds: number;
  requestId: string;
  refresh?: Record<string, unknown> | null;
  requestContext?: Record<string, unknown> | null;
  routeOptions?: PulseRouteOptions;
}) {
  const startedAt = Date.now();
  const pulse = buildPulseProjection({
    detail: input.detail,
    format: input.format,
    freshnessMode: input.freshness,
    pulseRequestId: input.pulseRequestId,
    requestedUrl: input.requestedUrl,
    resolutionMode: input.resolutionMode,
    scanRecord: input.scanRecord,
    waitSeconds: input.waitSeconds
  });
  const pulseRecord = pulse as Record<string, any>;
  if (input.refresh && typeof pulse === "object") {
    pulseRecord.refresh = input.refresh;
  }
  if (input.routeOptions?.gptAction && typeof pulse === "object") {
    pulseRecord.gptAction = {
      channel: "gpt_action",
      detail: input.detail,
      format: input.format,
      freshness: "latest",
      fullDetailAvailableAt: pulseRecord.links?.fullReportUrl ?? pulseAbsoluteUrl(`/scan/${input.scanRecord.scan.id}`)
    };
  }
  await updatePulseRequestCompleted({
    pulseRequestId: input.pulseRequestId,
    scanId: input.scanRecord.scan.id,
    resultPulseUrl: pulseAbsoluteUrl(`/api/v1/pulse?scanId=${input.scanRecord.scan.id}`),
    resultReportUrl: pulseAbsoluteUrl(`/scan/${input.scanRecord.scan.id}`),
    resolutionMode: input.resolutionMode,
    responseSummary: {
      score: pulseRecord.summary?.score ?? null,
      riskLevel: pulseRecord.summary?.riskLevel ?? null,
      topFindingIds: Array.isArray(pulseRecord.topFindings) ? pulseRecord.topFindings.map((finding: any) => finding.id) : [],
      coverageStatus: pulseRecord.coverage?.status ?? null
    }
  }).catch((error) => console.error("[pulse] request completion update failed", error));
  if (input.routeOptions?.gptAction) {
    const topFindingIds = getTopFindingIds(pulseRecord);
    logPulseGptActionEvent("pulse_gpt_action_scan_completed", {
      detail: input.detail,
      elapsedMs: Date.now() - startedAt,
      format: input.format,
      freshness: input.freshness,
      domain: input.scanRecord.scan.domainHostname ?? null,
      requestId: input.requestId,
      route: input.routeOptions.routeName === "pulse-gpt" ? "/api/v1/pulse/gpt" : "/api/v1/pulse",
      scanId: input.scanRecord.scan.id,
      statusCode: 200,
      topFindingIds,
      highPriorityFindingCount: getHighPriorityFindingCount(pulseRecord),
      totalObservationCount: getTotalObservationCount(pulseRecord),
      coverageStatus: pulseRecord.coverage?.status ?? null,
      wait: input.waitSeconds,
      wasCached: input.resolutionMode === "reused_existing_scan" || input.resolutionMode === "returned_stale_while_refreshing"
    });
  }
  return completedResponse(pulse, input.format, input.requestId, {
    ...input.routeOptions,
    normalizedDomain: input.scanRecord.scan.domainHostname ?? null,
    pulseRequestId: input.pulseRequestId,
    requestContext: input.requestContext ?? null,
    resolutionMode: input.resolutionMode,
    scanId: input.scanRecord.scan.id
  });
}

function isGptActionRequest(url: URL, options: PulseRouteOptions) {
  return (
    options.gptAction === true ||
    url.searchParams.get("channel") === "gpt_action" ||
    url.searchParams.get("source") === "gpt_action"
  );
}

function parseGptPulseFormat(url: URL) {
  const value = url.searchParams.get("format");
  return value === "json" ? "json" : "markdown";
}

function parseGptPulseWaitSeconds(url: URL) {
  const value = url.searchParams.get("wait");
  if (!value) {
    return GPT_ACTION_MAX_WAIT_SECONDS;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return GPT_ACTION_MAX_WAIT_SECONDS;
  }
  return Math.max(0, Math.min(GPT_ACTION_MAX_WAIT_SECONDS, parsed));
}

function getRequestedScanFrom(url: URL) {
  return restrictScanFromForUser({
    canUseRestrictedScanOptions: false,
    scanFrom: normalizeScanFrom(url.searchParams.get("scanFrom") ?? url.searchParams.get("geo"))
  }) satisfies ScanFrom;
}

function requiredScopesForPulseRequest(input: { hasUrl: boolean; hasScanId: boolean; hasJobId: boolean }): IntegrationApiKeyScope[] {
  if (input.hasUrl) {
    return ["pulse:scan", "mcp"];
  }
  if (input.hasScanId || input.hasJobId) {
    return ["pulse:read", "mcp"];
  }
  return ["pulse:read", "mcp"];
}

async function checkGptActionLimit(ipHash: string | null) {
  const usage = await getPulseGptActionUsage({ ipHash });
  if (usage.hourlyCount >= GPT_ACTION_HOURLY_LIMIT) {
    return { allowed: false as const, retryAfterSeconds: 3600 };
  }
  if (usage.dailyCount >= GPT_ACTION_DAILY_LIMIT) {
    return { allowed: false as const, retryAfterSeconds: 86400 };
  }
  return { allowed: true as const, retryAfterSeconds: 0 };
}

async function handlePulseGET(request: Request, options: PulseRouteOptions = {}) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const url = new URL(request.url);
  const gptAction = isGptActionRequest(url, options);
  const routeName = options.routeName ?? (gptAction ? "pulse-gpt" : "pulse");
  const format = gptAction ? parseGptPulseFormat(url) : parsePulseFormat(url.searchParams.get("format"));
  const requestedDetail = url.searchParams.get("detail");
  const detail = parsePulseDetail(
    gptAction
      ? (requestedDetail ?? "summary")
      : requestedDetail ?? (format === "markdown" ? "standard" : null)
  );
  const requestedFreshness = parsePulseFreshness(url.searchParams.get("freshness"));
  const freshness = gptAction ? "latest" : requestedFreshness;
  const waitSeconds = gptAction ? parseGptPulseWaitSeconds(url) : parsePulseWaitSeconds(url.searchParams.get("wait"));
  const requester = getPulseRequesterContext(request);
  const forceNewScan = gptAction
    ? false
    : parseForceNewScan(url.searchParams.get("forceNewScan")) || requestedFreshness === "refresh";
  const scanFrom = getRequestedScanFrom(url);
  const scanId = url.searchParams.get("scanId")?.trim() || null;
  const jobId = url.searchParams.get("jobId")?.trim() || null;
  const rawUrl = url.searchParams.get("url")?.trim() || null;
  const bearer = parseBearerToken(request);
  const integrationClient = request.headers.get("x-certscore-client")?.trim().toLowerCase();
  const integrationChannel =
    integrationClient === "sdk"
      ? "sdk"
      : integrationClient === "mcp"
        ? "mcp"
        : integrationClient === "pulse"
          ? "pulse_api"
          : integrationClient
            ? "other_api"
            : null;
  let apiKeyContext: { apiKeyId?: string | null; accountId?: string | null; userId?: string | null; channel?: string; source?: string } = {};
  let apiKeyUsageKey: Pick<IntegrationApiKeyRecord, "organizationId" | "publicId" | "hourlyLimit" | "dailyLimit"> | null = null;
  if (bearer.provided) {
    if (!bearer.token) {
      return pulseJson(
        buildPulseError({ code: "unauthorized", message: "Use Authorization: Bearer <token> for CertScore.ai integration API access.", detail, format }),
        { headers: { "Cache-Control": "no-store" }, status: 401 },
        requestId,
        routeName
      );
    }
    const auth = await validateCertScoreBearerToken(
      bearer.token,
      requiredScopesForPulseRequest({ hasUrl: Boolean(rawUrl), hasScanId: Boolean(scanId), hasJobId: Boolean(jobId) })
    );
    if (!auth.ok) {
      return pulseJson(
        buildPulseError({
          code: auth.reason === "missing_scope" ? "forbidden" : "unauthorized",
          message:
            auth.reason === "missing_scope"
              ? "This CertScore.ai API key does not include the required Pulse scope."
              : "This CertScore.ai API key is invalid, expired, or revoked.",
          detail,
          format
        }),
        { headers: { "Cache-Control": "no-store" }, status: auth.reason === "missing_scope" ? 403 : 401 },
        requestId,
        routeName
      );
    }
    apiKeyUsageKey = auth.key;
    apiKeyContext = {
      accountId: auth.key.organizationId,
      apiKeyId: auth.key.publicId,
      channel: integrationChannel ?? "pulse_api",
      source: integrationChannel ?? "pulse_api",
      userId: auth.key.ownerUserId
    };
  }
  const contextBase = {
    ...requester,
    ...apiKeyContext,
    format,
    detail,
    freshness,
    forceNewScan,
    requestId,
    scanFrom,
    waitSeconds,
    channel: apiKeyContext.channel ?? (gptAction ? "gpt_action" : integrationChannel ?? "pulse_api"),
    source: apiKeyContext.source ?? (gptAction ? "gpt_action" : integrationChannel ?? "pulse_api")
  };
  const startedAt = Date.now();
  let activePulseRequestId: string | null = null;

  try {
    if (gptAction && requestedFreshness === "refresh") {
      logPulseGptActionEvent("pulse_gpt_action_error", {
        detail,
        elapsedMs: Date.now() - startedAt,
        errorCode: "scan_unavailable",
        format,
        requestId,
        route: "/api/v1/pulse/gpt",
        statusCode: 400,
        wait: waitSeconds
      });
      return pulseJson(
        buildPulseError({
          code: "scan_unavailable",
          message: "The public GPT Action uses latest available Pulse results only. Fresh refresh scans require using certscore.ai or a future API-key flow.",
          detail,
          format
        }),
        { headers: { "Cache-Control": "no-store" }, status: 400 },
        requestId,
        routeName
      );
    }

    if (scanId) {
      if (!isCanonicalScanId(scanId)) {
        return pulseJson(buildPulseError({ code: "invalid_url", message: "Invalid scan ID.", detail, format }), { status: 400 }, requestId, routeName);
      }
      const retrievalInput = {
        context: { ...contextBase, mode: "scanId" },
        requestedUrl: null,
        resolutionMode: "reused_existing_scan",
        scanId,
        status: "completed"
      } as const;
      const internalBundleRead = trustedMcpInternalRead(request, { operations: ["scan_bundle"], scanId });
      const reservedRetrieval = internalBundleRead
        ? { allowed: true as const, ...(await createPulseRequest(retrievalInput)) }
        : await createPulseRequestWithRetrievalQuota(retrievalInput);
      if (!reservedRetrieval.allowed) {
        const guidance = apiReadRateLimitGuidance("terminal", reservedRetrieval.retryAfterSeconds);
        logApiReadRateLimited({
          limitUnits: reservedRetrieval.limitUnits,
          policyVersion: reservedRetrieval.policyVersion,
          profile: reservedRetrieval.profile,
          reason: reservedRetrieval.reason,
          requestId,
          requestedUnits: reservedRetrieval.requestedUnits,
          retryAfterSeconds: reservedRetrieval.retryAfterSeconds,
          route: routeName,
          scope: reservedRetrieval.scope,
          surface: "pulse-v1",
          targetType: "scan",
          usedUnits: reservedRetrieval.usedUnits,
          windowId: reservedRetrieval.windowId,
          windowSeconds: reservedRetrieval.windowSeconds
        });
        return pulseJson(
          buildPulseError({
            code: "rate_limited",
            message: guidance.message,
            detail,
            format,
            rateLimit: {
              limitUnits: reservedRetrieval.limitUnits,
              policyVersion: reservedRetrieval.policyVersion,
              profile: reservedRetrieval.profile,
              requestedUnits: reservedRetrieval.requestedUnits,
              scope: reservedRetrieval.scope,
              usedUnits: reservedRetrieval.usedUnits,
              windowId: reservedRetrieval.windowId,
              windowSeconds: reservedRetrieval.windowSeconds
            },
            recommendedNextAction: guidance.recommendedNextAction,
            retryAfterSeconds: reservedRetrieval.retryAfterSeconds
          }),
          {
            headers: {
              "Cache-Control": "no-store",
              "Retry-After": String(reservedRetrieval.retryAfterSeconds)
            },
            status: 429
          },
          requestId,
          routeName
        );
      }
      const { publicId } = reservedRetrieval;
      const scanRecord = await loadPulseScanRecord(scanId);
      if (!scanRecord || scanRecord.scan.status !== "completed") {
        return pulseJson(buildPulseError({ code: "not_found", message: "Scan not found or not eligible for public Pulse.", detail, format }), { status: 404 }, requestId, routeName);
      }
      const quality = assessPulseScanRecordQuality(scanRecord);
      if (!quality.usable) {
        return pulseUnavailableResponse({
          detail,
          format,
          message: quality.message,
          requestId,
          routeName,
          url: scanRecord.scan.domainHostname ? `https://${scanRecord.scan.domainHostname}` : null
        });
      }
      return buildAndLogCompletedPulse({
        detail,
        format,
        freshness,
        pulseRequestId: publicId,
        requestedUrl: scanRecord.scan.domainHostname ? `https://${scanRecord.scan.domainHostname}` : null,
        resolutionMode: "reused_existing_scan",
        scanRecord,
        waitSeconds,
        requestId,
        requestContext: contextBase,
        routeOptions: { gptAction, routeName }
      });
    }

    if (jobId) {
      const pulseRequest = await getPulseRequestByJobId(jobId);
      if (!pulseRequest) {
        return pulseJson(buildPulseError({ code: "not_found", message: "Pulse job not found.", detail, format }), { status: 404 }, requestId, routeName);
      }
      let recoveryContext = pulseRequest.request_context?.recovery && typeof pulseRequest.request_context.recovery === "object"
        ? pulseRequest.request_context.recovery as Record<string, unknown>
        : null;
      let fallbackQueued = false;
      if (pulseRequest.scan_id) {
        const scanRecord = await loadPulseScanRecord(pulseRequest.scan_id);
        if (scanRecord?.scan.status === "completed") {
          const fallback = await queueAlternateRegionRecovery({
            normalizedUrl: pulseRequest.normalized_url ?? pulseRequest.requested_url ?? `https://${pulseRequest.normalized_domain}/`,
            primaryScanRecord: scanRecord,
            provenance: {
              host: typeof pulseRequest.request_context?.host === "string" ? pulseRequest.request_context.host : null,
              originIp: typeof pulseRequest.request_context?.ipHash === "string" ? pulseRequest.request_context.ipHash : null,
              source: typeof pulseRequest.request_context?.source === "string" ? pulseRequest.request_context.source : "pulse_api",
              userAgent: typeof pulseRequest.request_context?.userAgent === "string" ? pulseRequest.request_context.userAgent : null
            },
            pulseRequestId: pulseRequest.public_id,
            requestContext: pulseRequest.request_context
          });
          if (fallback.queued && fallback.scanId && fallback.context) {
            fallbackQueued = true;
            pulseRequest.scan_id = fallback.scanId;
            pulseRequest.result_pulse_url = pulseAbsoluteUrl(`/api/v1/pulse?scanId=${fallback.scanId}`);
            pulseRequest.result_report_url = pulseAbsoluteUrl(`/scan/${fallback.scanId}`);
            pulseRequest.resolution_mode = "alternate_region_fallback_queued";
            pulseRequest.status = "queued";
            pulseRequest.phase = "queued";
            pulseRequest.completed_at = null;
            recoveryContext = fallback.context;
          }
        }
        if (!fallbackQueued && scanRecord?.scan.status === "completed" && assessPulseScanRecordQuality(scanRecord).usable) {
          return buildAndLogCompletedPulse({
            detail,
            format,
            freshness,
            pulseRequestId: pulseRequest.public_id,
            requestedUrl: pulseRequest.requested_url,
            resolutionMode: pulseRequest.resolution_mode === "alternate_region_fallback_queued"
              ? "alternate_region_fallback_completed"
              : pulseRequest.resolution_mode ?? "reused_existing_scan",
            scanRecord,
            waitSeconds,
            requestId,
            requestContext: contextBase,
            routeOptions: { gptAction, routeName }
          });
        }
      }
      const status = buildPulseStatus({
        jobId: pulseRequest.job_id,
        domain: pulseRequest.normalized_domain,
        status: pulseRequest.status,
        phase: pulseRequest.phase,
        createdAt: pulseRequest.created_at,
        completedAt: pulseRequest.completed_at,
        lastUpdatedAt: pulseRequest.updated_at,
        scanId: pulseRequest.scan_id,
        resultUrl: pulseRequest.result_pulse_url,
        reportUrl: pulseRequest.result_report_url,
        retryAfterSeconds: pulseRequest.retry_after_seconds,
        recovery: recoveryContext
      });
      const responseStatus = pulseRequest.status === "completed" ? 200 : pulseRequest.status === "rate_limited" ? 429 : 202;
      return pulseJson(
        status,
        {
          headers:
            responseStatus === 202 || responseStatus === 429
              ? { "Cache-Control": "no-store", "Retry-After": String(retryAfterForStatus(status)) }
              : { "Cache-Control": "no-store" },
          status: responseStatus
        },
        requestId,
        routeName
      );
    }

    if (!rawUrl) {
      if (gptAction) {
        logPulseGptActionEvent("pulse_gpt_action_error", {
          detail,
          elapsedMs: Date.now() - startedAt,
          errorCode: "invalid_url",
          format,
          requestId,
          route: "/api/v1/pulse/gpt",
          statusCode: 400,
          wait: waitSeconds
        });
      }
      return pulseJson(
        buildPulseError({ code: "invalid_url", message: "Provide url, scanId, or jobId.", detail, format }),
        { status: 400 },
        requestId,
        routeName
      );
    }

    const normalized = normalizePulseUrl(rawUrl);
    if (!normalized.ok) {
      if (normalized.reasonCode === "non_public_target") {
        console.warn("[scan-target] rejected", {
          event: "scan_target_rejected",
          policyVersion: PUBLIC_TARGET_POLICY_VERSION,
          reason: normalized.reasonCode,
          stage: "admission"
        });
      }
      if (gptAction) {
        logPulseGptActionEvent("pulse_gpt_action_error", {
          detail,
          elapsedMs: Date.now() - startedAt,
          errorCode: "invalid_url",
          format,
          requestId,
          route: "/api/v1/pulse/gpt",
          statusCode: 400,
          wait: waitSeconds
        });
      }
      return pulseJson(buildPulseError({
        code: "invalid_url",
        reasonCode: normalized.reasonCode,
        message: normalized.message,
        url: normalized.reasonCode === "non_public_target" ? null : rawUrl,
        detail,
        format
      }), { status: 400 }, requestId, routeName);
    }

    const dnsStatus = await checkDomainDns(normalized.normalizedDomain);
    if (!dnsStatus.exists) {
      console.warn("[pulse] target DNS preflight rejected", {
        reasonCode: dnsStatus.reasonCode,
        requestId,
        retryable: dnsStatus.retryable
      });
      if (gptAction) {
        logPulseGptActionEvent("pulse_gpt_action_error", {
          detail,
          elapsedMs: Date.now() - startedAt,
          errorCode: dnsStatus.retryable ? "internal_error" : "invalid_url",
          format,
          requestId,
          route: "/api/v1/pulse/gpt",
          statusCode: dnsStatus.retryable ? 503 : 400,
          wait: waitSeconds
        });
      }
      return pulseJson(
        buildPulseError({
          code: dnsStatus.retryable ? "internal_error" : "invalid_url",
          reasonCode: dnsStatus.reasonCode === "non_public_target" ? "non_public_target" : null,
          message: dnsStatus.reason,
          retryAfterSeconds: dnsStatus.retryable ? 60 : null,
          url: rawUrl,
          detail,
          format
        }),
        dnsStatus.retryable
          ? { headers: { "Cache-Control": "no-store", "Retry-After": "60" }, status: 503 }
          : { headers: { "Cache-Control": "no-store" }, status: 400 },
        requestId,
        routeName
      );
    }

    if (gptAction) {
      logPulseGptActionEvent("pulse_gpt_action_scan_requested", {
        detail,
        format,
        freshness,
        domain: normalized.normalizedDomain,
        requestId,
        route: "/api/v1/pulse/gpt",
        statusCode: null,
        wait: waitSeconds
      });
      const gptLimit = await checkGptActionLimit(requester.ipHash);
      if (!gptLimit.allowed) {
        const { publicId } = await createPulseRequest({
          context: { ...contextBase, mode: "url" },
          normalizedDomain: normalized.normalizedDomain,
          normalizedUrl: normalized.normalizedUrl,
          requestedUrl: rawUrl,
          resolutionMode: "rate_limited",
          status: "rate_limited"
        });
        await updatePulseRequestRateLimited({ pulseRequestId: publicId, retryAfterSeconds: gptLimit.retryAfterSeconds });
        logPulseGptActionEvent("pulse_gpt_action_rate_limited", {
          detail,
          elapsedMs: Date.now() - startedAt,
          format,
          domain: normalized.normalizedDomain,
          requestId,
          retryAfterSeconds: gptLimit.retryAfterSeconds,
          route: "/api/v1/pulse/gpt",
          statusCode: 429,
          wait: waitSeconds
        });
        return pulseJson(
          buildPulseError({
            code: "rate_limited",
            message: "The public GPT Action is receiving too many scan requests from this client. Try again after the retry window.",
            retryAfterSeconds: gptLimit.retryAfterSeconds,
            url: rawUrl,
            detail,
            format
          }),
          { headers: { "Cache-Control": "no-store", "Retry-After": String(gptLimit.retryAfterSeconds) }, status: 429 },
          requestId,
          routeName
        );
      }
    }

    const recentEligibility = forceNewScan
      ? null
      : await getRecentScanReuseEligibility({
          minPagesRequested: PULSE_MIN_REUSABLE_PAGES_REQUESTED,
          normalizedDomain: normalized.normalizedDomain,
          normalizedUrl: normalized.normalizedUrl,
          organizationId: null,
          scanFrom
        });
    const recentScan = recentEligibility?.eligible ? recentEligibility.candidate : null;
    const latestScan =
      recentScan ??
      (await findLatestCompletedAnonymousScanForDomain(normalized.normalizedDomain, {
        minPagesRequested: PULSE_MIN_REUSABLE_PAGES_REQUESTED,
        normalizedUrl: normalized.normalizedUrl,
        scanFrom
      }));
    const latestScanRecord = latestScan ? await loadPulseScanRecord(latestScan.id) : null;
    const latestScanQuality = latestScanRecord ? assessPulseScanRecordQuality(latestScanRecord) : null;
    const recentScanRecord =
      recentScan && latestScanRecord && latestScanQuality?.usable
        ? latestScanRecord
        : null;

    if (recentScanRecord) {
      const { publicId } = await createPulseRequest({
        context: { ...contextBase, mode: "url" },
        normalizedDomain: normalized.normalizedDomain,
        normalizedUrl: normalized.normalizedUrl,
        requestedUrl: rawUrl,
        resolutionMode: "reused_existing_scan",
        scanId: recentScanRecord.scan.id,
        status: "completed"
      });
      return buildAndLogCompletedPulse({
        detail,
        format,
        freshness,
        pulseRequestId: publicId,
        requestedUrl: rawUrl,
        resolutionMode: "reused_existing_scan",
        scanRecord: recentScanRecord,
        waitSeconds,
        requestId,
        requestContext: contextBase,
        routeOptions: { gptAction, routeName }
      });
    }

    const newScanRequestInput = {
      context: { ...contextBase, mode: "url" as const, quotaClass: "scan_create" as const },
      normalizedDomain: normalized.normalizedDomain,
      normalizedUrl: normalized.normalizedUrl,
      requestedUrl: rawUrl,
      resolutionMode: "created_new_scan",
      status: "queued"
    };
    const reservedRequest = apiKeyUsageKey
      ? await createPulseRequestWithApiKeyQuota({ ...newScanRequestInput, key: apiKeyUsageKey })
      : { allowed: true as const, ...(await createPulseRequest(newScanRequestInput)) };
    if (!reservedRequest.allowed) {
        console.warn("[pulse] integration API scan-create quota rejected", {
          apiKeyId: apiKeyUsageKey?.publicId ?? null,
          domain: normalized.normalizedDomain,
          reason: reservedRequest.reason,
          requestId,
          usage: reservedRequest.usage
        });
        return pulseJson(
          buildPulseError({
            code: "rate_limited",
            message: "This CertScore.ai API key has reached its new-scan limit. Recent-result reuse and result retrieval remain available. Try again after the retry window or manage your plan.",
            retryAfterSeconds: reservedRequest.retryAfterSeconds,
            resolution: {
              label: "Manage plan",
              url: "https://certscore.ai/app/modify-plan"
            },
            detail,
            format
          }),
          { headers: { "Cache-Control": "no-store", "Retry-After": String(reservedRequest.retryAfterSeconds) }, status: 429 },
          requestId,
          routeName
        );
    }
    const { publicId, jobId: createdJobId } = reservedRequest;
    activePulseRequestId = publicId;

    const throttle = await claimPulseDomainScanCreation({
      normalizedDomain: normalized.normalizedDomain,
      normalizedUrl: normalized.normalizedUrl,
      pulseRequestId: publicId,
      scanFrom
    });
    if (!throttle.allowed) {
      await updatePulseRequestRateLimited({ pulseRequestId: publicId, retryAfterSeconds: throttle.retryAfterSeconds, scanId: latestScan?.id ?? null });
      if (latestScanRecord && latestScanQuality?.usable) {
        return buildAndLogCompletedPulse({
          detail,
          format,
          freshness,
          pulseRequestId: publicId,
          requestedUrl: rawUrl,
          resolutionMode: "returned_stale_while_refreshing",
          scanRecord: latestScanRecord,
          waitSeconds,
          requestId,
          requestContext: contextBase,
          routeOptions: { gptAction, routeName },
          refresh: {
            requested: freshness === "refresh",
            performed: false,
            reason: "domain_throttle",
            retryAfterSeconds: throttle.retryAfterSeconds
          }
        });
      }
      if (gptAction) {
        logPulseGptActionEvent("pulse_gpt_action_rate_limited", {
          detail,
          domain: normalized.normalizedDomain,
          elapsedMs: Date.now() - startedAt,
          errorCode: "pulse_throttled",
          format,
          requestId,
          retryAfterSeconds: throttle.retryAfterSeconds,
          route: "/api/v1/pulse/gpt",
          statusCode: 429,
          wait: waitSeconds
        });
      }
      return pulseJson(
        buildPulseError({
          code: "pulse_throttled",
          message: "A Pulse scan for this domain was requested recently. Try again in a few minutes or contact support@certscore.ai for help.",
          retryAfterSeconds: throttle.retryAfterSeconds,
          url: rawUrl,
          detail,
          format
        }),
        {
          headers: { "Cache-Control": "no-store", "Retry-After": String(throttle.retryAfterSeconds) },
          status: 429
        },
        requestId,
        routeName
      );
    }

    const queued = await createAnonymousFullScan({
      bypassRecentScanReuse: forceNewScan,
      coveragePlanCode: PULSE_SCAN_COVERAGE_PLAN_CODE,
      countAnonymousQuota: !apiKeyContext.apiKeyId,
      hostname: normalized.normalizedDomain,
      minimumReusablePagesRequested: PULSE_MIN_REUSABLE_PAGES_REQUESTED,
      normalizedUrl: normalized.normalizedUrl,
      provenance: {
        source: gptAction ? "gpt_action" : "pulse_api",
        host: request.headers.get("host"),
        userAgent: requester.userAgent,
        originIp: requester.ipHash
      },
      requesterIpContext: {
        anonymousMcpSurface: requester.anonymousMcpSurface,
        anonymousRequesterNetwork: requester.anonymousRequesterNetwork,
        ipHash: requester.ipHash,
        sourceIp: requester.sourceIp
      },
      localV2DagRunViaLambda: true,
      scanFrom
    });
    if ("reusedExistingScan" in queued && queued.reusedExistingScan) {
      const reusedScanRecord = await loadPulseScanRecord(queued.scan.id);
      if (reusedScanRecord?.scan.status === "completed" && assessPulseScanRecordQuality(reusedScanRecord).usable) {
        return buildAndLogCompletedPulse({
          detail,
          format,
          freshness,
          pulseRequestId: publicId,
          requestedUrl: rawUrl,
          resolutionMode: "reused_existing_scan",
          scanRecord: reusedScanRecord,
          waitSeconds,
          requestId,
          requestContext: contextBase,
          routeOptions: { gptAction, routeName }
        });
      }
      await updatePulseRequestFailed({
        errorCode: "scan_unavailable",
        errorMessage: "The reused scan did not contain enough retained public evidence for a reliable Pulse summary.",
        pulseRequestId: publicId,
        resolutionMode: "reused_scan_unavailable"
      });
      return pulseUnavailableResponse({
        detail,
        format,
        requestId,
        routeName,
        url: rawUrl
      });
    }
    await updatePulseRequestQueued({
      pulseRequestId: publicId,
      scanId: queued.scan.id,
      resultPulseUrl: pulseAbsoluteUrl(`/api/v1/pulse?jobId=${createdJobId}`),
      resultReportUrl: pulseAbsoluteUrl(`/scan/${queued.scan.id}`)
    });
    if (gptAction) {
      logPulseGptActionEvent("pulse_gpt_action_scan_queued", {
        detail,
        elapsedMs: Date.now() - startedAt,
        format,
        domain: normalized.normalizedDomain,
        jobId: createdJobId,
        requestId,
        route: "/api/v1/pulse/gpt",
        scanId: queued.scan.id,
        statusCode: 202,
        wait: waitSeconds
      });
    }

    if (waitSeconds > 0) {
      const completed = await waitForCompletedScan(queued.scan.id, waitSeconds);
      if (completed) {
        const fallback = await queueAlternateRegionRecovery({
          normalizedUrl: normalized.normalizedUrl,
          primaryScanRecord: completed,
          provenance: {
            host: request.headers.get("host"),
            originIp: requester.ipHash,
            source: gptAction ? "gpt_action" : "pulse_api",
            userAgent: requester.userAgent
          },
          pulseRequestId: publicId,
          requestContext: contextBase
        });
        if (fallback.queued && fallback.scanId && fallback.context) {
          const fallbackStatus = buildPulseStatus({
            jobId: createdJobId,
            domain: normalized.normalizedDomain,
            status: "queued",
            phase: "queued",
            createdAt: new Date().toISOString(),
            scanId: fallback.scanId,
            resultUrl: pulseAbsoluteUrl(`/api/v1/pulse?jobId=${createdJobId}`),
            reportUrl: pulseAbsoluteUrl(`/scan/${fallback.scanId}`),
            recovery: fallback.context
          });
          return pulseJson(
            {
              ...fallbackStatus,
              statusUrl: pulseAbsoluteUrl(`/api/v1/pulse/status/${createdJobId}`),
              nextCheckUrl: pulseAbsoluteUrl(`/api/v1/pulse?jobId=${createdJobId}`)
            },
            { headers: { "Cache-Control": "no-store", "Retry-After": String(retryAfterForStatus(fallbackStatus)) }, status: 202 },
            requestId,
            routeName
          );
        }
        return buildAndLogCompletedPulse({
          detail,
          format,
          freshness,
          pulseRequestId: publicId,
          requestedUrl: rawUrl,
          resolutionMode: "queued_new_scan",
          scanRecord: completed,
          waitSeconds,
          requestId,
          requestContext: contextBase,
          routeOptions: { gptAction, routeName }
        });
      }
    }

    const status = buildPulseStatus({
      jobId: createdJobId,
      domain: normalized.normalizedDomain,
      status: "queued",
      phase: "queued",
      createdAt: new Date().toISOString(),
      scanId: queued.scan.id,
      resultUrl: pulseAbsoluteUrl(`/api/v1/pulse?jobId=${createdJobId}`),
      reportUrl: pulseAbsoluteUrl(`/scan/${queued.scan.id}`)
    });
    return pulseJson(
      {
        ...status,
        statusUrl: pulseAbsoluteUrl(`/api/v1/pulse/status/${createdJobId}`),
        nextCheckUrl: pulseAbsoluteUrl(`/api/v1/pulse?jobId=${createdJobId}`),
        lastKnownPulse: latestScanRecord && latestScanQuality?.usable ? pulseAbsoluteUrl(`/api/v1/pulse?scanId=${latestScanRecord.scan.id}`) : null
      },
      { headers: { "Cache-Control": "no-store", "Retry-After": String(retryAfterForStatus(status)) }, status: 202 },
      requestId,
      routeName
    );
  } catch (error) {
    if (isDomainDnsPreflightError(error)) {
      if (activePulseRequestId) {
        await updatePulseRequestFailed({
          errorCode: error.code,
          errorMessage: error.message,
          pulseRequestId: activePulseRequestId,
          resolutionMode: "dns_preflight_rejected"
        }).catch((updateError) => console.error("[pulse] DNS failure lifecycle update failed", { requestId, updateError }));
      }
      return pulseJson(
        buildPulseError({
          code: error.retryable ? "internal_error" : "invalid_url",
          message: error.message,
          retryAfterSeconds: error.retryAfterSeconds,
          url: rawUrl,
          detail,
          format
        }),
        {
          headers: {
            "Cache-Control": "no-store",
            ...(error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : {})
          },
          status: error.retryable ? 503 : 400
        },
        requestId,
        routeName
      );
    }
    if (isAnonymousScanQuotaError(error)) {
      if (activePulseRequestId) {
        await updatePulseRequestRateLimited({
          pulseRequestId: activePulseRequestId,
          retryAfterSeconds: error.retryAfterSeconds,
          throttleReason: "anonymous_daily_scan_limit"
        }).catch((updateError) => console.error("[pulse] anonymous quota lifecycle update failed", { requestId, updateError }));
      }
      return pulseJson(
        buildPulseError({
          code: "rate_limited",
          creationRateLimit: {
            kind: error.window === "concurrent" ? "concurrency" : "new_scan",
            limit: error.limit,
            remaining: 0,
            scope: error.scope,
            used: error.used ?? error.limit,
            windowId: error.window,
            windowSeconds: error.windowSeconds
          },
          message: error.message,
          recommendedNextAction: error.recommendedNextAction,
          retryAfterSeconds: error.retryAfterSeconds,
          url: rawUrl,
          detail,
          format
        }),
        {
          headers: {
            "Cache-Control": "no-store",
            "X-CertScore-RateLimit-Limit": String(error.limit),
            "X-CertScore-RateLimit-Scope": error.scope,
            "X-CertScore-RateLimit-Window": error.window,
            "Retry-After": String(error.retryAfterSeconds)
          },
          status: 429
        },
        requestId,
        routeName
      );
    }

    console.error("[pulse] request failed", { requestId, error });
    if (activePulseRequestId) {
      await updatePulseRequestFailed({
        errorCode: "scan_creation_failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        pulseRequestId: activePulseRequestId
      }).catch((updateError) => console.error("[pulse] failure lifecycle update failed", { requestId, updateError }));
    }
    if (gptAction) {
      logPulseGptActionEvent("pulse_gpt_action_error", {
        detail,
        elapsedMs: Date.now() - startedAt,
        format,
        errorCode: "internal_error",
        requestId,
        route: "/api/v1/pulse/gpt",
        statusCode: 503,
        wait: waitSeconds
      });
    }
    return pulseJson(
      buildPulseError({
        code: "internal_error",
        message: "Pulse is temporarily unavailable. Try again later.",
        url: rawUrl,
        detail,
        format
      }),
      { headers: { "Cache-Control": "no-store", "Retry-After": "60" }, status: 503 },
      requestId,
      routeName
    );
  }
}

export async function GET(request: Request) {
  return handlePulseGET(request);
}

export function OPTIONS(request: Request) {
  return pulseOptionsResponse(request);
}
