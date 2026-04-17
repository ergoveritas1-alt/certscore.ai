import { redirect } from "next/navigation";
import { cache } from "react";
import { bootstrapAppUserSession, type BootstrapResult } from "./bootstrap-user";
import { getPasswordSessionUser } from "./password-auth/session";
import type { AuthenticatedAppUser } from "./password-auth/types";

export const getCurrentUser = cache(async (): Promise<AuthenticatedAppUser | null> => {
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
