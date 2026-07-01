import { PULSE_CAPABILITIES, PULSE_PURPOSE_STATEMENT, PULSE_SCHEMA_VERSION, PULSE_STANDARD_DISCLAIMER } from "./pulse-v1.js";

const diagnosticHeaders = {
  "x-certscore-pulse": { schema: { type: "string", const: "v1" }, description: "CertScore Pulse API version marker." },
  "x-certscore-route": { schema: { type: "string" }, description: "Public Pulse route identifier." },
  "x-certscore-request-id": { schema: { type: "string" }, description: "Request identifier for support and diagnostics." }
} as const;

const retryAfterHeader = {
  "Retry-After": { schema: { type: "integer" }, description: "Recommended retry or polling delay in seconds." }
} as const;

export function buildPulseV1OpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "CertScore Pulse API beta",
      version: PULSE_SCHEMA_VERSION,
      description: `Beta API. ${PULSE_PURPOSE_STATEMENT} ${PULSE_STANDARD_DISCLAIMER}`
    },
    servers: [{ url: "https://certscore.ai" }],
    paths: {
      "/api/v1/pulse": {
        get: {
          operationId: "getPulse",
          tags: ["Pulse"],
          summary: "Retrieve a CertScore Pulse summary for a URL, scan, or job.",
          description:
            `${PULSE_PURPOSE_STATEMENT} Use this endpoint for automated public-web observations for review; outputs are not legal advice, certification, or a compliance determination.`,
          parameters: [
            { name: "url", in: "query", schema: { type: "string" } },
            { name: "scanId", in: "query", schema: { type: "string" } },
            { name: "jobId", in: "query", schema: { type: "string" } },
            { name: "format", in: "query", schema: { type: "string", enum: ["json", "markdown"], default: "json" } },
            { name: "detail", in: "query", schema: { type: "string", enum: ["tiny", "quick", "standard", "full"], default: "standard" } },
            {
              name: "freshness",
              in: "query",
              description:
                "Use latest to reuse recent eligible scans. Use refresh to request a new scan when eligible; refresh bypasses the 24-hour recent-scan reuse check but not validation or throttles.",
              schema: { type: "string", enum: ["latest", "refresh"], default: "latest" }
            },
            {
              name: "scanFrom",
              in: "query",
              description: "Geo execution context for newly queued public Pulse scans. Existing scans are returned with their recorded context. Alias: geo.",
              schema: { type: "string", enum: ["eu_ie", "california"], default: "eu_ie" }
            },
            {
              name: "geo",
              in: "query",
              description: "Alias for scanFrom. Allowed values: eu_ie, california.",
              schema: { type: "string", enum: ["eu_ie", "california"], default: "eu_ie" }
            },
            {
              name: "forceNewScan",
              in: "query",
              description:
                "Compatibility override for freshness=refresh. Set true to bypass the 24-hour recent-scan reuse check. This does not bypass validation or the 1-minute scan-generation throttle.",
              schema: { type: "boolean", default: false }
            },
            { name: "wait", in: "query", schema: { type: "integer", minimum: 0, maximum: 80 } }
          ],
          responses: {
            "200": {
              description: "Completed Pulse response",
              headers: diagnosticHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/PulseResponse" } }, "text/markdown": { schema: { type: "string" } } }
            },
            "202": {
              description: "Pulse job queued or running",
              headers: { ...diagnosticHeaders, ...retryAfterHeader },
              content: { "application/json": { schema: { $ref: "#/components/schemas/PulseStatus" } } }
            },
            "400": {
              description: "Invalid input",
              headers: diagnosticHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
            },
            "401": {
              description: "Invalid or malformed API key",
              headers: diagnosticHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
            },
            "403": {
              description: "API key is missing the required scope",
              headers: diagnosticHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
            },
            "429": {
              description: "Throttled",
              headers: { ...diagnosticHeaders, ...retryAfterHeader },
              content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
            }
          }
        }
      },
      "/api/v1/pulse/status/{jobId}": {
        get: {
          operationId: "getPulseJobStatus",
          tags: ["Pulse"],
          summary: "Retrieve Pulse job status.",
          description: `${PULSE_PURPOSE_STATEMENT} Use this endpoint after receiving a jobId or statusUrl from /api/v1/pulse.`,
          parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Pulse job status",
              headers: diagnosticHeaders,
              content: { "application/json": { schema: { oneOf: [{ $ref: "#/components/schemas/PulseStatus" }, { $ref: "#/components/schemas/PulseResponse" }] } } }
            },
            "202": {
              description: "Pulse job queued or running",
              headers: { ...diagnosticHeaders, ...retryAfterHeader },
              content: { "application/json": { schema: { $ref: "#/components/schemas/PulseStatus" } } }
            },
            "429": {
              description: "Pulse job is rate limited",
              headers: { ...diagnosticHeaders, ...retryAfterHeader },
              content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
            },
            "404": {
              description: "Pulse job not found",
              headers: diagnosticHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
            }
          }
        }
      },
      "/api/v1/pulse-health": {
        get: {
          operationId: "getPulseHealth",
          tags: ["Diagnostics"],
          summary: "Dependency-free Pulse health canary.",
          description: "Returns lightweight JSON so agents and CI can verify the Pulse API layer is reachable.",
          responses: {
            "200": {
              description: "Pulse health response",
              headers: diagnosticHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/PulseHealth" } } }
            }
          }
        }
      },
      "/api/v1/pulse-self-test": {
        get: {
          operationId: "getPulseSelfTest",
          tags: ["Diagnostics"],
          summary: "Pulse public self-test route.",
          description:
            "Stable public canary for agents, CI, and humans to verify Pulse routes, capabilities, diagnostic headers, and public guidance.",
          responses: {
            "200": {
              description: "Pulse self-test response",
              headers: diagnosticHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/PulseSelfTest" } } }
            }
          }
        }
      },
      "/api/v1/pulse/feedback": {
        post: {
          operationId: "submitPulseFeedback",
          tags: ["Feedback"],
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
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Optional scoped CertScore integration API key."
        }
      },
      schemas: {
        PulseCapabilities: {
          type: "object",
          required: ["method", "observes", "doesNotProvide"],
          properties: {
            method: { type: "string", const: PULSE_CAPABILITIES.method },
            observes: { type: "array", items: { type: "string", enum: [...PULSE_CAPABILITIES.observes] } },
            doesNotProvide: { type: "array", items: { type: "string", enum: [...PULSE_CAPABILITIES.doesNotProvide] } }
          }
        },
        PulseFeedback: {
          type: "object",
          additionalProperties: true,
          required: ["email"],
          properties: {
            email: { type: "string", const: "support@certscore.ai" },
            feedbackUrl: { type: "string" },
            positiveUrl: { type: "string" },
            negativeUrl: { type: "string" }
          }
        },
        PulseAgentInterpretation: {
          type: "object",
          required: ["responseClass", "safeSummaryUse", "requiresHumanReview", "doNotCallThis"],
          properties: {
            responseClass: { type: "string", enum: ["completed_pulse", "pending_pulse", "api_error", "rate_limited"] },
            safeSummaryUse: { type: "boolean" },
            requiresHumanReview: { type: "boolean", const: true },
            doNotCallThis: { type: "array", items: { type: "string", enum: [...PULSE_CAPABILITIES.doesNotProvide] } }
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
          required: ["type", "meta", "summary", "topFindings", "links", "feedback", "capabilities", "agentInterpretation", "disclaimer"],
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
            agentInterpretation: { $ref: "#/components/schemas/PulseAgentInterpretation" },
            disclaimer: { type: "string" }
          }
        },
        PulseStatus: {
          type: "object",
          additionalProperties: true,
          required: ["type", "jobId", "status", "capabilities", "agentInterpretation", "disclaimer"],
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
            agentInterpretation: { $ref: "#/components/schemas/PulseAgentInterpretation" },
            disclaimer: { type: "string" }
          }
        },
        PulseError: {
          type: "object",
          additionalProperties: true,
          required: ["type", "error", "feedback", "agentInterpretation", "disclaimer"],
          properties: {
            type: { type: "string", const: "certscore_pulse_error" },
            error: {
              type: "object",
              required: ["code", "message"],
              additionalProperties: true,
              properties: {
                code: {
                  type: "string",
                  enum: ["invalid_url", "not_found", "pulse_throttled", "rate_limited", "internal_error", "scan_unavailable", "unauthorized", "forbidden"]
                },
                message: { type: "string" },
                retryAfterSeconds: { type: ["integer", "null"] }
              }
            },
            feedback: { $ref: "#/components/schemas/PulseFeedback" },
            resolution: {
              type: ["object", "null"],
              additionalProperties: false,
              properties: {
                label: { type: "string" },
                url: { type: "string" }
              }
            },
            agentInterpretation: { $ref: "#/components/schemas/PulseAgentInterpretation" },
            disclaimer: { type: "string" }
          }
        },
        PulseHealth: {
          type: "object",
          required: ["ok", "service", "version", "generatedAt"],
          properties: {
            ok: { type: "boolean", const: true },
            service: { type: "string", const: "certscore-pulse" },
            version: { type: "string", const: "v1" },
            generatedAt: { type: "string", format: "date-time" }
          }
        },
        PulseSelfTest: {
          type: "object",
          required: ["ok", "type", "service", "version", "timestamp", "routes", "capabilities", "disclaimer"],
          properties: {
            ok: { type: "boolean", const: true },
            type: { type: "string", const: "certscore_pulse_self_test" },
            service: { type: "string", const: "certscore_pulse" },
            version: { type: "string", const: "v1" },
            timestamp: { type: "string", format: "date-time" },
            routes: { type: "object", additionalProperties: { type: "string" } },
            capabilities: { $ref: "#/components/schemas/PulseCapabilities" },
            disclaimer: { type: "string" }
          }
        }
      }
    }
  } as const;
}

export type PulseV1OpenApiDocument = ReturnType<typeof buildPulseV1OpenApiDocument>;
