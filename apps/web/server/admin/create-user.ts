"use server";

import { queryOne } from "@website-signal-risk-scanner/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_NEW_MEMBERSHIP_ROLE } from "../../lib/auth/membership-role-policy";
import { isAllowedAuthEmail } from "../access-control";
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
  if (!isAllowedAuthEmail(email)) {
    throw new Error("This email is outside the allowed account list.");
  }

  // The password setup link establishes the credential after the user receives it.
  const identity = await queryOne<{ id: string; name: string }>(
    `insert into better_auth_users (id, email, name)
     values ($1, $2, $3)
     on conflict (email) do nothing
     returning id, name`,
    [crypto.randomUUID(), email, initialName]
  ) ?? await queryOne<{ id: string; name: string }>(
    "select id, name from better_auth_users where email = $1",
    [email]
  );
  if (!identity) {
    throw new Error("The authentication account could not be created.");
  }

  await upsertAppUserProfile({
    authProvider: "password",
    email,
    fullName: identity.name,
    userId: identity.id
  });
  await createWorkspaceForUser({ email, userId: identity.id });
  await sendPasswordSetupLink(email);

  revalidatePath("/app/admin/users");
  revalidatePath("/app/admin");
  revalidatePath("/app/admin/companies");
  redirect("/app/admin/users?message=user_created");
}
