import { NextResponse } from "next/server";
import { getAuth } from "../../server/better-auth/auth";
import { getRequestOrigin } from "../../server/http/request-origin";

const LEGACY_PASSWORD_AUTH_COOKIE_NAME = "certscore_session";

async function logout(request: Request) {
  const requestOrigin = getRequestOrigin(request);
  const response = NextResponse.redirect(new URL("/login?message=signed_out", requestOrigin));
  const secureCookie = requestOrigin.startsWith("https://");

  const { headers: authHeaders } = await getAuth().api.signOut({
    headers: request.headers,
    returnHeaders: true
  });
  response.cookies.set(LEGACY_PASSWORD_AUTH_COOKIE_NAME, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: secureCookie
  });

  for (const cookie of authHeaders.getSetCookie()) {
    response.headers.append("Set-Cookie", cookie);
  }

  return response;
}

export async function GET(request: Request) {
  return logout(request);
}

export async function POST(request: Request) {
  return logout(request);
}
