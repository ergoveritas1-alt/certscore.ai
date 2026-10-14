import { pagePath } from "../../../lib/insights/contract";
import { serveInsight } from "../../../server/insights/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const path = `/insights/${(await context.params).slug}`;
  if (!pagePath.safeParse(path).success) return new Response("Not found", { status: 404 });
  return serveInsight(path, request);
}
