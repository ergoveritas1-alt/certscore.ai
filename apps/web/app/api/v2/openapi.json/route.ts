import { buildCertScoreApiV2OpenApiDocument, CERTSCORE_API_V2_VERSION } from "@certscore/api-contracts";

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function GET(request: Request) {
  const id = requestId(request);

  return new Response(JSON.stringify(buildCertScoreApiV2OpenApiDocument()), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-CertScore-API-Version": CERTSCORE_API_V2_VERSION,
      "X-CertScore-Route": "api-v2-openapi",
      "X-CertScore-Request-Id": id,
      "X-Content-Type-Options": "nosniff"
    },
    status: 200
  });
}
