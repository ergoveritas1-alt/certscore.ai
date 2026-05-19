const discoveryDocument = {
  name: "CertScore Pulse",
  description: "Retrieve automated public-web risk signal summaries for a URL.",
  api: "https://certscore.ai/api/v1/pulse",
  openapi: "https://certscore.ai/api/v1/openapi.json",
  docs: "https://certscore.ai/api-pulse",
  formats: ["json", "markdown"],
  detailLevels: ["tiny", "standard", "full"],
  detailAliases: { quick: "tiny" },
  example: "https://certscore.ai/api/v1/pulse?url=https://example.com",
  statusExample: "https://certscore.ai/api/v1/pulse/status/pulse_job_123",
  feedbackEmail: "support@certscore.ai",
  disclaimer: "Automated public-web observations for review. Not legal advice, certification, or a compliance determination."
} as const;

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function GET(request: Request) {
  const id = requestId(request);

  return new Response(JSON.stringify(discoveryDocument), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-CertScore-Pulse": "v1",
      "X-CertScore-Route": "discovery",
      "X-CertScore-Request-Id": id,
      "X-Content-Type-Options": "nosniff"
    },
    status: 200
  });
}
