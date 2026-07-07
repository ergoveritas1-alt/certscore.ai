import { PULSE_CAPABILITIES, PULSE_PURPOSE_STATEMENT, PULSE_SCHEMA_VERSION, PULSE_STANDARD_DISCLAIMER } from "./pulse-v1.js";

const pulseErrorResponses = {
  "400": {
    description: "Invalid URL, scanId, or request input.",
    content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
  },
  "429": {
    description: "The request was throttled.",
    content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
  },
  "500": {
    description: "Unexpected public-safe API error.",
    content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
  }
} as const;

export function buildPulseChatGptOpenApiDocument() {
  return {
    openapi: "3.1.1",
    info: {
      title: "CertScore Pulse GPT Action API beta",
      version: PULSE_SCHEMA_VERSION,
      description: `A compact beta GPT Action schema for retrieving CertScore Pulse summaries. ${PULSE_PURPOSE_STATEMENT} ${PULSE_STANDARD_DISCLAIMER}`
    },
    servers: [{ url: "https://certscore.ai" }],
    paths: {
      "/api/v1/pulse/gpt": {
        get: {
          operationId: "getPulseForUrl",
          tags: ["Pulse"],
          summary: "Retrieve a GPT-safe CertScore Pulse summary for a public URL.",
          description:
            "Scan a public website URL with CertScore Pulse and return automated privacy, consent, tracking, accessibility, and disclosure observations. Summary JSON is the default; evidence returns a bounded structured evidence packet. Not legal advice or a compliance determination.",
          parameters: [
            {
              name: "url",
              in: "query",
              required: true,
              description: "The public website URL or domain to review, for example https://kbdlab.io.",
              schema: { type: "string" }
            },
            {
              name: "format",
              in: "query",
              required: false,
              description: "Return JSON for structured processing or markdown for readable GPT responses.",
              schema: { type: "string", enum: ["json", "markdown"], default: "markdown" }
            },
            {
              name: "detail",
              in: "query",
              required: false,
              description: "summary returns the small GPT-friendly artifact. evidence returns the larger bounded structured evidence packet. standard/full remain backward compatible.",
              schema: { type: "string", enum: ["tiny", "standard", "full", "summary", "evidence"], default: "summary" }
            },
            {
              name: "scanFrom",
              in: "query",
              required: false,
              description: "Execution context for newly queued public scans. Public requests use the default production scanner. Existing scans are returned with their recorded context. Alias: geo.",
              schema: { type: "string", enum: ["default"], default: "default" }
            },
            {
              name: "geo",
              in: "query",
              required: false,
              description: "Alias for scanFrom. Public requests use the default production scanner.",
              schema: { type: "string", enum: ["default"], default: "default" }
            },
            {
              name: "wait",
              in: "query",
              required: false,
              description: "Optional seconds to wait for completion during this request. If a 202 response is returned, poll the statusUrl.",
              schema: { type: "integer", minimum: 0, maximum: 35, default: 35 }
            }
          ],
          responses: {
            "200": {
              description: "Completed Pulse response as JSON.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/PulseResponse" } }
              }
            },
            "202": {
              description: "Pulse scan is queued or running. Poll the statusUrl.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/PulseStatus" } } }
            },
            ...pulseErrorResponses
          }
        }
      },
      "/api/v1/pulse/gpt/scan/{scanId}": {
        get: {
          operationId: "getPulseByScanId",
          tags: ["Pulse"],
          summary: "Retrieve a GPT-safe CertScore Pulse summary by durable scanId.",
          description:
            "Retrieve a completed CertScore Pulse result by durable scanId. Use this when a prior scan returned a scanId or report link. Automated observations for review, not legal advice or a compliance determination.",
          parameters: [
            {
              name: "scanId",
              in: "path",
              required: true,
              description: "The durable CertScore scanId returned by getPulseForUrl or a CertScore report URL.",
              schema: { type: "string" }
            },
            {
              name: "format",
              in: "query",
              required: false,
              description: "Return JSON for structured processing or markdown for readable GPT responses.",
              schema: { type: "string", enum: ["json", "markdown"], default: "markdown" }
            },
            {
              name: "detail",
              in: "query",
              required: false,
              description: "summary returns the small GPT-friendly artifact. evidence returns the larger bounded structured evidence packet. standard/full remain backward compatible.",
              schema: { type: "string", enum: ["tiny", "standard", "full", "summary", "evidence"], default: "summary" }
            }
          ],
          responses: {
            "200": {
              description: "Completed Pulse response as JSON.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/PulseResponse" } }
              }
            },
            "404": {
              description: "Scan not found or not eligible for public Pulse.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
            },
            ...pulseErrorResponses
          }
        }
      },
      "/api/v1/pulse/status/{jobId}": {
        get: {
          operationId: "getPulseJobStatus",
          tags: ["Pulse"],
          summary: "Retrieve the status of a queued CertScore Pulse job.",
          description:
            "Check the status of a queued or running CertScore Pulse job by jobId. Use after getPulseForUrl returns a pending scan. Not legal advice or a compliance determination.",
          parameters: [
            {
              name: "jobId",
              in: "path",
              required: true,
              description: "The Pulse job identifier returned by getPulseForUrl.",
              schema: { type: "string" }
            }
          ],
          responses: {
            "200": {
              description: "Pulse job status.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/PulseStatus" } } }
            },
            "202": {
              description: "Pulse job is still queued or running.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/PulseStatus" } } }
            },
            "404": {
              description: "Pulse job was not found.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
            },
            ...pulseErrorResponses
          }
        }
      },
      "/api/v1/pulse-self-test": {
        get: {
          operationId: "checkPulseConnectivity",
          tags: ["Diagnostics"],
          summary: "Check CertScore Pulse action connectivity.",
          description:
            "Quick CertScore Pulse reachability check. Use once when a scan action cannot be reached, then ask the user to retry or provide the direct Pulse URL.",
          responses: {
            "200": {
              description: "Pulse support route is reachable.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/PulseSelfTest" } } }
            },
            "500": {
              description: "Unexpected public-safe canary error.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
            }
          }
        }
      }
    },
    components: {
      schemas: {
        PulseResponse: {
          type: "object",
          additionalProperties: true,
          required: ["type", "summary", "feedback", "capabilities", "agentInterpretation", "disclaimer"],
          properties: {
            type: { type: "string", enum: ["certscore_pulse", "certscore_pulse_summary", "certscore_pulse_evidence"] },
            scanStatus: { type: "string" },
            target: { type: "object", additionalProperties: true },
            summary: {
              type: "object",
              additionalProperties: true,
              properties: {
                score: { type: "integer", nullable: true },
                riskLevel: { type: "string" },
                coverageNote: { type: "string" }
              }
            },
            findings: { type: "array", items: { type: "object", additionalProperties: true } },
            topFindings: { type: "array", items: { type: "object", additionalProperties: true } },
            executiveSummary: {
              type: "object",
              additionalProperties: true,
              description: "Report-backed executive summary metrics for agents, including issues to review, score, tracker footprint, consent platform, third-party requests, cookies pre-consent, and policy surfaces."
            },
            surfacedResults: {
              type: "object",
              additionalProperties: true,
              description: "Report-backed surfaced result lists for agents, including GDPR/ePrivacy checklist findings and named pre-consent tracker rows with timing where available."
            },
            coverage: { type: "object", additionalProperties: true },
            links: { type: "object", additionalProperties: true },
            feedback: { $ref: "#/components/schemas/PulseFeedback" },
            capabilities: { $ref: "#/components/schemas/PulseCapabilities" },
            agentInterpretation: { $ref: "#/components/schemas/PulseAgentInterpretation" },
            disclaimer: { type: "string" }
          }
        },
        PulseStatus: {
          type: "object",
          additionalProperties: true,
          required: ["type", "status", "capabilities", "agentInterpretation", "disclaimer"],
          properties: {
            type: { type: "string", enum: ["certscore_pulse_status"] },
            status: { type: "string" },
            jobId: { type: "string" },
            statusUrl: { type: "string" },
            capabilities: { $ref: "#/components/schemas/PulseCapabilities" },
            agentInterpretation: { $ref: "#/components/schemas/PulseAgentInterpretation" },
            feedback: { $ref: "#/components/schemas/PulseFeedback" },
            disclaimer: { type: "string" }
          }
        },
        PulseError: {
          type: "object",
          additionalProperties: true,
          required: ["type", "error", "feedback", "agentInterpretation", "disclaimer"],
          properties: {
            type: { type: "string", enum: ["certscore_pulse_error"] },
            error: {
              type: "object",
              required: ["code", "message"],
              additionalProperties: true,
              properties: {
                code: { type: "string", enum: ["invalid_url", "not_found", "pulse_throttled", "rate_limited", "internal_error", "scan_unavailable"] },
                message: { type: "string" },
                retryAfterSeconds: { type: "integer", nullable: true }
              }
            },
            feedback: { $ref: "#/components/schemas/PulseFeedback" },
            resolution: { type: "object", nullable: true, additionalProperties: true },
            agentInterpretation: { $ref: "#/components/schemas/PulseAgentInterpretation" },
            disclaimer: { type: "string" }
          }
        },
        PulseSelfTest: {
          type: "object",
          additionalProperties: true,
          required: ["ok", "type", "service", "version", "routes", "capabilities", "disclaimer"],
          properties: {
            ok: { type: "boolean" },
            type: { type: "string", enum: ["certscore_pulse_self_test"] },
            service: { type: "string", enum: ["certscore_pulse"] },
            version: { type: "string" },
            timestamp: { type: "string" },
            routes: { type: "object", additionalProperties: { type: "string" } },
            capabilities: { $ref: "#/components/schemas/PulseCapabilities" },
            disclaimer: { type: "string" }
          }
        },
        PulseFeedback: {
          type: "object",
          additionalProperties: true,
          properties: {
            email: { type: "string", enum: ["support@certscore.ai"] },
            feedbackUrl: { type: "string" },
            positiveUrl: { type: "string" },
            negativeUrl: { type: "string" }
          }
        },
        PulseCapabilities: {
          type: "object",
          required: ["method", "observes", "doesNotProvide"],
          properties: {
            method: { type: "string", enum: [PULSE_CAPABILITIES.method] },
            observes: { type: "array", items: { type: "string", enum: [...PULSE_CAPABILITIES.observes] } },
            doesNotProvide: { type: "array", items: { type: "string", enum: [...PULSE_CAPABILITIES.doesNotProvide] } }
          }
        },
        PulseAgentInterpretation: {
          type: "object",
          required: ["responseClass", "safeSummaryUse", "requiresHumanReview", "doNotCallThis"],
          properties: {
            responseClass: { type: "string", enum: ["completed_pulse", "pending_pulse", "api_error", "rate_limited"] },
            safeSummaryUse: { type: "boolean" },
            requiresHumanReview: { type: "boolean", enum: [true] },
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
        }
      }
    }
  } as const;
}

export type PulseChatGptOpenApiDocument = ReturnType<typeof buildPulseChatGptOpenApiDocument>;
