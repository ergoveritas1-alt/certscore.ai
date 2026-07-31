"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ADMIN_PLAN_STATUSES, PLAN_CODES } from "../../lib/admin/plan-options";
import { ASSIGNABLE_MEMBERSHIP_ROLES } from "../../lib/auth/membership-role-policy";
import { findAppUserProfileById } from "../users/repository";
import { addCompanyMembership } from "../company/repository";
import { updateAdminOrganizationPlan } from "./repository";
import { requirePlatformAdminContext } from "./platform-admin";

const schema = z.object({
  organizationId: z.string().uuid("Invalid workspace."),
  plan: z.preprocess((value) => value === "" ? undefined : value, z.enum(PLAN_CODES).optional()),
  planStatus: z.enum(ADMIN_PLAN_STATUSES),
  role: z.enum(ASSIGNABLE_MEMBERSHIP_ROLES),
  userId: z.string().uuid("Invalid user.")
});

export async function assignUserWorkspaceFormAction(formData: FormData): Promise<void> {
  await requirePlatformAdminContext();
  const parsed = schema.parse({
    organizationId: formData.get("organizationId"),
    plan: formData.get("plan"),
    planStatus: formData.get("planStatus"),
    role: formData.get("role"),
    userId: formData.get("userId")
  });

  const user = await findAppUserProfileById(parsed.userId);
  if (!user) {
    throw new Error("The user could not be found.");
  }

  await addCompanyMembership({
    organizationId: parsed.organizationId,
    role: parsed.role,
    userId: parsed.userId
  });
  if (parsed.plan) {
    await updateAdminOrganizationPlan({
      organizationId: parsed.organizationId,
      plan: parsed.plan,
      planStatus: parsed.planStatus
    });
  }

  revalidatePath("/app", "layout");
  revalidatePath("/app/admin/users");
  revalidatePath("/app/admin");
  revalidatePath("/app/admin/companies");
  redirect("/app/admin/users");
}
