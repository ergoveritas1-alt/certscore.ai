import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../lib/supabase/server";
import { bootstrapUserFromSession } from "../../../server/bootstrap-user";

type SupportedEmailOtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

function getSafeRedirectPath(nextParam: string | null) {
  if (nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")) {
    return nextParam;
  }

  return "/app";
}

function getOtpType(typeParam: string | null): SupportedEmailOtpType | null {
  if (
    typeParam === "signup" ||
    typeParam === "invite" ||
    typeParam === "magiclink" ||
    typeParam === "recovery" ||
    typeParam === "email_change" ||
    typeParam === "email"
  ) {
    return typeParam;
  }

  return null;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const otpType = getOtpType(requestUrl.searchParams.get("type"));
  const nextPath = getSafeRedirectPath(requestUrl.searchParams.get("next"));

  if (!code && !(tokenHash && otpType)) {
    return NextResponse.redirect(new URL("/login?error=missing_code", requestUrl.origin));
  }

  const cookieStore = await cookies();
  const supabase = createServerSupabaseClient({
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      }
    }
  });

  const { error } =
    tokenHash && otpType
      ? await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType
        })
      : await supabase.auth.exchangeCodeForSession(code as string);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth_callback_failed", requestUrl.origin));
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?error=missing_user", requestUrl.origin));
  }

  await bootstrapUserFromSession(user);

  return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
}
