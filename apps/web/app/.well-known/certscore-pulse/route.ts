import { NextResponse } from "next/server";
import { PULSE_SHORT_DISCLAIMER, PULSE_FEEDBACK_EMAIL } from "../../../lib/pulse/constants";

export function GET() {
  return NextResponse.json(
    {
      name: "CertScore Pulse",
      description: "Retrieve automated public-web risk signal summaries for a URL.",
      api: "https://certscore.ai/api/v1/pulse",
      openapi: "https://certscore.ai/api/v1/openapi.json",
      docs: "https://certscore.ai/api-pulse",
      findingsReference: "https://certscore.ai/findings",
      formats: ["json", "markdown"],
      detailLevels: ["tiny", "standard", "full"],
      example: "https://certscore.ai/api/v1/pulse?url=https://example.com",
      statusExample: "https://certscore.ai/api/v1/pulse/status/pulse_job_123",
      feedbackEmail: PULSE_FEEDBACK_EMAIL,
      disclaimer: PULSE_SHORT_DISCLAIMER
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600"
      }
    }
  );
}
