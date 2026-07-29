"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { sendPasswordSetupLink } from "../auth-flows/password-setup";
import { findBetterAuthUserByEmail, findAppUserProfileById } from "../users/repository";
import { requirePlatformAdminContext } from "./platform-admin";

const schema = z.object({
  userId: z.string().uuid("Invalid user.")
});

export async function sendUserPasswordResetFormAction(formData: FormData): Promise<void> {
  await requirePlatformAdminContext();
  const { userId } = schema.parse({ userId: formData.get("userId") });
  const user = await findAppUserProfileById(userId);

  if (!user) {
    throw new Error("The user could not be found.");
  }

  const authUser = await findBetterAuthUserByEmail(user.email);
  if (!authUser) {
    throw new Error("This user does not have an active login account.");
  }

  await sendPasswordSetupLink(user.email);

  revalidatePath("/app/admin/users");
  redirect("/app/admin/users?message=password_reset_sent");
}
