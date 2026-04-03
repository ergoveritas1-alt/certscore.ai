import { NextResponse } from "next/server";
import { verifyEmailToken } from "../../../server/password-auth/verification";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=invalid_verification_link", requestUrl.origin));
  }

  const verified = await verifyEmailToken(token);

  if (!verified) {
    return NextResponse.redirect(new URL("/login?error=invalid_verification_link", requestUrl.origin));
  }

  return NextResponse.redirect(new URL("/login?message=email_verified", requestUrl.origin));
}
