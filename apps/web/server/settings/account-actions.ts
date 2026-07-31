"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "../auth";
import { getAuth } from "../better-auth/auth";
import { BETTER_AUTH_SESSION_COOKIE_NAME } from "../better-auth/constants";
import {
  countAdvancedOrganizationMembers,
  deleteAppUserProfileById,
  findOrganizationMembershipByUserId
} from "../users/repository";

const deleteAccountSchema = z.object({
  confirmationEmail: z.string().trim().toLowerCase().email()
});

const LEGACY_PASSWORD_AUTH_COOKIE_NAME = "certscore_session";

export async function deleteAccountFormAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { confirmationEmail } = deleteAccountSchema.parse({
    confirmationEmail: formData.get("confirmationEmail")
  });

  if (confirmationEmail !== user.email.trim().toLowerCase()) {
    throw new Error("Enter your current account email to confirm deletion.");
  }

  const membership = await findOrganizationMembershipByUserId(user.id);
  if (membership && ["advanced", "admin"].includes(membership.role)) {
    const advancedMemberCount = await countAdvancedOrganizationMembers(membership.organization_id);
    if (advancedMemberCount <= 1) {
      throw new Error("Ensure there is at least one advanced company user before deleting your account.");
    }
  }

  await getAuth().api.deleteUser({
    body: {},
    headers: await headers()
  });
  await deleteAppUserProfileById(user.id);

  const cookieStore = await cookies();
  cookieStore.set(BETTER_AUTH_SESSION_COOKIE_NAME, "", { expires: new Date(0), path: "/" });
  cookieStore.set(LEGACY_PASSWORD_AUTH_COOKIE_NAME, "", { expires: new Date(0), path: "/" });
  redirect("/login?message=account_deleted");
}
