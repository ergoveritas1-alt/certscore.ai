"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import type { PlanCode, PlanStatus } from "@website-signal-risk-scanner/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePlatformAdminContext } from "./platform-admin";

const schema = z.object({
  organizationId: z.string().uuid("Invalid organization."),
  plan: z.enum(["free", "pro", "team"]),
  planStatus: z.enum(["active", "trialing", "past_due", "paused"])
});

export async function updateOrganizationPlanFormAction(formData: FormData): Promise<void> {
  await requirePlatformAdminContext();
  const parsed = schema.parse({
    organizationId: formData.get("organizationId"),
    plan: formData.get("plan") as PlanCode,
    planStatus: formData.get("planStatus") as PlanStatus
  });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      plan: parsed.plan,
      plan_status: parsed.planStatus
    })
    .eq("id", parsed.organizationId);

  if (error) {
    throw new Error(`Failed to update organization plan: ${error.message}`);
  }

  revalidatePath("/app", "layout");
  revalidatePath("/app/admin");
  revalidatePath("/app/admin/users");
  redirect("/app/admin/users");
}
