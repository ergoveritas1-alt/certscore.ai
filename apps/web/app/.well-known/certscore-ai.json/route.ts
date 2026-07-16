const discoveryDocument = {
  name: "CertScore AI and API discovery",
  version: "2026-07-15",
  type: "certscore_ai_discovery",
  description:
    "Vendor-neutral discovery document for CertScore public API, SDK, MCP, OpenAPI, and agent-readable documentation.",
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
      "CertScore outputs are automated public-web observations for review. They are not legal advice, certification, or a compliance determination.",
    allowedUse:
      "Use public API and documentation outputs as evidence-backed review signals with human review. Do not represent CertScore output as a legal conclusion.",
    canonicalFlow:
      "WS01 observed evidence -> WC01 normalized concern -> WC01 concern policy -> WC01 unified finding/checklist projection -> executive/regulatory display."
  },
  aiDiscovery: {
    conciseGuide: "https://certscore.ai/llms.txt",
    fullGuide: "https://certscore.ai/llms-full.txt",
    developerHub: "https://certscore.ai/developers",
    scannerSolutions: "https://certscore.ai/solutions",
    sitemap: "https://certscore.ai/sitemap.xml",
    robots: "https://certscore.ai/robots.txt"
  },
  scannerSolutions: {
    hub: "https://certscore.ai/solutions",
    gdprWebsiteComplianceScanner: "https://certscore.ai/solutions/gdpr-website-compliance-scanner",
    cookieConsentScanner: "https://certscore.ai/solutions/cookie-consent-scanner",
    privacyPolicyRiskScanner: "https://certscore.ai/solutions/privacy-policy-risk-scanner",
    posture:
      "Scanner solution pages describe public website review workflows and automated risk signals. CertScore outputs are automated public-web observations for review. They are not legal advice, certification, or a compliance determination."
  },
  developerDocs: {
    hub: "https://certscore.ai/developers",
    quickstart: "https://certscore.ai/developers/quickstart",
    reference: "https://certscore.ai/developers/reference",
    sdk: "https://certscore.ai/developers/sdk",
    mcp: "https://certscore.ai/developers/mcp",
    examples: "https://certscore.ai/developers/examples",
    agentQuickstart: "https://certscore.ai/developers#agent-quickstart",
    completeCurlWorkflow: "https://certscore.ai/developers/quickstart#complete-curl-workflow",
    genericAgentInstructions: "https://certscore.ai/developers/examples#generic-agent-instructions",
    mcpAgentWorkflow: "https://certscore.ai/developers/examples#mcp-agent-workflow",
    evidenceBoundaries: "https://certscore.ai/developers/examples#evidence-boundaries",
    preConsentCookiesTrackersExample: "https://certscore.ai/developers/examples#pre-consent-cookies-trackers-json"
  },
  api: {
    v2Health: "https://certscore.ai/api/v2/health",
    v2Openapi: "https://certscore.ai/api/v2/openapi.json",
    v2AuthCheck: "https://certscore.ai/api/v2/auth/check",
    v2RequestReadOnlyKey: "https://certscore.ai/api/v2/keys/request",
    v2CreateScan: "https://certscore.ai/api/v2/scans",
    anonymousAgentScan: {
      method: "POST",
      route: "https://certscore.ai/api/v2/scans",
      authentication: "none",
      dailyNewScanLimit: 20,
      limitKey: "requester_ip_utc_day",
      recentReuseDoesNotConsumeQuota: true,
      statusRoute: "https://certscore.ai/api/v2/scans/{scanId}/status",
      findingsRoute: "https://certscore.ai/api/v2/scans/{scanId}/findings",
      intendedUse: "Low-volume agent discovery, evaluation, and public-web review workflows."
    },
    v2Scan: "https://certscore.ai/api/v2/scans/{scanId}",
    v2ScanStatus: "https://certscore.ai/api/v2/scans/{scanId}/status",
    v2ScanFindings: "https://certscore.ai/api/v2/scans/{scanId}/findings",
    v2ScanFinding: "https://certscore.ai/api/v2/scans/{scanId}/findings/{findingId}",
    v2ScanPreConsentCookiesTrackers: "https://certscore.ai/api/v2/scans/{scanId}/pre-consent-cookies-trackers",
    v2DomainLatest: "https://certscore.ai/api/v2/domains/{domain}/latest",
    v2DomainLatestPreConsentCookiesTrackers: "https://certscore.ai/api/v2/domains/{domain}/latest/pre-consent-cookies-trackers",
    docs: "https://certscore.ai/developers/reference"
  },
  sdk: {
    docs: "https://certscore.ai/developers/sdk",
    repositoryPath: "packages/certscore-sdk",
    distribution: "npm",
    status: "published",
    package: "@certscore/sdk",
    currentVersion: "0.2.6",
    install: "npm install @certscore/sdk@0.2.6"
  },
  mcp: {
    distribution: "homebrew",
    binary: "certscore-mcp",
    packageStatus: "homebrew_developer_preview",
    currentVersion: "0.2.12",
    docs: "https://certscore.ai/developers/mcp",
    repositoryPath: "packages/certscore-mcp",
    install: "brew tap ergoveritas1-alt/certscore https://github.com/ergoveritas1-alt/certscore.ai && brew install --cask certscore-mcp",
    verify: [
      "certscore-mcp --version",
      "certscore-mcp --help",
      "CERTSCORE_API_KEY=<token> certscore-mcp doctor",
      "CERTSCORE_API_KEY=<token> certscore-mcp doctor --check-auth"
    ],
    transport: "stdio",
    hosted: {
      transport: "streamable_http",
      endpoint: "https://mcp.certscore.ai/mcp",
      protectedResourceMetadata: "https://mcp.certscore.ai/.well-known/oauth-protected-resource",
      authorizationServerMetadata: "https://certscore.ai/.well-known/oauth-authorization-server",
      authentication: "OAuth 2.0 authorization code with PKCE",
      currentVersion: "0.2.12"
    },
    light: {
      name: "CertScore Light",
      transport: "streamable_http",
      endpoint: "https://mcp.certscore.ai/mcp/light",
      authentication: "none",
      dailyNewScanLimit: 20,
      limitKey: "requester_ip_utc_day",
      recentReuseDoesNotConsumeQuota: true,
      tools: ["scan_site", "get_scan_status", "get_scan_bundle"],
      intendedUse: "Frictionless no-account public website scans for new and low-volume agents."
    },
    anonymous: {
      transport: "streamable_http",
      endpoint: "https://mcp.certscore.ai/mcp/anonymous",
      authentication: "none",
      dailyNewScanLimit: 20,
      limitKey: "requester_ip_utc_day",
      recentReuseDoesNotConsumeQuota: true,
      intendedUse: "Low-volume agent discovery, evaluation, and public-web review workflows without account or OAuth setup."
    },
    currentTools: [
      "scan_site",
      "create_scan",
      "get_scan",
      "get_scan_status",
      "get_report",
      "get_evidence",
      "get_scan_bundle",
      "export_findings",
      "list_findings",
      "get_pre_consent_cookies_trackers",
      "explain_finding",
      "get_latest_domain_scan",
      "get_latest_domain_pre_consent_cookies_trackers"
    ]
  },
  recommendedAgentWorkflow: [
    {
      step: "health_check",
      request: "GET https://certscore.ai/api/v2/health"
    },
    {
      step: "api_v2_contract_check",
      request: "GET https://certscore.ai/api/v2/openapi.json"
    },
    {
      step: "scan_or_reuse_latest",
      request: "POST https://certscore.ai/api/v2/scans"
    },
    {
      step: "poll_if_pending",
      request: "GET https://certscore.ai/api/v2/scans/{scanId}/status"
    },
    {
      step: "retrieve_public_safe_findings",
      request: "GET https://certscore.ai/api/v2/scans/{scanId}/findings"
    },
    {
      step: "retrieve_pre_consent_cookies_trackers_table",
      request: "GET https://certscore.ai/api/v2/scans/{scanId}/pre-consent-cookies-trackers"
    }
  ],
  searchableTopics: [
    "CertScore API",
    "GDPR website compliance scanner",
    "cookie consent scanner",
    "privacy policy risk scanner",
    "website risk API",
    "privacy scan API",
    "cookie compliance scan API",
    "Cookies & Trackers (Pre-consent) JSON",
    "MCP server for website compliance review",
    "automated public-web risk signals",
    "evidence-backed website scan API"
  ],
  responseFormats: ["application/json", "text/markdown"],
  authentication: {
    summary:
      "Low-volume agents can create scans without an account or credential at 20 new scans per requester IP per UTC day. Bearer API keys are supported for scoped API, SDK, and MCP integrations. Contact support@certscore.ai for a higher-volume allowance; read-only + MCP keys are self-serve for signed-in verified users, while scan:create remains support-gated.",
    accessStatus: "read_only_self_serve_scan_create_request",
    selfServeReadOnly: {
      route: "https://certscore.ai/api/v2/keys/request",
      method: "POST",
      requirements: ["signed_in_dashboard_session", "verified_email", "non_disposable_email"],
      issuedScopes: ["scan:read", "mcp"],
      tokenPrefix: "cs_ro_",
      expiresInDays: 90,
      rateLimits: {
        requestsPerMinute: 60,
        scanReadsPerDay: 500
      }
    },
    requestEmail: "support@certscore.ai",
    requestInstructions:
      "Use /api/v2/keys/request for read-only + MCP access. Email support@certscore.ai with organization, integration type, expected request volume, contact email, and requested scopes for scan:create.",
    header: "Authorization: Bearer <token>",
    docs: "https://certscore.ai/developers/quickstart",
    currentScopes: ["scan:read", "scan:create", "mcp"],
    recommendedScopes: {
      restReadOnly: ["scan:read"],
      restScanCreation: ["scan:read", "scan:create"],
      typescriptSdk: ["scan:read", "scan:create"],
      mcp: ["scan:read", "scan:create", "mcp"]
    }
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
    "Some agent fetch tools may fail before receiving HTTP status or CertScore diagnostic headers; use API v2 health, llms.txt, and this manifest for fallback discovery."
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
      "X-CertScore-Route": "ai-discovery",
      "X-CertScore-Request-Id": id,
      "X-Content-Type-Options": "nosniff"
    },
    status: 200
  });
}
