import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { buildPulseError } from "../../../../../../lib/pulse/error";
import { buildPulseStatus } from "../../../../../../lib/pulse/status";
import { getAnonymousScanById } from "../../../../../../server/scans/get-scan-by-id";
import { getPulseRequestByJobId } from "../../../../../../server/pulse/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const { jobId } = await context.params;
    const pulseRequest = await getPulseRequestByJobId(jobId);

    if (!pulseRequest) {
      return NextResponse.json(buildPulseError({ code: "not_found", message: "Pulse job not found." }), { status: 404 });
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
    }

    return NextResponse.json(body, {
      headers,
      status: status === "completed" || status === "completed_limited" ? 200 : status === "rate_limited" ? 429 : 202
    });
  } catch (error) {
    console.error("[pulse-status] request failed", { requestId, error });
    return NextResponse.json(
      buildPulseError({
        code: "internal_error",
        message: "Pulse is temporarily unavailable. Try again later."
      }),
      { headers: { "Cache-Control": "no-store", "Retry-After": "60" }, status: 503 }
    );
  }
}
