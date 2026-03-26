import type { User } from "@website-signal-risk-scanner/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createServerSupabaseClient } from "../lib/supabase/server";
import { bootstrapAppUserSession, bootstrapUserFromSession, type BootstrapResult } from "./bootstrap-user";
import { getPasswordSessionUser } from "./password-auth/session";
import type { AuthenticatedAppUser } from "./password-auth/types";

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

function isSupabaseInvalidRefreshTokenError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /Invalid Refresh Token|Refresh Token Not Found/i.test(error.message);
}

function redirectToLoginWithNetworkError(nextPath = "/app"): never {
  redirect(`/login?error=auth_service_unavailable&next=${encodeURIComponent(nextPath)}`);
}

function mapSupabaseUser(user: User): AuthenticatedAppUser | null {
  if (!user.email) {
    return null;
  }

  const authProvider =
    (Array.isArray(user.app_metadata?.providers) && typeof user.app_metadata.providers[0] === "string"
      ? user.app_metadata.providers[0]
      : typeof user.app_metadata?.provider === "string"
        ? user.app_metadata.provider
        : "magic_link") ?? "magic_link";

  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : null;

  return {
    authProvider,
    email: user.email,
    fullName,
    id: user.id
  };
}

export const getCurrentUser = cache(async (): Promise<AuthenticatedAppUser | null> => {
  const passwordSessionUser = await getPasswordSessionUser();

  if (passwordSessionUser) {
    return passwordSessionUser;
  }

  const cookieStore = await cookies();
  const supabase = createServerSupabaseClient({
    cookies: {
      getAll() {
        return cookieStore.getAll();
      }
    }
  });

  let user: User | null = null;

  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (error) {
    if (isSupabaseNetworkError(error)) {
      return null;
    }

    if (isSupabaseInvalidRefreshTokenError(error)) {
      return null;
    }

    throw error;
  }

  return user ? mapSupabaseUser(user) : null;
});

export async function requireAuthenticatedUser(): Promise<AuthenticatedAppUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export const getDashboardContext = cache(async (): Promise<BootstrapResult> => {
  const user = await requireAuthenticatedUser();

  if (user.authProvider === "password") {
    return bootstrapAppUserSession(user);
  }

  const cookieStore = await cookies();
  const supabase = createServerSupabaseClient({
    cookies: {
      getAll() {
        return cookieStore.getAll();
      }
    }
  });

  let supabaseUser: User | null = null;

  try {
    const result = await supabase.auth.getUser();
    supabaseUser = result.data.user;
  } catch (error) {
    if (isSupabaseNetworkError(error)) {
      redirectToLoginWithNetworkError();
    }

    if (isSupabaseInvalidRefreshTokenError(error)) {
      redirect("/login");
    }

    throw error;
  }

  if (!supabaseUser) {
    redirect("/login");
  }

  return bootstrapUserFromSession(supabaseUser);
});
