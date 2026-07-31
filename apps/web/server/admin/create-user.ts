"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_NEW_MEMBERSHIP_ROLE } from "../../lib/auth/membership-role-policy";
import { getAuth } from "../better-auth/auth";
import { sendPasswordSetupLink } from "../auth-flows/password-setup";
import { createUserWorkspaceIdentity } from "../company/workspace-identity";
import {
  createOrganizationForUser,
  findAppUserByEmailRecord,
  findOrganizationMembershipByUserId,
  upsertAppUserProfile
} from "../users/repository";
import { requirePlatformAdminContext } from "./platform-admin";

const schema = z.object({
  email: z.string().trim().toLowerCase().email()
});

async function createWorkspaceForUser(input: { email: string; userId: string }) {
  const workspace = createUserWorkspaceIdentity(input.email);
  return createOrganizationForUser({
    ...workspace,
    role: DEFAULT_NEW_MEMBERSHIP_ROLE,
    userId: input.userId
  });
}

export async function createAdminUserFormAction(formData: FormData): Promise<void> {
  await requirePlatformAdminContext();
  const { email } = schema.parse({ email: formData.get("email") });

  const existingUser = await findAppUserByEmailRecord(email);
  if (existingUser) {
    if (await findOrganizationMembershipByUserId(existingUser.id)) {
      redirect("/app/admin/users?message=user_exists");
    }

    await createWorkspaceForUser({
      email: existingUser.email,
      userId: existingUser.id
    });
    await sendPasswordSetupLink(existingUser.email);
    revalidatePath("/app/admin/users");
    revalidatePath("/app/admin/companies");
    redirect("/app/admin/users?message=existing_user_workspace_created");
  }

  const initialName = email.split("@", 1)[0] || email;
  const created = await getAuth().api.createUser({
    body: {
      email,
      name: initialName,
      role: DEFAULT_NEW_MEMBERSHIP_ROLE
    }
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
  await createWorkspaceForUser({
    email: created.user.email,
    userId: created.user.id
  });
  await sendPasswordSetupLink(created.user.email);

  revalidatePath("/app/admin/users");
  revalidatePath("/app/admin");
  revalidatePath("/app/admin/companies");
  redirect("/app/admin/users?message=user_created");
}
