import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "./server/better-auth/auth";

function applyAuthHeaders(response: NextResponse, headers: Headers | undefined) {
  if (!headers) {
    return response;
  }

  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === "set-cookie") {
      response.headers.append(key, value);
      continue;
    }

    response.headers.set(key, value);
  }

  return response;
}

export async function middleware(request: NextRequest) {
  const sessionResult = await auth.api.getSession({
    headers: request.headers,
    query: {
      disableCookieCache: true
    },
    returnHeaders: true
  });

  if (sessionResult?.response?.session && sessionResult.response.user) {
    return applyAuthHeaders(
      NextResponse.next({
        request
      }),
      sessionResult.headers
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return applyAuthHeaders(NextResponse.redirect(loginUrl), sessionResult?.headers);
}

export const config = {
  matcher: ["/app/:path*"]
};

export const runtime = "nodejs";
