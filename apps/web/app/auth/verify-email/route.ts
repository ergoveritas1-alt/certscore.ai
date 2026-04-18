import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=invalid_verification_link", requestUrl.origin));
  }

  const bridgeUrl = new URL("/api/auth/verify-email", requestUrl.origin);
  bridgeUrl.searchParams.set("token", token);
  bridgeUrl.searchParams.set("callbackURL", `${requestUrl.origin}/login?message=email_verified`);
  return NextResponse.redirect(bridgeUrl);
}
