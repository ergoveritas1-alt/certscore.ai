import { pulseResponseSchema } from "@certscore/api-contracts";
import { API_V2_SCAN_ID_PATTERN, apiV2JsonResponse, buildApiV2Error, buildApiV2ScanPulse } from "../../../../../../lib/api-v2/scan-resource";
import { buildPulseProjection } from "../../../../../../lib/pulse/projection";
import { recordApiV2McpUsage } from "../../../../../../server/integrations/api-v2-mcp-usage";
import { getPublicScanRecord } from "../../../../../../server/scans/get-public-scan-record";

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
      route: "api-v2-scan-pulse",
      status: 400
    });
  }

  try {
    const scanRecord = await getPublicScanRecord(scanId, { logPrefix: "[api-v2-scan-pulse]" });
    if (!scanRecord || scanRecord.scan.status !== "completed") {
      return apiV2JsonResponse({
        body: buildApiV2Error({ code: "not_found", message: "Scan not found or not eligible for public API v2." }),
        requestId: id,
        route: "api-v2-scan-pulse",
        status: 404
      });
    }

    const requestedUrl = scanRecord.scan.domainHostname ? `https://${scanRecord.scan.domainHostname}` : null;
    const pulse = buildPulseProjection({
      detail: "standard",
      format: "json",
      freshnessMode: "latest",
      pulseRequestId: `api_v2_${scanRecord.scan.id}`,
      requestedUrl,
      resolutionMode: "reused_existing_scan",
      scanRecord,
      waitSeconds: 0
    });

    await recordApiV2McpUsage({
      normalizedDomain: scanRecord.scan.domainHostname,
      requestedUrl,
      request,
      responseStatus: 200,
      routeName: "api-v2-scan-pulse",
      scanId: scanRecord.scan.id,
      toolHint: "get_report"
    });

    return apiV2JsonResponse({
      body: buildApiV2ScanPulse({
        pulse: pulseResponseSchema.parse(pulse),
        scanId: scanRecord.scan.id
      }),
      requestId: id,
      route: "api-v2-scan-pulse",
      status: 200
    });
  } catch (error) {
    console.error("[api-v2-scan-pulse] request failed", { requestId: id, error });
    return apiV2JsonResponse({
      body: buildApiV2Error({ code: "internal_error", message: "CertScore API v2 is temporarily unavailable. Try again later." }),
      requestId: id,
      route: "api-v2-scan-pulse",
      status: 500
    });
  }
}
