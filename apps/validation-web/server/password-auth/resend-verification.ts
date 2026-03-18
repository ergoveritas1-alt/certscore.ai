"use server";

import { getCurrentUser } from "../auth";
import { getPasswordAuthVerificationStatus } from "./user";
import { sendVerificationEmail } from "./verification";

export type ResendVerificationActionState = {
  error: string | null;
  success: string | null;
};

export const initialResendVerificationActionState: ResendVerificationActionState = {
  error: null,
  success: null
};

export async function resendVerificationEmailAction(): Promise<ResendVerificationActionState> {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.authProvider !== "password") {
    return {
      error: "Verification email is only available for password accounts.",
      success: null
    };
  }

  const verificationStatus = await getPasswordAuthVerificationStatus(currentUser.id);

  if (!verificationStatus) {
    return {
      error: "Verification email is unavailable for this account.",
      success: null
    };
  }

  if (verificationStatus.verifiedAt) {
    return {
      error: null,
      success: "Email already verified."
    };
  }

  try {
    await sendVerificationEmail({
      email: verificationStatus.email,
      userId: currentUser.id
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
