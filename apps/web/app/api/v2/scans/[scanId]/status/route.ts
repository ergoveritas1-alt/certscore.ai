import { API_V2_SCAN_ID_PATTERN, apiV2JsonResponse, buildApiV2Error, buildApiV2ScanJobFromPulseStatus, buildApiV2ScanStatus } from "../../../../../../lib/api-v2/scan-resource";
import { loadAnonymousPersistedScanReportProjection } from "../../../../../../server/scans/scan-report-projection";
import { buildLightweightApiV2ScanStatusInput, getAnonymousScanStatusProjection } from "../../../../../../server/scans/scan-status-projection";
import { enforceApiV2ScanReadThrottle } from "../../../../../../server/pulse/api-v2-read-throttle";

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
      route: "api-v2-scan-status",
      status: 400
    });
  }

  const throttled = await enforceApiV2ScanReadThrottle({
    profile: "status",
    request,
    requestId: id,
    route: "api-v2-scan-status",
    scanId
  });
  if (throttled) return throttled;

  try {
    const projection = await getAnonymousScanStatusProjection(scanId);
    if (!projection) {
      return apiV2JsonResponse({
        body: buildApiV2Error({ code: "not_found", message: "Scan not found or not eligible for public API v2." }),
        requestId: id,
        route: "api-v2-scan-status",
        status: 404
      });
    }

    const persistedReport = projection.reportReady
      ? await loadAnonymousPersistedScanReportProjection({ scanId }).catch(() => null)
      : null;
    const scanStatus = persistedReport
      ? buildApiV2ScanStatus(persistedReport)
      : buildApiV2ScanJobFromPulseStatus(
          buildLightweightApiV2ScanStatusInput(projection),
          { requestedUrl: projection.pageUrl ?? undefined }
        );
    const retryAfter = scanStatus.retryAfterSeconds === null || scanStatus.retryAfterSeconds === undefined
      ? undefined
      : String(scanStatus.retryAfterSeconds);
    return apiV2JsonResponse({
      body: scanStatus,
      headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
      requestId: id,
      route: "api-v2-scan-status",
      status: 200
    });
  } catch (error) {
    console.error("[api-v2-scan-status] request failed", { requestId: id, error });
    return apiV2JsonResponse({
      body: buildApiV2Error({ code: "internal_error", message: "CertScore.ai API v2 is temporarily unavailable. Try again later." }),
      requestId: id,
      route: "api-v2-scan-status",
      status: 500
    });
  }
}
