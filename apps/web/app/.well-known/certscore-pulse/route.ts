import { PULSE_SHORT_DISCLAIMER, PULSE_FEEDBACK_EMAIL } from "../../../lib/pulse/constants";

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
  feedbackEmail: PULSE_FEEDBACK_EMAIL,
  disclaimer: PULSE_SHORT_DISCLAIMER
} as const;

export function GET() {
  return new Response(JSON.stringify(discoveryDocument), {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Type": "application/json; charset=utf-8"
    },
    status: 200
  });
}
