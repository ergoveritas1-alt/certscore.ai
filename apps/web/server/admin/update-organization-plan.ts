"use server";

import type { PlanCode, PlanStatus } from "@website-signal-risk-scanner/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ADMIN_PLAN_STATUSES, PLAN_CODES } from "../../lib/admin/plan-options";
import { updateAdminOrganizationPlan } from "./repository";
import { requirePlatformAdminContext } from "./platform-admin";

const schema = z.object({
  organizationId: z.string().uuid("Invalid organization."),
  plan: z.enum(PLAN_CODES),
  planStatus: z.enum(ADMIN_PLAN_STATUSES)
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
