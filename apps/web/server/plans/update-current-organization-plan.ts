"use server";

import { createDatabaseClient } from "@website-signal-risk-scanner/db";
import type { PlanCode } from "@website-signal-risk-scanner/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDashboardContext } from "../auth";

const schema = z.object({
  plan: z.enum(["free", "pro", "team"])
});

export async function updateCurrentOrganizationPlanFormAction(formData: FormData): Promise<void> {
  const { organization } = await getDashboardContext();
  const parsed = schema.parse({
    plan: formData.get("plan") as PlanCode
  });

  const db = createDatabaseClient();
  const { error } = await db
    .from("organizations")
    .update({
      plan: parsed.plan
    })
    .eq("id", organization.id);

  if (error) {
    throw new Error(`Failed to update organization plan: ${error.message}`);
  }

  revalidatePath("/app", "layout");
  revalidatePath("/app/modify-plan");
  redirect("/app/modify-plan");
}
