"use server";

import { redirect } from "next/navigation";
import { cache } from "react";
import { getDashboardContext } from "../auth";
import { isPlatformAdminEmail } from "../admin/platform-admin";

export const getValidationAdminFlag = cache(async () => {
  const context = await getDashboardContext();
  return isPlatformAdminEmail(context.user.email);
});

export async function requireValidationAdminContext() {
  const context = await getDashboardContext();
  if (!isPlatformAdminEmail(context.user.email)) {
    redirect("/app");
  }

  return context;
}
