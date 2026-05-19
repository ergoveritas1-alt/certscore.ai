import { PULSE_FEEDBACK_EMAIL, PULSE_STANDARD_DISCLAIMER } from "../../../../lib/pulse/constants";

const metaExample = {
  apiVersion: "v1",
  schemaVersion: "1.0.0",
  pulseVersion: "2026-05-18",
  projectionVersion: "pulse-public-v1",
  generatedAt: "2026-05-18T23:15:32Z",
  source: "certscore.ai"
};

const compactFindingExample = {
  id: "pre_consent_tracking_detected",
  label: "Tracking started before consent",
  criticality: "critical",
  confidence: "strong",
  plainEnglish: "Runtime evidence showed non-essential tracking activity before a consent choice was recorded.",
  evidence: {
    summary: "A non-essential third-party tracking request was observed before the scan recorded a consent choice.",
    observedPhase: "before_consent",
    exampleEvents: [
      {
        type: "request",
        vendor: "Example Analytics Vendor",
        urlHost: "analytics.example-vendor.test",
        timestampMs: 1137
      }
    ],
    fullEvidenceUrl: "https://certscore.ai/scan/scan_abc123#finding-pre_consent_tracking_detected"
  },
  evidenceDigest: {
    basis: "runtime_observation",
    phase: "before_consent",
    exampleCount: 2,
    examplesShown: 1,
    hasTimingAnchor: true,
    hasVendorAnchor: true,
    hasConsentContext: true
  },
  reviewLenses: ["GDPR / ePrivacy", "FTC"],
  anchorUrl: "https://certscore.ai/scan/scan_abc123#finding-pre_consent_tracking_detected",
  nextStep: "Review whether observed vendors are necessary before consent or should be consent-gated."
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
  prompt: "Was this Pulse useful?",
  email: PULSE_FEEDBACK_EMAIL,
  feedbackUrl: "https://certscore.ai/pulse/feedback?pulseRequestId=pulse_req_123"
};

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
              {
                name: "freshness",
                in: "query",
                schema: { enum: ["latest", "refresh"], default: "latest" },
                description:
                  "latest returns the latest eligible completed Pulse when available and may queue first-time scans. refresh requests a new scan subject to the normalized-domain scan-generation throttle."
              },
              {
                name: "wait",
                in: "query",
                schema: { type: "integer", minimum: 0, maximum: 80 },
                description:
                  "Maximum seconds to hold the current HTTP request while queued/running work completes. This is not a maximum total scan duration; queue backlog, worker availability, page load time, and finalization can take longer than 80 seconds. If the Pulse is not complete within this window, the API returns HTTP 202 with statusUrl."
              }
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
                          timestamps: {
                            createdAt: "2026-05-18T23:14:22Z",
                            startedAt: "2026-05-18T23:14:31Z",
                            completedAt: "2026-05-18T23:15:31Z",
                            generatedAt: "2026-05-18T23:15:32Z",
                            lastUpdatedAt: "2026-05-18T23:15:31Z"
                          },
                          freshness: { status: "fresh", ageSeconds: 4, ageHours: 0.001, maxRecommendedAgeHours: 168 },
                          summary: {
                            headline: "Automated scan surfaced consent-timing and third-party collection review signals.",
                            score: 72,
                            riskLevel: "review_recommended"
                          },
                          topFindings: [compactFindingExample],
                          coverage: {
                            status: "partial",
                            summary: "Homepage findings are based on observable public-page evidence.",
                            limitations: [
                              "Automated public-web scan only.",
                              "Coverage was limited; absence of findings should not be interpreted as absence of risk."
                            ]
                          },
                          links: linksExample,
                          feedback: feedbackExample,
                          disclaimer: PULSE_STANDARD_DISCLAIMER
                        }
                      },
                      tiny: {
                        value: {
                          type: "certscore_pulse",
                          meta: { ...metaExample, format: "json", detail: "tiny" },
                          domain: "example.com",
                          scanId: "scan_abc123",
                          scanStatus: "completed",
                          summary: { score: 72, riskLevel: "review_recommended" },
                          topFindings: [
                            {
                              id: compactFindingExample.id,
                              label: compactFindingExample.label,
                              criticality: compactFindingExample.criticality,
                              confidence: compactFindingExample.confidence
                            }
                          ],
                          links: linksExample,
                          feedback: feedbackExample,
                          disclaimer: PULSE_STANDARD_DISCLAIMER
                        }
                      },
                      full: {
                        value: {
                          type: "certscore_pulse",
                          meta: { ...metaExample, format: "json", detail: "full" },
                          domain: "example.com",
                          scanId: "scan_abc123",
                          findings: [compactFindingExample],
                          reviewContext: {
                            disclaimer:
                              "Findings are organized by privacy, consumer protection, accessibility, and other review contexts. These are automated signals for review, not legal determinations.",
                            lenses: [
                              {
                                name: "GDPR / ePrivacy",
                                status: "needs_work",
                                score: 28,
                                contributingFindingIds: ["pre_consent_tracking_detected"]
                              }
                            ]
                          },
                          evidenceHighlights: {
                            trackerFootprint: {
                              thirdPartyDomainsObserved: 7,
                              classifiedTrackerVendors: 2,
                              summary: "7 third-party domains observed; 2 classified tracker vendors identified."
                            }
                          },
                          links: linksExample,
                          feedback: feedbackExample,
                          disclaimer: PULSE_STANDARD_DISCLAIMER
                        }
                      }
                    }
                  },
                  "text/markdown": {
                    examples: {
                      markdown: {
                        value:
                          "# CertScore Pulse: example.com\n\nStatus: Completed\nScore: 72/100\n\n## Quick readout\n\nAutomated scan surfaced consent-timing and third-party collection review signals.\n\n## Disclaimer\n\n" +
                          PULSE_STANDARD_DISCLAIMER
                      }
                    }
                  }
                }
              },
              "202": {
                description:
                  "Pulse scan accepted or still pending. The wait parameter can hold the current HTTP request only up to 80 seconds; total queue plus scan completion may take longer, so clients should poll statusUrl.",
                content: {
                  "application/json": {
                    examples: {
                      pending: {
                        value: {
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
                          resultUrl: null,
                          reportUrl: "https://certscore.ai/scan/scan_abc123",
                          disclaimer: PULSE_STANDARD_DISCLAIMER
                        }
                      }
                    }
                  }
                }
              },
              "400": {
                description: "Invalid URL or input.",
                content: {
                  "application/json": {
                    examples: {
                      invalidUrl: {
                        value: {
                          type: "certscore_pulse_error",
                          meta: metaExample,
                          error: {
                            code: "invalid_url",
                            message: "Enter a valid public website URL or domain.",
                            retryAfterSeconds: null
                          },
                          feedback: { email: PULSE_FEEDBACK_EMAIL },
                          disclaimer: PULSE_STANDARD_DISCLAIMER
                        }
                      }
                    }
                  }
                }
              },
              "404": {
                description: "Scan or Pulse job not found.",
                content: {
                  "application/json": {
                    examples: {
                      notFound: {
                        value: {
                          type: "certscore_pulse_error",
                          meta: metaExample,
                          error: { code: "not_found", message: "Pulse job not found.", retryAfterSeconds: null },
                          feedback: { email: PULSE_FEEDBACK_EMAIL },
                          disclaimer: PULSE_STANDARD_DISCLAIMER
                        }
                      }
                    }
                  }
                }
              },
              "429": {
                description: "Rate limited. Expensive scan creation is limited by normalized domain.",
                headers: {
                  "Retry-After": {
                    schema: { type: "integer" },
                    description: "Seconds to wait before retrying scan creation."
                  }
                },
                content: {
                  "application/json": {
                    examples: {
                      throttled: {
                        value: {
                          type: "certscore_pulse_error",
                          meta: metaExample,
                          error: {
                            code: "pulse_throttled",
                            message: "A Pulse scan for this domain was requested recently. Try again in a few minutes.",
                            retryAfterSeconds: 240
                          },
                          feedback: { email: PULSE_FEEDBACK_EMAIL },
                          disclaimer: PULSE_STANDARD_DISCLAIMER
                        }
                      }
                    }
                  }
                }
              },
              "500": {
                description: "Temporary unavailable response with public-safe message.",
                content: {
                  "application/json": {
                    examples: {
                      internalError: {
                        value: {
                          type: "certscore_pulse_error",
                          meta: metaExample,
                          error: {
                            code: "internal_error",
                            message: "Pulse is temporarily unavailable. Try again later.",
                            retryAfterSeconds: null
                          },
                          feedback: { email: PULSE_FEEDBACK_EMAIL },
                          disclaimer: PULSE_STANDARD_DISCLAIMER
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
            summary: "Retrieve Pulse job status.",
            parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }],
            responses: {
              "200": {
                description: "Completed, completed-limited, or terminal public-safe status.",
                content: {
                  "application/json": {
                    examples: {
                      completed: {
                        value: {
                          type: "certscore_pulse_status",
                          meta: { ...metaExample, format: "json", detail: "standard" },
                          jobId: "pulse_job_123",
                          scanId: "scan_abc123",
                          domain: "example.com",
                          status: "completed",
                          completedAt: "2026-05-18T23:15:31Z",
                          resultUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_abc123",
                          reportUrl: "https://certscore.ai/scan/scan_abc123",
                          disclaimer: PULSE_STANDARD_DISCLAIMER
                        }
                      },
                      rateLimited: {
                        value: {
                          type: "certscore_pulse_status",
                          meta: { ...metaExample, format: "json", detail: "standard" },
                          jobId: "pulse_job_123",
                          domain: "example.com",
                          status: "rate_limited",
                          message: "A Pulse scan for this domain was requested recently. Try again in a few minutes.",
                          retryAfterSeconds: 240,
                          disclaimer: PULSE_STANDARD_DISCLAIMER
                        }
                      }
                    }
                  }
                }
              },
              "202": {
                description: "Queued, running, or finalizing status.",
                content: {
                  "application/json": {
                    examples: {
                      queued: {
                        value: {
                          type: "certscore_pulse_status",
                          meta: { ...metaExample, format: "json", detail: "standard" },
                          jobId: "pulse_job_123",
                          domain: "example.com",
                          status: "queued",
                          phase: "queued",
                          message: "Pulse scan request is queued.",
                          elapsedSeconds: 4,
                          estimatedWaitSeconds: 60,
                          disclaimer: PULSE_STANDARD_DISCLAIMER
                        }
                      },
                      running: {
                        value: {
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
                          disclaimer: PULSE_STANDARD_DISCLAIMER
                        }
                      }
                    }
                  }
                }
              },
              "404": {
                description: "Pulse job not found.",
                content: {
                  "application/json": {
                    examples: {
                      notFound: {
                        value: {
                          type: "certscore_pulse_error",
                          meta: metaExample,
                          error: { code: "not_found", message: "Pulse job not found.", retryAfterSeconds: null },
                          feedback: { email: PULSE_FEEDBACK_EMAIL },
                          disclaimer: PULSE_STANDARD_DISCLAIMER
                        }
                      }
                    }
                  }
                }
              }
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
              "200": {
                description: "Feedback stored privately.",
                content: {
                  "application/json": {
                    examples: {
                      success: {
                        value: {
                          type: "certscore_pulse_feedback",
                          ok: true,
                          feedback: { email: PULSE_FEEDBACK_EMAIL }
                        }
                      }
                    }
                  }
                }
              },
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
    } as const;

export function GET() {
  return new Response(JSON.stringify(openApiDocument), {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Type": "application/json; charset=utf-8"
    },
    status: 200
  });
}
