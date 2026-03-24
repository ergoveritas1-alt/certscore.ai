import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "./lib/supabase/server";
import { PASSWORD_AUTH_COOKIE_NAME } from "./server/password-auth/constants";

function isSupabaseNetworkError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const cause = error.cause;
  const code =
    cause && typeof cause === "object" && "code" in cause && typeof (cause as { code?: unknown }).code === "string"
      ? (cause as { code: string }).code
      : null;

  return code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "EAI_AGAIN";
}

export async function middleware(request: NextRequest) {
  if (
    request.nextUrl.pathname === "/" &&
    request.nextUrl.searchParams.get("error_code") === "bad_oauth_state"
  ) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("error", "bad_oauth_state");

    return NextResponse.redirect(loginUrl);
  }

  if (request.nextUrl.pathname !== "/auth/callback" && request.nextUrl.searchParams.has("code")) {
    const callbackUrl = request.nextUrl.clone();
    callbackUrl.pathname = "/auth/callback";

    return NextResponse.redirect(callbackUrl);
  }

  let response = NextResponse.next({
    request
  });

  if (request.cookies.get(PASSWORD_AUTH_COOKIE_NAME)?.value) {
    return response;
  }

  const supabase = createServerSupabaseClient({
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  let user = null;

  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (error) {
    if (isSupabaseNetworkError(error)) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      loginUrl.searchParams.set("error", "auth_service_unavailable");
      loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }

    throw error;
  }

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);

    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/app/:path*"]
};
