import { apiV2Disclaimer, CERTSCORE_API_V2_SCHEMA_VERSION } from "./api-v2.js";

const diagnosticHeaders = {
  "x-certscore-api-version": { schema: { type: "string", const: "v2" }, description: "CertScore API version marker." },
  "x-certscore-request-id": { schema: { type: "string" }, description: "Request identifier for support and diagnostics." }
} as const;

const retryAfterHeader = {
  "Retry-After": { schema: { type: "integer" }, description: "Recommended retry or polling delay in seconds." }
} as const;

const scanExample = {
  type: "certscore_scan",
  scanId: "00000000-0000-4000-8000-000000000123",
  domain: "ergoveritas.com",
  url: "https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html",
  status: "completed",
  score: 82,
  scoreStatus: "final",
  scoreVersion: "overall-score.v2",
  scoreUpdatedAt: "2026-06-30T12:00:10.000Z",
  riskLevel: "review_recommended",
  coverage: { status: "complete", summary: "Automated public-web scan completed for the observed public surfaces.", limitations: ["Automated public-web scan only."] },
  executionMode: "reused_scan",
  reused: true,
  reusedScanAgeSeconds: 90,
  freshnessDecision: "reused_existing_scan",
  quotaConsumed: false,
  anonymousQuotaLimit: 20,
  anonymousQuotaRemaining: 8,
  anonymousQuotaResetAt: "2026-07-16T00:00:00.000Z",
  upgradeSupportEmail: "support@certscore.ai",
  upgradeMessage: "For a higher-volume allowance, contact support@certscore.ai.",
  recommendedNextTool: "certscore_get_scan_bundle",
  links: {
    self: "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123",
    status: "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/status",
    findings: "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/findings",
    pulse: "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/pulse",
    report: "https://certscore.ai/scan/00000000-0000-4000-8000-000000000123"
  },
  disclaimer: apiV2Disclaimer
} as const;

const scanJobExample = {
  type: "certscore_scan_job",
  jobId: "pulse_job_123",
  scanId: "00000000-0000-4000-8000-000000000123",
  domain: "ergoveritas.com",
  url: "https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html",
  status: "running",
  phase: "runtime_observation",
  startedAt: "2026-06-30T12:00:01.000Z",
  completedAt: null,
  scanTimeSeconds: null,
  phaseStartedAt: "2026-06-30T12:00:01.000Z",
  lastHeartbeatAt: "2026-06-30T12:00:06.000Z",
  progressPercent: 35,
  progressIsEstimate: true,
  estimatedRemainingSeconds: null,
  stalled: false,
  retryAfterSeconds: 2,
  preConsentPreview: {
    type: "certscore_pre_consent_preview",
    resultStage: "preliminary",
    final: false,
    sourceLane: "runtime_evidence",
    generatedAt: "2026-06-30T12:00:04.000Z",
    runtimeCoverage: { status: "usable", limitationKeys: [] },
    summary: {
      cookieCount: 1,
      returnedCookieCount: 1,
      trackerCount: 1,
      trackingVendorCount: 1,
      returnedTrackingVendorCount: 1,
      operationalVendorCount: 0,
      returnedOperationalVendorCount: 0,
      thirdPartyRequestCount: 3,
      vendorCount: 1
    },
    cookies: [{ name: "_ga", domain: "ergoveritas.com", party: "first_party", purpose: "analytics", essentiality: "non_essential", observedAtMs: 1200 }],
    trackers: [{ vendor: "Example Analytics", product: "Example Analytics Pixel", purpose: "analytics", confidence: 0.95, domains: ["analytics.example.test"] }],
    operationalVendors: [],
    truncated: { cookies: false, trackers: false, operationalVendors: false },
    mustContinuePolling: true,
    observationOnlyDisclaimer: "Partial preview of passive runtime observations only. Counts are partial, not the full scan tally. Continue polling until terminal status, then retrieve the canonical scan bundle."
  },
  reportUrl: "https://certscore.ai/scan/00000000-0000-4000-8000-000000000123",
  recommendedNextAction: "Poll certscore_get_scan_status with scanId 00000000-0000-4000-8000-000000000123 after the recommended delay.",
  executionMode: "new_scan",
  reused: false,
  reusedScanAgeSeconds: null,
  freshnessDecision: "no_eligible_recent_scan_queued",
  quotaConsumed: true,
  anonymousQuotaLimit: 20,
  anonymousQuotaRemaining: 7,
  anonymousQuotaResetAt: "2026-07-16T00:00:00.000Z",
  upgradeSupportEmail: "support@certscore.ai",
  upgradeMessage: "For a higher-volume allowance, contact support@certscore.ai.",
  recommendedNextTool: "certscore_get_scan_status",
  links: {
    self: "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/status",
    status: "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/status"
  },
  disclaimer: apiV2Disclaimer
} as const;

const findingExample = {
  type: "certscore_finding",
  id: "pre_consent_tracking_detected",
  scanId: "00000000-0000-4000-8000-000000000123",
  label: "Tracking started before consent",
  criticality: "high",
  confidence: "strong",
  plainEnglish: "A third-party tracking request was observed before a recorded consent choice.",
  reviewLenses: ["Privacy and consent"],
  evidence: {
    basis: "runtime_observation",
    summary: "Public-safe projected evidence summary from the completed report.",
    phase: "before_consent",
    exampleCount: 2,
    examplesShown: 1,
    examplesAvailable: 2,
    authRequiredForExamples: false,
    excerpt: {
      excerpt: "Public-safe projected evidence summary from the completed report.",
      isTruncated: false,
      truncationMarker: null,
      sourceUrl: "https://ergoveritas.com/.well-known/certscore-canary/sentinels/privacy-evidence.html",
      evidenceUrl: "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/findings/pre_consent_tracking_detected"
    },
    examples: [{ type: "request", vendor: "Example Analytics", urlHost: "analytics.example.test", phase: "before_consent" }],
    hasTimingAnchor: true,
    hasVendorAnchor: true,
    hasConsentContext: true
  },
  nextStep: "Review whether this vendor should be consent-gated.",
  disclaimer: apiV2Disclaimer
} as const;

const findingListExample = {
  type: "certscore_finding_list",
  scanId: "00000000-0000-4000-8000-000000000123",
  findings: [findingExample],
  links: {
    self: "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/findings"
  },
  disclaimer: apiV2Disclaimer
} as const;

const domainLatestExample = {
  type: "certscore_domain_latest_scan",
  domain: "ergoveritas.com",
  scan: scanExample,
  links: {
    self: "https://certscore.ai/api/v2/domains/ergoveritas.com/latest",
    docs: "https://certscore.ai/developers/reference"
  },
  disclaimer: apiV2Disclaimer
} as const;

const scanPulseExample = {
  type: "certscore_scan_pulse",
  scanId: "00000000-0000-4000-8000-000000000123",
  pulse: {
    type: "certscore_pulse",
    scanId: "00000000-0000-4000-8000-000000000123",
    summary: { headline: "Automated scan surfaced public-web review signals.", score: 82 },
    links: { fullReportUrl: "https://certscore.ai/scan/00000000-0000-4000-8000-000000000123" },
    disclaimer: apiV2Disclaimer
  },
  disclaimer: apiV2Disclaimer
} as const;

const preConsentCookiesTrackersExample = {
  type: "certscore_pre_consent_cookies_trackers",
  scanId: "00000000-0000-4000-8000-000000000123",
  domain: "ergoveritas.com",
  generatedAt: "2026-06-30T12:00:10.000Z",
  summary: {
    rowCount: 2,
    trackerCount: 1,
    trackerCountScope: "canonical_inventory_rows_including_operational",
    trackerCategoryCounts: { advertising: 0, analytics: 1, essential: 0, functional: 0, review: 0 },
    cookieCount: 1,
    requestCount: 3
  },
  rows: [
    {
      id: "tracker:example-analytics:analytics:analytics-example-test",
      kind: "tracker",
      name: "Example Analytics",
      vendor: "Example Analytics",
      host: "analytics.example.test",
      registrableDomain: "example.test",
      category: "Analytics",
      purpose: "Analytics",
      priority: "medium",
      confidence: "high",
      party: "third_party",
      requestCount: 3,
      phase: "pre_consent",
      observedBeforeConsent: true,
      evidenceBasis: "public_report_projection",
      firstObservedAtMs: 1234,
      pageUrlHost: "ergoveritas.com"
    },
    {
      id: "cookie:google:advertising:doubleclick-net",
      kind: "cookie",
      name: "Google",
      vendor: "Google",
      host: "doubleclick.net",
      registrableDomain: "doubleclick.net",
      category: "Advertising",
      purpose: "Advertising",
      priority: "high",
      confidence: "high",
      party: "third_party",
      requestCount: null,
      phase: "pre_consent",
      observedBeforeConsent: true,
      evidenceBasis: "public_report_projection",
      firstObservedAtMs: 512,
      pageUrlHost: "ergoveritas.com"
    }
  ],
  links: {
    self: "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/pre-consent-cookies-trackers",
    scan: "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123",
    pulse: "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/pulse",
    report: "https://certscore.ai/scan/00000000-0000-4000-8000-000000000123",
    docs: "https://certscore.ai/developers/examples#pre-consent-cookies-trackers-json"
  },
  disclaimer: apiV2Disclaimer
} as const;

const emptyPreConsentCookiesTrackersExample = {
  ...preConsentCookiesTrackersExample,
  summary: {
    rowCount: 0,
    trackerCount: 0,
    trackerCountScope: "canonical_inventory_rows_including_operational",
    trackerCategoryCounts: { advertising: 0, analytics: 0, essential: 0, functional: 0, review: 0 },
    cookieCount: 0,
    requestCount: 0
  },
  rows: []
} as const;

const healthExample = {
  ok: true,
  service: "certscore-api",
  version: "v2",
  generatedAt: "2026-06-30T00:00:00.000Z"
} as const;

const selfServeApiKeyExample = {
  type: "certscore_api_key",
  key: "cs_ro_example_redacted",
  tokenPrefix: "cs_ro_example",
  scopes: ["scan:read", "mcp"],
  expiresAt: "2026-09-28T00:00:00.000Z",
  rateLimits: {
    requestsPerMinute: 60,
    scanReadsPerDay: 500
  },
  usageGuidance: {
    scanCreateRequiresSupport: true,
    scanCreateRequestEmail: "support@certscore.ai"
  },
  disclaimer: apiV2Disclaimer
} as const;

const errorContent = {
  "application/json": {
    schema: { $ref: "#/components/schemas/ApiError" },
    examples: {
      invalidRequest: {
        summary: "Invalid request",
        value: { type: "certscore_api_error", error: { code: "invalid_request", message: "Invalid request.", retryable: false, retryAfterSeconds: null, recommendedNextAction: "Correct the request before retrying." }, disclaimer: apiV2Disclaimer }
      },
      unauthorized: {
        summary: "Missing or invalid API key",
        value: { type: "certscore_api_error", error: { code: "unauthorized", message: "Missing or invalid API key.", retryable: false, retryAfterSeconds: null, recommendedNextAction: "Stop and review authentication before retrying." }, disclaimer: apiV2Disclaimer }
      },
      forbidden: {
        summary: "Missing required scope",
        value: { type: "certscore_api_error", error: { code: "forbidden", message: "API key is missing the required scope.", retryable: false, retryAfterSeconds: null, recommendedNextAction: "Stop and request the required scope before retrying." }, disclaimer: apiV2Disclaimer }
      },
      notFound: {
        summary: "Resource not found",
        value: { type: "certscore_api_error", error: { code: "not_found", message: "Scan not found.", retryable: false, retryAfterSeconds: null, recommendedNextAction: "Stop and verify the scan ID." }, disclaimer: apiV2Disclaimer }
      },
      rateLimited: {
        summary: "Rate limited",
        value: {
          type: "certscore_api_error",
          error: {
            code: "rate_limited",
            message: "Completed scan resource read limit exceeded. Retry after 60 seconds.",
            retryable: true,
            retryAfterSeconds: 60,
            recommendedNextAction: "Wait for Retry-After, then make one bounded retrieval. Do not poll terminal scan resources."
          },
          disclaimer: apiV2Disclaimer
        }
      },
      internalError: {
        summary: "Temporary service error",
        value: {
          type: "certscore_api_error",
          error: { code: "internal_error", message: "CertScore API v2 is temporarily unavailable. Try again later.", retryable: true, retryAfterSeconds: 30, recommendedNextAction: "Retry after 30 seconds. If the error repeats, stop and contact CertScore support." },
          disclaimer: apiV2Disclaimer
        }
      }
    }
  }
} as const;

const readRateLimitedResponse = {
  description: "Weighted scan-resource read limit reached. Honor Retry-After before retrying and do not poll terminal scan resources.",
  headers: { ...diagnosticHeaders, ...retryAfterHeader },
  content: errorContent
} as const;

export function buildCertScoreApiV2OpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "CertScore API v2 draft",
      version: CERTSCORE_API_V2_SCHEMA_VERSION,
      description:
        "Draft resource-oriented CertScore public API contract for scans, jobs, findings, domain latest scans, and Pulse projections. " +
        apiV2Disclaimer
    },
    servers: [{ url: "https://certscore.ai" }],
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/v2/keys/request": {
        post: {
          operationId: "requestReadOnlyApiKey",
          tags: ["Auth"],
          summary: "Issue a self-serve read-only API key for signed-in verified users.",
          description:
            "Creates a 90-day key prefixed cs_ro_ with scan:read and mcp access only. scan:create remains support-gated. " +
            "The route requires an authenticated CertScore dashboard session with a verified non-disposable email address. " +
            "Issuance is capped per email and per requester network and every issuance/denial is audited.",
          security: [],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReadOnlyApiKeyRequest" },
                examples: { named: { value: { name: "Claude Desktop read-only MCP" } } }
              }
            }
          },
          responses: {
            "201": {
              description: "Read-only API key issued. Store the token immediately; only the hash is retained.",
              headers: diagnosticHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/IssuedApiKey" }, examples: { issued: { value: selfServeApiKeyExample } } } }
            },
            "400": { description: "Invalid request.", headers: diagnosticHeaders, content: errorContent },
            "401": { description: "Sign-in required.", headers: diagnosticHeaders, content: errorContent },
            "403": { description: "Verified non-disposable email required.", headers: diagnosticHeaders, content: errorContent },
            "429": { description: "Issuance cap reached.", headers: { ...diagnosticHeaders, ...retryAfterHeader }, content: errorContent },
            "500": { description: "Temporary service error.", headers: diagnosticHeaders, content: errorContent }
          }
        }
      },
      "/api/v2/auth/check": {
        get: {
          operationId: "checkIntegrationCredential",
          tags: ["Auth"],
          summary: "Check a bearer credential without creating a scan.",
          description:
            "Validates the bearer credential and returns its granted scopes. This endpoint is side-effect free and does not expose report data.",
          responses: {
            "200": {
              description: "Credential is valid.",
              headers: diagnosticHeaders,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["type", "authenticated", "scopes"],
                    properties: {
                      type: { type: "string", enum: ["certscore_auth_check"] },
                      authenticated: { type: "boolean", const: true },
                      scopes: { type: "array", items: { type: "string" } },
                      expiresAt: { type: ["string", "null"], format: "date-time" },
                      disclaimer: { type: "string" }
                    }
                  }
                }
              }
            },
            "401": { description: "Credential missing or invalid.", headers: diagnosticHeaders, content: errorContent },
            "403": { description: "Credential is missing a required scope.", headers: diagnosticHeaders, content: errorContent },
            "500": { description: "Temporary service error.", headers: diagnosticHeaders, content: errorContent }
          }
        }
      },
      "/api/v2/scans": {
        post: {
          operationId: "createScan",
          tags: ["Scans"],
          summary: "Create or reuse a CertScore public-web scan.",
          description:
            "Submit a public URL for CertScore automated public-web observations. The response may be a queued job or an already completed scan reference. " +
            "This v2 route reuses the existing Pulse scan creation, reuse, validation, and throttling path, then returns v2 Scan or ScanJob resources. " +
            "Bearer authentication is optional for a reduced-friction anonymous path: unauthenticated new scans are limited to 20 per requester IP per UTC day, while recent-result reuse does not consume the quota. Contact support@certscore.ai for a higher-volume allowance.",
          security: [{}, { bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateScanRequest" },
                examples: {
                  create: {
                    summary: "Create or reuse a public-web scan",
                    value: { url: "https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html", freshness: "latest", scanFrom: "eu_ie" }
                  }
                }
              }
            }
          },
          responses: {
            "200": {
              description: "A completed or reusable scan resource is available.",
              headers: diagnosticHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/Scan" }, examples: { completed: { value: scanExample } } } }
            },
            "202": {
              description: "Scan job queued or running.",
              headers: { ...diagnosticHeaders, ...retryAfterHeader },
              content: { "application/json": { schema: { $ref: "#/components/schemas/ScanJob" }, examples: { pending: { value: scanJobExample } } } }
            },
            "400": { description: "Invalid request.", headers: diagnosticHeaders, content: errorContent },
            "401": { description: "Bearer credential is invalid when Authorization is supplied.", headers: diagnosticHeaders, content: errorContent },
            "403": { description: "API key is missing the required scope.", headers: diagnosticHeaders, content: errorContent },
            "429": { description: "Rate limited.", headers: { ...diagnosticHeaders, ...retryAfterHeader }, content: errorContent },
            "500": { description: "Temporary service error.", headers: diagnosticHeaders, content: errorContent }
          }
        }
      },
      "/api/v2/scans/{scanId}": {
        get: {
          operationId: "getScan",
          tags: ["Scans"],
          summary: "Retrieve a CertScore scan resource.",
          parameters: [{ name: "scanId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Scan resource.",
              headers: diagnosticHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/Scan" }, examples: { completed: { value: scanExample } } } }
            },
            "400": { description: "Invalid scan ID.", headers: diagnosticHeaders, content: errorContent },
            "404": { description: "Scan not found.", headers: diagnosticHeaders, content: errorContent },
            "429": readRateLimitedResponse,
            "500": { description: "Temporary service error.", headers: diagnosticHeaders, content: errorContent }
          }
        }
      },
      "/api/v2/scans/{scanId}/status": {
        get: {
          operationId: "getScanStatus",
          tags: ["Scans"],
          summary: "Retrieve scan job/status information.",
          parameters: [{ name: "scanId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Scan status.",
              headers: diagnosticHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/ScanJob" }, examples: { running: { value: scanJobExample } } } }
            },
            "400": { description: "Invalid scan ID.", headers: diagnosticHeaders, content: errorContent },
            "404": { description: "Scan or job not found.", headers: diagnosticHeaders, content: errorContent },
            "429": readRateLimitedResponse,
            "500": { description: "Temporary service error.", headers: diagnosticHeaders, content: errorContent }
          }
        }
      },
      "/api/v2/scans/{scanId}/diagnostics": {
        get: {
          operationId: "getScanDiagnostics",
          tags: ["Scans"],
          summary: "Retrieve bounded scan phase and policy-discovery diagnostics.",
          parameters: [{ name: "scanId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Bounded scan diagnostics.",
              headers: diagnosticHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/ScanDiagnostics" } } }
            },
            "400": { description: "Invalid scan ID.", headers: diagnosticHeaders, content: errorContent },
            "404": { description: "Scan not found.", headers: diagnosticHeaders, content: errorContent },
            "429": readRateLimitedResponse,
            "500": { description: "Temporary service error.", headers: diagnosticHeaders, content: errorContent }
          }
        }
      },
      "/api/v2/scans/{scanId}/findings": {
        get: {
          operationId: "listScanFindings",
          tags: ["Findings"],
          summary: "List already-projected public-safe findings for a scan.",
          parameters: [{ name: "scanId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Finding list.",
              headers: diagnosticHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/FindingList" }, examples: { findings: { value: findingListExample } } } }
            },
            "400": { description: "Invalid scan ID.", headers: diagnosticHeaders, content: errorContent },
            "404": { description: "Scan not found.", headers: diagnosticHeaders, content: errorContent },
            "429": readRateLimitedResponse,
            "500": { description: "Temporary service error.", headers: diagnosticHeaders, content: errorContent }
          }
        }
      },
      "/api/v2/scans/{scanId}/findings/{findingId}": {
        get: {
          operationId: "getScanFinding",
          tags: ["Findings"],
          summary: "Retrieve one already-projected public-safe finding.",
          parameters: [
            { name: "scanId", in: "path", required: true, schema: { type: "string" } },
            { name: "findingId", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: {
            "200": {
              description: "Finding detail.",
              headers: diagnosticHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/Finding" }, examples: { finding: { value: findingExample } } } }
            },
            "400": { description: "Invalid scan or finding ID.", headers: diagnosticHeaders, content: errorContent },
            "404": { description: "Finding not found.", headers: diagnosticHeaders, content: errorContent },
            "429": readRateLimitedResponse,
            "500": { description: "Temporary service error.", headers: diagnosticHeaders, content: errorContent }
          }
        }
      },
      "/api/v2/domains/{domain}/latest": {
        get: {
          operationId: "getLatestDomainScan",
          tags: ["Domains"],
          summary: "Retrieve the latest public-safe scan for a domain.",
          parameters: [
            { name: "domain", in: "path", required: true, schema: { type: "string" } },
            {
              name: "scanFrom",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["eu_de", "eu_ie", "california"], default: "eu_ie" },
              description: "Execution context for selecting matching eligible scans. Invalid values default to eu_ie."
            }
          ],
          responses: {
            "200": {
              description: "Latest domain scan. The scan field is null when no eligible public scan exists.",
              headers: diagnosticHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/DomainLatestScan" }, examples: { latest: { value: domainLatestExample } } } }
            },
            "400": { description: "Invalid domain.", headers: diagnosticHeaders, content: errorContent },
            "429": readRateLimitedResponse,
            "500": { description: "Temporary service error.", headers: diagnosticHeaders, content: errorContent }
          }
        }
      },
      "/api/v2/scans/{scanId}/pulse": {
        get: {
          operationId: "getScanPulse",
          tags: ["Pulse"],
          summary: "Retrieve the Pulse projection for a scan.",
          parameters: [{ name: "scanId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Pulse projection.",
              headers: diagnosticHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/ScanPulse" }, examples: { pulse: { value: scanPulseExample } } } }
            },
            "400": { description: "Invalid scan ID.", headers: diagnosticHeaders, content: errorContent },
            "404": { description: "Scan not found.", headers: diagnosticHeaders, content: errorContent },
            "429": readRateLimitedResponse,
            "500": { description: "Temporary service error.", headers: diagnosticHeaders, content: errorContent }
          }
        }
      },
      "/api/v2/scans/{scanId}/pre-consent-cookies-trackers": {
        get: {
          operationId: "getScanPreConsentCookiesTrackers",
          tags: ["Scans", "Runtime Inventory"],
          summary: "Retrieve public-safe Cookies & Trackers (Pre-consent) table data as JSON.",
          description:
            "Returns the same public-safe report projection used for CertScore's Cookies & Trackers (Pre-consent) table. " +
            "Rows are compact, values and raw request details are stripped, and host fields are reduced to host/domain form. " +
            apiV2Disclaimer,
          parameters: [{ name: "scanId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Pre-consent cookie and tracker table data.",
              headers: diagnosticHeaders,
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PreConsentCookiesTrackers" },
                  examples: {
                    success: { value: preConsentCookiesTrackersExample },
                    empty: { value: emptyPreConsentCookiesTrackersExample }
                  }
                }
              }
            },
            "202": {
              description: "If a scan is still pending, poll scan status and retry after completion.",
              headers: { ...diagnosticHeaders, ...retryAfterHeader },
              content: { "application/json": { schema: { $ref: "#/components/schemas/ScanJob" }, examples: { pending: { value: scanJobExample } } } }
            },
            "400": { description: "Invalid scan ID.", headers: diagnosticHeaders, content: errorContent },
            "404": { description: "Scan not found.", headers: diagnosticHeaders, content: errorContent },
            "429": readRateLimitedResponse,
            "500": { description: "Temporary service error.", headers: diagnosticHeaders, content: errorContent }
          }
        }
      },
      "/api/v2/domains/{domain}/latest/pre-consent-cookies-trackers": {
        get: {
          operationId: "getLatestDomainPreConsentCookiesTrackers",
          tags: ["Domains", "Runtime Inventory"],
          summary: "Retrieve latest-domain Cookies & Trackers (Pre-consent) table data.",
          description:
            "Convenience endpoint for the latest eligible public scan for a domain. The response is the same public-safe table projection as the scan-specific endpoint. " +
            apiV2Disclaimer,
          parameters: [
            { name: "domain", in: "path", required: true, schema: { type: "string" } },
            {
              name: "scanFrom",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["eu_de", "eu_ie", "california"], default: "eu_ie" }
            }
          ],
          responses: {
            "200": {
              description: "Pre-consent cookie and tracker table data from the latest eligible scan.",
              headers: diagnosticHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/PreConsentCookiesTrackers" }, examples: { success: { value: preConsentCookiesTrackersExample } } } }
            },
            "400": { description: "Invalid domain.", headers: diagnosticHeaders, content: errorContent },
            "404": { description: "No eligible public scan exists for the domain.", headers: diagnosticHeaders, content: errorContent },
            "429": readRateLimitedResponse,
            "500": { description: "Temporary service error.", headers: diagnosticHeaders, content: errorContent }
          }
        }
      },
      "/api/v2/health": {
        get: {
          operationId: "getApiV2Health",
          tags: ["Diagnostics"],
          summary: "Check API v2 connectivity.",
          responses: {
            "200": {
              description: "API v2 health response.",
              headers: diagnosticHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/Health" }, examples: { ok: { value: healthExample } } } }
            },
            "500": { description: "Temporary service error.", headers: diagnosticHeaders, content: errorContent }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Scoped CertScore integration API key."
        }
      },
      schemas: {
        CreateScanRequest: {
          type: "object",
          additionalProperties: false,
          required: ["url"],
          properties: {
            url: { type: "string" },
            freshness: {
              type: "string",
              enum: ["latest", "refresh"],
              default: "latest",
              description:
                "Use latest to reuse recent eligible scans. Use refresh to request a new scan when eligible; refresh bypasses the 24-hour recent-scan reuse check but not validation or throttles."
            },
            scanFrom: { type: "string", enum: ["eu_de", "eu_ie", "california"], default: "eu_ie" },
            callbackUrl: { type: "string", format: "uri" },
            metadata: { type: "object", additionalProperties: { type: "string" } }
          }
        },
        ReadOnlyApiKeyRequest: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 2, maxLength: 80 }
          }
        },
        IssuedApiKey: {
          type: "object",
          additionalProperties: false,
          required: ["type", "key", "tokenPrefix", "scopes", "expiresAt", "rateLimits", "usageGuidance", "disclaimer"],
          properties: {
            type: { type: "string", const: "certscore_api_key" },
            key: { type: "string", pattern: "^cs_ro_" },
            tokenPrefix: { type: "string", pattern: "^cs_ro_" },
            scopes: { type: "array", items: { type: "string", enum: ["scan:read", "mcp"] } },
            expiresAt: { type: "string", format: "date-time" },
            rateLimits: {
              type: "object",
              additionalProperties: false,
              required: ["requestsPerMinute", "scanReadsPerDay"],
              properties: {
                requestsPerMinute: { type: "integer", const: 60 },
                scanReadsPerDay: { type: "integer", const: 500 }
              }
            },
            usageGuidance: {
              type: "object",
              additionalProperties: false,
              required: ["scanCreateRequiresSupport", "scanCreateRequestEmail"],
              properties: {
                scanCreateRequiresSupport: { type: "boolean", const: true },
                scanCreateRequestEmail: { type: "string", const: "support@certscore.ai" }
              }
            },
            disclaimer: { type: "string" }
          }
        },
        PostRefusalObservation: {
          type: "object",
          additionalProperties: false,
          required: [
            "status",
            "refusalExercised",
            "observationCount",
            "productionProjectable",
            "evidenceDisposition",
            "indeterminateReason",
            "verdict",
            "interpretation",
            "observationStrategy",
            "termination",
            "completedAt",
            "coverageLimitations",
            "limitations"
          ],
          properties: {
            status: { type: "string", enum: ["confirmed_observation", "confirmed_clean", "unconfirmed", "not_attempted", "unsupported", "aborted"] },
            refusalExercised: { type: "boolean" },
            observationCount: { type: "integer", minimum: 0 },
            productionProjectable: { type: "boolean" },
            evidenceDisposition: { type: "string", enum: ["confirmed", "indeterminate"] },
            indeterminateReason: { type: ["string", "null"], maxLength: 160 },
            verdict: {
              type: "string",
              enum: [
                "eligible_nonessential_activity_observed_after_confirmed_refusal",
                "retained_consent_signal_contradiction_observed_after_confirmed_refusal",
                "no_eligible_nonessential_activity_observed_during_completed_window",
                "no_confirmed_post_refusal_verdict"
              ]
            },
            interpretation: { type: "string", maxLength: 500 },
            observationStrategy: { type: "string", enum: ["stop_on_first_eligible_activity", "not_applicable"] },
            termination: {
              type: "object",
              additionalProperties: false,
              required: ["kind", "intentional", "trigger"],
              properties: {
                kind: { type: "string", enum: ["evidence_satisfied", "window_elapsed", "unavailable"] },
                intentional: { type: "boolean" },
                trigger: { type: "string", enum: ["non_essential_request_observed", "non_essential_storage_write_observed", "refusal_signal_contradiction_observed", "window_elapsed", "reject_path_timeout", "worker_failed", "unavailable"] }
              }
            },
            completedAt: { type: ["string", "null"], format: "date-time" },
            coverageLimitations: { type: "array", maxItems: 24, items: { type: "string" } },
            limitations: { type: "array", maxItems: 24, deprecated: true, description: "Deprecated compatibility alias for coverageLimitations.", items: { type: "string" } }
          }
        },
        PostAcceptObservation: {
          type: "object",
          additionalProperties: false,
          required: [
            "status",
            "acceptanceExercised",
            "observationCount",
            "productionProjectable",
            "evidenceDisposition",
            "indeterminateReason",
            "verdict",
            "interpretation",
            "observationStrategy",
            "termination",
            "completedAt",
            "coverageLimitations",
            "limitations"
          ],
          properties: {
            status: { type: "string", enum: ["confirmed_observation", "confirmed_clean", "unconfirmed", "not_attempted", "unsupported", "aborted"] },
            acceptanceExercised: { type: "boolean" },
            observationCount: { type: "integer", minimum: 0 },
            productionProjectable: { type: "boolean" },
            evidenceDisposition: { type: "string", enum: ["confirmed", "indeterminate"] },
            indeterminateReason: { type: ["string", "null"], maxLength: 160 },
            verdict: {
              type: "string",
              enum: [
                "eligible_nonessential_activity_observed_after_confirmed_acceptance",
                "retained_consent_signal_contradiction_observed_after_confirmed_acceptance",
                "no_eligible_nonessential_activity_observed_during_completed_window",
                "no_confirmed_post_accept_verdict"
              ]
            },
            interpretation: { type: "string", maxLength: 500 },
            observationStrategy: { type: "string", enum: ["stop_on_first_eligible_activity", "not_applicable"] },
            termination: {
              type: "object",
              additionalProperties: false,
              required: ["kind", "intentional", "trigger"],
              properties: {
                kind: { type: "string", enum: ["evidence_satisfied", "window_elapsed", "unavailable"] },
                intentional: { type: "boolean" },
                trigger: { type: "string", enum: ["non_essential_request_observed", "non_essential_storage_write_observed", "acceptance_signal_contradiction_observed", "window_elapsed", "accept_control_not_observed", "accept_path_timeout", "accept_observation_window_truncated", "worker_failed", "unavailable"] }
              }
            },
            completedAt: { type: ["string", "null"], format: "date-time" },
            coverageLimitations: { type: "array", maxItems: 24, items: { type: "string" } },
            limitations: { type: "array", maxItems: 24, deprecated: true, description: "Deprecated compatibility alias for coverageLimitations.", items: { type: "string" } }
          }
        },
        GpcResponse: {
          type: "object",
          additionalProperties: false,
          required: ["status", "findingTitle", "summary", "scoreEffect", "legalInterpretation", "comparison", "californiaPolicy", "evidenceUrl"],
          properties: {
            status: { type: "string", enum: ["responsive", "no_observable_response", "indeterminate"] },
            findingTitle: { type: "string", enum: ["GPC response", "No observable GPC response"] },
            summary: { type: "string", minLength: 1, maxLength: 2000 },
            scoreEffect: { type: "string", const: "none", description: "The jurisdiction-neutral GPC comparison itself is score-neutral." },
            legalInterpretation: { type: "string", const: "not_assessed" },
            comparison: {
              type: "object",
              additionalProperties: false,
              required: ["comparable", "protocol", "baselineArtifact", "gpcArtifact", "enabledProof", "deltas", "limitationKeys"],
              properties: {
                comparable: { type: "boolean" },
                protocol: { type: "string", const: "passive_baseline_with_sec_gpc" },
                baselineArtifact: {
                  type: "object",
                  additionalProperties: false,
                  required: ["lane", "sha256", "sizeBytes"],
                  properties: {
                    lane: { type: "string", const: "runtime_evidence" },
                    sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
                    sizeBytes: { type: "integer", minimum: 0 }
                  }
                },
                gpcArtifact: {
                  type: "object",
                  additionalProperties: false,
                  required: ["lane", "sha256", "sizeBytes"],
                  properties: {
                    lane: { type: "string", const: "gpc_observation" },
                    sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
                    sizeBytes: { type: "integer", minimum: 0 }
                  }
                },
                enabledProof: {
                  type: "object",
                  additionalProperties: false,
                  required: ["secGpcHeaderValue", "requestsWithSecGpc", "requestEventIds", "navigatorGlobalPrivacyControl"],
                  properties: {
                    secGpcHeaderValue: { type: "string", const: "1" },
                    requestsWithSecGpc: { type: "integer", minimum: 0 },
                    requestEventIds: { type: "array", maxItems: 100, items: { type: "string", minLength: 1, maxLength: 160 } },
                    navigatorGlobalPrivacyControl: { type: "boolean", const: true }
                  }
                },
                deltas: {
                  type: "object",
                  additionalProperties: false,
                  required: ["cookies", "trackers", "advertisingOrMeasurementActivity", "consentOrCmpBehavior"],
                  properties: Object.fromEntries(
                    ["cookies", "trackers", "advertisingOrMeasurementActivity", "consentOrCmpBehavior"].map((key) => [key, {
                      type: "object",
                      additionalProperties: false,
                      required: ["baselineCount", "gpcCount", "countDelta", "baselineOnly", "gpcOnly", "shared"],
                      properties: {
                        baselineCount: { type: "integer", minimum: 0 },
                        gpcCount: { type: "integer", minimum: 0 },
                        countDelta: { type: "integer" },
                        baselineOnly: { type: "array", maxItems: 100, items: { type: "string", minLength: 1, maxLength: 500 } },
                        gpcOnly: { type: "array", maxItems: 100, items: { type: "string", minLength: 1, maxLength: 500 } },
                        shared: { type: "array", maxItems: 100, items: { type: "string", minLength: 1, maxLength: 500 } }
                      }
                    }]))
                },
                limitationKeys: { type: "array", maxItems: 24, items: { type: "string", minLength: 1, maxLength: 160 } }
              }
            },
            californiaPolicy: {
              type: "object",
              additionalProperties: false,
              required: ["applied", "deductionPoints"],
              properties: {
                applied: { type: "boolean" },
                deductionPoints: { type: "integer", enum: [0, 15] }
              }
            },
            evidenceUrl: { type: "string", format: "uri" }
          }
        },
        PreConsentRuntimePreview: {
          type: "object",
          additionalProperties: false,
          required: ["type", "resultStage", "final", "sourceLane", "generatedAt", "runtimeCoverage", "summary", "cookies", "trackers", "truncated", "mustContinuePolling", "observationOnlyDisclaimer"],
          properties: {
            type: { type: "string", const: "certscore_pre_consent_preview" },
            resultStage: { type: "string", const: "preliminary" },
            final: { type: "boolean", const: false },
            sourceLane: { type: "string", const: "runtime_evidence" },
            generatedAt: { type: "string", format: "date-time" },
            runtimeCoverage: {
              type: "object",
              additionalProperties: false,
              required: ["status", "limitationKeys"],
              properties: {
                status: { type: "string", enum: ["usable", "limited_partial", "limited_none", "not_applicable"] },
                limitationKeys: { type: "array", maxItems: 16, items: { type: "string", minLength: 1, maxLength: 120 } }
              }
            },
            summary: {
              type: "object",
              additionalProperties: false,
              required: ["cookieCount", "trackerCount", "thirdPartyRequestCount", "vendorCount"],
              properties: {
                cookieCount: { type: "integer", minimum: 0 },
                returnedCookieCount: { type: "integer", minimum: 0, description: "Number of cookie identity rows included in this bounded preview." },
                trackerCount: { type: "integer", minimum: 0, deprecated: true, description: "Compatibility alias for trackingVendorCount; not comparable to the completed inventory's broader trackerCount." },
                trackingVendorCount: { type: "integer", minimum: 0, description: "Unique non-operational vendor/product/purpose observations captured at the checkpoint." },
                returnedTrackingVendorCount: { type: "integer", minimum: 0, description: "Number of tracking-vendor identity rows included in this bounded preview." },
                operationalVendorCount: { type: "integer", minimum: 0, description: "Unique infrastructure, security, and consent-management vendor observations captured separately from tracking vendors." },
                returnedOperationalVendorCount: { type: "integer", minimum: 0 },
                thirdPartyRequestCount: { type: "integer", minimum: 0 },
                vendorCount: { type: "integer", minimum: 0 }
              }
            },
            cookies: {
              type: "array",
              maxItems: 20,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name", "domain", "party", "purpose", "essentiality", "observedAtMs"],
                properties: {
                  name: { type: "string", minLength: 1, maxLength: 256 },
                  domain: { type: ["string", "null"], minLength: 1, maxLength: 253 },
                  party: { type: "string", enum: ["first_party", "third_party", "unknown"] },
                  purpose: { type: "string", enum: ["analytics", "advertising", "marketing", "personalization", "session_replay", "consent_management", "tag_management", "infrastructure", "security", "performance_monitoring", "customer_support", "unknown"] },
                  essentiality: { type: "string", enum: ["essential", "non_essential", "unknown"] },
                  observedAtMs: { type: ["integer", "null"], minimum: 0 }
                }
              }
            },
            trackers: {
              type: "array",
              maxItems: 20,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["vendor", "product", "purpose", "confidence", "domains"],
                properties: {
                  vendor: { type: "string", minLength: 1, maxLength: 160 },
                  product: { type: ["string", "null"], minLength: 1, maxLength: 160 },
                  purpose: { type: "string", enum: ["analytics", "advertising", "marketing", "personalization", "session_replay", "consent_management", "tag_management", "infrastructure", "security", "performance_monitoring", "customer_support", "unknown"] },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                  domains: { type: "array", maxItems: 8, items: { type: "string", minLength: 1, maxLength: 253 } }
                }
              }
            },
            operationalVendors: {
              type: "array",
              maxItems: 20,
              description: "Infrastructure, security, and consent-management vendors observed separately from trackingVendorCount.",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["vendor", "product", "purpose", "confidence", "domains"],
                properties: {
                  vendor: { type: "string", minLength: 1, maxLength: 160 },
                  product: { type: ["string", "null"], minLength: 1, maxLength: 160 },
                  purpose: { type: "string", enum: ["analytics", "advertising", "marketing", "personalization", "session_replay", "consent_management", "tag_management", "infrastructure", "security", "performance_monitoring", "customer_support", "unknown"] },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                  domains: { type: "array", maxItems: 8, items: { type: "string", minLength: 1, maxLength: 253 } }
                }
              }
            },
            truncated: {
              type: "object",
              additionalProperties: false,
              required: ["cookies", "trackers"],
              properties: { cookies: { type: "boolean" }, trackers: { type: "boolean" }, operationalVendors: { type: "boolean" } }
            },
            mustContinuePolling: { type: "boolean", const: true },
            observationOnlyDisclaimer: { type: "string", minLength: 1, maxLength: 500 }
          }
        },
        ScanJob: {
          type: "object",
          additionalProperties: true,
          required: ["type", "jobId", "status"],
          properties: {
            type: { type: "string", const: "certscore_scan_job" },
            jobId: { type: "string" },
            scanId: { type: ["string", "null"] },
            domain: { type: ["string", "null"] },
            url: { type: ["string", "null"] },
            status: { type: "string", enum: ["queued", "running", "finalizing", "completed", "completed_limited", "failed", "expired", "rate_limited"] },
            resultDisposition: { type: "string", enum: ["no_go"] },
            noGo: { type: "object", additionalProperties: true, description: "Reason-specific public no-go presentation; includes reasonCode, title, explanation, summary, limitationKind, recommendedNextAction, retryLikelyToHelp, and a bounded evidenceExcerpt when available." },
            phase: { type: "string" },
            createdAt: { type: "string" },
            startedAt: { type: ["string", "null"] },
            completedAt: { type: ["string", "null"] },
            scanTimeSeconds: { type: ["number", "null"] },
            score: { type: ["integer", "null"], minimum: 0, maximum: 100 },
            scoreStatus: { type: "string", enum: ["provisional", "final"] },
            scoreVersion: { type: ["string", "null"] },
            scoreUpdatedAt: { type: ["string", "null"], format: "date-time" },
            riskLevel: { type: ["string", "null"] },
            gpcResponse: { $ref: "#/components/schemas/GpcResponse" },
            postAcceptObservation: { $ref: "#/components/schemas/PostAcceptObservation" },
            postRefusalObservation: { $ref: "#/components/schemas/PostRefusalObservation" },
            preConsentPreview: { $ref: "#/components/schemas/PreConsentRuntimePreview" },
            coverage: { type: ["object", "null"], additionalProperties: true },
            lastUpdatedAt: { type: "string" },
            phaseStartedAt: { type: ["string", "null"] },
            lastHeartbeatAt: { type: ["string", "null"] },
            progressPercent: { type: "integer", minimum: 0, maximum: 100 },
            progressIsEstimate: { type: "boolean" },
            estimatedRemainingSeconds: { type: ["integer", "null"], minimum: 0 },
            stalled: { type: "boolean" },
            retryAfterSeconds: { type: ["integer", "null"] },
            error: {
              type: "object",
              required: ["code", "message", "retryable", "retryAfterSeconds", "recommendedNextAction"],
              properties: {
                code: { type: "string" },
                reasonCode: { type: ["string", "null"], enum: ["non_public_target", null] },
                message: { type: "string" },
                retryable: { type: "boolean" },
                retryAfterSeconds: { type: ["integer", "null"] },
                recommendedNextAction: { type: "string" }
              }
            },
            reportUrl: { type: ["string", "null"] },
            recommendedNextAction: { type: "string" },
            executionMode: { type: "string", enum: ["new_scan", "reused_scan"] },
            reused: { type: "boolean" },
            reusedScanAgeSeconds: { type: ["integer", "null"], minimum: 0 },
            freshnessDecision: { type: "string" },
            quotaConsumed: { type: "boolean" },
            anonymousQuotaLimit: { type: ["integer", "null"], minimum: 0 },
            anonymousQuotaRemaining: { type: ["integer", "null"], minimum: 0 },
            anonymousQuotaResetAt: { type: ["string", "null"], format: "date-time" },
            upgradeSupportEmail: { type: ["string", "null"], format: "email" },
            upgradeMessage: { type: ["string", "null"], description: "Higher-volume contact guidance for no-account callers." },
            recommendedNextTool: { type: "string", enum: ["certscore_get_scan_status", "certscore_get_scan_bundle"] },
            links: { $ref: "#/components/schemas/Links" },
            disclaimer: { type: "string" }
          }
        },
        Scan: {
          type: "object",
          additionalProperties: true,
          required: ["type", "scanId", "domain", "status"],
          properties: {
            type: { type: "string", const: "certscore_scan" },
            scanId: { type: "string" },
            domain: { type: "string" },
            url: { type: ["string", "null"] },
            status: { type: "string" },
            resultDisposition: { type: "string", enum: ["no_go"] },
            noGo: { type: "object", additionalProperties: true, description: "Reason-specific public no-go presentation; includes reasonCode, title, explanation, summary, limitationKind, recommendedNextAction, retryLikelyToHelp, and a bounded evidenceExcerpt when available." },
            scanFrom: { type: "string" },
            createdAt: { type: ["string", "null"] },
            startedAt: { type: ["string", "null"] },
            completedAt: { type: ["string", "null"] },
            scanTimeSeconds: { type: ["number", "null"] },
            score: { type: ["integer", "null"], minimum: 0, maximum: 100 },
            scoreStatus: { type: "string", enum: ["provisional", "final"] },
            scoreVersion: { type: ["string", "null"] },
            scoreUpdatedAt: { type: ["string", "null"], format: "date-time" },
            riskLevel: { type: ["string", "null"] },
            gpcResponse: { $ref: "#/components/schemas/GpcResponse" },
            postAcceptObservation: { $ref: "#/components/schemas/PostAcceptObservation" },
            postRefusalObservation: { $ref: "#/components/schemas/PostRefusalObservation" },
            coverage: { type: "object", additionalProperties: true },
            executionMode: { type: "string", enum: ["new_scan", "reused_scan"] },
            reused: { type: "boolean" },
            reusedScanAgeSeconds: { type: ["integer", "null"], minimum: 0 },
            freshnessDecision: { type: "string" },
            quotaConsumed: { type: "boolean" },
            anonymousQuotaLimit: { type: ["integer", "null"], minimum: 0 },
            anonymousQuotaRemaining: { type: ["integer", "null"], minimum: 0 },
            anonymousQuotaResetAt: { type: ["string", "null"], format: "date-time" },
            upgradeSupportEmail: { type: ["string", "null"], format: "email" },
            upgradeMessage: { type: ["string", "null"], description: "Higher-volume contact guidance for no-account callers." },
            recommendedNextTool: { type: "string", enum: ["certscore_get_scan_status", "certscore_get_scan_bundle"] },
            links: { $ref: "#/components/schemas/Links" },
            disclaimer: { type: "string" }
          }
        },
        ScanDiagnostics: {
          type: "object",
          additionalProperties: false,
          required: ["type", "schemaVersion", "scanId", "generatedAt", "totalWallMs", "phases", "lanes", "policyDiscovery"],
          properties: {
            type: { type: "string", const: "certscore_scan_diagnostics" },
            schemaVersion: { type: "string", const: "scan-diagnostics.v1" },
            scanId: { type: "string" },
            generatedAt: { type: ["string", "null"] },
            totalWallMs: { type: ["integer", "null"], minimum: 0 },
            phases: {
              type: "array",
              maxItems: 20,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name", "lane", "startedAtMs", "completedAtMs", "durationMs", "outcome"],
                properties: {
                  name: { type: "string", maxLength: 120 },
                  lane: { type: "string", enum: ["scanner", "browser", "policy", "persistence"] },
                  startedAtMs: { type: ["integer", "null"], minimum: 0 },
                  completedAtMs: { type: ["integer", "null"], minimum: 0 },
                  durationMs: { type: "integer", minimum: 0 },
                  outcome: { type: "string", enum: ["success", "degraded", "failed", "unknown"] }
                }
              }
            },
            lanes: {
              type: "array",
              maxItems: 8,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["laneId", "physicalInvocationId", "region", "phaseName", "startedAt", "firstResponse", "navigationCount", "challengeDetection", "executionOutcome", "accessOutcome", "completedAt", "durationMs"],
                properties: {
                  laneId: { type: "string", enum: ["consent_proof", "runtime_evidence", "policy_evidence"] },
                  physicalInvocationId: { type: "string", maxLength: 160 },
                  region: { type: "string", maxLength: 80 },
                  phaseName: { type: "string", enum: ["preConsentRuntimeScanner", "policySurfaceScanner"] },
                  startedAt: { type: "string", format: "date-time" },
                  firstResponse: {
                    anyOf: [
                      {
                        type: "object",
                        additionalProperties: false,
                        required: ["at", "offsetMs", "httpStatus", "effectiveUrl"],
                        properties: {
                          at: { type: "string", format: "date-time" },
                          offsetMs: { type: "integer", minimum: 0 },
                          httpStatus: { type: "integer", minimum: 100, maximum: 599 },
                          effectiveUrl: { type: ["string", "null"], maxLength: 500 }
                        }
                      },
                      { type: "null" }
                    ]
                  },
                  navigationCount: { type: "integer", minimum: 0 },
                  challengeDetection: {
                    type: "object",
                    additionalProperties: false,
                    required: ["detected", "type"],
                    properties: {
                      detected: { type: "boolean" },
                      type: { type: ["string", "null"], maxLength: 120 }
                    }
                  },
                  executionOutcome: { type: "string", enum: ["success", "degraded", "failed"] },
                  accessOutcome: { type: "string", enum: ["representative_page", "bot_challenge", "access_denied", "blank_or_unusable", "navigation_failed", "unknown"] },
                  completedAt: { type: ["string", "null"], format: "date-time" },
                  durationMs: { type: "integer", minimum: 0 }
                }
              }
            },
            policyDiscovery: {
              type: "object",
              additionalProperties: false,
              required: ["candidatesDiscovered", "candidatesAfterDeduplication", "requestsStarted", "successfulDocuments", "timeouts", "phaseWallMs", "maxConcurrency", "shortCircuitReason"],
              properties: {
                candidatesDiscovered: { type: ["integer", "null"], minimum: 0 },
                candidatesAfterDeduplication: { type: ["integer", "null"], minimum: 0 },
                requestsStarted: { type: ["integer", "null"], minimum: 0 },
                successfulDocuments: { type: ["integer", "null"], minimum: 0 },
                timeouts: { type: ["integer", "null"], minimum: 0 },
                phaseWallMs: { type: ["integer", "null"], minimum: 0 },
                maxConcurrency: { type: ["integer", "null"], minimum: 1, maximum: 16 },
                shortCircuitReason: { type: ["string", "null"], maxLength: 160 }
              }
            },
            links: { $ref: "#/components/schemas/Links" },
            disclaimer: { type: "string" }
          }
        },
        FindingList: {
          type: "object",
          additionalProperties: true,
          required: ["type", "scanId", "findings"],
          properties: {
            type: { type: "string", const: "certscore_finding_list" },
            scanId: { type: "string" },
            findings: { type: "array", items: { $ref: "#/components/schemas/Finding" } },
            links: { $ref: "#/components/schemas/Links" },
            disclaimer: { type: "string" }
          }
        },
        Finding: {
          type: "object",
          additionalProperties: true,
          required: ["type", "id", "scanId", "label", "criticality", "confidence", "plainEnglish", "evidence"],
          properties: {
            type: { type: "string", const: "certscore_finding" },
            id: { type: "string" },
            scanId: { type: "string" },
            label: { type: "string" },
            criticality: { type: "string" },
            confidence: { type: "string", enum: ["strong", "good", "moderate", "weak", "unknown"] },
            plainEnglish: { type: "string" },
            reviewLenses: { type: "array", items: { type: "string" } },
            evidence: { $ref: "#/components/schemas/EvidenceSummary" },
            nextStep: { type: ["string", "null"] },
            links: { $ref: "#/components/schemas/Links" },
            disclaimer: { type: "string" }
          }
        },
        EvidenceSummary: {
          type: "object",
          additionalProperties: false,
          required: ["basis", "summary", "exampleCount", "examplesShown"],
          properties: {
            basis: { type: "string", enum: ["runtime_observation", "policy_surface_detection", "accessibility_check", "public_report_projection"] },
            summary: { type: "string" },
            phase: { type: ["string", "null"] },
            exampleCount: { type: "integer", minimum: 0 },
            examplesShown: { type: "integer", minimum: 0 },
            examplesAvailable: {
              type: "integer",
              minimum: 0,
              description: "Total bounded evidence examples available to this projection before public response caps are applied."
            },
            authRequiredForExamples: {
              type: "boolean",
              description: "True only when additional public-safe examples are withheld because the caller lacks authorization."
            },
            examples: {
              type: "array",
              maxItems: 5,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  type: { type: "string", enum: ["request", "page", "accessibility_check", "policy_surface"] },
                  vendor: { type: ["string", "null"] },
                  urlHost: { type: ["string", "null"] },
                  registrableDomain: { type: ["string", "null"] },
                  observedAtMs: { type: ["integer", "null"] },
                  phase: { type: ["string", "null"] },
                  documentUrl: { type: ["string", "null"], maxLength: 2048 },
                  pageContextId: { type: ["string", "null"], maxLength: 120 },
                  requestUrl: {
                    type: ["string", "null"],
                    maxLength: 2048,
                    description: "Public-safe request URL sample with query parameters redacted."
                  },
                  rawObservedVendor: {
                    type: ["string", "null"],
                    maxLength: 160,
                    description: "Original bounded vendor label retained before canonical endpoint resolution."
                  },
                  rawObservedVendorCategory: { type: ["string", "null"], maxLength: 120 },
                  resolvedEndpointVendor: {
                    type: ["string", "null"],
                    maxLength: 160,
                    description: "Canonical endpoint-resolved vendor label when available."
                  },
                  resolvedEndpointVendorCategory: { type: ["string", "null"], maxLength: 120 },
                  vendorAttributionBasis: { type: ["string", "null"], maxLength: 120 },
                  relatedOrInitiatingVendor: { type: ["string", "null"], maxLength: 160 },
                  resourceType: { type: ["string", "null"], maxLength: 80 },
                  scannedPageUrl: { type: ["string", "null"], maxLength: 2048 },
                  frameUrl: { type: ["string", "null"], maxLength: 2048 },
                  finalUrl: { type: ["string", "null"], maxLength: 2048 },
                  initiatorHost: { type: ["string", "null"], maxLength: 253 },
                  initiatorType: { type: ["string", "null"], maxLength: 80 },
                  initiatorUrl: { type: ["string", "null"], maxLength: 2048 },
                  redirectChain: {
                    type: "array",
                    maxItems: 10,
                    items: { type: "string", maxLength: 2048 }
                  },
                  projectionWarnings: {
                    type: "array",
                    maxItems: 12,
                    items: { type: "string", maxLength: 120 }
                  }
                }
              }
            },
            projectionWarnings: {
              type: "array",
              maxItems: 20,
              items: { type: "string", maxLength: 120 },
              description: "Diagnostic projection warnings for reviewer workflows; they do not affect finding status or severity."
            },
            excerpt: {
              type: "object",
              additionalProperties: false,
              required: ["excerpt", "isTruncated", "truncationMarker", "sourceUrl", "evidenceUrl"],
              properties: {
                excerpt: { type: "string" },
                isTruncated: { type: "boolean" },
                truncationMarker: { type: ["string", "null"] },
                sourceUrl: { type: ["string", "null"], maxLength: 2048 },
                evidenceUrl: { type: "string", maxLength: 2048 }
              }
            },
            hasTimingAnchor: { type: "boolean" },
            hasVendorAnchor: { type: "boolean" },
            hasConsentContext: { type: "boolean" },
            hasPolicyAnchor: { type: "boolean" }
          }
        },
        DomainLatestScan: {
          type: "object",
          additionalProperties: true,
          required: ["type", "domain", "scan"],
          properties: {
            type: { type: "string", const: "certscore_domain_latest_scan" },
            domain: { type: "string" },
            scan: { oneOf: [{ $ref: "#/components/schemas/Scan" }, { type: "null" }] },
            links: { $ref: "#/components/schemas/Links" },
            disclaimer: { type: "string" }
          }
        },
        ScanPulse: {
          type: "object",
          additionalProperties: true,
          required: ["type", "scanId", "pulse"],
          properties: {
            type: { type: "string", const: "certscore_scan_pulse" },
            scanId: { type: "string" },
            resultDisposition: { type: "string", enum: ["no_go"] },
            noGo: { type: "object", additionalProperties: true, description: "Reason-specific public no-go presentation; includes reasonCode, title, explanation, summary, limitationKind, recommendedNextAction, retryLikelyToHelp, and a bounded evidenceExcerpt when available." },
            pulse: { type: "object", additionalProperties: true },
            links: { $ref: "#/components/schemas/Links" },
            disclaimer: { type: "string" }
          }
        },
        PreConsentCookiesTrackers: {
          type: "object",
          additionalProperties: true,
          required: ["type", "scanId", "domain", "summary", "rows"],
          properties: {
            type: { type: "string", const: "certscore_pre_consent_cookies_trackers" },
            scanId: { type: "string" },
            domain: { type: "string" },
            generatedAt: { type: ["string", "null"] },
            summary: {
              type: "object",
              additionalProperties: false,
              required: ["rowCount", "trackerCount", "cookieCount", "requestCount"],
              properties: {
                rowCount: { type: "integer", minimum: 0 },
                trackerCount: { type: "integer", minimum: 0, description: "Canonical inventory rows with kind=tracker, including operational categories." },
                trackerCountScope: { type: "string", const: "canonical_inventory_rows_including_operational" },
                trackerCategoryCounts: {
                  type: "object",
                  additionalProperties: false,
                  required: ["advertising", "analytics", "essential", "functional", "review"],
                  properties: {
                    advertising: { type: "integer", minimum: 0 },
                    analytics: { type: "integer", minimum: 0 },
                    essential: { type: "integer", minimum: 0 },
                    functional: { type: "integer", minimum: 0 },
                    review: { type: "integer", minimum: 0 }
                  }
                },
                cookieCount: { type: "integer", minimum: 0 },
                requestCount: { type: "integer", minimum: 0 }
              }
            },
            rows: {
              type: "array",
              items: { $ref: "#/components/schemas/PreConsentCookiesTrackersRow" }
            },
            links: { $ref: "#/components/schemas/Links" },
            disclaimer: { type: "string" }
          }
        },
        PreConsentCookiesTrackersRow: {
          type: "object",
          additionalProperties: false,
          required: ["id", "kind", "name", "phase", "observedBeforeConsent", "evidenceBasis"],
          properties: {
            id: { type: "string" },
            kind: { type: "string", enum: ["cookie", "tracker", "request", "storage", "unknown"] },
            name: { type: "string" },
            vendor: { type: ["string", "null"] },
            host: { type: ["string", "null"], description: "Host only; full URLs and query strings are not exposed." },
            registrableDomain: { type: ["string", "null"] },
            category: { type: ["string", "null"] },
            purpose: { type: ["string", "null"] },
            priority: { type: "string", enum: ["high", "medium", "review_needed", "contextual", "unknown"] },
            confidence: { type: "string", enum: ["high", "medium", "low", "unknown"] },
            party: { type: "string", enum: ["first_party", "third_party", "mixed", "unknown"] },
            requestCount: { type: ["integer", "null"], minimum: 0 },
            phase: { type: "string", const: "pre_consent" },
            observedBeforeConsent: { type: "boolean" },
            evidenceBasis: { type: "string", const: "public_report_projection" },
            firstObservedAtMs: { type: ["integer", "null"], minimum: 0 },
            pageUrlHost: { type: ["string", "null"] }
          }
        },
        Links: {
          type: "object",
          additionalProperties: true,
          properties: {
            self: { type: "string" },
            status: { type: "string" },
            findings: { type: "string" },
            pulse: { type: "string" },
            report: { type: "string" },
            latestDomainScan: { type: "string" },
            docs: { type: "string" }
          }
        },
        ApiError: {
          type: "object",
          additionalProperties: true,
          required: ["type", "error"],
          properties: {
            type: { type: "string", const: "certscore_api_error" },
            error: {
              type: "object",
              required: ["code", "message", "retryable", "retryAfterSeconds", "recommendedNextAction"],
              additionalProperties: true,
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                retryable: { type: "boolean" },
                retryAfterSeconds: { type: ["integer", "null"] },
                recommendedNextAction: { type: "string" },
                rateLimit: {
                  type: "object",
                  additionalProperties: false,
                  description: "Present for weighted scan-read throttles. Values identify the exact canonical policy decision.",
                  required: ["policyVersion", "profile", "scope", "windowId", "windowSeconds", "limitUnits", "usedUnits", "requestedUnits"],
                  properties: {
                    policyVersion: { type: "string" },
                    profile: { type: "string", enum: ["terminal", "status"] },
                    scope: { type: "string", enum: ["callerTarget", "target", "caller"] },
                    windowId: { type: "string", enum: ["burst", "daily"] },
                    windowSeconds: { type: "integer" },
                    limitUnits: { type: "integer" },
                    usedUnits: { type: "integer" },
                    requestedUnits: { type: "integer" }
                  }
                },
                creationRateLimit: {
                  type: "object",
                  additionalProperties: false,
                  description: "Present for new-scan quota or concurrency throttles.",
                  required: ["kind", "scope", "windowId", "windowSeconds", "limit", "used", "remaining"],
                  properties: {
                    kind: { type: "string", enum: ["new_scan", "concurrency"] },
                    scope: { type: "string", enum: ["session", "ip", "surface", "requester"] },
                    windowId: { type: "string", enum: ["burst", "daily", "concurrent"] },
                    windowSeconds: { type: ["integer", "null"] },
                    limit: { type: "integer" },
                    used: { type: "integer" },
                    remaining: { type: "integer" }
                  }
                }
              }
            },
            links: { $ref: "#/components/schemas/Links" },
            disclaimer: { type: "string" }
          }
        },
        Health: {
          type: "object",
          required: ["ok", "service", "version"],
          properties: {
            ok: { type: "boolean", const: true },
            service: { type: "string", const: "certscore-api" },
            version: { type: "string", const: "v2" },
            generatedAt: { type: "string", format: "date-time" }
          }
        }
      }
    }
  } as const;
}

export type CertScoreApiV2OpenApiDocument = ReturnType<typeof buildCertScoreApiV2OpenApiDocument>;
