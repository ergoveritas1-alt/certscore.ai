const PULSE_FEEDBACK_EMAIL = "support@certscore.ai";
const PULSE_STANDARD_DISCLAIMER =
  "CertScore provides automated public-web observations for review. Results may be incomplete or contain errors. CertScore does not provide legal advice, certify compliance, or determine whether a website violates law. Always review the underlying evidence and consult qualified counsel or subject-matter experts where appropriate.";

const metaExample = {
  apiVersion: "v1",
  schemaVersion: "1.0.0",
  pulseVersion: "2026-05-18",
  projectionVersion: "pulse-public-v1",
  generatedAt: "2026-05-18T23:15:32Z",
  source: "certscore.ai"
};

const linksExample = {
  canonicalPulseUrl: "https://certscore.ai/pulse/example.com",
  jsonUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_abc123",
  markdownUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_abc123&format=markdown",
  fullJsonUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_abc123&detail=full",
  fullReportUrl: "https://certscore.ai/scan/scan_abc123",
  docsUrl: "https://certscore.ai/api-pulse",
  findingsReferenceUrl: "https://certscore.ai/findings"
};

const feedbackExample = {
  email: PULSE_FEEDBACK_EMAIL,
  feedbackUrl: "https://certscore.ai/pulse/feedback?pulseRequestId=pulse_req_123"
};

const tinyPulseExample = {
  type: "certscore_pulse",
  meta: { ...metaExample, format: "json", detail: "tiny" },
  domain: "example.com",
  scanId: "scan_abc123",
  scanStatus: "completed",
  summary: {
    headline: "Automated scan surfaced review signals.",
    score: 72,
    riskLevel: "review_recommended"
  },
  topFindings: [
    {
      id: "pre_consent_tracking_detected",
      label: "Tracking started before consent",
      criticality: "critical",
      confidence: "strong"
    }
  ],
  links: linksExample,
  feedback: feedbackExample,
  disclaimer: PULSE_STANDARD_DISCLAIMER
};

const standardPulseExample = {
  ...tinyPulseExample,
  meta: { ...metaExample, format: "json", detail: "standard" },
  request: {
    pulseRequestId: "pulse_req_123",
    url: "https://example.com",
    normalizedUrl: "https://example.com/",
    domain: "example.com",
    detail: "standard",
    format: "json",
    freshness: "latest",
    waitSeconds: 0,
    resolutionMode: "reused_existing_scan"
  },
  scan: { scanId: "scan_abc123", scanStatus: "completed", completedAt: "2026-05-18T23:15:31Z" },
  coverage: {
    status: "partial",
    summary: "Homepage findings are based on observable public-page evidence.",
    limitations: ["Automated public-web scan only.", "Coverage was limited; absence of findings should not be interpreted as absence of risk."]
  }
};

const fullPulseExample = {
  ...standardPulseExample,
  meta: { ...metaExample, format: "json", detail: "full" },
  findings: [
    {
      id: "pre_consent_tracking_detected",
      label: "Tracking started before consent",
      criticality: "critical",
      confidence: "strong",
      plainEnglish: "Runtime evidence showed non-essential tracking activity before a consent choice was recorded.",
      evidence: {
        summary: "A non-essential third-party tracking request was observed before the scan recorded a consent choice.",
        observedPhase: "before_consent",
        exampleEvents: [{ type: "request", vendor: "Example Analytics Vendor", urlHost: "analytics.example-vendor.test", timestampMs: 1137 }]
      },
      reviewLenses: ["GDPR / ePrivacy", "FTC"],
      nextStep: "Review whether observed vendors are necessary before consent or should be consent-gated."
    }
  ],
  reviewContext: {
    disclaimer: "Findings are organized by privacy, consumer protection, accessibility, and other review contexts. These are automated signals for review, not legal determinations."
  }
};

const pendingExample = {
  type: "certscore_pulse_status",
  meta: { ...metaExample, format: "json", detail: "standard" },
  jobId: "pulse_job_123",
  scanId: "scan_abc123",
  domain: "example.com",
  status: "running",
  phase: "runtime_observation",
  message: "Observing public-page behavior and collecting automated evidence signals.",
  elapsedSeconds: 28,
  estimatedWaitSeconds: 45,
  statusUrl: "https://certscore.ai/api/v1/pulse/status/pulse_job_123",
  nextCheckUrl: "https://certscore.ai/api/v1/pulse/status/pulse_job_123",
  disclaimer: PULSE_STANDARD_DISCLAIMER
};

function errorExample(code: string, message: string, retryAfterSeconds: number | null = null) {
  return {
    type: "certscore_pulse_error",
    meta: metaExample,
    error: { code, message, retryAfterSeconds },
    feedback: { email: PULSE_FEEDBACK_EMAIL },
    disclaimer: PULSE_STANDARD_DISCLAIMER
  };
}

const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "CertScore Pulse API",
    version: "1.0.0",
    description: `${PULSE_STANDARD_DISCLAIMER}\n\nAgent instructions: https://certscore.ai/api-pulse\nFindings reference: https://certscore.ai/findings`
  },
  servers: [{ url: "https://certscore.ai" }],
  paths: {
    "/api/v1/pulse": {
      get: {
        summary: "Retrieve a CertScore Pulse for a URL, scan, or job.",
        parameters: [
          { name: "url", in: "query", schema: { type: "string" }, description: "Public URL or domain to summarize." },
          { name: "scanId", in: "query", schema: { type: "string" }, description: "Existing public eligible scan ID." },
          { name: "jobId", in: "query", schema: { type: "string" }, description: "Existing Pulse job ID." },
          { name: "format", in: "query", schema: { enum: ["json", "markdown"], default: "json" }, description: "Response format." },
          {
            name: "detail",
            in: "query",
            schema: { enum: ["tiny", "quick", "standard", "full"], default: "standard" },
            description: "Detail level. quick is accepted as an alias for tiny and normalizes to the tiny response shape."
          },
          { name: "freshness", in: "query", schema: { enum: ["latest", "refresh"], default: "latest" }, description: "latest may reuse a completed Pulse; refresh requests a new scan subject to throttle." },
          { name: "wait", in: "query", schema: { type: "integer", minimum: 0, maximum: 80 }, description: "Maximum seconds to hold the HTTP request while queued/running work completes." }
        ],
        responses: {
          "200": {
            description: `Completed Pulse. ${PULSE_STANDARD_DISCLAIMER}`,
            content: {
              "application/json": { examples: { tiny: { value: tinyPulseExample }, standard: { value: standardPulseExample }, full: { value: fullPulseExample } } },
              "text/markdown": {
                examples: {
                  markdown: {
                    value: `# CertScore Pulse: example.com\n\nStatus: Completed\nScore: 72/100\n\n## Disclaimer\n\n${PULSE_STANDARD_DISCLAIMER}`
                  }
                }
              }
            }
          },
          "202": { description: "Pulse scan accepted or still pending.", content: { "application/json": { examples: { pending: { value: pendingExample } } } } },
          "400": { description: "Invalid URL or input.", content: { "application/json": { examples: { invalidUrl: { value: errorExample("invalid_url", "Enter a valid public website URL or domain.") } } } } },
          "404": { description: "Scan or Pulse job not found.", content: { "application/json": { examples: { notFound: { value: errorExample("not_found", "Pulse job not found.") } } } } },
          "429": {
            description: "Rate limited. Expensive scan creation is limited by normalized domain.",
            headers: { "Retry-After": { schema: { type: "integer" }, description: "Seconds to wait before retrying scan creation." } },
            content: { "application/json": { examples: { throttled: { value: errorExample("pulse_throttled", "A Pulse scan for this domain was requested recently. Try again in a few minutes.", 240) } } } }
          },
          "503": { description: "Temporary unavailable response with public-safe message.", content: { "application/json": { examples: { unavailable: { value: errorExample("internal_error", "Pulse is temporarily unavailable. Try again later.") } } } } }
        }
      }
    },
    "/api/v1/pulse/status/{jobId}": {
      get: {
        summary: "Retrieve Pulse job status.",
        parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Completed, completed-limited, or terminal public-safe status.", content: { "application/json": { examples: { completed: { value: { ...pendingExample, status: "completed", completedAt: "2026-05-18T23:15:31Z" } } } } } },
          "202": { description: "Queued, running, or finalizing status.", content: { "application/json": { examples: { running: { value: pendingExample } } } } },
          "404": { description: "Pulse job not found.", content: { "application/json": { examples: { notFound: { value: errorExample("not_found", "Pulse job not found.") } } } } }
        }
      }
    },
    "/api/v1/pulse/feedback": {
      post: {
        summary: "Submit private Pulse feedback.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["pulseRequestId", "rating"],
                properties: {
                  pulseRequestId: { type: "string" },
                  rating: { enum: ["useful", "not_useful", "unclear", "incorrect", "too_limited"] },
                  comment: { type: "string", maxLength: 2000 },
                  email: { type: "string", format: "email" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Feedback stored privately.", content: { "application/json": { examples: { success: { value: { type: "certscore_pulse_feedback", ok: true, feedback: { email: PULSE_FEEDBACK_EMAIL } } } } } } },
          "400": { description: "Invalid feedback." },
          "429": { description: "Feedback rate limited." }
        }
      }
    },
    "/.well-known/certscore-pulse": {
      get: { summary: "Discover CertScore Pulse API details.", responses: { "200": { description: "Pulse discovery metadata." } } }
    }
  }
} as const;

export function GET() {
  return new Response(JSON.stringify(openApiDocument, null, 2), {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Content-Type": "application/json; charset=utf-8",
      "Surrogate-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    },
    status: 200
  });
}
