import { NextResponse } from "next/server";
import { auth } from "../../../server/better-auth/auth";

function getSafeRedirectPath(nextPath: string | null) {
  if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) {
    return nextPath;
  }

  return "/app";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const nextPath = getSafeRedirectPath(requestUrl.searchParams.get("next"));
  const callbackURL = new URL(nextPath, requestUrl.origin).toString();
  const errorCallbackURL = new URL("/login?error=google_sign_in_failed", requestUrl.origin).toString();
  const result = await auth.api.signInSocial({
    body: {
      callbackURL,
      disableRedirect: true,
      errorCallbackURL,
      newUserCallbackURL: callbackURL,
      provider: "google"
    },
    headers: request.headers
  });

  if (!result.url) {
    return NextResponse.redirect(new URL("/login?error=google_sign_in_failed", requestUrl.origin));
  }

  return NextResponse.redirect(result.url);
}
