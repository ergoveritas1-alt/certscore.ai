import { NextResponse } from "next/server";
import { PULSE_STANDARD_DISCLAIMER } from "../../../../lib/pulse/constants";

export function GET() {
  return NextResponse.json(
    {
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
              { name: "format", in: "query", schema: { enum: ["json", "markdown"], default: "json" } },
              { name: "detail", in: "query", schema: { enum: ["tiny", "standard", "full"], default: "standard" } },
              { name: "freshness", in: "query", schema: { enum: ["latest", "refresh"], default: "latest" } },
              { name: "wait", in: "query", schema: { type: "integer", minimum: 0, maximum: 80 } }
            ],
            responses: {
              "200": {
                description: `Completed Pulse. ${PULSE_STANDARD_DISCLAIMER}`,
                content: {
                  "application/json": {
                    examples: {
                      standard: {
                        value: {
                          type: "certscore_pulse",
                          meta: {
                            apiVersion: "v1",
                            schemaVersion: "1.0.0",
                            pulseVersion: "2026-05-18",
                            projectionVersion: "pulse-public-v1"
                          },
                          domain: "example.com",
                          scanId: "scan_abc123",
                          scan_id: "scan_abc123",
                          summary: {
                            headline: "Automated scan surfaced public-web review signals with retained evidence.",
                            score: 72,
                            riskLevel: "review_recommended"
                          },
                          topFindings: [],
                          links: {
                            docsUrl: "https://certscore.ai/api-pulse",
                            findingsReferenceUrl: "https://certscore.ai/findings",
                            fullReportUrl: "https://certscore.ai/scan/scan_abc123"
                          },
                          disclaimer: PULSE_STANDARD_DISCLAIMER
                        }
                      },
                      tiny: {
                        value: {
                          type: "certscore_pulse",
                          domain: "example.com",
                          summary: { score: 72, riskLevel: "review_recommended" },
                          topFindings: [],
                          disclaimer: PULSE_STANDARD_DISCLAIMER
                        }
                      },
                      full: {
                        value: {
                          type: "certscore_pulse",
                          domain: "example.com",
                          findings: [],
                          publicReportProjection: { surfacedFindingCount: 0 },
                          disclaimer: PULSE_STANDARD_DISCLAIMER
                        }
                      }
                    }
                  },
                  "text/markdown": {
                    examples: {
                      markdown: {
                        value: "# CertScore Pulse: example.com\n\nStatus: Completed\n\n## Disclaimer\n\n" + PULSE_STANDARD_DISCLAIMER
                      }
                    }
                  }
                }
              },
              "202": {
                description: "Pulse scan accepted or still pending.",
                content: {
                  "application/json": {
                    examples: {
                      pending: {
                        value: {
                          type: "certscore_pulse_status",
                          jobId: "pulse_job_123",
                          scanId: "scan_abc123",
                          scan_id: "scan_abc123",
                          domain: "example.com",
                          status: "running",
                          phase: "runtime_observation",
                          disclaimer: PULSE_STANDARD_DISCLAIMER
                        }
                      }
                    }
                  }
                }
              },
              "400": { description: "Invalid URL or input." },
              "404": { description: "Scan or Pulse job not found." },
              "429": { description: "Rate limited. Expensive scan creation is limited by normalized domain." },
              "500": { description: "Unexpected internal error with public-safe message." }
            }
          }
        },
        "/api/v1/pulse/status/{jobId}": {
          get: {
            summary: "Retrieve Pulse job status.",
            parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }],
            responses: {
              "200": { description: "Completed or completed-limited status." },
              "202": { description: "Queued, running, or finalizing status." },
              "404": { description: "Pulse job not found." }
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
                      reason: {
                        enum: [
                          "incorrect_finding",
                          "missing_evidence",
                          "too_much_detail",
                          "not_enough_detail",
                          "coverage_limited",
                          "hard_to_understand",
                          "api_issue",
                          "other",
                          null
                        ]
                      },
                      comment: { type: "string", maxLength: 2000 },
                      email: { type: "string", format: "email" }
                    }
                  }
                }
              }
            },
            responses: {
              "200": { description: "Feedback stored privately." },
              "400": { description: "Invalid feedback." },
              "429": { description: "Feedback rate limited." }
            }
          }
        },
        "/.well-known/certscore-pulse": {
          get: {
            summary: "Discover CertScore Pulse API details.",
            responses: {
              "200": { description: "Pulse discovery metadata." }
            }
          }
        }
      }
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600"
      }
    }
  );
}
