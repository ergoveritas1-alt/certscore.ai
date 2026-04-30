import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const sessionCookieNames = new Set([
  "session_token",
  "certscore.session_token",
  "__Secure-certscore.session_token",
  "certscore_session"
]);

function hasSessionCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => sessionCookieNames.has(cookie.name));
}

export async function middleware(request: NextRequest) {
  if (hasSessionCookie(request)) {
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
