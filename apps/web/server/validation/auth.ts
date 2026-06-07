"use server";

import { redirect } from "next/navigation";
import { cache } from "react";
import { getDashboardContext } from "../auth";
import { isPlatformAdminEmail } from "../admin/platform-admin";

const getCachedValidationAdminFlag = cache(async () => {
  const context = await getDashboardContext();
  return isPlatformAdminEmail(context.user.email);
});

export async function getValidationAdminFlag() {
  return getCachedValidationAdminFlag();
}

export async function requireValidationAdminContext() {
  const context = await getDashboardContext();
  if (!isPlatformAdminEmail(context.user.email)) {
    redirect("/app");
  }

  return context;
}
