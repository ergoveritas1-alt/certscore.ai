import { serveInsight } from "../../../server/insights/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return serveInsight("/images/ai-leaderboard-social-card.png", request);
}
