import { redirect } from "next/navigation";
import { cache } from "react";
import { bootstrapAppUserSession, type BootstrapResult } from "./bootstrap-user";
import { getBetterAuthSessionUser } from "./better-auth/session";
import type { AuthenticatedAppUser } from "./auth-flows/types";

export const getCurrentUser = cache(async (): Promise<AuthenticatedAppUser | null> => {
  return getBetterAuthSessionUser();
});

// Report access must reject revoked sessions even while the signed cookie cache lives.
export const getFreshCurrentUser = cache(async (): Promise<AuthenticatedAppUser | null> => {
  return getBetterAuthSessionUser({ disableCookieCache: true });
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
  const base = await bootstrapAppUserSession(user);
  const { selectBrowserContext } = await import("./marketplace-browser/context");
  return selectBrowserContext(base);
});
