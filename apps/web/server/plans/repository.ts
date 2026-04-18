"use server";

import { query } from "@website-signal-risk-scanner/db";

export async function updateOrganizationPlan(input: {
  organizationId: string;
  plan: string;
}) {
  try {
    await query(
      `update organizations
          set plan = $1
        where id = $2`,
      [input.plan, input.organizationId]
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to update organization plan: ${message}`);
  }
}
