"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuth } from "../better-auth/auth";
import { sendPasswordSetupLink } from "../auth-flows/password-setup";
import { findAppUserByEmailRecord, findOrganizationMembershipByUserId, upsertAppUserProfile } from "../users/repository";
import { requirePlatformAdminContext } from "./platform-admin";

const schema = z.object({
  email: z.string().trim().toLowerCase().email()
});

export async function createAdminUserFormAction(formData: FormData): Promise<void> {
  await requirePlatformAdminContext();
  const { email } = schema.parse({ email: formData.get("email") });

  const existingUser = await findAppUserByEmailRecord(email);
  if (existingUser) {
    if (await findOrganizationMembershipByUserId(existingUser.id)) {
      redirect("/app/admin/users?message=user_exists");
    }

    await sendPasswordSetupLink(existingUser.email);
    revalidatePath("/app/admin/users");
    redirect("/app/admin/users?message=invite_sent");
  }

  const initialName = email.split("@", 1)[0] || email;
  const created = await getAuth().api.createUser({
    body: { email, name: initialName }
  });
  if (!created?.user) {
    throw new Error("The authentication account could not be created.");
  }

  await upsertAppUserProfile({
    authProvider: "password",
    email: created.user.email,
    fullName: created.user.name ?? initialName,
    userId: created.user.id
  });
  await sendPasswordSetupLink(created.user.email);

  revalidatePath("/app/admin/users");
  revalidatePath("/app/admin");
}
