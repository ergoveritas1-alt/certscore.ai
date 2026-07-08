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
  domain: "example.com",
  url: "https://example.com",
  status: "completed",
  score: 82,
  riskLevel: "review_recommended",
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
  domain: "example.com",
  status: "running",
  phase: "scan_running",
  startedAt: "2026-06-30T12:00:01.000Z",
  completedAt: null,
  scanTimeSeconds: null,
  retryAfterSeconds: 10,
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
  domain: "example.com",
  scan: scanExample,
  links: {
    self: "https://certscore.ai/api/v2/domains/example.com/latest",
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
  domain: "example.com",
  generatedAt: "2026-06-30T12:00:10.000Z",
  summary: {
    rowCount: 2,
    trackerCount: 1,
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
      pageUrlHost: "example.com"
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
      pageUrlHost: "example.com"
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
  summary: { rowCount: 0, trackerCount: 0, cookieCount: 0, requestCount: 0 },
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
        value: { type: "certscore_api_error", error: { code: "invalid_request", message: "Invalid request." }, disclaimer: apiV2Disclaimer }
      },
      unauthorized: {
        summary: "Missing or invalid API key",
        value: { type: "certscore_api_error", error: { code: "unauthorized", message: "Missing or invalid API key." }, disclaimer: apiV2Disclaimer }
      },
      forbidden: {
        summary: "Missing required scope",
        value: { type: "certscore_api_error", error: { code: "forbidden", message: "API key is missing the required scope." }, disclaimer: apiV2Disclaimer }
      },
      notFound: {
        summary: "Resource not found",
        value: { type: "certscore_api_error", error: { code: "not_found", message: "Scan not found." }, disclaimer: apiV2Disclaimer }
      },
      rateLimited: {
        summary: "Rate limited",
        value: {
          type: "certscore_api_error",
          error: { code: "rate_limited", message: "Rate limit reached. Retry after the recommended delay.", retryAfterSeconds: 60 },
          disclaimer: apiV2Disclaimer
        }
      },
      internalError: {
        summary: "Temporary service error",
        value: {
          type: "certscore_api_error",
          error: { code: "internal_error", message: "CertScore API v2 is temporarily unavailable. Try again later." },
          disclaimer: apiV2Disclaimer
        }
      }
    }
  }
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
      "/api/v2/scans": {
        post: {
          operationId: "createScan",
          tags: ["Scans"],
          summary: "Create or reuse a CertScore public-web scan.",
          description:
            "Submit a public URL for CertScore automated public-web observations. The response may be a queued job or an already completed scan reference. " +
            "This v2 route reuses the existing Pulse scan creation, reuse, validation, and throttling path, then returns v2 Scan or ScanJob resources.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateScanRequest" },
                examples: {
                  create: {
                    summary: "Create or reuse a public-web scan",
                    value: { url: "https://example.com", freshness: "latest", scanFrom: "eu_ie" }
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
            "401": { description: "Missing or invalid API key.", headers: diagnosticHeaders, content: errorContent },
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
              schema: { type: "string", enum: ["eu_ie"], default: "eu_ie" },
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
            "429": { description: "Rate limited.", headers: { ...diagnosticHeaders, ...retryAfterHeader }, content: errorContent },
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
              schema: { type: "string", enum: ["eu_ie"], default: "eu_ie" }
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
            "429": { description: "Rate limited.", headers: { ...diagnosticHeaders, ...retryAfterHeader }, content: errorContent },
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
            scanFrom: { type: "string", enum: ["eu_ie"], default: "eu_ie" },
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
        ScanJob: {
          type: "object",
          additionalProperties: true,
          required: ["type", "jobId", "status"],
          properties: {
            type: { type: "string", const: "certscore_scan_job" },
            jobId: { type: "string" },
            scanId: { type: ["string", "null"] },
            domain: { type: ["string", "null"] },
            status: { type: "string", enum: ["queued", "running", "finalizing", "completed", "completed_limited", "failed", "expired", "rate_limited"] },
            phase: { type: "string" },
            createdAt: { type: "string" },
            startedAt: { type: ["string", "null"] },
            completedAt: { type: ["string", "null"] },
            scanTimeSeconds: { type: ["number", "null"] },
            lastUpdatedAt: { type: "string" },
            retryAfterSeconds: { type: ["integer", "null"] },
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
            scanFrom: { type: "string" },
            createdAt: { type: ["string", "null"] },
            startedAt: { type: ["string", "null"] },
            completedAt: { type: ["string", "null"] },
            scanTimeSeconds: { type: ["number", "null"] },
            score: { type: ["integer", "null"], minimum: 0, maximum: 100 },
            riskLevel: { type: ["string", "null"] },
            coverage: { type: "object", additionalProperties: true },
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
                  phase: { type: ["string", "null"] }
                }
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
                trackerCount: { type: "integer", minimum: 0 },
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
              required: ["code", "message"],
              additionalProperties: true,
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                retryAfterSeconds: { type: ["integer", "null"] }
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
