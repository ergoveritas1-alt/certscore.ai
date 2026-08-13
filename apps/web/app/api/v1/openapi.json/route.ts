import { buildPulseV1OpenApiDocument } from "@certscore/api-contracts";
import { API_READ_RATE_POLICY_OPENAPI_EXTENSION } from "@website-signal-risk-scanner/shared";

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function GET(request: Request) {
  const id = requestId(request);
  const document = {
    ...buildPulseV1OpenApiDocument(),
    "x-certscore-read-rate-policy": API_READ_RATE_POLICY_OPENAPI_EXTENSION
  };

  return new Response(JSON.stringify(document), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-CertScore.ai-Pulse": "v1",
      "X-CertScore.ai-Route": "openapi",
      "X-CertScore.ai-Request-Id": id,
      "X-CertScore-Pulse": "v1",
      "X-CertScore-Route": "openapi",
      "X-CertScore-Request-Id": id,
      "X-Content-Type-Options": "nosniff"
    },
    status: 200
  });
}
