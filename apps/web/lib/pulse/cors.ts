const ALLOWED_METHODS = "GET, HEAD, OPTIONS";
const DEFAULT_ALLOWED_HEADERS = "authorization, content-type, openai-conversation-id, openai-ephemeral-user-id, x-request-id";

export function pulseCorsHeaders(request?: Request) {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
  headers.set("Access-Control-Allow-Headers", request?.headers.get("access-control-request-headers") || DEFAULT_ALLOWED_HEADERS);
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

export function applyPulseCors(headers: Headers, request?: Request) {
  for (const [key, value] of pulseCorsHeaders(request)) {
    headers.set(key, value);
  }
  return headers;
}

export function pulseOptionsResponse(request: Request) {
  return new Response(null, {
    headers: pulseCorsHeaders(request),
    status: 204
  });
}
