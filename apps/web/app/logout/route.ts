import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BETTER_AUTH_SESSION_COOKIE_NAME } from "../../server/better-auth/constants";
import { auth } from "../../server/better-auth/auth";
import { PASSWORD_AUTH_COOKIE_NAME } from "../../server/password-auth/constants";
import { getPasswordSessionCookieOptions, revokePasswordSessionToken } from "../../server/password-auth/session";

async function logout(request: Request) {
  const requestUrl = new URL(request.url);
  const cookieStore = await cookies();
  const passwordSessionToken = cookieStore.get(PASSWORD_AUTH_COOKIE_NAME)?.value ?? null;
  const response = NextResponse.redirect(new URL("/login?message=signed_out", requestUrl.origin));

  await auth.api.signOut({
    headers: request.headers
  });
  await revokePasswordSessionToken(passwordSessionToken);
  response.cookies.set(BETTER_AUTH_SESSION_COOKIE_NAME, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: requestUrl.protocol === "https:"
  });
  response.cookies.set(PASSWORD_AUTH_COOKIE_NAME, "", getPasswordSessionCookieOptions(new Date(0)));

  return response;
}

export async function GET(request: Request) {
  return logout(request);
}

export async function POST(request: Request) {
  return logout(request);
}
