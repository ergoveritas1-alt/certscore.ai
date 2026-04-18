import { redirect } from "next/navigation";
import { cache } from "react";
import { bootstrapAppUserSession, type BootstrapResult } from "./bootstrap-user";
import { getBetterAuthSessionUser } from "./better-auth/session";
import type { AuthenticatedAppUser } from "./auth-flows/types";

export const getCurrentUser = cache(async (): Promise<AuthenticatedAppUser | null> => {
  return getBetterAuthSessionUser();
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
