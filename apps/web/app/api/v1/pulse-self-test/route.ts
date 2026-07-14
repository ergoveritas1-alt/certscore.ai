import { applyPulseCors, pulseOptionsResponse } from "../../../../lib/pulse/cors";

const standardDisclaimer =
  "CertScore.ai provides automated public-web observations for review. Results may be incomplete or contain errors. CertScore.ai does not provide legal advice nor certify compliance. Always review the underlying evidence and consult qualified experts where appropriate.";

const capabilities = {
  method: "automated_runtime_analysis",
  observes: [
    "pre_consent_tracking",
    "third_party_requests",
    "consent_enforcement_gaps",
    "cookie_activity",
    "accessibility_signals",
    "disclosure_inconsistencies"
  ],
  doesNotProvide: ["legal_advice", "certification", "compliance_determination"]
} as const;

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function GET(request: Request) {
  const id = requestId(request);
  const body = {
    ok: true,
    type: "certscore_pulse_self_test",
    service: "certscore_pulse",
    version: "v1",
    betaVersion: "0.5.3",
    timestamp: new Date().toISOString(),
    routes: {
      health: "/api/v1/pulse-health",
      pulseTiny: "/api/v1/pulse?url=https://kbdlab.io&detail=tiny",
      pulseMarkdown: "/api/v1/pulse?url=https://kbdlab.io&format=markdown&detail=standard",
      pulseFull: "/api/v1/pulse?url=https://kbdlab.io&detail=full",
      openapi: "/api/v1/openapi.json",
      chatgptOpenapi: "/api/v1/openapi.chatgpt.json",
      agentGuide: "/api-pulse-agent-guide.txt",
      discovery: "/.well-known/certscore-pulse"
    },
    capabilities,
    disclaimer: standardDisclaimer
  };

  const headers = applyPulseCors(new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-CertScore.ai-Pulse": "v1",
    "X-CertScore.ai-Route": "pulse-self-test",
    "X-CertScore.ai-Request-Id": id,
    "X-Content-Type-Options": "nosniff"
  }), request);

  return new Response(JSON.stringify(body), {
    headers,
    status: 200
  });
}

export function OPTIONS(request: Request) {
  return pulseOptionsResponse(request);
}
