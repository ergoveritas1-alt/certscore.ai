import { randomUUID } from "node:crypto";
import { buildPulseError } from "../../../../../../lib/pulse/error";
import { logPulseGptActionEvent } from "../../../../../../lib/pulse/gpt-action-analytics";
import { buildPulseStatus } from "../../../../../../lib/pulse/status";
import { getAnonymousScanById } from "../../../../../../server/scans/get-scan-by-id";
import { getPulseRequestByJobId } from "../../../../../../server/pulse/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

function diagnosticHeaders(requestId: string, headers?: HeadersInit) {
  const nextHeaders = new Headers(headers);
  nextHeaders.set("X-CertScore-Pulse", "v1");
  nextHeaders.set("X-CertScore-Route", "pulse-status");
  nextHeaders.set("X-CertScore-Request-Id", requestId);
  return nextHeaders;
}

function pulseJson(body: unknown, init: ResponseInit | undefined, requestId: string) {
  const headers = diagnosticHeaders(requestId, init?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), {
    ...init,
    headers
  });
}

export async function GET(request: Request, context: RouteContext) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const startedAt = Date.now();
  const url = new URL(request.url);
  const explicitGptAction = url.searchParams.get("channel") === "gpt_action" || url.searchParams.get("source") === "gpt_action";
  try {
    const { jobId } = await context.params;
    if (!jobId || jobId.length > 160) {
      if (explicitGptAction) {
        logPulseGptActionEvent("pulse_gpt_action_status_checked", {
          elapsedMs: Date.now() - startedAt,
          errorCode: "not_found",
          jobId,
          requestId,
          route: "/api/v1/pulse/status/{jobId}",
          statusCode: 404
        });
      }
      return pulseJson(buildPulseError({ code: "not_found", message: "Pulse job not found." }), { status: 404 }, requestId);
    }

    const pulseRequest = await getPulseRequestByJobId(jobId);

    if (!pulseRequest) {
      if (explicitGptAction) {
        logPulseGptActionEvent("pulse_gpt_action_status_checked", {
          elapsedMs: Date.now() - startedAt,
          errorCode: "not_found",
          jobId,
          requestId,
          route: "/api/v1/pulse/status/{jobId}",
          statusCode: 404
        });
      }
      return pulseJson(buildPulseError({ code: "not_found", message: "Pulse job not found." }), { status: 404 }, requestId);
    }

    const gptAction = explicitGptAction || pulseRequest.request_channel === "gpt_action";

    let status = pulseRequest.status;
    let completedAt = pulseRequest.completed_at;
    if (pulseRequest.scan_id) {
      const scanRecord = await getAnonymousScanById(pulseRequest.scan_id).catch(() => null);
      if (scanRecord?.scan.status === "completed") {
        status = scanRecord.accessPostureSummary.interruptionReason || scanRecord.scan.pagesScanned < scanRecord.scan.pagesRequested
          ? "completed_limited"
          : "completed";
        completedAt = scanRecord.scan.completedAt;
      } else if (scanRecord?.scan.status === "running") {
        status = "running";
      } else if (scanRecord?.scan.status === "failed") {
        status = "failed";
      }
    }

    const body = buildPulseStatus({
      jobId: pulseRequest.job_id,
      domain: pulseRequest.normalized_domain,
      status,
      phase: pulseRequest.phase,
      createdAt: pulseRequest.created_at,
      completedAt,
      lastUpdatedAt: pulseRequest.updated_at,
      scanId: pulseRequest.scan_id,
      resultUrl: pulseRequest.result_pulse_url,
      reportUrl: pulseRequest.result_report_url,
      retryAfterSeconds: pulseRequest.retry_after_seconds
    });

    const headers: Record<string, string> = {
      "Cache-Control": "no-store"
    };
    if (status === "rate_limited" && pulseRequest.retry_after_seconds) {
      headers["Retry-After"] = String(pulseRequest.retry_after_seconds);
    } else if (status !== "completed" && status !== "completed_limited") {
      headers["Retry-After"] = String(body.retryAfterSeconds ?? body.estimatedWaitSeconds ?? 30);
    }

    const responseStatus = status === "completed" || status === "completed_limited" ? 200 : status === "rate_limited" ? 429 : 202;
    if (gptAction) {
      logPulseGptActionEvent("pulse_gpt_action_status_checked", {
        domain: pulseRequest.normalized_domain,
        elapsedMs: Date.now() - startedAt,
        errorCode: status === "rate_limited" ? "rate_limited" : undefined,
        jobId: pulseRequest.job_id,
        requestId,
        retryAfterSeconds: headers["Retry-After"] ? Number(headers["Retry-After"]) : undefined,
        route: "/api/v1/pulse/status/{jobId}",
        scanId: pulseRequest.scan_id,
        status,
        statusCode: responseStatus
      });
    }

    return pulseJson(body, {
      headers,
      status: responseStatus
    }, requestId);
  } catch (error) {
    console.error("[pulse-status] request failed", { requestId, error });
    if (explicitGptAction) {
      logPulseGptActionEvent("pulse_gpt_action_status_checked", {
        elapsedMs: Date.now() - startedAt,
        errorCode: "internal_error",
        requestId,
        route: "/api/v1/pulse/status/{jobId}",
        statusCode: 503
      });
    }
    return pulseJson(
      buildPulseError({
        code: "internal_error",
        message: "Pulse is temporarily unavailable. Try again later."
      }),
      { headers: { "Cache-Control": "no-store", "Retry-After": "60" }, status: 503 },
      requestId
    );
  }
}
