"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { findAppUserProfileById } from "../users/repository";
import { addCompanyMembership } from "../company/repository";
import { requirePlatformAdminContext } from "./platform-admin";

const schema = z.object({
  organizationId: z.string().uuid("Invalid workspace."),
  userId: z.string().uuid("Invalid user.")
});

export async function assignUserWorkspaceFormAction(formData: FormData): Promise<void> {
  await requirePlatformAdminContext();
  const parsed = schema.parse({
    organizationId: formData.get("organizationId"),
    userId: formData.get("userId")
  });

  const user = await findAppUserProfileById(parsed.userId);
  if (!user) {
    throw new Error("The user could not be found.");
  }

  await addCompanyMembership({ organizationId: parsed.organizationId, userId: parsed.userId });

  revalidatePath("/app/admin/users");
  revalidatePath("/app/admin");
  revalidatePath("/app/admin/companies");
  redirect("/app/admin/users");
}
