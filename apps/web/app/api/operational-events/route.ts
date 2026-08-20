import { handleOperationalEventPost } from "../../../server/product-analytics/ingest-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleOperationalEventPost(request);
}
