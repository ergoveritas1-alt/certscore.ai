import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { normalizeScanFrom, type ScanFrom } from "@website-signal-risk-scanner/shared";
import { restrictScanFromForUser } from "../../../../server/scans/restricted-scan-options";
import { absoluteUrl } from "../../../../lib/seo";
import { applyPulseCors, pulseOptionsResponse } from "../../../../lib/pulse/cors";
import { buildPulseError } from "../../../../lib/pulse/error";
import {
  getHighPriorityFindingCount,
  getTopFindingIds,
  getTotalObservationCount,
  logPulseGptActionEvent
} from "../../../../lib/pulse/gpt-action-analytics";
import { renderPulseMarkdown } from "../../../../lib/pulse/markdown";
import { buildPulseProjection } from "../../../../lib/pulse/projection";
import {
  getPulseRequesterContext,
  normalizePulseUrl,
  parsePulseDetail,
  parsePulseFormat,
  parsePulseFreshness,
  parsePulseWaitSeconds
} from "../../../../lib/pulse/request";
import { buildPulseStatus } from "../../../../lib/pulse/status";
import {
  checkIntegrationApiKeyUsageLimit,
  parseBearerToken,
  validateIntegrationApiKey,
  type IntegrationApiKeyScope
} from "../../../../server/integrations/api-keys";
import { checkDomainDns } from "../../../../server/domains/domain-dns";
import { createAnonymousFullScan } from "../../../../server/scans/create-anonymous-full-scan";
import { getAnonymousScanById } from "../../../../server/scans/get-scan-by-id";
import { RECENT_SCAN_REUSE_WINDOW_HOURS } from "../../../../server/scans/recent-scan-reuse";
import {
  claimPulseDomainScanCreation,
  createPulseRequest,
  findLatestCompletedAnonymousScanForDomain,
  getPulseGptActionUsage,
  getPulseRequestByJobId,
  updatePulseRequestCompleted,
  updatePulseRequestQueued,
  updatePulseRequestRateLimited
} from "../../../../server/pulse/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SCAN_ID_PATTERN = /^[0-9a-f-]{32,36}$/i;
const GPT_ACTION_HOURLY_LIMIT = 5;
const GPT_ACTION_DAILY_LIMIT = 20;
const GPT_ACTION_MAX_WAIT_SECONDS = 35;

type PulseRouteOptions = {
  gptAction?: boolean;
  routeName?: string;
};

function etagFor(scanId: string, detail: string, format: string) {
  return `"pulse-v1-scan-${scanId}-${detail}-${format}"`;
}

function diagnosticHeaders(route: string, requestId: string, headers?: HeadersInit) {
  const nextHeaders = new Headers(headers);
  nextHeaders.set("X-CertScore-Pulse", "v1");
  nextHeaders.set("X-CertScore-Route", route);
  nextHeaders.set("X-CertScore-Request-Id", requestId);
  return applyPulseCors(nextHeaders);
}

function completedResponse(pulse: any, format: "json" | "markdown", requestId: string, options: PulseRouteOptions = {}) {
  const scanId = pulse.scan?.scanId ?? pulse.links?.scanJsonUrl?.split("scanId=")[1] ?? "unknown";
  if (format === "markdown") {
    return new NextResponse(renderPulseMarkdown(pulse, { gptAction: options.gptAction }), {
      headers: diagnosticHeaders(options.routeName ?? "pulse", requestId, {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        "Content-Type": "text/markdown; charset=utf-8",
        ETag: etagFor(scanId, pulse.meta.detail, "md")
      })
    });
  }
  return NextResponse.json(pulse, {
    headers: diagnosticHeaders(options.routeName ?? "pulse", requestId, {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Type": "application/json; charset=utf-8",
      ETag: etagFor(scanId, pulse.meta.detail, "json")
    })
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

async function waitForCompletedScan(scanId: string, waitSeconds: number) {
  const deadline = Date.now() + waitSeconds * 1000;
  while (Date.now() < deadline) {
    const scanRecord = await getAnonymousScanById(scanId).catch(() => null);
    if (scanRecord?.scan.status === "completed") {
      return scanRecord;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return null;
}

async function buildAndLogCompletedPulse(input: {
  detail: "tiny" | "standard" | "full";
  format: "json" | "markdown";
  freshness: "latest" | "refresh";
  pulseRequestId: string;
  requestedUrl: string | null;
  resolutionMode: string;
  scanRecord: NonNullable<Awaited<ReturnType<typeof getAnonymousScanById>>>;
  waitSeconds: number;
  requestId: string;
  refresh?: Record<string, unknown> | null;
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
  if (input.refresh && typeof pulse === "object") {
    (pulse as Record<string, unknown>).refresh = input.refresh;
  }
  if (input.routeOptions?.gptAction && typeof pulse === "object") {
    (pulse as Record<string, unknown>).gptAction = {
      channel: "gpt_action",
      detail: input.detail,
      format: input.format,
      freshness: "latest",
      fullDetailAvailableAt: pulse.links?.fullReportUrl ?? absoluteUrl(`/scan/${input.scanRecord.scan.id}`)
    };
  }
  await updatePulseRequestCompleted({
    pulseRequestId: input.pulseRequestId,
    scanId: input.scanRecord.scan.id,
    resultPulseUrl: absoluteUrl(`/api/v1/pulse?scanId=${input.scanRecord.scan.id}`),
    resultReportUrl: absoluteUrl(`/scan/${input.scanRecord.scan.id}`),
    resolutionMode: input.resolutionMode,
    responseSummary: {
      score: pulse.summary?.score ?? null,
      riskLevel: pulse.summary?.riskLevel ?? null,
      topFindingIds: Array.isArray(pulse.topFindings) ? pulse.topFindings.map((finding: any) => finding.id) : [],
      coverageStatus: pulse.coverage?.status ?? null
    }
  }).catch((error) => console.error("[pulse] request completion update failed", error));
  if (input.routeOptions?.gptAction) {
    const topFindingIds = getTopFindingIds(pulse);
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
      highPriorityFindingCount: getHighPriorityFindingCount(pulse),
      totalObservationCount: getTotalObservationCount(pulse),
      coverageStatus: pulse.coverage?.status ?? null,
      wait: input.waitSeconds,
      wasCached: input.resolutionMode === "reused_existing_scan" || input.resolutionMode === "returned_stale_while_refreshing"
    });
  }
  return completedResponse(pulse, input.format, input.requestId, input.routeOptions);
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
  const detail = parsePulseDetail(url.searchParams.get("detail"));
  const requestedFreshness = parsePulseFreshness(url.searchParams.get("freshness"));
  const freshness = gptAction ? "latest" : requestedFreshness;
  const waitSeconds = gptAction ? parseGptPulseWaitSeconds(url) : parsePulseWaitSeconds(url.searchParams.get("wait"));
  const requester = getPulseRequesterContext(request);
  const forceNewScan = gptAction ? false : parseForceNewScan(url.searchParams.get("forceNewScan"));
  const scanFrom = getRequestedScanFrom(url);
  const scanId = url.searchParams.get("scanId")?.trim() || null;
  const jobId = url.searchParams.get("jobId")?.trim() || null;
  const rawUrl = url.searchParams.get("url")?.trim() || null;
  const bearer = parseBearerToken(request);
  let apiKeyContext: { apiKeyId?: string | null; accountId?: string | null; userId?: string | null; channel?: string; source?: string } = {};
  if (bearer.provided) {
    if (!bearer.token) {
      return pulseJson(
        buildPulseError({ code: "unauthorized", message: "Use Authorization: Bearer <token> for CertScore integration API access.", detail, format }),
        { headers: { "Cache-Control": "no-store" }, status: 401 },
        requestId,
        routeName
      );
    }
    const auth = await validateIntegrationApiKey(
      bearer.token,
      requiredScopesForPulseRequest({ hasUrl: Boolean(rawUrl), hasScanId: Boolean(scanId), hasJobId: Boolean(jobId) })
    );
    if (!auth.ok) {
      return pulseJson(
        buildPulseError({
          code: auth.reason === "missing_scope" ? "forbidden" : "unauthorized",
          message:
            auth.reason === "missing_scope"
              ? "This CertScore API key does not include the required Pulse scope."
              : "This CertScore API key is invalid, expired, or revoked.",
          detail,
          format
        }),
        { headers: { "Cache-Control": "no-store" }, status: auth.reason === "missing_scope" ? 403 : 401 },
        requestId,
        routeName
      );
    }
    const usageLimit = await checkIntegrationApiKeyUsageLimit({ key: auth.key });
    if (!usageLimit.allowed) {
      return pulseJson(
        buildPulseError({
          code: "rate_limited",
          message: "This CertScore API key has reached its Pulse request limit. Try again after the retry window or manage your plan.",
          retryAfterSeconds: usageLimit.retryAfterSeconds,
          resolution: {
            label: "Manage plan",
            url: "https://certscore.ai/app/modify-plan"
          },
          detail,
          format
        }),
        { headers: { "Cache-Control": "no-store", "Retry-After": String(usageLimit.retryAfterSeconds) }, status: 429 },
        requestId,
        routeName
      );
    }
    apiKeyContext = {
      accountId: auth.key.organizationId,
      apiKeyId: auth.key.publicId,
      channel: "mcp",
      source: "mcp",
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
    scanFrom,
    waitSeconds,
    channel: apiKeyContext.channel ?? (gptAction ? "gpt_action" : "pulse_api"),
    source: apiKeyContext.source ?? (gptAction ? "gpt_action" : "pulse_api")
  };
  const startedAt = Date.now();

  try {
    if (gptAction && detail === "full") {
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
          message: "Full evidence detail is not available through the public GPT Action. Open the CertScore report or use the standard Pulse API for public-safe full detail.",
          detail: "standard",
          format
        }),
        { headers: { "Cache-Control": "no-store" }, status: 400 },
        requestId,
        routeName
      );
    }
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
      if (!SCAN_ID_PATTERN.test(scanId)) {
        return pulseJson(buildPulseError({ code: "invalid_url", message: "Invalid scan ID.", detail, format }), { status: 400 }, requestId, routeName);
      }
      const { publicId } = await createPulseRequest({
        context: { ...contextBase, mode: "scanId" },
        requestChannel: gptAction ? "gpt_action" : "pulse_api",
        requestedUrl: null,
        resolutionMode: "reused_existing_scan",
        scanId,
        status: "completed"
      });
      const scanRecord = await getAnonymousScanById(scanId);
      if (!scanRecord || scanRecord.scan.status !== "completed") {
        return pulseJson(buildPulseError({ code: "not_found", message: "Scan not found or not eligible for public Pulse.", detail, format }), { status: 404 }, requestId, routeName);
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
        routeOptions: { gptAction, routeName }
      });
    }

    if (jobId) {
      const pulseRequest = await getPulseRequestByJobId(jobId);
      if (!pulseRequest) {
        return pulseJson(buildPulseError({ code: "not_found", message: "Pulse job not found.", detail, format }), { status: 404 }, requestId, routeName);
      }
      if (pulseRequest.scan_id) {
        const scanRecord = await getAnonymousScanById(pulseRequest.scan_id).catch(() => null);
        if (scanRecord?.scan.status === "completed") {
          return buildAndLogCompletedPulse({
            detail,
            format,
            freshness,
            pulseRequestId: pulseRequest.public_id,
            requestedUrl: pulseRequest.requested_url,
            resolutionMode: pulseRequest.resolution_mode ?? "reused_existing_scan",
            scanRecord,
            waitSeconds,
            requestId,
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
        retryAfterSeconds: pulseRequest.retry_after_seconds
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
      return pulseJson(buildPulseError({ code: "invalid_url", message: normalized.message, url: rawUrl, detail, format }), { status: 400 }, requestId, routeName);
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
          requestChannel: "gpt_action",
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

    const { publicId, jobId: createdJobId } = await createPulseRequest({
      context: { ...contextBase, mode: "url" },
      normalizedDomain: normalized.normalizedDomain,
      normalizedUrl: normalized.normalizedUrl,
      requestChannel: gptAction ? "gpt_action" : "pulse_api",
      requestedUrl: rawUrl,
      resolutionMode: "created_new_scan",
      status: "queued"
    });
    const recentScan = forceNewScan
      ? null
      : await findLatestCompletedAnonymousScanForDomain(normalized.normalizedDomain, { maxAgeHours: RECENT_SCAN_REUSE_WINDOW_HOURS, scanFrom });
    const latestScan = recentScan ?? (await findLatestCompletedAnonymousScanForDomain(normalized.normalizedDomain, { scanFrom }));
    const latestScanRecord = latestScan ? await getAnonymousScanById(latestScan.id).catch(() => null) : null;
    const recentScanRecord = recentScan ? latestScanRecord : null;

    if (recentScanRecord) {
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
        routeOptions: { gptAction, routeName }
      });
    }

    const throttle = await claimPulseDomainScanCreation({
      normalizedDomain: normalized.normalizedDomain,
      pulseRequestId: publicId
    });
    if (!throttle.allowed) {
      await updatePulseRequestRateLimited({ pulseRequestId: publicId, retryAfterSeconds: throttle.retryAfterSeconds, scanId: latestScan?.id ?? null });
      if (latestScanRecord) {
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

    const dnsStatus = await checkDomainDns(normalized.normalizedDomain);
    if (!dnsStatus.exists) {
      if (gptAction) {
        logPulseGptActionEvent("pulse_gpt_action_error", {
          detail,
          domain: normalized.normalizedDomain,
          elapsedMs: Date.now() - startedAt,
          errorCode: "invalid_url",
          format,
          requestId,
          route: "/api/v1/pulse/gpt",
          statusCode: 400,
          wait: waitSeconds
        });
      }
      return pulseJson(buildPulseError({ code: "invalid_url", message: dnsStatus.reason, url: rawUrl, detail, format }), { status: 400 }, requestId, routeName);
    }

    const queued = await createAnonymousFullScan({
      bypassRecentScanReuse: forceNewScan,
      hostname: normalized.normalizedDomain,
      normalizedUrl: normalized.normalizedUrl,
      provenance: {
        source: gptAction ? "gpt_action" : "pulse_api",
        host: request.headers.get("host"),
        userAgent: requester.userAgent,
        originIp: requester.ipHash
      },
      localV2DagRunViaLambda: true,
      scanFrom
    });
    if ("reusedExistingScan" in queued && queued.reusedExistingScan) {
      const reusedScanRecord = await getAnonymousScanById(queued.scan.id).catch(() => null);
      if (reusedScanRecord?.scan.status === "completed") {
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
          routeOptions: { gptAction, routeName }
        });
      }
    }
    await updatePulseRequestQueued({
      pulseRequestId: publicId,
      scanId: queued.scan.id,
      resultPulseUrl: absoluteUrl(`/api/v1/pulse?scanId=${queued.scan.id}`),
      resultReportUrl: absoluteUrl(`/scan/${queued.scan.id}`)
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
      resultUrl: absoluteUrl(`/api/v1/pulse?scanId=${queued.scan.id}`),
      reportUrl: absoluteUrl(`/scan/${queued.scan.id}`)
    });
    return pulseJson(
      {
        ...status,
        statusUrl: absoluteUrl(`/api/v1/pulse/status/${createdJobId}`),
        nextCheckUrl: absoluteUrl(`/api/v1/pulse?jobId=${createdJobId}`),
        lastKnownPulse: latestScanRecord ? absoluteUrl(`/api/v1/pulse?scanId=${latestScanRecord.scan.id}`) : null
      },
      { headers: { "Cache-Control": "no-store", "Retry-After": String(retryAfterForStatus(status)) }, status: 202 },
      requestId,
      routeName
    );
  } catch (error) {
    console.error("[pulse] request failed", { requestId, error });
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
