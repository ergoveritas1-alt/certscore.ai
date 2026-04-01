"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDashboardContext } from "../auth";

const schema = z.object({
  domainId: z.string().uuid("Invalid domain."),
  industryPrimaryId: z.union([z.string().uuid("Invalid industry."), z.literal("")]).transform((value) => value || null)
});

export async function updateDomainIndustryFormAction(formData: FormData): Promise<void> {
  const { organization } = await getDashboardContext();
  const parsed = schema.parse({
    domainId: formData.get("domainId"),
    industryPrimaryId: formData.get("industryPrimaryId")
  });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("domains")
    .update({
      industry_primary_id: parsed.industryPrimaryId
    })
    .eq("organization_id", organization.id)
    .eq("id", parsed.domainId);

  if (error) {
    throw new Error(`Could not update domain industry: ${error.message}`);
  }

  revalidatePath("/app/domains");
  revalidatePath(`/app/domains/${parsed.domainId}`);
}
