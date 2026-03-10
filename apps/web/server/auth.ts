import type { User } from "@website-signal-risk-scanner/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createServerSupabaseClient } from "../lib/supabase/server";
import { bootstrapUserFromSession, type BootstrapResult } from "./bootstrap-user";

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const cookieStore = await cookies();
  const supabase = createServerSupabaseClient({
    cookies: {
      getAll() {
        return cookieStore.getAll();
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  return user;
});

export async function requireAuthenticatedUser(): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export const getDashboardContext = cache(async (): Promise<BootstrapResult> => {
  const user = await requireAuthenticatedUser();
  return bootstrapUserFromSession(user);
});
