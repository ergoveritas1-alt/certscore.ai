import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { BETTER_AUTH_COOKIE_PREFIX, BETTER_AUTH_SESSION_COOKIE_NAME } from "./server/better-auth/constants";

export async function middleware(request: NextRequest) {
  const betterAuthCookie = getSessionCookie(request, {
    cookieName: BETTER_AUTH_SESSION_COOKIE_NAME,
    cookiePrefix: BETTER_AUTH_COOKIE_PREFIX
  });

  if (betterAuthCookie) {
    return NextResponse.next({
      request
    });
  }
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/app/:path*"]
};
