const purposeStatement =
  "CertScore Pulse uses automated runtime analysis of public websites to detect review signals around pre-consent tracking, third-party requests, consent enforcement gaps, cookie activity, accessibility issues, and disclosure inconsistencies.";

const standardDisclaimer =
  "CertScore provides automated public-web observations for review. Results may be incomplete or contain errors. CertScore does not provide legal advice, certify compliance, or determine whether a website violates law. Always review the underlying evidence and consult qualified counsel or subject-matter experts where appropriate.";

const pulseCapabilities = {
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

const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "CertScore Pulse API",
    version: "1.0.0",
    description: `${purposeStatement} ${standardDisclaimer}`
  },
  servers: [{ url: "https://certscore.ai" }],
  paths: {
    "/api/v1/pulse": {
      get: {
        summary: "Retrieve a CertScore Pulse summary for a URL, scan, or job.",
        description:
          `${purposeStatement} Use this endpoint for automated public-web observations for review; it does not provide legal advice, certification, or compliance determinations.`,
        parameters: [
          { name: "url", in: "query", schema: { type: "string" } },
          { name: "scanId", in: "query", schema: { type: "string" } },
          { name: "jobId", in: "query", schema: { type: "string" } },
          { name: "format", in: "query", schema: { type: "string", enum: ["json", "markdown"], default: "json" } },
          { name: "detail", in: "query", schema: { type: "string", enum: ["tiny", "quick", "standard", "full"], default: "standard" } },
          { name: "freshness", in: "query", schema: { type: "string", enum: ["latest", "refresh"], default: "latest" } },
          { name: "wait", in: "query", schema: { type: "integer", minimum: 0, maximum: 80 } }
        ],
        responses: {
          "200": {
            description: "Completed Pulse response",
            content: { "application/json": { schema: { $ref: "#/components/schemas/PulseResponse" } }, "text/markdown": { schema: { type: "string" } } }
          },
          "202": {
            description: "Pulse job queued or running",
            headers: { "Retry-After": { schema: { type: "integer" }, description: "Recommended polling delay in seconds." } },
            content: { "application/json": { schema: { $ref: "#/components/schemas/PulseStatus" } } }
          },
          "400": {
            description: "Invalid input",
            content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
          },
          "429": {
            description: "Throttled",
            headers: { "Retry-After": { schema: { type: "integer" }, description: "Recommended retry delay in seconds." } },
            content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
          }
        }
      }
    },
    "/api/v1/pulse/status/{jobId}": {
      get: {
        summary: "Retrieve Pulse job status.",
        description: `${purposeStatement} Use this endpoint after receiving a jobId or statusUrl from /api/v1/pulse.`,
        parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Pulse job status",
            content: { "application/json": { schema: { oneOf: [{ $ref: "#/components/schemas/PulseStatus" }, { $ref: "#/components/schemas/PulseResponse" }] } } }
          },
          "202": {
            description: "Pulse job queued or running",
            headers: { "Retry-After": { schema: { type: "integer" }, description: "Recommended polling delay in seconds." } },
            content: { "application/json": { schema: { $ref: "#/components/schemas/PulseStatus" } } }
          },
          "429": {
            description: "Pulse job is rate limited",
            headers: { "Retry-After": { schema: { type: "integer" }, description: "Recommended retry delay in seconds." } },
            content: { "application/json": { schema: { $ref: "#/components/schemas/PulseStatus" } } }
          },
          "404": {
            description: "Pulse job not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
          }
        }
      }
    },
    "/api/v1/pulse/feedback": {
      post: {
        summary: "Submit Pulse feedback.",
        responses: {
          "200": { description: "Feedback accepted" },
          "400": { description: "Invalid feedback" },
          "429": { description: "Throttled" }
        }
      }
    }
  },
  components: {
    schemas: {
      PulseCapabilities: {
        type: "object",
        required: ["method", "observes", "doesNotProvide"],
        properties: {
          method: { type: "string", const: pulseCapabilities.method },
          observes: { type: "array", items: { type: "string", enum: [...pulseCapabilities.observes] } },
          doesNotProvide: { type: "array", items: { type: "string", enum: [...pulseCapabilities.doesNotProvide] } }
        }
      },
      PulseFeedback: {
        type: "object",
        additionalProperties: true,
        required: ["email"],
        properties: {
          email: { type: "string", const: "support@certscore.ai" },
          feedbackUrl: { type: "string" }
        }
      },
      PulseCoverageInterruption: {
        type: "object",
        additionalProperties: true,
        required: ["label", "reason"],
        properties: {
          label: { type: "string" },
          reason: { type: "string" },
          reviewTitle: { type: "string" },
          reviewReason: { type: "string" }
        }
      },
      PulseResponse: {
        type: "object",
        additionalProperties: true,
        required: ["type", "meta", "summary", "topFindings", "links", "feedback", "capabilities", "disclaimer"],
        properties: {
          type: { type: "string", const: "certscore_pulse" },
          meta: { type: "object", additionalProperties: true },
          domain: { type: "string" },
          scanId: { type: "string" },
          scan_id: { type: "string" },
          scanStatus: { type: "string" },
          summary: {
            type: "object",
            additionalProperties: true,
            properties: {
              headline: { type: "string" },
              score: { type: ["integer", "null"] },
              riskLevel: { type: "string" },
              coverageNote: { type: "string" }
            }
          },
          topFindings: { type: "array", items: { type: "object", additionalProperties: true } },
          coverage: {
            type: "object",
            additionalProperties: true,
            properties: {
              status: { type: "string" },
              summary: { type: "string" },
              interruptionCount: { type: "integer" },
              interruptions: { type: "array", items: { $ref: "#/components/schemas/PulseCoverageInterruption" } }
            }
          },
          links: {
            type: "object",
            additionalProperties: true,
            properties: {
              canonicalPulseUrl: { type: "string" },
              fullReportUrl: { type: "string" },
              markdownUrl: { type: "string" },
              docsUrl: { type: "string" },
              findingsReferenceUrl: { type: "string" }
            }
          },
          feedback: { $ref: "#/components/schemas/PulseFeedback" },
          capabilities: { $ref: "#/components/schemas/PulseCapabilities" },
          disclaimer: { type: "string" }
        }
      },
      PulseStatus: {
        type: "object",
        additionalProperties: true,
        required: ["type", "jobId", "status", "capabilities", "disclaimer"],
        properties: {
          type: { type: "string", const: "certscore_pulse_status" },
          jobId: { type: "string" },
          scanId: { type: ["string", "null"] },
          scan_id: { type: ["string", "null"] },
          domain: { type: ["string", "null"] },
          status: { type: "string" },
          phase: { type: "string" },
          message: { type: "string" },
          resultUrl: { type: ["string", "null"] },
          reportUrl: { type: ["string", "null"] },
          retryAfterSeconds: { type: ["integer", "null"] },
          capabilities: { $ref: "#/components/schemas/PulseCapabilities" },
          disclaimer: { type: "string" }
        }
      },
      PulseError: {
        type: "object",
        additionalProperties: true,
        required: ["type", "error", "feedback", "disclaimer"],
        properties: {
          type: { type: "string", const: "certscore_pulse_error" },
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
          feedback: { $ref: "#/components/schemas/PulseFeedback" },
          disclaimer: { type: "string" }
        }
      }
    }
  }
} as const;

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function GET(request: Request) {
  const id = requestId(request);

  return new Response(JSON.stringify(openApiDocument), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-CertScore-Pulse": "v1",
      "X-CertScore-Route": "openapi",
      "X-CertScore-Request-Id": id,
      "X-Content-Type-Options": "nosniff"
    },
    status: 200
  });
}
