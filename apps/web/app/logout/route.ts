import { NextResponse } from "next/server";
import { BETTER_AUTH_SESSION_COOKIE_NAME } from "../../server/better-auth/constants";
import { auth } from "../../server/better-auth/auth";

const LEGACY_PASSWORD_AUTH_COOKIE_NAME = "certscore_session";

async function logout(request: Request) {
  const requestUrl = new URL(request.url);
  const response = NextResponse.redirect(new URL("/login?message=signed_out", requestUrl.origin));

  await auth.api.signOut({
    headers: request.headers
  });
  response.cookies.set(BETTER_AUTH_SESSION_COOKIE_NAME, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: requestUrl.protocol === "https:"
  });
  response.cookies.set(LEGACY_PASSWORD_AUTH_COOKIE_NAME, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: requestUrl.protocol === "https:"
  });

  return response;
}

export async function GET(request: Request) {
  return logout(request);
}

export async function POST(request: Request) {
  return logout(request);
}
