const EMAIL = "support@certscore.ai";
const DISCLAIMER =
  "CertScore provides automated public-web observations for review. Results may be incomplete or contain errors. CertScore does not provide legal advice, certify compliance, or determine whether a website violates law. Always review the underlying evidence and consult qualified counsel or subject-matter experts where appropriate.";

const meta = {
  apiVersion: "v1",
  schemaVersion: "1.0.0",
  pulseVersion: "2026-05-18",
  projectionVersion: "pulse-public-v1",
  generatedAt: "2026-05-18T23:15:32Z"
};

const pulseTiny = {
  type: "certscore_pulse",
  meta: { ...meta, format: "json", detail: "tiny" },
  domain: "example.com",
  scanId: "scan_abc123",
  scanStatus: "completed",
  summary: { headline: "Automated scan surfaced review signals.", score: 72, riskLevel: "review_recommended" },
  topFindings: [{ id: "pre_consent_tracking_detected", label: "Tracking started before consent", criticality: "critical", confidence: "strong" }],
  feedback: { email: EMAIL },
  disclaimer: DISCLAIMER
};

const pulseStandard = {
  ...pulseTiny,
  meta: { ...meta, format: "json", detail: "standard" },
  request: { url: "https://example.com", detail: "standard", format: "json", freshness: "latest", waitSeconds: 0 },
  links: { docsUrl: "https://certscore.ai/api-pulse", fullReportUrl: "https://certscore.ai/scan/scan_abc123" }
};

const pulseFull = {
  ...pulseStandard,
  meta: { ...meta, format: "json", detail: "full" },
  findings: [
    {
      id: "pre_consent_tracking_detected",
      label: "Tracking started before consent",
      criticality: "critical",
      confidence: "strong",
      plainEnglish: "Runtime evidence showed non-essential tracking activity before a consent choice was recorded.",
      reviewLenses: ["GDPR / ePrivacy", "FTC"]
    }
  ]
};

function statusExample(status: string) {
  return {
    type: "certscore_pulse_status",
    meta,
    jobId: "pulse_job_123",
    status,
    statusUrl: "https://certscore.ai/api/v1/pulse/status/pulse_job_123",
    disclaimer: DISCLAIMER
  };
}

function errorExample(code: string, message: string, retryAfterSeconds: number | null = null) {
  return {
    type: "certscore_pulse_error",
    meta,
    error: { code, message, retryAfterSeconds },
    feedback: { email: EMAIL },
    disclaimer: DISCLAIMER
  };
}

const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "CertScore Pulse API",
    version: "1.0.0",
    description: DISCLAIMER
  },
  servers: [{ url: "https://certscore.ai" }],
  paths: {
    "/api/v1/pulse": {
      get: {
        summary: "Retrieve a CertScore Pulse for a public URL, scan, or job.",
        description: DISCLAIMER,
        parameters: [
          { name: "url", in: "query", schema: { type: "string" } },
          { name: "scanId", in: "query", schema: { type: "string" } },
          { name: "jobId", in: "query", schema: { type: "string" } },
          { name: "format", in: "query", schema: { enum: ["json", "markdown"], default: "json" } },
          { name: "detail", in: "query", schema: { enum: ["tiny", "quick", "standard", "full"], default: "standard" } },
          { name: "freshness", in: "query", schema: { enum: ["latest", "refresh"], default: "latest" } },
          { name: "wait", in: "query", schema: { type: "integer", minimum: 0, maximum: 80 } }
        ],
        responses: {
          "200": {
            description: "Completed Pulse.",
            content: {
              "application/json": { examples: { tiny: { value: pulseTiny }, standard: { value: pulseStandard }, full: { value: pulseFull } } },
              "text/markdown": { examples: { markdown: { value: `# CertScore Pulse: example.com\n\n${DISCLAIMER}` } } }
            }
          },
          "202": { description: "Pulse scan accepted or still pending.", content: { "application/json": { examples: { pending: { value: statusExample("running") } } } } },
          "400": { description: "Invalid input.", content: { "application/json": { examples: { invalidUrl: { value: errorExample("invalid_url", "Enter a valid public website URL or domain.") } } } } },
          "404": { description: "Scan or Pulse job not found.", content: { "application/json": { examples: { notFound: { value: errorExample("not_found", "Pulse job not found.") } } } } },
          "429": { description: "Rate limited.", content: { "application/json": { examples: { throttled: { value: errorExample("pulse_throttled", "A Pulse scan for this domain was requested recently. Try again in a few minutes.", 240) } } } } },
          "503": { description: "Temporary unavailable response.", content: { "application/json": { examples: { unavailable: { value: errorExample("internal_error", "Pulse is temporarily unavailable. Try again later.") } } } } }
        }
      }
    },
    "/api/v1/pulse/status/{jobId}": {
      get: {
        summary: "Retrieve Pulse job status.",
        parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Completed status.", content: { "application/json": { examples: { completed: { value: statusExample("completed") } } } } },
          "202": { description: "Queued or running status.", content: { "application/json": { examples: { running: { value: statusExample("running") } } } } },
          "404": { description: "Pulse job not found.", content: { "application/json": { examples: { notFound: { value: errorExample("not_found", "Pulse job not found.") } } } } }
        }
      }
    },
    "/api/v1/pulse/feedback": {
      post: {
        summary: "Submit private Pulse feedback.",
        responses: {
          "200": { description: "Feedback stored privately." },
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
