"use server";

import type { PlanCode } from "@website-signal-risk-scanner/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDashboardContext } from "../auth";
import { updateOrganizationPlan } from "./repository";

const schema = z.object({
  plan: z.enum(["free", "individual", "pro", "team"])
});

export async function updateCurrentOrganizationPlanFormAction(formData: FormData): Promise<void> {
  const { organization } = await getDashboardContext();
  const parsed = schema.parse({
    plan: formData.get("plan") as PlanCode
  });

  await updateOrganizationPlan({
    organizationId: organization.id,
    plan: parsed.plan
  });

  revalidatePath("/app", "layout");
  revalidatePath("/app/modify-plan");
  redirect("/app/modify-plan");
}
