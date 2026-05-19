import { randomUUID } from "node:crypto";
import { buildPulseError } from "../../../../../../lib/pulse/error";
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
  try {
    const { jobId } = await context.params;
    if (!jobId || jobId.length > 160) {
      return pulseJson(buildPulseError({ code: "not_found", message: "Pulse job not found." }), { status: 404 }, requestId);
    }

    const pulseRequest = await getPulseRequestByJobId(jobId);

    if (!pulseRequest) {
      return pulseJson(buildPulseError({ code: "not_found", message: "Pulse job not found." }), { status: 404 }, requestId);
    }

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

    return pulseJson(body, {
      headers,
      status: status === "completed" || status === "completed_limited" ? 200 : status === "rate_limited" ? 429 : 202
    }, requestId);
  } catch (error) {
    console.error("[pulse-status] request failed", { requestId, error });
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
