import { pulseResponseSchema } from "@certscore/api-contracts";
import {
  API_V2_SCAN_ID_PATTERN,
  apiV2JsonResponse,
  buildApiV2Error,
  buildApiV2FindingDetail,
  projectedFindingsFromPulse
} from "../../../../../../../lib/api-v2/scan-resource";
import { buildPulseProjection } from "../../../../../../../lib/pulse/projection";
import { recordApiV2McpUsage } from "../../../../../../../server/integrations/api-v2-mcp-usage";
import { getPublicScanRecord } from "../../../../../../../server/scans/get-public-scan-record";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{
    scanId: string;
    findingId: string;
  }>;
};

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export async function GET(request: Request, context: RouteContext) {
  const id = requestId(request);
  const { scanId, findingId } = await context.params;

  if (!API_V2_SCAN_ID_PATTERN.test(scanId) || !findingId) {
    return apiV2JsonResponse({
      body: buildApiV2Error({ code: "invalid_url", message: "Invalid scan or finding ID." }),
      requestId: id,
      route: "api-v2-scan-finding",
      status: 400
    });
  }

  try {
    const scanRecord = await getPublicScanRecord(scanId, { logPrefix: "[api-v2-scan-finding]" });
    if (!scanRecord || scanRecord.scan.status !== "completed") {
      return apiV2JsonResponse({
        body: buildApiV2Error({ code: "not_found", message: "Scan not found or not eligible for public API v2." }),
        requestId: id,
        route: "api-v2-scan-finding",
        status: 404
      });
    }

    const requestedUrl = scanRecord.scan.domainHostname ? `https://${scanRecord.scan.domainHostname}` : null;
    const pulse = pulseResponseSchema.parse(
      buildPulseProjection({
        detail: "full",
        format: "json",
        freshnessMode: "latest",
        pulseRequestId: `api_v2_${scanRecord.scan.id}`,
        requestedUrl,
        resolutionMode: "reused_existing_scan",
        scanRecord,
        waitSeconds: 0
      })
    );
    const finding = projectedFindingsFromPulse(pulse).find((candidate) => candidate.id === findingId);

    if (!finding) {
      return apiV2JsonResponse({
        body: buildApiV2Error({ code: "not_found", message: "Finding not found for this scan." }),
        requestId: id,
        route: "api-v2-scan-finding",
        status: 404
      });
    }

    await recordApiV2McpUsage({
      normalizedDomain: scanRecord.scan.domainHostname,
      requestedUrl,
      request,
      responseStatus: 200,
      routeName: "api-v2-scan-finding",
      scanId: scanRecord.scan.id,
      toolHint: "explain_finding"
    });

    return apiV2JsonResponse({
      body: buildApiV2FindingDetail({
        caveats: pulse.coverage?.limitations,
        finding,
        scanId: scanRecord.scan.id
      }),
      requestId: id,
      route: "api-v2-scan-finding",
      status: 200
    });
  } catch (error) {
    console.error("[api-v2-scan-finding] request failed", { requestId: id, error });
    return apiV2JsonResponse({
      body: buildApiV2Error({ code: "internal_error", message: "CertScore API v2 is temporarily unavailable. Try again later." }),
      requestId: id,
      route: "api-v2-scan-finding",
      status: 500
    });
  }
}
