import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth";
import { normalizeEmail } from "../password-auth/user";

export const VALIDATION_ALLOWED_EMAIL = "bmasek@gmail.com";

export function isValidationAllowedEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  return normalizeEmail(email) === VALIDATION_ALLOWED_EMAIL;
}

export async function requireValidationAdminContext() {
  const user = await getCurrentUser();

  if (!user || !isValidationAllowedEmail(user.email)) {
    redirect("/login");
  }

  return { user };
}
