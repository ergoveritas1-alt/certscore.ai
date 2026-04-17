"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDashboardContext } from "../auth";
import { updateDomainIndustry } from "./repository";

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

  await updateDomainIndustry({
    domainId: parsed.domainId,
    industryPrimaryId: parsed.industryPrimaryId,
    organizationId: organization.id
  });

  revalidatePath("/app/domains");
  revalidatePath(`/app/domains/${parsed.domainId}`);
}
