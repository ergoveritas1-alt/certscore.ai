"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ASSIGNABLE_MEMBERSHIP_ROLES } from "../../lib/auth/membership-role-policy";
import { updateAdminMembershipRole } from "./repository";
import { requirePlatformAdminContext } from "./platform-admin";

const schema = z.object({
  organizationId: z.string().uuid("Invalid organization."),
  userId: z.string().uuid("Invalid user."),
  role: z.enum(ASSIGNABLE_MEMBERSHIP_ROLES)
});

export async function updateMembershipRoleFormAction(formData: FormData): Promise<void> {
  await requirePlatformAdminContext();
  const parsed = schema.parse({
    organizationId: formData.get("organizationId"),
    userId: formData.get("userId"),
    role: formData.get("role")
  });

  await updateAdminMembershipRole(parsed);

  revalidatePath("/app/admin");
  revalidatePath("/app/admin/users");
  redirect("/app/admin/users");
}
