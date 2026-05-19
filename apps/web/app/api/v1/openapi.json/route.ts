const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "CertScore Pulse API",
    version: "1.0.0",
    description:
      "CertScore Pulse provides automated public-web observations for review. It does not provide legal advice, certify compliance, or determine whether a website violates law."
  },
  servers: [{ url: "https://certscore.ai" }],
  paths: {
    "/api/v1/pulse": {
      get: {
        summary: "Retrieve a CertScore Pulse summary for a URL, scan, or job.",
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
          "200": { description: "Completed Pulse response" },
          "202": { description: "Pulse job queued or running" },
          "400": { description: "Invalid input" },
          "429": { description: "Throttled" }
        }
      }
    },
    "/api/v1/pulse/status/{jobId}": {
      get: {
        summary: "Retrieve Pulse job status.",
        parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Pulse job status" },
          "202": { description: "Pulse job queued or running" },
          "404": { description: "Pulse job not found" }
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
