import { NextResponse } from "next/server";
import { resolveMarketplaceCustomer } from "../../../../../server/marketplace/aws";
import { createMarketplaceClaim } from "../../../../../server/marketplace/repository";
import { MARKETPLACE_CLAIM_COOKIE, MARKETPLACE_LIGHT_PATH } from "../../../../../server/marketplace/config";
import { admitMarketplaceRequest, boundedText } from "../../../../../server/marketplace/http";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!admitMarketplaceRequest("register", 30)) return new Response("Please retry in a minute.", { status: 429, headers: { "Retry-After": "60" } });
  try {
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return new Response("Expected AWS Marketplace registration form.", { status: 415 });
    const form = new URLSearchParams(await boundedText(request, 16_384));
    const token = form.get("x-amzn-marketplace-token");
    if (!token || form.getAll("x-amzn-marketplace-token").length !== 1) return new Response("Missing Marketplace registration token.", { status: 400 });
    const claim = await createMarketplaceClaim(await resolveMarketplaceCustomer(token));
    const response = NextResponse.redirect(new URL(MARKETPLACE_LIGHT_PATH, "https://certscore.ai"), 303);
    response.cookies.set(MARKETPLACE_CLAIM_COOKIE, claim, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 1800 });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    // Never log registration tokens, credentials, request bodies, or AWS responses.
    return new Response("Setup could not be completed. Return to your AWS Marketplace subscription and choose Set up your account again.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
export function GET() { return NextResponse.redirect(new URL(MARKETPLACE_LIGHT_PATH, "https://certscore.ai"), 303); }
