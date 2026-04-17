import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { PASSWORD_AUTH_COOKIE_NAME } from "./server/password-auth/constants";

export async function middleware(request: NextRequest) {
  if (request.cookies.get(PASSWORD_AUTH_COOKIE_NAME)?.value) {
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
