"use server";

import { headers } from "next/headers";
import { getAuth } from "../better-auth/auth";
import { getBetterAuthEnv } from "../better-auth/env";
import { getCurrentUser } from "../auth";

export type ResendVerificationActionState = {
  error: string | null;
  success: string | null;
};

const initialResendVerificationActionState: ResendVerificationActionState = {
  error: null,
  success: null
};

export async function resendVerificationEmailAction(): Promise<ResendVerificationActionState> {
  const currentUser = await getCurrentUser();

  if (!currentUser || !currentUser.authProvider.split(",").includes("password")) {
    return {
      error: "Verification email is only available for password accounts.",
      success: null
    };
  }

  try {
    await getAuth().api.sendVerificationEmail({
      body: {
        callbackURL: `${getBetterAuthEnv().NEXT_PUBLIC_APP_URL}/login?message=email_verified`,
        email: currentUser.email
      },
      headers: await headers()
    });
  } catch {
    return {
      error: "Could not send verification email right now.",
      success: null
    };
  }

  return {
    error: null,
    success: "Verification email sent."
  };
}
