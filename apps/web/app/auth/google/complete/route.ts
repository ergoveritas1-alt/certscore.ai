import { NextResponse } from "next/server";
import { provisionSelfServeUserSession } from "../../../../server/auth-flows/provision-self-serve-user";
import { getBetterAuthSessionUser } from "../../../../server/better-auth/session";
import { getRequestOrigin } from "../../../../server/http/request-origin";

function getSafeRedirectPath(nextPath: string | null) {
  if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) {
    return nextPath;
  }

  return "/app";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const requestOrigin = getRequestOrigin(request);
  const user = await getBetterAuthSessionUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?error=google_sign_in_failed", requestOrigin));
  }

  await provisionSelfServeUserSession(user);
  return NextResponse.redirect(new URL(getSafeRedirectPath(requestUrl.searchParams.get("next")), requestOrigin));
}
