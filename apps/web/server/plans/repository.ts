"use server";

import { createDatabaseClient } from "@website-signal-risk-scanner/db";

export async function updateOrganizationPlan(input: {
  organizationId: string;
  plan: string;
}) {
  const db = createDatabaseClient();
  const { error } = await db
    .from("organizations")
    .update({
      plan: input.plan
    })
    .eq("id", input.organizationId);

  if (error) {
    throw new Error(`Failed to update organization plan: ${error.message}`);
  }
}
