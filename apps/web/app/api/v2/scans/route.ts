import { apiV2CreateScanRequestSchema, pulseResponseSchema, pulseStatusSchema } from "@certscore/api-contracts";
import { GET as pulseGET } from "../../v1/pulse/route";
import {
  apiV2JsonResponse,
  buildApiV2Error,
  buildApiV2ErrorFromPulse,
  buildApiV2ScanJobFromPulseStatus,
  buildApiV2ScanResource,
  buildApiV2ScanStatus
} from "../../../../lib/api-v2/scan-resource";
import { getPublicScanRecord } from "../../../../server/scans/get-public-scan-record";
import { getPulseRequesterContext } from "../../../../lib/pulse/request";
import { getAnonymousScanDailyQuotaState } from "../../../../server/pulse/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

function pulseRequestFromV2(request: Request, body: { url: string; freshness?: "latest" | "refresh"; scanFrom?: "eu_de" | "eu_ie" | "california" }) {
  const sourceUrl = new URL(request.url);
  const pulseUrl = new URL("/api/v1/pulse", sourceUrl.origin);
  pulseUrl.searchParams.set("url", body.url);
  pulseUrl.searchParams.set("format", "json");
  pulseUrl.searchParams.set("detail", "standard");
  pulseUrl.searchParams.set("wait", "0");
  pulseUrl.searchParams.set("freshness", body.freshness ?? "latest");
  pulseUrl.searchParams.set("scanFrom", body.scanFrom ?? "eu_ie");

  const headers = new Headers(request.headers);
  headers.set("Accept", "application/json");
  headers.set("X-CertScore.ai-API-V2-Wrapper", "true");

  return new Request(pulseUrl, {
    headers,
    method: "GET"
  });
}

async function parseJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function pulseResolutionMode(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const request = (value as { request?: unknown }).request;
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return null;
  }
  return typeof (request as { resolutionMode?: unknown }).resolutionMode === "string"
    ? (request as { resolutionMode: string }).resolutionMode
    : null;
}

function scanAgeSeconds(completedAt: string | null | undefined) {
  const completedAtMs = Date.parse(completedAt ?? "");
  return Number.isFinite(completedAtMs) ? Math.max(0, Math.round((Date.now() - completedAtMs) / 1000)) : null;
}

function freshnessMetadata(input: {
  anonymousQuota: { limit: number; remaining: number; resetAt: string } | null;
  completedAt?: string | null;
  freshness: "latest" | "refresh";
  resolutionMode: string | null;
  terminal: boolean;
}) {
  const reused = input.resolutionMode === "reused_existing_scan" || input.resolutionMode === "returned_stale_while_refreshing";
  return {
    executionMode: reused ? "reused_scan" : "new_scan",
    reused,
    reusedScanAgeSeconds: reused ? scanAgeSeconds(input.completedAt) : null,
    freshnessDecision: reused
      ? input.resolutionMode
      : input.freshness === "refresh"
        ? "refresh_requested_new_scan"
        : input.terminal
          ? "new_scan_completed"
          : "no_eligible_recent_scan_queued",
    quotaConsumed: Boolean(input.anonymousQuota) && !reused,
    anonymousQuotaLimit: input.anonymousQuota?.limit ?? null,
    anonymousQuotaRemaining: input.anonymousQuota?.remaining ?? null,
    anonymousQuotaResetAt: input.anonymousQuota?.resetAt ?? null,
    upgradeSupportEmail: input.anonymousQuota ? "support@certscore.ai" : null,
    upgradeMessage: input.anonymousQuota
      ? "For a higher-volume allowance, contact support@certscore.ai."
      : null,
    recommendedNextTool: input.terminal ? "get_scan_bundle" : "get_scan_status"
  };
}

export async function POST(request: Request) {
  const id = requestId(request);
  const parsed = apiV2CreateScanRequestSchema.safeParse(await parseJson(request));

  if (!parsed.success) {
    return apiV2JsonResponse({
      body: buildApiV2Error({ code: "invalid_request", message: "Invalid API v2 scan creation request." }),
      requestId: id,
      route: "api-v2-create-scan",
      status: 400
    });
  }

  try {
    const anonymousRequester = request.headers.get("authorization") ? null : getPulseRequesterContext(request);
    const pulseResponse = await pulseGET(pulseRequestFromV2(request, parsed.data));
    const retryAfter = pulseResponse.headers.get("Retry-After") ?? undefined;
    const pulseBody = await pulseResponse.json().catch(() => null);
    const anonymousQuota = anonymousRequester
      ? await getAnonymousScanDailyQuotaState({ ipHash: anonymousRequester.ipHash })
      : null;

    if (pulseResponse.status === 200) {
      const pulse = pulseResponseSchema.parse(pulseBody);
      const scanId = pulse.scanId ?? pulse.scan_id ?? null;
      const scanRecord = scanId ? await getPublicScanRecord(scanId, { logPrefix: "[api-v2-create-scan]" }) : null;
      if (!scanRecord || scanRecord.scan.status !== "completed") {
        return apiV2JsonResponse({
          body: buildApiV2Error({ code: "scan_unavailable", message: "Pulse returned a completed result without an eligible public scan resource." }),
          requestId: id,
          route: "api-v2-create-scan",
          status: 500
        });
      }
      const canonicalStatus = buildApiV2ScanStatus(scanRecord);
      if (canonicalStatus.status === "finalizing") {
        const scanRetryAfter = canonicalStatus.retryAfterSeconds === null || canonicalStatus.retryAfterSeconds === undefined
          ? undefined
          : String(canonicalStatus.retryAfterSeconds);
        return apiV2JsonResponse({
          body: {
            ...canonicalStatus,
            ...freshnessMetadata({
              anonymousQuota,
              completedAt: scanRecord.scan.completedAt,
              freshness: parsed.data.freshness ?? "latest",
              resolutionMode: pulseResolutionMode(pulseBody),
              terminal: false
            })
          },
          headers: scanRetryAfter ? { "Retry-After": scanRetryAfter } : undefined,
          requestId: id,
          route: "api-v2-create-scan",
          status: 202
        });
      }
      if (canonicalStatus.status === "failed") {
        return apiV2JsonResponse({
          body: {
            ...canonicalStatus,
            ...freshnessMetadata({
              anonymousQuota,
              completedAt: scanRecord.scan.completedAt,
              freshness: parsed.data.freshness ?? "latest",
              resolutionMode: pulseResolutionMode(pulseBody),
              terminal: false
            }),
            recommendedNextTool: undefined
          },
          requestId: id,
          route: "api-v2-create-scan",
          status: 200
        });
      }
      const scan = buildApiV2ScanResource(scanRecord, { requestedUrl: parsed.data.url });
      const resolutionMode = pulseResolutionMode(pulseBody);
      return apiV2JsonResponse({
        body: {
          ...scan,
          ...freshnessMetadata({
            anonymousQuota,
            completedAt: scan.completedAt,
            freshness: parsed.data.freshness ?? "latest",
            resolutionMode,
            terminal: true
          })
        },
        requestId: id,
        route: "api-v2-create-scan",
        status: 200
      });
    }

    if (pulseResponse.status === 202) {
      const scanJob = buildApiV2ScanJobFromPulseStatus(
        pulseStatusSchema.parse(pulseBody),
        { requestedUrl: parsed.data.url }
      );
      const scanRetryAfter = scanJob.retryAfterSeconds === null || scanJob.retryAfterSeconds === undefined
        ? undefined
        : String(scanJob.retryAfterSeconds);
      return apiV2JsonResponse({
        body: {
          ...scanJob,
          ...freshnessMetadata({
            anonymousQuota,
            freshness: parsed.data.freshness ?? "latest",
            resolutionMode: "queued_new_scan",
            terminal: false
          })
        },
        headers: scanRetryAfter ? { "Retry-After": scanRetryAfter } : undefined,
        requestId: id,
        route: "api-v2-create-scan",
        status: 202
      });
    }

    return apiV2JsonResponse({
      body: {
        ...buildApiV2ErrorFromPulse({
          body: pulseBody ?? {},
          fallbackMessage: "CertScore.ai API v2 scan creation failed.",
          status: pulseResponse.status
        }),
        reused: false,
        reusedScanAgeSeconds: null,
        freshnessDecision: "request_rejected",
        quotaConsumed: false,
        anonymousQuotaLimit: anonymousQuota?.limit ?? null,
        anonymousQuotaRemaining: anonymousQuota?.remaining ?? null,
        anonymousQuotaResetAt: anonymousQuota?.resetAt ?? null,
        upgradeSupportEmail: anonymousQuota ? "support@certscore.ai" : null,
        upgradeMessage: anonymousQuota ? "For a higher-volume allowance, contact support@certscore.ai." : null
      },
      headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
      requestId: id,
      route: "api-v2-create-scan",
      status: pulseResponse.status === 503 ? 500 : pulseResponse.status
    });
  } catch (error) {
    console.error("[api-v2-create-scan] request failed", { requestId: id, error });
    return apiV2JsonResponse({
      body: buildApiV2Error({ code: "internal_error", message: "CertScore.ai API v2 is temporarily unavailable. Try again later." }),
      requestId: id,
      route: "api-v2-create-scan",
      status: 500
    });
  }
}
