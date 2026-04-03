import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { getDashboardContext } from "../auth";

const DEFAULT_PLATFORM_ADMIN_EMAILS = new Set(["bmasek@gmail.com", "ben@ergoveritas.com"]);

function parseAdminEmails(value: string | undefined) {
  return new Set([
    ...DEFAULT_PLATFORM_ADMIN_EMAILS,
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  ]);
}

export const getPlatformAdminEmails = cache(() => parseAdminEmails(process.env.CERTSCORE_ADMIN_EMAILS));

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

export async function requirePlatformAdminContext() {
  const context = await getDashboardContext();

  if (!isPlatformAdminEmail(context.user.email)) {
    redirect("/app");
  }

  return context;
}
