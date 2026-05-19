const discoveryDocument = {
  name: "CertScore Pulse",
  description: "Retrieve automated public-web risk signal summaries for a URL. detail=quick is accepted as an alias for detail=tiny.",
  api: "https://certscore.ai/api/v1/pulse",
  openapi: "https://certscore.ai/api/v1/openapi.json",
  docs: "https://certscore.ai/api-pulse",
  findingsReference: "https://certscore.ai/findings",
  formats: ["json", "markdown"],
  detailLevels: ["tiny", "standard", "full"],
  detailAliases: { quick: "tiny" },
  example: "https://certscore.ai/api/v1/pulse?url=https://example.com",
  statusExample: "https://certscore.ai/api/v1/pulse/status/pulse_job_123",
  feedbackEmail: "support@certscore.ai",
  disclaimer: "Automated public-web observations for review. Not legal advice, certification, or a compliance determination."
} as const;

export function GET() {
  return new Response(JSON.stringify(discoveryDocument, null, 2), {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Content-Type": "application/json; charset=utf-8",
      "Surrogate-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    },
    status: 200
  });
}
