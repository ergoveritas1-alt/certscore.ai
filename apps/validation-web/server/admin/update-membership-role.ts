"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePlatformAdminContext } from "./platform-admin";

const schema = z.object({
  organizationId: z.string().uuid("Invalid organization."),
  userId: z.string().uuid("Invalid user."),
  role: z.enum(["admin", "user"])
});

export async function updateMembershipRoleFormAction(formData: FormData): Promise<void> {
  await requirePlatformAdminContext();
  const parsed = schema.parse({
    organizationId: formData.get("organizationId"),
    userId: formData.get("userId"),
    role: formData.get("role")
  });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("organization_members")
    .update({
      role: parsed.role
    })
    .eq("organization_id", parsed.organizationId)
    .eq("user_id", parsed.userId);

  if (error) {
    throw new Error(`Failed to update membership role: ${error.message}`);
  }

  revalidatePath("/app/admin");
  revalidatePath("/app/admin/users");
  redirect("/app/admin/users");
}
