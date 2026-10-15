import { assetPath } from "../../../../lib/insights/contract";
import { serveInsight } from "../../../../server/insights/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ name: string }> }) {
  const path = `/insights/assets/${(await context.params).name}`;
  if (!assetPath.safeParse(path).success) return new Response("Not found", { status: 404 });
  return serveInsight(path, request);
}
