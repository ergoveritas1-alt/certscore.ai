import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PASSWORD_AUTH_COOKIE_NAME } from "../../server/password-auth/constants";
import { getPasswordSessionCookieOptions, revokePasswordSessionToken } from "../../server/password-auth/session";

async function logout(request: Request) {
  const requestUrl = new URL(request.url);
  const cookieStore = await cookies();
  const passwordSessionToken = cookieStore.get(PASSWORD_AUTH_COOKIE_NAME)?.value ?? null;
  const response = NextResponse.redirect(new URL("/login?message=signed_out", requestUrl.origin));

  await revokePasswordSessionToken(passwordSessionToken);
  response.cookies.set(PASSWORD_AUTH_COOKIE_NAME, "", getPasswordSessionCookieOptions(new Date(0)));

  return response;
}

export async function GET(request: Request) {
  return logout(request);
}

export async function POST(request: Request) {
  return logout(request);
}
