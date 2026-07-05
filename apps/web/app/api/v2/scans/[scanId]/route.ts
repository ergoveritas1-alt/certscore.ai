import { apiV2ScanResourceSchema } from "@certscore/api-contracts";
import { API_V2_SCAN_ID_PATTERN, apiV2JsonResponse, buildApiV2Error, buildApiV2ScanResource } from "../../../../../lib/api-v2/scan-resource";
import { recordApiV2McpUsage } from "../../../../../server/integrations/api-v2-mcp-usage";
import { getPublicScanRecord } from "../../../../../server/scans/get-public-scan-record";

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

    await recordApiV2McpUsage({
      normalizedDomain: scanRecord.scan.domainHostname,
      requestedUrl: scanRecord.scan.domainHostname ? `https://${scanRecord.scan.domainHostname}` : null,
      request,
      responseStatus: 200,
      routeName: "api-v2-scan",
      scanId: scanRecord.scan.id,
      toolHint: "get_scan"
    });

    return apiV2JsonResponse({
      body: apiV2ScanResourceSchema.parse(buildApiV2ScanResource(scanRecord)),
      requestId: id,
      route: "api-v2-scan",
      status: 200
    });
  } catch (error) {
    console.error("[api-v2-scan] request failed", { requestId: id, error });
    return apiV2JsonResponse({
      body: buildApiV2Error({ code: "internal_error", message: "CertScore API v2 is temporarily unavailable. Try again later." }),
      requestId: id,
      route: "api-v2-scan",
      status: 500
    });
  }
}
