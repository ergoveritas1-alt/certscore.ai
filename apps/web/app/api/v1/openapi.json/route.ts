import { buildPulseV1OpenApiDocument } from "@certscore/api-contracts";

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function GET(request: Request) {
  const id = requestId(request);

  return new Response(JSON.stringify(buildPulseV1OpenApiDocument()), {
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
