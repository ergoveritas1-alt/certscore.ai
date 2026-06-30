import { buildPulseChatGptOpenApiDocument } from "@certscore/api-contracts";

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function GET(request: Request) {
  const id = requestId(request);

  return new Response(JSON.stringify(buildPulseChatGptOpenApiDocument()), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-CertScore-Pulse": "v1",
      "X-CertScore-Route": "openapi-chatgpt",
      "X-CertScore-Request-Id": id,
      "X-Content-Type-Options": "nosniff"
    },
    status: 200
  });
}
