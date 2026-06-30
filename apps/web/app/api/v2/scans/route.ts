import { apiV2CreateScanRequestSchema, pulseResponseSchema, pulseStatusSchema } from "@certscore/api-contracts";
import { GET as pulseGET } from "../../v1/pulse/route";
import {
  apiV2JsonResponse,
  buildApiV2Error,
  buildApiV2ErrorFromPulse,
  buildApiV2ScanJobFromPulseStatus,
  buildApiV2ScanResource
} from "../../../../lib/api-v2/scan-resource";
import { getAnonymousScanById } from "../../../../server/scans/get-scan-by-id";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

function pulseRequestFromV2(request: Request, body: { url: string; freshness?: "latest" | "refresh"; scanFrom?: "eu_ie" | "california" }) {
  const sourceUrl = new URL(request.url);
  const pulseUrl = new URL("/api/v1/pulse", sourceUrl.origin);
  pulseUrl.searchParams.set("url", body.url);
  pulseUrl.searchParams.set("format", "json");
  pulseUrl.searchParams.set("detail", "standard");
  pulseUrl.searchParams.set("wait", "0");
  pulseUrl.searchParams.set("freshness", body.freshness ?? "latest");
  pulseUrl.searchParams.set("scanFrom", body.scanFrom ?? "eu_ie");

  const headers = new Headers(request.headers);
  headers.set("Accept", "application/json");
  headers.set("X-CertScore-API-V2-Wrapper", "true");

  return new Request(pulseUrl, {
    headers,
    method: "GET"
  });
}

async function parseJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const id = requestId(request);
  const parsed = apiV2CreateScanRequestSchema.safeParse(await parseJson(request));

  if (!parsed.success) {
    return apiV2JsonResponse({
      body: buildApiV2Error({ code: "invalid_request", message: "Invalid API v2 scan creation request." }),
      requestId: id,
      route: "api-v2-create-scan",
      status: 400
    });
  }

  try {
    const pulseResponse = await pulseGET(pulseRequestFromV2(request, parsed.data));
    const retryAfter = pulseResponse.headers.get("Retry-After") ?? undefined;
    const pulseBody = await pulseResponse.json().catch(() => null);

    if (pulseResponse.status === 200) {
      const pulse = pulseResponseSchema.parse(pulseBody);
      const scanId = pulse.scanId ?? pulse.scan_id ?? null;
      const scanRecord = scanId ? await getAnonymousScanById(scanId).catch(() => null) : null;
      if (!scanRecord || scanRecord.scan.status !== "completed") {
        return apiV2JsonResponse({
          body: buildApiV2Error({ code: "scan_unavailable", message: "Pulse returned a completed result without an eligible public scan resource." }),
          requestId: id,
          route: "api-v2-create-scan",
          status: 500
        });
      }
      return apiV2JsonResponse({
        body: buildApiV2ScanResource(scanRecord),
        requestId: id,
        route: "api-v2-create-scan",
        status: 200
      });
    }

    if (pulseResponse.status === 202) {
      return apiV2JsonResponse({
        body: buildApiV2ScanJobFromPulseStatus(pulseStatusSchema.parse(pulseBody)),
        headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
        requestId: id,
        route: "api-v2-create-scan",
        status: 202
      });
    }

    return apiV2JsonResponse({
      body: buildApiV2ErrorFromPulse({
        body: pulseBody ?? {},
        fallbackMessage: "CertScore API v2 scan creation failed.",
        status: pulseResponse.status
      }),
      headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
      requestId: id,
      route: "api-v2-create-scan",
      status: pulseResponse.status === 503 ? 500 : pulseResponse.status
    });
  } catch (error) {
    console.error("[api-v2-create-scan] request failed", { requestId: id, error });
    return apiV2JsonResponse({
      body: buildApiV2Error({ code: "internal_error", message: "CertScore API v2 is temporarily unavailable. Try again later." }),
      requestId: id,
      route: "api-v2-create-scan",
      status: 500
    });
  }
}
