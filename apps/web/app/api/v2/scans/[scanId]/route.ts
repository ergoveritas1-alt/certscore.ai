import { apiV2ScanResourceSchema } from "@certscore/api-contracts";
import { API_V2_SCAN_ID_PATTERN, apiV2JsonResponse, buildApiV2Error, buildApiV2ScanResource, buildApiV2ScanStatus } from "../../../../../lib/api-v2/scan-resource";
import { getPublicScanRecord } from "../../../../../server/scans/get-public-scan-record";
import { enforceApiV2ScanReadThrottle } from "../../../../../server/pulse/api-v2-read-throttle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{
    scanId: string;
  }>;
};

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export async function GET(request: Request, context: RouteContext) {
  const id = requestId(request);
  const { scanId } = await context.params;

  if (!API_V2_SCAN_ID_PATTERN.test(scanId)) {
    return apiV2JsonResponse({
      body: buildApiV2Error({ code: "invalid_url", message: "Invalid scan ID." }),
      requestId: id,
      route: "api-v2-scan",
      status: 400
    });
  }

  const throttled = await enforceApiV2ScanReadThrottle({ request, requestId: id, route: "api-v2-scan", scanId });
  if (throttled) return throttled;

  try {
    const scanRecord = await getPublicScanRecord(scanId, { logPrefix: "[api-v2-scan]" });
    if (!scanRecord || scanRecord.scan.status !== "completed") {
      return apiV2JsonResponse({
        body: buildApiV2Error({ code: "not_found", message: "Scan not found or not eligible for public API v2." }),
        requestId: id,
        route: "api-v2-scan",
        status: 404
      });
    }
    const canonicalStatus = buildApiV2ScanStatus(scanRecord);
    if (canonicalStatus.status !== "completed" && canonicalStatus.status !== "completed_limited") {
      const failed = canonicalStatus.status === "failed";
      const retryAfterSeconds = canonicalStatus.retryAfterSeconds ?? canonicalStatus.error?.retryAfterSeconds ?? (failed ? null : 2);
      return apiV2JsonResponse({
        body: buildApiV2Error({
          code: "scan_unavailable",
          message: failed
            ? "The canonical scan result could not be finalized."
            : "The canonical scan result is still finalizing.",
          retryable: failed ? canonicalStatus.error?.retryable ?? false : true,
          retryAfterSeconds,
          recommendedNextAction: failed
            ? canonicalStatus.error?.recommendedNextAction ?? `Call certscore_get_scan_status with scanId ${scanId} for the terminal failure details.`
            : `Call certscore_get_scan_status with scanId ${scanId}, then retry certscore_get_scan_bundle after completion.`
        }),
        headers: retryAfterSeconds === null ? undefined : { "Retry-After": String(retryAfterSeconds) },
        requestId: id,
        route: "api-v2-scan",
        status: 409
      });
    }

    return apiV2JsonResponse({
      body: apiV2ScanResourceSchema.parse(buildApiV2ScanResource(scanRecord)),
      requestId: id,
      route: "api-v2-scan",
      status: 200
    });
  } catch (error) {
    console.error("[api-v2-scan] request failed", { requestId: id, error });
    return apiV2JsonResponse({
      body: buildApiV2Error({ code: "internal_error", message: "CertScore.ai API v2 is temporarily unavailable. Try again later." }),
      requestId: id,
      route: "api-v2-scan",
      status: 500
    });
  }
}
