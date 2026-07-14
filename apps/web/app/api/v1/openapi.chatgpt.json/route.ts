import { buildPulseChatGptOpenApiDocument } from "@certscore/api-contracts";
import { applyPulseCors, pulseOptionsResponse } from "../../../../lib/pulse/cors";

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function GET(request: Request) {
  const id = requestId(request);
  const headers = applyPulseCors(new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-CertScore.ai-Pulse": "v1",
    "X-CertScore.ai-Route": "openapi-chatgpt",
    "X-CertScore.ai-Request-Id": id,
    "X-Content-Type-Options": "nosniff"
  }), request);

  return new Response(JSON.stringify(buildPulseChatGptOpenApiDocument()), {
    headers,
    status: 200
  });
}

export function OPTIONS(request: Request) {
  return pulseOptionsResponse(request);
}
