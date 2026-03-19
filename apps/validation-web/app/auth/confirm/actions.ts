"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../../lib/supabase/server";
import { bootstrapUserFromSession } from "../../../server/bootstrap-user";

function getSafeRedirectPath(nextParam: FormDataEntryValue | null) {
  if (typeof nextParam === "string" && nextParam.startsWith("/") && !nextParam.startsWith("//")) {
    return nextParam;
  }

  return "/app";
}

export async function confirmMagicLinkAction(formData: FormData) {
  const tokenHash = formData.get("token_hash");
  const nextPath = getSafeRedirectPath(formData.get("next"));

  if (typeof tokenHash !== "string" || tokenHash.length === 0) {
    redirect("/login?error=missing_code");
  }

  const cookieStore = await cookies();
  const supabase = createServerSupabaseClient({
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      }
    }
  });

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email"
  });

  if (error) {
    redirect("/login?error=auth_callback_failed");
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=missing_user");
  }

  await bootstrapUserFromSession(user);

  redirect(nextPath);
}
