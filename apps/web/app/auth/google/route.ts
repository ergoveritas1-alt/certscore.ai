import { NextResponse } from "next/server";
import { isGoogleAuthAllowedForHost, isGoogleAuthEnabled } from "../../../lib/env";
import { getAuth } from "../../../server/better-auth/auth";
import { getRequestOrigin } from "../../../server/http/request-origin";

function getSafeRedirectPath(nextPath: string | null) {
  if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) {
    return nextPath;
  }

  return "/app";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const requestOrigin = getRequestOrigin(request);
  const resolvedOrigin = new URL(requestOrigin);
  const requestHost = resolvedOrigin.host;
  const authHeaders = new Headers(request.headers);
  authHeaders.set("host", requestHost);
  authHeaders.set("x-forwarded-host", requestHost);
  authHeaders.set("x-forwarded-proto", resolvedOrigin.protocol.replace(":", ""));

  if (!isGoogleAuthEnabled() || !isGoogleAuthAllowedForHost(requestHost)) {
    return NextResponse.redirect(new URL("/login?error=google_sign_in_unavailable", requestOrigin));
  }

  const nextPath = getSafeRedirectPath(requestUrl.searchParams.get("next"));
  const callbackURL = new URL(nextPath, requestOrigin).toString();
  const newUserCallbackURL = new URL("/auth/google/complete", requestOrigin);
  newUserCallbackURL.searchParams.set("next", nextPath);
  const errorCallbackURL = new URL("/login?error=google_sign_in_failed", requestOrigin).toString();
  const result = await getAuth().api.signInSocial({
    body: {
      callbackURL,
      disableRedirect: true,
      errorCallbackURL,
      newUserCallbackURL: newUserCallbackURL.toString(),
      provider: "google"
    },
    headers: authHeaders
  });

  if (!result.url) {
    return NextResponse.redirect(new URL("/login?error=google_sign_in_failed", requestOrigin));
  }

  return NextResponse.redirect(result.url);
}
