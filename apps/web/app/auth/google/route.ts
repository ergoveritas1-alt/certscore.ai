import { safeAuthReturnPath as getSafeRedirectPath, authRetryPath } from "../../../lib/auth-return-path";
import { NextResponse } from "next/server";
import { isGoogleAuthAllowedForHost, isGoogleAuthEnabled } from "../../../lib/env";
import { getAuth } from "../../../server/better-auth/auth";
import { getRequestOrigin } from "../../../server/http/request-origin";


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
    return NextResponse.redirect(new URL(authRetryPath("google_sign_in_unavailable", requestUrl.searchParams.get("next")), requestOrigin));
  }

  const nextPath = getSafeRedirectPath(requestUrl.searchParams.get("next"));
  const callbackURL = new URL(nextPath, requestOrigin).toString();
  const newUserCallbackURL = new URL("/auth/google/complete", requestOrigin);
  newUserCallbackURL.searchParams.set("next", nextPath);
  const errorCallbackURL = new URL(authRetryPath("google_sign_in_failed", requestUrl.searchParams.get("next")), requestOrigin).toString();
  const { response: result, headers: authResponseHeaders } = await getAuth().api.signInSocial({
    body: {
      callbackURL,
      disableRedirect: true,
      errorCallbackURL,
      newUserCallbackURL: newUserCallbackURL.toString(),
      provider: "google"
    },
    headers: authHeaders,
    returnHeaders: true
  });

  if (!result.url) {
    return NextResponse.redirect(new URL(authRetryPath("google_sign_in_failed", requestUrl.searchParams.get("next")), requestOrigin));
  }

  const response = NextResponse.redirect(result.url);
  for (const cookie of authResponseHeaders.getSetCookie()) {
    response.headers.append("Set-Cookie", cookie);
  }
  return response;
}
