import { normalizeScanFrom } from "@website-signal-risk-scanner/shared";
import { apiV2PreConsentCookiesTrackersSchema } from "@certscore/api-contracts";
import { apiV2JsonResponse, buildApiV2Error, buildApiV2PreConsentCookiesTrackers } from "../../../../../../../lib/api-v2/scan-resource";
import { PULSE_MIN_REUSABLE_PAGES_REQUESTED } from "../../../../../../../lib/pulse/scan-coverage";
import { normalizePulseUrl } from "../../../../../../../lib/pulse/request";
import { findLatestCompletedAnonymousScanForDomain } from "../../../../../../../server/pulse/repository";
import { getPublicScanRecord } from "../../../../../../../server/scans/get-public-scan-record";
import { enforceApiV2ScanReadThrottle } from "../../../../../../../server/pulse/api-v2-read-throttle";
import { hydrateRuntimeGraphForRead } from "../../../../../../../server/scans/runtime-evidence-graph-storage";

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
      route: "api-v2-domain-latest-pre-consent-cookies-trackers",
      status: 400
    });
  }

  try {
    const url = new URL(request.url);
    const scanFrom = normalizeScanFrom(url.searchParams.get("scanFrom"));
  const throttled = await enforceApiV2ScanReadThrottle({
    detail: "evidence",
      request,
      requestId: id,
      route: "api-v2-domain-latest-pre-consent-cookies-trackers",
      target: `domain:${normalized.normalizedDomain}|${scanFrom}`
    });
    if (throttled) return throttled;
    const latestScan = await findLatestCompletedAnonymousScanForDomain(normalized.normalizedDomain, {
      minPagesRequested: PULSE_MIN_REUSABLE_PAGES_REQUESTED,
      scanFrom
    });
    const scanRecord = latestScan
      ? await getPublicScanRecord(latestScan.id, { logPrefix: "[api-v2-domain-latest-pre-consent-cookies-trackers]" })
      : null;

    if (!scanRecord || scanRecord.scan.status !== "completed") {
      return apiV2JsonResponse({
        body: buildApiV2Error({ code: "not_found", message: "No eligible public scan found for this domain." }),
        requestId: id,
        route: "api-v2-domain-latest-pre-consent-cookies-trackers",
        status: 404
      });
    }

    return apiV2JsonResponse({
      body: apiV2PreConsentCookiesTrackersSchema.parse(buildApiV2PreConsentCookiesTrackers(await hydrateRuntimeGraphForRead(scanRecord))),
      requestId: id,
      route: "api-v2-domain-latest-pre-consent-cookies-trackers",
      status: 200
    });
  } catch (error) {
    console.error("[api-v2-domain-latest-pre-consent-cookies-trackers] request failed", { requestId: id, error });
    return apiV2JsonResponse({
      body: buildApiV2Error({ code: "internal_error", message: "CertScore.ai API v2 is temporarily unavailable. Try again later." }),
      requestId: id,
      route: "api-v2-domain-latest-pre-consent-cookies-trackers",
      status: 500
    });
  }
}
