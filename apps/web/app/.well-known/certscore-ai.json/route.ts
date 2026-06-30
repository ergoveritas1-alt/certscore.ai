const discoveryDocument = {
  name: "CertScore AI and API discovery",
  version: "2026-06-30",
  type: "certscore_ai_discovery",
  description:
    "Vendor-neutral discovery document for CertScore public API, Pulse API, SDK, MCP, OpenAPI, and agent-readable documentation.",
  homepage: "https://certscore.ai/",
  organization: {
    name: "CertScore.ai",
    url: "https://certscore.ai",
    supportEmail: "support@certscore.ai",
    supportUrl: "https://certscore.ai/contact",
    termsUrl: "https://certscore.ai/terms",
    privacyUrl: "https://certscore.ai/privacy"
  },
  posture: {
    summary:
      "CertScore provides automated public-web observations and risk signals for review. CertScore is not legal advice, not certification, and not a compliance determination.",
    allowedUse:
      "Use public API and documentation outputs as evidence-backed review signals with human review. Do not represent CertScore output as a legal conclusion.",
    canonicalFlow:
      "WS01 observed evidence -> WC01 normalized concern -> WC01 concern policy -> WC01 unified finding/checklist projection -> executive/regulatory display."
  },
  aiDiscovery: {
    conciseGuide: "https://certscore.ai/llms.txt",
    fullGuide: "https://certscore.ai/llms-full.txt",
    developerHub: "https://certscore.ai/developers",
    agentFallback: "https://certscore.ai/api-pulse/agent",
    plainTextPulseGuide: "https://certscore.ai/api-pulse-agent-guide.txt",
    sitemap: "https://certscore.ai/sitemap.xml",
    robots: "https://certscore.ai/robots.txt"
  },
  developerDocs: {
    hub: "https://certscore.ai/developers",
    quickstart: "https://certscore.ai/developers/quickstart",
    reference: "https://certscore.ai/developers/reference",
    sdk: "https://certscore.ai/developers/sdk",
    mcp: "https://certscore.ai/developers/mcp",
    examples: "https://certscore.ai/developers/examples"
  },
  api: {
    pulseV1: "https://certscore.ai/api/v1/pulse",
    pulseStatusV1: "https://certscore.ai/api/v1/pulse/status/{jobId}",
    pulseGptActionV1: "https://certscore.ai/api/v1/pulse/gpt",
    health: "https://certscore.ai/api/v1/pulse-health",
    selfTest: "https://certscore.ai/api/v1/pulse-self-test",
    openapi: "https://certscore.ai/api/v1/openapi.json",
    chatgptOpenapi: "https://certscore.ai/api/v1/openapi.chatgpt.json",
    v2Health: "https://certscore.ai/api/v2/health",
    v2Openapi: "https://certscore.ai/api/v2/openapi.json",
    v2CreateScan: "https://certscore.ai/api/v2/scans",
    v2Scan: "https://certscore.ai/api/v2/scans/{scanId}",
    v2ScanStatus: "https://certscore.ai/api/v2/scans/{scanId}/status",
    v2ScanFindings: "https://certscore.ai/api/v2/scans/{scanId}/findings",
    v2ScanFinding: "https://certscore.ai/api/v2/scans/{scanId}/findings/{findingId}",
    v2ScanPulse: "https://certscore.ai/api/v2/scans/{scanId}/pulse",
    v2DomainLatest: "https://certscore.ai/api/v2/domains/{domain}/latest",
    docs: "https://certscore.ai/developers/reference",
    pulseDocs: "https://certscore.ai/api-pulse",
    pulseDiscovery: "https://certscore.ai/.well-known/certscore-pulse"
  },
  sdk: {
    npmPackage: "@certscore/sdk",
    docs: "https://certscore.ai/developers/sdk",
    repositoryPath: "packages/certscore-sdk",
    install: "npm install @certscore/sdk"
  },
  mcp: {
    package: "@certscore/mcp",
    docs: "https://certscore.ai/developers/mcp",
    compatibilityDocs: "https://certscore.ai/api-pulse#mcp",
    repositoryPath: "packages/certscore-mcp",
    transport: "stdio",
    currentTools: [
      "scan_site",
      "create_scan",
      "get_scan",
      "get_scan_status",
      "get_report",
      "export_findings",
      "list_findings",
      "explain_finding",
      "get_latest_domain_scan"
    ]
  },
  recommendedAgentWorkflow: [
    {
      step: "health_check",
      request: "GET https://certscore.ai/api/v1/pulse-health"
    },
    {
      step: "api_v2_contract_check",
      request: "GET https://certscore.ai/api/v2/openapi.json"
    },
    {
      step: "scan_or_reuse_latest",
      request: "GET https://certscore.ai/api/v1/pulse?url=https://example.com&format=json&detail=standard"
    },
    {
      step: "poll_if_pending",
      request: "GET https://certscore.ai/api/v1/pulse/status/{jobId}"
    },
    {
      step: "retrieve_markdown_for_user_summary",
      request: "GET https://certscore.ai/api/v1/pulse?scanId={scanId}&format=markdown&detail=standard"
    },
    {
      step: "retrieve_full_public_safe_json_for_review",
      request: "GET https://certscore.ai/api/v1/pulse?scanId={scanId}&format=json&detail=full"
    }
  ],
  searchableTopics: [
    "CertScore API",
    "CertScore Pulse API",
    "website risk API",
    "privacy scan API",
    "cookie compliance scan API",
    "accessibility risk scan API",
    "MCP server for website compliance review",
    "automated public-web risk signals",
    "evidence-backed website scan API"
  ],
  responseFormats: ["application/json", "text/markdown"],
  authentication: {
    currentPublicPulse: "Unauthenticated public beta requests are supported with throttling. Bearer API keys are supported for scoped integrations.",
    header: "Authorization: Bearer <token>",
    docs: "https://certscore.ai/developers/quickstart",
    currentScopes: ["pulse:read", "pulse:scan", "mcp"]
  },
  rateLimits: {
    docs: "https://certscore.ai/developers/reference",
    retryAfter:
      "HTTP 202 pending responses and HTTP 429 throttled responses may include Retry-After. Agents and SDKs should honor Retry-After rather than tight polling."
  },
  support: {
    email: "support@certscore.ai",
    url: "https://certscore.ai/contact",
    terms: "https://certscore.ai/terms",
    privacy: "https://certscore.ai/privacy"
  },
  caveats: [
    "Results may be incomplete or contain errors.",
    "Absence of findings must not be treated as proof of compliance.",
    "Full raw scanner artifacts are not exposed by public API or MCP surfaces.",
    "Some agent fetch tools may fail before receiving HTTP status or CertScore diagnostic headers; use health, self-test, llms.txt, and this manifest for fallback discovery."
  ]
} as const;

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function GET(request: Request) {
  const id = requestId(request);

  return new Response(JSON.stringify(discoveryDocument), {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Type": "application/json; charset=utf-8",
      "X-CertScore-Pulse": "v1",
      "X-CertScore-Route": "ai-discovery",
      "X-CertScore-Request-Id": id,
      "X-Content-Type-Options": "nosniff"
    },
    status: 200
  });
}
