import { AI_LAB_PRIVACY_STUDY_HTML } from "../../../lib/marketing/ai-lab-privacy-study-html";

// A static document preserves the published article without a third-party frame,
// client JavaScript, external fonts, or authentication.
export const dynamic = "force-static";

export function GET() {
  return new Response(AI_LAB_PRIVACY_STUDY_HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
