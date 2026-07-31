import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { getDashboardContext } from "../auth";
import { parsePlatformAdminEmails } from "./platform-admin-core";

export const getPlatformAdminEmails = cache(() => parsePlatformAdminEmails(process.env.CERTSCORE_ADMIN_EMAILS));

export function isPlatformAdminEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  return getPlatformAdminEmails().has(email.toLowerCase());
}

export const getPlatformAdminFlag = cache(async () => {
  const { user } = await getDashboardContext();
  return isPlatformAdminEmail(user.email);
});

export const requirePlatformAdminContext = cache(async () => {
  const context = await getDashboardContext();

  if (!isPlatformAdminEmail(context.user.email)) {
    redirect("/app");
  }

  return context;
});
