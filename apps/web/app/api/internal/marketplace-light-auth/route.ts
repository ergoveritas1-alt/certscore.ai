import { verifyMarketplaceKeyProof } from "@certscore/mcp-auth";
import { verifyMarketplaceAccess } from "../../../../server/marketplace/access";
import { requireMarketplaceEnabled } from "../../../../server/marketplace/config";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (cs_mp_light_[A-Za-z0-9_-]{43})$/)?.[1];
  const secret = process.env.CERTSCORE_OAUTH_JWT_SECRET || process.env.JWT_SIGNING_KEY;
  const timestamp = request.headers.get("x-certscore-timestamp") ?? "";
  const proof = request.headers.get("x-certscore-proof") ?? "";
  if (!token || !secret || !verifyMarketplaceKeyProof(secret, timestamp, token, proof)) return new Response(null, { status: 401 });
  try {
    requireMarketplaceEnabled();
    const attribution = await verifyMarketplaceAccess(token);
    return attribution
      ? Response.json(attribution, { status: 200, headers: { "Cache-Control": "no-store" } })
      : new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  } catch { return new Response(null, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "10" } }); }
}
