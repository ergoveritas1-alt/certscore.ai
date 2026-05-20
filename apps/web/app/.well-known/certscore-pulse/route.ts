const discoveryDocument = {
  name: "CertScore Pulse beta",
  version: "0.5.1",
  description:
    "CertScore Pulse uses automated runtime analysis of public websites to detect review signals around pre-consent tracking, third-party requests, consent enforcement gaps, cookie activity, accessibility issues, and disclosure inconsistencies.",
  capabilities: {
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
  },
  api: "https://certscore.ai/api/v1/pulse",
  gptActionApi: "https://certscore.ai/api/v1/pulse/gpt",
  openapi: "https://certscore.ai/api/v1/openapi.json",
  chatgptOpenapi: "https://certscore.ai/api/v1/openapi.chatgpt.json",
  docs: "https://certscore.ai/api-pulse",
  agentGuide: "https://certscore.ai/api-pulse-agent-guide.txt",
  selfTest: "https://certscore.ai/api/v1/pulse-self-test",
  health: "https://certscore.ai/api/v1/pulse-health",
  formats: ["json", "markdown"],
  detailLevels: ["tiny", "standard", "full"],
  detailAliases: { quick: "tiny" },
  example: "https://certscore.ai/api/v1/pulse?url=https://kbdlab.io",
  statusExample: "https://certscore.ai/api/v1/pulse/status/pulse_job_123",
  recommendedCalls: {
    userFacingSummary: "GET /api/v1/pulse?url=https://kbdlab.io&format=markdown&detail=standard",
    gptActionSummary: "GET /api/v1/pulse/gpt?url=https://kbdlab.io&format=markdown&detail=standard&wait=60",
    quickMachineTriage: "GET /api/v1/pulse?url=https://kbdlab.io&detail=tiny",
    evidenceReview: "GET /api/v1/pulse?url=https://kbdlab.io&detail=full",
    connectivityCheck: "GET /api/v1/pulse-self-test",
    healthCheck: "GET /api/v1/pulse-health"
  },
  markdownStructure: {
    startsWithSummaryTable: true,
    headings: [
      "Summary",
      "Highest-priority findings",
      "Privacy and consent signals",
      "Cookie and third-party request activity",
      "Accessibility signals",
      "Disclosure and trust signals",
      "Coverage and limitations",
      "Links",
      "Disclaimer"
    ]
  },
  retryBehavior:
    "HTTP 202 pending responses include Retry-After when a polling delay is recommended. HTTP 429 throttled responses include Retry-After when retry timing is known.",
  freshness:
    "Use freshness=latest for eligible completed results within the 24-hour reuse window. Use forceNewScan=true to bypass the 24-hour reuse check. New scan generation remains subject to the 5-minute normalized-domain throttle.",
  agentFetchLimitations:
    "Some agent environments may fail before receiving an HTTP response because of DNS, sandbox, TLS, proxy, or fetch-layer limitations. If a request fails before exposing an HTTP status, response body, or x-certscore-* diagnostic headers, do not conclude CertScore Pulse is unavailable. First try /api/v1/pulse-self-test, /api/v1/pulse-health, /api-pulse-agent-guide.txt, /.well-known/certscore-pulse, and /api/v1/openapi.chatgpt.json. If those also fail without HTTP status or CertScore diagnostic headers, report it as a client/network fetch limitation rather than a CertScore API result.",
  feedbackEmail: "support@certscore.ai",
  disclaimer: "Automated public-web observations for review. Not legal advice, certification, or a compliance determination."
} as const;

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function GET(request: Request) {
  const id = requestId(request);

  return new Response(JSON.stringify(discoveryDocument), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-CertScore-Pulse": "v1",
      "X-CertScore-Route": "discovery",
      "X-CertScore-Request-Id": id,
      "X-Content-Type-Options": "nosniff"
    },
    status: 200
  });
}
