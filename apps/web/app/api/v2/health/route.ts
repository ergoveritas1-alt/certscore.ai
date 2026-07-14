import { CERTSCORE_API_V2_SCHEMA_VERSION, CERTSCORE_API_V2_VERSION } from "@certscore/api-contracts";

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function GET(request: Request) {
  const id = requestId(request);
  const health = {
    ok: true,
    service: "certscore-api",
    version: CERTSCORE_API_V2_VERSION,
    schemaVersion: CERTSCORE_API_V2_SCHEMA_VERSION,
    generatedAt: new Date().toISOString()
  };

  return new Response(JSON.stringify(health), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-CertScore.ai-API-Version": CERTSCORE_API_V2_VERSION,
      "X-CertScore.ai-Route": "api-v2-health",
      "X-CertScore.ai-Request-Id": id,
      "X-Content-Type-Options": "nosniff"
    },
    status: 200
  });
}
