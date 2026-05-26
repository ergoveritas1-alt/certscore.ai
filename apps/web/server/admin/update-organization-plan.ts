"use server";

import type { PlanCode, PlanStatus } from "@website-signal-risk-scanner/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { updateAdminOrganizationPlan } from "./repository";
import { requirePlatformAdminContext } from "./platform-admin";

const schema = z.object({
  organizationId: z.string().uuid("Invalid organization."),
  plan: z.enum(["free", "individual", "pro", "team"]),
  planStatus: z.enum(["active", "trialing", "past_due", "paused"])
});

export async function updateOrganizationPlanFormAction(formData: FormData): Promise<void> {
  await requirePlatformAdminContext();
  const parsed = schema.parse({
    organizationId: formData.get("organizationId"),
    plan: formData.get("plan") as PlanCode,
    planStatus: formData.get("planStatus") as PlanStatus
  });

  await updateAdminOrganizationPlan(parsed);

  revalidatePath("/app", "layout");
  revalidatePath("/app/admin");
  revalidatePath("/app/admin/users");
  redirect("/app/admin/users");
}
