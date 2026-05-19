const standardDisclaimer =
  "CertScore provides automated public-web observations for review. Results may be incomplete or contain errors. CertScore does not provide legal advice, certify compliance, or determine whether a website violates law. Always review the underlying evidence and consult qualified counsel or subject-matter experts where appropriate.";

const chatGptOpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "CertScore Pulse GPT Action API",
    version: "1.0.0",
    description:
      "A compact GPT Action schema for retrieving CertScore Pulse summaries. CertScore provides automated public-web observations for review. It does not provide legal advice, certify compliance, or determine whether a website violates law."
  },
  servers: [{ url: "https://certscore.ai" }],
  paths: {
    "/api/v1/pulse": {
      get: {
        operationId: "getPulseForUrl",
        summary: "Retrieve a CertScore Pulse summary for a public URL.",
        description:
          "Use this operation when a user asks CertScore to scan or summarize a public website. Prefer format=markdown for natural-language answers. Use detail=tiny for compact summaries and detail=full only when the user asks for evidence or more context.",
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
            description: "tiny is compact; standard is balanced; full includes more evidence and review context. quick is accepted as an alias for tiny.",
            schema: { type: "string", enum: ["tiny", "quick", "standard", "full"], default: "standard" }
          },
          {
            name: "freshness",
            in: "query",
            required: false,
            description: "Use latest by default. Use refresh only when the user explicitly asks for a fresh run.",
            schema: { type: "string", enum: ["latest", "refresh"], default: "latest" }
          },
          {
            name: "wait",
            in: "query",
            required: false,
            description: "Optional seconds to wait for completion during this request. If a 202 response is returned, poll the statusUrl.",
            schema: { type: "integer", minimum: 0, maximum: 80, default: 0 }
          }
        ],
        responses: {
          "200": {
            description: "Completed Pulse response as JSON or markdown.",
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
                      summary: "No major automated review signals were surfaced in this scan.",
                      feedback: { email: "support@certscore.ai" },
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
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PulseError" },
                examples: {
                  invalidUrl: {
                    value: {
                      type: "certscore_pulse_error",
                      error: { code: "invalid_url", message: "Enter a valid public URL or domain.", retryAfterSeconds: null },
                      feedback: { email: "support@certscore.ai" },
                      disclaimer: standardDisclaimer
                    }
                  }
                }
              }
            }
          },
          "429": {
            description: "The request was throttled.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PulseError" },
                examples: {
                  throttled: {
                    value: {
                      type: "certscore_pulse_error",
                      error: { code: "rate_limited", message: "Pulse is receiving too many requests. Try again shortly.", retryAfterSeconds: 60 },
                      feedback: { email: "support@certscore.ai" },
                      disclaimer: standardDisclaimer
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/pulse/status/{jobId}": {
      get: {
        operationId: "getPulseJobStatus",
        summary: "Retrieve the status of a queued CertScore Pulse job.",
        description: "Use this operation only after a Pulse response returns a jobId or statusUrl.",
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
        required: ["type", "status", "summary", "feedback", "disclaimer"],
        properties: {
          type: { type: "string", const: "certscore_pulse" },
          status: { type: "string" },
          target: { type: "object", additionalProperties: true },
          summary: { type: "string" },
          findings: { type: "array", items: { type: "object", additionalProperties: true } },
          feedback: { $ref: "#/components/schemas/PulseFeedback" },
          disclaimer: { type: "string" }
        }
      },
      PulseStatus: {
        type: "object",
        additionalProperties: true,
        required: ["type", "status", "feedback", "disclaimer"],
        properties: {
          type: { type: "string", const: "certscore_pulse_status" },
          status: { type: "string" },
          jobId: { type: "string" },
          statusUrl: { type: "string" },
          feedback: { $ref: "#/components/schemas/PulseFeedback" },
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
      },
      PulseFeedback: {
        type: "object",
        additionalProperties: true,
        properties: {
          email: { type: "string", const: "support@certscore.ai" }
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
