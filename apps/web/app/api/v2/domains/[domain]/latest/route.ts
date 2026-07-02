import { normalizeScanFrom } from "@website-signal-risk-scanner/shared";
import { apiV2JsonResponse, buildApiV2DomainLatestScan, buildApiV2Error } from "../../../../../../lib/api-v2/scan-resource";
import { PULSE_MIN_REUSABLE_PAGES_REQUESTED } from "../../../../../../lib/pulse/scan-coverage";
import { normalizePulseUrl } from "../../../../../../lib/pulse/request";
import { getAnonymousScanById } from "../../../../../../server/scans/get-scan-by-id";
import { findLatestCompletedAnonymousScanForDomain } from "../../../../../../server/pulse/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{
    domain: string;
  }>;
};

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export async function GET(request: Request, context: RouteContext) {
  const id = requestId(request);
  const { domain } = await context.params;
  const normalized = normalizePulseUrl(decodeURIComponent(domain));

  if (!normalized.ok) {
    return apiV2JsonResponse({
      body: buildApiV2Error({ code: "invalid_url", message: "Invalid domain." }),
      requestId: id,
      route: "api-v2-domain-latest",
      status: 400
    });
  }

  try {
    const url = new URL(request.url);
    const scanFrom = normalizeScanFrom(url.searchParams.get("scanFrom"));
    const latestScan = await findLatestCompletedAnonymousScanForDomain(normalized.normalizedDomain, {
      minPagesRequested: PULSE_MIN_REUSABLE_PAGES_REQUESTED,
      scanFrom
    });
    const scanRecord = latestScan ? await getAnonymousScanById(latestScan.id).catch(() => null) : null;

    return apiV2JsonResponse({
      body: buildApiV2DomainLatestScan({
        domain: normalized.normalizedDomain,
        scanRecord
      }),
      requestId: id,
      route: "api-v2-domain-latest",
      status: 200
    });
  } catch (error) {
    console.error("[api-v2-domain-latest] request failed", { requestId: id, error });
    return apiV2JsonResponse({
      body: buildApiV2Error({ code: "internal_error", message: "CertScore API v2 is temporarily unavailable. Try again later." }),
      requestId: id,
      route: "api-v2-domain-latest",
      status: 500
    });
  }
}
