import { redirect } from "next/navigation";
import { cache } from "react";
import { bootstrapAppUserSession, type BootstrapResult } from "./bootstrap-user";
import { getBetterAuthSessionUser } from "./better-auth/session";
import { getPasswordSessionUser } from "./password-auth/session";
import type { AuthenticatedAppUser } from "./password-auth/types";

export const getCurrentUser = cache(async (): Promise<AuthenticatedAppUser | null> => {
  const betterAuthUser = await getBetterAuthSessionUser();

  if (betterAuthUser) {
    return betterAuthUser;
  }

  return getPasswordSessionUser();
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
  return bootstrapAppUserSession(user);
});
