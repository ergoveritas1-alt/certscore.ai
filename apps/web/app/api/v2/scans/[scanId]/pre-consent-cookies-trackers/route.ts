import { apiV2PreConsentCookiesTrackersSchema } from "@certscore/api-contracts";
import { API_V2_SCAN_ID_PATTERN, apiV2JsonResponse, buildApiV2Error, buildApiV2PreConsentCookiesTrackers } from "../../../../../../lib/api-v2/scan-resource";
import { getAnonymousScanById } from "../../../../../../server/scans/get-scan-by-id";

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
      route: "api-v2-pre-consent-cookies-trackers",
      status: 400
    });
  }

  try {
    const scanRecord = await getAnonymousScanById(scanId);
    if (!scanRecord || scanRecord.scan.status !== "completed") {
      return apiV2JsonResponse({
        body: buildApiV2Error({ code: "not_found", message: "Scan not found or not eligible for public API v2." }),
        requestId: id,
        route: "api-v2-pre-consent-cookies-trackers",
        status: 404
      });
    }

    return apiV2JsonResponse({
      body: apiV2PreConsentCookiesTrackersSchema.parse(buildApiV2PreConsentCookiesTrackers(scanRecord)),
      requestId: id,
      route: "api-v2-pre-consent-cookies-trackers",
      status: 200
    });
  } catch (error) {
    console.error("[api-v2-pre-consent-cookies-trackers] request failed", { requestId: id, error });
    return apiV2JsonResponse({
      body: buildApiV2Error({ code: "internal_error", message: "CertScore API v2 is temporarily unavailable. Try again later." }),
      requestId: id,
      route: "api-v2-pre-consent-cookies-trackers",
      status: 500
    });
  }
}
