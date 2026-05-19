const standardDisclaimer =
  "CertScore provides automated public-web observations for review. Results may be incomplete or contain errors. CertScore does not provide legal advice, certify compliance, or determine whether a website violates law. Always review the underlying evidence and consult qualified counsel or subject-matter experts where appropriate.";

const purposeStatement =
  "CertScore Pulse uses automated runtime analysis of public websites to detect review signals around pre-consent tracking, third-party requests, consent enforcement gaps, cookie activity, accessibility issues, and disclosure inconsistencies.";

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

const diagnosticHeaders = {
  "x-certscore-pulse": { schema: { type: "string", const: "v1" }, description: "CertScore Pulse API version marker." },
  "x-certscore-route": { schema: { type: "string" }, description: "Public Pulse route identifier." },
  "x-certscore-request-id": { schema: { type: "string" }, description: "Request identifier for support and diagnostics." }
} as const;

const retryAfterHeader = {
  "Retry-After": { schema: { type: "integer" }, description: "Recommended retry or polling delay in seconds." }
} as const;

const chatGptOpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "CertScore Pulse GPT Action API",
    version: "1.0.0",
    description: `A compact GPT Action schema for retrieving CertScore Pulse summaries. ${purposeStatement} ${standardDisclaimer}`
  },
  servers: [{ url: "https://certscore.ai" }],
  paths: {
    "/api/v1/pulse/gpt": {
      get: {
        operationId: "getPulseForUrl",
        summary: "Retrieve a GPT-safe CertScore Pulse summary for a public URL.",
        description:
          `${purposeStatement} Automated public-web observations for review. Not legal advice or a compliance determination. Use this operation when a user asks CertScore to scan or summarize a public website. Prefer format=markdown and detail=standard for natural-language answers. This public GPT Action does not expose refresh or full-detail evidence access; higher-volume, refresh, and full evidence access may require API keys later.`,
        parameters: [
          {
            name: "url",
            in: "query",
            required: true,
            description: "The public website URL or domain to review, for example https://example.com.",
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
            description: "tiny is compact; standard is balanced and best for GPT responses. quick is accepted by the API as an alias for tiny but omitted here to keep the GPT schema simple.",
            schema: { type: "string", enum: ["tiny", "standard"], default: "standard" }
          },
          {
            name: "wait",
            in: "query",
            required: false,
            description: "Optional seconds to wait for completion during this request. If a 202 response is returned, poll the statusUrl.",
            schema: { type: "integer", minimum: 0, maximum: 60, default: 60 }
          }
        ],
        responses: {
          "200": {
            description: "Completed Pulse response as JSON or markdown.",
            headers: diagnosticHeaders,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PulseResponse" },
                examples: {
                  tiny: {
                    summary: "Tiny completed JSON",
                    value: {
                      type: "certscore_pulse",
                      status: "completed",
                      target: { inputUrl: "https://example.com", normalizedUrl: "https://example.com/" },
                      summary: {
                        score: 64,
                        riskLevel: "review_recommended",
                        coverageNote:
                          "Score reflects scan coverage limitations. No specific findings were surfaced. Review the full report for coverage diagnostics."
                      },
                      topFindings: [],
                      links: {
                        canonicalPulseUrl: "https://certscore.ai/pulse/example.com",
                        fullReportUrl: "https://certscore.ai/scan/scan_abc123",
                        markdownUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_abc123&format=markdown",
                        docsUrl: "https://certscore.ai/api-pulse",
                        findingsReferenceUrl: "https://certscore.ai/findings"
                      },
                      feedback: { email: "support@certscore.ai", feedbackUrl: "https://certscore.ai/pulse/feedback?pulseRequestId=pulse_req_123" },
                      capabilities: pulseCapabilities,
                      agentInterpretation: {
                        responseClass: "completed_pulse",
                        safeSummaryUse: true,
                        requiresHumanReview: true,
                        doNotCallThis: pulseCapabilities.doesNotProvide
                      },
                      disclaimer: standardDisclaimer
                    }
                  }
                }
              },
              "text/markdown": {
                schema: { type: "string" },
                examples: {
                  completed: {
                    summary: "Markdown completed response",
                    value:
                      "# CertScore Pulse\n\nNo major automated review signals were surfaced in this scan.\n\nCertScore provides automated public-web observations for review. It does not provide legal advice, certification, or a compliance determination."
                  }
                }
              }
            }
          },
          "202": {
            description: "Pulse scan is queued or running. Poll the statusUrl.",
            headers: { ...diagnosticHeaders, ...retryAfterHeader },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PulseStatus" },
                examples: {
                  pending: {
                    value: {
                      type: "certscore_pulse_status",
                      status: "running",
                      jobId: "pulse_job_123",
                      statusUrl: "https://certscore.ai/api/v1/pulse/status/pulse_job_123",
                      capabilities: pulseCapabilities,
                      agentInterpretation: {
                        responseClass: "pending_pulse",
                        safeSummaryUse: false,
                        requiresHumanReview: true,
                        doNotCallThis: pulseCapabilities.doesNotProvide
                      },
                      feedback: { email: "support@certscore.ai" },
                      disclaimer: standardDisclaimer
                    }
                  }
                }
              }
            }
          },
          "400": {
            description: "Invalid URL or request input.",
            headers: diagnosticHeaders,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PulseError" },
                examples: {
                  invalidUrl: {
                    value: {
                      type: "certscore_pulse_error",
                      error: { code: "invalid_url", message: "Enter a valid public URL or domain.", retryAfterSeconds: null },
                      feedback: { email: "support@certscore.ai" },
                      agentInterpretation: {
                        responseClass: "api_error",
                        safeSummaryUse: false,
                        requiresHumanReview: true,
                        doNotCallThis: pulseCapabilities.doesNotProvide
                      },
                      disclaimer: standardDisclaimer
                    }
                  }
                }
              }
            }
          },
          "429": {
            description: "The request was throttled.",
            headers: { ...diagnosticHeaders, ...retryAfterHeader },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PulseError" },
                examples: {
                  throttled: {
                    value: {
                      type: "certscore_pulse_error",
                      error: { code: "rate_limited", message: "Pulse is receiving too many requests. Try again shortly.", retryAfterSeconds: 60 },
                      feedback: { email: "support@certscore.ai" },
                      agentInterpretation: {
                        responseClass: "rate_limited",
                        safeSummaryUse: false,
                        requiresHumanReview: true,
                        doNotCallThis: pulseCapabilities.doesNotProvide
                      },
                      disclaimer: standardDisclaimer
                    }
                  }
                }
              }
            }
          },
          "500": {
            description: "Unexpected public-safe API error.",
            headers: { ...diagnosticHeaders, ...retryAfterHeader },
            content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
          }
        }
      }
    },
    "/api/v1/pulse/gpt/scan/{scanId}": {
      get: {
        operationId: "getPulseByScanId",
        summary: "Retrieve a GPT-safe CertScore Pulse summary by durable scanId.",
        description:
          "Retrieve a completed scan-backed Pulse result using scanId, the durable handle returned by CertScore Pulse. Automated public-web observations for review. Not legal advice or a compliance determination.",
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
            description: "tiny is compact; standard is balanced and best for GPT responses.",
            schema: { type: "string", enum: ["tiny", "standard"], default: "standard" }
          }
        ],
        responses: {
          "200": {
            description: "Completed Pulse response as JSON or markdown.",
            headers: diagnosticHeaders,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/PulseResponse" } },
              "text/markdown": { schema: { type: "string" } }
            }
          },
          "400": {
            description: "Invalid scanId or request input.",
            headers: diagnosticHeaders,
            content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
          },
          "404": {
            description: "Scan not found or not eligible for public Pulse.",
            headers: diagnosticHeaders,
            content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
          },
          "429": {
            description: "The request was throttled.",
            headers: { ...diagnosticHeaders, ...retryAfterHeader },
            content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
          },
          "500": {
            description: "Unexpected public-safe API error.",
            headers: { ...diagnosticHeaders, ...retryAfterHeader },
            content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
          }
        }
      }
    },
    "/api/v1/pulse/status/{jobId}": {
      get: {
        operationId: "getPulseJobStatus",
        summary: "Retrieve the status of a queued CertScore Pulse job.",
        description: `${purposeStatement} Automated public-web observations for review. Not legal advice or a compliance determination. Use this operation only after a Pulse response returns a jobId or statusUrl.`,
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
            headers: diagnosticHeaders,
            content: { "application/json": { schema: { $ref: "#/components/schemas/PulseStatus" } } }
          },
          "202": {
            description: "Pulse job is still queued or running.",
            headers: { ...diagnosticHeaders, ...retryAfterHeader },
            content: { "application/json": { schema: { $ref: "#/components/schemas/PulseStatus" } } }
          },
          "429": {
            description: "Pulse job is rate limited.",
            headers: { ...diagnosticHeaders, ...retryAfterHeader },
            content: { "application/json": { schema: { $ref: "#/components/schemas/PulseStatus" } } }
          },
          "404": {
            description: "Pulse job was not found.",
            headers: diagnosticHeaders,
            content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
          },
          "500": {
            description: "Unexpected public-safe API error.",
            headers: { ...diagnosticHeaders, ...retryAfterHeader },
            content: { "application/json": { schema: { $ref: "#/components/schemas/PulseError" } } }
          }
        }
      }
    },
    "/api/v1/pulse-health": {
      get: {
        summary: "Dependency-free Pulse health canary.",
        responses: {
          "200": {
            description: "Pulse health response.",
            headers: diagnosticHeaders,
            content: { "application/json": { schema: { $ref: "#/components/schemas/PulseHealth" } } }
          }
        }
      }
    },
    "/api/v1/pulse-self-test": {
      get: {
        summary: "Pulse public self-test route.",
        responses: {
          "200": {
            description: "Pulse self-test response.",
            headers: diagnosticHeaders,
            content: { "application/json": { schema: { $ref: "#/components/schemas/PulseSelfTest" } } }
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
          type: { type: "string", const: "certscore_pulse" },
          scanStatus: { type: "string" },
          target: { type: "object", additionalProperties: true },
          summary: {
            type: "object",
            additionalProperties: true,
            properties: {
              score: { type: ["integer", "null"] },
              riskLevel: { type: "string" },
              coverageNote: { type: "string" }
            }
          },
          findings: { type: "array", items: { type: "object", additionalProperties: true } },
          topFindings: { type: "array", items: { type: "object", additionalProperties: true } },
          coverage: {
            type: "object",
            additionalProperties: true,
            properties: {
              interruptionCount: { type: "integer" },
              interruptions: { type: "array", items: { $ref: "#/components/schemas/PulseCoverageInterruption" } }
            }
          },
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
          type: { type: "string", const: "certscore_pulse_status" },
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
          type: { type: "string", const: "certscore_pulse_error" },
          error: {
            type: "object",
            required: ["code", "message"],
            additionalProperties: true,
            properties: {
              code: { type: "string", enum: ["invalid_url", "not_found", "pulse_throttled", "rate_limited", "internal_error", "scan_unavailable"] },
              message: { type: "string" },
              retryAfterSeconds: { type: ["integer", "null"] }
            }
          },
          feedback: { $ref: "#/components/schemas/PulseFeedback" },
          agentInterpretation: { $ref: "#/components/schemas/PulseAgentInterpretation" },
          disclaimer: { type: "string" }
        }
      },
      PulseFeedback: {
        type: "object",
        additionalProperties: true,
        properties: {
          email: { type: "string", const: "support@certscore.ai" },
          feedbackUrl: { type: "string" },
          positiveUrl: { type: "string" },
          negativeUrl: { type: "string" }
        }
      },
      PulseCapabilities: {
        type: "object",
        required: ["method", "observes", "doesNotProvide"],
        properties: {
          method: { type: "string", const: pulseCapabilities.method },
          observes: { type: "array", items: { type: "string", enum: [...pulseCapabilities.observes] } },
          doesNotProvide: { type: "array", items: { type: "string", enum: [...pulseCapabilities.doesNotProvide] } }
        }
      },
      PulseAgentInterpretation: {
        type: "object",
        required: ["responseClass", "safeSummaryUse", "requiresHumanReview", "doNotCallThis"],
        properties: {
          responseClass: { type: "string", enum: ["completed_pulse", "pending_pulse", "api_error", "rate_limited"] },
          safeSummaryUse: { type: "boolean" },
          requiresHumanReview: { type: "boolean", const: true },
          doNotCallThis: { type: "array", items: { type: "string", enum: [...pulseCapabilities.doesNotProvide] } }
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

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function GET(request: Request) {
  const id = requestId(request);

  return new Response(JSON.stringify(chatGptOpenApiDocument), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-CertScore-Pulse": "v1",
      "X-CertScore-Route": "openapi-chatgpt",
      "X-CertScore-Request-Id": id,
      "X-Content-Type-Options": "nosniff"
    },
    status: 200
  });
}
