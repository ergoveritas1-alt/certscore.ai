import { NextResponse } from "next/server";
import { getRequestOrigin } from "../../../server/http/request-origin";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const requestOrigin = getRequestOrigin(request);
  const token = requestUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=invalid_verification_link", requestOrigin));
  }

  const bridgeUrl = new URL("/api/auth/verify-email", requestOrigin);
  bridgeUrl.searchParams.set("token", token);
  bridgeUrl.searchParams.set("callbackURL", `${requestOrigin}/login?message=email_verified`);
  return NextResponse.redirect(bridgeUrl);
}
